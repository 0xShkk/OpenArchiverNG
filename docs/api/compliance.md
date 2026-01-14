# Compliance API

All endpoints are prefixed with `/api/v1/compliance` and require `compliance` permissions.

## Permissions

- `read` on `compliance` for listing cases, custodians, holds, hold emails, notices, exports, and audit logs
- `create` on `compliance` for creating cases, custodians, holds, notices, and export jobs
- `update` on `compliance` for updating cases/holds, releasing holds, acknowledging notices, and verifying audit logs

## Concepts

- **Cases**: Group legal holds under a single investigation or matter.
- **Custodians**: People/mailboxes associated with a case (tracked by email + source type).
- **Legal holds**: Rules that preserve matching emails and block deletions.
- **Notices**: Custodian notification + acknowledgement records.
- **Exports**: Jobs that package hold/case data for eDiscovery.

## Legal hold behavior

- Matching uses **AND** logic across all provided criteria.
- `userEmail`, `senderEmail`, and `subjectContains` comparisons are case-insensitive.
- Date filters apply to `sentAt` and must be valid ISO date strings.
- At least one of `custodianId` or `holdCriteria` is required.

When a hold is created:

- Existing matching archived emails are marked `isOnLegalHold=true`.
- New emails are checked during ingestion and marked if they match an active hold.
- Hold membership is recorded in `legal_hold_emails`.

When a hold is updated or released:

- Membership is recalculated and overlaps with other active holds are respected.

Legal holds are enforced during deletion:

- Archived emails on hold cannot be deleted.
- Ingestion sources cannot be deleted if any archived emails are on hold.

## Cases

### GET `/cases`

Returns all compliance cases.

### GET `/cases/summary`

Returns per-case hold/email counts.

### POST `/cases`

Create a compliance case.

```json
{
	"name": "Investigation 2024-09",
	"description": "Scope: HR inquiry"
}
```

### PATCH `/cases/:id`

Update a case.

```json
{
	"status": "closed",
	"description": "Resolved and archived"
}
```

## Custodians

### GET `/custodians`

Returns all custodians.

### POST `/custodians`

Create a custodian.

```json
{
	"email": "custodian@example.com",
	"displayName": "Custodian Name",
	"sourceType": "generic_imap"
}
```

Valid `sourceType` values: `google_workspace`, `microsoft_365`, `generic_imap`, `pst_import`, `eml_import`, `mbox_import`.

## Legal Holds

### GET `/legal-holds`

Returns all legal holds, including case and custodian references and email counts.

### GET `/legal-holds/:id/emails`

Returns a paginated list of emails for a hold.

Query params: `page`, `limit`

### POST `/legal-holds`

Create a legal hold. Either `custodianId` or at least one `holdCriteria` field is required.

```json
{
	"caseId": "case-uuid",
	"custodianId": "custodian-uuid",
	"holdCriteria": {
		"userEmail": "user@example.com",
		"ingestionSourceId": "source-uuid",
		"senderEmail": "sender@example.com",
		"subjectContains": "invoice",
		"startDate": "2024-01-01T00:00:00.000Z",
		"endDate": "2024-12-31T23:59:59.999Z"
	},
	"reason": "Preserve records for litigation hold"
}
```

### PATCH `/legal-holds/:id`

Update hold criteria or reason.

```json
{
	"custodianId": "custodian-uuid",
	"holdCriteria": {
		"subjectContains": "invoice"
	},
	"reason": "Updated scope"
}
```

### POST `/legal-holds/:id/release`

Release a legal hold (marks it removed and recalculates affected email flags).

## Notices

### GET `/legal-holds/:id/notices`

Return all notices for a hold.

### POST `/legal-holds/:id/notices`

Create a notice record.

```json
{
	"custodianId": "custodian-uuid",
	"channel": "manual",
	"notes": "Notice sent via internal ticketing system."
}
```

### POST `/legal-holds/:id/notices/:noticeId/acknowledge`

Record acknowledgement for a notice.

```json
{
	"notes": "Acknowledged by custodian"
}
```

## Exports

### GET `/export-jobs`

Returns a paginated list of export jobs.

Query params: `page`, `limit`, `caseId`

### POST `/export-jobs`

Create an export job.

```json
{
	"caseId": "case-uuid",
	"format": "eml",
	"query": {
		"holdId": "hold-uuid"
	}
}
```

`query` supports one of:

- `{ "holdId": "..." }`
- `{ "caseId": "..." }`
- `{ "emailIds": ["...", "..."] }`

### GET `/export-jobs/:id/download`

Download the export ZIP once the job is completed.

## Audit logs

### GET `/audit-logs`

Return audit logs.

Query params: `page`, `limit`, `startDate`, `endDate`, `actor`, `actionType`, `sort`

### POST `/audit-logs/verify`

Verify audit log integrity and record a verification entry.

### GET `/audit-logs/verifications`

Return recent audit log verifications.
