-- Modify "curriculum_nodes" table
ALTER TABLE "curriculum_nodes" ADD CONSTRAINT "curriculum_nodes_topic_has_parent" CHECK (((kind)::text <> 'topic'::text) OR (parent_id IS NOT NULL)), ADD CONSTRAINT "curriculum_nodes_unit_is_root" CHECK (((kind)::text <> 'unit'::text) OR (parent_id IS NULL));
