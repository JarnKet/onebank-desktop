<script lang="ts">
    /**
     * Every service the group can reach, with the design's search box on top.
     * A service the group's permissions exclude is greyed out and inert rather
     * than offered as if it worked.
     */
    import {menus, offeredMenus} from '../../lib/menus';
    import {isUsable, openMenu} from './openMenu';
    import {t} from '../../lib/utils/helper';
    import {loadHomeResult} from '../../stores/onebankGroups';

    let search = $state('');

    const usablemenus = $derived($loadHomeResult?.usablemenus);
    // The core's list plus the iBanking family and OneBank utilities it never
    // enumerates (see ALWAYS_OFFERED) — dropping those is what made iBank vanish.
    const all = $derived(offeredMenus($loadHomeResult?.allmenus));
    const query = $derived(search.trim().toLowerCase());
    const shown = $derived(
        query === '' ? all : all.filter((key) => key.toLowerCase().includes(query) || menus[key].name.toLowerCase().includes(query)),
    );
</script>

<section class="ob-card p-5">
    <label class="relative block">
        <span class="sr-only">{t('Search services', 'ຄົ້ນຫາຟັງຊັ່ນ')}</span>
        <img src="img/ob/ic-search.svg" alt="" class="pointer-events-none absolute left-4 top-1/2 h-7 w-7 -translate-y-1/2"/>
        <input type="search" bind:value={search} placeholder={t('Search services', 'ຄົ້ນຫາຟັງຊັ່ນ')}
               class="h-[52px] w-full rounded-ob-xl border border-onebank-ink bg-white pl-14 pr-4 text-center text-base placeholder:text-onebank-muted focus:border-onebank-red focus:ring-onebank-red"/>
    </label>

    {#if shown.length === 0}
        <p class="py-10 text-center text-sm text-onebank-subtle">{t('Nothing matches', 'ບໍ່ພົບ')}</p>
    {/if}
    <div class="mt-5 grid grid-cols-3 gap-y-4 mobile:grid-cols-4 tablet:grid-cols-6">
        {#each shown as key (key)}
            {@const usable = isUsable(usablemenus, key)}
            <button type="button" disabled={!usable} onclick={() => openMenu(key)}
                    class="flex flex-col items-center gap-3 rounded-ob-lg px-2 py-3 text-center transition-colors hover:bg-onebank-page disabled:cursor-not-allowed disabled:opacity-40">
                <img src="img/{menus[key].filename}" alt="" class="h-10 w-10 object-contain"/>
                <span class="text-base leading-tight">{menus[key].name}</span>
            </button>
        {/each}
    </div>
</section>
