"""
AIIMS Engine — AI Insurance Monitoring System
5-Layer Architecture:
  1. Monitoring Layer  — Detects anomalies (via SPIL mock signals)
  2. Analyzing Layer   — Finds affected subscribed workers in the zone
  3. Fraud Layer       — Stub (passes all workers through)
  4. Decision Layer    — Calculates payout based on plan, income, severity, hours
  5. Payout Layer      — Credits ZenCoins to worker wallets
"""
from __future__ import annotations

import json
from typing import Any

from app.data.mock_data import ANOMALY_TEMPLATES, ZONE_LOCATIONS, ZONE_SIGNALS
from app.services.auth_engine import utc_now
from app.services.database import (
    create_anomaly_event,
    create_payout_ledger_entry,
    get_anomaly_event,
    get_subscribed_workers_in_zone,
    record_zencoin_transaction,
    update_anomaly_event,
    update_worker as db_update_worker,
)
from app.services.premium_engine import calculate_premium
from app.services.trigger_engine import detect_parametric_triggers
from app.services.trustshield import evaluate_trustshield


# ---------------------------------------------------------------------------
# Existing single-claim decision (kept for backward compat with /api/claims/*)
# ---------------------------------------------------------------------------

def run_aiims_decision(worker: dict, policy: dict, zone: dict, scenario: dict, spil_profile: dict | None = None) -> dict:
    premium = calculate_premium(worker, zone, spil_profile)
    trigger_result = detect_parametric_triggers(worker, scenario)
    trustshield = evaluate_trustshield(worker, scenario)

    if not trigger_result["triggered"]:
        status = "Rejected"
        payout_amount = 0
        reason = "No parametric trigger threshold was met for this event."
    elif trustshield["status"] == "Rejected":
        status = "Rejected"
        payout_amount = 0
        reason = "TrustShield detected strong fraud or anomaly signals."
    elif trustshield["status"] == "Review":
        status = "Review"
        payout_amount = round(min(policy["max_weekly_payout"], trigger_result["recommended_payout"] * 0.4), 2)
        reason = "The disruption is real, but the worker has medium-risk anomaly signals."
    else:
        status = "Approved"
        payout_amount = round(min(policy["max_weekly_payout"], trigger_result["recommended_payout"]), 2)
        reason = "AIIMS validated the disruption and approved zero-touch payout."

    return {
        "worker": worker,
        "policy": policy,
        "spil_profile": spil_profile,
        "premium_quote": premium,
        "scenario": scenario,
        "claim_decision": {
            "status": status,
            "payout_amount": payout_amount,
            "estimated_income_loss": trigger_result["estimated_income_loss"],
            "reason": reason,
        },
        "aiims_trace": {
            "matched_triggers": trigger_result["matched_triggers"],
            "confidence": trigger_result["confidence"],
            "disruption_strength": trigger_result["disruption_strength"],
            "trustshield": trustshield,
        },
    }


# =====================================================================
# AIIMS 5-LAYER PIPELINE (for anomaly-based payouts)
# =====================================================================

# ---- Layer 1: Monitoring ----

def monitoring_layer(anomaly_type: str, zone_id: str,
                     severity: float | None = None,
                     hours_affected: float | None = None,
                     location_name: str | None = None,
                     triggered_by: str = "admin") -> dict[str, Any]:
    """
    Detects an anomaly from SPIL mock API signals and creates an event record.
    Only admin-level accounts can trigger this.
    """
    template = ANOMALY_TEMPLATES.get(anomaly_type)
    if not template:
        return {"error": f"Unknown anomaly type: {anomaly_type}"}

    if zone_id not in ZONE_SIGNALS:
        return {"error": f"Unknown zone: {zone_id}"}

    actual_severity = severity if severity is not None else template["default_severity"]
    actual_hours = hours_affected if hours_affected is not None else template["default_hours"]

    # Determine severity label
    if actual_severity >= 0.9:
        severity_label = "critical"
    elif actual_severity >= 0.7:
        severity_label = "high"
    elif actual_severity >= 0.5:
        severity_label = "medium"
    else:
        severity_label = "low"

    zone_info = ZONE_LOCATIONS.get(zone_id, {})
    loc_name = location_name or zone_info.get("full_name", ZONE_SIGNALS[zone_id].get("label", zone_id))

    event = create_anomaly_event({
        "anomaly_type": anomaly_type,
        "zone_id": zone_id,
        "location_name": loc_name,
        "severity": actual_severity,
        "severity_label": severity_label,
        "hours_affected": actual_hours,
        "triggered_by": triggered_by,
    })

    return {
        "layer": "monitoring",
        "status": "anomaly_detected",
        "event": event,
        "template": {
            "label": template["label"],
            "description": template["description"],
            "icon": template["icon"],
            "signal_params": template["signal_params"],
        },
    }


# ---- Layer 2: Analyzing ----

def analyzing_layer(event: dict[str, Any]) -> dict[str, Any]:
    """
    Queries the database for subscribed workers in the affected zone.
    Only workers with active policies are eligible.
    """
    zone_id = event["zone_id"]
    workers = get_subscribed_workers_in_zone(zone_id)

    eligible = []
    for w in workers:
        eligible.append({
            "worker_id": w["id"],
            "name": w["name"],
            "plan_name": w.get("plan_name", "Unknown"),
            "avg_daily_income": float(w.get("avg_daily_income", 0)),
            "max_weekly_payout": float(w.get("max_weekly_payout", 0)),
            "coverage_hours": int(w.get("coverage_hours", 8)),
            "zone_id": w["zone_id"],
            "platform": w.get("platform", "Unknown"),
        })

    return {
        "layer": "analyzing",
        "zone_id": zone_id,
        "total_workers_in_zone": len(workers),
        "eligible_workers": eligible,
    }


# ---- Layer 3: Fraud (Stub) ----

def fraud_layer_stub(worker_info: dict, event: dict) -> dict[str, Any]:
    """
    Fraud detection stub — always passes.
    Ready for future ML-based implementation.
    """
    return {
        "layer": "fraud",
        "worker_id": worker_info["worker_id"],
        "passed": True,
        "fraud_score": 0,
        "note": "Fraud layer bypassed (stub) — all workers pass through.",
    }


# ---- Layer 4: Decision ----

SEVERITY_MULTIPLIERS = {
    "low": 0.50,
    "medium": 0.70,
    "high": 0.85,
    "critical": 1.00,
}

PLAN_MULTIPLIERS = {
    "Basic Weather Shield": 0.60,
    "Super Shield Plus": 1.00,
}


def decision_layer(worker_info: dict, event: dict) -> dict[str, Any]:
    """
    Calculates the payout amount based on:
    - Worker's daily income
    - Hours affected by the anomaly
    - Severity of the event (multiplier)
    - Worker's plan tier (multiplier)
    - Capped at 85% of raw income loss (company sustainability)
    - Capped at policy max_weekly_payout
    - Minimum 50 ZC for any approved event
    """
    daily_income = float(worker_info.get("avg_daily_income", 800))
    coverage_hours = int(worker_info.get("coverage_hours", 8))
    raw_hours_affected = float(event.get("hours_affected", 4))
    # Cap hours at the plan's coverage limit (Basic=8h, Super=12h)
    hours_affected = min(raw_hours_affected, float(coverage_hours))
    severity_label = event.get("severity_label", "medium")
    plan_name = worker_info.get("plan_name", "Basic Weather Shield")
    max_weekly_payout = float(worker_info.get("max_weekly_payout", 1400))

    base_hourly_rate = daily_income / 8.0
    raw_loss = round(base_hourly_rate * hours_affected, 2)

    severity_multiplier = SEVERITY_MULTIPLIERS.get(severity_label, 0.70)
    plan_multiplier = PLAN_MULTIPLIERS.get(plan_name, 0.60)

    # Apply multipliers
    computed_payout = raw_loss * severity_multiplier * plan_multiplier

    # Cap at 85% of raw loss (company feasibility)
    feasibility_cap = raw_loss * 0.85
    computed_payout = min(computed_payout, feasibility_cap)

    # Cap at policy max weekly payout
    computed_payout = min(computed_payout, max_weekly_payout)

    # Minimum payout of 50 ZC for any approved event
    payout = round(max(50, computed_payout), 2)

    # Final cap check
    payout = min(payout, max_weekly_payout)

    reason = (
        f"Payout of {payout} ZC approved. "
        f"Base hourly rate ₹{base_hourly_rate:.0f}/hr × {hours_affected}h = ₹{raw_loss:.0f} raw loss. "
        f"Severity ({severity_label}) ×{severity_multiplier}, Plan ({plan_name}) ×{plan_multiplier}. "
        f"Capped at 85% feasibility and policy max {max_weekly_payout} ZC."
    )

    return {
        "layer": "decision",
        "worker_id": worker_info["worker_id"],
        "daily_income": daily_income,
        "hours_affected": hours_affected,
        "base_hourly_rate": round(base_hourly_rate, 2),
        "raw_loss": raw_loss,
        "severity_label": severity_label,
        "severity_multiplier": severity_multiplier,
        "plan_name": plan_name,
        "plan_multiplier": plan_multiplier,
        "feasibility_cap": round(feasibility_cap, 2),
        "max_weekly_payout": max_weekly_payout,
        "payout_zencoins": payout,
        "reason": reason,
    }


# ---- Layer 5: Payout ----

def payout_layer(worker_id: str, payout_amount: float, event_id: str,
                 reason: str, worker_name: str = "Worker") -> dict[str, Any]:
    """
    Credits ZenCoins to the worker's wallet and records the transaction.
    """
    wallet = record_zencoin_transaction(
        worker_id,
        "aiims_payout",
        payout_amount,
        event_id,
        f"AIIMS anomaly payout: {reason[:80]}",
    )

    # Update worker total payout
    try:
        from app.services.database import get_worker_by_id
        worker = get_worker_by_id(worker_id)
        if worker:
            new_total = round(float(worker.get("total_payout_received", 0)) + payout_amount, 2)
            db_update_worker(worker_id, {"total_payout_received": new_total})
    except Exception:
        pass  # Non-critical update

    return {
        "layer": "payout",
        "worker_id": worker_id,
        "worker_name": worker_name,
        "payout_zencoins": payout_amount,
        "wallet_balance_after": wallet["balance"],
        "event_id": event_id,
        "status": "credited",
    }


# =====================================================================
# ORCHESTRATOR — Runs all 5 layers for an anomaly event
# =====================================================================

def run_aiims_pipeline(anomaly_type: str, zone_id: str,
                       severity: float | None = None,
                       hours_affected: float | None = None,
                       location_name: str | None = None,
                       triggered_by: str = "admin") -> dict[str, Any]:
    """
    Full AIIMS pipeline orchestrator.
    1. Monitoring → 2. Analyzing → 3. Fraud → 4. Decision → 5. Payout
    Returns complete trace for admin dashboard.
    """

    # Layer 1: Monitoring
    monitoring = monitoring_layer(anomaly_type, zone_id, severity, hours_affected, location_name, triggered_by)
    if "error" in monitoring:
        return {"error": monitoring["error"], "layers": {"monitoring": monitoring}}

    event = monitoring["event"]

    # Layer 2: Analyzing
    analysis = analyzing_layer(event)

    if not analysis["eligible_workers"]:
        update_anomaly_event(event["id"], {
            "workers_affected": 0,
            "total_payout": 0,
            "status": "no_eligible_workers",
        })
        return {
            "event": event,
            "layers": {
                "monitoring": monitoring,
                "analyzing": analysis,
            },
            "summary": {
                "workers_affected": 0,
                "total_payout": 0,
                "message": "No subscribed workers found in the affected zone.",
            },
        }

    # Process each worker through layers 3-5
    worker_results = []
    total_payout = 0

    for worker_info in analysis["eligible_workers"]:
        # Layer 3: Fraud (stub)
        fraud = fraud_layer_stub(worker_info, event)
        if not fraud["passed"]:
            worker_results.append({
                "worker_id": worker_info["worker_id"],
                "name": worker_info["name"],
                "fraud": fraud,
                "decision": None,
                "payout": None,
                "status": "fraud_blocked",
            })
            continue

        # Layer 4: Decision
        decision = decision_layer(worker_info, event)

        # Layer 5: Payout
        payout = payout_layer(
            worker_info["worker_id"],
            decision["payout_zencoins"],
            event["id"],
            decision["reason"],
            worker_info["name"],
        )

        # Record in ledger
        create_payout_ledger_entry({
            "event_id": event["id"],
            "worker_id": worker_info["worker_id"],
            "worker_name": worker_info["name"],
            "plan_name": decision["plan_name"],
            "daily_income": decision["daily_income"],
            "severity": event["severity"],
            "hours_affected": decision["hours_affected"],
            "severity_multiplier": decision["severity_multiplier"],
            "plan_multiplier": decision["plan_multiplier"],
            "raw_loss": decision["raw_loss"],
            "payout_zencoins": decision["payout_zencoins"],
            "reason": decision["reason"],
            "layer_trace": {
                "fraud": fraud,
                "decision": decision,
                "payout": payout,
            },
        })

        total_payout += decision["payout_zencoins"]

        worker_results.append({
            "worker_id": worker_info["worker_id"],
            "name": worker_info["name"],
            "plan_name": decision["plan_name"],
            "fraud": fraud,
            "decision": decision,
            "payout": payout,
            "status": "paid",
        })

    # Update the event with totals
    update_anomaly_event(event["id"], {
        "workers_affected": len(worker_results),
        "total_payout": round(total_payout, 2),
    })

    # Refresh event data
    updated_event = get_anomaly_event(event["id"]) or event

    return {
        "event": updated_event,
        "template": monitoring.get("template"),
        "layers": {
            "monitoring": {**monitoring, "event": updated_event},
            "analyzing": analysis,
            "worker_results": worker_results,
        },
        "summary": {
            "workers_affected": len(worker_results),
            "total_payout": round(total_payout, 2),
            "payouts": [
                {
                    "worker_id": r["worker_id"],
                    "name": r["name"],
                    "payout": r["decision"]["payout_zencoins"] if r["decision"] else 0,
                    "status": r["status"],
                }
                for r in worker_results
            ],
            "message": f"AIIMS processed {len(worker_results)} worker(s), total payout: {round(total_payout, 2)} ZC.",
        },
    }
