# Archive Exports API

All endpoints are prefixed with `/api/v1/archive-exports`.

## Permissions

- `read` on `archive` to list archive export jobs
- `export` on `archive` to create and download exports

## GET `/`

List archive export jobs.

Query params: `page`, `limit`

## POST `/`

Create an archive export job.

```json
{
	"format": "eml"
}
```

Valid formats: `eml`, `mbox`, `json`.

## GET `/:id/download`

Download the completed export zip.
