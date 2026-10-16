package mindmap

import (
	"context"
	"strings"
	"sync"
	"time"

	"github.com/Harbour-Emerge/emerge-core/internal/service/indexing"
)

const (
	StructureCacheTTL = 60 * time.Second

	StructureMissTTL = 10 * time.Second

	StructureCacheLimit = 512

	StructureTimeout = 3 * time.Second
)

type StructureSource interface {
	PublishedDocument(ctx context.Context, tenant, documentID string) (*indexing.PublishedDocument, error)
}

type Structure struct {
	Digest string
	Chunks *int
}

func (s Structure) Known() bool { return s.Digest != "" }

type structureKey struct {
	tenant   string
	document string
}

type structureEntry struct {
	structure Structure
	expires   time.Time
}

type Structures struct {
	source StructureSource
	now    func() time.Time

	mu      sync.Mutex
	entries map[structureKey]structureEntry
}

func NewStructures(source StructureSource) *Structures {
	if source == nil {
		return nil
	}
	return &Structures{
		source:  source,
		now:     time.Now,
		entries: map[structureKey]structureEntry{},
	}
}

func (s *Structures) Of(ctx context.Context, tenant, documentID string) Structure {
	if s == nil {
		return Structure{}
	}
	key := structureKey{tenant: strings.TrimSpace(tenant), document: strings.TrimSpace(documentID)}
	if key.tenant == "" || key.document == "" {
		return Structure{}
	}
	if cached, fresh := s.cached(key); fresh {
		return cached
	}

	ctx, cancel := context.WithTimeout(ctx, StructureTimeout)
	defer cancel()

	found := Structure{}
	ttl := StructureMissTTL
	if published, err := s.source.PublishedDocument(ctx, key.tenant, key.document); err == nil &&
		published != nil && published.StructureDigest != "" {
		found = Structure{Digest: published.StructureDigest, Chunks: published.Chunks}
		ttl = StructureCacheTTL
	}
	s.remember(key, found, ttl)
	return found
}

func (s *Structures) cached(key structureKey) (Structure, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	entry, known := s.entries[key]
	if !known {
		return Structure{}, false
	}
	if !s.now().Before(entry.expires) {
		delete(s.entries, key)
		return Structure{}, false
	}
	return entry.structure, true
}

func (s *Structures) remember(key structureKey, structure Structure, ttl time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := s.now()
	if len(s.entries) >= StructureCacheLimit {
		for other, entry := range s.entries {
			if !now.Before(entry.expires) {
				delete(s.entries, other)
			}
		}
	}
	if len(s.entries) >= StructureCacheLimit {
		s.entries = map[structureKey]structureEntry{}
	}
	s.entries[key] = structureEntry{structure: structure, expires: now.Add(ttl)}
}
