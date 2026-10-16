package authorization

import (
	"go/ast"
	"go/parser"
	"go/token"
	"testing"
)

func TestEveryDeclaredEntityIsRegistered(t *testing.T) {
	registered := map[Entity]bool{}
	for _, e := range AllEntities {
		if registered[e] {
			t.Fatalf("%s is registered twice", e)
		}
		registered[e] = true
	}

	declared := declaredEntities(t)
	if len(declared) == 0 {
		t.Fatal("no entity constants found: the parse is wrong, not the package")
	}

	for name, value := range declared {
		if !registered[value] {
			t.Errorf("%s (%s) is declared but missing from AllEntities", name, value)
		}
	}
	if len(registered) != len(declared) {
		t.Errorf("AllEntities holds %d entities, %d are declared",
			len(registered), len(declared))
	}
	t.Logf("%d entities declared and registered", len(declared))
}

func declaredEntities(t *testing.T) map[string]Entity {
	t.Helper()

	pkgs, err := parser.ParseDir(token.NewFileSet(), ".", nil, 0)
	if err != nil {
		t.Fatalf("parsing the package: %v", err)
	}

	out := map[string]Entity{}
	for _, pkg := range pkgs {
		for path, file := range pkg.Files {
			if len(path) > 8 && path[len(path)-8:] == "_test.go" {
				continue
			}
			for _, decl := range file.Decls {
				gen, ok := decl.(*ast.GenDecl)
				if !ok || gen.Tok != token.CONST {
					continue
				}
				for _, spec := range gen.Specs {
					value, ok := spec.(*ast.ValueSpec)
					if !ok {
						continue
					}
					if ident, ok := value.Type.(*ast.Ident); !ok || ident.Name != "Entity" {
						continue
					}
					for i, name := range value.Names {
						lit, ok := value.Values[i].(*ast.BasicLit)
						if !ok || lit.Kind != token.STRING {
							continue
						}
						out[name.Name] = Entity(lit.Value[1 : len(lit.Value)-1])
					}
				}
			}
		}
	}
	return out
}
