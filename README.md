# Open Archiver NG

Maintained version of [Open Archiver](https://github.com/LogicLabs-OU/OpenArchiver)

**A secure, sovereign, and open-source platform for email archiving.**

Open Archiver provides a robust, self-hosted solution for archiving, storing, indexing, and searching emails from major platforms, including Google Workspace (Gmail), Microsoft 365, PST files, as well as generic IMAP-enabled email inboxes. Use Open Archiver to keep a permanent, tamper-proof record of your communication history, free from vendor lock-in.

## ✨ Key Features

- **Universal Ingestion**: Connect to any email provider to perform initial bulk imports and maintain continuous, real-time synchronization. Ingestion sources include:
    - IMAP connection
    - Google Workspace
    - Microsoft 365
    - PST files
    - Zipped .eml files
    - Mbox files

- **Secure & Efficient Storage**: Emails are stored in the standard `.eml` format. The system uses deduplication and compression to minimize storage costs. All files are encrypted at rest.
- **Pluggable Storage Backends**: Support both local filesystem storage and S3-compatible object storage (like AWS S3 or MinIO).
- **Powerful Search & eDiscovery**: A high-performance search engine indexes the full text of emails and attachments (PDF, DOCX, etc.).
- **Thread discovery**: The ability to discover if an email belongs to a thread/conversation and present the context.
- **Compliance & Retention**: Define granular retention policies to automatically manage the lifecycle of your data. Place legal holds on communications to prevent deletion during litigation.
- **File Hash and Encryption**: Email and attachment file hash values are stored in the meta database upon ingestion, meaning any attempt to alter the file content will be identified, ensuring legal and regulatory compliance.
-   - Each archived email comes with an "Integrity Report" feature that indicates if the files are original.
- **Comprehensive Auditing**: An immutable audit trail logs all system activities, ensuring you have a clear record of who accessed what and when.

## 🛠️ Tech Stack

Open Archiver is built on a modern, scalable, and maintainable technology stack:

- **Frontend**: SvelteKit with Svelte 5
- **Backend**: Node.js with Express.js & TypeScript
- **Job Queue**: BullMQ on Redis for robust, asynchronous processing. (We use Valkey as the Redis service in the Docker Compose deployment mode, but you can use Redis as well.)
- **Search Engine**: Meilisearch for blazingly fast and resource-efficient search
- **Database**: PostgreSQL for metadata, user management, and audit logs
- **Deployment**: Docker Compose deployment

## 📦 Deployment

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
- A server or local machine with at least 4GB of RAM (2GB of RAM if you use external Postgres, Redis (Valkey) and Meilisearch instances).

### Installation

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/LogicLabs-OU/OpenArchiver.git
    cd OpenArchiver
    ```

2.  **Configure your environment:**
    Copy the example environment file and customize it with your settings.

    ```bash
    cp .env.example .env
    ```

    You will need to edit the `.env` file to set your admin passwords, secret keys, and other essential configuration. Read the .env.example for how to set up. `ENCRYPTION_KEY` and `STORAGE_ENCRYPTION_KEY` are required; the container will refuse to start if either is missing or if legacy key files are present. If a key is missing on first run, the container will generate a key file under `${STORAGE_LOCAL_ROOT_PATH}/.open-archiver/` and exit; copy it into `.env` and delete the file before starting again.

3.  **Run the application:**

    ```bash
    docker compose build
    docker compose up -d
    ```

    This builds the local Open Archiver image and then starts all the services (frontend, backend, database, etc.) in the background.

4.  **Access the application:**
    Once the services are running, you can access the Open Archiver web interface by navigating to `http://localhost:3000` in your web browser.

### Storage & Data Location

- **Local storage** (`STORAGE_TYPE=local`): archived emails and attachments are stored on the host at `${STORAGE_LOCAL_ROOT_PATH}/open-archiver/`.
- **S3 storage** (`STORAGE_TYPE=s3`): data is stored in your bucket under the `open-archiver/` prefix.
- **Metadata & indexes**: Postgres (`pgdata`), Valkey (`valkeydata`), and Meilisearch (`meilidata`) are stored in Docker volumes.

### Resetting a Local Deployment (Destructive)

- **Full reset**: `docker compose down -v`, then delete `${STORAGE_LOCAL_ROOT_PATH}/open-archiver` (and `${STORAGE_LOCAL_ROOT_PATH}/.open-archiver` if present).
- **Settings-only reset**: remove the `pgdata` volume (keeps archived files but resets users/settings).
- **Caution**: changing `ENCRYPTION_KEY` or `STORAGE_ENCRYPTION_KEY` makes existing encrypted data unreadable.

## 🧪 Docker-only Development

Use the dev compose override to run the app from source with hot reload (no host Node required).

1.  **Configure your environment:**

    ```bash
    cp .env.example .env
    ```

2.  **Run the dev stack:**

    ```bash
    docker compose -f docker-compose.yml -f docker-compose.dev.yml up
    ```

    Frontend runs on `http://localhost:3000`, API on `http://localhost:4000`.

3.  **Optional workers:**

    ```bash
    docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile workers up
    ```

## ⚙️ Data Source Configuration

After deploying the application, you will need to configure one or more ingestion sources to begin archiving emails. Follow our detailed guides to connect to your email provider:

- [Connecting to Google Workspace](https://docs.openarchiver.com/user-guides/email-providers/google-workspace.html)
- [Connecting to Microsoft 365](https://docs.openarchiver.com/user-guides/email-providers/imap.html)
- [Connecting to a Generic IMAP Server](https://docs.openarchiver.com/user-guides/email-providers/imap.html)

