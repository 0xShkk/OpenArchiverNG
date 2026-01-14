# Archive Exports & Backups

Archive exports create a **snapshot** of your archived emails so you can back up the archive or migrate it to another system. Only archived email data and attachments are included.

## Permissions

Archive exports require:

- `read` on `archive` to view export jobs
- `export` on `archive` to create and download exports

## How it works

- A snapshot timestamp is captured when the export job is created.
- The export includes emails archived **up to** that snapshot time.
- New emails ingested after the snapshot are not included in that export.

## Formats

Archive exports support:

- **EML (zip)**: Individual `.eml` files in a zip archive. Attachments are embedded in the EML content.
- **MBOX**: A single `export.mbox` file inside the zip.
- **JSON + payloads**: A JSON file with metadata and file paths, plus raw EML and attachment payloads in the zip.

## Output structure

Each export zip includes:

- `metadata.json`: Export job metadata and snapshot time.
- `summary.json`: Counts and a summary of the export.
- `manifest.jsonl`: Line-delimited JSON for each email and its attachments.
- `eml/`: Raw EML files (EML + JSON formats).
- `attachments/`: Raw attachment binaries (JSON format).
- `export.mbox`: MBOX file (MBOX format).
- `export.json`: JSON metadata (JSON format).

## Create an export (UI)

1. Go to **Dashboard → Admin → Archive Exports**.
2. Click **Create Archive Export**.
3. Select a format and save.
4. Download the zip once the job is marked **completed**.

## Import into another Open Archiver

Use the **EML Import** ingestion type:

1. Download the archive export zip (EML or JSON format).
2. Go to **Ingestions → Create New → EML Import**.
3. Upload the zip and start the import.

The EML import preserves folder structure as mailbox paths in the new archive.

If you exported **MBOX**, extract `export.mbox` from the zip and use the **MBOX Import** ingestion type.

## Import into other programs

- Use **EML** or **MBOX** exports for broad compatibility.
- PST is **not** generated directly; convert EML or MBOX to PST using your preferred mail tooling if needed.

## Storage location

Exports are stored in your configured storage backend under:

`open-archiver/archive-exports/<job-id>/export.zip`

Keep exports secured and delete them when they are no longer needed.
