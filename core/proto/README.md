# Vendored CAS protobuf contract

Copied from `D:\CAS` (`github.com/Harbour-Emerge/CAS`), branch `main`,
commit **`0edaf82`**.

CAS has no schema registry and publishes no importable Go stubs — the repo is
private and untagged, so `go get` cannot reach it and a `replace` directive
would break the Docker build, which has no access to a sibling directory on
the host. Vendoring and generating our own client is the approach CAS
recommends, and matches what their Python consumer already does.

## Regenerating

```bash
./scripts/proto.sh
```

Output lands in `internal/infrastructure/cas/casv1/` and is checked in, so a
clone builds without protoc.

## Keeping it honest

The pinned commit above is the only record of which version these stubs came
from. Update it in the same change that re-copies the protos, or the pin is a
lie.

CAS lints with `breaking: FILE`, so the wire contract will not change
incompatibly. What will happen is fields being **added** that these stubs do
not know about, and those are silently ignored — which is the safe direction
for most things but not all: a field policy that arrives in a field we do not
parse reads as no policy, and no policy means unrestricted. Re-copy whenever
CAS says the contract moved.
