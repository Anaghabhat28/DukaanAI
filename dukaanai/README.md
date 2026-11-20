# DukaanAI — Smart Shop Accounting & Voice AI Platform

## Features

- **100% User-Driven Store Setup**: Shopkeeper enters their own store name, owner name, and opening cash drawer balance.
- **Voice-to-Transaction Conversion**: Uses browser Web Speech API (`en-IN`) + Google Gemini API (`gemini-2.5-flash`) to convert spoken sales, Udhaar/credit entries, and expenses directly into SQLite records.
- **Live Financial Calculations**: Real-time computation of Today's Sales, Cash & UPI Received, Udhaar Pending, Cash Drawer Balance, Net Profit, and 7-Day Cash-Flow Forecast.
- **Complete Modules**: Dashboard, Sales (Manual & Inventory), Udhaar Book (Customer Credit Ledger), Expenses, Inventory, Reports, and DukaanAI Assistant.
- **Data Visualization**: Uses Recharts to display financial data and dashboard charts.

## Tech Stack

- **Frontend**: React, Vite, JavaScript, CSS, Recharts
- **Backend**: Python, FastAPI
- **Database**: SQLite
- **AI Integration**: Google Gemini API (`gemini-2.5-flash`)
- **Voice Input**: Browser Web Speech API (`en-IN`)

## Setup & Run

### Prerequisites

- Python 3.10+
- Node.js and npm
- Google Gemini API key ([Get one from Google AI Studio](https://aistudio.google.com/))

### 1. Backend (Python FastAPI + SQLite + Gemini API)

Open Terminal 1 (PowerShell):

```powershell
cd dukaanai\backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Create `.env` from `.env.example` only if it does not already exist:

```powershell
Copy-Item .env.example .env
```

Add your Gemini API key to the `.env` file:

```env
GEMINI_API_KEY=your_actual_api_key
```

Run the backend:

```powershell
uvicorn main:app --reload --port 8000
```

Backend runs at: `http://127.0.0.1:8000`

### 2. Frontend (React + Vite)

Open a **second terminal** (PowerShell):

```powershell
cd dukaanai\frontend
npm install
npm run dev
```

Open the URL displayed in the terminal (usually `http://localhost:5173`) in Chrome or Edge to use the dashboard and microphone voice entry.

**Note:** `npm install` automatically installs all dependencies listed in `package.json`, including Recharts. You do not need to install Recharts separately.

## Important

- Keep the backend and frontend terminals running while using the application.
- Do not share your `.env` file or publish your Gemini API key.
- Allow microphone access in your browser for voice-based transaction entry.
