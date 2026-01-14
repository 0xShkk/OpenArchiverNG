# System Settings

System settings allow administrators to configure the global look and theme of the application. These settings apply to all users.

## Permissions

Only users with the `manage` permission on the `settings` subject can change system settings. Other users can view the settings page in read-only mode. You can grant access by adding a policy like the following to a role:

```json
{ "action": "manage", "subject": "settings" }
```

## Where settings live

### UI-managed (persisted in the database)

These settings are stored in the `system_settings` table and persist across container restarts:

- Language (UI language selection)
- Default theme
- Support email
- Include Junk/Trash folders for IMAP ingestion
- Max email size
- Max preview size
- Max attachment size
- Legal hold reminder days
- Enable deletion (for permanent deletions)
- Delete from source after archive (destructive; requires provider delete permissions)

### Environment-managed (.env / Docker)

Security- and infrastructure-sensitive settings remain in `.env` and require a container restart to take effect. Examples include:

- `ENCRYPTION_KEY`, `STORAGE_ENCRYPTION_KEY`, `JWT_SECRET`
- `DATABASE_URL`, `REDIS_HOST`, `MEILI_HOST`, `MEILI_MASTER_KEY`
- `STORAGE_*` (backend selection, credentials, local path)
- `APP_URL`, `ORIGIN`
- `RATE_LIMIT_*`
- `TIKA_URL`

For the full list of environment variables, see the installation guide.

## Persistence and runtime behavior

- UI changes are saved to the database and survive container restarts.
- Most UI settings apply immediately to backend logic (ingestion limits, deletion guard, legal hold reminders).
- Language changes update the frontend immediately, but the backend language (API messages) only updates after a backend restart.

## Delete from source after archive

When enabled, OpenArchiver attempts to delete emails from the original mailbox **after** they have been successfully archived. This is destructive and irreversible.

Per-ingestion overrides are available on each ingestion source. You can choose to inherit the system setting, force-enable, or force-disable deletion for a specific source.

Provider requirements:
- IMAP: the authenticated user must have permission to delete messages in the mailbox.
- Google Workspace: the service account must have the Gmail modify scope (`https://www.googleapis.com/auth/gmail.modify`).
- Microsoft 365: the app must have `Mail.ReadWrite` application permission in Microsoft Graph.

Gmail deletion mode (configured per Google Workspace source):
- `Trash` moves messages to Gmail Trash (recoverable until Gmail purges it).
- `Permanent` deletes messages immediately.

## Configuration

### Language

This setting determines the default display language for the application UI. The selected language will be used for all interface elements, including menus, labels, and messages.

> **Important:** When the language is changed, the backend (API) language will only change after a restart of the server. The frontend will update immediately.

Supported languages:

- English
- German
- French
- Estonian
- Spanish
- Italian
- Portuguese
- Dutch
- Greek
- Japanese

### Default Theme

This setting controls the default color theme for the application. Users can choose between light, dark, or system default. The system default theme will sync with the user's operating system theme.

### Support Email

This setting allows administrators to provide a public-facing email address for user support inquiries. This email address may be displayed on error pages or in other areas where users may need to contact support.
