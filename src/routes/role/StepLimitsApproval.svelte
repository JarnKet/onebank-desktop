<script lang="ts">
    /**
     * What the role may spend and who has to agree. An approver is a member who
     * does *not* hold the role, as onebank-ui's ROLE picks them: nobody approves
     * their own transaction.
     */
    import Icon from '@iconify/svelte';
    import type {User} from '../../definition';
    import type {ApproverLevel, Permission} from '../../lib/api/types';
    import {initials, t} from '../../lib/utils/helper';

    let {
        permission = $bindable(),
        members,
    }: {
        permission: Permission
        members: User[]
    } = $props();

    const candidates = $derived(members.filter((member) => !(permission.userids ?? []).includes(member.userid)));

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
        const current = approvers(level);
        const next = current.includes(userid) ? current.filter((item) => item !== userid) : [...current, userid];
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
                        <!-- `.ob-input` is unlayered, so its own px-4 beats a pr-* utility: keep the bang. -->
                        <input class="ob-input pr-14! text-right tabular-nums" inputmode="decimal" placeholder={t('No limit', 'ບໍ່ຈຳກັດ')}
                               value={permission.limit?.[limit.key] ?? ''} oninput={(event) => setLimit(limit.key, event.currentTarget.value)}/>
                        <span class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-onebank-subtle">LAK</span>
                    </span>
                </label>
            {/each}
        </div>
    </fieldset>

    <fieldset>
        <legend class="mb-2 text-lg font-semibold">{t('Approval', 'ການອະນຸມັດທຸລະກຳ')}</legend>
        {#if candidates.length === 0}
            <p class="rounded-ob-lg bg-onebank-blue-soft p-4 text-sm text-onebank-blue">
                {t('Every member holds this role, so there is nobody left to approve its transactions. They will execute without approval.', 'ສະມາຊິກທຸກຄົນຖືສິດນີ້ ຈຶ່ງບໍ່ມີຜູ້ອະນຸມັດເຫຼືອ. ລາຍການຈະສຳເລັດທັນທີ.')}
            </p>
        {:else}
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
                            {#each candidates as member (member.userid)}
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
        {/if}
    </fieldset>
</div>
