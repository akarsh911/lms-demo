-- Drop index "content_items_engine_document_id_key" from table: "content_items"
DROP INDEX "content_items_engine_document_id_key";
-- Create index "contentitem_engine_document_id" to table: "content_items"
CREATE INDEX "contentitem_engine_document_id" ON "content_items" ("engine_document_id");
