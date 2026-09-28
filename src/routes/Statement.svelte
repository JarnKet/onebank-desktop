<script lang="ts">
    /**
     * An account's statement, as the design's frame: the balance you can use,
     * then account + date range + search + export, and a table grouped by day
     * with each day's money in and out on the right.
     *
     * The core pages backwards from a `beforetime` and knows no date range, so
     * the range is walked in `lib/statement.ts` and everything after it — the
     * search box, the filter modal — sifts the rows already read.
     */
    import Icon from '@iconify/svelte';
    import AccountPicker from '../lib/components/AccountPicker.svelte';
    import Modal from '../lib/components/Modal.svelte';
    import type {StatementTransaction} from '../lib/api/types';
    import {formatMoney, isoDay, lang, money, t} from '../lib/utils/helper';
    import {
        endOfDay,
        filterGroups,
        filterLabel,
        loadRange,
        matchesFilters,
        rowDetails,
        rowReference,
        rowText,
        statementDay,
        statementTime,
    } from '../lib/statement';
    import {currentGroup, loadHomeResult} from '../stores/onebankGroups';
    import {routeLocation} from '../stores/route';

    const today = new Date();
    const monthAgo = new Date(today);
    monthAgo.setDate(today.getDate() - 30);

    let accountId = $state('');
    let from = $state(isoDay(monthAgo));
    let to = $state(isoDay(today));
    let items = $state<StatementTransaction[]>([]);
    let balance = $state(0);
    let ccy = $state('LAK');
    let cursor = $state<string | null>(null);
    let loading = $state(false);
    let loadingMore = $state(false);
    let error = $state('');
    let search = $state('');
    let filters = $state<string[]>([]);
    let draft = $state<string[]>([]);
    let filterOpen = $state(false);
    let filterSearch = $state('');
    /** A range walk is many round trips; only the newest one may land. */
    let reading = 0;

    const accounts = $derived($loadHomeResult?.accounts ?? []);
    /** `?account=<accountid>` opens that account's statement (Account detail links here). */
    const linked = $derived(new URLSearchParams($routeLocation.query).get('account') ?? '');
    const account = $derived(accounts.find((candidate) => candidate.accountid === accountId));
    const locked = $derived(account?.status === 'LOCKED');

    $effect(() => {
        if (!accounts.some((candidate) => candidate.accountid === accountId)) {
            accountId = accounts.find((candidate) => candidate.accountid === linked)?.accountid ?? accounts[0]?.accountid ?? '';
        }
    });

    $effect(() => {
        // The group is read so switching it re-reads, as the command is group-scoped.
        const group = $currentGroup;
        const id = accountId;
        const range = [from, to];
        const isLocked = locked;
        items = [];
        cursor = null;
        error = '';
        if (!group || !id || isLocked) return;
        const mine = ++reading;
        loading = true;
        loadRange(id, range[0], endOfDay(range[1]))
            .then((result) => {
                if (mine !== reading) return;
                items = result.items;
                balance = result.balance;
                ccy = result.ccy;
                cursor = result.cursor;
                if (result.result !== 0) error = result.message ?? t('The statement could not be read', 'ບໍ່ສາມາດອ່ານລາຍການເຄື່ອນໄຫວໄດ້');
            })
            .finally(() => {
                if (mine === reading) loading = false;
            });
    });

    async function loadMore() {
        if (!cursor || loadingMore) return;
        loadingMore = true;
        const mine = reading;
        const result = await loadRange(accountId, from, cursor);
        loadingMore = false;
        if (mine !== reading) return;
        items = [...items, ...result.items];
        cursor = result.cursor;
        if (result.result !== 0) error = result.message ?? '';
    }

    /** Built from the rows read: the core offers no list of what an account can hold. */
    const groups = $derived(filterGroups(items));

    const filtered = $derived.by(() => {
        const query = search.trim().toLowerCase();
        return items.filter((row) => matchesFilters(row, filters, groups) && (!query || rowText(row).includes(query)));
    });

    const days = $derived.by(() => {
        const groups = new Map<string, StatementTransaction[]>();
        for (const row of filtered) {
            const key = statementDay(row.time);
            groups.set(key, [...(groups.get(key) ?? []), row]);
        }
        return [...groups].map(([day, list]) => ({
            day,
            list,
            income: list.filter((row) => row.amount > 0).reduce((sum, row) => sum + row.amount, 0),
            spending: list.filter((row) => row.amount < 0).reduce((sum, row) => sum - row.amount, 0),
        }));
    });

    function openFilters() {
        draft = [...filters];
        filterSearch = '';
        filterOpen = true;
    }

    function exportCsv() {
        const rows = [['Date', 'Time', 'Type', 'Reference', 'Amount', 'Currency', 'Balance', 'Description', 'Details']];
        for (const row of filtered) {
            const when = statementTime(row.time);
            const details = rowDetails(row, lang === 1)
                .map(([label, value]) => `${label}: ${value}`)
                .join('; ');
            rows.push([
                when.date,
                when.time,
                row.type ?? '',
                rowReference(row),
                String(row.amount),
                ccy,
                String(row.balance ?? ''),
                [row.title, row.subtitle].filter(Boolean).join(' — '),
                details,
            ]);
        }
        const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n');
        const url = URL.createObjectURL(new Blob(['﻿' + csv], {type: 'text/csv;charset=utf-8'}));
        const link = Object.assign(document.createElement('a'), {href: url, download: `statement-${from}-${to}.csv`});
        link.click();
        URL.revokeObjectURL(url);
    }
</script>

<div class="space-y-4">
    <div>
        <p class="text-sm">{t('Available balance', 'ຍອດເງິນທີ່ສາມາດນຳໃຊ້ໄດ້')}</p>
        {#if locked}
            <p class="flex items-center gap-2 text-4xl font-bold text-onebank-muted">
                ∗∗∗∗∗∗
                <Icon icon="mdi:lock-outline" class="h-6 w-6"/>
            </p>
        {:else}
            <p class="text-4xl font-bold text-onebank-income tabular-nums">{formatMoney(balance, 0)} {ccy}</p>
        {/if}
    </div>

    <div class="flex flex-wrap items-center gap-3">
        <div class="w-full tablet:w-72"><AccountPicker {accounts} bind:value={accountId} showName label={t('Statement account', 'ບັນຊີ')}/></div>
        <label class="flex h-11 flex-1 items-center gap-2 rounded-ob-sm border border-[#d9d9d9] bg-white px-3 text-sm">
            <span class="shrink-0 text-onebank-subtle">{t('From', 'ຈາກວັນທີ')}</span>
            <input type="date" bind:value={from} max={to} class="min-w-0 flex-1 border-0 p-0 text-sm focus:ring-0"/>
        </label>
        <label class="flex h-11 flex-1 items-center gap-2 rounded-ob-sm border border-[#d9d9d9] bg-white px-3 text-sm">
            <span class="shrink-0 text-onebank-subtle">{t('To', 'ເຖິງວັນທີ')}</span>
            <input type="date" bind:value={to} min={from} max={isoDay(today)} class="min-w-0 flex-1 border-0 p-0 text-sm focus:ring-0"/>
        </label>
        <label class="relative block min-w-56 flex-1">
            <span class="sr-only">{t('Search', 'ຊອກຫາ')}</span>
            <Icon icon="mdi:magnify" class="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-onebank-subtle"/>
            <input type="search" bind:value={search} placeholder={t('Search these movements', 'ຊອກຫາໃນລາຍການນີ້')}
                   class="h-11 w-full rounded-ob-sm border border-[#d9d9d9] bg-white pl-10 pr-3 text-sm placeholder:text-onebank-muted focus:border-onebank-red focus:ring-onebank-red"/>
        </label>
        <button type="button" class="relative flex h-11 items-center gap-2 rounded-ob-sm bg-onebank-blue px-4 text-sm text-white" onclick={openFilters}>
            <Icon icon="mdi:filter-variant" class="h-5 w-5"/>{t('Filter', 'ຕົວກັ່ນຕອງ')}
            {#if filters.length}
                <span class="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-onebank-red px-1 text-[11px]">{filters.length}</span>
            {/if}
        </button>
        <button type="button" class="flex h-11 items-center gap-2 rounded-ob-sm bg-onebank-blue px-4 text-sm text-white disabled:opacity-50"
                disabled={filtered.length === 0} onclick={exportCsv}>
            <Icon icon="mdi:file-export-outline" class="h-5 w-5"/>Export
        </button>
    </div>

    {#if filters.length}
        <div class="flex flex-wrap gap-2">
            {#each filters as id (id)}
                {@const label = filterLabel(groups, id)}
                <span class="flex items-center gap-2 rounded-ob-sm bg-onebank-light-grey-2 px-3 py-1 text-sm">
                    {label}
                    <button type="button" aria-label={t(`Remove ${label}`, `ລຶບ ${label}`)} onclick={() => (filters = filters.filter((other) => other !== id))}>
                        <Icon icon="mdi:close" class="h-4 w-4"/>
                    </button>
                </span>
            {/each}
        </div>
    {/if}

    {#if error}
        <p class="rounded-ob-sm bg-onebank-pink px-4 py-3 text-sm text-onebank-red">{error}</p>
    {/if}

    {#if locked}
        <div class="flex flex-col items-center gap-2 rounded-ob-md bg-white p-12 text-center shadow-ob-card">
            <Icon icon="mdi:lock-outline" class="h-8 w-8 text-onebank-red"/>
            <p class="font-semibold">{t('This account is locked', 'ບັນຊີນີ້ຖືກລ໋ອກ')}</p>
            <p class="text-sm text-onebank-subtle">{t('Unlock it to see its movements', 'ກະລຸນາປົດລ໋ອກເພື່ອເບິ່ງລາຍການເຄື່ອນໄຫວ')}</p>
        </div>
    {:else}
        <div class="overflow-x-auto rounded-ob-md bg-white shadow-ob-card">
            <table class="w-full min-w-[800px] text-left text-sm">
                <thead class="bg-onebank-blue text-white">
                    <tr>
                        <th class="px-6 py-4 font-semibold">{t('Date', 'ວັນທີ')}</th>
                        <th class="px-4 py-4 font-semibold">{t('Reference', 'ເລກອ້າງອີງ')}</th>
                        <th class="px-4 py-4 font-semibold">{t('Amount', 'ຈຳນວນເງິນ')}</th>
                        <th class="px-4 py-4 font-semibold">{t('Description', 'ຄຳອະທິບາຍ')}</th>
                        <th class="px-6 py-4 font-semibold">{t('Details', 'ລາຍລະອຽດ')}</th>
                    </tr>
                </thead>
                {#if loading}
                    <tbody><tr><td colspan="5" class="p-6"><div class="h-40 animate-pulse rounded bg-onebank-row"></div></td></tr></tbody>
                {:else if days.length === 0}
                    <tbody><tr><td colspan="5" class="px-6 py-12 text-center text-onebank-subtle">{t('No movements in this period', 'ບໍ່ມີການເຄື່ອນໄຫວໃນໄລຍະນີ້')}</td></tr></tbody>
                {/if}
                {#each days as day (day.day)}
                    <tbody class="border-b-8 border-onebank-page last:border-0">
                        <tr>
                            <th class="px-6 pb-1 pt-4 text-base font-bold" colspan="3">{statementTime(day.list[0].time).date}</th>
                            <td class="px-6 pb-1 pt-4 text-right text-xs" colspan="2">
                                <span class="inline-block text-center"><span class="block">{t('Income', 'ລາຍຮັບ')}</span><span class="font-semibold text-onebank-income">{money(day.income, ccy)}</span></span>
                                <span class="ml-6 inline-block text-center"><span class="block">{t('Spending', 'ລາຍຈ່າຍ')}</span><span class="font-semibold text-onebank-red">{money(day.spending, ccy)}</span></span>
                            </td>
                        </tr>
                        {#each day.list as row (row.time + row.type + row.balance)}
                            {@const when = statementTime(row.time)}
                            <tr class="border-t border-onebank-row align-top">
                                <td class="px-6 py-3 leading-tight">{when.date}<br/>{when.time}</td>
                                <td class="px-4 py-3 tabular-nums">{rowReference(row)}</td>
                                <td class="whitespace-nowrap px-4 py-3">
                                    <span class="font-semibold tabular-nums {row.amount < 0 ? 'text-onebank-red' : 'text-onebank-income'}">
                                        {row.amount < 0 ? '−' : '+'} {formatMoney(Math.abs(row.amount))}
                                    </span>
                                    <span class="block text-xs tabular-nums text-onebank-subtle">{t('Balance', 'ຍອດເຫຼືອ')} {formatMoney(row.balance, 0)}</span>
                                </td>
                                <td class="max-w-64 px-4 py-3">
                                    <span class="mr-2 rounded-ob-sm bg-onebank-blue-soft px-1.5 py-0.5 text-xs font-semibold text-onebank-blue">{row.type}</span>
                                    {row.title}
                                    {#if row.subtitle}<span class="block text-xs text-onebank-subtle">{row.subtitle}</span>{/if}
                                </td>
                                <td class="px-6 py-3">
                                    {#each rowDetails(row, lang === 1) as [label, value] (label)}
                                        <span class="block"><span class="text-onebank-subtle">{label}:</span> {value}</span>
                                    {/each}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                {/each}
            </table>
        </div>

        {#if cursor && !loading}
            <div class="flex flex-col items-center gap-1">
                <button type="button" class="onebank-secondary-btn h-10 tablet:w-56" disabled={loadingMore} onclick={loadMore}>
                    {loadingMore ? t('Loading…', 'ກຳລັງໂຫລດ…') : t('Load older movements', 'ໂຫລດລາຍການເກົ່າກວ່າ')}
                </button>
                <p class="text-xs text-onebank-subtle">{t('This period holds more than one read', 'ໄລຍະນີ້ມີລາຍການຫຼາຍກວ່າໜຶ່ງຄັ້ງໂຫລດ')}</p>
            </div>
        {/if}
    {/if}
</div>

{#if filterOpen}
    <Modal title={t('Filter', 'ຕົວກັ່ນຕອງ')} size="lg" onClose={() => (filterOpen = false)}>
        <label class="relative mb-5 block">
            <span class="sr-only">{t('Search filters', 'ຄົ້ນຫາຕົວກັ່ນຕອງ')}</span>
            <Icon icon="mdi:magnify" class="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2"/>
            <input type="search" bind:value={filterSearch} placeholder={t('Search filters', 'ຄົ້ນຫາຕົວກັ່ນຕອງ')}
                   class="h-10 w-full rounded-ob-xl border border-onebank-ink pl-11 text-center text-sm focus:border-onebank-red focus:ring-onebank-red"/>
        </label>
        {#each groups as group (group.en)}
            {@const visible = group.filters.filter((filter) => filter.label.toLowerCase().includes(filterSearch.trim().toLowerCase()))}
            {#if visible.length}
                <h3 class="mb-2 mt-4 text-sm">{t(group.en, group.lo)}</h3>
                <div class="flex flex-wrap gap-2">
                    {#each visible as filter (filter.id)}
                        {@const on = draft.includes(filter.id)}
                        <button type="button" aria-pressed={on}
                                class="h-8 rounded-ob-sm px-4 text-sm transition-colors {on ? 'bg-onebank-pink text-onebank-red' : 'bg-onebank-light-grey-4'}"
                                onclick={() => (draft = on ? draft.filter((id) => id !== filter.id) : [...draft, filter.id])}>
                            {filter.label}
                        </button>
                    {/each}
                </div>
            {/if}
        {/each}
        {#if items.length === 0}
            <p class="mt-4 text-sm text-onebank-subtle">{t('Nothing was read for this period, so there is nothing to filter', 'ບໍ່ມີລາຍການໃນໄລຍະນີ້, ຈຶ່ງບໍ່ມີສິ່ງທີ່ຈະກັ່ນຕອງ')}</p>
        {/if}
        {#snippet footer()}
            <button type="button" class="onebank-secondary-btn h-10 tablet:w-36" onclick={() => (draft = [])}>{t('Clear', 'ລ້າງ')}</button>
            <button type="button" class="onebank-primary-btn h-10 tablet:w-44" onclick={() => { filters = [...draft]; filterOpen = false; }}>{t('Apply', 'ຕົກລົງ')}</button>
        {/snippet}
    </Modal>
{/if}
