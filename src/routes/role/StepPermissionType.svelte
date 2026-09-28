<script lang="ts">
    /** View or transact: the choice that decides how many steps are left. */
    import Icon from '@iconify/svelte';
    import type {Permission} from '../../lib/api/types';
    import {t} from '../../lib/utils/helper';

    let {permission = $bindable()}: {permission: Permission} = $props();
</script>

<fieldset>
    <legend class="mb-2 text-lg font-semibold">{t('Permission type', 'ປະເພດສິດທິ')}</legend>
    <div class="grid gap-3 tablet:grid-cols-2">
        {#each [
            {viewonly: true, en: 'View accounts', lo: 'ເບິ່ງບັນຊີໄດ້', den: 'Can see the accounts and their movements', dlo: 'ສາມາດກວດເບິ່ງການເຄື່ອນໄຫວຂອງບັນຊີໄດ້', icon: 'mdi:eye-outline'},
            {viewonly: false, en: 'Transact on accounts', lo: 'ເຄື່ອນໄຫວບັນຊີໄດ້', den: 'Can move money from the accounts', dlo: 'ສາມາດເຄື່ອນໄຫວບັນຊີໄດ້', icon: 'mdi:swap-horizontal'},
        ] as option (option.en)}
            <label class="flex cursor-pointer items-start gap-3 rounded-ob-xl border-2 bg-white p-4 shadow-ob-card transition-colors
                          {permission.viewonly === option.viewonly ? 'border-onebank-red' : 'border-transparent'}">
                <input type="radio" name="permissionType" class="mt-1 text-onebank-red focus:ring-onebank-red"
                       checked={permission.viewonly === option.viewonly} onchange={() => (permission.viewonly = option.viewonly)}/>
                <span>
                    <span class="flex items-center gap-2 font-semibold"><Icon icon={option.icon} class="h-5 w-5"/>{t(option.en, option.lo)}</span>
                    <span class="text-sm text-onebank-subtle">{t(option.den, option.dlo)}</span>
                </span>
            </label>
        {/each}
    </div>
</fieldset>
