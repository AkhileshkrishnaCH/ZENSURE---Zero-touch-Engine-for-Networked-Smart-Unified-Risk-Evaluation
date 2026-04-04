def evaluate_trustshield(worker: dict, scenario: dict) -> dict:
    fraud_score = 0
    reasons = []

    if worker["gps_jump_risk"] > 0.55:
        fraud_score += 35
        reasons.append("GPS jump pattern is unusually high")

    if worker["ip_mismatch_count"] >= 2:
        fraud_score += 25
        reasons.append("Repeated IP mismatches detected")

    if worker["activity_spike_score"] > 0.65:
        fraud_score += 20
        reasons.append("Abnormal activity spike versus historic baseline")

    if worker["historic_claims"] >= 4:
        fraud_score += 15
        reasons.append("High repeat-claim frequency")

    if scenario.get("restriction_level", 0) == 0 and scenario.get("order_drop", 0) > 0.85:
        fraud_score += 10
        reasons.append("Claimed loss is higher than signal severity suggests")

    if fraud_score >= 60:
        status = "Rejected"
    elif fraud_score >= 30:
        status = "Review"
    else:
        status = "Approved"
        reasons.append("No meaningful anomaly found across TrustShield checks")

    return {
        "status": status,
        "fraud_score": min(fraud_score, 100),
        "reasons": reasons,
    }
