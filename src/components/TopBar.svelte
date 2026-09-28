<script lang="ts">
    /**
     * The top bar, as in every frame of the design: logo, one tab per group
     * (the active one filled red), a "create / join" menu, and the language pill.
     *
     * It replaces `GroupSwitcher`, which hid the groups in a disclosure on the
     * sidebar card. The design makes group switching a first-class control.
     */
    import Icon from '@iconify/svelte';
    import {fade} from 'svelte/transition';
    import {groups, groupsLoading, selectGroup} from '../stores/groups';
    import {currentGroup} from '../stores/onebankGroups';
    import {goHome, navigateToPath} from '../lib/utils/navigation';
    import {lang, setLanguage, t} from '../lib/utils/helper';
    import {clickOutside} from '../lib/attachments/clickOutside';
    import {routeLocation} from '../stores/route';

    let {onMenu}: {
        /** Opens the sidebar drawer, below the laptop breakpoint. */
        onMenu?: () => void
    } = $props();

    let manageOpen = $state(false);
    let languageOpen = $state(false);

    const languages = [
        {code: 1, label: 'ລາວ', name: 'ພາສາລາວ', flag: 'img/ob/flag-laos.svg'},
        {code: 0, label: 'EN', name: 'English', flag: 'img/flag_us.svg'},
        {code: 3, label: '中文', name: '中文', flag: 'img/flag_china.svg'},
        {code: 2, label: 'VI', name: 'Tiếng Việt', flag: 'img/flag_vietnam.svg'},
    ];
    const current = $derived(languages.find((entry) => entry.code === lang) ?? languages[0]);

    function choose(onebankid: string) {
        if (onebankid !== $currentGroup) selectGroup(onebankid);
        goHome();
    }

    function manage(path: string) {
        manageOpen = false;
        navigateToPath(path);
    }

    const managing = $derived(['/register', '/group/join', '/group/leave'].includes($routeLocation.path));

    const manageItems = [
        {path: '/register', en: 'Create a new group', lo: 'ສ້າງກຸ່ມໃໝ່'},
        {path: '/group/join', en: 'Join a group', lo: 'ເຂົ້າຮ່ວມກຸ່ມ'},
        {path: '/group/leave', en: 'Leave a group', lo: 'ອອກຈາກກຸ່ມ'},
    ];
</script>

<header class="flex items-center gap-3 px-4 pb-4 pt-4 tablet:gap-4 tablet:px-[27px] desktop:gap-5 desktop:pt-6">
    <button type="button" class="rounded-ob-sm p-1 laptop:hidden" aria-label={t('Open menu', 'ເປີດເມນູ')} onclick={() => onMenu?.()}>
        <Icon icon="mdi:menu" class="h-7 w-7"/>
    </button>

    <button type="button" class="flex shrink-0 items-center gap-2" onclick={goHome} aria-label="OneBank">
        <img src="img/ob/logo-mark.png" alt="" class="h-12 w-12 desktop:h-[65px] desktop:w-[65px]"/>
        <img src="img/ob/logo-wordmark.svg" alt="ONE BANK — all you can bank on" width="183" height="43"
             class="hidden h-9 w-auto tablet:block desktop:h-[43px]"/>
    </button>

    <div class="flex min-w-0 flex-1 items-center gap-4 laptop:justify-center">
    <nav class="flex min-w-0 items-center gap-3 overflow-x-auto px-1 py-1 tablet:gap-4"
         aria-label={t('Groups', 'ກຸ່ມ')}>
        {#if $groupsLoading && $groups.length === 0}
            {#each [0, 1, 2] as i (i)}
                <div class="h-[58px] w-36 shrink-0 animate-pulse rounded-ob-xl bg-white"></div>
            {/each}
        {:else}
            {#each $groups as group (group.onebankid)}
                {@const active = group.onebankid === $currentGroup && !managing}
                <button
                        type="button"
                        class="h-[58px] max-w-[240px] shrink-0 truncate rounded-ob-xl border-2 border-onebank-red px-5 text-base shadow-ob-pill transition-colors
                               {active ? 'bg-onebank-red font-bold text-white' : 'bg-white font-medium text-onebank-red hover:bg-onebank-pink'}"
                        aria-current={active ? 'true' : undefined}
                        onclick={() => choose(group.onebankid)}
                >
                    {group.name || group.onebankid}
                </button>
            {/each}
        {/if}

    </nav>

    <div class="relative shrink-0" {@attach clickOutside(() => (manageOpen = false))}>
        <button
                type="button"
                aria-label={t('Create or join a group', 'ສ້າງ ຫຼື ເຂົ້າຮ່ວມກຸ່ມ')}
                class="flex h-[58px] items-center gap-2 rounded-ob-xl border-2 border-onebank-red px-5 text-base shadow-ob-pill transition-colors
                       {manageOpen || managing ? 'bg-onebank-red font-bold text-white' : 'bg-white font-medium text-onebank-red hover:bg-onebank-pink'}"
                aria-haspopup="menu"
                aria-expanded={manageOpen}
                onclick={() => (manageOpen = !manageOpen)}
        >
            <Icon icon="mdi:plus-circle" class="h-6 w-6"/>
            <span class="hidden whitespace-nowrap tablet:inline">{t('Create / Join', 'ສ້າງ / ເຂົ້າຮ່ວມ')}</span>
        </button>
        {#if manageOpen}
            <div class="absolute left-1/2 top-[72px] z-30 flex w-57.5 -translate-x-1/2 flex-col gap-1 rounded-ob-xl bg-white p-3 text-black shadow-ob-card"
                 role="menu" transition:fade={{duration: 120}}>
                {#each manageItems as item (item.path)}
                    {@const here = $routeLocation.path === item.path}
                    <button type="button" role="menuitem"
                            class="h-12.5 w-full rounded-ob-lg text-center text-base transition-colors {here ? 'bg-onebank-red font-semibold text-white' : 'hover:bg-onebank-pink'}"
                            onclick={() => manage(item.path)}>
                        {t(item.en, item.lo)}
                    </button>
                {/each}
            </div>
        {/if}
    </div>
    </div>

    <div class="relative shrink-0" {@attach clickOutside(() => (languageOpen = false))}>
        <button
                type="button"
                class="flex h-[58px] items-center gap-2 rounded-ob-xl bg-white pl-2.5 pr-5 shadow-ob-card"
                aria-haspopup="listbox"
                aria-expanded={languageOpen}
                aria-label={t('Language', 'ພາສາ')}
                onclick={() => (languageOpen = !languageOpen)}
        >
            <img src={current.flag} alt="" class="h-10 w-10 rounded-full object-cover"/>
            <Icon icon="mdi:menu-down" class="h-5 w-5 text-black"/>
            <span class="hidden min-w-10 text-center text-base font-medium tablet:inline">{current.label}</span>
        </button>
        {#if languageOpen}
            <ul class="absolute right-0 top-[66px] z-30 w-52 overflow-hidden rounded-ob-xl bg-white py-2 shadow-ob-card"
                role="listbox" transition:fade={{duration: 120}}>
                {#each languages as entry (entry.code)}
                    <li>
                        <button type="button" role="option" aria-selected={entry.code === lang}
                                class="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-onebank-pink"
                                onclick={() => setLanguage(entry.code)}>
                            <img src={entry.flag} alt="" class="h-7 w-7 rounded-full object-cover"/>
                            <span class="flex-1">{entry.name}</span>
                            {#if entry.code === lang}<Icon icon="mdi:check" class="h-5 w-5 text-onebank-red"/>{/if}
                        </button>
                    </li>
                {/each}
            </ul>
        {/if}
    </div>
</header>
