-- Modify "student_addresses" table
ALTER TABLE "student_addresses" DROP CONSTRAINT "student_addresses_students_addresses", ADD CONSTRAINT "student_addresses_students_addresses" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON UPDATE NO ACTION ON DELETE CASCADE;
-- Modify "student_assignments" table
ALTER TABLE "student_assignments" DROP CONSTRAINT "student_assignments_students_assignments", ADD CONSTRAINT "student_assignments_students_assignments" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON UPDATE NO ACTION ON DELETE CASCADE;
-- Modify "student_documents" table
ALTER TABLE "student_documents" DROP CONSTRAINT "student_documents_students_documents", ADD CONSTRAINT "student_documents_students_documents" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON UPDATE NO ACTION ON DELETE CASCADE;
-- Modify "student_enrollments" table
ALTER TABLE "student_enrollments" DROP CONSTRAINT "student_enrollments_students_enrollments", ADD CONSTRAINT "student_enrollments_students_enrollments" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON UPDATE NO ACTION ON DELETE CASCADE;
-- Modify "student_guardians" table
ALTER TABLE "student_guardians" DROP CONSTRAINT "student_guardians_guardians_student_links", DROP CONSTRAINT "student_guardians_students_guardian_links", ADD CONSTRAINT "student_guardians_guardians_student_links" FOREIGN KEY ("guardian_id") REFERENCES "guardians" ("id") ON UPDATE NO ACTION ON DELETE CASCADE, ADD CONSTRAINT "student_guardians_students_guardian_links" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON UPDATE NO ACTION ON DELETE CASCADE;
-- Modify "student_notes" table
ALTER TABLE "student_notes" DROP CONSTRAINT "student_notes_students_notes", ADD CONSTRAINT "student_notes_students_notes" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON UPDATE NO ACTION ON DELETE CASCADE;
-- Modify "student_subject_enrollments" table
ALTER TABLE "student_subject_enrollments" DROP CONSTRAINT "student_subject_enrollments_st_cf911256de5133bdae295ba331803c86", DROP CONSTRAINT "student_subject_enrollments_students_subject_enrollments", ADD CONSTRAINT "student_subject_enrollments_st_cf911256de5133bdae295ba331803c86" FOREIGN KEY ("student_enrollment_id") REFERENCES "student_enrollments" ("id") ON UPDATE NO ACTION ON DELETE CASCADE, ADD CONSTRAINT "student_subject_enrollments_students_subject_enrollments" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON UPDATE NO ACTION ON DELETE CASCADE;
