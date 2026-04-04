from typing import Dict, Literal, Optional

from pydantic import BaseModel, Field

RiskLevel = Literal["Low", "Medium", "High"]
DecisionStatus = Literal["Approved", "Review", "Rejected"]
ScenarioType = Literal["safe_day", "rain_flood", "aqi_spike", "traffic_lock", "zone_restriction"]
LocationZone = Literal[
    "Bangalore", "Hyderabad", "Chennai", "Vijayawada", "Vishakapatnam",
    "Delhi", "Mumbai", "Kolkata", "Agra", "Noida",
    "Pune", "Pondicherry", "Thirpur", "Puri", "Goa",
]
ZONE_ID_MAP = {
    "Bangalore": "bangalore", "Hyderabad": "hyderabad", "Chennai": "chennai",
    "Vijayawada": "vijayawada", "Vishakapatnam": "vishakapatnam",
    "Delhi": "delhi", "Mumbai": "mumbai", "Kolkata": "kolkata",
    "Agra": "agra", "Noida": "noida", "Pune": "pune",
    "Pondicherry": "pondicherry", "Thirpur": "thirpur", "Puri": "puri", "Goa": "goa",
}


class GPSLocation(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    accuracy: Optional[float] = Field(default=None, ge=0)


class WorkerRegistration(BaseModel):
    name: str = Field(..., min_length=2)
    email: Optional[str] = None
    phone: Optional[str] = None
    password: str = Field("demo123", min_length=4)
    verification_code: Optional[str] = None
    location: Optional[GPSLocation] = None
    location_zone: LocationZone = "Hyderabad"
    city: str = "Hyderabad"
    platform: Literal["Swiggy", "Zomato", "Zepto", "Blinkit"] = "Swiggy"
    zone_id: str = "hyderabad"
    avg_daily_income: float = Field(800, gt=0)
    weekly_active_days: int = Field(6, ge=1, le=7)
    on_time_rate: float = Field(0.92, ge=0, le=1)
    consistency_score: float = Field(0.88, ge=0, le=1)
    historic_claims: int = Field(0, ge=0)
    gps_jump_risk: float = Field(0.12, ge=0, le=1)
    ip_mismatch_count: int = Field(0, ge=0)
    activity_spike_score: float = Field(0.10, ge=0, le=1)


class LoginRequest(BaseModel):
    identifier: str = Field(..., min_length=3)
    password: str = Field(..., min_length=4)
    location: Optional[GPSLocation] = None


class QRLoginRequest(BaseModel):
    qr_data: str = Field(..., min_length=12)
    location: Optional[GPSLocation] = None
    scan_method: Literal["uri", "image-upload", "camera-capture"] = "image-upload"
    image_name: Optional[str] = Field(default=None, max_length=140)
    image_analysis_note: Optional[str] = Field(default=None, max_length=280)


class EmailVerificationRequest(BaseModel):
    email: str = Field(..., min_length=5)


class QRRegenerateRequest(BaseModel):
    worker_id: str
    reason: str = "Security refresh"


class PolicyCreate(BaseModel):
    worker_id: str
    plan_name: str = "Basic Weather Shield"
    coverage_hours: int = Field(8, ge=4, le=14)
    max_weekly_payout: float = Field(1400, gt=0)


class ScenarioRequest(BaseModel):
    scenario: ScenarioType = "rain_flood"
    manual_override: Optional[Dict[str, float]] = None


class ClaimCreate(BaseModel):
    worker_id: str
    scenario: ScenarioType = "rain_flood"
    title: str = "Disruption claim"
    notes: str = ""


class SPILRecordInput(BaseModel):
    worker_id: Optional[str] = None
    external_worker_id: str = Field(..., min_length=3)
    name: str = Field(..., min_length=2)
    employer_name: str = Field("Partner Workforce Grid", min_length=2)
    platform: Literal["Swiggy", "Zomato", "Zepto", "Blinkit"] = "Swiggy"
    employment_type: Literal["Gig", "Fleet", "Contract", "Full-time"] = "Gig"
    shift_pattern: str = Field("Peak-hour flexible", min_length=3)
    experience_years: float = Field(1.0, ge=0)
    incident_count: int = Field(0, ge=0)
    attendance_score: float = Field(0.9, ge=0, le=1)
    reliability_score: float = Field(0.88, ge=0, le=1)
    risk_band: RiskLevel = "Medium"
    notes: str = ""
    avg_working_hours_per_week: float = Field(40.0, ge=0, le=168)
    rating: float = Field(4.5, ge=0, le=5)
    location_latitude: float = Field(..., ge=-90, le=90)
    location_longitude: float = Field(..., ge=-180, le=180)
    location_risk_score: float = Field(0.5, ge=0, le=1)
    location_name: str = Field(..., min_length=2)
    salary_per_week: float = Field(6000.0, gt=0)
    deliveries_per_week: int = Field(60, ge=0)
    night_shift_percentage: float = Field(0.2, ge=0, le=1)
    safety_behavior_score: float = Field(0.85, ge=0, le=1)
    platform_tenure_years: float = Field(1.5, ge=0)
    fraud_flag: bool = Field(False)
    insurance_claimed_count: int = Field(0, ge=0)


class SPILConnectRequest(BaseModel):
    worker_id: str


class AdminLoginRequest(BaseModel):
    email: str = Field(..., min_length=5)
    password: str = Field(..., min_length=4)


class PremiumCalculationResult(BaseModel):
    risk_level: RiskLevel
    risk_score: float
    weekly_premium: float
    pricing_breakdown: Dict
    explanation: str


class CheckoutRequest(BaseModel):
    worker_id: str
    plan_name: str
    external_plan_id: str


class PaymentVerification(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class PolicyActionRequest(BaseModel):
    worker_id: str
    plan_id: Optional[str] = None
    ip_address: Optional[str] = None


AnomalyType = Literal[
    "heavy_rainfall", "extreme_heat", "high_aqi",
    "flooding", "curfew", "strike", "zone_closure",
]


class AnomalyTriggerRequest(BaseModel):
    anomaly_type: AnomalyType
    zone_id: str = "hyderabad"
    severity: Optional[float] = Field(default=None, ge=0, le=1)
    hours_affected: Optional[float] = Field(default=None, ge=0.5, le=24)
    location_name: Optional[str] = None


class AutoSubscriptionRequest(BaseModel):
    worker_id: str
    plan_id: str = "basic"
    enabled: bool = True

