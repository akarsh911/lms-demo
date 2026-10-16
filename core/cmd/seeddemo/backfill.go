package main

import (
	"context"
	"fmt"
	"strings"

	entperson "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/person"
)

func (s *seeder) backfillCAS(ctx context.Context) error {
	if !s.cas.enabled() {
		return fmt.Errorf("-cas-token and -cas-url are required to backfill")
	}

	people, err := s.client.Person.Query().
		Where(entperson.EmailContains(".demo")).
		Order(entperson.ByEmail()).
		All(ctx)
	if err != nil {
		return err
	}
	fmt.Printf("backfilling CAS identities for %d people\n", len(people))

	var linked, made, failed int
	for _, p := range people {
		email := ""
		if p.Email != nil {
			email = *p.Email
		}
		if email == "" {
			continue
		}
		username := strings.TrimSuffix(strings.SplitN(email, "@", 2)[0], ".")

		id, err := s.cas.createUser(ctx, username, p.DisplayName, email)
		if err != nil {
			failed++
			if failed <= 3 {
				fmt.Printf("  %s: %v\n", email, err)
			}
			continue
		}
		if id == p.CasUserID {
			linked++
			continue
		}
		if s.o.dryRun {
			made++
			continue
		}
		if _, err := s.client.ExecContext(ctx,
			"UPDATE persons SET cas_user_id = $1, updated_at = now() WHERE id = $2", id, p.ID); err != nil {
			return fmt.Errorf("linking %s: %w", email, err)
		}
		made++
	}

	fmt.Printf("linked %d, already correct %d, failed %d\n", made, linked, failed)
	if failed > 0 {
		return fmt.Errorf("%d identities could not be created", failed)
	}
	return nil
}
