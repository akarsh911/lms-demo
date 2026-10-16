-- Modify "content_items" table
ALTER TABLE "content_items" ADD COLUMN "index_attempts" bigint NOT NULL DEFAULT 0;
