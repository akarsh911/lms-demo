import argparse
import base64
import json
import os
import sys
import time
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

ISSUER = "dev-bypass-cas"
AUDIENCE = "dev-bypass"
JWKS_URL = "http://dev-bypass-cas.invalid/.well-known/jwks.json"
CAS_URL = "http://dev-bypass-cas.invalid"
FAKE_CORE_URL = "http://dev-bypass-core.invalid/api/v1"
KID = "dev-bypass-key"
SUBJECT = "00000000-0000-0000-0000-00000000d3a0"
TOKEN_LIFETIME_S = 30 * 24 * 3600
DEFAULT_BACKEND = Path(__file__).resolve().parents[2] / "lms-paper-setter-school" / "backend"


def segment(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def number(value: int) -> str:
    return segment(value.to_bytes((value.bit_length() + 7) // 8, "big"))


def load_key(path: Path) -> rsa.RSAPrivateKey:
    if path.exists():
        return serialization.load_pem_private_key(path.read_bytes(), password=None)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    return key


def jwks(key: rsa.RSAPrivateKey) -> dict:
    numbers = key.public_key().public_numbers()
    return {
        "keys": [
            {"kty": "RSA", "use": "sig", "alg": "RS256", "kid": KID, "n": number(numbers.n), "e": number(numbers.e)}
        ]
    }


def mint(key: rsa.RSAPrivateKey, tenant: str) -> str:
    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT", "kid": KID}
    payload = {
        "sub": SUBJECT,
        "sid": SUBJECT,
        "iss": ISSUER,
        "aud": AUDIENCE,
        "iat": now,
        "exp": now + TOKEN_LIFETIME_S,
        "tenant_id": tenant,
    }
    signing_input = segment(json.dumps(header).encode()) + "." + segment(json.dumps(payload).encode())
    signature = key.sign(signing_input.encode("ascii"), padding.PKCS1v15(), hashes.SHA256())
    return signing_input + "." + segment(signature)


class Answer:
    def __init__(self, body: dict) -> None:
        self.status_code = 200
        self._body = body

    def json(self) -> dict:
        return self._body


def install_fake_cas(key: rsa.RSAPrivateKey) -> None:
    from papersetter.cas import entities
    from papersetter.cas.policyset import EntityPolicy, PolicySet
    from papersetter.web import bearer, grants

    held = sorted({value for name, value in vars(entities).items() if name.isupper() and isinstance(value, str) and value.startswith(entities.SERVICE + ".")})
    policies = PolicySet(
        entities=tuple(EntityPolicy(entity=key_name, service=entities.SERVICE, alternatives=()) for key_name in held),
        services=(entities.SERVICE,),
    )

    def answer(url, bearer_token, timeout_s, headers=None):
        if "/v1/me" in url:
            return Answer({"user": {"id": SUBJECT, "full_name": "Dev Bypass Teacher"}, "super_admin": False})
        return Answer({"roles": {"is_teacher": True, "is_staff": True}})

    bearer.fetch_jwks = lambda url, timeout_s: jwks(key)
    grants._http_get = answer
    grants.fetch_policies = lambda settings, caller: policies
    print(f"fake CAS grants {len(held)} {entities.SERVICE} keys", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the paper setter behind a fake CAS for the emerge-frontend dev bypass.")
    parser.add_argument("--backend", type=Path, default=Path(os.environ.get("PAPERSETTER_BACKEND", DEFAULT_BACKEND)))
    parser.add_argument("--port", type=int, default=8400)
    parser.add_argument("--tenant", default=os.environ.get("DEV_SCHOOL_ID", "S_42"))
    parser.add_argument("--core-url", default=FAKE_CORE_URL)
    parser.add_argument("--print-token", action="store_true")
    args = parser.parse_args()

    backend = args.backend.resolve()
    storage = backend / "storage" / "dev-bypass"
    key = load_key(storage / "dev-cas.key")
    token = mint(key, args.tenant)
    (storage / "dev-service-token").write_text(token)

    if args.print_token:
        print(token)
        return

    os.environ.update(
        {
            "CAS_BASE_URL": CAS_URL,
            "CAS_JWKS_URL": JWKS_URL,
            "CAS_ISSUER": ISSUER,
            "CAS_AUDIENCE": AUDIENCE,
            "CAS_SERVICE": "papersetter",
            "CAS_CLIENT_ID": "dev-bypass",
            "CAS_CLIENT_SECRET": "dev-bypass",
            "CORE_API_URL": args.core_url,
            "STORAGE_DIR": str(storage),
        }
    )
    sys.path.insert(0, str(backend))
    os.chdir(backend)

    install_fake_cas(key)

    import uvicorn

    from papersetter.web.app import app

    print(f"paper setter on http://127.0.0.1:{args.port}  tenant {args.tenant}", flush=True)
    print(f"DEV_PAPERSETTER_TOKEN written to {storage / 'dev-service-token'}", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info")


if __name__ == "__main__":
    main()
