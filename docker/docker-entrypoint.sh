#!/bin/sh

# Exit immediately if a command exits with a non-zero status
set -e

# Fail fast if encryption keys are missing or if key files are present.
KEY_DIR=""
ENCRYPTION_FILE=""
STORAGE_ENCRYPTION_FILE=""

if [ -n "$STORAGE_LOCAL_ROOT_PATH" ]; then
	KEY_DIR="${STORAGE_LOCAL_ROOT_PATH%/}/.open-archiver"
	ENCRYPTION_FILE="${KEY_DIR}/encryption_key"
	STORAGE_ENCRYPTION_FILE="${KEY_DIR}/storage_encryption_key"
fi

if [ -n "$ENCRYPTION_FILE" ] && [ -f "$ENCRYPTION_FILE" ]; then
	echo "Found ENCRYPTION_KEY file at $ENCRYPTION_FILE." >&2
	echo "Copy its value into .env and delete the file before starting." >&2
	exit 1
fi

if [ -n "$STORAGE_ENCRYPTION_FILE" ] && [ -f "$STORAGE_ENCRYPTION_FILE" ]; then
	echo "Found STORAGE_ENCRYPTION_KEY file at $STORAGE_ENCRYPTION_FILE." >&2
	echo "Copy its value into .env and delete the file before starting." >&2
	exit 1
fi

if [ -z "$ENCRYPTION_KEY" ] || [ -z "$STORAGE_ENCRYPTION_KEY" ]; then
	if [ -z "$KEY_DIR" ]; then
		echo "Missing encryption keys and STORAGE_LOCAL_ROOT_PATH is not set. Aborting." >&2
		exit 1
	fi

	mkdir -p "$KEY_DIR"
	umask 077

	if [ -z "$ENCRYPTION_KEY" ]; then
		while :; do
			ENCRYPTION_KEY="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
			[ "$ENCRYPTION_KEY" != "$STORAGE_ENCRYPTION_KEY" ] && break
		done
		echo "$ENCRYPTION_KEY" > "$ENCRYPTION_FILE"
		echo "ENCRYPTION_KEY is not set. Generated key at $ENCRYPTION_FILE." >&2
	fi

	if [ -z "$STORAGE_ENCRYPTION_KEY" ]; then
		while :; do
			STORAGE_ENCRYPTION_KEY="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
			[ "$STORAGE_ENCRYPTION_KEY" != "$ENCRYPTION_KEY" ] && break
		done
		echo "$STORAGE_ENCRYPTION_KEY" > "$STORAGE_ENCRYPTION_FILE"
		echo "STORAGE_ENCRYPTION_KEY is not set. Generated key at $STORAGE_ENCRYPTION_FILE." >&2
	fi

	echo "Copy the generated keys into .env and delete the files before starting." >&2
	exit 1
fi

if [ "$ENCRYPTION_KEY" = "$STORAGE_ENCRYPTION_KEY" ]; then
	echo "ENCRYPTION_KEY and STORAGE_ENCRYPTION_KEY must be different values." >&2
	exit 1
fi

# Normalize ORIGIN from APP_URL when available (SvelteKit requires origin only, no path).
if [ -n "$APP_URL" ]; then
	APP_ORIGIN="$(node -e "try { const u = new URL(process.env.APP_URL); console.log(u.origin); } catch { }")"
	if [ -n "$APP_ORIGIN" ]; then
		if [ -z "$ORIGIN" ] || [ "$ORIGIN" != "$APP_ORIGIN" ]; then
			export ORIGIN="$APP_ORIGIN"
		fi
	fi
fi

# Run pnpm install to ensure all dependencies, including native addons,
# are built for the container's architecture. This is crucial for
# multi-platform Docker images, as it prevents "exec format error"
# when running on a different architecture than the one used for building.
pnpm install --frozen-lockfile --prod

# Run database migrations before starting the application to prevent
# race conditions where the app starts before the database is ready.
pnpm --filter @open-archiver/backend db:migrate

# Execute the main container command
exec "$@"
