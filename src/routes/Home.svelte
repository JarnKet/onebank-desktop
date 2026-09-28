<script lang="ts">
    /**
     * The group dashboard, laid out as the design's home frame: the spending
     * chart, shortcut tiles and the services grid in the wide column; the
     * spending donut, balances and the week calendar in the narrow one.
     *
     * Below `desktop` the narrow column drops under the wide one.
     */
    import Icon from '@iconify/svelte';
    import SpendChart from './home/SpendChart.svelte';
    import SpendShare from './home/SpendShare.svelte';
    import Balances from './home/Balances.svelte';
    import WeekCalendar from './home/WeekCalendar.svelte';
    import Shortcuts from './home/Shortcuts.svelte';
    import Services from './home/Services.svelte';
    import CustomizeMenus from './home/CustomizeMenus.svelte';
    import Modal from '../lib/components/Modal.svelte';
    import {t} from '../lib/utils/helper';
    import {navigateToPath} from '../lib/utils/navigation';
    import {currentGroup, loadHomeResult} from '../stores/onebankGroups';
    import {groups, groupsLoading, idVerified} from '../stores/groups';
    import {homeError, loadGroupHome} from '../stores/home';

    let customizing = $state(false);

    // Distinguishes "still finding out" from "genuinely has no groups", so the
    // create-a-group prompt does not flash during boot.
    const hasNoGroups = $derived(!$groupsLoading && $groups.length === 0);
</script>

{#if !$idVerified}
    <!-- An unverified, pending, under-review or failed account gets no OneBank at all. -->
    <div class="ob-card flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-onebank-subtle">
        <Icon icon="mdi:account-alert-outline" width={40} height={40}/>
        <p class="max-w-sm">{t('Your account is not verified yet. OneBank is unavailable until verification completes.', 'ບັນຊີຂອງທ່ານຍັງບໍ່ທັນຢືນຢັນ. ທ່ານຈະໃຊ້ OneBank ໄດ້ເມື່ອຢືນຢັນສຳເລັດ.')}</p>
    </div>
{:else if hasNoGroups}
    <div class="ob-card flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <img src="img/ob/logo-mark.png" alt="" class="h-24 w-24"/>
        <p class="text-lg">{t('You are not in a OneBank group yet.', 'ທ່ານຍັງບໍ່ມີກຸ່ມ OneBank')}</p>
        <div class="flex flex-wrap justify-center gap-3">
            <button type="button" class="onebank-primary-btn" onclick={() => navigateToPath('/register')}>{t('Create a group', 'ສ້າງກຸ່ມ')}</button>
            <button type="button" class="onebank-outline-btn tablet:w-auto" onclick={() => navigateToPath('/group/join')}>{t('Join a group', 'ເຂົ້າຮ່ວມກຸ່ມ')}</button>
        </div>
    </div>
{:else if $homeError && !$loadHomeResult}
    <div class="ob-card flex flex-col items-center gap-3 p-8 text-center">
        <Icon icon="mdi:alert-circle-outline" class="h-10 w-10 text-onebank-red"/>
        <p>{t('Could not load this group.', 'ໂຫຼດຂໍ້ມູນກຸ່ມບໍ່ໄດ້.')} <span class="text-onebank-subtle">{$homeError}</span></p>
        <button type="button" class="onebank-primary-btn" onclick={() => loadGroupHome($currentGroup, true)}>{t('Try again', 'ລອງໃໝ່')}</button>
    </div>
{:else if !$loadHomeResult}
    <div class="grid gap-4 desktop:grid-cols-[minmax(0,1fr)_434px]" aria-busy="true">
        <div class="h-[414px] animate-pulse rounded-ob-xl bg-white"></div>
        <div class="hidden h-[414px] animate-pulse rounded-ob-xl bg-white desktop:block"></div>
    </div>
{:else}
    <div class="grid items-start gap-4 desktop:grid-cols-[minmax(0,1fr)_434px]">
        <div class="flex min-w-0 flex-col gap-4">
            <svelte:boundary>
                <SpendChart/>
                {#snippet failed()}<div class="ob-card p-6 text-sm text-onebank-subtle">{t('This chart could not be shown.', 'ບໍ່ສາມາດສະແດງກາຟນີ້ໄດ້.')}</div>{/snippet}
            </svelte:boundary>
            <Shortcuts onAdd={() => (customizing = true)}/>
            <Services/>
        </div>
        <div class="flex min-w-0 flex-col gap-4">
            <svelte:boundary>
                <SpendShare/>
                {#snippet failed()}<div class="ob-card p-6 text-sm text-onebank-subtle">{t('This chart could not be shown.', 'ບໍ່ສາມາດສະແດງກາຟນີ້ໄດ້.')}</div>{/snippet}
            </svelte:boundary>
            <Balances/>
            <WeekCalendar/>
        </div>
    </div>
{/if}

{#if customizing}
    <Modal title={t('Choose your shortcuts', 'ເລືອກຟັງຊັ່ນລັດ')} size="lg" onClose={() => (customizing = false)}>
        <CustomizeMenus onClose={() => (customizing = false)}/>
    </Modal>
{/if}
