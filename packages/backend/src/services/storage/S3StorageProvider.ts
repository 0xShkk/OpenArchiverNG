import { IStorageProvider, S3StorageConfig } from '@open-archiver/types';
import {
	S3Client,
	GetObjectCommand,
	DeleteObjectCommand,
	HeadObjectCommand,
	NotFound,
	ListObjectsV2Command,
	DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';

export class S3StorageProvider implements IStorageProvider {
	private readonly client: S3Client;
	private readonly bucket: string;
	private readonly immutabilityMode: 'off' | 'hold' | 'always';
	private readonly objectLock?: S3StorageConfig['objectLock'];

	constructor(config: S3StorageConfig) {
		this.client = new S3Client({
			endpoint: config.endpoint,
			region: config.region,
			credentials: {
				accessKeyId: config.accessKeyId,
				secretAccessKey: config.secretAccessKey,
			},
			forcePathStyle: config.forcePathStyle,
		});
		this.bucket = config.bucket;
		this.immutabilityMode = config.immutabilityMode || 'off';
		this.objectLock = config.objectLock;
	}

	async put(path: string, content: Buffer | NodeJS.ReadableStream): Promise<void> {
		const objectLock =
			this.objectLock && this.objectLock.retentionDays > 0
				? {
						ObjectLockMode: this.objectLock.mode,
						ObjectLockRetainUntilDate: new Date(
							Date.now() + this.objectLock.retentionDays * 24 * 60 * 60 * 1000
						),
					}
				: {};
		const upload = new Upload({
			client: this.client,
			params: {
				Bucket: this.bucket,
				Key: path,
				Body: content instanceof Readable ? content : Readable.from(content),
				...objectLock,
			},
		});

		await upload.done();
	}

	async get(path: string): Promise<NodeJS.ReadableStream> {
		const command = new GetObjectCommand({
			Bucket: this.bucket,
			Key: path,
		});

		try {
			const response = await this.client.send(command);
			if (response.Body instanceof Readable) {
				return response.Body;
			}
			throw new Error('Readable stream not found in S3 response');
		} catch (error) {
			if (error instanceof NotFound) {
				throw new Error('File not found');
			}
			throw error;
		}
	}

	async delete(path: string): Promise<void> {
		if (this.immutabilityMode === 'always') {
			throw new Error('Storage immutability is enabled. Deletion is blocked.');
		}
		// List all objects with the given prefix
		const listCommand = new ListObjectsV2Command({
			Bucket: this.bucket,
			Prefix: path,
		});
		const listedObjects = await this.client.send(listCommand);

		if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
			return;
		}

		// Create a list of objects to delete
		const deleteParams = {
			Bucket: this.bucket,
			Delete: {
				Objects: listedObjects.Contents.map(({ Key }) => ({ Key })),
			},
		};

		// Delete the objects
		const deleteCommand = new DeleteObjectsCommand(deleteParams);
		await this.client.send(deleteCommand);
	}

	async exists(path: string): Promise<boolean> {
		const command = new HeadObjectCommand({
			Bucket: this.bucket,
			Key: path,
		});

		try {
			await this.client.send(command);
			return true;
		} catch (error) {
			if (error instanceof NotFound) {
				return false;
			}
			throw error;
		}
	}
}
