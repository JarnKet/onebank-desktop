<script lang="ts">
    /**
     * Everything a role says, as the design's permission screens lay it out:
     * view-only or transact, which accounts, which functions, spending limits,
     * and who must approve — level by level, "everyone" or "at least N".
     *
     * Edits a draft in place (`bind:permission`); the caller saves it.
     */
    import Icon from '@iconify/svelte';
    import SelectableAccount from './SelectableAccount.svelte';
    import type {Account, User} from '../../definition';
    import type {ApproverLevel, Permission} from '../api/types';
    import {menus} from '../menus';
    import {initials, t} from '../utils/helper';

    let {
        permission = $bindable(),
        accounts,
        members,
        functions,
        showMembers = true,
    }: {
        permission: Permission
        accounts: Account[]
        members: User[]
        /** Menu keys the group can offer. */
        functions: string[]
        showMembers?: boolean
    } = $props();

    const allFunctions = $derived(permission.allowedfunctions === '*' || !permission.allowedfunctions);
    const chosenFunctions = $derived(allFunctions ? [] : (permission.allowedfunctions ?? '').split(',').filter(Boolean));

    function toggleIn(list: string[], id: string): string[] {
        return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
    }

    function toggleFunction(key: string) {
        const next = toggleIn(chosenFunctions, key);
        permission.allowedfunctions = next.length ? next.join(',') : '*';
    }

    function setLevel(index: number, patch: Partial<ApproverLevel>) {
        const levels = [...(permission.approverlevels ?? [])];
        levels[index] = {...levels[index], ...patch};
        permission.approverlevels = levels;
    }

    function addLevel() {
        const levels = permission.approverlevels ?? [];
        permission.approverlevels = [...levels, {approverlevel: levels.length + 1, approvernumber: 0, approveruserids: []}];
    }

    function removeLevel(index: number) {
        permission.approverlevels = (permission.approverlevels ?? [])
            .filter((_, position) => position !== index)
            .map((level, position) => ({...level, approverlevel: position + 1}));
    }

    /**
     * The wire carries no "everyone" flag — onebank-ui strips its own before
     * sending — so "everyone" is `approvernumber` equal to the approver count.
     */
    function everyone(level: ApproverLevel): boolean {
        return (level.approvernumber ?? 0) >= approvers(level).length;
    }

    function approvers(level: ApproverLevel): string[] {
        return level.approveruserids ?? [];
    }

    function toggleApprover(level: ApproverLevel, index: number, userid: string) {
        const next = toggleIn(approvers(level), userid);
        setLevel(index, {
            approveruserids: next,
            approvernumber: everyone(level) ? next.length : Math.min(level.approvernumber || 1, next.length),
        });
    }

    function setLimit(key: 'amount' | 'daily', value: string) {
        const number = Number(value.replace(/[^\d.]/g, ''));
        permission.limit = {...permission.limit, [key]: Number.isFinite(number) && number > 0 ? number : undefined};
    }
</script>

<div class="space-y-6">
    <div>
        <label for="permissionName" class="ob-label">{t('Role name', 'ຊື່ສິດທິ')}</label>
        <input id="permissionName" class="ob-input" maxlength="40" bind:value={permission.name}
               placeholder={t('e.g. Finance officer', 'ເຊັ່ນ: ພະນັກງານການເງິນ')}/>
    </div>

    <fieldset>
        <legend class="mb-2 text-lg font-semibold">{t('Permission type', 'ປະເພດສິດທິ')}</legend>
        <div class="grid gap-3 tablet:grid-cols-2">
            {#each [
                {viewonly: true, en: 'View accounts', lo: 'ເບິ່ງບັນຊີໄດ້', den: 'Can see the accounts and their movements', dlo: 'ສາມາດກວດເບິ່ງການເຄື່ອນໄຫວຂອງບັນຊີໄດ້', icon: 'mdi:eye-outline'},
                {viewonly: false, en: 'Transact on accounts', lo: 'ເຄື່ອນໄຫວບັນຊີໄດ້', den: 'Can move money from the accounts', dlo: 'ສາມາດເຄື່ອນໄຫວບັນຊີໄດ້', icon: 'mdi:swap-horizontal'},
            ] as option (option.en)}
                <label class="flex cursor-pointer items-start gap-3 rounded-ob-xl border-2 bg-white p-4 shadow-ob-card transition-colors
                              {permission.viewonly === option.viewonly ? 'border-onebank-red' : 'border-transparent'}">
                    <input type="radio" name="permissionType" class="mt-1 text-onebank-red focus:ring-onebank-red"
                           checked={permission.viewonly === option.viewonly} onchange={() => (permission.viewonly = option.viewonly)}/>
                    <span>
                        <span class="flex items-center gap-2 font-semibold"><Icon icon={option.icon} class="h-5 w-5"/>{t(option.en, option.lo)}</span>
                        <span class="text-sm text-onebank-subtle">{t(option.den, option.dlo)}</span>
                    </span>
                </label>
            {/each}
        </div>
    </fieldset>

    <fieldset>
        <legend class="mb-2 text-lg font-semibold">{t('Accounts it covers', 'ບັນຊີທີ່ໃຊ້ໄດ້')}</legend>
        <div class="grid gap-3 tablet:grid-cols-2 desktop:grid-cols-3">
            {#each accounts as account (account.accountid)}
                <SelectableAccount {account} selected={(permission.accountids ?? []).includes(account.accountid)}
                                   onToggle={() => (permission.accountids = toggleIn(permission.accountids ?? [], account.accountid))}/>
            {/each}
        </div>
    </fieldset>

    {#if !permission.viewonly}
        <fieldset>
            <legend class="mb-2 text-lg font-semibold">{t('Functions it can use', 'ຟັງຊັ່ນທີ່ໃຊ້ໄດ້')}</legend>
            <label class="mb-3 inline-flex items-center gap-2 text-sm">
                <input type="checkbox" class="rounded text-onebank-red focus:ring-onebank-red" checked={allFunctions}
                       onchange={() => (permission.allowedfunctions = allFunctions ? functions.slice(0, 3).join(',') : '*')}/>
                {t('Every function', 'ໃຊ້ໄດ້ທຸກຟັງຊັ່ນ')}
            </label>
            <div class="grid grid-cols-3 gap-3 tablet:grid-cols-6">
                {#each functions as key (key)}
                    {@const on = allFunctions || chosenFunctions.includes(key)}
                    <button type="button" aria-pressed={on} onclick={() => toggleFunction(key)}
                            class="flex flex-col items-center gap-2 rounded-ob-lg border-2 bg-white p-3 text-center text-xs transition-colors
                                   {on ? 'border-onebank-red bg-onebank-pink' : 'border-onebank-row'}"
                            disabled={allFunctions}>
                        <img src="img/{menus[key]?.filename}" alt="" class="h-8 w-8 object-contain"/>
                        {menus[key]?.name ?? key}
                    </button>
                {/each}
            </div>
        </fieldset>

        <fieldset>
            <legend class="mb-2 text-lg font-semibold">{t('Spending limits', 'ການຈຳກັດວົງເງິນ')}</legend>
            <div class="grid gap-3 tablet:grid-cols-2">
                {#each [
                    {key: 'amount' as const, en: 'Per transaction', lo: 'ຈຳກັດວົງເງິນຕໍ່ທຸລະກຳ'},
                    {key: 'daily' as const, en: 'Per day', lo: 'ຈຳກັດວົງເງິນຕໍ່ມື້'},
                ] as limit (limit.key)}
                    <label class="block">
                        <span class="ob-label">{t(limit.en, limit.lo)}</span>
                        <span class="relative block">
                            <input class="ob-input pr-14 text-right tabular-nums" inputmode="decimal" placeholder="0.00 ({t('no limit', 'ບໍ່ຈຳກັດ')})"
                                   value={permission.limit?.[limit.key] ?? ''} oninput={(event) => setLimit(limit.key, event.currentTarget.value)}/>
                            <span class="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-onebank-subtle">LAK</span>
                        </span>
                    </label>
                {/each}
            </div>
        </fieldset>

        <fieldset>
            <legend class="mb-2 text-lg font-semibold">{t('Approval', 'ການອະນຸມັດທຸລະກຳ')}</legend>
            <div class="space-y-3">
                {#each permission.approverlevels ?? [] as level, index (index)}
                    <div class="rounded-ob-xl bg-white p-4 shadow-ob-card">
                        <div class="mb-3 flex items-center gap-3">
                            <span class="font-semibold">{t(`Level ${index + 1}`, `ອະນຸມັດຂັ້ນທີ ${index + 1}`)}</span>
                            <button type="button" class="ml-auto text-onebank-subtle hover:text-onebank-red" aria-label={t('Remove level', 'ລຶບຂັ້ນ')}
                                    onclick={() => removeLevel(index)}>
                                <Icon icon="mdi:close-circle-outline" class="h-5 w-5"/>
                            </button>
                        </div>
                        <div class="flex flex-wrap gap-2">
                            {#each members as member (member.userid)}
                                {@const on = approvers(level).includes(member.userid)}
                                <button type="button" aria-pressed={on} onclick={() => toggleApprover(level, index, member.userid)}
                                        class="flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs transition-colors
                                               {on ? 'border-onebank-red bg-onebank-pink' : 'border-onebank-light-grey-4'}">
                                    <span class="flex h-6 w-6 items-center justify-center rounded-full bg-onebank-light-grey-4 text-[9px] font-semibold text-white">{initials(member.name)}</span>
                                    {member.name}
                                </button>
                            {/each}
                        </div>
                        {#if approvers(level).length > 1}
                            <div class="mt-3 flex flex-wrap items-center gap-4 text-sm">
                                <label class="flex items-center gap-2">
                                    <input type="radio" name="mode-{index}" class="text-onebank-red focus:ring-onebank-red"
                                           checked={everyone(level)} onchange={() => setLevel(index, {approvernumber: approvers(level).length})}/>
                                    {t('Everyone must approve', 'ຕ້ອງອະນຸມັດທຸກຄົນ')}
                                </label>
                                <label class="flex items-center gap-2">
                                    <input type="radio" name="mode-{index}" class="text-onebank-red focus:ring-onebank-red"
                                           checked={!everyone(level)} onchange={() => setLevel(index, {approvernumber: approvers(level).length - 1})}/>
                                    {t('At least', 'ຕ້ອງອະນຸມັດຢ່າງຕ່ຳ')}
                                    <input type="number" min="1" max={approvers(level).length} value={level.approvernumber || 1}
                                           disabled={everyone(level)}
                                           oninput={(event) => setLevel(index, {approvernumber: Math.min(approvers(level).length, Math.max(1, Number(event.currentTarget.value) || 1))})}
                                           class="h-8 w-16 rounded-ob-sm border-onebank-light-grey-4 text-center text-sm disabled:opacity-40"/>
                                    {t('people', 'ຄົນ')}
                                </label>
                            </div>
                        {/if}
                    </div>
                {/each}
                <button type="button" class="onebank-outline-btn h-11 tablet:w-auto" onclick={addLevel}>
                    <Icon icon="mdi:plus-circle" class="h-5 w-5"/>
                    {(permission.approverlevels?.length ?? 0) === 0 ? t('Require approval', 'ເພີ່ມຜູ້ອະນຸມັດ') : t('Add the next approval level', 'ເພີ່ມຜູ້ອະນຸມັດຂັ້ນຕໍ່ໄປ')}
                </button>
            </div>
        </fieldset>
    {/if}

    {#if showMembers}
        <fieldset>
            <legend class="mb-2 text-lg font-semibold">{t('Members with this role', 'ສະມາຊິກ')}</legend>
            <div class="flex flex-wrap gap-2">
                {#each members as member (member.userid)}
                    {@const on = (permission.userids ?? []).includes(member.userid)}
                    <button type="button" aria-pressed={on} onclick={() => (permission.userids = toggleIn(permission.userids ?? [], member.userid))}
                            class="flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition-colors
                                   {on ? 'border-onebank-red bg-onebank-pink' : 'border-onebank-light-grey-4 bg-white'}">
                        <span class="flex h-7 w-7 items-center justify-center rounded-full bg-onebank-light-grey-4 text-[10px] font-semibold text-white">{initials(member.name)}</span>
                        {member.name}
                    </button>
                {/each}
            </div>
        </fieldset>
    {/if}
</div>
