<script lang="ts">
    /**
     * Managing the group's roles ("ຈັດການສິດທິ"): each role as a card with what
     * it covers at a glance, the full editor for creating one, and a read-only
     * detail for a role that exists — the core can create and remove a role,
     * never change one, so nothing here edits.
     */
    import Icon from '@iconify/svelte';
    import PermissionEditor from '../lib/components/PermissionEditor.svelte';
    import ConfirmDialog from './account/ConfirmDialog.svelte';
    import {getPermissions, removePermission} from '../lib/api/commands';
    import {addPermission} from '../lib/api/unmapped';
    import {proofOf, verifyIdentity} from '../lib/twoFactor';
    import type {Permission} from '../lib/api/types';
    import {initials, maskAccount, money, t} from '../lib/utils/helper';
    import {currentGroup, loadHomeResult} from '../stores/onebankGroups';
    import {menus, offeredMenus} from '../lib/menus';

    /** What onebank-ui grants a view-only role, verbatim. */
    const VIEW_ONLY_FUNCTIONS = 'CARDINFO,HISTORY,STATEMENT,CHAT,MESSAGE';

    let permissions = $state<Permission[]>([]);
    let loading = $state(false);
    let error = $state('');
    let notice = $state('');
    let creating = $state<Permission | null>(null);
    let viewing = $state<Permission | null>(null);
    let saving = $state(false);
    let removing = $state<Permission | null>(null);
    let removeBusy = $state(false);

    const accounts = $derived($loadHomeResult?.accounts ?? []);
    const members = $derived($loadHomeResult?.users ?? []);
    // What a role can grant is what the group can be offered, iBank included.
    const functions = $derived(offeredMenus($loadHomeResult?.allmenus));
    const isOwner = $derived(['OWNER', 'ADMIN'].includes($loadHomeResult?.me?.role ?? ''));
    // `getpermissions` answers roles for accounts `loadhome` never returned — one
    // this member cannot see, or an account since removed. onebank-ui's ROLE drops
    // them (`removeBlankAccountItems`): there is nothing to show for them.
    const listed = $derived(permissions.filter((permission) => coveredAccounts(permission).length > 0));

    async function load(group: string) {
        if (!group) return;
        loading = true;
        error = '';
        try {
            const response = await getPermissions(group);
            if (response.result === 0) permissions = response.permissions ?? [];
            else error = response.message || t('Could not load the roles', 'ໂຫຼດສິດທິບໍ່ໄດ້');
        } finally {
            loading = false;
        }
    }

    $effect(() => {
        void load($currentGroup);
    });

    function startNew() {
        notice = '';
        viewing = null;
        creating = {name: '', accountids: [], userids: [], allowedfunctions: '*', viewonly: false, approverlevels: []};
    }

    async function create() {
        if (!creating) return;
        if ((creating.accountids ?? []).length === 0) {
            error = t('Choose at least one account', 'ກະລຸນາເລືອກຢ່າງໜ້ອຍໜຶ່ງບັນຊີ');
            return;
        }
        error = '';
        const verified = await verifyIdentity();
        if (!verified) {
            error = t('Identity was not verified, so the role was not created', 'ບໍ່ໄດ້ຢືນຢັນຕົວຕົນ ຈຶ່ງບໍ່ໄດ້ສ້າງສິດທິ');
            return;
        }
        saving = true;
        const response = await addPermission(wirePermission($state.snapshot(creating) as Permission), proofOf(verified));
        saving = false;
        if (response.result !== 0) {
            error = response.message || t('Could not save the role', 'ບັນທຶກສິດທິບໍ່ໄດ້');
            return;
        }
        creating = null;
        notice = t('Role saved', 'ບັນທຶກສິດທິແລ້ວ');
        await load($currentGroup);
    }

    async function confirmRemove() {
        if (!removing?.permissionid) return;
        removeBusy = true;
        const response = await removePermission(removing.permissionid);
        removeBusy = false;
        if (response.result !== 0) {
            error = response.message || t('Could not delete the role', 'ລຶບສິດທິບໍ່ໄດ້');
            return;
        }
        removing = null;
        viewing = null;
        notice = t('Role deleted', 'ລຶບສິດທິແລ້ວ');
        await load($currentGroup);
    }

    /**
     * What goes on the wire, as onebank-ui's ROLE builds it: a view-only role
     * carries its own fixed function list and nothing else, an empty level list
     * is left out rather than sent, and `name` is ours — the core has no such
     * field and answers none.
     */
    function wirePermission(draft: Permission): Permission {
        const permission: Permission = {...draft, accountids: draft.accountids ?? [], userids: draft.userids ?? []};
        if (permission.viewonly) {
            permission.allowedfunctions = VIEW_ONLY_FUNCTIONS;
            delete permission.limit;
            delete permission.approverlevels;
            return permission;
        }
        if (!permission.approverlevels?.length) delete permission.approverlevels;
        if (permission.limit && !Object.values(permission.limit).some((cap) => cap)) delete permission.limit;
        return permission;
    }

    function functionCount(permission: Permission): string {
        if (!permission.allowedfunctions || permission.allowedfunctions === '*') return t('Every function', 'ໃຊ້ໄດ້ທຸກຟັງຊັ່ນ');
        const count = permission.allowedfunctions.split(',').filter(Boolean).length;
        return t(`${count} functions`, `ໃຊ້ໄດ້ ${count} ຟັງຊັ່ນ`);
    }

    function roleName(permission: Permission): string {
        return permission.name || t('Account access', 'ສິດນຳໃຊ້ບັນຊີ');
    }

    function chosenFunctions(permission: Permission): string[] {
        if (!permission.allowedfunctions || permission.allowedfunctions === '*') return [];
        return permission.allowedfunctions.split(',').filter(Boolean);
    }

    function usersOf(userids: string[] | undefined) {
        return members.filter((member) => (userids ?? []).includes(member.userid));
    }

    function coveredAccounts(permission: Permission) {
        return accounts.filter((account) => (permission.accountids ?? []).includes(account.accountid));
    }

    /** The caps the core carries, in the order the design lists them. */
    function limitRows(permission: Permission): Array<{label: string; value: number | string}> {
        const rows: Array<{label: string; value: number | string}> = [];
        const caps: Array<['amount' | 'daily' | 'weekly' | 'monthly', string]> = [
            ['amount', t('Per transaction', 'ຈຳກັດວົງເງິນຕໍ່ທຸລະກຳ')],
            ['daily', t('Per day', 'ຈຳກັດວົງເງິນຕໍ່ມື້')],
            ['weekly', t('Per week', 'ຈຳກັດວົງເງິນຕໍ່ອາທິດ')],
            ['monthly', t('Per month', 'ຈຳກັດວົງເງິນຕໍ່ເດືອນ')],
        ];
        for (const [key, label] of caps) {
            const value = permission.limit?.[key];
            if (value) rows.push({label, value});
        }
        return rows;
    }

    /** No "everyone" flag on the wire: it is a count equal to the approvers. */
    function approvalRule(level: {approvernumber?: number; approveruserids?: string[]}): string {
        const approvers = (level.approveruserids ?? []).length;
        const needed = level.approvernumber || approvers;
        if (needed >= approvers) return t('Everyone must approve', 'ຕ້ອງອະນຸມັດທຸກຄົນ');
        return t(`At least ${needed} of ${approvers}`, `ຕ້ອງອະນຸມັດຢ່າງຕ່ຳ ${needed} ໃນ ${approvers} ຄົນ`);
    }
</script>

<div class="space-y-4">
    {#if error}<div class="rounded-ob-sm bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</div>{/if}
    {#if notice}<div class="rounded-ob-sm bg-green-50 p-3 text-sm text-green-700" role="status">{notice}</div>{/if}

    {#if creating}
        <div class="flex items-center gap-2">
            <button type="button" class="rounded-full p-1 hover:bg-white" aria-label={t('Back', 'ກັບຄືນ')} onclick={() => (creating = null)}>
                <Icon icon="mdi:arrow-left" class="h-6 w-6"/>
            </button>
            <h1 class="text-2xl font-semibold">{t('New role', 'ສ້າງສິດທິໃໝ່')}</h1>
        </div>
        <PermissionEditor bind:permission={creating} {accounts} {members} {functions}/>
        <div class="flex justify-center gap-3 pt-4">
            <button type="button" class="onebank-secondary-btn" onclick={() => (creating = null)} disabled={saving}>{t('Cancel', 'ຍົກເລີກ')}</button>
            <button type="button" class="onebank-primary-btn" onclick={create} disabled={saving}>{saving ? t('Saving…', 'ກຳລັງບັນທຶກ…') : t('Save', 'ບັນທຶກ')}</button>
        </div>
    {:else if viewing}
        {@const role = viewing}
        <div class="flex items-center gap-2">
            <button type="button" class="rounded-full p-1 hover:bg-white" aria-label={t('Back', 'ກັບຄືນ')} onclick={() => (viewing = null)}>
                <Icon icon="mdi:arrow-left" class="h-6 w-6"/>
            </button>
            <h1 class="truncate text-2xl font-semibold">{roleName(role)}</h1>
        </div>
        <div class="ob-card space-y-6 p-5">
            <p class="flex items-center gap-2 text-sm text-onebank-subtle">
                <Icon icon={role.viewonly ? 'mdi:eye-outline' : 'mdi:swap-horizontal'} class="h-5 w-5"/>
                {role.viewonly ? t('Can see the accounts and their movements', 'ສາມາດກວດເບິ່ງການເຄື່ອນໄຫວຂອງບັນຊີໄດ້') : t('Can move money from the accounts', 'ສາມາດເຄື່ອນໄຫວບັນຊີໄດ້')}
            </p>

            <section>
                <h2 class="mb-2 text-lg font-semibold">{t('Accounts it covers', 'ບັນຊີທີ່ໃຊ້ໄດ້')}</h2>
                <ul class="divide-y divide-onebank-row">
                    {#each coveredAccounts(role) as account (account.accountid)}
                        <li class="flex items-center gap-3 py-2">
                            <span class="flex h-9 w-9 items-center justify-center rounded-full bg-onebank-light-grey-4 text-[10px] font-semibold text-white">{initials(account.alias || account.name)}</span>
                            <span class="min-w-0 flex-1">
                                <span class="block truncate text-sm font-semibold">{maskAccount(account.account)}</span>
                                <span class="block truncate text-xs text-onebank-subtle">{account.name}</span>
                            </span>
                            <span class="text-xs">{account.ccy}</span>
                        </li>
                    {:else}
                        <li class="py-2 text-sm text-onebank-subtle">{t('No accounts', 'ບໍ່ມີບັນຊີ')}</li>
                    {/each}
                </ul>
            </section>

            {#if !role.viewonly}
                <section>
                    <h2 class="mb-2 text-lg font-semibold">{t('Functions it can use', 'ຟັງຊັ່ນທີ່ໃຊ້ໄດ້')}</h2>
                    {#if chosenFunctions(role).length === 0}
                        <p class="text-sm text-onebank-subtle">{t('Every function', 'ໃຊ້ໄດ້ທຸກຟັງຊັ່ນ')}</p>
                    {:else}
                        <ul class="flex flex-wrap gap-2 text-xs">
                            {#each chosenFunctions(role) as key (key)}
                                <li class="flex items-center gap-2 rounded-full bg-onebank-blue-soft px-3 py-1 text-onebank-blue">
                                    {#if menus[key]?.filename}<img src="img/{menus[key].filename}" alt="" class="h-4 w-4 object-contain"/>{/if}
                                    {menus[key]?.name ?? key}
                                </li>
                            {/each}
                        </ul>
                    {/if}
                </section>

                {#if limitRows(role).length}
                    <section>
                        <h2 class="mb-2 text-lg font-semibold">{t('Spending limits', 'ການຈຳກັດວົງເງິນ')}</h2>
                        <dl class="divide-y divide-onebank-row text-sm">
                            {#each limitRows(role) as row (row.label)}
                                <div class="flex items-center justify-between py-2">
                                    <dt class="text-onebank-subtle">{row.label}</dt>
                                    <dd class="font-semibold tabular-nums">{money(row.value, 'LAK')}</dd>
                                </div>
                            {/each}
                        </dl>
                    </section>
                {/if}

                <section>
                    <h2 class="mb-2 text-lg font-semibold">{t('Approval', 'ການອະນຸມັດທຸລະກຳ')}</h2>
                    {#if !role.approverlevels?.length}
                        <p class="text-sm text-onebank-subtle">{t('Transactions execute without approval', 'ສ້າງລາຍການແລ້ວສຳເລັດທັນທີ')}</p>
                    {:else}
                        <div class="space-y-3">
                            {#each role.approverlevels as level, index (index)}
                                <div class="rounded-ob-lg border border-onebank-row p-4">
                                    <div class="mb-2 flex flex-wrap items-center gap-3">
                                        <span class="font-semibold">{t(`Level ${index + 1}`, `ອະນຸມັດຂັ້ນທີ ${index + 1}`)}</span>
                                        <span class="rounded-full bg-onebank-pink px-3 py-1 text-xs font-medium text-onebank-red">{approvalRule(level)}</span>
                                    </div>
                                    <ul class="flex flex-wrap gap-2">
                                        {#each usersOf(level.approveruserids) as approver (approver.userid)}
                                            <li class="flex items-center gap-2 rounded-full border border-onebank-light-grey-4 py-1 pl-1 pr-3 text-xs">
                                                <span class="flex h-6 w-6 items-center justify-center rounded-full bg-onebank-light-grey-4 text-[9px] font-semibold text-white">{initials(approver.name)}</span>
                                                {approver.name}
                                            </li>
                                        {/each}
                                    </ul>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </section>
            {/if}

            <section>
                <h2 class="mb-2 text-lg font-semibold">{t('Members with this role', 'ສະມາຊິກ')}</h2>
                <ul class="flex flex-wrap gap-2">
                    {#each usersOf(role.userids) as holder (holder.userid)}
                        <li class="flex items-center gap-2 rounded-full border border-onebank-light-grey-4 bg-white py-1 pl-1 pr-3 text-sm">
                            <span class="flex h-7 w-7 items-center justify-center rounded-full bg-onebank-light-grey-4 text-[10px] font-semibold text-white">{initials(holder.name)}</span>
                            {holder.name}
                        </li>
                    {:else}
                        <li class="text-sm text-onebank-subtle">{t('Nobody holds this role', 'ຍັງບໍ່ມີສະມາຊິກໃນສິດນີ້')}</li>
                    {/each}
                </ul>
            </section>

            <p class="text-sm text-onebank-subtle">{t('A role cannot be changed once created. Delete it and create the one you need.', 'ສິດທິທີ່ສ້າງແລ້ວ ແກ້ໄຂບໍ່ໄດ້. ກະລຸນາລຶບ ແລ້ວສ້າງໃໝ່ຕາມທີ່ຕ້ອງການ.')}</p>

            {#if isOwner}
                <div class="flex justify-center pt-2">
                    <button type="button" class="onebank-secondary-btn" onclick={() => (removing = role)}>
                        <Icon icon="mdi:close-circle-outline" class="h-5 w-5"/>{t('Delete role', 'ລຶບສິດທິ')}
                    </button>
                </div>
            {/if}
        </div>
    {:else}
        <div class="flex flex-wrap items-center gap-3">
            <h1 class="mr-auto text-2xl font-semibold">{t('Manage permissions', 'ຈັດການສິດທິ')}</h1>
            {#if isOwner}
                <button type="button" class="onebank-primary-btn" onclick={startNew}>
                    <Icon icon="mdi:plus-circle" class="h-5 w-5"/>{t('New role', 'ສ້າງສິດທິໃໝ່')}
                </button>
            {/if}
        </div>

        {#if loading && permissions.length === 0}
            <div class="grid gap-3 desktop:grid-cols-2">{#each [0, 1] as i (i)}<div class="h-44 animate-pulse rounded-ob-xl bg-white"></div>{/each}</div>
        {:else if listed.length === 0}
            <div class="ob-card p-8 text-center text-onebank-subtle">{t('This group has no roles yet.', 'ກຸ່ມນີ້ຍັງບໍ່ມີສິດທິ.')}</div>
        {:else}
            <div class="grid gap-3 desktop:grid-cols-2">
                {#each listed as permission (permission.permissionid)}
                    {@const holders = usersOf(permission.userids)}
                    <article class="ob-card flex flex-col gap-4 p-5">
                        <header class="flex items-start gap-3">
                            <span class="flex h-12 w-12 items-center justify-center rounded-full {permission.viewonly ? 'bg-onebank-blue-soft text-onebank-blue' : 'bg-onebank-pink text-onebank-red'}">
                                <Icon icon={permission.viewonly ? 'mdi:eye-outline' : 'mdi:security-account'} class="h-6 w-6"/>
                            </span>
                            <div class="min-w-0 flex-1">
                                <h2 class="truncate text-lg font-bold">{roleName(permission)}</h2>
                                <p class="text-sm text-onebank-subtle">{permission.viewonly ? t('View accounts', 'ເບິ່ງບັນຊີໄດ້') : t('Transact on accounts', 'ເຄື່ອນໄຫວບັນຊີໄດ້')}</p>
                            </div>
                            <button type="button" class="rounded-full p-1 hover:bg-onebank-page" aria-label={t('View role', 'ເບິ່ງສິດທິ')}
                                    onclick={() => ((viewing = permission), (notice = ''))}>
                                <Icon icon="mdi:chevron-right" class="h-5 w-5"/>
                            </button>
                            {#if isOwner}
                                <button type="button" class="rounded-full p-1 hover:bg-onebank-page" aria-label={t('Delete role', 'ລຶບສິດທິ')}
                                        onclick={() => (removing = permission)}>
                                    <Icon icon="mdi:close-circle-outline" class="h-5 w-5"/>
                                </button>
                            {/if}
                        </header>
                        <ul class="flex flex-wrap gap-2 text-xs font-medium">
                            <li class="rounded-full bg-onebank-blue-soft px-3 py-1 text-onebank-blue">{t(`${permission.accountids?.length ?? 0} accounts`, `${permission.accountids?.length ?? 0} ບັນຊີ`)}</li>
                            <li class="rounded-full bg-onebank-blue-soft px-3 py-1 text-onebank-blue">{t(`${permission.userids?.length ?? 0} members`, `ສະມາຊິກ ${permission.userids?.length ?? 0} ຄົນ`)}</li>
                            {#if !permission.viewonly}
                                <li class="rounded-full bg-onebank-blue-soft px-3 py-1 text-onebank-blue">{functionCount(permission)}</li>
                                {#if permission.approverlevels?.length}
                                    <li class="rounded-full bg-onebank-pink px-3 py-1 text-onebank-red">{t(`${permission.approverlevels.length} approval levels`, `ອະນຸມັດ ${permission.approverlevels.length} ຂັ້ນ`)}</li>
                                {/if}
                                {#if permission.limit?.amount || permission.limit?.daily}
                                    <li class="rounded-full bg-onebank-pink px-3 py-1 text-onebank-red">{t('Has spending limits', 'ມີການຈຳກັດວົງເງິນ')}</li>
                                {/if}
                            {/if}
                        </ul>
                        {#if holders.length}
                            <div class="flex items-center -space-x-1.75">
                                {#each holders.slice(0, 6) as holder (holder.userid)}
                                    <span class="flex h-7.5 w-7.5 items-center justify-center rounded-full bg-onebank-light-grey-2 text-[10px] font-semibold ring-2 ring-white" title={holder.name}>{initials(holder.name)}</span>
                                {/each}
                                {#if holders.length > 6}<span class="flex h-7.5 w-7.5 items-center justify-center rounded-full bg-[#e8e8f0] text-xs ring-2 ring-white">+{holders.length - 6}</span>{/if}
                            </div>
                        {/if}
                    </article>
                {/each}
            </div>
        {/if}
    {/if}
</div>

<ConfirmDialog open={removing !== null}
               title={t('Delete this role?', 'ລຶບສິດທິນີ້ບໍ?')}
               content={t('Members holding only this role will lose access to its accounts.', 'ສະມາຊິກທີ່ມີແຕ່ສິດນີ້ ຈະບໍ່ສາມາດເຂົ້າເຖິງບັນຊີເຫຼົ່ານີ້ໄດ້ອີກ.')}
               confirmLabel={t('Delete role', 'ລຶບສິດທິ')} danger busy={removeBusy}
               onConfirm={confirmRemove} onCancel={() => (removing = null)}/>
