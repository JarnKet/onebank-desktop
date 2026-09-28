<script lang="ts">
    /**
     * Managing the group's roles ("ຈັດການສິດທິ"): each role as a card with what
     * it covers at a glance, a wizard for creating one, and a read-only detail
     * for a role that exists — the core can create and remove a role, never
     * change one, so nothing here edits.
     */
    import Icon from '@iconify/svelte';
    import ConfirmDialog from './account/ConfirmDialog.svelte';
    import RoleSummary from './role/RoleSummary.svelte';
    import RoleWizard from './role/RoleWizard.svelte';
    import {getPermissions, removePermission} from '../lib/api/commands';
    import type {Permission} from '../lib/api/types';
    import {initials, t} from '../lib/utils/helper';
    import {currentGroup, loadHomeResult} from '../stores/onebankGroups';
    import {offeredMenus} from '../lib/menus';

    let permissions = $state<Permission[]>([]);
    let loading = $state(false);
    let error = $state('');
    let notice = $state('');
    let creating = $state(false);
    let viewing = $state<Permission | null>(null);
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

    async function saved() {
        creating = false;
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

    function functionCount(permission: Permission): string {
        if (!permission.allowedfunctions || permission.allowedfunctions === '*') return t('Every function', 'ໃຊ້ໄດ້ທຸກຟັງຊັ່ນ');
        const count = permission.allowedfunctions.split(',').filter(Boolean).length;
        return t(`${count} functions`, `ໃຊ້ໄດ້ ${count} ຟັງຊັ່ນ`);
    }

    function roleName(permission: Permission): string {
        return permission.name || t('Account access', 'ສິດນຳໃຊ້ບັນຊີ');
    }

    function usersOf(userids: string[] | undefined) {
        return members.filter((member) => (userids ?? []).includes(member.userid));
    }

    function coveredAccounts(permission: Permission) {
        return accounts.filter((account) => (permission.accountids ?? []).includes(account.accountid));
    }
</script>

<div class="space-y-4">
    {#if error}<div class="rounded-ob-sm bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</div>{/if}
    {#if notice}<div class="rounded-ob-sm bg-green-50 p-3 text-sm text-green-700" role="status">{notice}</div>{/if}

    {#if creating}
        <RoleWizard {accounts} {members} {functions} onCancel={() => (creating = false)} onSaved={saved}/>
    {:else if viewing}
        {@const role = viewing}
        <div class="flex items-center gap-2">
            <button type="button" class="rounded-full p-1 hover:bg-white" aria-label={t('Back', 'ກັບຄືນ')} onclick={() => (viewing = null)}>
                <Icon icon="mdi:arrow-left" class="h-6 w-6"/>
            </button>
            <h1 class="truncate text-2xl font-semibold">{roleName(role)}</h1>
        </div>
        <div class="ob-card space-y-6 p-5">
            <RoleSummary {role} {accounts} {members}/>

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
                <button type="button" class="onebank-primary-btn" onclick={() => ((creating = true), (notice = ''))}>
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
