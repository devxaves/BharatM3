CREATE TABLE "app_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recommendation_id" uuid NOT NULL,
	"queue" text NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"assignee_id" uuid,
	"due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "approval_tasks_recommendation_id_unique" UNIQUE("recommendation_id")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"actor_name" text NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"reason" text,
	"payload" jsonb NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL,
	CONSTRAINT "audit_events_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "canonical_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cnmc" text NOT NULL,
	"short_code" text NOT NULL,
	"canonical_description" text NOT NULL,
	"category_code" text NOT NULL,
	"subtype" text,
	"unspsc_code" text,
	"attributes" jsonb NOT NULL,
	"base_uom" text,
	"status" text DEFAULT 'APPROVED' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"est_annual_value_inr" double precision,
	"created_by" uuid,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canonical_materials_cnmc_unique" UNIQUE("cnmc"),
	CONSTRAINT "canonical_materials_short_code_unique" UNIQUE("short_code")
);
--> statement-breakpoint
CREATE TABLE "category_attribute_schemas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_code" text NOT NULL,
	"version" integer NOT NULL,
	"schema" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classification_master" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_code" text NOT NULL,
	"subtype" text,
	"unspsc_code" text NOT NULL,
	"unspsc_title" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"source_system_id" uuid,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"row_count" integer NOT NULL,
	"inserted" integer DEFAULT 0 NOT NULL,
	"skipped_duplicates" integer DEFAULT 0 NOT NULL,
	"rejected" integer DEFAULT 0 NOT NULL,
	"column_mapping" jsonb,
	"status" text DEFAULT 'INGESTED' NOT NULL,
	"stats" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_a_id" uuid NOT NULL,
	"record_b_id" uuid NOT NULL,
	"pair_key" text NOT NULL,
	"category_code" text NOT NULL,
	"match_type" text NOT NULL,
	"raw_score" real NOT NULL,
	"final_score" real NOT NULL,
	"component_scores" jsonb NOT NULL,
	"effective_weights" jsonb NOT NULL,
	"deterministic_rule" text,
	"vetoed" boolean DEFAULT false NOT NULL,
	"vetoes" jsonb NOT NULL,
	"substitutions" jsonb NOT NULL,
	"attribute_diff" jsonb NOT NULL,
	"reason_codes" jsonb NOT NULL,
	"explanation" text NOT NULL,
	"routing" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"proposed_cnmc" text,
	"proposed_description" text,
	"decision_note" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"model_version_id" uuid,
	"run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matching_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_version_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"batch_id" uuid,
	"triggered_by" uuid,
	"records_considered" integer DEFAULT 0 NOT NULL,
	"candidates_evaluated" integer DEFAULT 0 NOT NULL,
	"recommendations_written" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"stats" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "material_attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"normalized_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value_text" text,
	"value_num" double precision,
	"unit" text,
	"confidence" real NOT NULL,
	"source" text NOT NULL,
	"raw" text
);
--> statement-breakpoint
CREATE TABLE "material_categories" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"cnmc_prefix" text NOT NULL,
	"default_unspsc" text,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "material_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_id" uuid NOT NULL,
	"raw_record_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"legacy_code" text NOT NULL,
	"match_type" text NOT NULL,
	"confidence" real NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"recommendation_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversed_by" uuid,
	"reversal_reason" text
);
--> statement-breakpoint
CREATE TABLE "model_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matcher_version" text NOT NULL,
	"embedding_model" text NOT NULL,
	"weights" jsonb NOT NULL,
	"thresholds" jsonb NOT NULL,
	"config" jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "normalized_material_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_id" uuid NOT NULL,
	"cleaned_text" text NOT NULL,
	"normalized_description" text NOT NULL,
	"tokens" jsonb NOT NULL,
	"expansions" jsonb NOT NULL,
	"category_code" text NOT NULL,
	"category_confidence" real NOT NULL,
	"classifier_reasons" jsonb NOT NULL,
	"attributes" jsonb NOT NULL,
	"attribute_fingerprint" text,
	"missing_required" jsonb NOT NULL,
	"completeness" real NOT NULL,
	"uom_original" text,
	"base_uom" text,
	"uom_dimension" text NOT NULL,
	"uom_factor" double precision DEFAULT 1 NOT NULL,
	"quality_flags" jsonb NOT NULL,
	"embedding" vector(256),
	"embedding_model" text,
	"proposed_description" text,
	"pipeline_version" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "normalized_material_records_raw_id_unique" UNIQUE("raw_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sector" text NOT NULL,
	"ministry" text,
	"hq" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "raw_material_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"source_system_id" uuid,
	"batch_id" uuid,
	"legacy_code" text NOT NULL,
	"raw_description" text NOT NULL,
	"raw_long_text" text,
	"raw_uom" text,
	"raw_manufacturer" text,
	"raw_part_number" text,
	"raw_material_group" text,
	"last_po_price_inr" double precision,
	"annual_qty" double precision,
	"raw_payload" jsonb,
	"row_hash" text NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"permissions" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_systems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"system_type" text NOT NULL,
	"version" text,
	"client" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "substitution_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_code" text NOT NULL,
	"attribute_key" text NOT NULL,
	"from_value" text NOT NULL,
	"to_value" text NOT NULL,
	"bidirectional" boolean DEFAULT false NOT NULL,
	"rationale" text NOT NULL,
	"approved_by" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "synonym_master" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term" text NOT NULL,
	"expansion" text NOT NULL,
	"kind" text NOT NULL,
	"category_code" text,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uom_master" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"dimension" text NOT NULL,
	"base_code" text NOT NULL,
	"factor_to_base" double precision NOT NULL,
	"iso_code" text NOT NULL,
	"aliases" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"org_id" uuid,
	"designation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "app_config" ADD CONSTRAINT "app_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_tasks" ADD CONSTRAINT "approval_tasks_recommendation_id_match_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."match_recommendations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_tasks" ADD CONSTRAINT "approval_tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canonical_materials" ADD CONSTRAINT "canonical_materials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canonical_materials" ADD CONSTRAINT "canonical_materials_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_attribute_schemas" ADD CONSTRAINT "category_attribute_schemas_category_code_material_categories_code_fk" FOREIGN KEY ("category_code") REFERENCES "public"."material_categories"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_batches" ADD CONSTRAINT "ingestion_batches_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_batches" ADD CONSTRAINT "ingestion_batches_source_system_id_source_systems_id_fk" FOREIGN KEY ("source_system_id") REFERENCES "public"."source_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_batches" ADD CONSTRAINT "ingestion_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_recommendations" ADD CONSTRAINT "match_recommendations_record_a_id_raw_material_records_id_fk" FOREIGN KEY ("record_a_id") REFERENCES "public"."raw_material_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_recommendations" ADD CONSTRAINT "match_recommendations_record_b_id_raw_material_records_id_fk" FOREIGN KEY ("record_b_id") REFERENCES "public"."raw_material_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_recommendations" ADD CONSTRAINT "match_recommendations_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_recommendations" ADD CONSTRAINT "match_recommendations_model_version_id_model_versions_id_fk" FOREIGN KEY ("model_version_id") REFERENCES "public"."model_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_recommendations" ADD CONSTRAINT "match_recommendations_run_id_matching_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."matching_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matching_runs" ADD CONSTRAINT "matching_runs_model_version_id_model_versions_id_fk" FOREIGN KEY ("model_version_id") REFERENCES "public"."model_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matching_runs" ADD CONSTRAINT "matching_runs_batch_id_ingestion_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."ingestion_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matching_runs" ADD CONSTRAINT "matching_runs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_attributes" ADD CONSTRAINT "material_attributes_normalized_id_normalized_material_records_id_fk" FOREIGN KEY ("normalized_id") REFERENCES "public"."normalized_material_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_mappings" ADD CONSTRAINT "material_mappings_canonical_id_canonical_materials_id_fk" FOREIGN KEY ("canonical_id") REFERENCES "public"."canonical_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_mappings" ADD CONSTRAINT "material_mappings_raw_record_id_raw_material_records_id_fk" FOREIGN KEY ("raw_record_id") REFERENCES "public"."raw_material_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_mappings" ADD CONSTRAINT "material_mappings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_mappings" ADD CONSTRAINT "material_mappings_recommendation_id_match_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."match_recommendations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_mappings" ADD CONSTRAINT "material_mappings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_mappings" ADD CONSTRAINT "material_mappings_reversed_by_users_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalized_material_records" ADD CONSTRAINT "normalized_material_records_raw_id_raw_material_records_id_fk" FOREIGN KEY ("raw_id") REFERENCES "public"."raw_material_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_material_records" ADD CONSTRAINT "raw_material_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_material_records" ADD CONSTRAINT "raw_material_records_source_system_id_source_systems_id_fk" FOREIGN KEY ("source_system_id") REFERENCES "public"."source_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_material_records" ADD CONSTRAINT "raw_material_records_batch_id_ingestion_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."ingestion_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_systems" ADD CONSTRAINT "source_systems_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synonym_master" ADD CONSTRAINT "synonym_master_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_roles_code_fk" FOREIGN KEY ("role") REFERENCES "public"."roles"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_queue_idx" ON "approval_tasks" USING btree ("queue","status");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX "canon_cat_idx" ON "canonical_materials" USING btree ("category_code");--> statement-breakpoint
CREATE INDEX "canon_desc_trgm_idx" ON "canonical_materials" USING gin ("canonical_description" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "rec_pair_uq" ON "match_recommendations" USING btree ("pair_key");--> statement-breakpoint
CREATE INDEX "rec_status_idx" ON "match_recommendations" USING btree ("status","routing");--> statement-breakpoint
CREATE INDEX "rec_type_idx" ON "match_recommendations" USING btree ("match_type");--> statement-breakpoint
CREATE INDEX "rec_a_idx" ON "match_recommendations" USING btree ("record_a_id");--> statement-breakpoint
CREATE INDEX "rec_b_idx" ON "match_recommendations" USING btree ("record_b_id");--> statement-breakpoint
CREATE INDEX "attr_norm_idx" ON "material_attributes" USING btree ("normalized_id");--> statement-breakpoint
CREATE INDEX "attr_key_idx" ON "material_attributes" USING btree ("key","value_text");--> statement-breakpoint
CREATE UNIQUE INDEX "mapping_active_uq" ON "material_mappings" USING btree ("raw_record_id") WHERE status = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "mapping_canon_idx" ON "material_mappings" USING btree ("canonical_id");--> statement-breakpoint
CREATE INDEX "mapping_legacy_idx" ON "material_mappings" USING btree ("legacy_code");--> statement-breakpoint
CREATE INDEX "norm_category_idx" ON "normalized_material_records" USING btree ("category_code");--> statement-breakpoint
CREATE INDEX "norm_fingerprint_idx" ON "normalized_material_records" USING btree ("attribute_fingerprint");--> statement-breakpoint
CREATE INDEX "norm_desc_trgm_idx" ON "normalized_material_records" USING gin ("normalized_description" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "norm_embedding_hnsw_idx" ON "normalized_material_records" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "raw_row_hash_uq" ON "raw_material_records" USING btree ("row_hash");--> statement-breakpoint
CREATE INDEX "raw_org_code_idx" ON "raw_material_records" USING btree ("org_id","legacy_code");--> statement-breakpoint
CREATE INDEX "syn_term_idx" ON "synonym_master" USING btree ("term");