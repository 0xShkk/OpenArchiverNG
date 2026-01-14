import { IStorageProvider, StorageConfig } from '@open-archiver/types';
import { LocalFileSystemProvider } from './storage/LocalFileSystemProvider';
import { S3StorageProvider } from './storage/S3StorageProvider';
import { config } from '../config/index';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Readable, PassThrough } from 'stream';

/**
 *  A unique identifier for Open Archiver encrypted files. This value SHOULD NOT BE ALTERED in future development to ensure compatibility.
 */
const ENCRYPTION_PREFIX = Buffer.from('oa_enc_idf_v1::');

export class StorageService implements IStorageProvider {
	private provider: IStorageProvider;
	private encryptionKey: Buffer | null = null;
	private readonly algorithm = 'aes-256-cbc';
	private readonly immutabilityMode: 'off' | 'hold' | 'always';

	constructor(storageConfig: StorageConfig = config.storage) {
		this.immutabilityMode = storageConfig.immutabilityMode || 'off';
		if (storageConfig.encryptionKey) {
			this.encryptionKey = Buffer.from(storageConfig.encryptionKey, 'hex');
		}

		switch (storageConfig.type) {
			case 'local':
				this.provider = new LocalFileSystemProvider(storageConfig);
				break;
			case 's3':
				this.provider = new S3StorageProvider(storageConfig);
				break;
			default:
				throw new Error('Invalid storage provider type');
		}
	}

	private encryptStream(input: NodeJS.ReadableStream): NodeJS.ReadableStream {
		if (!this.encryptionKey) {
			return input;
		}

		const iv = randomBytes(16);
		const cipher = createCipheriv(this.algorithm, this.encryptionKey, iv);
		const output = new PassThrough();

		output.write(Buffer.concat([ENCRYPTION_PREFIX, iv]));

		input.on('error', (error) => output.emit('error', error));
		cipher.on('error', (error) => output.emit('error', error));

		input.pipe(cipher).pipe(output);
		return output;
	}

	private async readPrefix(stream: NodeJS.ReadableStream, length: number): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			const chunks: Buffer[] = [];
			let totalLength = 0;

			const onData = (chunk: Buffer) => {
				const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
				chunks.push(bufferChunk);
				totalLength += bufferChunk.length;

				if (totalLength >= length) {
					stream.pause();
					stream.removeListener('data', onData);
					const combined = Buffer.concat(chunks);
					const prefix = combined.subarray(0, length);
					const remaining = combined.subarray(length);
					if (remaining.length > 0) {
						stream.unshift(remaining);
					}
					resolve(prefix);
				}
			};

			stream.on('data', onData);
			stream.on('error', reject);
			stream.on('end', () => resolve(Buffer.concat(chunks)));
		});
	}

	async put(path: string, content: Buffer | NodeJS.ReadableStream): Promise<void> {
		if (!this.encryptionKey) {
			return this.provider.put(path, content);
		}

		const inputStream = Buffer.isBuffer(content) ? Readable.from(content) : content;
		const encryptedStream = this.encryptStream(inputStream);
		return this.provider.put(path, encryptedStream);
	}

	async get(path: string): Promise<NodeJS.ReadableStream> {
		return this.getStream(path);
	}

	public async getStream(path: string): Promise<NodeJS.ReadableStream> {
		const stream = await this.provider.get(path);
		if (!this.encryptionKey) {
			return stream;
		}

		const prefixLength = ENCRYPTION_PREFIX.length + 16;
		const prefixBuffer = await this.readPrefix(stream, prefixLength);

		if (prefixBuffer.length < prefixLength) {
			return Readable.from(prefixBuffer);
		}

		const prefix = prefixBuffer.subarray(0, ENCRYPTION_PREFIX.length);
		if (!prefix.equals(ENCRYPTION_PREFIX)) {
			stream.unshift(prefixBuffer);
			stream.resume();
			return stream;
		}

		try {
			const iv = prefixBuffer.subarray(
				ENCRYPTION_PREFIX.length,
				ENCRYPTION_PREFIX.length + 16
			);
			const decipher = createDecipheriv(this.algorithm, this.encryptionKey, iv);
			stream.pipe(decipher);
			stream.resume();
			return decipher;
		} catch (error) {
			throw new Error('Failed to decrypt file. It may be corrupted or the key is incorrect.');
		}
	}

	delete(path: string): Promise<void> {
		if (this.immutabilityMode === 'always') {
			return Promise.reject(
				new Error('Storage immutability is enabled. Deletion is blocked.')
			);
		}
		return this.provider.delete(path);
	}

	exists(path: string): Promise<boolean> {
		return this.provider.exists(path);
	}
}
