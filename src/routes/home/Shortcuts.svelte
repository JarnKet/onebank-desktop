<script lang="ts">
    /**
     * The user's shortcut tiles — up to ten, six to a row at full width — and
     * the translucent "add shortcut" tile after them, which opens the picker.
     */
    import {menus} from '../../lib/menus';
    import {sortSelected} from './quickAccess';
    import {isUsable, openMenu} from './openMenu';
    import {t} from '../../lib/utils/helper';
    import {loadHomeResult} from '../../stores/onebankGroups';

    let {onAdd}: {onAdd: () => void} = $props();

    const usablemenus = $derived($loadHomeResult?.usablemenus);
    const visible = $derived(
        sortSelected($loadHomeResult?.homemenus ?? [])
            .map((menu) => menu.name)
            .filter((name) => isUsable(usablemenus, name) && menus[name])
            .slice(0, 10),
    );
</script>

<section aria-label={t('Shortcuts', 'ຟັງຊັ່ນລັດ')}
         class="grid grid-cols-3 gap-3 mobile:grid-cols-4 tablet:grid-cols-6">
    {#each visible as name (name)}
        <button type="button" onclick={() => openMenu(name)}
                class="ob-card flex h-[146px] flex-col items-center justify-center gap-3 px-2 text-center transition-transform hover:-translate-y-0.5">
            <img src="img/{menus[name].filename}" alt="" class="h-14 w-14 object-contain"/>
            <span class="text-base leading-tight">{menus[name].name}</span>
        </button>
    {/each}
    <button type="button" onclick={onAdd}
            class="flex h-[146px] flex-col items-center justify-center gap-3 rounded-ob-xl bg-white/70 px-2 text-center text-base transition-colors hover:bg-white">
        <img src="img/ob/ic-plus.svg" alt="" class="h-10 w-10"/>
        {t('Add shortcut', 'ເພີ່ມຟັງຊັ່ນລັດ')}
    </button>
</section>
