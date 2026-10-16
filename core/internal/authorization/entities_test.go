package authorization

import (
	"regexp"
	"strings"
	"testing"
)

var segment = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)

func TestEntityKeysMatchCASFormat(t *testing.T) {
	seen := make(map[Entity]bool, len(AllEntities))

	for _, e := range AllEntities {
		if seen[e] {
			t.Fatalf("duplicate entity key: %s", e)
		}
		seen[e] = true

		if len(e) > 512 {
			t.Fatalf("entity key longer than CAS allows: %s", e)
		}
		parts := strings.Split(string(e), ".")
		if len(parts) != 3 {
			t.Fatalf("entity key is service.area.action, three segments: %s", e)
		}
		if parts[0] != Service {
			t.Fatalf("entity key must start with %q, which CAS prepends anyway: %s", Service, e)
		}
		for _, p := range parts {
			if !segment.MatchString(p) {
				t.Fatalf("segment %q in %s does not match CAS's ^[a-z][a-z0-9_]*$", p, e)
			}
		}
	}
}
