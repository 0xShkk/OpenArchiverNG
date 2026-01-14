<script lang="ts">
	import type { PageData } from './$types';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import * as Label from '$lib/components/ui/label';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import * as Select from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte';
	import { api } from '$lib/api.client';
	import type { SupportedLanguage, SystemSettings } from '@open-archiver/types';
	import { t } from '$lib/translations';
	import { formatBytes } from '$lib/utils';

	let { data }: { data: PageData } = $props();
	let settings = $state(data.systemSettings);
	const canManageSettings = data.canManageSettings;
	let isSaving = $state(false);

	const formatByteInput = (bytes: number) => {
		if (bytes === Infinity) {
			return 'Infinity';
		}
		const units = [
			{ suffix: 'G', value: 1024 ** 3 },
			{ suffix: 'M', value: 1024 ** 2 },
			{ suffix: 'K', value: 1024 },
		];
		for (const unit of units) {
			if (bytes >= unit.value && bytes % unit.value === 0) {
				return `${bytes / unit.value}${unit.suffix}`;
			}
		}
		return `${bytes}`;
	};

	const formatLimitValue = (bytes: number) =>
		bytes === Infinity ? 'Infinity' : formatBytes(bytes);

	let limitInputs = $state({
		maxEmailBytes: formatByteInput(settings.maxEmailBytes),
		maxPreviewBytes: formatByteInput(settings.maxPreviewBytes),
		maxAttachmentBytes: formatByteInput(settings.maxAttachmentBytes),
	});

	const languageOptions: { value: SupportedLanguage; label: string }[] = [
		{ value: 'en', label: '🇬🇧 English' },
		{ value: 'de', label: '🇩🇪 Deutsch' },
		{ value: 'fr', label: '🇫🇷 Français' },
		{ value: 'et', label: '🇪🇪 Eesti' },
		{ value: 'es', label: '🇪🇸 Español' },
		{ value: 'it', label: '🇮🇹 Italiano' },
		{ value: 'pt', label: '🇵🇹 Português' },
		{ value: 'nl', label: '🇳🇱 Nederlands' },
		{ value: 'el', label: '🇬🇷 Ελληνικά' },
		{ value: 'ja', label: '🇯🇵 日本語' },
	];

	const languageTriggerContent = $derived(
		languageOptions.find((lang) => lang.value === settings.language)?.label ??
			'Select a language'
	);

	const updateLimitInputs = (updatedSettings: SystemSettings) => {
		limitInputs = {
			maxEmailBytes: formatByteInput(updatedSettings.maxEmailBytes),
			maxPreviewBytes: formatByteInput(updatedSettings.maxPreviewBytes),
			maxAttachmentBytes: formatByteInput(updatedSettings.maxAttachmentBytes),
		};
	};

	const handleSubmit = async (event: SubmitEvent) => {
		event.preventDefault();
		if (!canManageSettings) {
			return;
		}
		isSaving = true;
		try {
			const payload: Record<string, unknown> = {
				language: settings.language,
				theme: settings.theme,
				supportEmail: settings.supportEmail ? String(settings.supportEmail) : null,
				allInclusiveArchive: settings.allInclusiveArchive,
				enableDeletion: settings.enableDeletion,
				deleteFromSourceAfterArchive: settings.deleteFromSourceAfterArchive,
				legalHoldNoticeReminderDays: settings.legalHoldNoticeReminderDays,
			};

			const maxEmailBytes = limitInputs.maxEmailBytes?.trim();
			const maxPreviewBytes = limitInputs.maxPreviewBytes?.trim();
			const maxAttachmentBytes = limitInputs.maxAttachmentBytes?.trim();

			if (maxEmailBytes) {
				payload.maxEmailBytes = maxEmailBytes;
			}
			if (maxPreviewBytes) {
				payload.maxPreviewBytes = maxPreviewBytes;
			}
			if (maxAttachmentBytes) {
				payload.maxAttachmentBytes = maxAttachmentBytes;
			}

			const response = await api('/settings/system', {
				method: 'PUT',
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				const { message } = await response.json();
				throw new Error(message || 'Failed to update settings');
			}

			const updatedSettings: SystemSettings = await response.json();
			settings = updatedSettings;
			updateLimitInputs(updatedSettings);
			setAlert({
				type: 'success',
				title: 'Settings Updated',
				message: 'Your changes have been saved successfully.',
				duration: 3000,
				show: true,
			});
		} catch (error) {
			setAlert({
				type: 'error',
				title: 'Update Failed',
				message: error instanceof Error ? error.message : String(error),
				duration: 5000,
				show: true,
			});
		} finally {
			isSaving = false;
		}
	};
</script>

<svelte:head>
	<title>{$t('app.system_settings.title')} - OpenArchiver</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold">{$t('app.system_settings.system_settings')}</h1>
		<p class="text-muted-foreground">{$t('app.system_settings.description')}</p>
	</div>

	{#if !canManageSettings}
		<Alert.Root>
			<Alert.Title>{$t('app.system_settings.read_only_title')}</Alert.Title>
			<Alert.Description>
				{$t('app.system_settings.read_only_description')}
			</Alert.Description>
		</Alert.Root>
	{/if}

	<form
		method="POST"
		class="space-y-8"
		onsubmit={handleSubmit}
	>
		<Card.Root>
			<Card.Content class="space-y-6">
				<!-- Hide language setting for now -->
				<div class="grid gap-2">
					<Label.Root class="mb-1" for="language"
						>{$t('app.system_settings.language')}</Label.Root
					>
					<Select.Root
						name="language"
						bind:value={settings.language}
						type="single"
						disabled={!canManageSettings}
					>
						<Select.Trigger class="w-[280px]">
							{languageTriggerContent}
						</Select.Trigger>
						<Select.Content>
							{#each languageOptions as lang}
								<Select.Item value={lang.value}>{lang.label}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				<div class="grid gap-2">
					<Label.Root class="mb-1">{$t('app.system_settings.default_theme')}</Label.Root>
					<RadioGroup.Root
						bind:value={settings.theme}
						name="theme"
						class="flex items-center gap-4"
						disabled={!canManageSettings}
					>
						<div class="flex items-center gap-2">
							<RadioGroup.Item value="light" id="light" />
							<Label.Root for="light">{$t('app.system_settings.light')}</Label.Root>
						</div>
						<div class="flex items-center gap-2">
							<RadioGroup.Item value="dark" id="dark" />
							<Label.Root for="dark">{$t('app.system_settings.dark')}</Label.Root>
						</div>
						<div class="flex items-center gap-2">
							<RadioGroup.Item value="system" id="system" />
							<Label.Root for="system">{$t('app.system_settings.system')}</Label.Root>
						</div>
					</RadioGroup.Root>
				</div>

				<div class="grid gap-2">
					<Label.Root class="mb-1" for="supportEmail"
						>{$t('app.system_settings.support_email')}</Label.Root
					>
					<Input
						id="supportEmail"
						name="supportEmail"
						type="email"
						placeholder="support@example.com"
						bind:value={settings.supportEmail}
						class="max-w-sm"
						disabled={!canManageSettings}
					/>
				</div>

				<div class="space-y-3 border-t pt-4">
					<h3 class="text-lg font-semibold">{$t('app.system_settings.archiving')}</h3>
					<div class="flex items-center gap-3">
						<Switch
							bind:checked={settings.allInclusiveArchive}
							disabled={!canManageSettings}
						/>
						<div class="space-y-1">
							<Label.Root class="mb-0">
								{$t('app.system_settings.all_inclusive_archive')}
							</Label.Root>
							<p class="text-xs text-muted-foreground">
								{$t('app.system_settings.all_inclusive_archive_help')}
							</p>
						</div>
					</div>
					<input
						type="hidden"
						name="allInclusiveArchive"
						value={settings.allInclusiveArchive ? 'true' : 'false'}
						disabled={!canManageSettings}
					/>
				</div>

				<div class="space-y-3 border-t pt-4">
					<h3 class="text-lg font-semibold">{$t('app.system_settings.limits')}</h3>
					<div class="grid gap-2">
						<Label.Root class="mb-1" for="maxEmailBytes"
							>{$t('app.system_settings.max_email_bytes')}</Label.Root
						>
						<Input
							id="maxEmailBytes"
							name="maxEmailBytes"
							placeholder="25M"
							bind:value={limitInputs.maxEmailBytes}
							class="max-w-xs"
							disabled={!canManageSettings}
						/>
						<p class="text-xs text-muted-foreground">
							{$t('app.system_settings.bytes_help')}
							({formatLimitValue(settings.maxEmailBytes)})
						</p>
					</div>

					<div class="grid gap-2">
						<Label.Root class="mb-1" for="maxPreviewBytes"
							>{$t('app.system_settings.max_preview_bytes')}</Label.Root
						>
						<Input
							id="maxPreviewBytes"
							name="maxPreviewBytes"
							placeholder="10M"
							bind:value={limitInputs.maxPreviewBytes}
							class="max-w-xs"
							disabled={!canManageSettings}
						/>
						<p class="text-xs text-muted-foreground">
							{$t('app.system_settings.bytes_help')}
							({formatLimitValue(settings.maxPreviewBytes)})
						</p>
					</div>

					<div class="grid gap-2">
						<Label.Root class="mb-1" for="maxAttachmentBytes"
							>{$t('app.system_settings.max_attachment_bytes')}</Label.Root
						>
						<Input
							id="maxAttachmentBytes"
							name="maxAttachmentBytes"
							placeholder="50M"
							bind:value={limitInputs.maxAttachmentBytes}
							class="max-w-xs"
							disabled={!canManageSettings}
						/>
						<p class="text-xs text-muted-foreground">
							{$t('app.system_settings.bytes_help')}
							({formatLimitValue(settings.maxAttachmentBytes)})
						</p>
					</div>
				</div>

				<div class="space-y-3 border-t pt-4">
					<h3 class="text-lg font-semibold">{$t('app.system_settings.compliance')}</h3>
					<div class="grid gap-2">
						<Label.Root class="mb-1" for="legalHoldNoticeReminderDays"
							>{$t('app.system_settings.legal_hold_notice_reminder_days')}</Label.Root
						>
						<Input
							id="legalHoldNoticeReminderDays"
							name="legalHoldNoticeReminderDays"
							type="number"
							min="0"
							bind:value={settings.legalHoldNoticeReminderDays}
							class="max-w-xs"
							disabled={!canManageSettings}
						/>
						<p class="text-xs text-muted-foreground">
							{$t('app.system_settings.legal_hold_notice_reminder_days_help')}
						</p>
					</div>
				</div>

				<div class="space-y-3 border-t pt-4">
					<h3 class="text-lg font-semibold text-destructive">
						{$t('app.system_settings.danger_zone')}
					</h3>
					<div class="flex items-center gap-3">
						<Switch
							bind:checked={settings.deleteFromSourceAfterArchive}
							disabled={!canManageSettings}
						/>
						<div class="space-y-1">
							<Label.Root class="mb-0">
								{$t('app.system_settings.delete_from_source_after_archive')}
							</Label.Root>
							<p class="text-xs text-muted-foreground">
								{$t('app.system_settings.delete_from_source_after_archive_help')}
							</p>
						</div>
					</div>
					<div class="flex items-center gap-3">
						<Switch
							bind:checked={settings.enableDeletion}
							disabled={!canManageSettings}
						/>
						<div class="space-y-1">
							<Label.Root class="mb-0">
								{$t('app.system_settings.enable_deletion')}
							</Label.Root>
							<p class="text-xs text-muted-foreground">
								{$t('app.system_settings.enable_deletion_help')}
							</p>
						</div>
					</div>
					<input
						type="hidden"
						name="enableDeletion"
						value={settings.enableDeletion ? 'true' : 'false'}
						disabled={!canManageSettings}
					/>
				</div>
			</Card.Content>
			<Card.Footer class="border-t px-6 py-4">
				<Button type="submit" disabled={!canManageSettings || isSaving}>
					{#if isSaving}
						{$t('app.system_settings.saving')}...
					{:else}
						{$t('app.system_settings.save_changes')}
					{/if}
				</Button>
			</Card.Footer>
		</Card.Root>
	</form>
</div>
