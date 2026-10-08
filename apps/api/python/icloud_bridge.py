"""Familywall iCloud bridge: Apple Reminders through pyicloud (the library of Home Assistant's iCloud integration).

Runs as a child process of the Familywall API, bound to 127.0.0.1, and answers JSON requests that carry the
token in X-Bridge-Token. Sessions are kept in memory per Familywall account; pyicloud keeps its cookies (and the
"trusted" state after the two-factor code) in ICLOUD_SESSION_DIR/<account>, so a restart does not ask the code again.
"""

import json
import os
import sys
import threading
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from pyicloud import PyiCloudService

TOKEN = os.environ.get("ICLOUD_BRIDGE_TOKEN", "")
PORT = int(os.environ.get("ICLOUD_BRIDGE_PORT", "5234"))
SESSION_DIR = os.environ.get("ICLOUD_SESSION_DIR", "./icloud")
SAFE_ID = set("abcdefghijklmnopqrstuvwxyz0123456789-")

sessions = {}
# Apple and pyicloud are not meant for parallel calls on one session: one at a time.
lock = threading.Lock()


class BridgeError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def iso(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return None


def session_dir(account):
    if not account or any(char not in SAFE_ID for char in account.lower()):
        raise BridgeError(400, "bad_request", "Account non valido.")
    path = os.path.join(SESSION_DIR, account)
    os.makedirs(path, mode=0o700, exist_ok=True)
    return path


def error_name(error):
    return type(error).__name__


def login(body):
    account = body.get("account")
    directory = session_dir(account)
    try:
        api = PyiCloudService(body["apple_id"], body["password"], cookie_directory=directory, with_family=False)
    except Exception as error:  # noqa: BLE001 - every pyicloud failure becomes a readable answer
        name = error_name(error)
        if name in ("PyiCloudFailedLoginException", "PyiCloudPasswordException"):
            raise BridgeError(401, "login_failed", "Apple ID o password non accettati da iCloud.") from error
        if name == "PyiCloudServiceUnavailable":
            raise BridgeError(503, "unavailable", "iCloud non è disponibile in questo momento.") from error
        raise BridgeError(502, "icloud_error", f"iCloud: {error}") from error
    sessions[account] = api
    if api.requires_2sa and not api.requires_2fa:
        raise BridgeError(409, "2sa_unsupported", "L'account usa la vecchia verifica in due passaggi: attiva l'autenticazione a due fattori.")
    return {"status": "2fa" if api.requires_2fa else "ok"}


def ready(body):
    api = sessions.get(body.get("account"))
    if api is None:
        raise BridgeError(409, "auth_required", "Sessione iCloud da aprire.")
    if api.requires_2fa:
        raise BridgeError(409, "2fa_required", "iCloud chiede il codice di verifica: Admin → Account collegati → Verifica.")
    return api


def verify(body):
    api = sessions.get(body.get("account"))
    if api is None:
        raise BridgeError(409, "auth_required", "Sessione iCloud da aprire.")
    if not api.validate_2fa_code(str(body.get("code", "")).strip()):
        raise BridgeError(400, "bad_code", "Codice di verifica non valido.")
    if not api.is_trusted_session:
        api.trust_session()
    return {"status": "ok"}


def request_code(body):
    api = sessions.get(body.get("account"))
    if api is None:
        raise BridgeError(409, "auth_required", "Sessione iCloud da aprire.")
    api.request_2fa_code()
    return {"status": "sent"}


def lists(body):
    api = ready(body)
    return [
        {"id": item.id, "title": item.title, "color": getattr(item, "color", None)}
        for item in api.reminders.lists()
        if not getattr(item, "is_group", False)
    ]


def reminder_json(item):
    return {
        "id": item.id,
        "title": item.title or "",
        "desc": item.desc or "",
        "completed": bool(item.completed),
        "completed_date": iso(item.completed_date),
        "due_date": iso(item.due_date),
        "parent": getattr(item, "parent_reminder_id", None),
    }


def reminders(body):
    api = ready(body)
    result = api.reminders.list_reminders(list_id=body["list_id"], include_completed=True, results_limit=int(body.get("limit", 500)))
    return [reminder_json(item) for item in result.reminders if not getattr(item, "deleted", False)]


def create(body):
    api = ready(body)
    item = api.reminders.create(list_id=body["list_id"], title=body["title"], desc=body.get("desc", ""))
    return reminder_json(item)


def update(body):
    api = ready(body)
    item = api.reminders.get(body["id"])
    if "title" in body and body["title"] is not None:
        item.title = body["title"]
    if "completed" in body and body["completed"] is not None:
        item.completed = bool(body["completed"])
    api.reminders.update(item)
    return reminder_json(item)


def delete(body):
    api = ready(body)
    api.reminders.delete(api.reminders.get(body["id"]))
    return {"status": "ok"}


def forget(body):
    sessions.pop(body.get("account"), None)
    return {"status": "ok"}


ROUTES = {
    "/login": login,
    "/verify": verify,
    "/request-code": request_code,
    "/lists": lists,
    "/reminders": reminders,
    "/create": create,
    "/update": update,
    "/delete": delete,
    "/forget": forget,
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002 - silence the default access log
        return

    def answer(self, status, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):  # noqa: N802
        if self.path == "/health":
            self.answer(200, {"status": "ok"})
        else:
            self.answer(404, {"error": "not_found", "message": "Not found"})

    def do_POST(self):  # noqa: N802
        if not TOKEN or self.headers.get("X-Bridge-Token") != TOKEN:
            self.answer(403, {"error": "forbidden", "message": "Forbidden"})
            return
        route = ROUTES.get(self.path)
        if route is None:
            self.answer(404, {"error": "not_found", "message": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length) or b"{}")
            with lock:
                self.answer(200, route(body))
        except BridgeError as error:
            self.answer(error.status, {"error": error.code, "message": error.message})
        except Exception as error:  # noqa: BLE001
            name = error_name(error)
            if name in ("PyiCloud2FARequiredException", "PyiCloudAuthRequiredException"):
                self.answer(409, {"error": "2fa_required", "message": "iCloud chiede di nuovo l'accesso o il codice di verifica."})
            else:
                print(f"icloud bridge: {name}: {error}", file=sys.stderr, flush=True)
                self.answer(502, {"error": "icloud_error", "message": f"iCloud: {error}"})


if __name__ == "__main__":
    os.makedirs(SESSION_DIR, mode=0o700, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"icloud bridge listening on 127.0.0.1:{PORT}", flush=True)
    server.serve_forever()
