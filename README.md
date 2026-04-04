# ZENSURE — Zero-touch Engine for Networked Smart Unified Risk Evaluation

ZENSURE is an AI-powered gig worker insurance platform that provides real-time risk evaluation, automated claim processing, and seamless policy management for India's gig economy workforce.

## 🏗️ Architecture

| Component | Technology | Hosting |
|-----------|-----------|---------|
| **Frontend** | React 19 + Vite + TailwindCSS 4 | Vercel |
| **Backend** | FastAPI + SQLite | Render |
| **AI Engine** | AIIMS (5-layer pipeline) | Integrated |

## ✨ Key Features

- **AIIMS Engine** — 5-layer AI pipeline (Monitor → Analyze → Fraud Detection → Decision → Payout)
- **SPIL Integration** — Smart Platform Integration Layer for gig worker profile management
- **ZenCoins Wallet** — Digital currency system for premium payments and claim payouts
- **TrustShield** — Worker identity verification with QR-based login + GPS validation
- **Auto-Subscription** — Automatic weekly policy renewal system
- **Real-time Claims** — Scenario-based disruption simulation and automated claim evaluation

## 🚀 Quick Start (Local Development)

### Prerequisites
- Python 3.11+
- Node.js 18+
- npm

### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate     # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies API requests to the backend at `http://localhost:8000`.

## 📁 Project Structure

```
ZENSURE/
├── backend/
│   ├── app/
│   │   ├── data/          # Mock data and templates
│   │   ├── services/      # Core business logic
│   │   │   ├── aiims.py           # AIIMS 5-layer engine
│   │   │   ├── auth_engine.py     # Authentication & QR login
│   │   │   ├── database.py        # SQLite database layer
│   │   │   ├── premium_engine.py  # Premium calculation
│   │   │   └── ...
│   │   ├── main.py        # FastAPI application & routes
│   │   └── models.py      # Pydantic models
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/         # React page components
│   │   │   ├── LoginPage.jsx
│   │   │   ├── DashboardPage.jsx
│   │   │   ├── SPILIntegrationPage.jsx
│   │   │   ├── WalletPage.jsx
│   │   │   └── AIIMSEnginePage.jsx
│   │   ├── App.jsx        # Root component & routing
│   │   └── main.jsx       # Entry point
│   ├── package.json
│   └── vite.config.js
└── README.md
```

## 🔐 Admin Access

Default admin credentials (for demo):
- **Email**: admin@gmail.com
- **Password**: adminxyz

## 📄 License

This project is built for educational and demonstration purposes.
