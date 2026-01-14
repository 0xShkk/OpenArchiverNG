import 'dotenv/config';

const parseIntSafe = (value: string | undefined, fallback: number): number => {
	if (!value) {
		return fallback;
	}
	const parsed = parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : fallback;
};

export const searchConfig = {
	host: process.env.MEILI_HOST || 'http://127.0.0.1:7700',
	apiKey: process.env.MEILI_MASTER_KEY || '',
};

export const meiliConfig = {
	indexingBatchSize: parseIntSafe(process.env.MEILI_INDEXING_BATCH, 500),
	indexingConcurrency: parseIntSafe(process.env.MEILI_INDEXING_CONCURRENCY, 4),
	indexingWorkerConcurrency: parseIntSafe(process.env.MEILI_INDEXING_WORKER_CONCURRENCY, 2),
	indexingMaxQueueDepth: parseIntSafe(process.env.MEILI_INDEXING_MAX_QUEUE, 2000),
};
