<script lang="ts">
    /**
     * The authenticated shell: top bar across, the group/nav column on the
     * left, the routed page on the right.
     *
     * One rhythm holds the shell together, a step above the 12–16px the cards
     * inside a page use: a 16px page frame that opens to 24/27px at desktop,
     * and a 36px gutter between the columns — 20px of it the room the
     * sidebar's collapse chevron overhangs into. Both columns scroll from 8px
     * in, so the first card's shadow is not clipped by the scroller's edge.
     *
     * At `laptop` and up the left column is always there (304px, or an 88px
     * icon rail when collapsed). Below that it becomes a drawer the top bar's
     * menu button opens; the scrim, Escape or a navigation closes it.
     */
    import type {Snippet} from 'svelte';
    import {fade, fly} from 'svelte/transition';
    import {prefersReducedMotion} from 'svelte/motion';
    import TopBar from './TopBar.svelte';
    import Sidebar from './Sidebar.svelte';
    import AddMemberDialog from './addmemberdialog/AddMemberDialog.svelte';
    import {showAddMemberDialog} from '../stores/ui';
    import {t} from '../lib/utils/helper';
    import {routeForPath} from '../lib/routes';
    import {routeLocation} from '../stores/route';

    interface Props {
        sidebarExpanded?: boolean;
        /** Asks the parent to widen or narrow the column. */
        onToggleExpand?: () => void;
        children?: Snippet;
    }

    let {sidebarExpanded = true, onToggleExpand, children}: Props = $props();

    let drawerOpen = $state(false);

    /** Group management screens take the whole width, as in the design. */
    const fullWidth = $derived(routeForPath($routeLocation.path)?.fullWidth ?? false);

    const slide = $derived(prefersReducedMotion.current ? 0 : 200);
</script>

<!-- `<svelte:window>` cannot sit inside a block, hence the guard. -->
<svelte:window onkeydown={(event) => { if (drawerOpen && event.key === 'Escape') drawerOpen = false }}/>

{#if $showAddMemberDialog}
    <AddMemberDialog/>
{/if}

<div class="flex h-full w-full flex-col overflow-hidden bg-onebank-page">
    <TopBar onMenu={() => (drawerOpen = true)}/>

    <div class="flex min-h-0 flex-1 gap-4 px-4 tablet:px-[27px]">
        <!-- Fixed column at laptop+ -->
        {#if !fullWidth}
            <aside class="hidden shrink-0 overflow-y-auto pb-4 pr-5 pt-2 transition-[width] duration-200 laptop:block desktop:pb-6"
                   class:w-81={sidebarExpanded} class:w-27={!sidebarExpanded}>
                <Sidebar expand={sidebarExpanded} {onToggleExpand}/>
            </aside>
        {/if}

        <main class="min-w-0 flex-1 overflow-y-auto pb-4 pt-2 desktop:pb-6">
            {@render children?.()}
        </main>
    </div>
</div>

<!-- Drawer below laptop -->
{#if drawerOpen}
    <button type="button" class="fixed inset-0 z-40 bg-black/40 laptop:hidden" transition:fade={{duration: 150}}
            aria-label={t('Close menu', 'ປິດເມນູ')} onclick={() => (drawerOpen = false)}></button>
    <aside class="fixed inset-y-0 left-0 z-50 w-[336px] max-w-[85vw] overflow-y-auto bg-onebank-page p-4 laptop:hidden"
           transition:fly={{x: -336, duration: slide, opacity: 1}}>
        <Sidebar expand={true} onNavigate={() => (drawerOpen = false)}/>
    </aside>
{/if}
