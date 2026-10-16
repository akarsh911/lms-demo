package main

import (
	"encoding/json"
	"os"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization/catalog"
)

func main() {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if err := enc.Encode(catalog.Build()); err != nil {
		panic(err)
	}
}
