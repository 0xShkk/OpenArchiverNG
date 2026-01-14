# Installation Guide

This guide will walk you through setting up Open Archiver using Docker Compose. This is the recommended method for deploying the application.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) installed on your server or local machine.
- A server or local machine with at least 4GB of RAM (2GB of RAM if you use external Postgres, Redis (Valkey) and Meilisearch instances).
- [Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git) installed on your server or local machine.

## 1. Clone the Repository

First, clone the Open Archiver repository to your machine:

```bash
git clone https://github.com/LogicLabs-OU/OpenArchiver.git
cd OpenArchiver
```

## 2. Create a Directory for Local Storage (Important)

Before configuring the application, you **must** create a directory on your host machine where Open Archiver will store its data (such as emails and attachments). Manually creating this directory helps prevent potential permission issues.

For example, you can use this path `/var/data/open-archiver`.

Run the following commands to create the directory and set the correct permissions:

```bash
sudo mkdir -p /var/data/open-archiver
sudo chown -R $(id -u):$(id -g) /var/data/open-archiver
```

This ensures the directory is owned by your current user, which is necessary for the application to have write access. You will set this path in your `.env` file in the next step.

## 3. Configure Your Environment

The application is configured using environment variables. You'll need to create a `.env` file to store your configuration.

Copy the example environment file:

```bash
cp .env.example .env
```

Now, open the `.env` file in a text editor and customize the settings.

### Key Configuration Steps

1.  **Set the Storage Path**: Find the `STORAGE_LOCAL_ROOT_PATH` variable and set it to the path you just created.

    ```env
    STORAGE_LOCAL_ROOT_PATH=/var/data/open-archiver
    ```

2.  **Secure Your Instance**: You must change the following placeholder values to secure your instance:

- `POSTGRES_PASSWORD`: A strong, unique password for the database.
- `REDIS_PASSWORD`: A strong, unique password for the Valkey/Redis service.
- `MEILI_MASTER_KEY`: A complex key for Meilisearch.
- `JWT_SECRET`: A long, random string for signing authentication tokens.
- `ENCRYPTION_KEY`: A 32-byte hex string for encrypting sensitive data in the database. This is required; the container will refuse to start if it is missing. If it is missing on first run, the container will generate a key file at `${STORAGE_LOCAL_ROOT_PATH}/.open-archiver/encryption_key` and exit. Copy it into `.env` and delete the file before starting again. You can also generate one with the following command:
    ```bash
    openssl rand -hex 32
    ```
- `STORAGE_ENCRYPTION_KEY`: A 32-byte hex string for encrypting emails and attachments at rest. This is required; the container will refuse to start if it is missing. If it is missing on first run, the container will generate a key file at `${STORAGE_LOCAL_ROOT_PATH}/.open-archiver/storage_encryption_key` and exit. Copy it into `.env` and delete the file before starting again. You can generate one with:
    ```bash
    openssl rand -hex 32
    ```

3.  **Postgres Password Changes**: If you change `POSTGRES_PASSWORD` after a successful first run, the existing database volume keeps the old credentials. Remove the `pgdata` volume or run an `ALTER USER` on Postgres to apply the new password.

### Storage Configuration

By default, the Docker Compose setup uses local filesystem storage and bind-mounts `STORAGE_LOCAL_ROOT_PATH` into the container. Archived emails and attachments are stored at `${STORAGE_LOCAL_ROOT_PATH}/open-archiver/` on the host.

If you want to use S3-compatible object storage, change the `STORAGE_TYPE` to `s3` and fill in your S3 credentials (`STORAGE_S3_*` variables). When `STORAGE_TYPE` is set to `local`, the S3-related variables are not required.

To store data in a different host folder, update `STORAGE_LOCAL_ROOT_PATH` in `.env` and ensure the directory exists and is writable.

### Using External Services

For convenience, the `docker-compose.yml` file includes services for PostgreSQL, Valkey (Redis), and Meilisearch. However, you can use your own external or managed instances for these services.

To do so:

1.  **Update your `.env` file**: Change the host, port, and credential variables to point to your external service instances. For example, you would update `DATABASE_URL`, `REDIS_HOST`, and `MEILI_HOST`.
2.  **Modify `docker-compose.yml`**: Remove or comment out the service definitions for `postgres`, `valkey`, and `meilisearch` from your `docker-compose.yml` file.

This will configure the Open Archiver application to connect to your services instead of starting the default ones.

### Environment Variable Reference

Here is a complete list of environment variables available for configuration:

#### Application Settings

| Variable                | Description                                                                                           | Default Value           |
| ----------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------- |
| `NODE_ENV`              | The application environment.                                                                          | `development`           |
| `PORT_BACKEND`          | The port for the backend service.                                                                     | `4000`                  |
| `PORT_FRONTEND`         | The port for the frontend service.                                                                    | `3000`                  |
| `APP_URL`               | The public-facing URL of your application. This is used by the backend to configure CORS.             | `http://localhost:3000` |
| `ORIGIN`                | Used by the SvelteKit Node adapter. Set to the origin only (scheme + host + port) of `APP_URL`.       | `http://localhost:3000` |
| `SYNC_FREQUENCY`        | The frequency of continuous email syncing. See [cron syntax](https://crontab.guru/) for more details. | `* * * * *`             |
| `MAX_EMAIL_BYTES`       | Skip parsing/indexing for emails larger than this size.                                               | `25M`                   |
| `MAX_PREVIEW_BYTES`     | Skip loading raw email previews larger than this size.                                                | `10M`                   |
| `MAX_ATTACHMENT_BYTES`  | Skip attachment text extraction larger than this size.                                                | `50M`                   |
| `ALL_INCLUSIVE_ARCHIVE` | Set to `true` to include all emails, including Junk and Trash folders, in the email archive.          | `false`                 |

#### Docker Compose Service Configuration

These variables are used by `docker-compose.yml` to configure the services.

| Variable                            | Description                                               | Default Value                                            |
| ----------------------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| `POSTGRES_DB`                       | The name of the PostgreSQL database.                      | `open_archive`                                           |
| `POSTGRES_USER`                     | The username for the PostgreSQL database.                 | `admin`                                                  |
| `POSTGRES_PASSWORD`                 | The password for the PostgreSQL database.                 | `password`                                               |
| `DATABASE_URL`                      | The connection URL for the PostgreSQL database.           | `postgresql://admin:password@postgres:5432/open_archive` |
| `MEILI_MASTER_KEY`                  | The master key for Meilisearch.                           | `aSampleMasterKey`                                       |
| `MEILI_HOST`                        | The host for the Meilisearch service.                     | `http://meilisearch:7700`                                |
| `MEILI_INDEXING_BATCH`              | The number of emails to batch together for indexing.      | `500`                                                    |
| `MEILI_INDEXING_CONCURRENCY`        | Concurrent parsing of emails per batch.                   | `4`                                                      |
| `MEILI_INDEXING_WORKER_CONCURRENCY` | Concurrent indexing jobs processed by the worker.         | `2`                                                      |
| `MEILI_INDEXING_MAX_QUEUE`          | Pause ingestion when indexing backlog exceeds this count. | `2000`                                                   |
| `REDIS_HOST`                        | The host for the Valkey (Redis) service.                  | `valkey`                                                 |
| `REDIS_PORT`                        | The port for the Valkey (Redis) service.                  | `6379`                                                   |
| `REDIS_PASSWORD`                    | The password for the Valkey (Redis) service.              | `defaultredispassword`                                   |
| `REDIS_TLS_ENABLED`                 | Enable or disable TLS for Redis.                          | `false`                                                  |

#### Storage Settings

| Variable                       | Description                                                                                                                                                                                                                                                    | Default Value             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `STORAGE_TYPE`                 | The storage backend to use (`local` or `s3`).                                                                                                                                                                                                                  | `local`                   |
| `BODY_SIZE_LIMIT`              | The maximum request body size for uploads. Can be a number in bytes or a string with a unit (e.g., `100M`).                                                                                                                                                    | `100M`                    |
| `STORAGE_LOCAL_ROOT_PATH`      | The root path for Open Archiver app data.                                                                                                                                                                                                                      | `/var/data/open-archiver` |
| `STORAGE_S3_ENDPOINT`          | The endpoint for S3-compatible storage (required if `STORAGE_TYPE` is `s3`).                                                                                                                                                                                   |                           |
| `STORAGE_S3_BUCKET`            | The bucket name for S3-compatible storage (required if `STORAGE_TYPE` is `s3`).                                                                                                                                                                                |                           |
| `STORAGE_S3_ACCESS_KEY_ID`     | The access key ID for S3-compatible storage (required if `STORAGE_TYPE` is `s3`).                                                                                                                                                                              |                           |
| `STORAGE_S3_SECRET_ACCESS_KEY` | The secret access key for S3-compatible storage (required if `STORAGE_TYPE` is `s3`).                                                                                                                                                                          |                           |
| `STORAGE_S3_REGION`            | The region for S3-compatible storage (required if `STORAGE_TYPE` is `s3`).                                                                                                                                                                                     |                           |
| `STORAGE_S3_FORCE_PATH_STYLE`  | Force path-style addressing for S3 (optional).                                                                                                                                                                                                                 | `false`                   |
| `STORAGE_ENCRYPTION_KEY`       | A 32-byte hex string for AES-256 encryption of files at rest. Required. If missing on first run, a key file is generated at `${STORAGE_LOCAL_ROOT_PATH}/.open-archiver/storage_encryption_key`; copy it into `.env` and delete the file before starting again. |                           |

#### Security & Authentication

| Variable                         | Description                                                                                                                                                                                                                                                  | Default Value                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `ENABLE_DELETION`                | Enable or disable deletion of emails and ingestion sources. If this option is not set, or is set to any value other than `true`, deletion will be disabled for the entire instance.                                                                          | `false`                                    |
| `DELETE_FROM_SOURCE_AFTER_ARCHIVE` | Delete emails from the source mailbox after they are archived. Requires provider delete permissions (IMAP delete, Gmail modify scope, or Microsoft Graph `Mail.ReadWrite`).                                                                                   | `false`                                    |
| `JWT_SECRET`                     | A secret key for signing JWT tokens.                                                                                                                                                                                                                         | `a-very-secret-key-that-you-should-change` |
| `JWT_EXPIRES_IN`                 | The expiration time for JWT tokens.                                                                                                                                                                                                                          | `7d`                                       |
| ~~`SUPER_API_KEY`~~ (Deprecated) | An API key with super admin privileges. (The SUPER_API_KEY is deprecated since v0.3.0 after we roll out the role-based access control system.)                                                                                                               |                                            |
| `RATE_LIMIT_WINDOW_MS`           | The window in milliseconds for which API requests are checked.                                                                                                                                                                                               | `60000` (1 minute)                         |
| `RATE_LIMIT_MAX_REQUESTS`        | The maximum number of API requests allowed from an IP within the window.                                                                                                                                                                                     | `100`                                      |
| `ENCRYPTION_KEY`                 | A 32-byte hex string for encrypting sensitive data in the database. Required. If missing on first run, a key file is generated at `${STORAGE_LOCAL_ROOT_PATH}/.open-archiver/encryption_key`; copy it into `.env` and delete the file before starting again. |                                            |
| `QUEUE_LOCK_DURATION_MS`         | Job lock duration for long-running queues.                                                                                                                                                                                                                   | `600000`                                   |
| `QUEUE_LOCK_RENEW_TIME_MS`       | How often workers renew job locks.                                                                                                                                                                                                                           | `60000`                                    |
| `QUEUE_STALLED_INTERVAL_MS`      | Interval for stalled job checks.                                                                                                                                                                                                                             | `60000`                                    |
| `QUEUE_MAX_STALLED_COUNT`        | Max stalled retries before failing a job.                                                                                                                                                                                                                    | `3`                                        |
| `QUEUE_JOB_TIMEOUT_MS`           | Timeout for long-running jobs.                                                                                                                                                                                                                               | `3600000`                                  |
| `INGESTION_WORKER_CONCURRENCY`   | Concurrent ingestion jobs per worker.                                                                                                                                                                                                                        | `2`                                        |

#### Apache Tika Integration

| Variable   | Description                                                                                                                                                                          | Default Value      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| `TIKA_URL` | Optional. The URL of an Apache Tika server for advanced text extraction from attachments. If not set, the application falls back to built-in parsers for PDF, Word, and Excel files. | `http://tika:9998` |

## 4. Run the Application

Once you have configured your `.env` file, you can start all the services using Docker Compose:

```bash
docker compose build
docker compose up -d
```

This command will:

- Build the local Open Archiver image and start the services.
- Create and start the containers in the background (`-d` flag).
- Create the persistent volumes for your data.

You can check the status of the running containers with:

```bash
docker compose ps
```

## 5. Access the Application

Once the services are running, you can access the Open Archiver web interface by navigating to `http://localhost:3000` in your web browser.

Upon first visit, you will be redirected to the `/setup` page where you can set up your admin account. Make sure you are the first person who accesses the instance.

If you are not redirected to the `/setup` page but instead see the login page, there might be something wrong with the database. Restart the service and try again.

## 6. Next Steps

After successfully deploying and logging into Open Archiver, the next step is to configure your ingestion sources to start archiving emails.

- [Connecting to Google Workspace](./email-providers/google-workspace.md)
- [Connecting to Microsoft 365](./email-providers/microsoft-365.md)
- [Connecting to a Generic IMAP Server](./email-providers/imap.md)

## Updating Your Installation

To update your Open Archiver instance to the latest version, run the following commands:

```bash
# Pull the latest changes from the repository
git pull

# Rebuild and restart the services with the new code
docker compose build
docker compose up -d
```

## Deploying on Coolify

If you are deploying Open Archiver on [Coolify](https://coolify.io/), it is recommended to let Coolify manage the Docker networks for you. This can help avoid potential routing conflicts and simplify your setup.

To do this, you will need to make a small modification to your `docker-compose.yml` file.

### Modify `docker-compose.yml` for Coolify

1.  **Open your `docker-compose.yml` file** in a text editor.

2.  **Remove all `networks` sections** from the file. This includes the network configuration for each service and the top-level network definition.

    Specifically, you need to remove:
    - The `networks: - open-archiver-net` lines from the `open-archiver`, `postgres`, `valkey`, and `meilisearch` services.
    - The entire `networks:` block at the end of the file.

    Here is an example of what to remove from a service:

    ```diff
    services:
      open-archiver:
        build:
          context: .
          dockerfile: apps/open-archiver/Dockerfile
        # ... other settings
    -   networks:
    -     - open-archiver-net
    ```

    And remove this entire block from the end of the file:

    ```diff
    - networks:
    -   open-archiver-net:
    -     driver: bridge
    ```

3.  **Save the modified `docker-compose.yml` file.**

By removing these sections, you allow Coolify to automatically create and manage the necessary networks, ensuring that all services can communicate with each other and are correctly exposed through Coolify's reverse proxy.

After making these changes, you can proceed with deploying your application on Coolify as you normally would.

## Where is my data stored (When using local storage and Docker)?

When `STORAGE_TYPE=local`, the compose file bind-mounts `STORAGE_LOCAL_ROOT_PATH` into the container, so archived emails and attachments are stored directly on the host at `${STORAGE_LOCAL_ROOT_PATH}/open-archiver/`.

If key files are generated on first run, they are stored at `${STORAGE_LOCAL_ROOT_PATH}/.open-archiver/` until you copy them into `.env` and delete the files.

Metadata and search indexes are stored in Docker volumes:

- `pgdata` for Postgres
- `valkeydata` for Valkey/Redis
- `meilidata` for Meilisearch

You can inspect Docker volumes with:

```bash
docker volume ls
docker volume inspect <volume_name>
```
