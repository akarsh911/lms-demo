package http

import (
	"go/ast"
	"go/parser"
	"go/token"
	"path/filepath"
	"strings"
	"testing"
)

var scopeForSameEntity = map[string]string{
	"teachers.go:TeachersCreate": "owned by another worker this session; the lead takes it at integration",
}

type scopeForCall struct {
	file   string
	line   int
	narrow string
	wide   string
}

func TestScopeForAsksForABreadthKeyItCanActuallyProbe(t *testing.T) {
	calls := scopeForCalls(t)
	if len(calls) == 0 {
		t.Fatal("no s.scopeFor calls found: the parse is wrong, not the package")
	}

	seen := map[string]bool{}
	for _, call := range calls {
		if call.narrow != call.wide {
			continue
		}
		key := call.file + ":" + call.narrow
		seen[key] = true
		if _, pinned := scopeForSameEntity[key]; pinned {
			continue
		}
		t.Errorf("%s:%d passes %s as both the narrow and the wide key. scopeFor only probes "+
			"breadth when wide != narrow, so this call can never resolve an unrestricted viewer. "+
			"Pair it with the matching write_all key",
			call.file, call.line, call.narrow)
	}

	for key, why := range scopeForSameEntity {
		if !seen[key] {
			t.Errorf("%s is pinned (%s) but no longer passes the same entity twice; drop the pin",
				key, why)
		}
	}
}

func scopeForCalls(t *testing.T) []scopeForCall {
	t.Helper()

	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", nil, 0)
	if err != nil {
		t.Fatalf("parsing the package: %v", err)
	}

	var out []scopeForCall
	for _, pkg := range pkgs {
		for path, file := range pkg.Files {
			if strings.HasSuffix(path, "_test.go") {
				continue
			}
			ast.Inspect(file, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok || len(call.Args) != 3 {
					return true
				}
				sel, ok := call.Fun.(*ast.SelectorExpr)
				if !ok || sel.Sel.Name != "scopeFor" {
					return true
				}
				narrow, ok := entityArg(call.Args[1])
				if !ok {
					return true
				}
				wide, ok := entityArg(call.Args[2])
				if !ok {
					return true
				}
				out = append(out, scopeForCall{
					file:   filepath.Base(path),
					line:   fset.Position(call.Pos()).Line,
					narrow: narrow,
					wide:   wide,
				})
				return true
			})
		}
	}
	return out
}

func entityArg(arg ast.Expr) (string, bool) {
	sel, ok := arg.(*ast.SelectorExpr)
	if !ok {
		return "", false
	}
	pkg, ok := sel.X.(*ast.Ident)
	if !ok || pkg.Name != "authorization" {
		return "", false
	}
	return sel.Sel.Name, true
}
