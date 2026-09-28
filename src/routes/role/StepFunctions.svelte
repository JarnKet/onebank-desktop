<script lang="ts">
    /** Which functions the role may use, or all of them. */
    import Icon from '@iconify/svelte';
    import type {Permission} from '../../lib/api/types';
    import {menus} from '../../lib/menus';
    import {t} from '../../lib/utils/helper';

    let {
        permission = $bindable(),
        functions,
    }: {
        permission: Permission
        /** Menu keys the group can offer. */
        functions: string[]
    } = $props();

    let search = $state('');

    const allFunctions = $derived(permission.allowedfunctions === '*' || !permission.allowedfunctions);
    const chosen = $derived(allFunctions ? [] : (permission.allowedfunctions ?? '').split(',').filter(Boolean));
    const query = $derived(search.trim().toLowerCase());
    const shown = $derived(
        query === ''
            ? functions
            : functions.filter((key) => key.toLowerCase().includes(query) || (menus[key]?.name ?? '').toLowerCase().includes(query)),
    );

    function toggleFunction(key: string) {
        const next = chosen.includes(key) ? chosen.filter((item) => item !== key) : [...chosen, key];
        permission.allowedfunctions = next.length ? next.join(',') : '*';
    }
</script>

<fieldset>
    <legend class="mb-2 text-lg font-semibold">{t('Functions it can use', 'ຟັງຊັ່ນທີ່ໃຊ້ໄດ້')}</legend>

    <div class="mb-3 flex flex-wrap items-center gap-3">
        <label class="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" class="rounded text-onebank-red focus:ring-onebank-red" checked={allFunctions}
                   onchange={() => (permission.allowedfunctions = allFunctions ? functions.slice(0, 3).join(',') : '*')}/>
            {t('Every function', 'ໃຊ້ໄດ້ທຸກຟັງຊັ່ນ')}
        </label>
        <!-- The search hides chosen functions, so say how many are held. -->
        {#if !allFunctions}
            <span class="rounded-full bg-onebank-blue-soft px-3 py-1 text-xs font-medium text-onebank-blue">
                {t(`${chosen.length} chosen`, `ເລືອກແລ້ວ ${chosen.length}`)}
            </span>
        {/if}
    </div>

    <label class="relative mb-4 block">
        <span class="sr-only">{t('Search functions', 'ຄົ້ນຫາຟັງຊັ່ນ')}</span>
        <Icon icon="mdi:magnify" class="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2"/>
        <input type="search" bind:value={search} placeholder={t('Search functions', 'ຄົ້ນຫາຟັງຊັ່ນ')}
               class="h-10 w-full rounded-ob-xl border border-onebank-ink pl-11 text-center text-sm focus:border-onebank-red focus:ring-onebank-red"/>
    </label>

    {#if shown.length === 0}
        <p class="py-8 text-center text-sm text-onebank-subtle">{t('Nothing matches', 'ບໍ່ພົບ')}</p>
    {/if}
    <div class="grid grid-cols-3 gap-3 tablet:grid-cols-6">
        {#each shown as key (key)}
            {@const on = allFunctions || chosen.includes(key)}
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
