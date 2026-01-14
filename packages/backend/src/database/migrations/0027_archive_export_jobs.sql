ALTER TYPE "public"."audit_log_target_type" ADD VALUE IF NOT EXISTS 'ArchiveExportJob';
--> statement-breakpoint
CREATE TABLE "archive_export_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"format" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"snapshot_at" timestamp with time zone DEFAULT now() NOT NULL,
	"file_path" text,
	"email_count" bigint,
	"attachment_count" bigint,
	"error_message" text,
	"created_by_identifier" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
