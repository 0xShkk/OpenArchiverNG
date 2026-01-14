import { Worker } from 'bullmq';
import { connection } from '../config/redis';
import indexEmailBatchProcessor from '../jobs/processors/index-email-batch.processor';
import { config } from '../config';

const processor = async (job: any) => {
	switch (job.name) {
		case 'index-email-batch':
			return indexEmailBatchProcessor(job);
		default:
			throw new Error(`Unknown job name: ${job.name}`);
	}
};

const worker = new Worker('indexing', processor, {
	connection,
	concurrency: config.meili.indexingWorkerConcurrency,
	lockDuration: config.app.queueLockDurationMs,
	lockRenewTime: config.app.queueLockRenewTimeMs,
	stalledInterval: config.app.queueStalledIntervalMs,
	maxStalledCount: config.app.queueMaxStalledCount,
	removeOnComplete: {
		count: 100, // keep last 100 jobs
	},
	removeOnFail: {
		count: 500, // keep last 500 failed jobs
	},
});

console.log('Indexing worker started');

process.on('SIGINT', () => worker.close());
process.on('SIGTERM', () => worker.close());
