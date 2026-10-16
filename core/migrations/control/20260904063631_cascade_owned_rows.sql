-- Modify "school_profiles" table
ALTER TABLE "school_profiles" DROP CONSTRAINT "school_profiles_schools_profiles", ADD CONSTRAINT "school_profiles_schools_profiles" FOREIGN KEY ("school_id") REFERENCES "schools" ("id") ON UPDATE NO ACTION ON DELETE CASCADE;
