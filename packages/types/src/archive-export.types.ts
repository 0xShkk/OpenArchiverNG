export type ArchiveExportFormat = 'eml' | 'mbox' | 'json';
export type ArchiveExportStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ArchiveExportJob {
	id: string;
	format: ArchiveExportFormat;
	status: ArchiveExportStatus;
	snapshotAt: string;
	filePath?: string | null;
	emailCount?: number | null;
	attachmentCount?: number | null;
	errorMessage?: string | null;
	createdByIdentifier: string;
	createdAt: string;
	completedAt?: string | null;
}

export interface PaginatedArchiveExportJobs {
	items: ArchiveExportJob[];
	total: number;
	page: number;
	limit: number;
}

export interface CreateArchiveExportJobDto {
	format: ArchiveExportFormat;
}
