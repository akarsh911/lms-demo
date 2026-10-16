-- Modify "calendar_day_section_patterns" table
ALTER TABLE "calendar_day_section_patterns" ADD CONSTRAINT "calendar_day_section_patterns_day_of_week" CHECK ((substitute_day_of_week >= 1) AND (substitute_day_of_week <= 7));
-- Modify "calendar_days" table
ALTER TABLE "calendar_days" ADD CONSTRAINT "calendar_days_substitute_day_of_week" CHECK ((substitute_day_of_week IS NULL) OR ((substitute_day_of_week >= 1) AND (substitute_day_of_week <= 7)));
