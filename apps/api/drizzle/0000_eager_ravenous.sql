CREATE TYPE "public"."edge_kind" AS ENUM('has_skill', 'needs', 'member_of', 'leads', 'interested_in', 'authored', 'spawned', 'applied_to', 'suggested');--> statement-breakpoint
CREATE TYPE "public"."node_kind" AS ENUM('person', 'idea', 'team', 'skill', 'agent');--> statement-breakpoint
CREATE TABLE "channel_watermarks" (
	"channel" text PRIMARY KEY NOT NULL,
	"seq" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edges" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "edge_kind" NOT NULL,
	"from_id" text NOT NULL,
	"to_id" text NOT NULL,
	"weight" real,
	"transient" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"author_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "node_kind" NOT NULL,
	"label" text NOT NULL,
	"status" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"envelope" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"display_name" text NOT NULL,
	"headline" text,
	"bio_raw" text,
	"availability" text DEFAULT 'full' NOT NULL,
	"language" text DEFAULT 'es' NOT NULL,
	"session_token" text NOT NULL,
	"recovery_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_handle_unique" UNIQUE("handle"),
	CONSTRAINT "people_session_token_unique" UNIQUE("session_token"),
	CONSTRAINT "people_availability_check" CHECK ("people"."availability" in ('full','partial','evenings'))
);
--> statement-breakpoint
CREATE TABLE "processed_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_aliases" (
	"alias" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"slug" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	CONSTRAINT "skills_category_check" CHECK ("skills"."category" in ('frontend','backend','mobile','data-ai','design','product','infra','other'))
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"team_id" text NOT NULL,
	"score" real NOT NULL,
	"direction" text NOT NULL,
	"matched_skills" jsonb NOT NULL,
	"rationale" text NOT NULL,
	"status" text DEFAULT 'live' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suggestions_direction_check" CHECK ("suggestions"."direction" in ('team_needs_person','person_seeks_team')),
	CONSTRAINT "suggestions_status_check" CHECK ("suggestions"."status" in ('live','expired','consumed'))
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"pitch" text,
	"lead_id" text NOT NULL,
	"idea_id" text,
	"max_size" integer DEFAULT 4 NOT NULL,
	"frozen" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_max_size_check" CHECK ("teams"."max_size" between 1 and 4)
);
--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_from_id_nodes_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_to_id_nodes_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_id_nodes_id_fk" FOREIGN KEY ("id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_author_id_people_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_id_nodes_id_fk" FOREIGN KEY ("id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_aliases" ADD CONSTRAINT "skill_aliases_slug_skills_slug_fk" FOREIGN KEY ("slug") REFERENCES "public"."skills"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_id_nodes_id_fk" FOREIGN KEY ("id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_lead_id_people_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "edges_kind_to_idx" ON "edges" USING btree ("kind","to_id");--> statement-breakpoint
CREATE INDEX "edges_kind_from_idx" ON "edges" USING btree ("kind","from_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_team_per_person" ON "edges" USING btree ("from_id") WHERE kind = 'member_of';--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_application" ON "edges" USING btree ("from_id","to_id") WHERE kind = 'applied_to' and meta->>'status' = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_skill_edges" ON "edges" USING btree ("kind","from_id","to_id") WHERE kind in ('has_skill','needs','member_of','leads','interested_in');--> statement-breakpoint
CREATE INDEX "nodes_kind_status_idx" ON "nodes" USING btree ("kind","status");--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox" USING btree ("published","created_at") WHERE not published;--> statement-breakpoint
CREATE UNIQUE INDEX "one_suggestion_per_pair" ON "suggestions" USING btree ("person_id","team_id");--> statement-breakpoint
CREATE INDEX "suggestions_status_expires_idx" ON "suggestions" USING btree ("status","expires_at");