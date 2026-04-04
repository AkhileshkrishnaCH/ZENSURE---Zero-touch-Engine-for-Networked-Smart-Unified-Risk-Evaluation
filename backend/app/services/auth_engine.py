import base64
import json
import re
from datetime import datetime, timezone
from secrets import token_urlsafe


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_worker_security(worker: dict, seed_index: int = 0) -> dict:
    name_slug = re.sub(r"[^a-z0-9]+", "-", worker.get("name", "worker").strip().lower()).strip("-") or "worker"

    worker.setdefault("email", f"{name_slug}{seed_index + 1}@zensure.demo")
    worker.setdefault("phone", f"90000{seed_index + 12345}")
    worker.setdefault("password", "demo123")
    worker.setdefault("role", "worker")
    worker.setdefault("kyc_status", "Verified")
    worker.setdefault("email_verified", bool(worker.get("email")))
    worker.setdefault("platform_connected", True)
    worker.setdefault("connected_since", utc_now())
    worker.setdefault("last_login_at", None)
    worker.setdefault("last_login_latitude", None)
    worker.setdefault("last_login_longitude", None)
    worker.setdefault("last_location_accuracy", None)
    worker.setdefault("qr_version", 1)
    worker.setdefault("qr_secret", token_urlsafe(18))
    worker.setdefault("qr_rotated_at", utc_now())
    worker.setdefault("total_payout_received", 0.0)
    return worker


def rotate_worker_qr(worker: dict) -> dict:
    worker["qr_version"] = int(worker.get("qr_version", 0)) + 1
    worker["qr_secret"] = token_urlsafe(18)
    worker["qr_rotated_at"] = utc_now()
    return build_qr_bundle(worker)


def build_qr_bundle(worker: dict) -> dict:
    payload = {
        "worker_id": worker["id"],
        "version": worker.get("qr_version", 1),
        "secret": worker.get("qr_secret"),
        "issued_at": worker.get("qr_rotated_at", utc_now()),
    }
    token = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8")).decode("utf-8").rstrip("=")
    return {
        "token": token,
        "uri": f"zensure://login/{token}",
        "version": payload["version"],
        "rotated_at": payload["issued_at"],
        "label": f"{worker['name']} ZenPass QR",
        "instructions": "Scan this QR or paste the secure URI into the QR-login tab.",
    }


def decode_qr_payload(qr_data: str) -> dict:
    token = qr_data.strip()
    if token.startswith("zensure://login/"):
        token = token.split("zensure://login/", 1)[1]

    padding = "=" * (-len(token) % 4)
    try:
        decoded = base64.urlsafe_b64decode(f"{token}{padding}".encode("utf-8")).decode("utf-8")
        return json.loads(decoded)
    except Exception as exc:  # pragma: no cover - defensive parsing
        raise ValueError("Invalid QR login payload") from exc


def sanitize_worker(worker: dict) -> dict:
    excluded = {"password", "qr_secret"}
    return {key: value for key, value in worker.items() if key not in excluded}


def create_session(worker: dict, method: str = "password") -> dict:
    worker["last_login_at"] = utc_now()
    return {
        "session_token": token_urlsafe(24),
        "login_method": method,
        "issued_at": utc_now(),
        "worker": sanitize_worker(worker),
    }
