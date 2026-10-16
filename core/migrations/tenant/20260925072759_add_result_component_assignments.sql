-- Create "result_component_assignments" table
CREATE TABLE "result_component_assignments" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "result_component_id" uuid NOT NULL, "assignment_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "result_component_assignments_assignments_assignment" FOREIGN KEY ("assignment_id") REFERENCES "assignments" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "result_component_assignments_result_components_assignments" FOREIGN KEY ("result_component_id") REFERENCES "result_components" ("id") ON UPDATE NO ACTION ON DELETE CASCADE);
-- Create index "resultcomponentassignment_assignment_id" to table: "result_component_assignments"
CREATE INDEX "resultcomponentassignment_assignment_id" ON "result_component_assignments" ("assignment_id");
-- Create index "resultcomponentassignment_result_component_id_assignment_id" to table: "result_component_assignments"
CREATE UNIQUE INDEX "resultcomponentassignment_result_component_id_assignment_id" ON "result_component_assignments" ("result_component_id", "assignment_id");
