import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from math import asin, cos, radians, sin, sqrt
from uuid import uuid4

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.data.mock_data import ANOMALY_TEMPLATES, SCENARIO_LIBRARY, ZONE_LOCATIONS, ZONE_SIGNALS
from app.models import (
    AdminLoginRequest,
    AnomalyTriggerRequest,
    AutoSubscriptionRequest,
    ClaimCreate,
    EmailVerificationRequest,
    LoginRequest,
    PolicyActionRequest,
    QRLoginRequest,
    QRRegenerateRequest,
    SPILConnectRequest,
    SPILRecordInput,
    ScenarioRequest,
    WorkerRegistration,
    ZONE_ID_MAP,
)
from app.services.aiims import run_aiims_decision, run_aiims_pipeline
from app.services.auth_engine import (
    build_qr_bundle,
    create_session,
    decode_qr_payload,
    ensure_worker_security,
    rotate_worker_qr,
    sanitize_worker,
    utc_now,
)
from app.services.database import (
    create_aiims_policy_snapshot,
    create_claim as db_create_claim,
    create_insured_customer,
    create_worker as db_create_worker,
    delete_aiims_policy_snapshots,
    delete_insured_customer_by_worker,
    delete_policy_by_worker,
    get_admin_by_email,
    get_admin_by_id,
    get_anomaly_event,
    get_auto_subscription,
    get_insured_customer_by_worker,
    get_policy_by_worker,
    get_spil_record,
    get_spil_record_by_id,
    get_wallet,
    get_worker_by_id,
    get_worker_by_identifier,
    init_database,
    list_aiims_policy_snapshots,
    list_anomaly_events,
    list_claims_for_worker,
    list_due_auto_subscriptions,
    list_payouts_for_event,
    list_payouts_for_worker,
    list_policies as db_list_policies,
    list_spil_records,
    list_zencoin_transactions,
    list_workers,
    record_zencoin_transaction,
    resolve_anomaly_event,
    seed_database,
    update_auto_subscription_renewed,
    update_worker as db_update_worker,
    upsert_auto_subscription,
    upsert_policy,
    upsert_spil_record,
)
from app.services.notification_engine import issue_email_verification, verify_email_code
from app.services.premium_engine import calculate_premium


# ---------------------------------------------------------------------------
# Auto-renewal background task
# ---------------------------------------------------------------------------
_auto_renew_task: asyncio.Task | None = None


async def _auto_renewal_loop():
    """Runs every minute, checks if it's Sunday 8 PM IST, then renews."""
    IST = timezone(timedelta(hours=5, minutes=30))
    last_run_date: str | None = None
    while True:
        try:
            now_ist = datetime.now(IST)
            date_key = now_ist.strftime("%Y-%m-%d")
            if now_ist.weekday() == 6 and now_ist.hour == 20 and last_run_date != date_key:
                last_run_date = date_key
                _execute_auto_renewals()
        except Exception:
            pass
        await asyncio.sleep(60)


def _execute_auto_renewals() -> dict:
    """Process all due auto-subscriptions."""
    due = list_due_auto_subscriptions()
    results = []
    for setting in due:
        worker_id = setting["worker_id"]
        plan_id = setting["plan_id"]
        try:
            worker = get_worker_by_id(worker_id)
            if not worker:
                continue
            spil = get_spil_record(worker_id)
            if not spil:
                continue
            premium_quote = calculate_premium(worker, ZONE_SIGNALS.get(worker["zone_id"], {}), spil)
            available = {p["plan_id"]: p for p in premium_quote.get("available_plans", [])}
            selected_plan = available.get(plan_id)
            if not selected_plan:
                continue

            wallet = get_wallet(worker_id)
            cost = float(selected_plan["premium_zencoins"])
            if float(wallet["balance"]) < cost:
                record_zencoin_transaction(worker_id, "auto_renew_failed", 0, "", f"Insufficient balance for auto-renewal of {selected_plan['plan_name']}")
                results.append({"worker_id": worker_id, "status": "insufficient_balance"})
                continue

            # Renew the policy
            policy = upsert_policy({
                "worker_id": worker_id,
                "plan_name": selected_plan["plan_name"],
                "coverage_hours": int(selected_plan.get("coverage_hours", 8)),
                "max_weekly_payout": selected_plan["max_weekly_payout_zencoins"],
            })
            record_zencoin_transaction(worker_id, "auto_renewal", -cost, policy["id"], f"Auto-renewal: {selected_plan['plan_name']}")

            subscription_start = utc_now()
            subscription_end = (datetime.fromisoformat(subscription_start.replace("Z", "+00:00")).replace(tzinfo=timezone.utc) + timedelta(weeks=4)).isoformat()
            delete_insured_customer_by_worker(worker_id)
            delete_aiims_policy_snapshots(worker_id)
            create_insured_customer({
                "worker_id": worker_id,
                "policy_id": policy["id"],
                "plan_name": selected_plan["plan_name"],
                "premium_amount": cost,
                "subscription_start": subscription_start,
                "subscription_end": subscription_end,
                "ip_location": "auto-renewal",
                "all_worker_details": str({**worker, **spil}),
            })
            update_auto_subscription_renewed(worker_id)
            results.append({"worker_id": worker_id, "status": "renewed", "plan": selected_plan["plan_name"]})
        except Exception as exc:
            results.append({"worker_id": worker_id, "status": "error", "message": str(exc)})
    return {"renewed": len([r for r in results if r["status"] == "renewed"]), "results": results}


@asynccontextmanager
async def lifespan(application: FastAPI):
    global _auto_renew_task
    _auto_renew_task = asyncio.create_task(_auto_renewal_loop())
    yield
    if _auto_renew_task:
        _auto_renew_task.cancel()


app = FastAPI(title="ZENSURE API", version="0.6.0", lifespan=lifespan)

cors_origin_candidates = {
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "https://zensure-api.loca.lt",
}
extra_cors_origins = {
    origin.strip()
    for origin in os.getenv("ZENSURE_CORS_ORIGINS", "").split(",")
    if origin.strip()
}
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(cors_origin_candidates | extra_cors_origins),
    allow_origin_regex=r"^https?://([a-z0-9-]+\.)?(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$|^https://[a-z0-9-]+\.loca\.lt$|^https://[a-z0-9-]+(-[a-z0-9]+)*\.vercel\.app$|^https://[a-z0-9-]+\.onrender\.com$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_database()
seed_database()
sessions: dict[str, str] = {}


def verify_admin_token(authorization: str | None = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    token = authorization.replace("Bearer ", "")
    if not token.startswith("admin-token-"):
        raise HTTPException(status_code=401, detail="Invalid admin token")
    admin_id = token.replace("admin-token-", "")
    admin = get_admin_by_id(admin_id)
    if not admin:
        raise HTTPException(status_code=401, detail="Admin account not found")
    return {"admin_id": admin_id, "email": admin["email"]}


def _find_worker(worker_id: str) -> dict:
    worker = get_worker_by_id(worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    return worker


def _find_worker_by_identifier(identifier: str) -> dict:
    worker = get_worker_by_identifier(identifier)
    if not worker:
        raise HTTPException(status_code=404, detail="No worker found for that email or phone number")
    return worker


def _distance_km(latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float) -> float:
    earth_radius_km = 6371
    delta_lat = radians(latitude_b - latitude_a)
    delta_lon = radians(longitude_b - longitude_a)
    lat_a = radians(latitude_a)
    lat_b = radians(latitude_b)
    haversine = sin(delta_lat / 2) ** 2 + cos(lat_a) * cos(lat_b) * sin(delta_lon / 2) ** 2
    return 2 * earth_radius_km * asin(sqrt(haversine))


def _validate_live_location(zone: dict, location) -> dict:
    if not location:
        raise HTTPException(status_code=400, detail="Real GPS location is required for secure login.")
    payload = location.model_dump()
    distance = round(_distance_km(payload["latitude"], payload["longitude"], zone.get("latitude"), zone.get("longitude")), 2)
    if distance <= 5:
        gps_jump_risk = 0.05
        status = "Matched"
    elif distance <= 15:
        gps_jump_risk = 0.18
        status = "Nearby"
    else:
        gps_jump_risk = min(0.8, round(0.25 + distance / 90, 2))
        status = "Far"
    return {**payload, "distance_km": distance, "gps_jump_risk": gps_jump_risk, "status": status}


def _get_spil_profile(worker_id: str) -> dict | None:
    return get_spil_record(worker_id)


def _premium_quote(worker: dict) -> dict:
    spil_profile = _get_spil_profile(worker["id"])
    if not spil_profile:
        raise HTTPException(status_code=400, detail="Complete SPIL integration to view premium plans")
    return calculate_premium(worker, ZONE_SIGNALS[worker["zone_id"]], spil_profile)


def _build_dashboard(worker_id: str) -> dict:
    worker = _find_worker(worker_id)
    policy = get_policy_by_worker(worker_id)
    subscription = get_insured_customer_by_worker(worker_id)
    claims = list_claims_for_worker(worker_id)
    spil_profile = _get_spil_profile(worker_id)
    premium_quote = calculate_premium(worker, ZONE_SIGNALS[worker["zone_id"]], spil_profile) if spil_profile else None
    aiims_payouts = []
    try:
        aiims_payouts = list_payouts_for_worker(worker_id)[:5]
    except Exception:
        pass
    auto_sub = None
    try:
        auto_sub = get_auto_subscription(worker_id)
    except Exception:
        pass
    return {
        "worker": sanitize_worker(worker),
        "zone": ZONE_SIGNALS[worker["zone_id"]],
        "policy": policy,
        "subscription": subscription,
        "premium_quote": premium_quote,
        "claims": claims,
        "scenarios": SCENARIO_LIBRARY,
        "qr_login": build_qr_bundle(worker),
        "spil_profile": spil_profile,
        "aiims_payouts": aiims_payouts,
        "auto_subscription": auto_sub,
        "security": {
            "email_verified": bool(worker.get("email_verified")),
            "last_login_at": worker.get("last_login_at"),
            "gps_jump_risk": worker.get("gps_jump_risk", 0),
        },
        "summary": {
            "claim_count": len(claims),
            "lifetime_payout": round(sum(claim["payout_amount"] for claim in claims if claim["status"] in {"Approved", "Review"}), 2),
        },
    }


def _store_claim(worker: dict, policy: dict, scenario_key: str, decision: dict, title: str, claim_type: str, notes: str) -> dict:
    claim = {
        "id": f"claim-{uuid4().hex[:8]}",
        "worker_id": worker["id"],
        "policy_id": policy["id"],
        "claim_type": claim_type,
        "scenario_key": scenario_key,
        "title": title,
        "status": decision["claim_decision"]["status"],
        "payout_amount": decision["claim_decision"]["payout_amount"],
        "estimated_income_loss": decision["claim_decision"]["estimated_income_loss"],
        "reason": decision["claim_decision"]["reason"],
        "notes": notes,
        "created_at": utc_now(),
    }
    db_create_claim(claim)
    if claim["status"] in {"Approved", "Review"}:
        db_update_worker(
            worker["id"],
            {"total_payout_received": round(worker.get("total_payout_received", 0.0) + claim["payout_amount"], 2)},
        )
        record_zencoin_transaction(worker["id"], "claim_payout", float(claim["payout_amount"]), claim["id"], claim["title"])
    return claim


def _run_claim(worker_id: str, scenario_key: str, manual_override: dict | None = None, claim_type: str = "Auto", title: str | None = None, notes: str = "") -> dict:
    if scenario_key not in SCENARIO_LIBRARY:
        raise HTTPException(status_code=404, detail="Scenario not found")
    worker = _find_worker(worker_id)
    policy = get_policy_by_worker(worker_id)
    if not policy:
        raise HTTPException(status_code=400, detail="An active plan is required before claims can be processed")
    spil_profile = _get_spil_profile(worker_id)
    if not spil_profile:
        raise HTTPException(status_code=400, detail="SPIL integration is required before claims can be processed")
    scenario = dict(SCENARIO_LIBRARY[scenario_key])
    if manual_override:
        scenario.update(manual_override)
    decision = run_aiims_decision(worker, policy, ZONE_SIGNALS[worker["zone_id"]], scenario, spil_profile=spil_profile)
    claim = _store_claim(worker, policy, scenario_key, decision, title or f"{scenario['label']} claim", claim_type, notes or "Auto-generated claim")
    decision["claim"] = claim
    return decision


def _public_spil_record(record: dict) -> dict:
    return {
        "id": record["id"],
        "worker_id": record.get("worker_id"),
        "external_worker_id": record.get("external_worker_id"),
        "name": record.get("name") or "Unknown Worker",
        "platform": record.get("platform") or "Swiggy",
        "status": record.get("status") or "pending",
        "location_name": record.get("location_name") or "Unknown",
        "rating": record.get("rating") or 0,
        "avg_working_hours_per_week": record.get("avg_working_hours_per_week") or 0,
        "salary_per_week": record.get("salary_per_week") or 0,
        "notes": record.get("notes") or "",
    }


# =====================================================================
# CORE ENDPOINTS (unchanged)
# =====================================================================

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "zensure-api"}


@app.post("/api/auth/request-email-code")
def request_email_code(payload: EmailVerificationRequest):
    return {"message": "Verification code generated.", "verification": issue_email_verification(payload.email)}


@app.post("/api/register")
@app.post("/api/auth/register")
def register_worker(payload: WorkerRegistration):
    data = payload.model_dump()
    email = (data.get("email") or "").strip().lower()
    phone = (data.get("phone") or "").strip()
    verification_code = (data.pop("verification_code", None) or "").strip()
    location = data.pop("location", None)
    location_zone = data.pop("location_zone", "Hyderabad")
    # Resolve zone_id and city from the selected location zone
    resolved_zone_id = ZONE_ID_MAP.get(location_zone, "hyderabad")
    data["zone_id"] = resolved_zone_id
    data["city"] = location_zone
    if not email:
        raise HTTPException(status_code=400, detail="Email is required.")
    if not verify_email_code(email, verification_code):
        raise HTTPException(status_code=400, detail="Email verification code is invalid or expired.")
    if get_worker_by_identifier(email):
        raise HTTPException(status_code=400, detail="That email is already registered")
    if phone and get_worker_by_identifier(phone):
        raise HTTPException(status_code=400, detail="That phone number is already registered")
    zone_data = ZONE_SIGNALS.get(resolved_zone_id, {})
    worker = ensure_worker_security(
        {
            **data,
            "id": f"worker-{uuid4().hex[:8]}",
            "email": email,
            "phone": phone or None,
            "email_verified": True,
            "last_login_latitude": location.get("latitude") if location else zone_data.get("latitude", 17.3850),
            "last_login_longitude": location.get("longitude") if location else zone_data.get("longitude", 78.4867),
            "last_location_accuracy": location.get("accuracy") if location else None,
        },
        seed_index=len(list_workers()),
    )
    created = db_create_worker(worker)
    session = create_session(created, method="register")
    sessions[session["session_token"]] = created["id"]
    return {"message": "Worker registered successfully.", "worker": sanitize_worker(created), "session": session, "premium_quote": None}


@app.post("/api/auth/login")
def login_worker(payload: LoginRequest):
    worker = _find_worker_by_identifier(payload.identifier)
    if worker.get("password") != payload.password:
        raise HTTPException(status_code=401, detail="Invalid password")
    zone = ZONE_SIGNALS[worker["zone_id"]]
    location_check = _validate_live_location(zone, payload.location)
    session = create_session(worker, method="password+gps")
    sessions[session["session_token"]] = worker["id"]
    db_update_worker(
        worker["id"],
        {
            "last_login_at": utc_now(),
            "last_login_latitude": location_check["latitude"],
            "last_login_longitude": location_check["longitude"],
            "last_location_accuracy": location_check.get("accuracy"),
            "gps_jump_risk": location_check["gps_jump_risk"],
        },
    )
    return {"message": f"Welcome back, {worker['name']}.", "session": session, "dashboard": _build_dashboard(worker["id"])}


@app.post("/api/auth/qr-login")
def qr_login(payload: QRLoginRequest):
    try:
        qr_payload = decode_qr_payload(payload.qr_data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    worker = _find_worker(qr_payload.get("worker_id", ""))
    if qr_payload.get("secret") != worker.get("qr_secret") or qr_payload.get("version") != worker.get("qr_version"):
        raise HTTPException(status_code=401, detail="This QR code has expired.")
    location_check = _validate_live_location(ZONE_SIGNALS[worker["zone_id"]], payload.location)
    session = create_session(worker, method=f"qr+gps:{payload.scan_method}")
    sessions[session["session_token"]] = worker["id"]
    db_update_worker(
        worker["id"],
        {
            "last_login_at": utc_now(),
            "last_login_latitude": location_check["latitude"],
            "last_login_longitude": location_check["longitude"],
            "last_location_accuracy": location_check.get("accuracy"),
            "gps_jump_risk": location_check["gps_jump_risk"],
        },
    )
    return {"message": "QR login successful.", "session": session, "dashboard": _build_dashboard(worker["id"])}


@app.post("/api/auth/regenerate-qr")
def regenerate_qr(payload: QRRegenerateRequest):
    worker = _find_worker(payload.worker_id)
    qr_login = rotate_worker_qr(worker)
    db_update_worker(worker["id"], {"qr_version": worker["qr_version"], "qr_secret": worker["qr_secret"], "qr_rotated_at": worker["qr_rotated_at"]})
    return {"message": "ZenPass QR refreshed.", "qr_login": qr_login}


@app.get("/api/dashboard/{worker_id}")
def get_dashboard(worker_id: str):
    return _build_dashboard(worker_id)


@app.get("/api/policies")
def list_policies():
    return {"policies": db_list_policies()}


@app.get("/api/spil/records")
def get_spil_records():
    return {"records": [_public_spil_record(record) for record in list_spil_records() if not record.get("worker_id")]}


# =====================================================================
# ADMIN LOGIN (Global — works for entire site)
# =====================================================================

@app.post("/api/admin/login")
def admin_login(payload: AdminLoginRequest):
    stored_admin = get_admin_by_email(payload.email)
    if not stored_admin or stored_admin["password"] != payload.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": f"admin-token-{stored_admin['admin_id']}", "admin_email": stored_admin["email"], "message": "Admin logged in successfully"}


@app.get("/api/admin/verify")
def verify_admin(authorization: str | None = Header(None)):
    """Verify admin token is still valid — used by frontend to persist admin state."""
    admin = verify_admin_token(authorization)
    return {"valid": True, "admin_id": admin["admin_id"], "email": admin["email"]}


# =====================================================================
# SPIL ADMIN ENDPOINTS
# =====================================================================

@app.get("/api/admin/spil-workers")
def list_spil_workers(authorization: str | None = Header(None)):
    verify_admin_token(authorization)
    return [_public_spil_record(record) for record in list_spil_records()]


@app.post("/api/admin/spil-workers/create")
def create_spil_worker(payload: SPILRecordInput, authorization: str | None = Header(None)):
    verify_admin_token(authorization)
    data = payload.model_dump()
    record = upsert_spil_record(
        {
            **data,
            "worker_id": None,
            "source_system": "SPIL",
            "status": "pending",
            "last_synced_at": utc_now(),
            "notes": data.get("notes") or "Created by admin through SPIL panel.",
        }
    )
    return {"message": "SPIL worker record created", "spil_record": record}


@app.post("/api/admin/spil-workers/{spil_id}/connect")
def connect_spil_worker(spil_id: str, authorization: str | None = Header(None)):
    verify_admin_token(authorization)
    spil_record = get_spil_record_by_id(spil_id)
    if not spil_record:
        raise HTTPException(status_code=404, detail="SPIL worker not found")
    if spil_record.get("worker_id"):
        linked_worker = get_worker_by_id(spil_record["worker_id"])
        return {
            "message": "SPIL worker already connected",
            "worker": sanitize_worker(linked_worker) if linked_worker else None,
            "spil_record": spil_record,
            "premium_quote": _premium_quote(linked_worker) if linked_worker and get_spil_record(linked_worker["id"]) else None,
        }

    worker_id = f"worker-{uuid4().hex[:12]}"
    worker = db_create_worker(
        ensure_worker_security(
            {
                "id": worker_id,
                "name": spil_record["name"],
                "email": f"{worker_id}@zensure-worker.local",
                "phone": None,
                "password": "temp-password-from-spil",
                "city": spil_record.get("location_name", "Hyderabad"),
                "platform": spil_record.get("platform", "Swiggy"),
                "zone_id": ZONE_ID_MAP.get(spil_record.get("location_name", "Hyderabad"), "hyderabad"),
                "avg_daily_income": round(float(spil_record.get("salary_per_week", 6000)) / 6, 2),
                "weekly_active_days": 6,
                "on_time_rate": float(spil_record.get("safety_behavior_score", 0.85)),
                "consistency_score": float(spil_record.get("attendance_score", 0.9)),
                "historic_claims": int(spil_record.get("insurance_claimed_count", 0)),
                "gps_jump_risk": float(spil_record.get("location_risk_score", 0.5)),
                "ip_mismatch_count": 0,
                "activity_spike_score": 0.05,
            }
        )
    )
    linked_record = upsert_spil_record({**spil_record, "worker_id": worker["id"], "status": "connected", "last_synced_at": utc_now()})
    return {"message": "SPIL worker connected to Zensure", "worker": sanitize_worker(worker), "spil_record": linked_record, "premium_quote": _premium_quote(worker)}


# =====================================================================
# USER SPIL CONNECT (workers can connect but NOT create)
# =====================================================================

@app.post("/api/user/spil/connect/{spil_id}")
def connect_worker_spil_profile(spil_id: str, payload: SPILConnectRequest):
    worker = _find_worker(payload.worker_id)
    if get_spil_record(worker["id"]):
        raise HTTPException(status_code=409, detail="SPIL integration is already completed for this worker")
    spil_record = get_spil_record_by_id(spil_id)
    if not spil_record:
        raise HTTPException(status_code=404, detail="SPIL worker not found")
    if spil_record.get("worker_id"):
        raise HTTPException(status_code=409, detail="This SPIL profile is already linked")

    updated_worker = db_update_worker(
        worker["id"],
        {
            "city": spil_record.get("location_name", worker["city"]),
            "platform": spil_record.get("platform", worker["platform"]),
            "avg_daily_income": round(float(spil_record.get("salary_per_week", 6000)) / max(worker.get("weekly_active_days", 6), 1), 2),
            "on_time_rate": float(spil_record.get("safety_behavior_score", 0.85)),
            "consistency_score": float(spil_record.get("attendance_score", 0.9)),
            "historic_claims": int(spil_record.get("insurance_claimed_count", 0)),
            "gps_jump_risk": float(spil_record.get("location_risk_score", 0.5)),
        },
    )
    linked_record = upsert_spil_record({**spil_record, "worker_id": worker["id"], "status": "connected", "last_synced_at": utc_now()})
    return {"message": "SPIL integration completed successfully.", "worker": sanitize_worker(updated_worker), "spil_record": linked_record, "premium_quote": _premium_quote(updated_worker)}


# =====================================================================
# WALLET & ZENCOINS
# =====================================================================

@app.get("/api/user/wallet/{worker_id}")
def get_wallet_details(worker_id: str):
    _find_worker(worker_id)
    aiims_snapshots = []
    aiims_warning = None
    try:
        aiims_snapshots = list_aiims_policy_snapshots(worker_id)[:10]
    except Exception:
        aiims_warning = "AIIMS snapshots are temporarily unavailable."
    return {
        "wallet": get_wallet(worker_id),
        "transactions": list_zencoin_transactions(worker_id)[:20],
        "aiims_snapshots": aiims_snapshots,
        "aiims_warning": aiims_warning,
        "conversion_rate_inr": 1,
    }


@app.post("/api/user/zencoins/purchase")
def purchase_zencoins(payload: dict):
    worker_id = payload.get("worker_id")
    rupee_amount = float(payload.get("rupee_amount", 0))
    if not worker_id or rupee_amount <= 0:
        raise HTTPException(status_code=400, detail="worker_id and rupee_amount are required")
    _find_worker(worker_id)
    wallet = record_zencoin_transaction(worker_id, "purchase", rupee_amount, f"order-{uuid4().hex[:10]}", "Mock Razorpay top-up")
    return {"message": "ZenCoins purchased successfully.", "wallet": wallet, "zencoins_added": rupee_amount}


@app.post("/api/user/zencoins/convert")
def convert_zencoins(payload: dict):
    worker_id = payload.get("worker_id")
    zencoins = float(payload.get("zencoins", 0))
    wallet = get_wallet(worker_id)
    if zencoins <= 0 or float(wallet["balance"]) < zencoins:
        raise HTTPException(status_code=400, detail="Insufficient ZenCoins")
    updated_wallet = record_zencoin_transaction(worker_id, "conversion", -zencoins, f"convert-{uuid4().hex[:8]}", "ZenCoins converted to INR")
    return {"message": "ZenCoins converted successfully.", "wallet": updated_wallet, "inr_amount": zencoins}


# =====================================================================
# SUBSCRIPTION
# =====================================================================

@app.post("/api/user/subscribe")
def subscribe_with_zencoins(payload: PolicyActionRequest, x_forwarded_for: str | None = Header(None)):
    worker_id = payload.worker_id
    plan_id = payload.plan_id
    if not worker_id or not plan_id:
        raise HTTPException(status_code=400, detail="worker_id and plan_id are required")
    worker = _find_worker(worker_id)
    spil = get_spil_record(worker_id)
    if not spil:
        raise HTTPException(status_code=400, detail="Complete SPIL integration before subscribing")
    premium_quote = _premium_quote(worker)
    available = {plan["plan_id"]: plan for plan in premium_quote["available_plans"]}
    selected_plan = available.get(plan_id)
    if not selected_plan:
        raise HTTPException(status_code=404, detail="Selected plan is not available")
    wallet = get_wallet(worker_id)
    if float(wallet["balance"]) < float(selected_plan["premium_zencoins"]):
        raise HTTPException(status_code=400, detail=f"Insufficient ZenCoin balance. Required: {selected_plan['premium_zencoins']} ZC.")

    existing_policy = get_policy_by_worker(worker_id)
    existing_customer = get_insured_customer_by_worker(worker_id)
    if existing_policy and existing_policy["plan_name"] == selected_plan["plan_name"]:
        raise HTTPException(status_code=409, detail="You are already subscribed to this plan.")

    policy = upsert_policy(
        {
            "worker_id": worker_id,
            "plan_name": selected_plan["plan_name"],
            "coverage_hours": int(selected_plan.get("coverage_hours", 8 if plan_id == "basic" else 12)),
            "max_weekly_payout": selected_plan["max_weekly_payout_zencoins"],
        }
    )
    record_zencoin_transaction(worker_id, "plan_purchase", -float(selected_plan["premium_zencoins"]), policy["id"], selected_plan["plan_name"])
    subscription_start = utc_now()
    subscription_end = (datetime.fromisoformat(subscription_start.replace("Z", "+00:00")).replace(tzinfo=timezone.utc) + timedelta(weeks=4)).isoformat()
    if existing_customer:
        delete_insured_customer_by_worker(worker_id)
    delete_aiims_policy_snapshots(worker_id)
    customer = create_insured_customer(
        {
            "worker_id": worker_id,
            "policy_id": policy["id"],
            "plan_name": selected_plan["plan_name"],
            "premium_amount": selected_plan["premium_zencoins"],
            "subscription_start": subscription_start,
            "subscription_end": subscription_end,
            "ip_location": payload.ip_address or x_forwarded_for or "0.0.0.0",
            "all_worker_details": str({**worker, **spil, "selected_plan": selected_plan}),
        }
    )
    snapshot = create_aiims_policy_snapshot(
        {
            "worker_id": worker_id,
            "policy_id": policy["id"],
            "plan_name": selected_plan["plan_name"],
            "premium_amount": selected_plan["premium_zencoins"],
            "wallet_currency": "ZEN",
            "worker_payload": sanitize_worker(worker),
            "spil_payload": spil,
            "ip_address": payload.ip_address or x_forwarded_for or "0.0.0.0",
        }
    )
    return {
        "message": "Plan activated successfully using ZenCoins.",
        "policy": policy,
        "customer": customer,
        "snapshot": snapshot,
        "wallet_balance": get_wallet(worker_id)["balance"],
        "premium_quote": premium_quote,
    }


@app.get("/api/user/subscription-status/{worker_id}")
def get_subscription_status(worker_id: str):
    _find_worker(worker_id)
    customer = get_insured_customer_by_worker(worker_id)
    policy = get_policy_by_worker(worker_id)
    if not customer:
        return {"subscribed": False, "message": "No active subscription"}
    return {
        "subscribed": True,
        "customer_id": customer["id"],
        "policy_id": policy["id"] if policy else None,
        "plan_name": customer["plan_name"],
        "premium_amount": customer["premium_amount"],
        "subscription_start": customer["subscription_start"],
        "subscription_end": customer["subscription_end"],
        "payment_status": customer["payment_status"],
    }


@app.post("/api/user/cancel-policy")
def cancel_policy(payload: PolicyActionRequest):
    worker_id = payload.worker_id
    if not worker_id:
        raise HTTPException(status_code=400, detail="worker_id is required")
    _find_worker(worker_id)
    existing_customer = get_insured_customer_by_worker(worker_id)
    existing_policy = get_policy_by_worker(worker_id)
    if not existing_customer and not existing_policy:
        raise HTTPException(status_code=404, detail="No active policy to cancel.")

    delete_insured_customer_by_worker(worker_id)
    delete_aiims_policy_snapshots(worker_id)
    delete_policy_by_worker(worker_id)
    return {"message": "Policy cancelled successfully.", "worker_id": worker_id}


# =====================================================================
# CLAIMS (legacy scenario-based)
# =====================================================================

@app.post("/api/claims/manual")
def create_manual_claim(payload: ClaimCreate):
    decision = _run_claim(payload.worker_id, payload.scenario, claim_type="Manual", title=payload.title, notes=payload.notes)
    return {"message": "Claim evaluated successfully", "claim": decision["claim"], "decision": decision, "dashboard": _build_dashboard(payload.worker_id)}


@app.post("/api/claims/auto/{worker_id}")
def auto_claim(worker_id: str, payload: ScenarioRequest):
    return _run_claim(worker_id, payload.scenario, payload.manual_override, "Auto", f"{SCENARIO_LIBRARY[payload.scenario]['label']} auto payout")


@app.post("/api/simulate/{worker_id}")
def simulate_disruption(worker_id: str, payload: ScenarioRequest):
    return auto_claim(worker_id, payload)


@app.get("/api/user/recent-payouts/{worker_id}")
def get_recent_payouts(worker_id: str):
    claims = list_claims_for_worker(worker_id)
    payouts = [{"date": claim["created_at"], "amount": claim["payout_amount"], "title": claim["title"], "status": claim["status"]} for claim in claims if claim["status"] == "Approved"]
    return {"worker_id": worker_id, "total_payouts": sum(p["amount"] for p in payouts), "payout_count": len(payouts), "payouts": payouts}


# =====================================================================
# AIIMS 5-LAYER ENGINE — ADMIN ENDPOINTS
# =====================================================================

@app.post("/api/admin/aiims/trigger-anomaly")
def trigger_anomaly(payload: AnomalyTriggerRequest, authorization: str | None = Header(None)):
    """Admin triggers an anomaly event — runs the full AIIMS 5-layer pipeline."""
    admin = verify_admin_token(authorization)
    result = run_aiims_pipeline(
        anomaly_type=payload.anomaly_type,
        zone_id=payload.zone_id,
        severity=payload.severity,
        hours_affected=payload.hours_affected,
        location_name=payload.location_name,
        triggered_by=admin["email"],
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.get("/api/admin/aiims/events")
def list_aiims_events(authorization: str | None = Header(None)):
    """List all anomaly events."""
    verify_admin_token(authorization)
    events = list_anomaly_events()
    return {"events": events, "total": len(events)}


@app.get("/api/admin/aiims/events/{event_id}")
def get_aiims_event(event_id: str, authorization: str | None = Header(None)):
    """Get single event with full payout details."""
    verify_admin_token(authorization)
    event = get_anomaly_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Anomaly event not found")
    payouts = list_payouts_for_event(event_id)
    return {"event": event, "payouts": payouts}


@app.post("/api/admin/aiims/resolve/{event_id}")
def resolve_event(event_id: str, authorization: str | None = Header(None)):
    """Mark an anomaly event as resolved."""
    verify_admin_token(authorization)
    event = resolve_anomaly_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Anomaly event not found")
    return {"message": "Anomaly event resolved.", "event": event}


@app.get("/api/admin/aiims/dashboard")
def aiims_admin_dashboard(authorization: str | None = Header(None)):
    """Aggregated AIIMS stats for admin."""
    verify_admin_token(authorization)
    events = list_anomaly_events()
    total_events = len(events)
    active_events = len([e for e in events if e.get("status") == "active"])
    total_workers = sum(e.get("workers_affected", 0) for e in events)
    total_payout = round(sum(e.get("total_payout", 0) for e in events), 2)
    return {
        "total_events": total_events,
        "active_events": active_events,
        "resolved_events": total_events - active_events,
        "total_workers_affected": total_workers,
        "total_payout_zencoins": total_payout,
        "anomaly_templates": ANOMALY_TEMPLATES,
        "zone_locations": ZONE_LOCATIONS,
        "recent_events": events[:10],
    }


# =====================================================================
# AIIMS — USER ENDPOINTS
# =====================================================================

@app.get("/api/user/aiims/payouts/{worker_id}")
def get_worker_aiims_payouts(worker_id: str):
    """Worker's AIIMS payout history."""
    _find_worker(worker_id)
    payouts = list_payouts_for_worker(worker_id)
    total = round(sum(p.get("payout_zencoins", 0) for p in payouts), 2)
    return {
        "worker_id": worker_id,
        "payouts": payouts,
        "total_aiims_payout": total,
        "payout_count": len(payouts),
    }


# =====================================================================
# AUTO-SUBSCRIPTION
# =====================================================================

@app.post("/api/user/auto-subscription")
def set_auto_subscription(payload: AutoSubscriptionRequest):
    """Toggle auto-renewal for a worker."""
    _find_worker(payload.worker_id)
    result = upsert_auto_subscription(payload.worker_id, payload.plan_id, payload.enabled)
    status = "enabled" if payload.enabled else "disabled"
    return {"message": f"Auto-subscription {status}.", "auto_subscription": result}


@app.get("/api/user/auto-subscription/{worker_id}")
def get_auto_subscription_status(worker_id: str):
    """Get auto-subscription status for a worker."""
    _find_worker(worker_id)
    setting = get_auto_subscription(worker_id)
    if not setting:
        return {"enabled": False, "message": "No auto-subscription configured"}
    return setting


@app.post("/api/system/auto-renew")
def manual_auto_renew(authorization: str | None = Header(None)):
    """Manually trigger auto-renewal (admin only)."""
    verify_admin_token(authorization)
    results = _execute_auto_renewals()
    return {"message": "Auto-renewal process completed.", **results}
