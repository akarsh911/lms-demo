package http

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	"github.com/Harbour-Emerge/emerge-core/internal/observability"
	"github.com/Harbour-Emerge/emerge-core/internal/service/mindmap"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

type mindmapGradePayload struct {
	Kind    *string           `json:"kind"`
	N       *int              `json:"n"`
	Seed    *int              `json:"seed"`
	TopicID *string           `json:"topic_id"`
	Answers map[string]string `json:"answers"`
}

func mindmapPathParam(w http.ResponseWriter, r *http.Request, name string) (string, bool) {
	value, err := url.PathUnescape(chi.URLParam(r, name))
	if err != nil || strings.TrimSpace(value) == "" {
		response.Error(w, http.StatusBadRequest, name+" is not a usable identifier")
		return "", false
	}
	return value, true
}

func optionalWholeNumber(p *filter.Params, values url.Values, name string) *int {
	if strings.TrimSpace(values.Get(name)) == "" {
		p.Allow(name)
		return nil
	}
	n := p.Int(name, 0)
	return &n
}

func refuseMindmapQuery(w http.ResponseWriter, values url.Values) bool {
	if err := filter.New(values).Err(); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return false
	}
	return true
}

func parseMindmapTrace(values url.Values) (mindmap.TraceQuery, error) {
	p := filter.New(values)

	query := mindmap.TraceQuery{
		From:    p.String("from"),
		To:      p.String("to"),
		MaxHops: optionalWholeNumber(p, values, "max_hops"),
	}
	if err := p.Err(); err != nil {
		return mindmap.TraceQuery{}, err
	}
	if query.From == "" {
		return mindmap.TraceQuery{}, &filter.Error{Param: "from", Reason: "is required"}
	}
	if query.To == "" {
		return mindmap.TraceQuery{}, &filter.Error{Param: "to", Reason: "is required"}
	}
	return query, nil
}

func parseMindmapDrill(values url.Values) (mindmap.DrillQuery, error) {
	p := filter.New(values).Allow("with_answers")

	query := mindmap.DrillQuery{
		Kind:    p.String("kind"),
		N:       optionalWholeNumber(p, values, "n"),
		Seed:    optionalWholeNumber(p, values, "seed"),
		TopicID: p.String("topic_id"),
	}
	if err := p.Err(); err != nil {
		return mindmap.DrillQuery{}, err
	}
	return query, nil
}

func (s *Server) mindmapChapterFor(w http.ResponseWriter,
	r *http.Request) (mindmapBook, string, bool) {

	section, ok := mindmapPathParam(w, r, mindmapSectionParam)
	if !ok {
		return mindmapBook{}, "", false
	}
	book, ok := s.mindmapBookFor(w, r)
	if !ok {
		return mindmapBook{}, "", false
	}

	belongs, refusal, err := mindmapService.HasSection(r.Context(), book.caller, book.document, section)
	if err != nil {
		writeMindmapErr(r.Context(), w, err)
		return mindmapBook{}, "", false
	}
	if refusal != nil {
		relayMindmapRefusal(r.Context(), w, *refusal)
		return mindmapBook{}, "", false
	}
	if !belongs {
		observability.Decision(r.Context(), false, "mind map refused: the chapter is not in this book",
			"content_item", book.item, "section", section)
		response.Error(w, http.StatusNotFound, mindmapChapterNotFound)
		return mindmapBook{}, "", false
	}
	return book, section, true
}

func (s *Server) listMindmapChapters(w http.ResponseWriter, r *http.Request) {
	if !s.mindmapsOn(w) {
		return
	}
	if !refuseMindmapQuery(w, r.URL.Query()) {
		return
	}
	book, ok := s.mindmapBookFor(w, r)
	if !ok {
		return
	}

	reply, err := mindmapService.Chapters(r.Context(), book.caller, book.document)
	relayMindmap(r.Context(), w, reply, err)
}

func (s *Server) getMindmap(w http.ResponseWriter, r *http.Request) {
	if !s.mindmapsOn(w) {
		return
	}
	if !refuseMindmapQuery(w, r.URL.Query()) {
		return
	}
	book, section, ok := s.mindmapChapterFor(w, r)
	if !ok {
		return
	}

	reply, err := mindmapService.Map(r.Context(), book.caller, section)
	relayMindmap(r.Context(), w, reply, err)
}

func (s *Server) getMindmapNode(w http.ResponseWriter, r *http.Request) {
	if !s.mindmapsOn(w) {
		return
	}
	if !refuseMindmapQuery(w, r.URL.Query()) {
		return
	}
	node, ok := mindmapPathParam(w, r, mindmapNodeParam)
	if !ok {
		return
	}
	book, section, ok := s.mindmapChapterFor(w, r)
	if !ok {
		return
	}

	reply, err := mindmapService.Node(r.Context(), book.caller, section, node)
	relayMindmap(r.Context(), w, reply, err)
}

func (s *Server) traceMindmap(w http.ResponseWriter, r *http.Request) {
	if !s.mindmapsOn(w) {
		return
	}
	query, err := parseMindmapTrace(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	book, section, ok := s.mindmapChapterFor(w, r)
	if !ok {
		return
	}

	reply, err := mindmapService.Trace(r.Context(), book.caller, section, query)
	relayMindmap(r.Context(), w, reply, err)
}

func (s *Server) getMindmapDrill(w http.ResponseWriter, r *http.Request) {
	if !s.mindmapsOn(w) {
		return
	}
	query, err := parseMindmapDrill(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	book, section, ok := s.mindmapChapterFor(w, r)
	if !ok {
		return
	}

	reply, err := mindmapService.Drill(r.Context(), book.caller, section, query)
	relayMindmap(r.Context(), w, reply, err)
}

func (s *Server) gradeMindmapDrill(w http.ResponseWriter, r *http.Request) {
	if !s.mindmapsOn(w) {
		return
	}
	if !refuseMindmapQuery(w, r.URL.Query()) {
		return
	}

	var in mindmapGradePayload
	if err := response.Decode(r, &in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	if in.Answers == nil {
		response.Error(w, http.StatusBadRequest,
			"answers is required: an object of drill item id to the text answered")
		return
	}

	seat, ok := s.masteryGrader(w, r)
	if !ok {
		return
	}
	book, section, ok := s.mindmapChapterFor(w, r)
	if !ok {
		return
	}

	reply, err := mindmapService.Grade(r.Context(), book.caller, section, mindmap.Attempt{
		Kind:    in.Kind,
		N:       in.N,
		Seed:    in.Seed,
		TopicID: in.TopicID,
		Answers: in.Answers,
	})
	if seat != nil && err == nil && reply.OK() && json.Valid(reply.Body) {
		s.recordMindmapGrade(w, r, book, section, *seat, reply.Body)
	}
	relayMindmap(r.Context(), w, reply, err)
}

func relayMindmap(ctx context.Context, w http.ResponseWriter, reply mindmap.Reply, err error) {
	if err != nil {
		writeMindmapErr(ctx, w, err)
		return
	}
	if !reply.OK() {
		relayMindmapRefusal(ctx, w, reply)
		return
	}
	if !json.Valid(reply.Body) {
		writeMindmapErr(ctx, w, mindmap.ErrUnreadable)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(reply.Body)
}

func relayedMindmapStatus(status int) bool {
	switch status {
	case http.StatusBadRequest,
		http.StatusUnauthorized,
		http.StatusForbidden,
		http.StatusNotFound,
		http.StatusConflict,
		http.StatusUnprocessableEntity:
		return true
	}
	return false
}

func relayMindmapRefusal(ctx context.Context, w http.ResponseWriter, reply mindmap.Reply) {
	detail := reply.Detail()

	switch {
	case relayedMindmapStatus(reply.Status):
		if detail == "" {
			detail = "the mind-map service refused the request with " + strconv.Itoa(reply.Status)
		}
		observability.Step(ctx, observability.ComponentData, "mind-map refusal relayed",
			"status", reply.Status)
		refuseMindmap(w, reply.Status, MindmapRefusedCode, detail)
	case reply.Status == http.StatusServiceUnavailable:
		observability.Problem(ctx, observability.ComponentData,
			"the retrieval engine behind the mind-map service is unavailable",
			mindmapUpstreamErr(reply.Status, detail))
		refuseMindmap(w, http.StatusServiceUnavailable, MindmapEngineDownCode,
			withMindmapDetail("the retrieval engine behind the mind-map service is unavailable, "+
				"so no map could be drawn; this is an outage and not an empty book", detail))
	default:
		observability.Problem(ctx, observability.ComponentData,
			"the mind-map service answered with a status this server does not relay",
			mindmapUpstreamErr(reply.Status, detail))
		refuseMindmap(w, http.StatusBadGateway, MindmapServiceDownCode,
			withMindmapDetail("the mind-map service answered "+strconv.Itoa(reply.Status)+
				", so no map could be drawn", detail))
	}
}

func mindmapUpstreamErr(status int, detail string) error {
	return errors.New(withMindmapDetail("upstream status "+strconv.Itoa(status), detail))
}

func withMindmapDetail(message, detail string) string {
	if detail == "" {
		return message
	}
	return message + ": " + detail
}

func writeMindmapErr(ctx context.Context, w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, mindmap.ErrUnreachable):
		observability.Problem(ctx, observability.ComponentData,
			"the mind-map service could not be reached", err)
		refuseMindmap(w, http.StatusBadGateway, MindmapServiceDownCode,
			"the mind-map service could not be reached, so no map could be drawn; "+
				"this is an outage and not an empty book")
	case errors.Is(err, mindmap.ErrUnreadable):
		observability.Problem(ctx, observability.ComponentData,
			"the mind-map service answered with a body this server could not read", err)
		refuseMindmap(w, http.StatusBadGateway, MindmapServiceDownCode,
			"the mind-map service answered with a body this server could not read, "+
				"so nothing was relayed")
	case errors.Is(err, mindmap.ErrNoTenant):
		refuseMindmap(w, http.StatusServiceUnavailable, MindmapUnmappedCode,
			"this school carries no CAS tenant slug and the retrieval engine partitions on one, "+
				"so there is no corpus to draw a map from; an operator must map the school first")
	default:
		response.ServerError(w, err)
	}
}
