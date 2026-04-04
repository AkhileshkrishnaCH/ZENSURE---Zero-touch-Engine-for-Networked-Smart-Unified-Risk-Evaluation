from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.services.auth_engine import utc_now

DB_PATH = Path(__file__).resolve().parents[2] / "zensure.db"
AIIMS_DB_PATH = Path(__file__).resolve().parents[2] / "aiims_enrollment.db"


def _get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _get_aiims_connection() -> sqlite3.Connection:
    AIIMS_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(AIIMS_DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def _row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    payload = dict(row)
    if "platform_connected" in payload:
        payload["platform_connected"] = bool(payload["platform_connected"])
    if "email_verified" in payload:
        payload["email_verified"] = bool(payload["email_verified"])
    if "fraud_flag" in payload:
        payload["fraud_flag"] = bool(payload["fraud_flag"])
    return payload


def init_database() -> None:
    with _get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS workers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT UNIQUE,
                email_verified INTEGER NOT NULL DEFAULT 0,
                phone TEXT UNIQUE,
                password TEXT NOT NULL,
                city TEXT NOT NULL,
                platform TEXT NOT NULL,
                zone_id TEXT NOT NULL,
                avg_daily_income REAL NOT NULL,
                weekly_active_days INTEGER NOT NULL,
                on_time_rate REAL NOT NULL,
                consistency_score REAL NOT NULL,
                historic_claims INTEGER NOT NULL,
                gps_jump_risk REAL NOT NULL,
                ip_mismatch_count INTEGER NOT NULL,
                activity_spike_score REAL NOT NULL,
                role TEXT NOT NULL,
                kyc_status TEXT NOT NULL,
                platform_connected INTEGER NOT NULL,
                connected_since TEXT NOT NULL,
                last_login_at TEXT,
                last_login_latitude REAL,
                last_login_longitude REAL,
                last_location_accuracy REAL,
                qr_version INTEGER NOT NULL,
                qr_secret TEXT NOT NULL,
                qr_rotated_at TEXT NOT NULL,
                total_payout_received REAL NOT NULL DEFAULT 0
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS policies (
                id TEXT PRIMARY KEY,
                worker_id TEXT NOT NULL UNIQUE,
                plan_name TEXT NOT NULL,
                coverage_hours INTEGER NOT NULL,
                max_weekly_payout REAL NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS claims (
                id TEXT PRIMARY KEY,
                worker_id TEXT NOT NULL,
                policy_id TEXT NOT NULL,
                claim_type TEXT NOT NULL,
                scenario_key TEXT NOT NULL,
                title TEXT NOT NULL,
                status TEXT NOT NULL,
                payout_amount REAL NOT NULL,
                estimated_income_loss REAL NOT NULL,
                reason TEXT NOT NULL,
                notes TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS spil_records (
                id TEXT PRIMARY KEY,
                worker_id TEXT UNIQUE,
                external_worker_id TEXT NOT NULL,
                name TEXT NOT NULL,
                source_system TEXT NOT NULL,
                platform TEXT NOT NULL,
                employer_name TEXT NOT NULL,
                employment_type TEXT NOT NULL,
                shift_pattern TEXT NOT NULL,
                experience_years REAL NOT NULL,
                incident_count INTEGER NOT NULL,
                attendance_score REAL NOT NULL,
                reliability_score REAL NOT NULL,
                risk_band TEXT NOT NULL,
                notes TEXT NOT NULL,
                avg_working_hours_per_week REAL NOT NULL,
                rating REAL NOT NULL,
                location_latitude REAL NOT NULL,
                location_longitude REAL NOT NULL,
                location_risk_score REAL NOT NULL,
                location_name TEXT NOT NULL,
                salary_per_week REAL NOT NULL,
                deliveries_per_week INTEGER NOT NULL,
                night_shift_percentage REAL NOT NULL,
                safety_behavior_score REAL NOT NULL,
                platform_tenure_years REAL NOT NULL,
                fraud_flag INTEGER NOT NULL DEFAULT 0,
                insurance_claimed_count INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'pending',
                last_synced_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS insured_customers (
                id TEXT PRIMARY KEY,
                worker_id TEXT NOT NULL,
                policy_id TEXT NOT NULL,
                plan_name TEXT NOT NULL,
                premium_amount REAL NOT NULL,
                subscription_start TEXT NOT NULL,
                subscription_end TEXT NOT NULL,
                ip_location TEXT NOT NULL,
                all_worker_details TEXT NOT NULL,
                payment_status TEXT NOT NULL,
                payment_date TEXT NOT NULL,
                razorpay_order_id TEXT,
                razorpay_payment_id TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS admin_accounts (
                admin_id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS zencoin_wallets (
                worker_id TEXT PRIMARY KEY,
                balance REAL NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS zencoin_transactions (
                id TEXT PRIMARY KEY,
                worker_id TEXT NOT NULL,
                transaction_type TEXT NOT NULL,
                amount REAL NOT NULL,
                balance_after REAL NOT NULL,
                reference TEXT,
                metadata TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
    with _get_aiims_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS aiims_policy_snapshots (
                id TEXT PRIMARY KEY,
                worker_id TEXT NOT NULL,
                policy_id TEXT NOT NULL,
                plan_name TEXT NOT NULL,
                premium_amount REAL NOT NULL,
                wallet_currency TEXT NOT NULL,
                worker_payload TEXT NOT NULL,
                spil_payload TEXT NOT NULL,
                ip_address TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS aiims_anomaly_events (
                id TEXT PRIMARY KEY,
                anomaly_type TEXT NOT NULL,
                zone_id TEXT NOT NULL,
                location_name TEXT NOT NULL,
                severity REAL NOT NULL,
                severity_label TEXT NOT NULL,
                hours_affected REAL NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                triggered_by TEXT NOT NULL,
                workers_affected INTEGER NOT NULL DEFAULT 0,
                total_payout REAL NOT NULL DEFAULT 0,
                triggered_at TEXT NOT NULL,
                resolved_at TEXT
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS aiims_payout_ledger (
                id TEXT PRIMARY KEY,
                event_id TEXT NOT NULL,
                worker_id TEXT NOT NULL,
                worker_name TEXT NOT NULL,
                plan_name TEXT NOT NULL,
                daily_income REAL NOT NULL,
                severity REAL NOT NULL,
                hours_affected REAL NOT NULL,
                severity_multiplier REAL NOT NULL,
                plan_multiplier REAL NOT NULL,
                raw_loss REAL NOT NULL,
                payout_zencoins REAL NOT NULL,
                reason TEXT NOT NULL,
                layer_trace TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS auto_subscription_settings (
                worker_id TEXT PRIMARY KEY,
                plan_id TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                last_renewed_at TEXT,
                created_at TEXT NOT NULL
            )
            """
        )


def seed_admin_account(email: str, password: str) -> None:
    with _get_connection() as connection:
        connection.execute(
            "INSERT OR IGNORE INTO admin_accounts (admin_id, email, password, created_at) VALUES (?, ?, ?, ?)",
            (f"admin-{uuid4().hex[:12]}", email, password, utc_now()),
        )


def clear_all_data() -> None:
    """Wipe all data from both databases for a fresh start."""
    with _get_connection() as connection:
        connection.execute("DELETE FROM zencoin_transactions")
        connection.execute("DELETE FROM zencoin_wallets")
        connection.execute("DELETE FROM insured_customers")
        connection.execute("DELETE FROM claims")
        connection.execute("DELETE FROM policies")
        connection.execute("DELETE FROM spil_records")
        connection.execute("DELETE FROM workers")
        connection.execute("DELETE FROM admin_accounts")
    with _get_aiims_connection() as connection:
        connection.execute("DELETE FROM aiims_payout_ledger")
        connection.execute("DELETE FROM aiims_anomaly_events")
        connection.execute("DELETE FROM aiims_policy_snapshots")
        connection.execute("DELETE FROM auto_subscription_settings")


def seed_database() -> None:
    clear_all_data()
    seed_admin_account("admin@gmail.com", "adminxyz")


def list_workers() -> list[dict[str, Any]]:
    with _get_connection() as connection:
        rows = connection.execute("SELECT * FROM workers ORDER BY name COLLATE NOCASE").fetchall()
    return [_row_to_dict(row) for row in rows]


def get_worker_by_id(worker_id: str) -> dict[str, Any] | None:
    with _get_connection() as connection:
        row = connection.execute("SELECT * FROM workers WHERE id = ?", (worker_id,)).fetchone()
    return _row_to_dict(row)


def get_worker_by_identifier(identifier: str) -> dict[str, Any] | None:
    normalized = identifier.strip().lower()
    with _get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM workers WHERE lower(coalesce(email, '')) = ? OR phone = ? LIMIT 1",
            (normalized, identifier.strip()),
        ).fetchone()
    return _row_to_dict(row)


def create_worker(worker: dict[str, Any]) -> dict[str, Any]:
    payload = dict(worker)
    payload["platform_connected"] = 1 if payload.get("platform_connected", True) else 0
    payload["email_verified"] = 1 if payload.get("email_verified", False) else 0
    with _get_connection() as connection:
        connection.execute(
            """
            INSERT INTO workers (
                id, name, email, email_verified, phone, password, city, platform, zone_id,
                avg_daily_income, weekly_active_days, on_time_rate, consistency_score,
                historic_claims, gps_jump_risk, ip_mismatch_count, activity_spike_score,
                role, kyc_status, platform_connected, connected_since, last_login_at,
                last_login_latitude, last_login_longitude, last_location_accuracy,
                qr_version, qr_secret, qr_rotated_at, total_payout_received
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["id"], payload["name"], payload.get("email"), payload["email_verified"], payload.get("phone"),
                payload["password"], payload["city"], payload["platform"], payload["zone_id"],
                payload["avg_daily_income"], payload["weekly_active_days"], payload["on_time_rate"], payload["consistency_score"],
                payload["historic_claims"], payload["gps_jump_risk"], payload["ip_mismatch_count"], payload["activity_spike_score"],
                payload["role"], payload["kyc_status"], payload["platform_connected"], payload["connected_since"],
                payload.get("last_login_at"), payload.get("last_login_latitude"), payload.get("last_login_longitude"),
                payload.get("last_location_accuracy"), payload["qr_version"], payload["qr_secret"], payload["qr_rotated_at"],
                payload.get("total_payout_received", 0.0),
            ),
        )
    return get_worker_by_id(payload["id"])


def update_worker(worker_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    if not updates:
        return get_worker_by_id(worker_id)
    allowed = []
    values: list[Any] = []
    for key, value in updates.items():
        if key == "id":
            continue
        allowed.append(f"{key} = ?")
        if key in {"platform_connected", "email_verified"}:
            value = 1 if value else 0
        values.append(value)
    values.append(worker_id)
    with _get_connection() as connection:
        connection.execute(f"UPDATE workers SET {', '.join(allowed)} WHERE id = ?", tuple(values))
    return get_worker_by_id(worker_id)


def list_policies() -> list[dict[str, Any]]:
    with _get_connection() as connection:
        rows = connection.execute("SELECT * FROM policies ORDER BY updated_at DESC").fetchall()
    return [_row_to_dict(row) for row in rows]


def get_policy_by_worker(worker_id: str) -> dict[str, Any] | None:
    with _get_connection() as connection:
        row = connection.execute("SELECT * FROM policies WHERE worker_id = ?", (worker_id,)).fetchone()
    return _row_to_dict(row)


def delete_policy_by_worker(worker_id: str) -> None:
    with _get_connection() as connection:
        connection.execute("DELETE FROM policies WHERE worker_id = ?", (worker_id,))


def upsert_policy(policy: dict[str, Any]) -> dict[str, Any]:
    existing = get_policy_by_worker(policy["worker_id"])
    now = utc_now()
    payload = {
        "id": (existing or {}).get("id") or policy.get("id") or f"policy-{uuid4().hex[:10]}",
        "worker_id": policy["worker_id"],
        "plan_name": policy["plan_name"],
        "coverage_hours": int(policy["coverage_hours"]),
        "max_weekly_payout": float(policy["max_weekly_payout"]),
        "created_at": (existing or {}).get("created_at") or now,
        "updated_at": now,
    }
    with _get_connection() as connection:
        if existing:
            connection.execute(
                "UPDATE policies SET plan_name = ?, coverage_hours = ?, max_weekly_payout = ?, updated_at = ? WHERE worker_id = ?",
                (payload["plan_name"], payload["coverage_hours"], payload["max_weekly_payout"], payload["updated_at"], payload["worker_id"]),
            )
        else:
            connection.execute(
                "INSERT INTO policies (id, worker_id, plan_name, coverage_hours, max_weekly_payout, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (payload["id"], payload["worker_id"], payload["plan_name"], payload["coverage_hours"], payload["max_weekly_payout"], payload["created_at"], payload["updated_at"]),
            )
    return get_policy_by_worker(payload["worker_id"])


def create_claim(claim: dict[str, Any]) -> dict[str, Any]:
    with _get_connection() as connection:
        connection.execute(
            """
            INSERT INTO claims (id, worker_id, policy_id, claim_type, scenario_key, title, status, payout_amount, estimated_income_loss, reason, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                claim["id"], claim["worker_id"], claim["policy_id"], claim["claim_type"], claim["scenario_key"], claim["title"],
                claim["status"], claim["payout_amount"], claim["estimated_income_loss"], claim["reason"], claim["notes"], claim["created_at"],
            ),
        )
    return claim


def list_claims_for_worker(worker_id: str) -> list[dict[str, Any]]:
    with _get_connection() as connection:
        rows = connection.execute("SELECT * FROM claims WHERE worker_id = ? ORDER BY created_at DESC", (worker_id,)).fetchall()
    return [_row_to_dict(row) for row in rows]


def get_spil_record(worker_id: str) -> dict[str, Any] | None:
    with _get_connection() as connection:
        row = connection.execute("SELECT * FROM spil_records WHERE worker_id = ? LIMIT 1", (worker_id,)).fetchone()
    return _row_to_dict(row)


def get_spil_record_by_id(spil_id: str) -> dict[str, Any] | None:
    with _get_connection() as connection:
        row = connection.execute("SELECT * FROM spil_records WHERE id = ? LIMIT 1", (spil_id,)).fetchone()
    return _row_to_dict(row)


def list_spil_records() -> list[dict[str, Any]]:
    with _get_connection() as connection:
        rows = connection.execute("SELECT * FROM spil_records ORDER BY last_synced_at DESC").fetchall()
    return [_row_to_dict(row) for row in rows]


def upsert_spil_record(record: dict[str, Any]) -> dict[str, Any]:
    payload = dict(record)
    payload["id"] = payload.get("id") or f"spil-{uuid4().hex[:8]}"
    payload["source_system"] = payload.get("source_system") or "SPIL"
    payload["notes"] = payload.get("notes") or "Worker data synced from SPIL integration layer."
    payload["last_synced_at"] = payload.get("last_synced_at") or utc_now()
    payload["status"] = payload.get("status") or "pending"
    payload["fraud_flag"] = 1 if payload.get("fraud_flag", False) else 0
    existing = None
    if payload.get("worker_id"):
        existing = get_spil_record(payload["worker_id"])
    if not existing and payload.get("id"):
        existing = get_spil_record_by_id(payload["id"])
    with _get_connection() as connection:
        if existing:
            connection.execute(
                """
                UPDATE spil_records SET
                    worker_id = ?, external_worker_id = ?, name = ?, source_system = ?, platform = ?, employer_name = ?, employment_type = ?,
                    shift_pattern = ?, experience_years = ?, incident_count = ?, attendance_score = ?, reliability_score = ?, risk_band = ?,
                    notes = ?, avg_working_hours_per_week = ?, rating = ?, location_latitude = ?, location_longitude = ?, location_risk_score = ?,
                    location_name = ?, salary_per_week = ?, deliveries_per_week = ?, night_shift_percentage = ?, safety_behavior_score = ?,
                    platform_tenure_years = ?, fraud_flag = ?, insurance_claimed_count = ?, status = ?, last_synced_at = ?
                WHERE id = ?
                """,
                (
                    payload.get("worker_id"), payload["external_worker_id"], payload["name"], payload["source_system"], payload["platform"], payload["employer_name"],
                    payload["employment_type"], payload["shift_pattern"], payload["experience_years"], payload["incident_count"],
                    payload["attendance_score"], payload["reliability_score"], payload["risk_band"], payload["notes"],
                    payload["avg_working_hours_per_week"], payload["rating"], payload["location_latitude"], payload["location_longitude"],
                    payload["location_risk_score"], payload["location_name"], payload["salary_per_week"], payload["deliveries_per_week"],
                    payload["night_shift_percentage"], payload["safety_behavior_score"], payload["platform_tenure_years"], payload["fraud_flag"],
                    payload["insurance_claimed_count"], payload["status"], payload["last_synced_at"], existing["id"],
                ),
            )
            row_id = existing["id"]
        else:
            connection.execute(
                """
                INSERT INTO spil_records (
                    id, worker_id, external_worker_id, name, source_system, platform, employer_name, employment_type, shift_pattern,
                    experience_years, incident_count, attendance_score, reliability_score, risk_band, notes,
                    avg_working_hours_per_week, rating, location_latitude, location_longitude, location_risk_score,
                    location_name, salary_per_week, deliveries_per_week, night_shift_percentage, safety_behavior_score,
                    platform_tenure_years, fraud_flag, insurance_claimed_count, status, last_synced_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["id"], payload.get("worker_id"), payload["external_worker_id"], payload["name"], payload["source_system"],
                    payload["platform"], payload["employer_name"], payload["employment_type"], payload["shift_pattern"],
                    payload["experience_years"], payload["incident_count"], payload["attendance_score"], payload["reliability_score"],
                    payload["risk_band"], payload["notes"], payload["avg_working_hours_per_week"], payload["rating"],
                    payload["location_latitude"], payload["location_longitude"], payload["location_risk_score"], payload["location_name"],
                    payload["salary_per_week"], payload["deliveries_per_week"], payload["night_shift_percentage"], payload["safety_behavior_score"],
                    payload["platform_tenure_years"], payload["fraud_flag"], payload["insurance_claimed_count"], payload["status"], payload["last_synced_at"],
                ),
            )
            row_id = payload["id"]
        row = connection.execute("SELECT * FROM spil_records WHERE id = ?", (row_id,)).fetchone()
    return _row_to_dict(row)


def get_admin_by_email(email: str) -> dict[str, Any] | None:
    with _get_connection() as connection:
        row = connection.execute("SELECT * FROM admin_accounts WHERE email = ? LIMIT 1", (email,)).fetchone()
    return _row_to_dict(row)


def get_admin_by_id(admin_id: str) -> dict[str, Any] | None:
    with _get_connection() as connection:
        row = connection.execute("SELECT * FROM admin_accounts WHERE admin_id = ? LIMIT 1", (admin_id,)).fetchone()
    return _row_to_dict(row)


def create_insured_customer(customer_data: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "id": f"customer-{uuid4().hex[:12]}",
        "worker_id": customer_data["worker_id"],
        "policy_id": customer_data["policy_id"],
        "plan_name": customer_data["plan_name"],
        "premium_amount": customer_data["premium_amount"],
        "subscription_start": customer_data["subscription_start"],
        "subscription_end": customer_data["subscription_end"],
        "ip_location": customer_data.get("ip_location", "0.0.0.0"),
        "all_worker_details": customer_data.get("all_worker_details", "{}"),
        "payment_status": "completed",
        "payment_date": utc_now(),
        "razorpay_order_id": customer_data.get("razorpay_order_id"),
        "razorpay_payment_id": customer_data.get("razorpay_payment_id"),
        "created_at": utc_now(),
    }
    with _get_connection() as connection:
        connection.execute(
            """
            INSERT INTO insured_customers (id, worker_id, policy_id, plan_name, premium_amount, subscription_start, subscription_end, ip_location, all_worker_details, payment_status, payment_date, razorpay_order_id, razorpay_payment_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["id"], payload["worker_id"], payload["policy_id"], payload["plan_name"], payload["premium_amount"], payload["subscription_start"],
                payload["subscription_end"], payload["ip_location"], payload["all_worker_details"], payload["payment_status"], payload["payment_date"],
                payload["razorpay_order_id"], payload["razorpay_payment_id"], payload["created_at"],
            ),
        )
    return payload


def get_insured_customer_by_worker(worker_id: str) -> dict[str, Any] | None:
    with _get_connection() as connection:
        row = connection.execute("SELECT * FROM insured_customers WHERE worker_id = ? ORDER BY created_at DESC LIMIT 1", (worker_id,)).fetchone()
    return _row_to_dict(row)


def delete_insured_customer_by_worker(worker_id: str) -> None:
    with _get_connection() as connection:
        connection.execute("DELETE FROM insured_customers WHERE worker_id = ?", (worker_id,))


def list_insured_customers() -> list[dict[str, Any]]:
    with _get_connection() as connection:
        rows = connection.execute("SELECT * FROM insured_customers ORDER BY created_at DESC").fetchall()
    return [_row_to_dict(row) for row in rows]


def get_wallet(worker_id: str) -> dict[str, Any]:
    with _get_connection() as connection:
        row = connection.execute("SELECT * FROM zencoin_wallets WHERE worker_id = ? LIMIT 1", (worker_id,)).fetchone()
        if row:
            return _row_to_dict(row)
        wallet = {"worker_id": worker_id, "balance": 0.0, "updated_at": utc_now()}
        connection.execute("INSERT INTO zencoin_wallets (worker_id, balance, updated_at) VALUES (?, ?, ?)", (worker_id, 0.0, wallet["updated_at"]))
    return wallet


def record_zencoin_transaction(worker_id: str, transaction_type: str, amount: float, reference: str = "", metadata: str = "") -> dict[str, Any]:
    wallet = get_wallet(worker_id)
    new_balance = round(float(wallet["balance"]) + float(amount), 2)
    updated_at = utc_now()
    with _get_connection() as connection:
        connection.execute("UPDATE zencoin_wallets SET balance = ?, updated_at = ? WHERE worker_id = ?", (new_balance, updated_at, worker_id))
        connection.execute(
            "INSERT INTO zencoin_transactions (id, worker_id, transaction_type, amount, balance_after, reference, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (f"zen-{uuid4().hex[:12]}", worker_id, transaction_type, float(amount), new_balance, reference, metadata, updated_at),
        )
    return {"worker_id": worker_id, "balance": new_balance, "updated_at": updated_at}


def list_zencoin_transactions(worker_id: str) -> list[dict[str, Any]]:
    with _get_connection() as connection:
        rows = connection.execute("SELECT * FROM zencoin_transactions WHERE worker_id = ? ORDER BY created_at DESC", (worker_id,)).fetchall()
    return [_row_to_dict(row) for row in rows]


def create_aiims_policy_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "id": f"aiims-{uuid4().hex[:12]}",
        "worker_id": snapshot["worker_id"],
        "policy_id": snapshot["policy_id"],
        "plan_name": snapshot["plan_name"],
        "premium_amount": float(snapshot["premium_amount"]),
        "wallet_currency": snapshot.get("wallet_currency", "ZEN"),
        "worker_payload": json.dumps(snapshot["worker_payload"], default=str),
        "spil_payload": json.dumps(snapshot["spil_payload"], default=str),
        "ip_address": snapshot.get("ip_address", "0.0.0.0"),
        "created_at": utc_now(),
    }
    with _get_aiims_connection() as connection:
        connection.execute(
            "INSERT INTO aiims_policy_snapshots (id, worker_id, policy_id, plan_name, premium_amount, wallet_currency, worker_payload, spil_payload, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                payload["id"], payload["worker_id"], payload["policy_id"], payload["plan_name"], payload["premium_amount"],
                payload["wallet_currency"], payload["worker_payload"], payload["spil_payload"], payload["ip_address"], payload["created_at"],
            ),
        )
    return payload


def list_aiims_policy_snapshots(worker_id: str) -> list[dict[str, Any]]:
    with _get_aiims_connection() as connection:
        rows = connection.execute("SELECT * FROM aiims_policy_snapshots WHERE worker_id = ? ORDER BY created_at DESC", (worker_id,)).fetchall()
    return [_row_to_dict(row) for row in rows]


def delete_aiims_policy_snapshots(worker_id: str) -> None:
    with _get_aiims_connection() as connection:
        connection.execute("DELETE FROM aiims_policy_snapshots WHERE worker_id = ?", (worker_id,))


# ---------------------------------------------------------------------------
# AIIMS Anomaly Events
# ---------------------------------------------------------------------------

def create_anomaly_event(event: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "id": event.get("id") or f"anomaly-{uuid4().hex[:10]}",
        "anomaly_type": event["anomaly_type"],
        "zone_id": event["zone_id"],
        "location_name": event.get("location_name", "Unknown"),
        "severity": float(event["severity"]),
        "severity_label": event.get("severity_label", "medium"),
        "hours_affected": float(event["hours_affected"]),
        "status": "active",
        "triggered_by": event.get("triggered_by", "admin"),
        "workers_affected": int(event.get("workers_affected", 0)),
        "total_payout": float(event.get("total_payout", 0)),
        "triggered_at": event.get("triggered_at") or utc_now(),
        "resolved_at": None,
    }
    with _get_aiims_connection() as connection:
        connection.execute(
            """INSERT INTO aiims_anomaly_events
               (id, anomaly_type, zone_id, location_name, severity, severity_label, hours_affected,
                status, triggered_by, workers_affected, total_payout, triggered_at, resolved_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                payload["id"], payload["anomaly_type"], payload["zone_id"], payload["location_name"],
                payload["severity"], payload["severity_label"], payload["hours_affected"],
                payload["status"], payload["triggered_by"], payload["workers_affected"],
                payload["total_payout"], payload["triggered_at"], payload["resolved_at"],
            ),
        )
    return payload


def list_anomaly_events() -> list[dict[str, Any]]:
    with _get_aiims_connection() as connection:
        rows = connection.execute("SELECT * FROM aiims_anomaly_events ORDER BY triggered_at DESC").fetchall()
    return [_row_to_dict(row) for row in rows]


def get_anomaly_event(event_id: str) -> dict[str, Any] | None:
    with _get_aiims_connection() as connection:
        row = connection.execute("SELECT * FROM aiims_anomaly_events WHERE id = ?", (event_id,)).fetchone()
    return _row_to_dict(row)


def update_anomaly_event(event_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    if not updates:
        return get_anomaly_event(event_id)
    sets = []
    vals: list[Any] = []
    for k, v in updates.items():
        if k == "id":
            continue
        sets.append(f"{k} = ?")
        vals.append(v)
    vals.append(event_id)
    with _get_aiims_connection() as connection:
        connection.execute(f"UPDATE aiims_anomaly_events SET {', '.join(sets)} WHERE id = ?", tuple(vals))
    return get_anomaly_event(event_id)


def resolve_anomaly_event(event_id: str) -> dict[str, Any] | None:
    return update_anomaly_event(event_id, {"status": "resolved", "resolved_at": utc_now()})


# ---------------------------------------------------------------------------
# AIIMS Payout Ledger
# ---------------------------------------------------------------------------

def create_payout_ledger_entry(entry: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "id": entry.get("id") or f"payout-{uuid4().hex[:10]}",
        "event_id": entry["event_id"],
        "worker_id": entry["worker_id"],
        "worker_name": entry.get("worker_name", "Worker"),
        "plan_name": entry.get("plan_name", ""),
        "daily_income": float(entry.get("daily_income", 0)),
        "severity": float(entry.get("severity", 0)),
        "hours_affected": float(entry.get("hours_affected", 0)),
        "severity_multiplier": float(entry.get("severity_multiplier", 0)),
        "plan_multiplier": float(entry.get("plan_multiplier", 0)),
        "raw_loss": float(entry.get("raw_loss", 0)),
        "payout_zencoins": float(entry.get("payout_zencoins", 0)),
        "reason": entry.get("reason", ""),
        "layer_trace": entry.get("layer_trace") if isinstance(entry.get("layer_trace"), str) else json.dumps(entry.get("layer_trace", {}), default=str),
        "created_at": utc_now(),
    }
    with _get_aiims_connection() as connection:
        connection.execute(
            """INSERT INTO aiims_payout_ledger
               (id, event_id, worker_id, worker_name, plan_name, daily_income, severity,
                hours_affected, severity_multiplier, plan_multiplier, raw_loss,
                payout_zencoins, reason, layer_trace, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                payload["id"], payload["event_id"], payload["worker_id"], payload["worker_name"],
                payload["plan_name"], payload["daily_income"], payload["severity"],
                payload["hours_affected"], payload["severity_multiplier"], payload["plan_multiplier"],
                payload["raw_loss"], payload["payout_zencoins"], payload["reason"],
                payload["layer_trace"], payload["created_at"],
            ),
        )
    return payload


def list_payouts_for_worker(worker_id: str) -> list[dict[str, Any]]:
    with _get_aiims_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM aiims_payout_ledger WHERE worker_id = ? ORDER BY created_at DESC", (worker_id,)
        ).fetchall()
    return [_row_to_dict(row) for row in rows]


def list_payouts_for_event(event_id: str) -> list[dict[str, Any]]:
    with _get_aiims_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM aiims_payout_ledger WHERE event_id = ? ORDER BY created_at DESC", (event_id,)
        ).fetchall()
    return [_row_to_dict(row) for row in rows]


# ---------------------------------------------------------------------------
# Auto-Subscription Settings
# ---------------------------------------------------------------------------

def upsert_auto_subscription(worker_id: str, plan_id: str, enabled: bool) -> dict[str, Any]:
    now = utc_now()
    with _get_aiims_connection() as connection:
        existing = connection.execute(
            "SELECT * FROM auto_subscription_settings WHERE worker_id = ?", (worker_id,)
        ).fetchone()
        if existing:
            connection.execute(
                "UPDATE auto_subscription_settings SET plan_id = ?, enabled = ? WHERE worker_id = ?",
                (plan_id, 1 if enabled else 0, worker_id),
            )
        else:
            connection.execute(
                "INSERT INTO auto_subscription_settings (worker_id, plan_id, enabled, last_renewed_at, created_at) VALUES (?, ?, ?, ?, ?)",
                (worker_id, plan_id, 1 if enabled else 0, None, now),
            )
    return {"worker_id": worker_id, "plan_id": plan_id, "enabled": enabled}


def get_auto_subscription(worker_id: str) -> dict[str, Any] | None:
    with _get_aiims_connection() as connection:
        row = connection.execute(
            "SELECT * FROM auto_subscription_settings WHERE worker_id = ?", (worker_id,)
        ).fetchone()
    if not row:
        return None
    result = _row_to_dict(row)
    if result:
        result["enabled"] = bool(result.get("enabled"))
    return result


def list_due_auto_subscriptions() -> list[dict[str, Any]]:
    with _get_aiims_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM auto_subscription_settings WHERE enabled = 1"
        ).fetchall()
    results = [_row_to_dict(row) for row in rows]
    for r in results:
        if r:
            r["enabled"] = bool(r.get("enabled"))
    return results


def update_auto_subscription_renewed(worker_id: str) -> None:
    with _get_aiims_connection() as connection:
        connection.execute(
            "UPDATE auto_subscription_settings SET last_renewed_at = ? WHERE worker_id = ?",
            (utc_now(), worker_id),
        )


# ---------------------------------------------------------------------------
# Subscribed workers by zone (for AIIMS pipeline)
# ---------------------------------------------------------------------------

def get_subscribed_workers_in_zone(zone_id: str) -> list[dict[str, Any]]:
    """Return workers who have an active policy AND are in the given zone."""
    with _get_connection() as connection:
        rows = connection.execute(
            """
            SELECT w.*, p.id as policy_id, p.plan_name, p.coverage_hours, p.max_weekly_payout
            FROM workers w
            INNER JOIN policies p ON p.worker_id = w.id
            INNER JOIN insured_customers ic ON ic.worker_id = w.id
            WHERE w.zone_id = ?
            ORDER BY w.name COLLATE NOCASE
            """,
            (zone_id,),
        ).fetchall()
    return [_row_to_dict(row) for row in rows]
