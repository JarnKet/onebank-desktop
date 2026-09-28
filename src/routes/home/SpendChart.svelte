<script lang="ts">
    /**
     * "Spending this month": the dashboard's main chart.
     *
     * One account at a time (the picker in the header), daily debits from the
     * 1st to today as an area line, and the month's income and spending
     * totals underneath — the design's green and red figures.
     */
    import Icon from '@iconify/svelte';
    import AreaChart from '../../lib/components/AreaChart.svelte';
    import AccountPicker from '../../lib/components/AccountPicker.svelte';
    import {loadWidget} from '../../lib/api/commands';
    import type {UsageDaily} from '../../lib/api/types';
    import {formatMoney, isoDay, lang, t} from '../../lib/utils/helper';
    import {currentGroup, loadHomeResult} from '../../stores/onebankGroups';
    import {FULL_MONTHS} from '../../lib/constant';

    let accountId = $state('');
    let items = $state<UsageDaily[]>([]);
    let loading = $state(false);
    let failed = $state(false);
    let collapsed = $state(false);

    const accounts = $derived($loadHomeResult?.accounts ?? []);
    const account = $derived(accounts.find((candidate) => candidate.accountid === accountId));

    $effect(() => {
        if (!accounts.some((candidate) => candidate.accountid === accountId)) accountId = accounts[0]?.accountid ?? '';
    });

    async function load(group: string, id: string) {
        if (!group || !id) return;
        loading = true;
        failed = false;
        try {
            const response = await loadWidget('USAGEDAILY', id, group);
            if (response.result !== undefined && response.result !== 0) failed = true;
            else items = (response.items as UsageDaily[]) ?? [];
        } catch {
            failed = true;
        } finally {
            loading = false;
        }
    }

    $effect(() => {
        void load($currentGroup, accountId);
    });

    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const month = FULL_MONTHS[today.getMonth()];
    const monthShort = (lang === 1 ? month.lo : month.en.slice(0, 3));

    /** Every day of the month so far, zero where nothing moved. */
    const points = $derived.by(() => {
        const byDay = new Map(items.map((item) => [item.date, item]));
        const out = [];
        for (let day = 1; day <= today.getDate(); day++) {
            const key = isoDay(new Date(today.getFullYear(), today.getMonth(), day));
            out.push({
                label: `${day} ${monthShort}`,
                title: `${day} ${lang === 1 ? month.lo : month.en} ${today.getFullYear()}`,
                value: byDay.get(key)?.debit ?? 0,
            });
        }
        return out;
    });

    const inMonth = $derived(items.filter((item) => item.date >= isoDay(monthStart)));
    const income = $derived(inMonth.reduce((sum, item) => sum + item.credit, 0));
    const spending = $derived(inMonth.reduce((sum, item) => sum + item.debit, 0));
    const ccy = $derived(account?.ccy ?? 'LAK');
</script>

<section class="ob-card flex flex-col p-5 desktop:px-9">
    <header class="flex flex-wrap items-start gap-3">
        <button type="button" class="mt-1" aria-expanded={!collapsed}
                aria-label={collapsed ? t('Show chart', 'ສະແດງກາຟ') : t('Hide chart', 'ເຊື່ອງກາຟ')}
                onclick={() => (collapsed = !collapsed)}>
            <Icon icon="mdi:chevron-down" class="h-6 w-6 transition-transform {collapsed ? '-rotate-90' : ''}"/>
        </button>
        <div class="mr-auto">
            <h2 class="text-xl font-bold">{t('Spending this month', 'ລາຍຈ່າຍເດືອນນີ້')}</h2>
            <p class="text-xs text-onebank-subtle">1 {monthShort} – {today.getDate()} {monthShort}</p>
        </div>
        <div class="w-full tablet:w-64">
            <AccountPicker {accounts} bind:value={accountId} label={t('Chart account', 'ບັນຊີຂອງກາຟ')}/>
        </div>
    </header>

    {#if !collapsed}
        <div class="mt-4 min-h-[220px]">
            {#if loading && items.length === 0}
                <div class="h-[220px] animate-pulse rounded-ob-lg bg-onebank-row"></div>
            {:else if failed}
                <div class="flex h-[220px] flex-col items-center justify-center gap-2 text-sm text-onebank-subtle">
                    <Icon icon="mdi:alert-circle-outline" class="h-8 w-8"/>
                    {t('Unable to load data', 'ບໍ່ສາມາດໂຫຼດຂໍ້ມູນໄດ້')}
                    <button type="button" class="font-semibold text-onebank-red" onclick={() => load($currentGroup, accountId)}>{t('Try again', 'ລອງໃໝ່')}</button>
                </div>
            {:else}
                <AreaChart {points} format={(value) => `${formatMoney(value)} ${ccy}`} label={t('Daily spending this month', 'ລາຍຈ່າຍລາຍວັນເດືອນນີ້')}/>
            {/if}
        </div>
    {/if}

    <dl class="mt-3 grid grid-cols-2 gap-4">
        <div>
            <dt class="text-sm text-onebank-subtle">{t('Income', 'ລາຍຮັບ')}</dt>
            <dd class="text-lg font-semibold text-onebank-income tabular-nums">{formatMoney(income, 0)} {ccy}</dd>
        </div>
        <div>
            <dt class="text-sm text-onebank-subtle">{t('Spending', 'ລາຍຈ່າຍ')}</dt>
            <dd class="text-lg font-semibold text-onebank-expense tabular-nums">{formatMoney(spending, 0)} {ccy}</dd>
        </div>
    </dl>
</section>
