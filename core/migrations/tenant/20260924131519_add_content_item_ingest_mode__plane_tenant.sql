-- Modify "content_items" table
ALTER TABLE "content_items" ADD COLUMN "ingest_mode" character varying NOT NULL DEFAULT 'now';
