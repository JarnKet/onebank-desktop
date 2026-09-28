<script lang="ts">
    /** Every account in the group with what is available in it: the dashboard's balances card. */
    import Icon from '@iconify/svelte';
    import CcyBadge from '../../lib/components/CcyBadge.svelte';
    import {loadWidget} from '../../lib/api/commands';
    import type {Balance} from '../../lib/api/types';
    import {formatMoney, maskAccount, t} from '../../lib/utils/helper';
    import {currentGroup, loadHomeResult} from '../../stores/onebankGroups';

    let balances = $state<Balance[]>([]);
    let loading = $state(false);
    let collapsed = $state(false);

    // Re-read when the group changes, or when its accounts do (one added, one locked).
    $effect(() => {
        const group = $currentGroup;
        void $loadHomeResult?.accounts;
        if (!group) return;
        loading = true;
        loadWidget('ACCOUNTBALANCES', undefined, group)
            .then((response) => (balances = response.balances ?? []))
            .catch(() => (balances = []))
            .finally(() => (loading = false));
    });

    const statusOf = (number: string) => $loadHomeResult?.accounts?.find((account) => account.account === number)?.status;
    const typeOf = (number: string) => $loadHomeResult?.accounts?.find((account) => account.account === number)?.type;
</script>

<section class="ob-card flex flex-col p-5">
    <header class="flex items-center gap-2">
        <button type="button" aria-expanded={!collapsed} aria-label={t('Toggle', 'ສະແດງ/ເຊື່ອງ')} onclick={() => (collapsed = !collapsed)}>
            <Icon icon="mdi:chevron-down" class="h-5 w-5 transition-transform {collapsed ? '-rotate-90' : ''}"/>
        </button>
        <h2 class="flex-1 text-center text-xl font-bold">{t('Account balances', 'ຍອດເງິນໃນບັນຊີ')}</h2>
        <span class="w-5"></span>
    </header>
    {#if !collapsed}
        <ul class="mt-3 max-h-[260px] space-y-2 overflow-y-auto">
            {#if loading && balances.length === 0}
                {#each [0, 1] as i (i)}<li class="h-16 animate-pulse rounded-ob-sm bg-onebank-row"></li>{/each}
            {/if}
            {#each balances as balance (balance.account)}
                {@const status = statusOf(balance.account)}
                <li class="flex items-center gap-3 rounded-ob-sm bg-onebank-page px-3 py-2">
                    <CcyBadge ccy={balance.ccy}/>
                    <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-semibold">{maskAccount(balance.account)}</p>
                        <p class="truncate text-xs text-onebank-subtle">{balance.name}</p>
                        <div class="mt-0.5 flex gap-1.5">
                            {#if typeOf(balance.account)}<span class="text-xs font-medium">{typeOf(balance.account)}</span>{/if}
                            <span class="rounded px-1.5 text-xs font-medium {status === 'LOCKED' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}">
                                {status === 'LOCKED' ? t('Locked', 'ລັອກ') : t('Active', 'ໃຊ້ງານ')}
                            </span>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-base font-bold tabular-nums">{formatMoney(balance.availablebalance)}</p>
                        <p class="text-xs font-semibold text-onebank-blue">{balance.ccy}</p>
                    </div>
                </li>
            {/each}
        </ul>
    {/if}
</section>
