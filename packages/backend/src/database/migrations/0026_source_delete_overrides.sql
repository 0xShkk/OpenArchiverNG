CREATE TYPE "public"."gmail_delete_mode" AS ENUM('permanent', 'trash');
--> statement-breakpoint
ALTER TABLE "ingestion_sources" ADD COLUMN "delete_from_source_after_archive_override" boolean;
--> statement-breakpoint
ALTER TABLE "ingestion_sources" ADD COLUMN "gmail_delete_mode" "public"."gmail_delete_mode";
