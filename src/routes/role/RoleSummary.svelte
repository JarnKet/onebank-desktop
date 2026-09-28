<script lang="ts">
    /**
     * Everything a role says, read-only: what the detail shows for a role that
     * exists, and what the wizard shows before it sends one.
     */
    import Icon from '@iconify/svelte';
    import type {Account, User} from '../../definition';
    import type {Permission} from '../../lib/api/types';
    import {menus} from '../../lib/menus';
    import {initials, maskAccount, money, t} from '../../lib/utils/helper';

    let {
        role,
        accounts,
        members,
    }: {
        role: Permission
        accounts: Account[]
        members: User[]
    } = $props();

    const coveredAccounts = $derived(accounts.filter((account) => (role.accountids ?? []).includes(account.accountid)));
    const holders = $derived(usersOf(role.userids));
    const chosenFunctions = $derived(
        !role.allowedfunctions || role.allowedfunctions === '*' ? [] : role.allowedfunctions.split(',').filter(Boolean),
    );

    function usersOf(userids: string[] | undefined) {
        return members.filter((member) => (userids ?? []).includes(member.userid));
    }

    /** The caps the core carries, in the order the design lists them. */
    function limitRows(): Array<{label: string; value: number | string}> {
        const rows: Array<{label: string; value: number | string}> = [];
        const caps: Array<['amount' | 'daily' | 'weekly' | 'monthly', string]> = [
            ['amount', t('Per transaction', 'ຈຳກັດວົງເງິນຕໍ່ທຸລະກຳ')],
            ['daily', t('Per day', 'ຈຳກັດວົງເງິນຕໍ່ມື້')],
            ['weekly', t('Per week', 'ຈຳກັດວົງເງິນຕໍ່ອາທິດ')],
            ['monthly', t('Per month', 'ຈຳກັດວົງເງິນຕໍ່ເດືອນ')],
        ];
        for (const [key, label] of caps) {
            const value = role.limit?.[key];
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

<p class="flex items-center gap-2 text-sm text-onebank-subtle">
    <Icon icon={role.viewonly ? 'mdi:eye-outline' : 'mdi:swap-horizontal'} class="h-5 w-5"/>
    {role.viewonly ? t('Can see the accounts and their movements', 'ສາມາດກວດເບິ່ງການເຄື່ອນໄຫວຂອງບັນຊີໄດ້') : t('Can move money from the accounts', 'ສາມາດເຄື່ອນໄຫວບັນຊີໄດ້')}
</p>

<section>
    <h2 class="mb-2 text-lg font-semibold">{t('Accounts it covers', 'ບັນຊີທີ່ໃຊ້ໄດ້')}</h2>
    <ul class="divide-y divide-onebank-row">
        {#each coveredAccounts as account (account.accountid)}
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
        {#if chosenFunctions.length === 0}
            <p class="text-sm text-onebank-subtle">{t('Every function', 'ໃຊ້ໄດ້ທຸກຟັງຊັ່ນ')}</p>
        {:else}
            <ul class="flex flex-wrap gap-2 text-xs">
                {#each chosenFunctions as key (key)}
                    <li class="flex items-center gap-2 rounded-full bg-onebank-blue-soft px-3 py-1 text-onebank-blue">
                        {#if menus[key]?.filename}<img src="img/{menus[key].filename}" alt="" class="h-4 w-4 object-contain"/>{/if}
                        {menus[key]?.name ?? key}
                    </li>
                {/each}
            </ul>
        {/if}
    </section>

    {#if limitRows().length}
        <section>
            <h2 class="mb-2 text-lg font-semibold">{t('Spending limits', 'ການຈຳກັດວົງເງິນ')}</h2>
            <dl class="divide-y divide-onebank-row text-sm">
                {#each limitRows() as row (row.label)}
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
        {#each holders as holder (holder.userid)}
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
