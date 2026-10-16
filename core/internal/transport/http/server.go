package http

import (
	"log/slog"
	"net/http"
	"reflect"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/config"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/cas"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/service"
	"github.com/Harbour-Emerge/emerge-core/internal/service/mail"
	mw "github.com/Harbour-Emerge/emerge-core/internal/transport/http/middleware"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

type Server struct {
	cfg         *config.Config
	logger      *slog.Logger
	control     *postgres.Control
	registry    *postgres.Registry
	verifier    *cas.Verifier
	guard       authorization.Guard
	authProxy   *cas.AuthProxy
	provisioner *service.Provisioner
	tenants     *service.TenantProvisioner
	version     string
	mail        MailHealth
	mailAbsence string
}

type MailHealth interface {
	Healthy(now time.Time) bool
	StaleAfter() time.Duration
	Stats() mail.Stats
	PlatformConfigured() bool
}

const uuidParam = "/{id:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}"

func NewServer(
	cfg *config.Config,
	logger *slog.Logger,
	control *postgres.Control,
	registry *postgres.Registry,
	verifier *cas.Verifier,
	guard authorization.Guard,
	authProxy *cas.AuthProxy,
	provisioner *service.Provisioner,
	tenants *service.TenantProvisioner,
	version string,
) *Server {
	return &Server{
		cfg:         cfg,
		logger:      logger,
		control:     control,
		registry:    registry,
		verifier:    verifier,
		guard:       guard,
		authProxy:   authProxy,
		provisioner: provisioner,
		tenants:     tenants,
		version:     version,
	}
}

const (
	MailDisabled    = "disabled"
	MailUnavailable = "unavailable"
)

func (s *Server) WithMail(sender MailHealth, absence string) *Server {
	if !live(sender) {
		s.mailAbsence = absence
		if s.mailAbsence == "" {
			s.mailAbsence = MailUnavailable
		}
		return s
	}
	s.mail = sender
	return s
}

func live(sender MailHealth) bool {
	if sender == nil {
		return false
	}
	v := reflect.ValueOf(sender)
	return v.Kind() != reflect.Ptr || !v.IsNil()
}

func requestTimeout(ordinary, streaming time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		quick := chimw.Timeout(ordinary)(next)
		patient := chimw.Timeout(streaming)(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if streamsItsBody(r) {
				patient.ServeHTTP(w, r)
				return
			}
			quick.ServeHTTP(w, r)
		})
	}
}

func streamsItsBody(r *http.Request) bool {
	return (r.Method == http.MethodPut || r.Method == http.MethodGet) &&
		strings.HasPrefix(r.URL.Path, "/api/v1/library/assets/") &&
		strings.HasSuffix(r.URL.Path, "/content")
}

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()

	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(mw.Recoverer(s.logger))
	r.Use(mw.RequestLogger(s.logger))
	r.Use(requestTimeout(30*time.Second, assetUploadWindow))

	r.Get("/health", s.liveness)

	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/", s.index)
		r.Get("/health", s.readiness)

		r.Route("/auth", func(r chi.Router) {
			r.Post("/login", s.relay("login"))
			r.Post("/login/verify", s.relay("login-verify"))
			r.Post("/otp/start", s.relay("otp-start"))
			r.Post("/refresh", s.relay("refresh"))
			r.Post("/logout", s.relayAndForget("logout"))
			r.Post("/password/change", s.relayAndForget("password-change"))
			r.Post("/password/reset", s.relayAndForget("password-reset"))

			r.With(s.authenticate(), mw.OptionalTenant(s.registry)).Get("/me", s.me)
		})

		r.Group(func(r chi.Router) {
			r.Use(s.authenticate())

			s.mountControlPlane(r)
			s.mountTenantPlane(r)
		})
	})

	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		response.Error(w, http.StatusNotFound, "no route matches "+r.Method+" "+r.URL.Path)
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
		response.Error(w, http.StatusMethodNotAllowed, r.Method+" is not allowed on "+r.URL.Path)
	})

	return r
}

func (s *Server) mountControlPlane(r chi.Router) {
	r.Route("/schools", func(r chi.Router) {
		r.With(s.can(authorization.SchoolsRead)).Get("/", s.listSchools)
		r.With(s.can(authorization.SchoolsWrite)).Post("/", s.createSchool)
		r.With(s.can(authorization.SchoolsRead)).Get("/{id}", s.getSchool)
		r.With(s.can(authorization.SchoolsWrite)).Patch("/{id}", s.updateSchool)
		r.With(s.can(authorization.SchoolsDelete)).Delete("/{id}", s.deleteSchool)
		r.With(s.can(authorization.SchoolsWrite)).Put("/{id}/profiles/{type}", s.putSchoolProfile)
	})
}

func (s *Server) mountTenantPlane(r chi.Router) {
	r.Group(func(r chi.Router) {
		r.Use(mw.RequireTenant(s.registry))

		r.Route("/persons", func(r chi.Router) {
			r.With(s.can(authorization.PersonsRead)).Get("/", s.listPersons)
			r.With(s.can(authorization.PersonsWrite)).Post("/", s.createPerson)
			r.With(s.can(authorization.PersonsWrite)).Post("/provision", s.provisionPerson)
			r.With(s.can(authorization.PersonsWrite)).Post("/link", s.linkPerson)
			r.With(s.can(authorization.PersonsRead)).Get(uuidParam, s.getPerson)
			r.With(s.can(authorization.PersonsWrite)).Patch(uuidParam, s.updatePerson)
			r.With(s.can(authorization.PersonsDelete)).Delete(uuidParam, s.deletePerson)
		})

		r.Route("/students", func(r chi.Router) {
			r.With(s.can(authorization.StudentsRead)).Get("/", s.listStudents)
			r.With(s.can(authorization.StudentsCreate)).Post("/", s.createStudent)
			r.With(s.can(authorization.StudentsRead)).Get("/{id}", s.getStudent)
			r.With(s.can(authorization.TimetableRead)).Get("/{id}/report-card", s.getStudentReportCard)
			r.With(s.can(authorization.StudentsWrite)).Patch("/{id}", s.updateStudent)
			r.With(s.can(authorization.StudentsDelete)).Delete("/{id}", s.deleteStudent)
		})

		r.Route("/staff", func(r chi.Router) {
			r.With(s.can(authorization.StaffRead)).Get("/", s.listStaff)
			r.With(s.can(authorization.StaffWrite)).Post("/", s.createStaff)
			r.With(s.can(authorization.StaffRead)).Get("/{id}", s.getStaff)
			r.With(s.can(authorization.StaffWrite)).Patch("/{id}", s.updateStaff)
			r.With(s.can(authorization.StaffDelete)).Delete("/{id}", s.deleteStaff)
		})

		r.Route("/teachers", func(r chi.Router) {
			r.With(s.can(authorization.TeachersRead)).Get("/", s.listTeachers)
			r.With(s.can(authorization.TeachersCreate)).Post("/", s.createTeacher)
			r.With(s.can(authorization.TeachersRead)).Get("/{id}", s.getTeacher)
			r.With(s.can(authorization.TeachersWrite)).Patch("/{id}", s.updateTeacher)
			r.With(s.can(authorization.TeachersDelete)).Delete("/{id}", s.deleteTeacher)
		})

		r.Route("/guardians", func(r chi.Router) {
			r.With(s.can(authorization.GuardiansRead)).Get("/", s.listGuardians)
			r.With(s.can(authorization.GuardiansCreate)).Post("/", s.createGuardian)
			r.With(s.can(authorization.GuardiansRead)).Get("/{id}", s.getGuardian)
			r.With(s.can(authorization.GuardiansWrite)).Patch("/{id}", s.updateGuardian)
			r.With(s.can(authorization.GuardiansDelete)).Delete("/{id}", s.deleteGuardian)
			r.With(s.can(authorization.GuardiansWrite)).Post("/{id}/students", s.linkGuardianToStudent)
			r.With(s.can(authorization.StudentGuardiansWrite)).
				Patch("/{id}/students/{student_id}", s.updateGuardianLink)
		})

		r.Route("/library", func(r chi.Router) {
			r.With(s.can(authorization.LibraryRead)).Get("/", s.listLibraryItems)
			r.With(s.can(authorization.LibraryRead)).Get("/scopes", s.getLibraryScopes)
			r.With(s.can(authorization.LibraryRead)).Get("/search", s.searchLibrary)
			r.With(s.can(authorization.LibraryCreate)).Post("/", s.createLibraryItem)
			r.With(s.can(authorization.LibraryCreate)).Post("/assets", s.createAsset)
			r.With(s.can(authorization.LibraryRead)).Get("/assets", s.listAssets)
			r.With(s.can(authorization.LibraryRead)).Get("/assets/{id}", s.getAsset)
			r.With(s.can(authorization.LibraryCreate)).Put("/assets/{id}/content", s.uploadAssetContent)
			r.With(s.can(authorization.LibraryRead)).Get("/assets/{id}/content", s.getAssetContent)
			r.With(s.can(authorization.LibraryCreate)).Post("/assets/{id}/ready", s.markAssetReady)
			r.With(s.can(authorization.LibraryRead)).Get("/assets/{id}/link", s.getAssetLink)
			r.With(s.can(authorization.LibraryDelete)).Delete("/assets/{id}", s.deleteAsset)
			r.With(s.can(authorization.LibraryRead)).Get(uuidParam, s.getLibraryItem)
			r.With(s.can(authorization.LibraryWrite)).Patch(uuidParam, s.updateLibraryItem)
			r.With(s.can(authorization.LibraryDelete)).Delete(uuidParam, s.deleteLibraryItem)
			r.With(s.can(authorization.LibraryRead)).Get(uuidParam+"/nodes", s.listContentNodes)
			r.With(s.can(authorization.LibraryCreate)).Post(uuidParam+"/nodes", s.createContentNode)
		})

		r.Get("/capabilities", s.getCapabilities)

		s.mountCurriculum(r)
		s.mountLearning(r)
		s.mountTimetable(r)
		s.mountTeacherAbsences(r)
		s.mountExams(r)
		s.mountExamMarks(r)
		s.mountOnlineTests(r)
		s.mountAttendance(r)
		s.mountStream(r)
		s.mountAssignments(r)
		s.mountRecognition(r)
		s.mountQuestionBank(r)
		s.mountBlueprints(r)
		s.mountPapers(r)
		s.mountAcademic(r)
		s.mountStudentRecords(r)
	})
}

func (s *Server) mountCurriculum(r chi.Router) {
	r.Route("/curricula", func(r chi.Router) {
		r.With(s.can(authorization.CurriculumRead)).Get("/", s.listCurricula)
		r.With(s.can(authorization.CurriculumCreate)).Post("/", s.createCurriculum)
		r.With(s.can(authorization.CurriculumRead)).Get("/{id}", s.getCurriculum)
		r.With(s.can(authorization.CurriculumWrite)).Patch("/{id}", s.updateCurriculum)
		r.With(s.can(authorization.CurriculumDelete)).Delete("/{id}", s.deleteCurriculum)
		r.With(s.can(authorization.CurriculumRead)).Get("/{id}/nodes", s.listCurriculumNodes)
		r.With(s.can(authorization.CurriculumCreate)).Post("/{id}/nodes", s.createCurriculumNode)
	})

	r.Route("/result-schemes", func(r chi.Router) {
		r.With(s.can(authorization.SubjectOfferingsRead)).Get("/", s.listResultSchemes)
		r.With(s.can(authorization.SubjectOfferingsWrite)).Post("/", s.createResultScheme)
		r.With(s.can(authorization.SubjectOfferingsRead)).Get("/{id}", s.getResultScheme)
		r.With(s.can(authorization.SubjectOfferingsWrite)).Patch("/{id}", s.reviseResultScheme)
		r.With(s.can(authorization.SubjectOfferingsDelete)).Delete("/{id}", s.deleteResultScheme)
		r.With(s.can(authorization.SubjectOfferingsRead)).Get("/{id}/components", s.listResultComponents)
		r.With(s.can(authorization.SubjectOfferingsWrite)).Post("/{id}/components", s.createResultComponent)
	})

	r.Route("/result-components", func(r chi.Router) {
		r.With(s.can(authorization.SubjectOfferingsWrite)).Patch("/{id}", s.updateResultComponent)
		r.With(s.can(authorization.SubjectOfferingsDelete)).Delete("/{id}", s.deleteResultComponent)
		r.With(s.can(authorization.SubjectOfferingsRead)).Get("/{id}/exams", s.listResultComponentExams)
		r.With(s.can(authorization.SubjectOfferingsWrite)).Post("/{id}/exams", s.linkResultComponentExam)
		r.With(s.can(authorization.SubjectOfferingsDelete)).Delete("/{id}/exams/{examID}", s.unlinkResultComponentExam)
		r.With(s.can(authorization.SubjectOfferingsRead)).Get("/{id}/assignments", s.listResultComponentAssignments)
		r.With(s.can(authorization.SubjectOfferingsWrite)).Post("/{id}/assignments", s.linkResultComponentAssignment)
		r.With(s.can(authorization.SubjectOfferingsDelete)).Delete("/{id}/assignments/{assignmentID}", s.unlinkResultComponentAssignment)
	})

	r.Route("/grading-schemes", func(r chi.Router) {
		r.With(s.can(authorization.SubjectOfferingsRead)).Get("/", s.listGradingSchemes)
		r.With(s.can(authorization.SubjectOfferingsWrite)).Post("/", s.createGradingScheme)
		r.With(s.can(authorization.SubjectOfferingsWrite)).Patch("/{id}", s.reviseGradingScheme)
	})

	r.Route("/curriculum-nodes", func(r chi.Router) {
		r.With(s.can(authorization.CurriculumWrite)).Patch("/{id}", s.updateCurriculumNode)
		r.With(s.can(authorization.CurriculumDelete)).Delete("/{id}", s.deleteCurriculumNode)
		r.With(s.can(authorization.ContentPlacementsRead)).Get("/{id}/content", s.resolveCurriculumNodeContent)
		r.With(s.can(authorization.MindmapsRead)).Get("/{id}/mindmaps", s.listCurriculumNodeMindmaps)
	})

	r.Route("/placements", func(r chi.Router) {
		r.With(s.can(authorization.ContentPlacementsRead)).Get("/", s.listPlacements)
		r.With(s.can(authorization.ContentPlacementsCreate)).Post("/", s.createPlacement)
		r.With(s.can(authorization.ContentPlacementsRead)).Get("/{id}", s.getPlacement)
		r.With(s.can(authorization.ContentPlacementsWrite)).Patch("/{id}", s.updatePlacement)
		r.With(s.can(authorization.ContentPlacementsDelete)).Delete("/{id}", s.deletePlacement)
	})
}

func (s *Server) mountAcademic(r chi.Router) {
	r.Route("/academic-sessions", func(r chi.Router) {
		r.With(s.can(authorization.AcademicSessionsRead)).Get("/", s.listSessions)
		r.With(s.can(authorization.AcademicSessionsWrite)).Post("/", s.createSession)
		r.With(s.can(authorization.AcademicSessionsRead)).Get("/{id}", s.getSession)
		r.With(s.can(authorization.AcademicSessionsWrite)).Patch("/{id}", s.updateSession)
		r.With(s.can(authorization.AcademicSessionsDelete)).Delete("/{id}", s.deleteSession)
	})

	r.Route("/branches", func(r chi.Router) {
		r.With(s.can(authorization.ReferenceRead)).Get("/", s.listBranches)
		r.With(s.can(authorization.ReferenceWrite)).Post("/", s.createBranch)
		r.With(s.can(authorization.ReferenceRead)).Get("/{id}", s.getBranch)
		r.With(s.can(authorization.ReferenceWrite)).Patch("/{id}", s.updateBranch)
		r.With(s.can(authorization.ReferenceDelete)).Delete("/{id}", s.deleteBranch)
	})

	r.Route("/grade-levels", func(r chi.Router) {
		r.With(s.can(authorization.ReferenceRead)).Get("/", s.listGradeLevels)
		r.With(s.can(authorization.ReferenceWrite)).Post("/", s.createGradeLevel)
		r.With(s.can(authorization.ReferenceWrite)).Patch("/{id}", s.updateGradeLevel)
		r.With(s.can(authorization.ReferenceDelete)).Delete("/{id}", s.deleteGradeLevel)
	})

	r.Route("/school-houses", func(r chi.Router) {
		r.With(s.can(authorization.ReferenceRead)).Get("/", s.listHouses)
		r.With(s.can(authorization.ReferenceWrite)).Post("/", s.createHouse)
		r.With(s.can(authorization.ReferenceWrite)).Patch("/{id}", s.updateHouse)
		r.With(s.can(authorization.ReferenceDelete)).Delete("/{id}", s.deleteHouse)
	})

	r.Route("/subjects", func(r chi.Router) {
		r.With(s.can(authorization.ReferenceRead)).Get("/", s.listSubjects)
		r.With(s.can(authorization.ReferenceWrite)).Post("/", s.createSubject)
		r.With(s.can(authorization.ReferenceWrite)).Patch("/{id}", s.updateSubject)
		r.With(s.can(authorization.ReferenceDelete)).Delete("/{id}", s.deleteSubject)
	})

	r.Route("/subject-groups", func(r chi.Router) {
		r.With(s.can(authorization.ReferenceRead)).Get("/", s.listSubjectGroups)
		r.With(s.can(authorization.ReferenceWrite)).Post("/", s.createSubjectGroup)
		r.With(s.can(authorization.ReferenceWrite)).Patch("/{id}", s.updateSubjectGroup)
		r.With(s.can(authorization.ReferenceDelete)).Delete("/{id}", s.deleteSubjectGroup)
	})

	r.Route("/sections", func(r chi.Router) {
		r.With(s.can(authorization.SectionsRead)).Get("/", s.listSections)
		r.With(s.can(authorization.SectionsWrite)).Post("/", s.createSection)
		r.With(s.can(authorization.SectionsRead)).Get("/{id}", s.getSection)
		r.With(s.can(authorization.TimetableRead)).Get("/{id}/calendar", s.getSectionCalendar)
		r.With(s.can(authorization.SectionsWrite)).Patch("/{id}", s.updateSection)
		r.With(s.can(authorization.SectionsDelete)).Delete("/{id}", s.deleteSection)
	})

	r.Route("/subject-offerings", func(r chi.Router) {
		r.With(s.can(authorization.SubjectOfferingsRead)).Get("/", s.listOfferings)
		r.With(s.can(authorization.SubjectOfferingsWrite)).Post("/", s.createOffering)
		r.With(s.can(authorization.SubjectOfferingsRead)).Get("/{id}", s.getOffering)
		r.With(s.can(authorization.TimetableRead)).Get("/{id}/results", s.listOfferingResults)
		r.With(s.can(authorization.SubjectOfferingsWrite)).Patch("/{id}", s.updateOffering)
		r.With(s.can(authorization.SubjectOfferingsDelete)).Delete("/{id}", s.deleteOffering)
	})

	r.Route("/elective-groups", func(r chi.Router) {
		r.With(s.can(authorization.SubjectOfferingsRead)).Get("/", s.listElectiveGroups)
		r.With(s.can(authorization.SubjectOfferingsWrite)).Post("/", s.createElectiveGroup)
		r.With(s.can(authorization.SubjectOfferingsRead)).Get("/{id}", s.getElectiveGroup)
		r.With(s.can(authorization.SubjectOfferingsWrite)).Patch("/{id}", s.updateElectiveGroup)
		r.With(s.can(authorization.SubjectOfferingsDelete)).Delete("/{id}", s.deleteElectiveGroup)
		r.With(s.can(authorization.SubjectOfferingsRead)).Get("/{id}/offerings", s.listElectiveGroupOfferings)
		r.With(s.can(authorization.SubjectOfferingsWrite)).Post("/{id}/offerings", s.addElectiveGroupOffering)
		r.With(s.can(authorization.SubjectOfferingsDelete)).
			Delete("/{id}/offerings/{offeringID}", s.removeElectiveGroupOffering)
		r.With(s.can(authorization.SubjectEnrollmentsRead)).Get("/{id}/choices", s.listElectiveChoices)
		r.With(s.can(authorization.SubjectEnrollmentsWrite)).Post("/{id}/choices", s.chooseElective)
		r.With(s.can(authorization.SubjectEnrollmentsWrite)).
			Patch("/{id}/choices/{enrollmentID}", s.changeElectiveChoice)
	})

	r.Route("/enrollments", func(r chi.Router) {
		r.With(s.can(authorization.EnrollmentsRead)).Get("/", s.listEnrollments)
		r.With(s.can(authorization.EnrollmentsWrite)).Post("/", s.createEnrollment)
		r.With(s.can(authorization.EnrollmentsRead)).Get("/{id}", s.getEnrollment)
		r.With(s.can(authorization.EnrollmentsWrite)).Patch("/{id}", s.updateEnrollment)
		r.With(s.can(authorization.EnrollmentsDelete)).Delete("/{id}", s.deleteEnrollment)
	})

	r.Route("/subject-enrollments", func(r chi.Router) {
		r.With(s.can(authorization.SubjectEnrollmentsRead)).Get("/", s.listSubjectEnrollments)
		r.With(s.can(authorization.SubjectEnrollmentsWrite)).Post("/", s.createSubjectEnrollment)
		r.With(s.can(authorization.SubjectEnrollmentsWrite)).Patch("/{id}", s.updateSubjectEnrollment)
		r.With(s.can(authorization.SubjectEnrollmentsDelete)).Delete("/{id}", s.deleteSubjectEnrollment)
	})

	r.Route("/teacher-assignments", func(r chi.Router) {
		r.With(s.can(authorization.TeacherAssignmentsRead)).Get("/", s.listTeacherAssignments)
		r.With(s.can(authorization.TeacherAssignmentsWrite)).Post("/", s.createTeacherAssignment)
		r.With(s.can(authorization.TeacherAssignmentsWrite)).Patch("/{id}", s.updateTeacherAssignment)
		r.With(s.can(authorization.TeacherAssignmentsDelete)).Delete("/{id}", s.deleteTeacherAssignment)
	})

	r.Route("/student-assignments", func(r chi.Router) {
		r.With(s.can(authorization.StudentAssignmentsRead)).Get("/", s.listStudentAssignments)
		r.With(s.can(authorization.StudentAssignmentsWrite)).Post("/", s.createStudentAssignment)
		r.With(s.can(authorization.StudentAssignmentsWrite)).Patch("/{id}", s.updateStudentAssignment)
		r.With(s.can(authorization.StudentAssignmentsDelete)).Delete("/{id}", s.deleteStudentAssignment)
	})
}

func (s *Server) mountStudentRecords(r chi.Router) {
	r.Route("/student-addresses", func(r chi.Router) {
		r.With(s.can(authorization.StudentAddressesRead)).Get("/", s.listAddresses)
		r.With(s.can(authorization.StudentAddressesWrite)).Post("/", s.createAddress)
		r.With(s.can(authorization.StudentAddressesDelete)).Delete("/{id}", s.deleteAddress)
	})

	r.Route("/student-documents", func(r chi.Router) {
		r.With(s.can(authorization.StudentDocumentsRead)).Get("/", s.listDocuments)
		r.With(s.can(authorization.StudentDocumentsWrite)).Post("/", s.createDocument)
		r.With(s.can(authorization.StudentDocumentsWrite)).Post("/{id}/verify", s.verifyDocument)
		r.With(s.can(authorization.StudentDocumentsDelete)).Delete("/{id}", s.deleteDocument)
	})

	r.Route("/student-notes", func(r chi.Router) {
		r.With(s.can(authorization.StudentNotesRead)).Get("/", s.listNotes)
		r.With(s.can(authorization.StudentNotesWrite)).Post("/", s.createNote)
		r.With(s.can(authorization.StudentNotesWrite)).Patch("/{id}", s.updateNote)
		r.With(s.can(authorization.StudentNotesDelete)).Delete("/{id}", s.deleteNote)
	})
}

func (s *Server) authenticate() func(http.Handler) http.Handler {
	if s.verifier == nil {
		s.logger.Warn("CAS is not configured: requests run with a development subject")
		return mw.DevSubject(s.logger)
	}
	return mw.Authenticate(s.verifier, s.logger)
}

func (s *Server) can(entity authorization.Entity) func(http.Handler) http.Handler {
	return mw.Authorize(s.guard, entity)
}
