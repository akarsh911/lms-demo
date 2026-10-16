package mindmap

import (
	"crypto/sha256"
	"sync"
	"time"
)

const (
	SectionCacheTTL = 60 * time.Second

	SectionCacheLimit = 512
)

type callerDigest [sha256.Size]byte

type sectionKey struct {
	tenant   string
	document string
	caller   callerDigest
}

type Section struct {
	ID        string
	Display   string
	PageStart *int
	PageEnd   *int
}

func (s Section) Pages() (int, int, bool) {
	if s.PageStart == nil || s.PageEnd == nil {
		return 0, 0, false
	}
	return *s.PageStart, *s.PageEnd, true
}

type sectionEntry struct {
	ids      map[string]struct{}
	sections []Section
	expires  time.Time
}

type sectionCache struct {
	mu      sync.Mutex
	ttl     time.Duration
	limit   int
	now     func() time.Time
	entries map[sectionKey]sectionEntry
}

func newSectionCache(ttl time.Duration, limit int, now func() time.Time) *sectionCache {
	return &sectionCache{
		ttl:     ttl,
		limit:   limit,
		now:     now,
		entries: map[sectionKey]sectionEntry{},
	}
}

func (c *sectionCache) holds(key sectionKey, sectionID string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()

	entry, known := c.entries[key]
	if !known {
		return false
	}
	if !c.now().Before(entry.expires) {
		delete(c.entries, key)
		return false
	}
	_, member := entry.ids[sectionID]
	return member
}

func (c *sectionCache) list(key sectionKey) ([]Section, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	entry, known := c.entries[key]
	if !known {
		return nil, false
	}
	if !c.now().Before(entry.expires) {
		delete(c.entries, key)
		return nil, false
	}
	return append([]Section(nil), entry.sections...), true
}

func (c *sectionCache) store(key sectionKey, sections []Section) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if len(sections) == 0 {
		delete(c.entries, key)
		return
	}
	ids := make(map[string]struct{}, len(sections))
	for _, section := range sections {
		ids[section.ID] = struct{}{}
	}
	c.entries[key] = sectionEntry{
		ids:      ids,
		sections: append([]Section(nil), sections...),
		expires:  c.now().Add(c.ttl),
	}
	c.trim(key)
}

func (c *sectionCache) trim(keep sectionKey) {
	if len(c.entries) <= c.limit {
		return
	}

	now := c.now()
	for key, entry := range c.entries {
		if key != keep && !now.Before(entry.expires) {
			delete(c.entries, key)
		}
	}

	for len(c.entries) > c.limit {
		oldest, found := sectionKey{}, false
		var soonest time.Time
		for key, entry := range c.entries {
			if key == keep {
				continue
			}
			if !found || entry.expires.Before(soonest) {
				oldest, soonest, found = key, entry.expires, true
			}
		}
		if !found {
			return
		}
		delete(c.entries, oldest)
	}
}

func (c *sectionCache) size() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.entries)
}
