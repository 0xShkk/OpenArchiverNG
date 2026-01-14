import { Request, Response } from 'express';
import { StorageService } from '../../services/StorageService';
import * as path from 'path';
import { storage as storageConfig } from '../../config/storage';

export class StorageController {
	constructor(private storageService: StorageService) {}

	private buildContentDisposition(filename: string): string {
		const cleaned = filename.replace(/[\r\n]/g, '');
		const asciiFallback =
			cleaned.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'download';
		const encoded = encodeURIComponent(cleaned);
		return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
	}

	public downloadFile = async (req: Request, res: Response): Promise<void> => {
		const unsafePath = typeof req.query.path === 'string' ? req.query.path : '';

		if (!unsafePath || unsafePath.includes('\0')) {
			res.status(400).send(req.t('storage.filePathRequired'));
			return;
		}
		let safePath = '';
		if (storageConfig.type === 'local') {
			const basePath = path.resolve(storageConfig.rootPath);
			const fullPath = path.resolve(basePath, unsafePath);
			const relativePath = path.relative(basePath, fullPath);

			if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
				res.status(400).send(req.t('storage.invalidFilePath'));
				return;
			}
			safePath = relativePath;
		} else {
			const normalizedPath = path.posix.normalize(unsafePath.replace(/\\/g, '/'));
			const cleanedPath = normalizedPath.replace(/^\/+/, '');
			if (cleanedPath.startsWith('..')) {
				res.status(400).send(req.t('storage.invalidFilePath'));
				return;
			}
			safePath = cleanedPath;
		}
		if (!safePath || safePath === '.') {
			res.status(400).send(req.t('storage.invalidFilePath'));
			return;
		}

		try {
			const fileExists = await this.storageService.exists(safePath);
			if (!fileExists) {
				res.status(404).send(req.t('storage.fileNotFound'));
				return;
			}

			const fileStream = await this.storageService.get(safePath);
			const fileName = path.basename(safePath);
			res.setHeader('Content-Disposition', this.buildContentDisposition(fileName));
			fileStream.pipe(res);
		} catch (error) {
			console.error('Error downloading file:', error);
			res.status(500).send(req.t('storage.downloadError'));
		}
	};
}
