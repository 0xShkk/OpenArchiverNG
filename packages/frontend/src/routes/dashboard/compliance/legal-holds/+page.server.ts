import { api } from '$lib/server/api';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type {
	ComplianceCase,
	ComplianceCaseSummary,
	Custodian,
	LegalHold,
	PaginatedExportJobs,
	SafeIngestionSource,
} from '@open-archiver/types';

export const load: PageServerLoad = async (event) => {
	try {
		const [casesRes, custodiansRes, holdsRes, sourcesRes, summariesRes, exportsRes] =
			await Promise.all([
				api('/compliance/cases', event),
				api('/compliance/custodians', event),
				api('/compliance/legal-holds', event),
				api('/ingestion-sources', event),
				api('/compliance/cases/summary', event),
				api('/compliance/export-jobs', event),
			]);

		if (!casesRes.ok) {
			const body = await casesRes.json();
			throw error(casesRes.status, body.message || 'Failed to load cases');
		}
		if (!custodiansRes.ok) {
			const body = await custodiansRes.json();
			throw error(custodiansRes.status, body.message || 'Failed to load custodians');
		}
		if (!holdsRes.ok) {
			const body = await holdsRes.json();
			throw error(holdsRes.status, body.message || 'Failed to load legal holds');
		}
		if (!sourcesRes.ok) {
			const body = await sourcesRes.json();
			throw error(sourcesRes.status, body.message || 'Failed to load ingestion sources');
		}
		if (!summariesRes.ok) {
			const body = await summariesRes.json();
			throw error(summariesRes.status, body.message || 'Failed to load case summaries');
		}
		if (!exportsRes.ok) {
			const body = await exportsRes.json();
			throw error(exportsRes.status, body.message || 'Failed to load export jobs');
		}

		const cases: ComplianceCase[] = await casesRes.json();
		const custodians: Custodian[] = await custodiansRes.json();
		const holds: LegalHold[] = await holdsRes.json();
		const ingestionSources: SafeIngestionSource[] = await sourcesRes.json();
		const caseSummaries: ComplianceCaseSummary[] = await summariesRes.json();
		const exportJobs: PaginatedExportJobs = await exportsRes.json();

		return {
			cases,
			custodians,
			holds,
			ingestionSources,
			caseSummaries,
			exportJobs,
		};
	} catch (err) {
		if (err instanceof Error) {
			throw error(500, 'Failed to load legal hold data.');
		}
		throw err;
	}
};
