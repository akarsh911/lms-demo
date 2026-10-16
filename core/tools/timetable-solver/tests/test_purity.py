"""The ortools exemption, named in one place.

``solver`` is the only module allowed a non-standard-library import, and the
reason is not tidiness: a head of timetabling auditing a published week, a CI
job checking that a tenant's demand is arithmetically possible, and the
exporter itself all need to run where no solver is installed.  If the rule
erodes, they stop being able to.

These tests fail loudly if a second module grows an ortools import, and they
fail just as loudly if the exemption is quietly widened by adding a name here.
"""

import ast
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKAGE = os.path.join(ROOT, "timetable_solver")
sys.path.insert(0, ROOT)

#: the one module that may import a solver
SOLVER_EXEMPT = {"solver.py"}

#: everything the pure modules are allowed from outside the standard library:
#: nothing.
ALLOWED_THIRD_PARTY = set()

STDLIB_HINT = {
    "ast", "collections", "copy", "dataclasses", "datetime", "json", "math",
    "os", "sys", "time", "typing",
}


def _modules():
    return sorted(
        name for name in os.listdir(PACKAGE)
        if name.endswith(".py")
    )


def _imports(path):
    """Outside names imported by one module, and its siblings, separately.

    Function-level imports count.  The rule was broken once by exactly that:
    ``render.load_table`` pulled ``SCALE`` out of ``solver`` inside the function
    body, so ``import render`` still succeeded with no solver installed and the
    module-level check saw nothing, while calling the function raised
    ImportError.  ``ast.walk`` does not care what scope an import is in, and
    :func:`test_no_pure_module_reaches_the_solver` follows the sibling edges.
    """
    with open(path) as handle:
        tree = ast.parse(handle.read(), path)
    outside, siblings = set(), set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                outside.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                if node.module:
                    siblings.add(node.module.split(".")[0])
                for alias in node.names:
                    siblings.add(alias.name)
                continue
            if node.module:
                outside.add(node.module.split(".")[0])
    return outside, siblings


@pytest.mark.parametrize("name", _modules())
def test_only_solver_imports_ortools(name):
    found, _siblings = _imports(os.path.join(PACKAGE, name))
    if name in SOLVER_EXEMPT:
        assert "ortools" in found, "the exemption is stale; %s no longer needs it" % name
        return
    assert "ortools" not in found, "%s must stay importable with no solver" % name
    outside = found - STDLIB_HINT - ALLOWED_THIRD_PARTY
    assert not outside, "%s imports %s" % (name, sorted(outside))


def test_pure_modules_import_without_a_solver(monkeypatch):
    """Not just "they do not name ortools" - they actually import with it gone."""
    import builtins

    real_import = builtins.__import__

    def refuse(name, *args, **kwargs):
        if name.split(".")[0] == "ortools":
            raise ImportError("ortools is not installed")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", refuse)
    for name in ("dto", "school", "preflight", "verify", "render"):
        module = "timetable_solver.%s" % name
        sys.modules.pop(module, None)
        __import__(module)

    sys.modules.pop("timetable_solver.solver", None)
    with pytest.raises(ImportError):
        __import__("timetable_solver.solver")


def test_no_pure_module_reaches_the_solver():
    """Transitively, not just directly.  One relative import is all it takes."""
    edges = {}
    for name in _modules():
        _outside, siblings = _imports(os.path.join(PACKAGE, name))
        edges[name[:-3]] = {s for s in siblings if "%s.py" % s in set(_modules())}

    for start in edges:
        if "%s.py" % start in SOLVER_EXEMPT:
            continue
        seen, queue = set(), [start]
        while queue:
            current = queue.pop()
            for nxt in edges.get(current, ()):
                if nxt in seen:
                    continue
                seen.add(nxt)
                queue.append(nxt)
        assert "solver" not in seen,             "%s reaches the solver via %s" % (start, sorted(seen))
