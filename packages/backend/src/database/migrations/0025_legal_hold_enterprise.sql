ALTER TYPE "public"."audit_log_target_type" ADD VALUE IF NOT EXISTS 'ExportJob';
--> statement-breakpoint
ALTER TYPE "public"."audit_log_target_type" ADD VALUE IF NOT EXISTS 'LegalHoldNotice';
--> statement-breakpoint
ALTER TYPE "public"."audit_log_target_type" ADD VALUE IF NOT EXISTS 'AuditLogVerification';
--> statement-breakpoint
ALTER TYPE "public"."audit_log_target_type" ADD VALUE IF NOT EXISTS 'RetentionPolicy';
--> statement-breakpoint
CREATE TABLE "legal_hold_emails" (
	"hold_id" uuid NOT NULL,
	"email_id" uuid NOT NULL,
	"matched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"matched_by_identifier" text,
	CONSTRAINT "legal_hold_emails_hold_id_email_id_pk" PRIMARY KEY("hold_id","email_id")
);
--> statement-breakpoint
CREATE INDEX "legal_hold_emails_hold_id_idx" ON "legal_hold_emails" ("hold_id");
--> statement-breakpoint
CREATE INDEX "legal_hold_emails_email_id_idx" ON "legal_hold_emails" ("email_id");
--> statement-breakpoint
CREATE INDEX "legal_hold_emails_active_idx" ON "legal_hold_emails" ("hold_id","removed_at");
--> statement-breakpoint
CREATE TABLE "legal_hold_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hold_id" uuid NOT NULL,
	"custodian_id" uuid NOT NULL,
	"channel" text DEFAULT 'manual' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_by_identifier" text NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by_identifier" text,
	"notes" text
);
--> statement-breakpoint
CREATE INDEX "legal_hold_notices_hold_id_idx" ON "legal_hold_notices" ("hold_id");
--> statement-breakpoint
CREATE INDEX "legal_hold_notices_custodian_id_idx" ON "legal_hold_notices" ("custodian_id");
--> statement-breakpoint
CREATE TABLE "audit_log_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"ok" boolean DEFAULT false NOT NULL,
	"message" text,
	"failed_log_id" bigint,
	"verified_by_identifier" text
);
--> statement-breakpoint
CREATE INDEX "audit_log_verifications_ok_idx" ON "audit_log_verifications" ("ok");
--> statement-breakpoint
ALTER TABLE "legal_hold_emails" ADD CONSTRAINT "legal_hold_emails_hold_id_legal_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."legal_holds"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "legal_hold_emails" ADD CONSTRAINT "legal_hold_emails_email_id_archived_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."archived_emails"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "legal_hold_notices" ADD CONSTRAINT "legal_hold_notices_hold_id_legal_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."legal_holds"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "legal_hold_notices" ADD CONSTRAINT "legal_hold_notices_custodian_id_custodians_id_fk" FOREIGN KEY ("custodian_id") REFERENCES "public"."custodians"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_log_verifications" ADD CONSTRAINT "audit_log_verifications_failed_log_id_audit_logs_id_fk" FOREIGN KEY ("failed_log_id") REFERENCES "public"."audit_logs"("id") ON DELETE set null ON UPDATE no action;
