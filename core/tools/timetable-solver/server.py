"""The timetable solver as an internal HTTP service.

    TIMETABLE_SOLVER_TOKEN=... python server.py

Three endpoints, and the contract they implement is in ``docs/DESIGN-NOTES.md``
under *Automatic timetable generation*:

    POST /v1/feasibility   200 always - preflight only, no solver, milliseconds
    POST /v1/solve         200 a week - 422 no week - 400 malformed
    GET  /healthz          200 {"status": "ok", "ortools": "..."}

**The service holds nothing.**  No database, no connection string, no cache, no
knowledge that tenants exist.  Everything it answers with came in the body it is
answering.  That is the property the placement argument turns on: emerge-core
reads the tenant database it already has open and sends a shape, so the
database-per-tenant isolation stays entirely on that side.  Keep it true - the
first ``psycopg2`` import here would undo the whole argument.

Why the standard library and not a framework
--------------------------------------------
``http.server`` rather than Flask or FastAPI, on purpose.  The image then needs
exactly one dependency, ortools, which is the one that does the work; a web
framework plus an ASGI server would be three more for a service with three
routes, one caller and no HTML.  ``ThreadingHTTPServer`` is adequate because
CP-SAT releases the GIL while it searches, so ``/healthz`` still answers during
a solve, and because concurrency here is bounded on purpose (see below) rather
than by how many workers a gunicorn config happens to name.

Why solves are counted, and refused when there are too many
-----------------------------------------------------------
A solve is 15 to 90 seconds across 8 CPUs.  Two of those on a 4-CPU pod do not
take twice as long, they take much more than twice as long, because each solve's
workers are now fighting the other's for cores, and CP-SAT's parallel portfolio
is what makes it fast.  So concurrent solves are capped and the cap refuses with
503 and a ``Retry-After`` rather than queueing: emerge-core owns the job and can
retry, and a queue here would be state this service has said it does not hold.

Why diagnosis gets its own budget
---------------------------------
``solver.diagnose`` runs a deletion filter - one solve per candidate constraint
group - to shrink a sufficient core into an irreducible one.  That is worth the
cost interactively and is unbounded for a service: sixty groups at the caller's
``max_seconds`` each is an hour.  So the whole diagnosis is given one budget,
``max_seconds`` again, divided among its solves.  A candidate solve that runs
out of time returns UNKNOWN rather than INFEASIBLE, and the filter keeps that
group - so the failure mode of a tight budget is a longer sentence, never a
wrong one.
"""

import dataclasses
import hmac
import http.server
import json
import logging
import os
import socketserver
import sys
import threading
import time

from timetable_solver import solver as solver_mod, wire

LOG = logging.getLogger("timetable-solver")

DEFAULT_BIND = "127.0.0.1"
DEFAULT_PORT = 8099
DEFAULT_CONCURRENCY = 2

#: 8 MiB.  The seeded school exports at about 120 KB and the shape grows with
#: enrolments, so this is two orders of magnitude of headroom and still bounds
#: what one request can make the service hold in memory.
DEFAULT_MAX_BODY = 8 * 1024 * 1024

#: Candidate groups the deletion filter will try to drop.  Beyond this the core
#: is reported as it came back: a sentence naming thirty requirements is not
#: improved by making the caller wait for it to name twenty-six.
MAX_CORE_SOLVES = 20

AUTH_ENV = "TIMETABLE_SOLVER_TOKEN"


class Settings(object):
    """Everything the service reads from its environment, validated at startup."""

    __slots__ = ("token", "bind", "port", "concurrency", "max_body")

    def __init__(self, env=None):
        env = os.environ if env is None else env
        self.token = (env.get(AUTH_ENV) or "").strip()
        self.bind = env.get("TIMETABLE_SOLVER_BIND") or DEFAULT_BIND
        self.port = int(env.get("TIMETABLE_SOLVER_PORT") or DEFAULT_PORT)
        self.concurrency = max(1, int(env.get("TIMETABLE_SOLVER_CONCURRENCY")
                                      or DEFAULT_CONCURRENCY))
        self.max_body = max(1024, int(env.get("TIMETABLE_SOLVER_MAX_BODY")
                                      or DEFAULT_MAX_BODY))

    def check(self):
        """Refuse to start without a token.

        Fail-closed at boot, following the orchestrator's settings precedent and
        for the same reason: a service whose auth is off by default is one
        deploy away from being open, and the failure is silent until it is not.
        """
        if not self.token:
            raise SystemExit(
                "%s is required: this service is internal-only and will not "
                "start unauthenticated" % (AUTH_ENV,))


def ortools_version() -> str:
    try:
        import importlib.metadata as metadata

        return metadata.version("ortools")
    except Exception:
        return "unknown"


def diagnose_within(school, config):
    """Diagnose an infeasible school under one total budget.

    Returns the same ``(core_keys, sentence)`` pair
    :func:`timetable_solver.solver.diagnose` returns.
    """
    share = max(1.0, config.max_seconds / float(MAX_CORE_SOLVES + 2))
    budgeted = dataclasses.replace(config, max_seconds=share, num_workers=1)
    return solver_mod.diagnose(school, budgeted, max_core_solves=MAX_CORE_SOLVES)


def run_solve(request: wire.Request):
    """The production solve, then diagnosis on its own budget if it is needed."""
    result = solver_mod.solve(request.school, request.config, hint=request.hint,
                              diagnose_on_infeasible=False)
    if result.status == "INFEASIBLE" and not result.core_explanation:
        core, sentence = diagnose_within(request.school, request.config)
        result = dataclasses.replace(result, infeasibility_core=core,
                                     core_explanation=sentence)
    return result


class Handler(http.server.BaseHTTPRequestHandler):
    """The three routes, plus the refusals that are not routes."""

    protocol_version = "HTTP/1.1"
    server_version = "timetable-solver"
    sys_version = ""

    settings = None   # type: Settings
    gate = None       # type: threading.BoundedSemaphore

    def do_GET(self):
        self._consumed = False
        if self.path.split("?")[0] == "/healthz":
            self._json(200, {"status": "ok", "ortools": ortools_version()})
            return
        self._refuse(404, "no such endpoint")

    def do_POST(self):
        self._consumed = False
        route = self.path.split("?")[0]
        if route not in ("/v1/solve", "/v1/feasibility"):
            self._refuse(404, "no such endpoint")
            return
        if not self._authorised():
            return
        body = self._body()
        if body is None:
            return

        started = time.time()
        try:
            request = wire.parse(body)
        except wire.BadRequest as err:
            self._refuse(400, str(err))
            return

        if route == "/v1/feasibility":
            answer = wire.feasibility_response(request)
            self._json(200, answer)
            LOG.info("feasibility request_id=%s feasible=%s %s wall=%.3fs",
                     request.request_id, answer["feasible"],
                     _fields(wire.summary(request)), time.time() - started)
            return

        if not self.gate.acquire(blocking=False):
            self.send_response(503)
            self.send_header("Retry-After", "30")
            self._body_out(json.dumps({
                "error": "busy",
                "message": "every solver slot is in use; this request was not queued",
            }).encode("utf-8"))
            LOG.warning("solve refused, all %d slots busy, request_id=%s",
                        self.settings.concurrency, request.request_id)
            return
        try:
            result = run_solve(request)
        finally:
            self.gate.release()

        answer = wire.solve_response(request, result)
        code = 200 if result.status in ("OPTIMAL", "FEASIBLE") else 422
        self._json(code, answer)
        LOG.info("solve request_id=%s status=%s verdict=%s slots=%d %s wall=%.2fs http=%d",
                 request.request_id, result.status, result.verdict,
                 len(result.placements), _fields(wire.summary(request)),
                 result.wall_time_s, code)

    def _authorised(self) -> bool:
        header = self.headers.get("Authorization") or ""
        scheme, _, presented = header.partition(" ")
        if scheme.lower() != "bearer" or not hmac.compare_digest(
                presented.strip(), self.settings.token):
            self._refuse(401, "a bearer token is required")
            return False
        return True

    def _body(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self._refuse(400, "Content-Length must be a number")
            return None
        if length <= 0:
            self._refuse(400, "a request body is required")
            return None
        if length > self.settings.max_body:
            self._refuse(413, "the request body exceeds %d bytes" % (self.settings.max_body,))
            return None
        self._consumed = True
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, ValueError) as err:
            self._refuse(400, "the request body is not JSON: %s" % (err,))
            return None

    def _json(self, code, payload):
        self.send_response(code)
        self._body_out(json.dumps(payload).encode("utf-8"))

    def _drain(self):
        if getattr(self, "_consumed", True):
            return
        self._consumed = True
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self.close_connection = True
            return
        if length <= 0:
            return
        if length > self.settings.max_body:
            self.close_connection = True
            return
        while length > 0:
            chunk = self.rfile.read(min(length, 65536))
            if not chunk:
                break
            length -= len(chunk)

    def _refuse(self, code, message):
        self._drain()
        self.send_response(code)
        self._body_out(json.dumps({
            "error": self.responses.get(code, ("error",))[0],
            "message": message,
        }).encode("utf-8"))

    def _body_out(self, encoded):
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, fmt, *args):
        """Route the access log through logging, and never log a query string.

        A request body here carries a whole school.  It never reaches the log,
        and neither does anything a caller could hide in a URL.
        """
        LOG.debug("%s %s", self.command, (self.path or "").split("?")[0])


def _fields(summary) -> str:
    return " ".join("%s=%s" % (key, summary[key]) for key in sorted(summary))


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def build(settings: Settings) -> Server:
    settings.check()

    class Bound(Handler):
        pass

    Bound.settings = settings
    Bound.gate = threading.BoundedSemaphore(settings.concurrency)
    return Server((settings.bind, settings.port), Bound)


def main(argv):
    logging.basicConfig(
        stream=sys.stderr,
        level=os.environ.get("TIMETABLE_SOLVER_LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    settings = Settings()
    server = build(settings)
    LOG.info("timetable solver listening on %s:%d, ortools %s, %d concurrent solves, "
             "ceiling %.0fs",
             settings.bind, settings.port, ortools_version(), settings.concurrency,
             wire.CEILING_SECONDS)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
