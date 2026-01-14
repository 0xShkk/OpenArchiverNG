<script lang="ts">
	import type { PageData } from './$types';
	import * as Card from '$lib/components/ui/card';
	import { t } from '$lib/translations';
	import { Badge, type BadgeVariant } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import * as Table from '$lib/components/ui/table';
	import { api } from '$lib/api.client';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte';
	import type { JobSchedule } from '@open-archiver/types';

	let { data }: { data: PageData } = $props();
	let queues = $derived(data.queues);
	let schedules = $state<JobSchedule[]>(data.schedules ?? []);
	let scheduleEdits = $state<Record<string, string>>({});
	let savingSchedules = $state<Record<string, boolean>>({});

	const syncScheduleEdits = (list: JobSchedule[]) => {
		scheduleEdits = Object.fromEntries(list.map((schedule) => [schedule.id, schedule.cron]));
	};

	$effect(() => {
		syncScheduleEdits(schedules);
	});

	const refreshSchedules = async () => {
		const response = await api('/jobs/schedules');
		if (!response.ok) {
			const errorBody = await response.json();
			setAlert({
				type: 'error',
				title: $t('app.jobs.failed_to_refresh'),
				message: errorBody.message || $t('app.jobs.failed_to_refresh'),
				duration: 5000,
				show: true,
			});
			return;
		}
		const responseBody = await response.json();
		schedules = responseBody.schedules;
	};

	const setSaving = (scheduleId: string, isSaving: boolean) => {
		savingSchedules = { ...savingSchedules, [scheduleId]: isSaving };
	};

	const handleCreate = async (schedule: JobSchedule) => {
		setSaving(schedule.id, true);
		try {
			const response = await api(`/jobs/schedules/${schedule.id}`, {
				method: 'POST',
				body: JSON.stringify({ cron: scheduleEdits[schedule.id] }),
			});
			if (!response.ok) {
				const errorBody = await response.json();
				setAlert({
					type: 'error',
					title: $t('app.jobs.failed_to_create'),
					message: errorBody.message || $t('app.jobs.failed_to_create'),
					duration: 5000,
					show: true,
				});
				return;
			}
			await refreshSchedules();
		} finally {
			setSaving(schedule.id, false);
		}
	};

	const handleUpdate = async (schedule: JobSchedule) => {
		setSaving(schedule.id, true);
		try {
			const response = await api(`/jobs/schedules/${schedule.id}`, {
				method: 'PATCH',
				body: JSON.stringify({
					cron: scheduleEdits[schedule.id],
				}),
			});
			if (!response.ok) {
				const errorBody = await response.json();
				setAlert({
					type: 'error',
					title: $t('app.jobs.failed_to_update'),
					message: errorBody.message || $t('app.jobs.failed_to_update'),
					duration: 5000,
					show: true,
				});
				return;
			}
			await refreshSchedules();
		} finally {
			setSaving(schedule.id, false);
		}
	};

	const handleToggle = async (schedule: JobSchedule, enabled: boolean) => {
		if (!schedule.configured && enabled) {
			await handleCreate(schedule);
			return;
		}
		if (!schedule.configured) {
			return;
		}
		setSaving(schedule.id, true);
		try {
			const response = await api(`/jobs/schedules/${schedule.id}`, {
				method: 'PATCH',
				body: JSON.stringify({ enabled }),
			});
			if (!response.ok) {
				const errorBody = await response.json();
				setAlert({
					type: 'error',
					title: $t('app.jobs.failed_to_update'),
					message: errorBody.message || $t('app.jobs.failed_to_update'),
					duration: 5000,
					show: true,
				});
				return;
			}
			await refreshSchedules();
		} finally {
			setSaving(schedule.id, false);
		}
	};

	const handleDelete = async (schedule: JobSchedule) => {
		setSaving(schedule.id, true);
		try {
			const response = await api(`/jobs/schedules/${schedule.id}`, { method: 'DELETE' });
			if (!response.ok) {
				const errorBody = await response.json();
				setAlert({
					type: 'error',
					title: $t('app.jobs.failed_to_delete'),
					message: errorBody.message || $t('app.jobs.failed_to_delete'),
					duration: 5000,
					show: true,
				});
				return;
			}
			await refreshSchedules();
		} finally {
			setSaving(schedule.id, false);
		}
	};

	const scheduleStatus = (schedule: JobSchedule): { label: string; variant: BadgeVariant } => {
		if (!schedule.configured) {
			return { label: $t('app.jobs.not_configured'), variant: 'secondary' };
		}
		if (schedule.enabled) {
			if (schedule.isScheduled) {
				return { label: $t('app.jobs.scheduled'), variant: 'default' };
			}
			if (schedule.eligible === false) {
				return { label: $t('app.jobs.waiting_for_sources'), variant: 'outline' };
			}
			return { label: $t('app.jobs.enabled'), variant: 'default' };
		}
		return { label: $t('app.jobs.disabled'), variant: 'secondary' };
	};

	const cronChanged = (schedule: JobSchedule) => scheduleEdits[schedule.id] !== schedule.cron;

	const scheduleName = (schedule: JobSchedule) =>
		schedule.id === 'ingestion:schedule-continuous-sync'
			? $t('app.jobs.schedule_continuous_sync')
			: schedule.jobName;
</script>

<svelte:head>
	<title>{$t('app.jobs.title')} - Open Archiver</title>
</svelte:head>

<div class="space-y-6">
	<h1 class="text-2xl font-bold">{$t('app.jobs.title')}</h1>

	<div class="space-y-2">
		<h2 class="text-xl font-semibold">{$t('app.jobs.schedules')}</h2>
		<div class="rounded-md border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{$t('app.jobs.name')}</Table.Head>
						<Table.Head>{$t('app.jobs.queue')}</Table.Head>
						<Table.Head>{$t('app.jobs.cron')}</Table.Head>
						<Table.Head>{$t('app.jobs.enabled')}</Table.Head>
						<Table.Head>{$t('app.jobs.status')}</Table.Head>
						<Table.Head>{$t('app.jobs.next_run')}</Table.Head>
						<Table.Head class="text-right">{$t('app.jobs.actions')}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#if schedules.length > 0}
						{#each schedules as schedule (schedule.id)}
							<Table.Row>
								<Table.Cell>{scheduleName(schedule)}</Table.Cell>
								<Table.Cell class="capitalize">{schedule.queueName}</Table.Cell>
								<Table.Cell>
									<Input
										class="min-w-48"
										bind:value={scheduleEdits[schedule.id]}
										disabled={savingSchedules[schedule.id]}
									/>
								</Table.Cell>
								<Table.Cell>
									<Switch
										checked={schedule.enabled}
										disabled={!schedule.configured ||
											savingSchedules[schedule.id]}
										onCheckedChange={(value) =>
											handleToggle(schedule, Boolean(value))}
									/>
								</Table.Cell>
								<Table.Cell>
									<Badge variant={scheduleStatus(schedule).variant}>
										{scheduleStatus(schedule).label}
									</Badge>
								</Table.Cell>
								<Table.Cell>
									{schedule.nextRunAt
										? new Date(schedule.nextRunAt).toLocaleString()
										: $t('app.jobs.not_scheduled')}
								</Table.Cell>
								<Table.Cell class="space-x-2 text-right">
									{#if schedule.configured}
										<Button
											size="sm"
											variant="secondary"
											disabled={savingSchedules[schedule.id] ||
												!cronChanged(schedule)}
											onclick={() => handleUpdate(schedule)}
										>
											{$t('app.jobs.save')}
										</Button>
										<Button
											size="sm"
											variant="destructive"
											disabled={savingSchedules[schedule.id]}
											onclick={() => handleDelete(schedule)}
										>
											{$t('app.jobs.delete')}
										</Button>
									{:else}
										<Button
											size="sm"
											disabled={savingSchedules[schedule.id]}
											onclick={() => handleCreate(schedule)}
										>
											{$t('app.jobs.create')}
										</Button>
									{/if}
								</Table.Cell>
							</Table.Row>
						{/each}
					{:else}
						<Table.Row>
							<Table.Cell class="h-8 text-center" colspan={7}>
								{$t('app.jobs.no_schedules')}
							</Table.Cell>
						</Table.Row>
					{/if}
				</Table.Body>
			</Table.Root>
		</div>
	</div>

	<div class="space-y-2">
		<h2 class="text-xl font-semibold">{$t('app.jobs.queues')}</h2>
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each queues as queue}
				<a href={`/dashboard/admin/jobs/${queue.name}`} class="block">
					<Card.Root class=" hover:shadow-md">
						<Card.Header>
							<Card.Title class="capitalize">
								{queue.name.split('_').join(' ')}
							</Card.Title>
						</Card.Header>
						<Card.Content class="grid grid-cols-2 gap-2">
							<div class="flex items-center justify-between">
								<span class="text-sm font-medium">{$t('app.jobs.active')}</span>
								<Badge>{queue.counts.active}</Badge>
							</div>
							<div class="flex items-center justify-between">
								<span class="text-sm font-medium">{$t('app.jobs.completed')}</span>
								<Badge variant="default" class="bg-green-500"
									>{queue.counts.completed}</Badge
								>
							</div>
							<div class="flex items-center justify-between">
								<span class="text-sm font-medium">{$t('app.jobs.failed')}</span>
								<Badge variant="destructive">{queue.counts.failed}</Badge>
							</div>
							<div class="flex items-center justify-between">
								<span class="text-sm font-medium">{$t('app.jobs.delayed')}</span>
								<Badge variant="secondary">{queue.counts.delayed}</Badge>
							</div>
							<div class="flex items-center justify-between">
								<span class="text-sm font-medium">{$t('app.jobs.waiting')}</span>
								<Badge variant="outline">{queue.counts.waiting}</Badge>
							</div>
							<div class="flex items-center justify-between">
								<span class="text-sm font-medium">{$t('app.jobs.paused')}</span>
								<Badge variant="secondary">{queue.counts.paused}</Badge>
							</div>
						</Card.Content>
					</Card.Root>
				</a>
			{/each}
		</div>
	</div>
</div>
