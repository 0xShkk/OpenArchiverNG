import type { IngestionProvider } from './ingestion.types';

export interface ComplianceCase {
	id: string;
	name: string;
	description?: string | null;
	status: string;
	createdByIdentifier: string;
	createdAt: string;
	updatedAt: string;
}

export interface ComplianceCaseSummary {
	caseId: string;
	activeHoldCount: number;
	totalHoldCount: number;
	activeEmailCount: number;
	totalEmailCount: number;
}

export interface Custodian {
	id: string;
	email: string;
	displayName?: string | null;
	sourceType: IngestionProvider;
	createdAt: string;
	updatedAt: string;
}

export interface LegalHoldCriteria {
	userEmail?: string;
	ingestionSourceId?: string;
	senderEmail?: string;
	subjectContains?: string;
	startDate?: string;
	endDate?: string;
}

export interface LegalHold {
	id: string;
	caseId: string;
	custodianId?: string | null;
	holdCriteria?: LegalHoldCriteria | null;
	reason?: string | null;
	appliedByIdentifier: string;
	appliedAt: string;
	removedAt?: string | null;
	ediscoveryCase?: ComplianceCase;
	custodian?: Custodian | null;
	emailCount?: number;
	activeEmailCount?: number;
}

export interface LegalHoldEmailSummary {
	id: string;
	ingestionSourceId: string;
	userEmail: string;
	senderEmail: string;
	subject: string | null;
	sentAt: string;
	isOnLegalHold: boolean;
}

export interface LegalHoldEmailRecord {
	holdId: string;
	emailId: string;
	matchedAt: string;
	removedAt?: string | null;
	email?: LegalHoldEmailSummary;
}

export interface PaginatedLegalHoldEmails {
	items: LegalHoldEmailRecord[];
	total: number;
	page: number;
	limit: number;
}

export interface LegalHoldNotice {
	id: string;
	holdId: string;
	custodianId: string;
	channel: string;
	sentAt: string;
	sentByIdentifier: string;
	acknowledgedAt?: string | null;
	acknowledgedByIdentifier?: string | null;
	notes?: string | null;
	custodian?: Custodian | null;
}

export interface ExportJob {
	id: string;
	caseId?: string | null;
	format: string;
	status: string;
	query: Record<string, unknown>;
	filePath?: string | null;
	createdByIdentifier: string;
	createdAt: string;
	completedAt?: string | null;
}

export interface PaginatedExportJobs {
	items: ExportJob[];
	total: number;
	page: number;
	limit: number;
}

export interface CreateComplianceCaseDto {
	name: string;
	description?: string | null;
}

export interface UpdateComplianceCaseDto {
	status?: string;
	description?: string | null;
}

export interface CreateCustodianDto {
	email: string;
	displayName?: string | null;
	sourceType: IngestionProvider;
}

export interface CreateLegalHoldDto {
	caseId: string;
	custodianId?: string | null;
	holdCriteria?: LegalHoldCriteria | null;
	reason?: string | null;
}

export interface UpdateLegalHoldDto {
	custodianId?: string | null;
	holdCriteria?: LegalHoldCriteria | null;
	reason?: string | null;
}

export interface CreateLegalHoldNoticeDto {
	custodianId?: string | null;
	channel?: string;
	notes?: string | null;
}

export interface AcknowledgeLegalHoldNoticeDto {
	notes?: string | null;
}

export interface CreateExportJobDto {
	caseId?: string | null;
	format: string;
	query: Record<string, unknown>;
}
