#!/usr/bin/env bash
# End-to-end run against a live instance: registers a school, builds a year of
# academic structure, exercises the scoping rules, then deletes everything.
#
#   ./scripts/e2e.sh [base-url]
#
# Needs curl and python3. Assumes CAS is disabled (AUTH_DISABLED=true), so
# requests run as the development subject and no token is required.
set -uo pipefail

BASE="${1:-http://localhost:8081}"
SCHOOL_CODE="E2E-$(date +%H%M%S)"
# The subject AUTH_DISABLED injects. A note's author is read from it, never
# from the payload, so the run needs a person row carrying this id.
CALLER_CAS_ID="00000000-0000-0000-0000-000000000000"
COUNTS="$(mktemp -d)"
: > "$COUNTS/pass"
: > "$COUNTS/fail"

PY=python
command -v python3 >/dev/null 2>&1 && PY=python3
command -v "$PY" >/dev/null 2>&1 || { echo "python is required"; exit 1; }

# Anything created gets recorded here and removed on exit, whatever happens.
declare -a CREATED=()

cleanup() {
    [ ${#CREATED[@]} -eq 0 ] && return
    echo
    echo "-- cleanup --"
    local removed=0 stuck=0
    for ((i = ${#CREATED[@]} - 1; i >= 0; i--)); do
        local entry="${CREATED[$i]}"
        local path="${entry%% *}"
        local scoped="${entry##* }"
        local code
        if [ "$scoped" = "tenant" ]; then
            code="$(curl -s -o /dev/null -w '%{http_code}' -X DELETE -H "X-School-Id: $SCHOOL_CODE" "$BASE$path")"
        else
            code="$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE$path")"
        fi
        if [ "$code" = "204" ]; then
            removed=$((removed + 1))
        else
            stuck=$((stuck + 1))
            printf '  [31mleft behind[0m %s -> %s
' "$path" "$code" >&2
        fi
    done
    echo "removed $removed rows, $stuck left behind"
    [ "$stuck" -eq 0 ] || echo "cleanup was incomplete; the run has leaked rows"
}
trap cleanup EXIT

# Counts go to files: call() runs in a command substitution, and a
# subshell cannot increment a variable in its parent. Losing a failure
# that way would let this script exit 0 while something was broken.
ok()  { echo x >> "$COUNTS/pass"; printf '  [32mok[0m   %s
' "$1" >&2; }
bad() { echo x >> "$COUNTS/fail"; printf '  [31mFAIL[0m %s
' "$1" >&2; }

# field KEY < json  -- reads one top-level key, empty when absent or not JSON.
field() {
    "$PY" -c "
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    print(''); raise SystemExit
v = d.get('$1', '') if isinstance(d, dict) else ''
print('' if v is None else v)
"
}

# uuid4 prints a fresh identifier for a CAS user id.
uuid4() { "$PY" -c "import uuid; print(uuid.uuid4())"; }

# call METHOD PATH EXPECTED [BODY] [none]
# Echoes the response body so callers can pull ids out of it.
call() {
    local method="$1" path="$2" expect="$3" body="${4:-}" tenant="${5:-tenant}"
    local args=(-s -w '\n%{http_code}' -X "$method" "$BASE$path")

    [ "$tenant" = "tenant" ] && args+=(-H "X-School-Id: $SCHOOL_CODE")
    if [ -n "$body" ]; then
        args+=(-H 'Content-Type: application/json' -d "$body")
    fi

    local out code payload
    out="$(curl "${args[@]}")"
    code="$(printf '%s' "$out" | tail -n1)"
    payload="$(printf '%s' "$out" | sed '$d')"

    if [ "$code" = "$expect" ]; then
        ok "$method $path -> $code"
    else
        bad "$method $path -> $code (expected $expect)"
        printf '       %s\n' "$(printf '%s' "$payload" | head -c 300)" >&2
    fi
    printf '%s' "$payload"
}

id_of() { printf '%s' "$1" | field id; }
count_of() { printf '%s' "$1" | field count; }
track() { CREATED+=("$1 ${2:-tenant}"); }

expect_count() {
    local label="$1" body="$2" want="$3"
    local got; got="$(count_of "$body")"
    if [ "$got" = "$want" ]; then ok "$label = $want"; else bad "$label = $got, expected $want"; fi
}

echo "emerge-core end-to-end against $BASE (school $SCHOOL_CODE)"

echo
echo "-- health --"
call GET /health 200 '' none >/dev/null
call GET /api/v1 200 '' none >/dev/null
call GET /api/v1/health 200 '' none >/dev/null

echo
echo "-- control plane --"
school="$(call POST /api/v1/schools 201 "{\"name\":\"E2E School $SCHOOL_CODE\",\"code\":\"$SCHOOL_CODE\",\"timezone\":\"Asia/Kolkata\",\"country\":\"IN\"}" none)"
SCHOOL_ID="$(id_of "$school")"
[ -n "$SCHOOL_ID" ] || { echo "could not create school; is the control plane migrated?"; exit 1; }
track "/api/v1/schools/$SCHOOL_ID" none

# Point the new school at the demo tenant database. Adjust if yours differs.
call PUT "/api/v1/schools/$SCHOOL_ID/profiles/postgres" 200 \
    '{"host":"localhost","port":5434,"database":"emerge_tenant_demo","user":"emerge","password":"emerge","sslmode":"disable"}' none >/dev/null

echo
echo "-- tenant setup --"
branch="$(call POST /api/v1/branches 201 "{\"name\":\"Main Campus\",\"code\":\"$SCHOOL_CODE-MAIN\"}")"
BRANCH_ID="$(id_of "$branch")"
[ -n "$BRANCH_ID" ] || { echo "tenant database unreachable; run: go run ./cmd/migrate apply -plane tenant"; exit 1; }
track "/api/v1/branches/$BRANCH_ID"

session="$(call POST /api/v1/academic-sessions 201 "{\"name\":\"E2E $SCHOOL_CODE\",\"code\":\"$SCHOOL_CODE-YR\",\"start_date\":\"2026-04-01\",\"end_date\":\"2027-03-31\",\"status\":\"active\",\"is_current\":true}")"
SESSION_ID="$(id_of "$session")"; track "/api/v1/academic-sessions/$SESSION_ID"

grade="$(call POST /api/v1/grade-levels 201 "{\"name\":\"E2E Class 6\",\"code\":\"$SCHOOL_CODE-G6\",\"sequence\":6}")"
GRADE_ID="$(id_of "$grade")"; track "/api/v1/grade-levels/$GRADE_ID"

house="$(call POST /api/v1/school-houses 201 "{\"name\":\"E2E Emerald $SCHOOL_CODE\",\"code\":\"$SCHOOL_CODE-EMR\"}")"
HOUSE_ID="$(id_of "$house")"; track "/api/v1/school-houses/$HOUSE_ID"

maths="$(call POST /api/v1/subjects 201 "{\"name\":\"E2E Mathematics $SCHOOL_CODE\",\"code\":\"$SCHOOL_CODE-MATH\"}")"
MATHS_ID="$(id_of "$maths")"; track "/api/v1/subjects/$MATHS_ID"

french="$(call POST /api/v1/subjects 201 "{\"name\":\"E2E French $SCHOOL_CODE\",\"code\":\"$SCHOOL_CODE-FRE\",\"is_elective\":true}")"
FRENCH_ID="$(id_of "$french")"; track "/api/v1/subjects/$FRENCH_ID"

echo
echo "-- people --"
sp="$(call POST /api/v1/persons 201 "{\"cas_user_id\":\"$(uuid4)\",\"first_name\":\"Aarav\",\"last_name\":\"Sharma\"}")"
STUDENT_PERSON="$(id_of "$sp")"; track "/api/v1/persons/$STUDENT_PERSON"

student="$(call POST /api/v1/students 201 "{\"person_id\":\"$STUDENT_PERSON\",\"admission_number\":\"ADM-$SCHOOL_CODE\",\"admission_date\":\"2026-04-01\",\"house_id\":\"$HOUSE_ID\"}")"
STUDENT_ID="$(id_of "$student")"; track "/api/v1/students/$STUDENT_ID"

tp="$(call POST /api/v1/persons 201 "{\"cas_user_id\":\"$(uuid4)\",\"first_name\":\"Meera\",\"last_name\":\"Iyer\"}")"
TEACHER_PERSON="$(id_of "$tp")"; track "/api/v1/persons/$TEACHER_PERSON"

staff="$(call POST /api/v1/staff 201 "{\"person_id\":\"$TEACHER_PERSON\",\"employee_code\":\"EMP-$SCHOOL_CODE\",\"branch_id\":\"$BRANCH_ID\",\"employment_type\":\"full_time\"}")"
STAFF_ID="$(id_of "$staff")"; track "/api/v1/staff/$STAFF_ID"

teacher="$(call POST /api/v1/teachers 201 "{\"staff_id\":\"$STAFF_ID\",\"specialization\":\"Mathematics\"}")"
TEACHER_ID="$(id_of "$teacher")"; track "/api/v1/teachers/$TEACHER_ID"

gp="$(call POST /api/v1/persons 201 "{\"cas_user_id\":\"$(uuid4)\",\"first_name\":\"Rohit\",\"last_name\":\"Sharma\"}")"
GUARDIAN_PERSON="$(id_of "$gp")"; track "/api/v1/persons/$GUARDIAN_PERSON"

guardian="$(call POST /api/v1/guardians 201 "{\"person_id\":\"$GUARDIAN_PERSON\"}")"
GUARDIAN_ID="$(id_of "$guardian")"; track "/api/v1/guardians/$GUARDIAN_ID"

call POST "/api/v1/guardians/$GUARDIAN_ID/students" 201 \
    "{\"student_id\":\"$STUDENT_ID\",\"relationship_type\":\"father\",\"is_primary\":true,\"can_view_academic\":true,\"can_view_finance\":false}" >/dev/null

echo
echo "-- structure --"
section="$(call POST /api/v1/sections 201 "{\"academic_session_id\":\"$SESSION_ID\",\"branch_id\":\"$BRANCH_ID\",\"grade_level_id\":\"$GRADE_ID\",\"name\":\"A\",\"code\":\"$SCHOOL_CODE-6A\",\"capacity\":40,\"class_teacher_id\":\"$TEACHER_ID\"}")"
SECTION_ID="$(id_of "$section")"; track "/api/v1/sections/$SECTION_ID"

mo="$(call POST /api/v1/subject-offerings 201 "{\"academic_session_id\":\"$SESSION_ID\",\"section_id\":\"$SECTION_ID\",\"subject_id\":\"$MATHS_ID\",\"maximum_marks\":100,\"pass_marks\":33}")"
MATHS_OFFERING="$(id_of "$mo")"; track "/api/v1/subject-offerings/$MATHS_OFFERING"

fo="$(call POST /api/v1/subject-offerings 201 "{\"academic_session_id\":\"$SESSION_ID\",\"section_id\":\"$SECTION_ID\",\"subject_id\":\"$FRENCH_ID\",\"maximum_marks\":100,\"pass_marks\":33}")"
FRENCH_OFFERING="$(id_of "$fo")"; track "/api/v1/subject-offerings/$FRENCH_OFFERING"

enrollment="$(call POST /api/v1/enrollments 201 "{\"student_id\":\"$STUDENT_ID\",\"academic_session_id\":\"$SESSION_ID\",\"section_id\":\"$SECTION_ID\",\"roll_number\":\"12\",\"enrollment_date\":\"2026-04-01\"}")"
ENROLLMENT_ID="$(id_of "$enrollment")"; track "/api/v1/enrollments/$ENROLLMENT_ID"

se1="$(call POST /api/v1/subject-enrollments 201 "{\"student_enrollment_id\":\"$ENROLLMENT_ID\",\"subject_offering_id\":\"$MATHS_OFFERING\"}")"
track "/api/v1/subject-enrollments/$(id_of "$se1")"

se2="$(call POST /api/v1/subject-enrollments 201 "{\"student_enrollment_id\":\"$ENROLLMENT_ID\",\"subject_offering_id\":\"$FRENCH_OFFERING\",\"is_elective_choice\":true}")"
track "/api/v1/subject-enrollments/$(id_of "$se2")"

echo
echo "-- teaching --"
ta1="$(call POST /api/v1/teacher-assignments 201 "{\"academic_session_id\":\"$SESSION_ID\",\"teacher_id\":\"$TEACHER_ID\",\"section_id\":\"$SECTION_ID\",\"role_type\":\"class_teacher\",\"is_primary\":true}")"
track "/api/v1/teacher-assignments/$(id_of "$ta1")"

ta2="$(call POST /api/v1/teacher-assignments 201 "{\"academic_session_id\":\"$SESSION_ID\",\"teacher_id\":\"$TEACHER_ID\",\"section_id\":\"$SECTION_ID\",\"subject_offering_id\":\"$FRENCH_OFFERING\",\"role_type\":\"subject_teacher\"}")"
track "/api/v1/teacher-assignments/$(id_of "$ta2")"

sa1="$(call POST /api/v1/student-assignments 201 "{\"academic_session_id\":\"$SESSION_ID\",\"student_id\":\"$STUDENT_ID\",\"section_id\":\"$SECTION_ID\",\"role_type\":\"class_monitor\",\"is_primary\":true}")"
track "/api/v1/student-assignments/$(id_of "$sa1")"

# No section: a house captain is wider than one section.
sa2="$(call POST /api/v1/student-assignments 201 "{\"academic_session_id\":\"$SESSION_ID\",\"student_id\":\"$STUDENT_ID\",\"role_type\":\"house_captain\"}")"
track "/api/v1/student-assignments/$(id_of "$sa2")"

echo
echo "-- student records --"
addr="$(call POST /api/v1/student-addresses 201 "{\"student_id\":\"$STUDENT_ID\",\"address_type\":\"home\",\"is_primary\":true,\"address_json\":{\"line1\":\"42 Civil Lines\",\"city\":\"Nagpur\",\"country\":\"IN\"}}")"
track "/api/v1/student-addresses/$(id_of "$addr")"

# The caller's own person row. Attribution is taken from the token, so a note
# cannot be written until the authenticated subject exists at this school.
cp="$(call POST /api/v1/persons 201 "{\"cas_user_id\":\"$CALLER_CAS_ID\",\"first_name\":\"Dev\",\"last_name\":\"Caller\"}")"
CALLER_PERSON="$(id_of "$cp")"; track "/api/v1/persons/$CALLER_PERSON"

note="$(call POST /api/v1/student-notes 201 "{\"student_id\":\"$STUDENT_ID\",\"academic_session_id\":\"$SESSION_ID\",\"category\":\"academic\",\"body\":\"Strong in algebra.\",\"visibility\":\"staff\"}")"
track "/api/v1/student-notes/$(id_of "$note")"

echo
echo "-- reads --"
expect_count "student takes 2 subjects" \
    "$(call GET "/api/v1/subject-enrollments?student_id=$STUDENT_ID" 200)" 2
expect_count "1 pupil takes the elective" \
    "$(call GET "/api/v1/subject-enrollments?subject_offering_id=$FRENCH_OFFERING" 200)" 1
expect_count "guardian has 1 child" \
    "$(call GET "/api/v1/students?guardian_id=$GUARDIAN_ID" 200)" 1
expect_count "1 student in the house" \
    "$(call GET "/api/v1/students?house_id=$HOUSE_ID" 200)" 1
expect_count "teacher has 2 assignments" \
    "$(call GET "/api/v1/teacher-assignments?teacher_id=$TEACHER_ID" 200)" 2

call GET "/api/v1/enrollments?section_id=$SECTION_ID" 200 >/dev/null
call GET "/api/v1/students?q=sharma" 200 >/dev/null
call GET "/api/v1/sections?academic_session_id=$SESSION_ID" 200 >/dev/null
call GET "/api/v1/student-notes?student_id=$STUDENT_ID" 200 >/dev/null

echo
echo "-- failures that must fail --"
call GET /api/v1/students 400 '' none >/dev/null
call GET /api/v1/students/not-a-uuid 400 >/dev/null
call GET /api/v1/nope 404 '' none >/dev/null
call GET "/api/v1/students?guardian_id=not-a-uuid" 400 >/dev/null
call GET "/api/v1/students?status=banana" 400 >/dev/null
call POST /api/v1/students 409 "{\"person_id\":\"$STUDENT_PERSON\",\"admission_number\":\"ADM-$SCHOOL_CODE\"}" >/dev/null
call POST /api/v1/subject-offerings 400 "{\"academic_session_id\":\"$SESSION_ID\",\"section_id\":\"$SECTION_ID\",\"subject_id\":\"$MATHS_ID\",\"maximum_marks\":50,\"pass_marks\":90}" >/dev/null
call POST /api/v1/student-assignments 400 "{\"academic_session_id\":\"$SESSION_ID\",\"student_id\":\"$STUDENT_ID\",\"section_id\":\"$SECTION_ID\",\"role_type\":\"class_teacher\"}" >/dev/null

# A misspelt filter is refused, not ignored. Dropping it silently returned the
# whole page with a 200, which is the same fail-open shape as a missing
# predicate and just as invisible to a test that only checks what should show.
call GET "/api/v1/students?studentid=$STUDENT_ID" 400 >/dev/null
call GET "/api/v1/enrollments?section=$SECTION_ID" 400 >/dev/null

# Attribution is read from the token. Supplying it is refused outright rather
# than overwritten, so a caller learns their claim did not stand.
call POST /api/v1/student-notes 400 "{\"student_id\":\"$STUDENT_ID\",\"academic_session_id\":\"$SESSION_ID\",\"author_person_id\":\"$TEACHER_PERSON\",\"category\":\"academic\",\"body\":\"x\"}" >/dev/null
call POST /api/v1/student-assignments 400 "{\"academic_session_id\":\"$SESSION_ID\",\"student_id\":\"$STUDENT_ID\",\"role_type\":\"class_monitor\",\"assigned_by\":\"$TEACHER_PERSON\"}" >/dev/null

# A write against an id the caller cannot reach is a 404, never a 403: a 403
# would confirm the row is real, and walking the id space is exactly what the
# narrowing exists to stop.
call PATCH /api/v1/students/11111111-1111-4111-8111-111111111111 404 '{"status":"withdrawn"}' >/dev/null
call DELETE /api/v1/student-notes/11111111-1111-4111-8111-111111111111 404 >/dev/null

PASS=$(wc -l < "$COUNTS/pass" | tr -d ' ')
FAIL=$(wc -l < "$COUNTS/fail" | tr -d ' ')
rm -rf "$COUNTS"

echo
echo "passed $PASS, failed $FAIL"
[ "$FAIL" -eq 0 ]
