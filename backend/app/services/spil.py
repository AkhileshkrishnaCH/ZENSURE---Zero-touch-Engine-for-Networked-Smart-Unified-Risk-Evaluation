from __future__ import annotations

from typing import Any

from app.services.auth_engine import utc_now


def build_default_spil_record(worker: dict[str, Any]) -> dict[str, Any]:
    attendance_score = round(
        min(
            0.99,
            max(
                0.6,
                worker.get("weekly_active_days", 6) / 7 * 0.45
                + worker.get("on_time_rate", 0.88) * 0.55,
            ),
        ),
        2,
    )
    reliability_score = round(
        min(
            0.99,
            max(
                0.58,
                worker.get("consistency_score", 0.84) * 0.6
                + worker.get("on_time_rate", 0.88) * 0.4,
            ),
        ),
        2,
    )
    incident_count = int(worker.get("historic_claims", 0))

    if incident_count == 0 and reliability_score >= 0.9:
        risk_band = "Low"
    elif incident_count <= 2 and reliability_score >= 0.8:
        risk_band = "Medium"
    else:
        risk_band = "High"

    return {
        "id": f"spil-{worker['id']}",
        "worker_id": worker.get("id"),
        "external_worker_id": worker.get("phone") or worker.get("email") or worker.get("id"),
        "name": worker.get("name", "Worker"),
        "source_system": "SPIL",
        "platform": worker.get("platform", "Swiggy"),
        "employer_name": f"{worker.get('platform', 'Platform')} Operations Grid",
        "employment_type": "Gig",
        "shift_pattern": "Peak-hour flexible",
        "experience_years": round(max(0.5, worker.get("weekly_active_days", 6) / 2.4), 1),
        "incident_count": incident_count,
        "attendance_score": attendance_score,
        "reliability_score": reliability_score,
        "risk_band": risk_band,
        "notes": "Auto-synced from the ZENSURE worker registry.",
        "avg_working_hours_per_week": float(worker.get("weekly_active_days", 6) * 7),
        "rating": 4.5,
        "location_latitude": worker.get("last_login_latitude") or 17.3850,
        "location_longitude": worker.get("last_login_longitude") or 78.4867,
        "location_risk_score": worker.get("gps_jump_risk") or 0.12,
        "location_name": worker.get("city", "Hyderabad"),
        "salary_per_week": (worker.get("avg_daily_income") or 800) * 6,
        "deliveries_per_week": 60,
        "night_shift_percentage": 0.2,
        "safety_behavior_score": worker.get("on_time_rate") or 0.88,
        "platform_tenure_years": 1.5,
        "fraud_flag": 0,
        "insurance_claimed_count": incident_count,
        "status": "pending",
        "last_synced_at": utc_now(),
    }


def calculate_spil_adjustment(record: dict[str, Any] | None) -> dict[str, Any]:
    if not record:
        return {
            "net_adjustment": 0,
            "attendance_bonus": 0,
            "reliability_bonus": 0,
            "incident_surcharge": 0,
            "band_adjustment": 0,
            "summary": "No SPIL record linked yet, so pricing uses the core worker profile only.",
        }

    attendance_bonus = round(float(record.get("attendance_score", 0.8)) * 2)
    reliability_bonus = round(float(record.get("reliability_score", 0.8)) * 2)
    incident_surcharge = min(int(record.get("incident_count", 0)) * 2, 6)

    risk_band = str(record.get("risk_band", "Medium"))
    if risk_band == "Low":
        band_adjustment = -1
    elif risk_band == "High":
        band_adjustment = 2
    else:
        band_adjustment = 0

    net_adjustment = incident_surcharge + band_adjustment - attendance_bonus - reliability_bonus

    direction = "discount" if net_adjustment < 0 else "surcharge" if net_adjustment > 0 else "neutral"
    summary = (
        f"SPIL marked the worker as {risk_band.lower()} risk with attendance {round(float(record.get('attendance_score', 0)) * 100)}% "
        f"and reliability {round(float(record.get('reliability_score', 0)) * 100)}%, creating a {direction} impact of INR {abs(net_adjustment)}."
    )

    return {
        "net_adjustment": net_adjustment,
        "attendance_bonus": attendance_bonus,
        "reliability_bonus": reliability_bonus,
        "incident_surcharge": incident_surcharge,
        "band_adjustment": band_adjustment,
        "summary": summary,
    }
