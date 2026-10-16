package authorization

const (
	AcademicSessionsRead   Entity = "core.academic_sessions.read"
	AcademicSessionsWrite  Entity = "core.academic_sessions.write"
	AcademicSessionsDelete Entity = "core.academic_sessions.delete"

	ReferenceRead   Entity = "core.reference.read"
	ReferenceWrite  Entity = "core.reference.write"
	ReferenceDelete Entity = "core.reference.delete"

	SectionsRead   Entity = "core.sections.read"
	SectionsWrite  Entity = "core.sections.write"
	SectionsDelete Entity = "core.sections.delete"

	SubjectOfferingsRead   Entity = "core.subject_offerings.read"
	SubjectOfferingsWrite  Entity = "core.subject_offerings.write"
	SubjectOfferingsDelete Entity = "core.subject_offerings.delete"

	EnrollmentsRead      Entity = "core.enrollments.read"
	EnrollmentsReadAll   Entity = "core.enrollments.read_all"
	EnrollmentsWrite     Entity = "core.enrollments.write"
	EnrollmentsWriteAll  Entity = "core.enrollments.write_all"
	EnrollmentsDelete    Entity = "core.enrollments.delete"
	EnrollmentsDeleteAll Entity = "core.enrollments.delete_all"

	SubjectEnrollmentsRead      Entity = "core.subject_enrollments.read"
	SubjectEnrollmentsReadAll   Entity = "core.subject_enrollments.read_all"
	SubjectEnrollmentsWrite     Entity = "core.subject_enrollments.write"
	SubjectEnrollmentsWriteAll  Entity = "core.subject_enrollments.write_all"
	SubjectEnrollmentsDelete    Entity = "core.subject_enrollments.delete"
	SubjectEnrollmentsDeleteAll Entity = "core.subject_enrollments.delete_all"

	TeacherAssignmentsRead      Entity = "core.teacher_assignments.read"
	TeacherAssignmentsReadAll   Entity = "core.teacher_assignments.read_all"
	TeacherAssignmentsWrite     Entity = "core.teacher_assignments.write"
	TeacherAssignmentsWriteAll  Entity = "core.teacher_assignments.write_all"
	TeacherAssignmentsDelete    Entity = "core.teacher_assignments.delete"
	TeacherAssignmentsDeleteAll Entity = "core.teacher_assignments.delete_all"

	StudentAssignmentsRead      Entity = "core.student_assignments.read"
	StudentAssignmentsReadAll   Entity = "core.student_assignments.read_all"
	StudentAssignmentsWrite     Entity = "core.student_assignments.write"
	StudentAssignmentsWriteAll  Entity = "core.student_assignments.write_all"
	StudentAssignmentsDelete    Entity = "core.student_assignments.delete"
	StudentAssignmentsDeleteAll Entity = "core.student_assignments.delete_all"

	StudentNotesRead      Entity = "core.student_notes.read"
	StudentNotesReadAll   Entity = "core.student_notes.read_all"
	StudentNotesWrite     Entity = "core.student_notes.write"
	StudentNotesWriteAll  Entity = "core.student_notes.write_all"
	StudentNotesDelete    Entity = "core.student_notes.delete"
	StudentNotesDeleteAll Entity = "core.student_notes.delete_all"

	StudentAddressesRead      Entity = "core.student_addresses.read"
	StudentAddressesReadAll   Entity = "core.student_addresses.read_all"
	StudentAddressesWrite     Entity = "core.student_addresses.write"
	StudentAddressesWriteAll  Entity = "core.student_addresses.write_all"
	StudentAddressesDelete    Entity = "core.student_addresses.delete"
	StudentAddressesDeleteAll Entity = "core.student_addresses.delete_all"

	StudentDocumentsRead      Entity = "core.student_documents.read"
	StudentDocumentsReadAll   Entity = "core.student_documents.read_all"
	StudentDocumentsWrite     Entity = "core.student_documents.write"
	StudentDocumentsWriteAll  Entity = "core.student_documents.write_all"
	StudentDocumentsDelete    Entity = "core.student_documents.delete"
	StudentDocumentsDeleteAll Entity = "core.student_documents.delete_all"
)

var academicEntities = []Entity{
	AcademicSessionsRead, AcademicSessionsWrite, AcademicSessionsDelete,
	ReferenceRead, ReferenceWrite, ReferenceDelete,
	SectionsRead, SectionsWrite, SectionsDelete,
	SubjectOfferingsRead, SubjectOfferingsWrite, SubjectOfferingsDelete,
	EnrollmentsRead, EnrollmentsReadAll, EnrollmentsWrite, EnrollmentsWriteAll, EnrollmentsDelete, EnrollmentsDeleteAll,
	SubjectEnrollmentsRead, SubjectEnrollmentsReadAll, SubjectEnrollmentsWrite, SubjectEnrollmentsWriteAll, SubjectEnrollmentsDelete, SubjectEnrollmentsDeleteAll,
	TeacherAssignmentsRead, TeacherAssignmentsReadAll, TeacherAssignmentsWrite, TeacherAssignmentsWriteAll, TeacherAssignmentsDelete, TeacherAssignmentsDeleteAll,
	StudentAssignmentsRead, StudentAssignmentsReadAll, StudentAssignmentsWrite, StudentAssignmentsWriteAll, StudentAssignmentsDelete, StudentAssignmentsDeleteAll,
	StudentNotesRead, StudentNotesReadAll, StudentNotesWrite, StudentNotesWriteAll, StudentNotesDelete, StudentNotesDeleteAll,
	StudentAddressesRead, StudentAddressesReadAll, StudentAddressesWrite, StudentAddressesWriteAll, StudentAddressesDelete, StudentAddressesDeleteAll,
	StudentDocumentsRead, StudentDocumentsReadAll, StudentDocumentsWrite, StudentDocumentsWriteAll, StudentDocumentsDelete, StudentDocumentsDeleteAll,
}

func init() { AllEntities = append(AllEntities, academicEntities...) }

const (
	LibraryCreate    Entity = "core.library.create"
	LibraryRead      Entity = "core.library.read"
	LibraryReadAll   Entity = "core.library.read_all"
	LibraryWrite     Entity = "core.library.write"
	LibraryWriteAll  Entity = "core.library.write_all"
	LibraryDelete    Entity = "core.library.delete"
	LibraryDeleteAll Entity = "core.library.delete_all"
)

var libraryEntities = []Entity{
	LibraryCreate, LibraryRead, LibraryReadAll, LibraryWrite, LibraryWriteAll, LibraryDelete, LibraryDeleteAll,
}

func init() { AllEntities = append(AllEntities, libraryEntities...) }

const (
	CurriculumCreate    Entity = "core.curriculum.create"
	CurriculumRead      Entity = "core.curriculum.read"
	CurriculumReadAll   Entity = "core.curriculum.read_all"
	CurriculumWrite     Entity = "core.curriculum.write"
	CurriculumWriteAll  Entity = "core.curriculum.write_all"
	CurriculumDelete    Entity = "core.curriculum.delete"
	CurriculumDeleteAll Entity = "core.curriculum.delete_all"
)

var curriculumEntities = []Entity{
	CurriculumCreate, CurriculumRead, CurriculumReadAll, CurriculumWrite, CurriculumWriteAll, CurriculumDelete, CurriculumDeleteAll,
}

func init() { AllEntities = append(AllEntities, curriculumEntities...) }

const (
	ContentPlacementsCreate    Entity = "core.content_placements.create"
	ContentPlacementsRead      Entity = "core.content_placements.read"
	ContentPlacementsReadAll   Entity = "core.content_placements.read_all"
	ContentPlacementsWrite     Entity = "core.content_placements.write"
	ContentPlacementsWriteAll  Entity = "core.content_placements.write_all"
	ContentPlacementsDelete    Entity = "core.content_placements.delete"
	ContentPlacementsDeleteAll Entity = "core.content_placements.delete_all"
)

var contentPlacementsEntities = []Entity{
	ContentPlacementsCreate, ContentPlacementsRead, ContentPlacementsReadAll, ContentPlacementsWrite, ContentPlacementsWriteAll, ContentPlacementsDelete, ContentPlacementsDeleteAll,
}

func init() { AllEntities = append(AllEntities, contentPlacementsEntities...) }

const (
	StudentGuardiansWrite Entity = "core.student_guardians.write"
)

var studentGuardianEntities = []Entity{
	StudentGuardiansWrite,
}

func init() { AllEntities = append(AllEntities, studentGuardianEntities...) }

const (
	TimetableRead      Entity = "core.timetable.read"
	TimetableReadAll   Entity = "core.timetable.read_all"
	TimetableWrite     Entity = "core.timetable.write"
	TimetableWriteAll  Entity = "core.timetable.write_all"
	TimetableDelete    Entity = "core.timetable.delete"
	TimetableDeleteAll Entity = "core.timetable.delete_all"
	TimetableOverride  Entity = "core.timetable.override"
	TimetableGenerate  Entity = "core.timetable.generate"

	AttendanceRead      Entity = "core.attendance.read"
	AttendanceReadAll   Entity = "core.attendance.read_all"
	AttendanceWrite     Entity = "core.attendance.write"
	AttendanceWriteAll  Entity = "core.attendance.write_all"
	AttendanceDelete    Entity = "core.attendance.delete"
	AttendanceDeleteAll Entity = "core.attendance.delete_all"

	RoomsRead   Entity = "core.rooms.read"
	RoomsWrite  Entity = "core.rooms.write"
	RoomsDelete Entity = "core.rooms.delete"

	CalendarRead   Entity = "core.calendar.read"
	CalendarWrite  Entity = "core.calendar.write"
	CalendarDelete Entity = "core.calendar.delete"
)

var timetableEntities = []Entity{
	TimetableRead, TimetableReadAll, TimetableWrite, TimetableWriteAll, TimetableDelete, TimetableDeleteAll,
	TimetableOverride, TimetableGenerate,
	AttendanceRead, AttendanceReadAll, AttendanceWrite, AttendanceWriteAll, AttendanceDelete, AttendanceDeleteAll,
	RoomsRead, RoomsWrite, RoomsDelete,
	CalendarRead, CalendarWrite, CalendarDelete,
}

func init() { AllEntities = append(AllEntities, timetableEntities...) }

const (
	StreamPostsRead      Entity = "core.stream_posts.read"
	StreamPostsReadAll   Entity = "core.stream_posts.read_all"
	StreamPostsWrite     Entity = "core.stream_posts.write"
	StreamPostsWriteAll  Entity = "core.stream_posts.write_all"
	StreamPostsDelete    Entity = "core.stream_posts.delete"
	StreamPostsDeleteAll Entity = "core.stream_posts.delete_all"

	StreamCommentsRead      Entity = "core.stream_comments.read"
	StreamCommentsReadAll   Entity = "core.stream_comments.read_all"
	StreamCommentsWrite     Entity = "core.stream_comments.write"
	StreamCommentsWriteAll  Entity = "core.stream_comments.write_all"
	StreamCommentsDelete    Entity = "core.stream_comments.delete"
	StreamCommentsDeleteAll Entity = "core.stream_comments.delete_all"

	AssignmentsRead      Entity = "core.assignments.read"
	AssignmentsReadAll   Entity = "core.assignments.read_all"
	AssignmentsWrite     Entity = "core.assignments.write"
	AssignmentsWriteAll  Entity = "core.assignments.write_all"
	AssignmentsDelete    Entity = "core.assignments.delete"
	AssignmentsDeleteAll Entity = "core.assignments.delete_all"

	AssignmentSubmissionsRead      Entity = "core.assignment_submissions.read"
	AssignmentSubmissionsReadAll   Entity = "core.assignment_submissions.read_all"
	AssignmentSubmissionsWrite     Entity = "core.assignment_submissions.write"
	AssignmentSubmissionsWriteAll  Entity = "core.assignment_submissions.write_all"
	AssignmentSubmissionsDelete    Entity = "core.assignment_submissions.delete"
	AssignmentSubmissionsDeleteAll Entity = "core.assignment_submissions.delete_all"
)

var classroomEntities = []Entity{
	StreamPostsRead, StreamPostsReadAll, StreamPostsWrite, StreamPostsWriteAll, StreamPostsDelete, StreamPostsDeleteAll,
	StreamCommentsRead, StreamCommentsReadAll, StreamCommentsWrite, StreamCommentsWriteAll, StreamCommentsDelete, StreamCommentsDeleteAll,
	AssignmentsRead, AssignmentsReadAll, AssignmentsWrite, AssignmentsWriteAll, AssignmentsDelete, AssignmentsDeleteAll,
	AssignmentSubmissionsRead, AssignmentSubmissionsReadAll, AssignmentSubmissionsWrite, AssignmentSubmissionsWriteAll, AssignmentSubmissionsDelete, AssignmentSubmissionsDeleteAll,
}

func init() { AllEntities = append(AllEntities, classroomEntities...) }

const (
	AchievementsRead   Entity = "core.achievements.read"
	AchievementsWrite  Entity = "core.achievements.write"
	AchievementsDelete Entity = "core.achievements.delete"

	StudentAchievementsRead      Entity = "core.student_achievements.read"
	StudentAchievementsReadAll   Entity = "core.student_achievements.read_all"
	StudentAchievementsWrite     Entity = "core.student_achievements.write"
	StudentAchievementsWriteAll  Entity = "core.student_achievements.write_all"
	StudentAchievementsDelete    Entity = "core.student_achievements.delete"
	StudentAchievementsDeleteAll Entity = "core.student_achievements.delete_all"

	PraisesRead      Entity = "core.praises.read"
	PraisesReadAll   Entity = "core.praises.read_all"
	PraisesWrite     Entity = "core.praises.write"
	PraisesWriteAll  Entity = "core.praises.write_all"
	PraisesDelete    Entity = "core.praises.delete"
	PraisesDeleteAll Entity = "core.praises.delete_all"

	PraiseReactionsRead   Entity = "core.praise_reactions.read"
	PraiseReactionsWrite  Entity = "core.praise_reactions.write"
	PraiseReactionsDelete Entity = "core.praise_reactions.delete"
)

var recognitionEntities = []Entity{
	AchievementsRead, AchievementsWrite, AchievementsDelete,
	StudentAchievementsRead, StudentAchievementsReadAll, StudentAchievementsWrite, StudentAchievementsWriteAll, StudentAchievementsDelete, StudentAchievementsDeleteAll,
	PraisesRead, PraisesReadAll, PraisesWrite, PraisesWriteAll, PraisesDelete, PraisesDeleteAll,
	PraiseReactionsRead, PraiseReactionsWrite, PraiseReactionsDelete,
}

func init() { AllEntities = append(AllEntities, recognitionEntities...) }

const (
	QuestionBankCreate    Entity = "core.question_bank.create"
	QuestionBankRead      Entity = "core.question_bank.read"
	QuestionBankReadAll   Entity = "core.question_bank.read_all"
	QuestionBankWrite     Entity = "core.question_bank.write"
	QuestionBankWriteAll  Entity = "core.question_bank.write_all"
	QuestionBankDelete    Entity = "core.question_bank.delete"
	QuestionBankDeleteAll Entity = "core.question_bank.delete_all"

	BlueprintsCreate    Entity = "core.blueprints.create"
	BlueprintsRead      Entity = "core.blueprints.read"
	BlueprintsReadAll   Entity = "core.blueprints.read_all"
	BlueprintsWrite     Entity = "core.blueprints.write"
	BlueprintsWriteAll  Entity = "core.blueprints.write_all"
	BlueprintsDelete    Entity = "core.blueprints.delete"
	BlueprintsDeleteAll Entity = "core.blueprints.delete_all"

	PapersCreate    Entity = "core.papers.create"
	PapersRead      Entity = "core.papers.read"
	PapersReadAll   Entity = "core.papers.read_all"
	PapersWrite     Entity = "core.papers.write"
	PapersWriteAll  Entity = "core.papers.write_all"
	PapersDelete    Entity = "core.papers.delete"
	PapersDeleteAll Entity = "core.papers.delete_all"

	PaperGenerationCreate   Entity = "core.paper_generation.create"
	PaperGenerationRead     Entity = "core.paper_generation.read"
	PaperGenerationReadAll  Entity = "core.paper_generation.read_all"
	PaperGenerationWrite    Entity = "core.paper_generation.write"
	PaperGenerationWriteAll Entity = "core.paper_generation.write_all"
)

var paperBankEntities = []Entity{
	QuestionBankCreate, QuestionBankRead, QuestionBankReadAll, QuestionBankWrite, QuestionBankWriteAll, QuestionBankDelete, QuestionBankDeleteAll,
	BlueprintsCreate, BlueprintsRead, BlueprintsReadAll, BlueprintsWrite, BlueprintsWriteAll, BlueprintsDelete, BlueprintsDeleteAll,
	PapersCreate, PapersRead, PapersReadAll, PapersWrite, PapersWriteAll, PapersDelete, PapersDeleteAll,
	PaperGenerationCreate, PaperGenerationRead, PaperGenerationReadAll, PaperGenerationWrite, PaperGenerationWriteAll,
}

func init() { AllEntities = append(AllEntities, paperBankEntities...) }

const (
	MindmapsRead Entity = "core.mindmaps.read"

	ConceptMasteryRead    Entity = "core.concept_mastery.read"
	ConceptMasteryReadAll Entity = "core.concept_mastery.read_all"
	ConceptMasteryWrite   Entity = "core.concept_mastery.write"
)

var learningEntities = []Entity{
	MindmapsRead,
	ConceptMasteryRead, ConceptMasteryReadAll, ConceptMasteryWrite,
}

func init() { AllEntities = append(AllEntities, learningEntities...) }
