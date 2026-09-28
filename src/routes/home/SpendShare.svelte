<script lang="ts">
    /** Where the account's money went this month, as a donut: the top five, then "Other". */
    import Icon from '@iconify/svelte';
    import DonutChart from '../../lib/components/DonutChart.svelte';
    import AccountPicker from '../../lib/components/AccountPicker.svelte';
    import {loadWidget} from '../../lib/api/commands';
    import type {UsageShare} from '../../lib/api/types';
    import {formatMoney, t} from '../../lib/utils/helper';
    import {currentGroup, loadHomeResult} from '../../stores/onebankGroups';

    /** Validated with the dataviz skill's checker against the white card (see DESIGN.md). */
    const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];
    const OTHER = '#9d9fa3';

    let accountId = $state('');
    let items = $state<UsageShare[]>([]);
    let loading = $state(false);
    let collapsed = $state(false);

    const accounts = $derived($loadHomeResult?.accounts ?? []);
    const ccy = $derived(accounts.find((account) => account.accountid === accountId)?.ccy ?? 'LAK');

    $effect(() => {
        if (!accounts.some((account) => account.accountid === accountId)) accountId = accounts[0]?.accountid ?? '';
    });

    $effect(() => {
        const group = $currentGroup;
        const id = accountId;
        if (!group || !id) return;
        loading = true;
        loadWidget('USAGESHARE', id, group)
            .then((response) => (items = (response.items as UsageShare[]) ?? []))
            .catch(() => (items = []))
            .finally(() => (loading = false));
    });

    /** Colour follows the name: the order is by amount, but a slice keeps its hue once assigned. */
    const slices = $derived.by(() => {
        const sorted = [...items].sort((a, b) => b.amount - a.amount);
        const top = sorted.slice(0, SERIES.length);
        const rest = sorted.slice(SERIES.length).reduce((sum, item) => sum + item.amount, 0);
        const named = [...top].sort((a, b) => a.type.localeCompare(b.type));
        const out = top.map((item) => ({name: item.type, value: item.amount, color: SERIES[named.indexOf(item)]}));
        if (rest > 0) out.push({name: t('Other', 'ອື່ນໆ'), value: rest, color: OTHER});
        return out;
    });
    const total = $derived(items.reduce((sum, item) => sum + item.amount, 0));
</script>

<section class="ob-card p-5">
    <header class="flex items-start gap-2">
        <button type="button" aria-expanded={!collapsed} aria-label={t('Toggle', 'ສະແດງ/ເຊື່ອງ')} onclick={() => (collapsed = !collapsed)}>
            <Icon icon="mdi:chevron-down" class="h-5 w-5 transition-transform {collapsed ? '-rotate-90' : ''}"/>
        </button>
        <h2 class="mr-auto text-xl font-bold">{t('Where it went', 'ລາຍຈ່າຍເດືອນນີ້')}</h2>
        <div class="w-44"><AccountPicker {accounts} bind:value={accountId} size="sm" label={t('Share account', 'ບັນຊີ')}/></div>
    </header>
    {#if !collapsed}
        <div class="mt-3">
            {#if loading && items.length === 0}
                <div class="h-[132px] animate-pulse rounded-ob-lg bg-onebank-row"></div>
            {:else if slices.length === 0}
                <p class="py-10 text-center text-sm text-onebank-subtle">{t('No spending yet this month', 'ຍັງບໍ່ມີລາຍຈ່າຍເດືອນນີ້')}</p>
            {:else}
                <DonutChart {slices} centre="{formatMoney(total / 1_000_000, 1)}M {ccy}"/>
            {/if}
        </div>
    {/if}
</section>
