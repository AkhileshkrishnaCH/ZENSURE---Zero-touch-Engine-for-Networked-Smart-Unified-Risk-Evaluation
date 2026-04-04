def detect_parametric_triggers(worker: dict, scenario: dict) -> dict:
    triggers = []

    if scenario["rainfall_mm"] >= 60 and scenario["order_drop"] >= 0.25:
        triggers.append("Rainfall + delivery drop")

    if scenario["aqi"] >= 220 and scenario["activity_drop"] >= 0.20:
        triggers.append("AQI spike + reduced activity")

    if scenario["traffic_index"] >= 0.80 and scenario["order_drop"] >= 0.20:
        triggers.append("Traffic slowdown + fewer deliveries")

    if scenario["restriction_level"] >= 2 and scenario["order_drop"] >= 0.80:
        triggers.append("Zone restriction + zero/near-zero orders")

    disruption_strength = min(
        1,
        (scenario["order_drop"] * 0.45)
        + (scenario["activity_drop"] * 0.25)
        + (scenario["hours_lost"] / 8 * 0.30),
    )

    estimated_income_loss = round(worker["avg_daily_income"] * disruption_strength, 2)
    recommended_payout = round(estimated_income_loss * 0.82, 2)

    return {
        "triggered": bool(triggers),
        "matched_triggers": triggers,
        "confidence": round(scenario["confidence"], 2),
        "disruption_strength": round(disruption_strength, 2),
        "estimated_income_loss": estimated_income_loss,
        "recommended_payout": recommended_payout,
    }
