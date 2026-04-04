from __future__ import annotations

import os
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from secrets import randbelow

VERIFICATION_TTL_MINUTES = 10
_verification_store: dict[str, dict] = {}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _generate_code() -> str:
    return f"{randbelow(1_000_000):06d}"


def issue_email_verification(email: str) -> dict:
    normalized_email = email.strip().lower()
    code = _generate_code()
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=VERIFICATION_TTL_MINUTES)).isoformat()

    _verification_store[normalized_email] = {
        "code": code,
        "expires_at": expires_at,
        "verified": False,
        "issued_at": _utc_now(),
    }

    delivery_status = "preview"
    sender = os.getenv("ZENSURE_SMTP_SENDER", "no-reply@zensure.local")
    host = os.getenv("ZENSURE_SMTP_HOST")
    port = int(os.getenv("ZENSURE_SMTP_PORT", "587"))
    username = os.getenv("ZENSURE_SMTP_USERNAME")
    password = os.getenv("ZENSURE_SMTP_PASSWORD")

    if all([host, username, password]):
        message = EmailMessage()
        message["Subject"] = "Your ZENSURE verification code"
        message["From"] = sender
        message["To"] = normalized_email
        message.set_content(
            f"Your ZENSURE verification code is {code}. It will expire in {VERIFICATION_TTL_MINUTES} minutes."
        )

        try:
            with smtplib.SMTP(host, port, timeout=10) as server:
                server.starttls()
                server.login(username, password)
                server.send_message(message)
            delivery_status = "sent"
        except Exception:
            delivery_status = "preview"

    return {
        "email": normalized_email,
        "delivery_status": delivery_status,
        "expires_at": expires_at,
        "demo_code": code if delivery_status != "sent" else None,
    }


def verify_email_code(email: str, code: str) -> bool:
    normalized_email = email.strip().lower()
    record = _verification_store.get(normalized_email)
    if not record or not code:
        return False

    if record["expires_at"] < _utc_now():
        _verification_store.pop(normalized_email, None)
        return False

    if record["code"] != code.strip():
        return False

    record["verified"] = True
    return True


def is_email_verified(email: str) -> bool:
    normalized_email = email.strip().lower()
    return bool(_verification_store.get(normalized_email, {}).get("verified"))
