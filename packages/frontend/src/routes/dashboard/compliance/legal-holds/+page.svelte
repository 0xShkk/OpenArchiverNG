<script lang="ts">
	import type { PageData } from './$types';
	import * as Table from '$lib/components/ui/table';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Badge } from '$lib/components/ui/badge';
	import { api } from '$lib/api.client';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte';
	import { t } from '$lib/translations';
	import type {
		ComplianceCase,
		ComplianceCaseSummary,
		Custodian,
		ExportJob,
		LegalHold,
		LegalHoldCriteria,
		LegalHoldEmailRecord,
		LegalHoldNotice,
		IngestionProvider,
		PaginatedExportJobs,
		SafeIngestionSource,
	} from '@open-archiver/types';

	let { data }: { data: PageData } = $props();
	let cases = $state<ComplianceCase[]>(data.cases);
	let caseSummaries = $state<ComplianceCaseSummary[]>(data.caseSummaries || []);
	let custodians = $state<Custodian[]>(data.custodians);
	let holds = $state<LegalHold[]>(data.holds);
	let ingestionSources = $state<SafeIngestionSource[]>(data.ingestionSources);
	let exportJobs = $state<PaginatedExportJobs>(data.exportJobs);

	let isCaseDialogOpen = $state(false);
	let isCustodianDialogOpen = $state(false);
	let isHoldDialogOpen = $state(false);
	let isEditHoldDialogOpen = $state(false);
	let isHoldEmailsDialogOpen = $state(false);
	let isHoldNoticesDialogOpen = $state(false);
	let isExportDialogOpen = $state(false);

	let caseName = $state('');
	let caseDescription = $state('');

	let custodianEmail = $state('');
	let custodianDisplayName = $state('');
	let custodianSourceType = $state<IngestionProvider>('generic_imap');

	let holdCaseId = $state('');
	let holdCustodianId = $state('');
	let holdReason = $state('');
	let holdIngestionSourceId = $state('');
	let holdUserEmail = $state('');
	let holdSenderEmail = $state('');
	let holdSubjectContains = $state('');
	let holdStartDate = $state('');
	let holdEndDate = $state('');
	const noneCustodianValue = '__none__';

	let editingHoldId = $state<string | null>(null);
	let editCustodianId = $state('');
	let editReason = $state('');
	let editIngestionSourceId = $state('');
	let editUserEmail = $state('');
	let editSenderEmail = $state('');
	let editSubjectContains = $state('');
	let editStartDate = $state('');
	let editEndDate = $state('');

	let holdEmails = $state<LegalHoldEmailRecord[]>([]);
	let holdEmailsPage = $state(1);
	let holdEmailsLimit = $state(25);
	let holdEmailsTotal = $state(0);
	let activeHoldForEmails = $state<LegalHold | null>(null);

	let holdNotices = $state<LegalHoldNotice[]>([]);
	let activeHoldForNotices = $state<LegalHold | null>(null);
	let noticeCustodianId = $state('');
	let noticeChannel = $state('manual');
	let noticeNotes = $state('');

	let exportFormat = $state<'eml' | 'mbox' | 'json'>('eml');
	let exportScope = $state<'hold' | 'case'>('hold');
	let exportHoldId = $state('');
	let exportCaseId = $state('');

	$effect(() => {
		if (!holdCaseId && cases.length > 0) {
			holdCaseId = cases[0].id;
		}
		if (!holdCustodianId) {
			holdCustodianId = noneCustodianValue;
		}
		if (!exportHoldId && holds.length > 0) {
			exportHoldId = holds[0].id;
		}
		if (!exportCaseId && cases.length > 0) {
			exportCaseId = cases[0].id;
		}
		if (!noticeCustodianId && custodians.length > 0) {
			noticeCustodianId = custodians[0].id;
		}
		if (!editCustodianId) {
			editCustodianId = noneCustodianValue;
		}
	});

	const resetHoldForm = () => {
		holdReason = '';
		holdIngestionSourceId = '';
		holdUserEmail = '';
		holdSenderEmail = '';
		holdSubjectContains = '';
		holdStartDate = '';
		holdEndDate = '';
	};

	const resetEditHoldForm = () => {
		editCustodianId = noneCustodianValue;
		editReason = '';
		editIngestionSourceId = '';
		editUserEmail = '';
		editSenderEmail = '';
		editSubjectContains = '';
		editStartDate = '';
		editEndDate = '';
	};

	const toIsoDate = (value: string) => {
		if (!value) return undefined;
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
	};

	const buildCriteria = (): LegalHoldCriteria | undefined => {
		const criteria: LegalHoldCriteria = {};
		if (holdIngestionSourceId) criteria.ingestionSourceId = holdIngestionSourceId;
		if (holdUserEmail) criteria.userEmail = holdUserEmail.trim();
		if (holdSenderEmail) criteria.senderEmail = holdSenderEmail.trim();
		if (holdSubjectContains) criteria.subjectContains = holdSubjectContains.trim();
		const startIso = toIsoDate(holdStartDate);
		const endIso = toIsoDate(holdEndDate);
		if (startIso) criteria.startDate = startIso;
		if (endIso) criteria.endDate = endIso;
		return Object.keys(criteria).length > 0 ? criteria : undefined;
	};

	const buildEditCriteria = (): LegalHoldCriteria | undefined => {
		const criteria: LegalHoldCriteria = {};
		if (editIngestionSourceId) criteria.ingestionSourceId = editIngestionSourceId;
		if (editUserEmail) criteria.userEmail = editUserEmail.trim();
		if (editSenderEmail) criteria.senderEmail = editSenderEmail.trim();
		if (editSubjectContains) criteria.subjectContains = editSubjectContains.trim();
		const startIso = toIsoDate(editStartDate);
		const endIso = toIsoDate(editEndDate);
		if (startIso) criteria.startDate = startIso;
		if (endIso) criteria.endDate = endIso;
		return Object.keys(criteria).length > 0 ? criteria : undefined;
	};

	const caseSummaryById = (caseId: string) =>
		caseSummaries.find((summary) => summary.caseId === caseId);

	const refreshCaseSummaries = async () => {
		const response = await api('/compliance/cases/summary');
		const body = await response.json();
		if (!response.ok) {
			throw new Error(body.message || 'Failed to refresh case summaries');
		}
		caseSummaries = body;
	};

	const refreshHolds = async () => {
		const response = await api('/compliance/legal-holds');
		const body = await response.json();
		if (!response.ok) {
			throw new Error(body.message || 'Failed to refresh legal holds');
		}
		holds = body;
	};

	const createCase = async () => {
		try {
			const response = await api('/compliance/cases', {
				method: 'POST',
				body: JSON.stringify({
					name: caseName.trim(),
					description: caseDescription.trim() || null,
				}),
			});
			const body = await response.json();
			if (!response.ok) {
				throw new Error(body.message || 'Failed to create case');
			}
			cases = [body, ...cases];
			caseName = '';
			caseDescription = '';
			isCaseDialogOpen = false;
		} catch (error) {
			setAlert({
				type: 'error',
				title: $t('app.legal_holds_page.create_case'),
				message: error instanceof Error ? error.message : String(error),
				duration: 5000,
				show: true,
			});
		}
	};

	const createCustodian = async () => {
		try {
			const response = await api('/compliance/custodians', {
				method: 'POST',
				body: JSON.stringify({
					email: custodianEmail.trim(),
					displayName: custodianDisplayName.trim() || null,
					sourceType: custodianSourceType,
				}),
			});
			const body = await response.json();
			if (!response.ok) {
				throw new Error(body.message || 'Failed to create custodian');
			}
			custodians = [body, ...custodians];
			custodianEmail = '';
			custodianDisplayName = '';
			isCustodianDialogOpen = false;
		} catch (error) {
			setAlert({
				type: 'error',
				title: $t('app.legal_holds_page.create_custodian'),
				message: error instanceof Error ? error.message : String(error),
				duration: 5000,
				show: true,
			});
		}
	};

	const createHold = async () => {
		try {
			const custodianId =
				holdCustodianId && holdCustodianId !== noneCustodianValue ? holdCustodianId : null;
			const response = await api('/compliance/legal-holds', {
				method: 'POST',
				body: JSON.stringify({
					caseId: holdCaseId,
					custodianId,
					holdCriteria: buildCriteria() || null,
					reason: holdReason.trim() || null,
				}),
			});
			const body = await response.json();
			if (!response.ok) {
				throw new Error(body.message || 'Failed to create legal hold');
			}
			try {
				await refreshHolds();
				await refreshCaseSummaries();
			} catch (refreshError) {
				setAlert({
					type: 'error',
					title: $t('app.legal_holds_page.create_hold'),
					message:
						refreshError instanceof Error ? refreshError.message : String(refreshError),
					duration: 5000,
					show: true,
				});
			}
			holdReason = '';
			resetHoldForm();
			isHoldDialogOpen = false;
		} catch (error) {
			setAlert({
				type: 'error',
				title: $t('app.legal_holds_page.create_hold'),
				message: error instanceof Error ? error.message : String(error),
				duration: 5000,
				show: true,
			});
		}
	};

	const updateHold = async () => {
		if (!editingHoldId) return;
		try {
			const custodianId =
				editCustodianId && editCustodianId !== noneCustodianValue ? editCustodianId : null;
			const response = await api(`/compliance/legal-holds/${editingHoldId}`, {
				method: 'PATCH',
				body: JSON.stringify({
					custodianId,
					holdCriteria: buildEditCriteria() || null,
					reason: editReason.trim() || null,
				}),
			});
			const body = await response.json();
			if (!response.ok) {
				throw new Error(body.message || 'Failed to update legal hold');
			}
			try {
				await refreshHolds();
				await refreshCaseSummaries();
			} catch (refreshError) {
				setAlert({
					type: 'error',
					title: $t('app.legal_holds_page.update_hold'),
					message:
						refreshError instanceof Error ? refreshError.message : String(refreshError),
					duration: 5000,
					show: true,
				});
			}
			resetEditHoldForm();
			editingHoldId = null;
			isEditHoldDialogOpen = false;
		} catch (error) {
			setAlert({
				type: 'error',
				title: $t('app.legal_holds_page.update_hold'),
				message: error instanceof Error ? error.message : String(error),
				duration: 5000,
				show: true,
			});
		}
	};

	const releaseHold = async (holdId: string) => {
		try {
			const response = await api(`/compliance/legal-holds/${holdId}/release`, {
				method: 'POST',
			});
			const body = await response.json();
			if (!response.ok) {
				throw new Error(body.message || 'Failed to release legal hold');
			}
			try {
				await refreshHolds();
				await refreshCaseSummaries();
			} catch (refreshError) {
				setAlert({
					type: 'error',
					title: $t('app.legal_holds_page.hold_release'),
					message:
						refreshError instanceof Error ? refreshError.message : String(refreshError),
					duration: 5000,
					show: true,
				});
			}
		} catch (error) {
			setAlert({
				type: 'error',
				title: $t('app.legal_holds_page.hold_release'),
				message: error instanceof Error ? error.message : String(error),
				duration: 5000,
				show: true,
			});
		}
	};

	const openEditHold = (hold: LegalHold) => {
		editingHoldId = hold.id;
		editCustodianId = hold.custodianId || noneCustodianValue;
		editReason = hold.reason || '';
		editIngestionSourceId = hold.holdCriteria?.ingestionSourceId || '';
		editUserEmail = hold.holdCriteria?.userEmail || '';
		editSenderEmail = hold.holdCriteria?.senderEmail || '';
		editSubjectContains = hold.holdCriteria?.subjectContains || '';
		editStartDate = hold.holdCriteria?.startDate
			? new Date(hold.holdCriteria.startDate).toISOString().slice(0, 10)
			: '';
		editEndDate = hold.holdCriteria?.endDate
			? new Date(hold.holdCriteria.endDate).toISOString().slice(0, 10)
			: '';
		isEditHoldDialogOpen = true;
	};

	const openHoldEmails = async (hold: LegalHold) => {
		try {
			activeHoldForEmails = hold;
			const response = await api(
				`/compliance/legal-holds/${hold.id}/emails?page=${holdEmailsPage}&limit=${holdEmailsLimit}`
			);
			const body = await response.json();
			if (!response.ok) {
				throw new Error(body.message || 'Failed to load legal hold emails');
			}
			holdEmails = body.items || [];
			holdEmailsTotal = body.total || 0;
			isHoldEmailsDialogOpen = true;
		} catch (error) {
			setAlert({
				type: 'error',
				title: $t('app.legal_holds_page.hold_emails'),
				message: error instanceof Error ? error.message : String(error),
				duration: 5000,
				show: true,
			});
		}
	};

	const openHoldNotices = async (hold: LegalHold) => {
		try {
			activeHoldForNotices = hold;
			const response = await api(`/compliance/legal-holds/${hold.id}/notices`);
			const body = await response.json();
			if (!response.ok) {
				throw new Error(body.message || 'Failed to load legal hold notices');
			}
			holdNotices = body || [];
			isHoldNoticesDialogOpen = true;
		} catch (error) {
			setAlert({
				type: 'error',
				title: $t('app.legal_holds_page.hold_notices'),
				message: error instanceof Error ? error.message : String(error),
				duration: 5000,
				show: true,
			});
		}
	};

	const sendNotice = async () => {
		if (!activeHoldForNotices) return;
		try {
			const response = await api(
				`/compliance/legal-holds/${activeHoldForNotices.id}/notices`,
				{
					method: 'POST',
					body: JSON.stringify({
						custodianId: noticeCustodianId || null,
						channel: noticeChannel,
						notes: noticeNotes.trim() || null,
					}),
				}
			);
			const body = await response.json();
			if (!response.ok) {
				throw new Error(body.message || 'Failed to send notice');
			}
			holdNotices = [body, ...holdNotices];
			noticeNotes = '';
		} catch (error) {
			setAlert({
				type: 'error',
				title: $t('app.legal_holds_page.send_notice'),
				message: error instanceof Error ? error.message : String(error),
				duration: 5000,
				show: true,
			});
		}
	};

	const acknowledgeNotice = async (notice: LegalHoldNotice) => {
		if (!activeHoldForNotices) return;
		try {
			const response = await api(
				`/compliance/legal-holds/${activeHoldForNotices.id}/notices/${notice.id}/acknowledge`,
				{ method: 'POST', body: JSON.stringify({ notes: notice.notes || null }) }
			);
			const body = await response.json();
			if (!response.ok) {
				throw new Error(body.message || 'Failed to acknowledge notice');
			}
			holdNotices = holdNotices.map((entry) => (entry.id === notice.id ? body : entry));
		} catch (error) {
			setAlert({
				type: 'error',
				title: $t('app.legal_holds_page.acknowledge_notice'),
				message: error instanceof Error ? error.message : String(error),
				duration: 5000,
				show: true,
			});
		}
	};

	const toggleCaseStatus = async (complianceCase: ComplianceCase) => {
		try {
			const nextStatus = complianceCase.status === 'open' ? 'closed' : 'open';
			const response = await api(`/compliance/cases/${complianceCase.id}`, {
				method: 'PATCH',
				body: JSON.stringify({ status: nextStatus }),
			});
			const body = await response.json();
			if (!response.ok) {
				throw new Error(body.message || 'Failed to update case');
			}
			cases = cases.map((entry) => (entry.id === complianceCase.id ? body : entry));
		} catch (error) {
			setAlert({
				type: 'error',
				title: $t('app.legal_holds_page.update_case'),
				message: error instanceof Error ? error.message : String(error),
				duration: 5000,
				show: true,
			});
		}
	};

	const createExportJob = async () => {
		try {
			const query =
				exportScope === 'case' ? { caseId: exportCaseId } : { holdId: exportHoldId };
			const response = await api('/compliance/export-jobs', {
				method: 'POST',
				body: JSON.stringify({
					format: exportFormat,
					caseId: exportScope === 'case' ? exportCaseId : null,
					query,
				}),
			});
			const body = await response.json();
			if (!response.ok) {
				throw new Error(body.message || 'Failed to create export job');
			}
			exportJobs = {
				...exportJobs,
				items: [body, ...exportJobs.items],
				total: exportJobs.total + 1,
			};
			isExportDialogOpen = false;
		} catch (error) {
			setAlert({
				type: 'error',
				title: $t('app.legal_holds_page.create_export'),
				message: error instanceof Error ? error.message : String(error),
				duration: 5000,
				show: true,
			});
		}
	};

	const formatCriteria = (criteria: LegalHoldCriteria | null | undefined) => {
		if (!criteria || Object.keys(criteria).length === 0) {
			return '-';
		}
		return JSON.stringify(criteria);
	};

	const statusLabel = (hold: LegalHold) =>
		hold.removedAt
			? $t('app.legal_holds_page.hold_released')
			: $t('app.legal_holds_page.hold_active');
</script>

<svelte:head>
	<title>{$t('app.legal_holds_page.title')} - Open Archiver</title>
</svelte:head>

<div class="space-y-8">
	<h1 class="text-2xl font-bold">{$t('app.legal_holds_page.header')}</h1>

	<section class="space-y-3">
		<div class="flex items-center justify-between">
			<h2 class="text-lg font-semibold">{$t('app.legal_holds_page.cases')}</h2>
			<Button onclick={() => (isCaseDialogOpen = true)}
				>{$t('app.legal_holds_page.create_case')}</Button
			>
		</div>
		<div class="rounded-md border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{$t('app.legal_holds_page.case_name')}</Table.Head>
						<Table.Head>{$t('app.legal_holds_page.case_description')}</Table.Head>
						<Table.Head>{$t('app.legal_holds_page.hold_status')}</Table.Head>
						<Table.Head>{$t('app.legal_holds_page.case_counts')}</Table.Head>
						<Table.Head class="text-right"
							>{$t('app.legal_holds_page.actions')}</Table.Head
						>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#if cases.length > 0}
						{#each cases as complianceCase}
							{@const summary = caseSummaryById(complianceCase.id)}
							<Table.Row>
								<Table.Cell>{complianceCase.name}</Table.Cell>
								<Table.Cell>{complianceCase.description || '-'}</Table.Cell>
								<Table.Cell>{complianceCase.status}</Table.Cell>
								<Table.Cell>
									<span class="text-muted-foreground text-xs">
										{$t('app.legal_holds_page.case_holds_count', {
											active: summary?.activeHoldCount ?? 0,
											total: summary?.totalHoldCount ?? 0,
										} as any)}
									</span>
									<span class="text-muted-foreground text-xs">
										{$t('app.legal_holds_page.case_emails_count', {
											active: summary?.activeEmailCount ?? 0,
											total: summary?.totalEmailCount ?? 0,
										} as any)}
									</span>
								</Table.Cell>
								<Table.Cell class="text-right">
									<Button
										variant="outline"
										onclick={() => toggleCaseStatus(complianceCase)}
									>
										{complianceCase.status === 'open'
											? $t('app.legal_holds_page.case_close')
											: $t('app.legal_holds_page.case_reopen')}
									</Button>
								</Table.Cell>
							</Table.Row>
						{/each}
					{:else}
						<Table.Row>
							<Table.Cell colspan={5} class="text-center"
								>{$t('app.legal_holds_page.no_cases_found')}</Table.Cell
							>
						</Table.Row>
					{/if}
				</Table.Body>
			</Table.Root>
		</div>
	</section>

	<section class="space-y-3">
		<div class="flex items-center justify-between">
			<h2 class="text-lg font-semibold">{$t('app.legal_holds_page.custodians')}</h2>
			<Button onclick={() => (isCustodianDialogOpen = true)}
				>{$t('app.legal_holds_page.create_custodian')}</Button
			>
		</div>
		<div class="rounded-md border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{$t('app.legal_holds_page.custodian_email')}</Table.Head>
						<Table.Head>{$t('app.legal_holds_page.custodian_display_name')}</Table.Head>
						<Table.Head>{$t('app.legal_holds_page.custodian_source_type')}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#if custodians.length > 0}
						{#each custodians as custodian}
							<Table.Row>
								<Table.Cell>{custodian.email}</Table.Cell>
								<Table.Cell>{custodian.displayName || '-'}</Table.Cell>
								<Table.Cell>{custodian.sourceType}</Table.Cell>
							</Table.Row>
						{/each}
					{:else}
						<Table.Row>
							<Table.Cell colspan={3} class="text-center"
								>{$t('app.legal_holds_page.no_custodians_found')}</Table.Cell
							>
						</Table.Row>
					{/if}
				</Table.Body>
			</Table.Root>
		</div>
	</section>

	<section class="space-y-3">
		<div class="flex items-center justify-between">
			<h2 class="text-lg font-semibold">{$t('app.legal_holds_page.holds')}</h2>
			<Button onclick={() => (isHoldDialogOpen = true)}
				>{$t('app.legal_holds_page.create_hold')}</Button
			>
		</div>
		<div class="rounded-md border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{$t('app.legal_holds_page.hold_case')}</Table.Head>
						<Table.Head>{$t('app.legal_holds_page.hold_custodian')}</Table.Head>
						<Table.Head>{$t('app.legal_holds_page.hold_criteria')}</Table.Head>
						<Table.Head>{$t('app.legal_holds_page.hold_status')}</Table.Head>
						<Table.Head>{$t('app.legal_holds_page.hold_emails')}</Table.Head>
						<Table.Head>{$t('app.legal_holds_page.hold_applied_at')}</Table.Head>
						<Table.Head>{$t('app.legal_holds_page.hold_removed_at')}</Table.Head>
						<Table.Head class="text-right"
							>{$t('app.legal_holds_page.actions')}</Table.Head
						>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#if holds.length > 0}
						{#each holds as hold}
							<Table.Row>
								<Table.Cell>{hold.ediscoveryCase?.name || '-'}</Table.Cell>
								<Table.Cell>{hold.custodian?.email || '-'}</Table.Cell>
								<Table.Cell class="max-w-72 truncate text-xs">
									{formatCriteria(hold.holdCriteria)}
								</Table.Cell>
								<Table.Cell>
									<Badge variant={hold.removedAt ? 'secondary' : 'default'}>
										{statusLabel(hold)}
									</Badge>
								</Table.Cell>
								<Table.Cell>
									<span class="text-muted-foreground text-xs">
										{$t('app.legal_holds_page.hold_emails_count', {
											active: hold.activeEmailCount ?? 0,
											total: hold.emailCount ?? 0,
										} as any)}
									</span>
								</Table.Cell>
								<Table.Cell>
									{new Date(hold.appliedAt).toLocaleString()}
								</Table.Cell>
								<Table.Cell>
									{hold.removedAt
										? new Date(hold.removedAt).toLocaleString()
										: '-'}
								</Table.Cell>
								<Table.Cell class="text-right">
									<div class="flex justify-end gap-2">
										<Button
											variant="outline"
											size="sm"
											onclick={() => openHoldEmails(hold)}
										>
											{$t('app.legal_holds_page.hold_emails')}
										</Button>
										<Button
											variant="outline"
											size="sm"
											onclick={() => openHoldNotices(hold)}
										>
											{$t('app.legal_holds_page.hold_notices')}
										</Button>
										<Button
											variant="outline"
											size="sm"
											onclick={() => openEditHold(hold)}
										>
											{$t('app.legal_holds_page.edit_hold')}
										</Button>
										{#if !hold.removedAt}
											<Button
												variant="destructive"
												size="sm"
												onclick={() => releaseHold(hold.id)}
											>
												{$t('app.legal_holds_page.hold_release')}
											</Button>
										{/if}
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					{:else}
						<Table.Row>
							<Table.Cell colspan={8} class="text-center"
								>{$t('app.legal_holds_page.no_holds_found')}</Table.Cell
							>
						</Table.Row>
					{/if}
				</Table.Body>
			</Table.Root>
		</div>
	</section>

	<section class="space-y-3">
		<div class="flex items-center justify-between">
			<h2 class="text-lg font-semibold">{$t('app.legal_holds_page.exports')}</h2>
			<Button onclick={() => (isExportDialogOpen = true)}
				>{$t('app.legal_holds_page.create_export')}</Button
			>
		</div>
		<div class="rounded-md border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{$t('app.legal_holds_page.export_format')}</Table.Head>
						<Table.Head>{$t('app.legal_holds_page.export_status')}</Table.Head>
						<Table.Head>{$t('app.legal_holds_page.export_scope')}</Table.Head>
						<Table.Head>{$t('app.legal_holds_page.export_created')}</Table.Head>
						<Table.Head>{$t('app.legal_holds_page.export_completed')}</Table.Head>
						<Table.Head class="text-right"
							>{$t('app.legal_holds_page.actions')}</Table.Head
						>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#if exportJobs.items && exportJobs.items.length > 0}
						{#each exportJobs.items as job}
							<Table.Row>
								<Table.Cell>{job.format}</Table.Cell>
								<Table.Cell>
									<Badge
										variant={job.status === 'completed'
											? 'secondary'
											: 'default'}
									>
										{job.status}
									</Badge>
								</Table.Cell>
								<Table.Cell>
									{job.query?.holdId || job.query?.caseId || '-'}
								</Table.Cell>
								<Table.Cell>{new Date(job.createdAt).toLocaleString()}</Table.Cell>
								<Table.Cell>
									{job.completedAt
										? new Date(job.completedAt).toLocaleString()
										: '-'}
								</Table.Cell>
								<Table.Cell class="text-right">
									{#if job.status === 'completed' && job.filePath}
										<a
											href={`/api/v1/compliance/export-jobs/${job.id}/download`}
										>
											<Button variant="outline" size="sm">
												{$t('app.legal_holds_page.export_download')}
											</Button>
										</a>
									{:else}
										<span class="text-muted-foreground text-xs">-</span>
									{/if}
								</Table.Cell>
							</Table.Row>
						{/each}
					{:else}
						<Table.Row>
							<Table.Cell colspan={6} class="text-center"
								>{$t('app.legal_holds_page.no_exports_found')}</Table.Cell
							>
						</Table.Row>
					{/if}
				</Table.Body>
			</Table.Root>
		</div>
	</section>
</div>

<Dialog.Root bind:open={isCaseDialogOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{$t('app.legal_holds_page.create_case')}</Dialog.Title>
		</Dialog.Header>
		<div class="space-y-3">
			<Input bind:value={caseName} placeholder={$t('app.legal_holds_page.case_name')} />
			<Textarea
				bind:value={caseDescription}
				placeholder={$t('app.legal_holds_page.case_description')}
			/>
		</div>
		<Dialog.Footer>
			<Button onclick={createCase}>{$t('app.components.common.save')}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={isEditHoldDialogOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{$t('app.legal_holds_page.edit_hold')}</Dialog.Title>
		</Dialog.Header>
		<div class="space-y-3">
			<Select.Root type="single" bind:value={editCustodianId}>
				<Select.Trigger class="w-full">
					{editCustodianId === noneCustodianValue
						? '-'
						: custodians.find((c) => c.id === editCustodianId)?.email ||
							$t('app.legal_holds_page.hold_custodian')}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value={noneCustodianValue}>-</Select.Item>
					{#each custodians as custodian}
						<Select.Item value={custodian.id}>{custodian.email}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
			<Select.Root type="single" bind:value={editIngestionSourceId}>
				<Select.Trigger class="w-full">
					{ingestionSources.find((s) => s.id === editIngestionSourceId)?.name ||
						$t('app.legal_holds_page.hold_ingestion_source')}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="">-</Select.Item>
					{#each ingestionSources as source}
						<Select.Item value={source.id}>{source.name}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
			<Input
				bind:value={editUserEmail}
				placeholder={$t('app.legal_holds_page.hold_user_email')}
			/>
			<Input
				bind:value={editSenderEmail}
				placeholder={$t('app.legal_holds_page.hold_sender_email')}
			/>
			<Input
				bind:value={editSubjectContains}
				placeholder={$t('app.legal_holds_page.hold_subject_contains')}
			/>
			<div class="grid grid-cols-2 gap-2">
				<Input type="date" bind:value={editStartDate} />
				<Input type="date" bind:value={editEndDate} />
			</div>
			<Textarea
				bind:value={editReason}
				placeholder={$t('app.legal_holds_page.hold_reason')}
			/>
		</div>
		<Dialog.Footer>
			<Button onclick={updateHold}>{$t('app.components.common.save')}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={isHoldEmailsDialogOpen}>
	<Dialog.Content class="sm:max-w-4xl">
		<Dialog.Header>
			<Dialog.Title>{$t('app.legal_holds_page.hold_emails')}</Dialog.Title>
			<Dialog.Description>
				{activeHoldForEmails?.ediscoveryCase?.name || activeHoldForEmails?.id}
			</Dialog.Description>
		</Dialog.Header>
		<div class="rounded-md border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{$t('app.legal_holds_page.email_subject')}</Table.Head>
						<Table.Head>{$t('app.legal_holds_page.email_sender')}</Table.Head>
						<Table.Head>{$t('app.legal_holds_page.email_user')}</Table.Head>
						<Table.Head>{$t('app.legal_holds_page.email_matched')}</Table.Head>
						<Table.Head>{$t('app.legal_holds_page.email_status')}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#if holdEmails.length > 0}
						{#each holdEmails as record}
							<Table.Row>
								<Table.Cell>{record.email?.subject || '-'}</Table.Cell>
								<Table.Cell>{record.email?.senderEmail || '-'}</Table.Cell>
								<Table.Cell>{record.email?.userEmail || '-'}</Table.Cell>
								<Table.Cell
									>{new Date(record.matchedAt).toLocaleString()}</Table.Cell
								>
								<Table.Cell>
									{record.removedAt
										? $t('app.legal_holds_page.hold_released')
										: $t('app.legal_holds_page.hold_active')}
								</Table.Cell>
							</Table.Row>
						{/each}
					{:else}
						<Table.Row>
							<Table.Cell colspan={5} class="text-center">
								{$t('app.legal_holds_page.no_hold_emails')}
							</Table.Cell>
						</Table.Row>
					{/if}
				</Table.Body>
			</Table.Root>
		</div>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={isHoldNoticesDialogOpen}>
	<Dialog.Content class="sm:max-w-3xl">
		<Dialog.Header>
			<Dialog.Title>{$t('app.legal_holds_page.hold_notices')}</Dialog.Title>
			<Dialog.Description>
				{activeHoldForNotices?.ediscoveryCase?.name || activeHoldForNotices?.id}
			</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-4">
			<div class="space-y-2">
				<Select.Root type="single" bind:value={noticeCustodianId}>
					<Select.Trigger class="w-full">
						{custodians.find((c) => c.id === noticeCustodianId)?.email ||
							$t('app.legal_holds_page.hold_custodian')}
					</Select.Trigger>
					<Select.Content>
						{#each custodians as custodian}
							<Select.Item value={custodian.id}>{custodian.email}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
				<Input
					bind:value={noticeChannel}
					placeholder={$t('app.legal_holds_page.notice_channel')}
				/>
				<Textarea
					bind:value={noticeNotes}
					placeholder={$t('app.legal_holds_page.notice_notes')}
				/>
				<Button onclick={sendNotice}>{$t('app.legal_holds_page.send_notice')}</Button>
			</div>
			<div class="rounded-md border">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{$t('app.legal_holds_page.notice_custodian')}</Table.Head>
							<Table.Head>{$t('app.legal_holds_page.notice_channel')}</Table.Head>
							<Table.Head>{$t('app.legal_holds_page.notice_sent')}</Table.Head>
							<Table.Head>{$t('app.legal_holds_page.notice_ack')}</Table.Head>
							<Table.Head class="text-right"
								>{$t('app.legal_holds_page.actions')}</Table.Head
							>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#if holdNotices.length > 0}
							{#each holdNotices as notice}
								<Table.Row>
									<Table.Cell>{notice.custodian?.email || '-'}</Table.Cell>
									<Table.Cell>{notice.channel}</Table.Cell>
									<Table.Cell
										>{new Date(notice.sentAt).toLocaleString()}</Table.Cell
									>
									<Table.Cell>
										{notice.acknowledgedAt
											? new Date(notice.acknowledgedAt).toLocaleString()
											: $t('app.legal_holds_page.notice_pending')}
									</Table.Cell>
									<Table.Cell class="text-right">
										{#if !notice.acknowledgedAt}
											<Button
												variant="outline"
												size="sm"
												onclick={() => acknowledgeNotice(notice)}
											>
												{$t('app.legal_holds_page.acknowledge_notice')}
											</Button>
										{:else}
											<span class="text-muted-foreground text-xs">-</span>
										{/if}
									</Table.Cell>
								</Table.Row>
							{/each}
						{:else}
							<Table.Row>
								<Table.Cell colspan={5} class="text-center">
									{$t('app.legal_holds_page.no_notices_found')}
								</Table.Cell>
							</Table.Row>
						{/if}
					</Table.Body>
				</Table.Root>
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={isExportDialogOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{$t('app.legal_holds_page.create_export')}</Dialog.Title>
		</Dialog.Header>
		<div class="space-y-3">
			<Select.Root type="single" bind:value={exportScope}>
				<Select.Trigger class="w-full">
					{exportScope === 'case'
						? $t('app.legal_holds_page.export_scope_case')
						: $t('app.legal_holds_page.export_scope_hold')}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="hold"
						>{$t('app.legal_holds_page.export_scope_hold')}</Select.Item
					>
					<Select.Item value="case"
						>{$t('app.legal_holds_page.export_scope_case')}</Select.Item
					>
				</Select.Content>
			</Select.Root>
			{#if exportScope === 'case'}
				<Select.Root type="single" bind:value={exportCaseId}>
					<Select.Trigger class="w-full">
						{cases.find((c) => c.id === exportCaseId)?.name ||
							$t('app.legal_holds_page.export_case')}
					</Select.Trigger>
					<Select.Content>
						{#each cases as complianceCase}
							<Select.Item value={complianceCase.id}
								>{complianceCase.name}</Select.Item
							>
						{/each}
					</Select.Content>
				</Select.Root>
			{:else}
				<Select.Root type="single" bind:value={exportHoldId}>
					<Select.Trigger class="w-full">
						{holds.find((h) => h.id === exportHoldId)?.ediscoveryCase?.name ||
							$t('app.legal_holds_page.export_hold')}
					</Select.Trigger>
					<Select.Content>
						{#each holds as hold}
							<Select.Item value={hold.id}
								>{hold.ediscoveryCase?.name || hold.id}</Select.Item
							>
						{/each}
					</Select.Content>
				</Select.Root>
			{/if}
			<Select.Root type="single" bind:value={exportFormat}>
				<Select.Trigger class="w-full">
					{exportFormat}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="eml">EML</Select.Item>
					<Select.Item value="mbox">MBOX</Select.Item>
					<Select.Item value="json">JSON</Select.Item>
				</Select.Content>
			</Select.Root>
		</div>
		<Dialog.Footer>
			<Button onclick={createExportJob}>{$t('app.components.common.save')}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={isCustodianDialogOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{$t('app.legal_holds_page.create_custodian')}</Dialog.Title>
		</Dialog.Header>
		<div class="space-y-3">
			<Input
				bind:value={custodianEmail}
				placeholder={$t('app.legal_holds_page.custodian_email')}
			/>
			<Input
				bind:value={custodianDisplayName}
				placeholder={$t('app.legal_holds_page.custodian_display_name')}
			/>
			<Select.Root type="single" bind:value={custodianSourceType}>
				<Select.Trigger class="w-full">
					{custodianSourceType}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="generic_imap">generic_imap</Select.Item>
					<Select.Item value="google_workspace">google_workspace</Select.Item>
					<Select.Item value="microsoft_365">microsoft_365</Select.Item>
					<Select.Item value="pst_import">pst_import</Select.Item>
					<Select.Item value="eml_import">eml_import</Select.Item>
					<Select.Item value="mbox_import">mbox_import</Select.Item>
				</Select.Content>
			</Select.Root>
		</div>
		<Dialog.Footer>
			<Button onclick={createCustodian}>{$t('app.components.common.save')}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={isHoldDialogOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{$t('app.legal_holds_page.create_hold')}</Dialog.Title>
		</Dialog.Header>
		<div class="space-y-3">
			<Select.Root type="single" bind:value={holdCaseId}>
				<Select.Trigger class="w-full">
					{cases.find((c) => c.id === holdCaseId)?.name ||
						$t('app.legal_holds_page.hold_case')}
				</Select.Trigger>
				<Select.Content>
					{#each cases as complianceCase}
						<Select.Item value={complianceCase.id}>{complianceCase.name}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
			<Select.Root type="single" bind:value={holdCustodianId}>
				<Select.Trigger class="w-full">
					{holdCustodianId === noneCustodianValue
						? '-'
						: custodians.find((c) => c.id === holdCustodianId)?.email ||
							$t('app.legal_holds_page.hold_custodian')}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value={noneCustodianValue}>-</Select.Item>
					{#each custodians as custodian}
						<Select.Item value={custodian.id}>{custodian.email}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
			<Select.Root type="single" bind:value={holdIngestionSourceId}>
				<Select.Trigger class="w-full">
					{ingestionSources.find((s) => s.id === holdIngestionSourceId)?.name ||
						$t('app.legal_holds_page.hold_ingestion_source')}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="">-</Select.Item>
					{#each ingestionSources as source}
						<Select.Item value={source.id}>{source.name}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
			<Input
				bind:value={holdUserEmail}
				placeholder={$t('app.legal_holds_page.hold_user_email')}
			/>
			<Input
				bind:value={holdSenderEmail}
				placeholder={$t('app.legal_holds_page.hold_sender_email')}
			/>
			<Input
				bind:value={holdSubjectContains}
				placeholder={$t('app.legal_holds_page.hold_subject_contains')}
			/>
			<div class="grid grid-cols-2 gap-3">
				<Input type="date" bind:value={holdStartDate} />
				<Input type="date" bind:value={holdEndDate} />
			</div>
			<Textarea
				bind:value={holdReason}
				placeholder={$t('app.legal_holds_page.hold_reason')}
			/>
		</div>
		<Dialog.Footer>
			<Button onclick={createHold}>{$t('app.components.common.save')}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
