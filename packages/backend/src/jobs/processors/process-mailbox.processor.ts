import { Job } from 'bullmq';
import {
	IProcessMailboxJob,
	SyncState,
	ProcessMailboxError,
	PendingEmail,
} from '@open-archiver/types';
import { IngestionService } from '../../services/IngestionService';
import { logger } from '../../config/logger';
import { EmailProviderFactory } from '../../services/EmailProviderFactory';
import { StorageService } from '../../services/StorageService';
import { IndexingService } from '../../services/IndexingService';
import { SearchService } from '../../services/SearchService';
import { DatabaseService } from '../../services/DatabaseService';
import { config } from '../../config';
import { indexingQueue } from '../queues';
import { SettingsService } from '../../services/SettingsService';

/**
 * This processor handles the ingestion of emails for a single user's mailbox.
 * If an error occurs during processing (e.g., an API failure),
 * it catches the exception and returns a structured error object instead of throwing.
 * This prevents a single failed mailbox from halting the entire sync cycle for all users.
 * The parent 'sync-cycle-finished' job is responsible for inspecting the results of all
 * 'process-mailbox' jobs, aggregating successes, and reporting detailed failures.
 */
export const processMailboxProcessor = async (job: Job<IProcessMailboxJob, SyncState, string>) => {
	const { ingestionSourceId, userEmail } = job.data;
	const BATCH_SIZE: number = config.meili.indexingBatchSize;
	let emailBatch: PendingEmail[] = [];
	const maxQueueDepth = config.meili.indexingMaxQueueDepth;
	let processedCount = 0;

	logger.info({ ingestionSourceId, userEmail }, `Processing mailbox for user`);

	const searchService = new SearchService();
	const storageService = new StorageService();
	const databaseService = new DatabaseService();
	const settingsService = new SettingsService();

	try {
		const settings = await settingsService.getSystemSettings();
		const deleteFromSourceAfterArchive = settings.deleteFromSourceAfterArchive;
		let loggedDeleteNotSupported = false;

		const waitForIndexingCapacity = async () => {
			if (!maxQueueDepth || maxQueueDepth <= 0) {
				return;
			}
			while (true) {
				const counts = await indexingQueue.getJobCounts('waiting', 'active', 'delayed');
				const backlog = counts.waiting + counts.active + counts.delayed;
				if (backlog < maxQueueDepth) {
					return;
				}
				logger.warn(
					{ backlog, maxQueueDepth },
					'Indexing backlog high. Pausing ingestion briefly.'
				);
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}
		};

		const source = await IngestionService.findById(ingestionSourceId);
		if (!source) {
			throw new Error(`Ingestion source with ID ${ingestionSourceId} not found`);
		}

		const connector = EmailProviderFactory.createConnector(source);
		const deleteFromSourceOverride = source.deleteFromSourceAfterArchiveOverride;
		const shouldDeleteFromSource =
			typeof deleteFromSourceOverride === 'boolean'
				? deleteFromSourceOverride
				: deleteFromSourceAfterArchive;
		const deleteFromSourceMode =
			source.provider === 'google_workspace'
				? source.gmailDeleteMode ?? 'permanent'
				: undefined;
		const ingestionService = new IngestionService();

		for await (const email of connector.fetchEmails(userEmail, source.syncState)) {
			if (email) {
				const processedEmail = await ingestionService.processEmail(
					email,
					source,
					storageService,
					userEmail
				);
				if (processedEmail) {
					if (shouldDeleteFromSource) {
						if (!connector.deleteFromSource) {
							if (!loggedDeleteNotSupported) {
								logger.warn(
									{ ingestionSourceId, provider: source.provider },
									'Delete-from-source enabled but provider does not support deletion.'
								);
								loggedDeleteNotSupported = true;
							}
						} else {
							try {
								await connector.deleteFromSource(email, userEmail, {
									mode: deleteFromSourceMode,
								});
							} catch (deleteError) {
								logger.error(
									{
										err: deleteError,
										ingestionSourceId,
										userEmail,
										messageId: email.sourceId || email.id,
									},
									'Failed to delete source email after archive.'
								);
							}
						}
					}

					processedCount += 1;
					emailBatch.push(processedEmail);
					if (emailBatch.length >= BATCH_SIZE) {
						await waitForIndexingCapacity();
						await indexingQueue.add('index-email-batch', { emails: emailBatch });
						emailBatch = [];
					}
				}
			}
		}

		if (emailBatch.length > 0) {
			await waitForIndexingCapacity();
			await indexingQueue.add('index-email-batch', { emails: emailBatch });
			emailBatch = [];
		}

		const newSyncState = connector.getUpdatedSyncState(userEmail);
		logger.info(
			{ ingestionSourceId, userEmail, processedCount },
			`Finished processing mailbox for user`
		);
		return newSyncState;
	} catch (error) {
		if (emailBatch.length > 0) {
			await indexingQueue.add('index-email-batch', { emails: emailBatch });
			emailBatch = [];
		}

		logger.error({ err: error, ingestionSourceId, userEmail }, 'Error processing mailbox');
		const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
		const processMailboxError: ProcessMailboxError = {
			error: true,
			message: `Failed to process mailbox for ${userEmail}: ${errorMessage}`,
		};
		return processMailboxError;
	}
};
