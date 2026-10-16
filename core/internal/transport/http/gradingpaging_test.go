package http

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
)

const gradingSchemesTable = "grading_schemes"

func seedGradingSchemes(fx *libraryFixture, session uuid.UUID, n int) {
	rows := make([]map[string]any, 0, n)
	for i := 0; i < n; i++ {
		rows = append(rows, map[string]any{
			"id":                  uuid.New(),
			"academic_session_id": session,
			"name":                fmt.Sprintf("Scheme %d", i),
			"code":                fmt.Sprintf("SCH-%d", i),
			"kind":                "marks",
			"status":              "active",
		})
	}
	fx.driver.tables[gradingSchemesTable] = rows
}

func TestGradingSchemesAnswerTheWindowTheClientAsksFor(t *testing.T) {
	windows := []struct {
		name    string
		stored  int
		limit   int
		offset  int
		hasMore bool
	}{
		{"the widest window the web client sends", 2, 200, 0, false},
		{"a full page may have more behind it", 3, 3, 6, true},
		{"a short page is the last one", 2, 3, 6, false},
		{"an empty page is the last one", 0, 3, 9, false},
	}

	for _, tc := range windows {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t)
			session := uuid.New()
			seedGradingSchemes(fx, session, tc.stored)

			w := fx.call(fx.server.listGradingSchemes, "GET",
				fmt.Sprintf("/api/v1/grading-schemes?limit=%d&offset=%d", tc.limit, tc.offset),
				"", uuid.Nil)

			count, got := envelopePage(t, w)
			if count != tc.stored {
				t.Fatalf("want %d rows counted, got %d", tc.stored, count)
			}
			if got.Limit != tc.limit || got.Offset != tc.offset {
				t.Fatalf("the page must repeat the window it was asked for, got %+v", got)
			}
			if got.HasMore != tc.hasMore {
				t.Fatalf("%d rows of a %d-row page: want has_more=%v, got %+v",
					tc.stored, tc.limit, tc.hasMore, got)
			}

			stmts := fx.statements(gradingSchemesTable)
			if len(stmts) == 0 {
				t.Fatalf("nothing ever read %s", gradingSchemesTable)
			}
			query := stmts[len(stmts)-1].query
			if !strings.Contains(query, fmt.Sprintf("LIMIT %d", tc.limit)) {
				t.Fatalf("the page the caller is told about must be the page that was read, got %q", query)
			}
			if tc.offset > 0 && !strings.Contains(query, fmt.Sprintf("OFFSET %d", tc.offset)) {
				t.Fatalf("the offset the caller is told about must be the one that was read, got %q", query)
			}
		})
	}
}

func TestGradingSchemesKeepTheirFiltersBesideTheWindow(t *testing.T) {
	fx := newLibraryFixture(t)
	session := uuid.New()
	seedGradingSchemes(fx, session, 1)

	w := fx.call(fx.server.listGradingSchemes, "GET",
		"/api/v1/grading-schemes?limit=200&offset=0&academic_session_id="+session.String()+
			"&status=active", "", uuid.Nil)

	if _, got := envelopePage(t, w); got.Limit != 200 {
		t.Fatalf("the window was dropped when a filter came with it, got %+v", got)
	}
	stmt := fx.statements(gradingSchemesTable)
	if len(stmt) == 0 {
		t.Fatalf("nothing ever read %s", gradingSchemesTable)
	}
	last := stmt[len(stmt)-1]
	if !last.carries(session) {
		t.Fatalf("academic_session_id never reached the read, got %v: %q", last.args, last.query)
	}
	if !last.carriesText("active") {
		t.Fatalf("status never reached the read, got %v: %q", last.args, last.query)
	}
}

func TestGradingSchemesRefuseWhatTheyDoNotUnderstand(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		want string
	}{
		{"an unknown parameter", "shelf=fiction", "shelf"},
		{"a misspelt parameter", "sessionId=" + uuid.New().String(), "sessionId"},
		{"a parameter from another surface", "limit=50&audience=school", "audience"},
		{"a limit that is not a number", "limit=lots", "limit"},
		{"an unknown status", "status=retired", "status"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t)
			seedGradingSchemes(fx, uuid.New(), 1)

			w := fx.call(fx.server.listGradingSchemes, "GET",
				"/api/v1/grading-schemes?"+tc.raw, "", uuid.Nil)

			if w.Code != http.StatusBadRequest {
				t.Fatalf("%s must be refused, got %d: %s",
					tc.raw, w.Code, strings.TrimSpace(w.Body.String()))
			}
			if msg := libraryMessage(t, w); !strings.Contains(msg, tc.want) {
				t.Fatalf("the refusal must name %q, got %q", tc.want, msg)
			}
			if stmts := fx.statements(gradingSchemesTable); len(stmts) > 0 {
				t.Fatalf("a refused query must not read %s, got %v", gradingSchemesTable, stmts)
			}
		})
	}
}
