"""Fail if any hand-written Go file carries a comment.

The house rule is that the reasoning lives in docs/, not beside the code, so
that one explanation cannot drift away from another. Enforcing it with a grep
for '//' does not work: that matches the '//' in every https:// URL and any
'//' or '/*' inside a string literal. This walks each file the way Go's own
scanner does -- interpreted strings, raw strings and rune literals are stepped
over -- so only real comments are reported.

Files carrying the canonical "Code generated ... DO NOT EDIT." line are exempt.
ent writes those and they are never hand-edited.

Usage: python3 scripts/nocomments.py cmd internal pkg
"""

import bisect
import os
import re
import sys

ALLOWED = re.compile(r"^//(go:[a-z]+|line |line\t|export |extern |nolint|\s*\+build)")
GENERATED = re.compile(r"^// Code generated .* DO NOT EDIT\.$", re.M)


def scan(src):
    starts = [0]
    for i, ch in enumerate(src):
        if ch == "\n":
            starts.append(i + 1)

    def lineno(pos):
        return bisect.bisect_right(starts, pos)

    out = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c == '"':
            i += 1
            while i < n and src[i] not in ('"', "\n"):
                i += 2 if src[i] == "\\" else 1
            i += 1
        elif c == "'":
            i += 1
            while i < n and src[i] not in ("'", "\n"):
                i += 2 if src[i] == "\\" else 1
            i += 1
        elif c == "`":
            j = src.find("`", i + 1)
            i = n if j < 0 else j + 1
        elif c == "/" and i + 1 < n and src[i + 1] == "/":
            j = src.find("\n", i)
            j = n if j < 0 else j
            out.append((lineno(i), src[i:j].rstrip()))
            i = j
        elif c == "/" and i + 1 < n and src[i + 1] == "*":
            j = src.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append((lineno(i), src[i:j].split("\n")[0].rstrip()))
            i = j
        else:
            i += 1
    return out


def main(roots):
    bad = 0
    checked = 0
    for root in roots:
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in (".git", "vendor")]
            for name in sorted(filenames):
                if not name.endswith(".go"):
                    continue
                path = os.path.join(dirpath, name).replace("\\", "/")
                with open(path, encoding="utf-8") as f:
                    src = f.read()
                if GENERATED.search(src):
                    continue
                checked += 1
                for line, text in scan(src):
                    if ALLOWED.match(text):
                        continue
                    bad += 1
                    print("%s:%d: %s" % (path, line, text[:120]))

    print("checked %d hand-written Go files" % checked)
    if bad:
        print("")
        print("found %d comment(s) in Go source; the house rule is zero." % bad)
        print("Move the explanation to docs/DESIGN-NOTES.md.")
        return 1
    print("no comments in Go source")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:] or ["cmd", "internal", "pkg"]))
