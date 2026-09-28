<script lang="ts">
    /** Which functions the role may use, or all of them. */
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

    const allFunctions = $derived(permission.allowedfunctions === '*' || !permission.allowedfunctions);
    const chosen = $derived(allFunctions ? [] : (permission.allowedfunctions ?? '').split(',').filter(Boolean));

    function toggleFunction(key: string) {
        const next = chosen.includes(key) ? chosen.filter((item) => item !== key) : [...chosen, key];
        permission.allowedfunctions = next.length ? next.join(',') : '*';
    }
</script>

<fieldset>
    <legend class="mb-2 text-lg font-semibold">{t('Functions it can use', 'ຟັງຊັ່ນທີ່ໃຊ້ໄດ້')}</legend>
    <label class="mb-3 inline-flex items-center gap-2 text-sm">
        <input type="checkbox" class="rounded text-onebank-red focus:ring-onebank-red" checked={allFunctions}
               onchange={() => (permission.allowedfunctions = allFunctions ? functions.slice(0, 3).join(',') : '*')}/>
        {t('Every function', 'ໃຊ້ໄດ້ທຸກຟັງຊັ່ນ')}
    </label>
    <div class="grid grid-cols-3 gap-3 tablet:grid-cols-6">
        {#each functions as key (key)}
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
