-- Drop index "outboxmessage_next_attempt_at" from table: "outbox_messages"
DROP INDEX "outboxmessage_next_attempt_at";
-- Create index "outboxmessage_next_attempt_at" to table: "outbox_messages"
CREATE INDEX "outboxmessage_next_attempt_at" ON "outbox_messages" ("next_attempt_at") WHERE (((status)::text = 'pending'::text) OR ((status)::text = 'retrying'::text));
