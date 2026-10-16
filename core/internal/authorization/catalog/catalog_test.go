package catalog

import (
	"sort"
	"strings"
	"testing"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
)

var fieldlessAreas = map[string]string{
	"reference": "one area over branches, grade levels, houses, subjects and subject groups, whose column names collide on name, code and status, so a policy written about one would silently govern all five; no single Columns slice describes them",
	"mindmaps":  "an area with no table of its own: the book list is projected under the caller's core.library.read field policy and every other route relays the mind-map service's body unread, so a field policy registered on this key would be offered in CAS and honoured by nothing",
	"schools":   "putSchoolProfile writes school_profiles under this same entity, sharing name and status with schools and adding ciphertext, nonce and key_version, so a policy naming name would silently govern a credential row",
}

func catalogAreas() []string {
	seen := map[string]bool{}
	for _, e := range authorization.AllEntities {
		if area, _, ok := split(string(e)); ok {
			seen[area] = true
		}
	}
	out := make([]string, 0, len(seen))
	for a := range seen {
		out = append(out, a)
	}
	sort.Strings(out)
	return out
}

func TestEveryAreaEitherHasColumnsOrIsPinnedFieldless(t *testing.T) {
	for _, area := range catalogAreas() {
		_, hasColumns := areaColumns[area]
		reason, pinned := fieldlessAreas[area]

		switch {
		case hasColumns && pinned:
			t.Errorf("area %q has columns but is still pinned as fieldless (%s); remove it from fieldlessAreas", area, reason)
		case !hasColumns && !pinned:
			t.Errorf("area %q resolves to no columns and is not pinned; add an areaColumns entry, or pin it in fieldlessAreas with the reason it has none", area)
		}
	}
}

func TestPinnedFieldlessAreasStillExist(t *testing.T) {
	live := map[string]bool{}
	for _, area := range catalogAreas() {
		live[area] = true
	}
	for area := range fieldlessAreas {
		if !live[area] {
			t.Errorf("area %q is pinned as fieldless but no entity declares it; remove the stale pin", area)
		}
	}
}

func TestNarrowableAreasExposeRowFields(t *testing.T) {
	narrowable := narrowableAreas()

	for _, e := range Build().Entities {
		area, verb, ok := split(e.Key)
		if !ok || !narrowable[area] || verb == "create" {
			continue
		}

		var keys []string
		for _, f := range e.Fields {
			keys = append(keys, f.Key)
		}
		joined := strings.Join(keys, ",")

		if !strings.Contains(joined, authorization.ReachField) {
			t.Errorf("%s is narrowable but carries no %q field; a rule author cannot pick a reach", e.Key, authorization.ReachField)
		}
		for _, rf := range authorization.RowFields() {
			if !strings.Contains(joined, rf) {
				t.Errorf("%s is narrowable but carries no %q field; a rule author cannot pin it", e.Key, rf)
			}
		}
	}
}

func TestNonDeleteEntitiesOfKnownAreasCarryColumns(t *testing.T) {
	for _, e := range Build().Entities {
		area, verb, ok := split(e.Key)
		if !ok {
			continue
		}
		if _, known := areaColumns[area]; !known {
			continue
		}
		if verb == "delete" || verb == "delete_all" {
			continue
		}
		if len(e.Fields) == 0 {
			t.Errorf("%s has a known area but produced zero fields", e.Key)
		}
	}
}

func TestEveryAreaColumnsEntryResolvesToColumns(t *testing.T) {
	for area, columns := range areaColumns {
		if len(columns) == 0 {
			t.Errorf("area %q has an areaColumns entry that resolves to no columns; an entry that yields nothing is the same silence as no entry at all", area)
		}
	}
}

func TestEveryAreaColumnsEntryBelongsToALiveArea(t *testing.T) {
	live := map[string]bool{}
	for _, area := range catalogAreas() {
		live[area] = true
	}
	for area := range areaColumns {
		if !live[area] {
			t.Errorf("area %q has an areaColumns entry but no entity declares it; the key is misspelled or the entities were removed", area)
		}
	}
}
