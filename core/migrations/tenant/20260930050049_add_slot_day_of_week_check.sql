-- Modify "timetable_slots" table
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_day_of_week" CHECK ((day_of_week >= 1) AND (day_of_week <= 7));
