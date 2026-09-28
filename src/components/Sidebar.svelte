<script lang="ts">
    /**
     * The left column: the active group's card, then the navigation card.
     *
     * Matches the design's two stacked white cards. The group card carries the
     * logo, name, member stack and the red "add member" button; the pink
     * chevron on its edge collapses the column to an icon rail.
     */
    import Icon from '@iconify/svelte';
    import Member from './Member.svelte';
    import {currentGroup, currentSidebarMenu, onebankGroups} from '../stores/onebankGroups';
    import {goHome, navigateToMenu} from '../lib/utils/navigation';
    import {routeForPath} from '../lib/routes';
    import {routeLocation} from '../stores/route';
    import type {SidebarMenuTitle} from '../definition';
    import {sidebarMenuItems} from '../lib/constant';
    import {t} from '../lib/utils/helper';
    import {logout} from '../lib/session';
    import {openAddMemberDialog} from '../stores/ui';
    import {pendingCount, unreadCount} from '../stores/badges';

    interface Props {
        expand?: boolean
        /** Asks the parent to widen or narrow the column. */
        onToggleExpand?: () => void
        /** Called after a navigation, so a drawer can close itself. */
        onNavigate?: () => void
    }

    let {expand = true, onToggleExpand, onNavigate}: Props = $props();

    function handleMenuClick(title: SidebarMenuTitle) {
        if (title === 'LOGOUT') {
            logout();
            return;
        }
        if (title === 'HOME') goHome();
        else navigateToMenu(title);
        onNavigate?.();
    }

    // The URL decides which entry is highlighted, so a deep link or a back
    // press lands with the right one selected. Read through the store, not
    // svelte-spa-router's own state — see src/stores/route.ts.
    // An unknown path renders home (the router's `*`), so it highlights Home;
    // a real page with no entry of its own — the statement — highlights none.
    const activeMenu = $derived.by(() => {
        const route = routeForPath($routeLocation.path);
        return route ? route.menu : 'HOME';
    });

    // Publishing the highlight is a genuine side effect (the store is shared
    // with the rest of the shell), so it stays an effect rather than a derived.
    $effect(() => {
        if (activeMenu) $currentSidebarMenu = activeMenu;
    });

    const home = $derived($onebankGroups[$currentGroup]?.loadHomeResult);
    const isLoading = $derived(!$onebankGroups[$currentGroup]?.isFinishLoad);
    const groupName = $derived(home?.detail?.name ?? '');
    const groupDetail = $derived(home?.detail?.detail ?? '');
    const groupLogo = $derived(home?.detail?.logoname ?? '');

    function badge(id: SidebarMenuTitle): number {
        if (id === 'MESSAGE') return $unreadCount;
        if (id === 'AUTHORIZATION') return $pendingCount;
        return 0;
    }
</script>

<div class="flex flex-col gap-4">
    <!-- Group card -->
    <section class="ob-card relative p-5" class:px-2={!expand} aria-label={t('Current group', 'ກຸ່ມປັດຈຸບັນ')}>
        {#if isLoading && !home}
            <div class="flex animate-pulse gap-4">
                <div class="h-[70px] w-[70px] shrink-0 rounded-full bg-gray-200"></div>
                {#if expand}
                    <div class="flex-1 space-y-3 pt-2">
                        <div class="h-4 rounded bg-gray-200"></div>
                        <div class="h-4 w-2/3 rounded bg-gray-200"></div>
                    </div>
                {/if}
            </div>
        {:else}
            <div class="flex gap-4" class:justify-center={!expand}>
                {#if groupLogo}
                    <img src={groupLogo} alt="" class="h-[70px] w-[70px] shrink-0 rounded-full object-cover"/>
                {:else}
                    <img src="/img/ic_onebank.svg" alt="" class="h-[70px] w-[70px] shrink-0 rounded-full object-cover"
                         class:h-12={!expand} class:w-12={!expand}/>
                {/if}
                {#if expand}
                    <div class="min-w-0 flex-1">
                        <p class="line-clamp-2 text-base leading-6 text-black" title={groupName}>{groupName}</p>
                        {#if groupDetail}<p class="truncate text-sm text-onebank-subtle">{groupDetail}</p>{/if}
                        <div class="mt-2"><Member/></div>
                    </div>
                {/if}
            </div>
            {#if expand}
                <div class="mt-4 flex justify-end">
                    <button type="button" class="h-[50px] w-[174px] rounded-ob-xl bg-onebank-red text-base font-bold text-white transition-colors hover:bg-onebank-dark-red"
                            onclick={openAddMemberDialog}>
                        {t('Add member', 'ເພີ່ມສະມາຊິກ')}
                    </button>
                </div>
            {/if}
        {/if}

        {#if onToggleExpand}
            <button type="button"
                    class="absolute -right-5 top-1/2 hidden -translate-y-1/2 transition-transform hover:scale-105 laptop:block"
                    aria-label={expand ? t('Collapse sidebar', 'ຫຍໍ້ເມນູ') : t('Expand sidebar', 'ຂະຫຍາຍເມນູ')}
                    onclick={() => onToggleExpand?.()}>
                <img src="img/ob/ic-collapse.svg" alt="" width="40" height="40" class:rotate-180={!expand}/>
            </button>
        {/if}
    </section>

    <!-- Navigation card -->
    <nav class="ob-card px-3 py-3" aria-label={t('Main menu', 'ເມນູຫຼັກ')}>
        <ul class="flex flex-col">
            {#each sidebarMenuItems as item (item.id)}
                {@const active = activeMenu === item.id}
                {@const count = badge(item.id)}
                {@const label = t(item.en, item.lo)}
                <li>
                    <button type="button"
                            class="relative flex h-[50px] w-full items-center gap-4 rounded-ob-xl px-5 text-left text-base transition-colors
                                   {active ? 'bg-onebank-red font-semibold text-white' : 'text-black hover:bg-onebank-page'}"
                            class:justify-center={!expand}
                            class:px-0={!expand}
                            aria-label={label}
                            aria-current={active ? 'page' : undefined}
                            title={expand ? undefined : label}
                            onclick={() => handleMenuClick(item.id)}>
                        <Icon icon={item.icon} class="h-6 w-6 shrink-0"/>
                        {#if expand}
                            <span class="flex-1 truncate" title={label}>{label}</span>
                        {/if}
                        {#if count > 0}
                            <span class="flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs
                                         {active ? 'bg-white text-onebank-red' : 'bg-onebank-red text-white'}"
                                  class:absolute={!expand} class:right-1={!expand} class:top-1={!expand}
                                  aria-label="{count} {t('new', 'ໃໝ່')}">{count}</span>
                        {/if}
                    </button>
                </li>
            {/each}
        </ul>
    </nav>
</div>
