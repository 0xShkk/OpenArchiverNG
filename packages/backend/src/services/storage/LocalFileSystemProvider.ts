import { IStorageProvider, LocalStorageConfig } from '@open-archiver/types';
import { promises as fs } from 'fs';
import * as path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

export class LocalFileSystemProvider implements IStorageProvider {
	private readonly rootPath: string;
	private readonly immutabilityMode: 'off' | 'hold' | 'always';

	constructor(config: LocalStorageConfig) {
		this.rootPath = config.rootPath;
		this.immutabilityMode = config.immutabilityMode || 'off';
	}

	async put(filePath: string, content: Buffer | NodeJS.ReadableStream): Promise<void> {
		const fullPath = path.join(this.rootPath, filePath);
		const dir = path.dirname(fullPath);
		await fs.mkdir(dir, { recursive: true });

		if (Buffer.isBuffer(content)) {
			await fs.writeFile(fullPath, content);
		} else {
			const writeStream = createWriteStream(fullPath);
			await pipeline(content, writeStream);
		}

		if (this.immutabilityMode !== 'off') {
			try {
				await fs.chmod(fullPath, 0o444);
			} catch {
				// Best-effort immutability for local storage.
			}
		}
	}

	async get(filePath: string): Promise<NodeJS.ReadableStream> {
		const fullPath = path.join(this.rootPath, filePath);
		try {
			await fs.access(fullPath);
			return createReadStream(fullPath);
		} catch (error) {
			throw new Error('File not found');
		}
	}

	async delete(filePath: string): Promise<void> {
		const fullPath = path.join(this.rootPath, filePath);
		try {
			await fs.rm(fullPath, { recursive: true, force: true });
		} catch (error: any) {
			// Even with force: true, other errors might occur (e.g., permissions)
			if (error.code !== 'ENOENT') {
				throw error;
			}
		}
	}

	async exists(filePath: string): Promise<boolean> {
		const fullPath = path.join(this.rootPath, filePath);
		try {
			await fs.access(fullPath);
			return true;
		} catch {
			return false;
		}
	}
}
