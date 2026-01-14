import { api } from '$lib/server/api';
import type { PageServerLoad } from './$types';
import type { GetAuditLogsResponse, GetAuditLogVerificationsResponse } from '@open-archiver/types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async (event) => {
	// Forward search params from the page URL to the API request
	const response = await api(
		`/compliance/audit-logs?${event.url.searchParams.toString()}`,
		event
	);
	const res = await response.json();
	if (!response.ok) {
		throw error(response.status, res.message || JSON.stringify(res));
	}

	const result: GetAuditLogsResponse = res;
	const verificationResponse = await api('/compliance/audit-logs/verifications', event);
	const verificationBody = await verificationResponse.json();
	const verifications: GetAuditLogVerificationsResponse = verificationBody;

	return {
		logs: result.data,
		meta: result.meta,
		verifications: verifications.items || [],
	};
};
