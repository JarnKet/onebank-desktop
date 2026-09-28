<script lang="ts">
    /**
     * Creating a role, step by step: who it is for, what kind it is, then —
     * only when it can transact — its functions, its caps and who must agree,
     * and last a review, because the core has no command to change a role.
     *
     * The step list, the checks at each boundary and the two warnings are
     * onebank-ui's ROLE; the chrome is the Create OneBank wizard's.
     */
    import Icon from '@iconify/svelte';
    import ConfirmDialog from '../account/ConfirmDialog.svelte';
    import RoleSummary from './RoleSummary.svelte';
    import StepAccountsMembers from './StepAccountsMembers.svelte';
    import StepFunctions from './StepFunctions.svelte';
    import StepLimitsApproval from './StepLimitsApproval.svelte';
    import StepPermissionType from './StepPermissionType.svelte';
    import type {Account, User} from '../../definition';
    import type {Permission} from '../../lib/api/types';
    import {addPermission} from '../../lib/api/unmapped';
    import {proofOf, verifyIdentity} from '../../lib/twoFactor';
    import {t} from '../../lib/utils/helper';

    /** What onebank-ui grants a view-only role, verbatim. */
    const VIEW_ONLY_FUNCTIONS = 'CARDINFO,HISTORY,STATEMENT,CHAT,MESSAGE';

    type Step = 'who' | 'type' | 'functions' | 'limits' | 'review';
    const ALL: Step[] = ['who', 'type', 'functions', 'limits', 'review'];
    /** The steps a view-only role never reaches — onebank-ui's `requiresEdit`. */
    const TRANSACT_ONLY: Step[] = ['functions', 'limits'];

    let {
        accounts,
        members,
        functions,
        onCancel,
        onSaved,
    }: {
        accounts: Account[]
        members: User[]
        /** Menu keys the group can offer. */
        functions: string[]
        onCancel: () => void
        onSaved: () => void
    } = $props();

    let draft = $state<Permission>({name: '', accountids: [], userids: [], allowedfunctions: '*', viewonly: false, approverlevels: []});
    let step = $state<Step>('who');
    let error = $state('');
    let saving = $state(false);
    let guard = $state<'everyone' | 'nolimit' | null>(null);
    let everyoneAccepted = $state(false);
    let noLimitAccepted = $state(false);

    const steps = $derived(draft.viewonly ? ALL.filter((item) => !TRANSACT_ONLY.includes(item)) : ALL);
    const index = $derived(Math.max(0, steps.indexOf(step)));
    const last = $derived(step === 'review');
    const everyMemberChosen = $derived(members.length > 0 && (draft.userids ?? []).length === members.length);

    function title(item: Step): string {
        if (item === 'who') return t('Accounts & members', 'ບັນຊີ ແລະ ສະມາຊິກ');
        if (item === 'type') return t('Permission type', 'ປະເພດສິດທິ');
        if (item === 'functions') return t('Functions', 'ຟັງຊັ່ນ');
        if (item === 'limits') return t('Limits & approval', 'ວົງເງິນ ແລະ ການອະນຸມັດ');
        return t('Review', 'ກວດສອບ');
    }

    /** Empty when the step may be left, otherwise what is missing. */
    function checked(item: Step): string {
        if (item === 'who') {
            if ((draft.accountids ?? []).length === 0) return t('Choose at least one account', 'ກະລຸນາເລືອກຢ່າງໜ້ອຍໜຶ່ງບັນຊີ');
            if ((draft.userids ?? []).length === 0) return t('Choose at least one member', 'ກະລຸນາເລືອກຢ່າງໜ້ອຍໜຶ່ງສະມາຊິກ');
        }
        if (item === 'functions' && draft.allowedfunctions !== '*' && !(draft.allowedfunctions ?? '').split(',').filter(Boolean).length)
            return t('Choose at least one function', 'ກະລຸນາເລືອກຢ່າງໜ້ອຍໜຶ່ງຟັງຊັ່ນ');
        if (item === 'limits') {
            for (const level of draft.approverlevels ?? []) {
                const approvers = (level.approveruserids ?? []).length;
                if (approvers === 0) return t('Every approval level needs at least one approver', 'ໃນຂັ້ນອະນຸມັດຕ້ອງມີຜູ້ອະນຸມັດຢ່າງໜ້ອຍ 1 ຄົນ');
                if (level.approvernumber > approvers)
                    return t('An approval level cannot need more approvals than it has approvers', 'ຈຳນວນຄັ້ງທີ່ຕ້ອງອະນຸມັດໃຫຍ່ກວ່າຈຳນວນຄົນອະນຸມັດທີ່ເລືອກ');
                if (level.approvernumber < 1) return t('An approval level must need at least one approval', 'ຈຳນວນຄັ້ງທີ່ຕ້ອງອະນຸມັດຕ້ອງໃຫຍ່ກວ່າ 0');
            }
        }
        return '';
    }

    function back() {
        error = '';
        if (index === 0) onCancel();
        else step = steps[index - 1];
    }

    function next() {
        error = checked(step);
        if (error) return;
        if (step === 'who' && everyMemberChosen && !everyoneAccepted) {
            guard = 'everyone';
            return;
        }
        if (step === 'limits' && !draft.limit?.amount && !draft.limit?.daily && !noLimitAccepted) {
            guard = 'nolimit';
            return;
        }
        step = steps[index + 1];
    }

    function acceptGuard() {
        if (guard === 'everyone') {
            everyoneAccepted = true;
            // Nobody is left to approve, so the levels cannot stand.
            draft.approverlevels = [];
        } else {
            noLimitAccepted = true;
        }
        guard = null;
        next();
    }

    async function save() {
        error = '';
        const verified = await verifyIdentity();
        if (!verified) {
            error = t('Identity was not verified, so the role was not created', 'ບໍ່ໄດ້ຢືນຢັນຕົວຕົນ ຈຶ່ງບໍ່ໄດ້ສ້າງສິດທິ');
            return;
        }
        saving = true;
        const response = await addPermission(wirePermission($state.snapshot(draft) as Permission), proofOf(verified));
        saving = false;
        if (response.result !== 0) {
            error = response.message || t('Could not save the role', 'ບັນທຶກສິດທິບໍ່ໄດ້');
            return;
        }
        onSaved();
    }

    /**
     * What goes on the wire, as onebank-ui's ROLE builds it: a view-only role
     * carries its own fixed function list and nothing else, an empty level list
     * is left out rather than sent, and `name` is ours — the core has no such
     * field and answers none.
     */
    function wirePermission(source: Permission): Permission {
        const permission: Permission = {...source, accountids: source.accountids ?? [], userids: source.userids ?? []};
        if (permission.viewonly) {
            permission.allowedfunctions = VIEW_ONLY_FUNCTIONS;
            delete permission.limit;
            delete permission.approverlevels;
            return permission;
        }
        if (!permission.approverlevels?.length) delete permission.approverlevels;
        if (permission.limit && !Object.values(permission.limit).some((cap) => cap)) delete permission.limit;
        return permission;
    }
</script>

<div class="flex items-center gap-2">
    <button type="button" class="rounded-full p-1 hover:bg-white" aria-label={t('Back', 'ກັບຄືນ')} onclick={back}>
        <Icon icon="mdi:arrow-left" class="h-6 w-6"/>
    </button>
    <h1 class="text-2xl font-semibold">{t('New role', 'ສ້າງສິດທິໃໝ່')}</h1>
</div>

<ol class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 py-2" aria-label={t('Progress', 'ຂັ້ນຕອນ')}>
    {#each steps as item, position (item)}
        <li class="flex items-center gap-2" aria-current={position === index ? 'step' : undefined}>
            <span class="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-white
                         {position <= index ? 'bg-onebank-red' : 'bg-onebank-light-grey-4'}">{position + 1}</span>
            <span class="hidden text-sm laptop:inline {position === index ? 'font-semibold text-onebank-blue' : 'text-onebank-subtle'}">{title(item)}</span>
            {#if position < steps.length - 1}
                <span class="h-1 w-8 rounded-full {position < index ? 'bg-onebank-red' : 'bg-onebank-light-grey-4'}"></span>
            {/if}
        </li>
    {/each}
</ol>

<div class="ob-card space-y-6 p-5">
    {#if step === 'who'}
        <StepAccountsMembers bind:permission={draft} {accounts} {members}/>
    {:else if step === 'type'}
        <StepPermissionType bind:permission={draft}/>
    {:else if step === 'functions'}
        <StepFunctions bind:permission={draft} {functions}/>
    {:else if step === 'limits'}
        <StepLimitsApproval bind:permission={draft} {members}/>
    {:else}
        <div>
            <label for="permissionName" class="ob-label">{t('Role name', 'ຊື່ສິດທິ')}</label>
            <input id="permissionName" class="ob-input" maxlength="40" bind:value={draft.name}
                   placeholder={t('e.g. Finance officer', 'ເຊັ່ນ: ພະນັກງານການເງິນ')}/>
        </div>
        <RoleSummary role={draft} {accounts} {members}/>
    {/if}
</div>

{#if error}<p class="text-center text-sm text-red-600" role="alert">{error}</p>{/if}

<div class="flex justify-center">
    <div class="flex rounded-ob-md border-2 border-onebank-light-grey-4 bg-onebank-light-grey-4 p-0.5">
        <button type="button" class="h-10 w-36 rounded-ob-sm bg-white text-base font-bold text-onebank-blue hover:bg-onebank-blue-soft disabled:opacity-50"
                disabled={saving} onclick={back}>
            {index === 0 ? t('Cancel', 'ຍົກເລີກ') : t('Back', 'ກັບຄືນ')}
        </button>
        <button type="button" class="h-10 w-36 rounded-ob-sm bg-onebank-red text-base font-bold text-white disabled:opacity-50"
                disabled={saving} onclick={last ? save : next}>
            {#if last}{saving ? t('Saving…', 'ກຳລັງບັນທຶກ…') : t('Save', 'ບັນທຶກ')}{:else}{t('Next', 'ຕໍ່ໄປ')}{/if}
        </button>
    </div>
</div>

<ConfirmDialog open={guard !== null}
               title={guard === 'nolimit' ? t('No spending limit?', 'ບໍ່ກຳນົດວົງເງິນບໍ?') : t('Every member holds this role', 'ສະມາຊິກທຸກຄົນຖືສິດນີ້')}
               content={guard === 'nolimit'
                   ? t('Without a limit, transactions can run up to the product’s own maximum.', 'ຖ້າບໍ່ກຳນົດວົງເງິນ ຈະສາມາດເຄື່ອນໄຫວໄດ້ຕາມເງື່ອນໄຂສູງສຸດຂອງຜະລິດຕະພັນ.')
                   : t('Nobody is left to approve, so this role can only be created without approval.', 'ບໍ່ມີຜູ້ອະນຸມັດເຫຼືອ ຈຶ່ງສ້າງໄດ້ແຕ່ແບບບໍ່ຕ້ອງອະນຸມັດ.')}
               confirmLabel={t('Continue', 'ສືບຕໍ່')}
               onConfirm={acceptGuard} onCancel={() => (guard = null)}/>
