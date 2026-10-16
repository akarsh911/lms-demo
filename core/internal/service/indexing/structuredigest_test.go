package indexing

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func digestEngine(t *testing.T, body string) *Client {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/documents/doc_biology/digest" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, body)
	}))
	t.Cleanup(server.Close)

	client, err := NewClient(ClientConfig{BaseURL: server.URL})
	if err != nil {
		t.Fatalf("could not build a client: %v", err)
	}
	return client
}

func TestPublishedDocumentCarriesTheStructureDigestAndChunkCount(t *testing.T) {
	client := digestEngine(t, `{"document_id":"doc_biology","tenant_id":"dps-ngp","scope":"school",`+
		`"counts":{"chunks":412,"blocks":2140,"sections":16},`+
		`"chunk_digest":"cccc","block_digest":"bbbb","structure_digest":" 5f2a9c ","vector_digest":"vvvv"}`)

	published, err := client.PublishedDocument(context.Background(), "dps-ngp", "doc_biology")
	if err != nil {
		t.Fatalf("a published document returned %v", err)
	}
	if published.StructureDigest != "5f2a9c" {
		t.Fatalf("the structure digest was read as %q", published.StructureDigest)
	}
	if published.Chunks == nil || *published.Chunks != 412 {
		t.Fatalf("the chunk count was read as %v", published.Chunks)
	}
}

func TestPublishedDocumentWithNoStructureDigestSaysSoWithAnEmptyOne(t *testing.T) {
	client := digestEngine(t, `{"document_id":"doc_biology","tenant_id":"dps-ngp",`+
		`"counts":{"chunks":0},"chunk_digest":"cccc"}`)

	published, err := client.PublishedDocument(context.Background(), "dps-ngp", "doc_biology")
	if err != nil {
		t.Fatalf("an older engine that serves no structure digest returned %v", err)
	}
	if published.StructureDigest != "" {
		t.Fatalf("an absent digest must stay empty and not borrow another field, got %q",
			published.StructureDigest)
	}
}
