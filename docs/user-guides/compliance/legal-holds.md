# Compliance and Legal Holds

This guide explains the compliance features in Open Archiver, how legal holds work, and when to use them.

## Overview

Open Archiver includes a compliance module that models:

- **Cases**: The parent record for an investigation or legal matter.
- **Custodians**: The people (or mailboxes) associated with a case.
- **Legal holds**: Rules that preserve matching emails and block deletions.
- **Notices**: Custodian notification and acknowledgement tracking.
- **Exports**: Defensible exports of hold/case content for eDiscovery.

Legal holds are designed for eDiscovery, litigation, or regulatory preservation. They do not replace retention policies.

## When to use legal holds

Use legal holds when you must prevent deletion of specific communications, for example:

- Litigation holds and discovery requests
- Regulatory inquiries and audits
- Internal investigations with preservation requirements

## Permissions

You need the following permissions to use the compliance screens and API:

- `read` on `compliance` to view cases, custodians, holds, hold emails, notices, exports, and audit logs
- `create` on `compliance` to create cases, custodians, holds, notices, and export jobs
- `update` on `compliance` to edit holds/cases, release holds, acknowledge notices, and verify audit logs

Super-admin (`manage` on `all`) also works.

## How legal holds work

### Matching rules

A legal hold matches emails using a combination of:

- **Custodian** (by custodian email)
- **Criteria**:
    - `ingestionSourceId`
    - `userEmail`
    - `senderEmail`
    - `subjectContains` (substring match)
    - `startDate` / `endDate` (sent date range)

Matching uses **AND** logic across all provided fields. Email and subject matching are case-insensitive. Date ranges are applied to `sentAt`.

At least one of `custodianId` or `holdCriteria` is required. If both are present, both must match.

### What happens when a hold is created

When you create a legal hold:

1. The hold is stored under its case.
2. All **existing** archived emails that match the hold are marked `isOnLegalHold=true`.
3. Future emails are checked against active holds during ingestion, and matching emails are marked on hold.
4. Hold membership is tracked in `legal_hold_emails` for reporting and exports.

### What happens when a hold is updated

Updating a hold recalculates membership:

- Newly matching emails are added to the hold.
- Emails that no longer match are removed from the hold.
- Hold flags (`isOnLegalHold`) are recalculated to respect overlaps with other active holds.

### What happens when a hold is released

Releasing a hold sets `removedAt` and **recalculates** the hold status for affected emails:

- Emails still matched by another active hold stay on hold.
- Emails that no longer match any active hold are cleared (`isOnLegalHold=false`).

Releasing is idempotent. Holds are not deleted, they are released.

## Visibility and reporting

The UI and API expose:

- Hold counts per case and per hold.
- The list of emails under a specific hold.
- A legal-hold badge in archived email lists and details.
- A search filter to show only held emails.

## Custodian notices and acknowledgements

Notices record that a custodian has been informed about a hold. Each notice can be acknowledged in the UI.

Automated reminders can be scheduled:

- `LEGAL_HOLD_NOTICE_REMINDER_FREQUENCY` controls when reminder jobs run.
- `LEGAL_HOLD_NOTICE_REMINDER_DAYS` controls how long to wait before sending a reminder.

Reminders create a new notice record with channel `reminder` and can be audited. Open Archiver does not send emails by itself; use an external notification system if you need delivery.

## Exports (eDiscovery)

Exports are created as jobs and stored in the configured storage backend.

Formats:

- `eml`: raw email source
- `mbox`: mailbox archive
- `json`: normalized JSON export

Each export includes:

- `manifest.json` with SHA-256 hashes for emails and attachments
- `metadata.json` describing the case and job
- The exported content in the chosen format

## Retention and deletion enforcement

Legal holds prevent deletion even if deletion is enabled:

- Archived emails on hold cannot be deleted.
- Ingestion sources cannot be deleted if any held emails exist.

Retention enforcement runs on a schedule (`RETENTION_FREQUENCY`) and skips held content.

Deletion still requires `ENABLE_DELETION=true`.

## Audit log verification

Audit log integrity verification runs on a schedule (`AUDIT_VERIFY_FREQUENCY`).
Recent verification status appears in the Audit Log screen.

## Storage immutability (WORM)

Storage immutability can be enabled to make tampering harder:

- `STORAGE_IMMUTABILITY_MODE=always` blocks all deletes in storage.
- Local storage uses read-only file permissions (best effort).
- S3 object lock can be enabled via `STORAGE_S3_OBJECT_LOCK_MODE` and `STORAGE_S3_OBJECT_LOCK_DAYS`.

## Using the UI

Navigate to `Dashboard -> Compliance -> Legal Holds`.

Suggested flow:

1. **Create a case** for the investigation or matter.
2. **Create a custodian** (optional but recommended).
3. **Create a legal hold**:
    - Select the case.
    - Optionally select a custodian.
    - Add one or more criteria fields.
    - Save the hold.
4. **Review hold membership** and send notices.
5. **Export** data if needed for discovery.
6. **Release the hold** when preservation is no longer required.

## API reference

See the [Compliance API documentation](../../api/compliance.md) for endpoints, request bodies, and permission requirements.

## Current limitations

- Notices and reminders are recorded for audit, but Open Archiver does not send emails.
- Local storage immutability is best-effort; use S3 Object Lock for stronger guarantees.
