<script lang="ts">
	import type { PageData } from './$types';
	import type { PaginatedArchiveExportJobs } from '@open-archiver/types';
	import * as Table from '$lib/components/ui/table';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Button } from '$lib/components/ui/button';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import { api } from '$lib/api.client';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte';
	import { t } from '$lib/translations';

	let { data }: { data: PageData } = $props();
	let exportJobs = $state<PaginatedArchiveExportJobs>(data.exportJobs);
	let isDialogOpen = $state(false);
	let exportFormat = $state<'eml' | 'mbox' | 'json'>('eml');
	let isSubmitting = $state(false);

	const createExportJob = async () => {
		isSubmitting = true;
		try {
			const response = await api('/archive-exports', {
				method: 'POST',
				body: JSON.stringify({ format: exportFormat }),
			});
			const body = await response.json();
			if (!response.ok) {
				throw new Error(body.message || 'Failed to create archive export.');
			}
			exportJobs = {
				...exportJobs,
				items: [body, ...exportJobs.items],
				total: exportJobs.total + 1,
			};
			isDialogOpen = false;
			setAlert({
				type: 'success',
				title: $t('app.archive_exports.create_success'),
				message: '',
				duration: 4000,
				show: true,
			});
		} catch (error) {
			setAlert({
				type: 'error',
				title: $t('app.archive_exports.create_failed'),
				message: error instanceof Error ? error.message : String(error),
				duration: 5000,
				show: true,
			});
		} finally {
			isSubmitting = false;
		}
	};

	const formatLabel = (format: string) => {
		switch (format) {
			case 'mbox':
				return $t('app.archive_exports.format_mbox');
			case 'json':
				return $t('app.archive_exports.format_json');
			default:
				return $t('app.archive_exports.format_eml');
		}
	};
</script>

<div class="container mx-auto flex flex-col gap-6 p-6">
	<div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
		<div>
			<h1 class="text-2xl font-bold">{$t('app.archive_exports.title')}</h1>
			<p class="text-sm text-muted-foreground">
				{$t('app.archive_exports.snapshot_help')}
			</p>
		</div>
		<Button onclick={() => (isDialogOpen = true)}
			>{$t('app.archive_exports.create_export')}</Button
		>
	</div>

	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>{$t('app.archive_exports.format')}</Table.Head>
				<Table.Head>{$t('app.archive_exports.status')}</Table.Head>
				<Table.Head>{$t('app.archive_exports.snapshot_at')}</Table.Head>
				<Table.Head>{$t('app.archive_exports.created')}</Table.Head>
				<Table.Head>{$t('app.archive_exports.completed')}</Table.Head>
				<Table.Head>{$t('app.archive_exports.emails')}</Table.Head>
				<Table.Head>{$t('app.archive_exports.attachments')}</Table.Head>
				<Table.Head>{$t('app.archive_exports.download')}</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#if exportJobs.items && exportJobs.items.length > 0}
				{#each exportJobs.items as job}
					<Table.Row>
						<Table.Cell>{formatLabel(job.format)}</Table.Cell>
						<Table.Cell>
							<Badge>{job.status}</Badge>
							{#if job.errorMessage}
								<div class="text-xs text-destructive" title={job.errorMessage}>
									{job.errorMessage}
								</div>
							{/if}
						</Table.Cell>
						<Table.Cell>{new Date(job.snapshotAt).toLocaleString()}</Table.Cell>
						<Table.Cell>{new Date(job.createdAt).toLocaleString()}</Table.Cell>
						<Table.Cell>
							{job.completedAt ? new Date(job.completedAt).toLocaleString() : '—'}
						</Table.Cell>
						<Table.Cell>{job.emailCount ?? '—'}</Table.Cell>
						<Table.Cell>{job.attachmentCount ?? '—'}</Table.Cell>
						<Table.Cell>
							{#if job.status === 'completed'}
								<a
									class="text-primary underline"
									href={`/api/v1/archive-exports/${job.id}/download`}
								>
									{$t('app.archive_exports.download')}
								</a>
							{:else}
								—
							{/if}
						</Table.Cell>
					</Table.Row>
				{/each}
			{:else}
				<Table.Row>
					<Table.Cell colspan="8">
						{$t('app.archive_exports.no_exports')}
					</Table.Cell>
				</Table.Row>
			{/if}
		</Table.Body>
	</Table.Root>
</div>

<Dialog.Root bind:open={isDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{$t('app.archive_exports.create_export')}</Dialog.Title>
		</Dialog.Header>
		<div class="grid gap-4">
			<div class="grid gap-2">
				<label for="archiveExportFormat" class="text-sm font-medium"
					>{$t('app.archive_exports.format')}</label
				>
				<Select.Root type="single" bind:value={exportFormat}>
					<Select.Trigger id="archiveExportFormat">
						{formatLabel(exportFormat)}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="eml"
							>{$t('app.archive_exports.format_eml')}</Select.Item
						>
						<Select.Item value="mbox"
							>{$t('app.archive_exports.format_mbox')}</Select.Item
						>
						<Select.Item value="json"
							>{$t('app.archive_exports.format_json')}</Select.Item
						>
					</Select.Content>
				</Select.Root>
			</div>
		</div>
		<Dialog.Footer class="mt-4">
			<Button onclick={createExportJob} disabled={isSubmitting}
				>{$t('app.components.common.save')}</Button
			>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
