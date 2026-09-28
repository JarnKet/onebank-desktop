<script lang="ts">
    /** Who the role is for: the accounts it covers and the members who hold it. */
    import SelectableAccount from '../../lib/components/SelectableAccount.svelte';
    import type {Account, User} from '../../definition';
    import type {Permission} from '../../lib/api/types';
    import {initials, t} from '../../lib/utils/helper';

    let {
        permission = $bindable(),
        accounts,
        members,
    }: {
        permission: Permission
        accounts: Account[]
        members: User[]
    } = $props();

    function toggleIn(list: string[], id: string): string[] {
        return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
    }
</script>

<div class="space-y-6">
    <fieldset>
        <legend class="mb-2 text-lg font-semibold">{t('Accounts it covers', 'ບັນຊີທີ່ໃຊ້ໄດ້')}</legend>
        <div class="grid gap-3 tablet:grid-cols-2 desktop:grid-cols-3">
            {#each accounts as account (account.accountid)}
                <SelectableAccount {account} selected={(permission.accountids ?? []).includes(account.accountid)}
                                   onToggle={() => (permission.accountids = toggleIn(permission.accountids ?? [], account.accountid))}/>
            {/each}
        </div>
    </fieldset>

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
</div>
