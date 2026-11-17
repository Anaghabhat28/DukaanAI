# DukaanAI — Smart Shop Accounting & Voice AI Platform

## Features
- **100% User-Driven Store Setup**: Shopkeeper enters their own store name, owner name, and opening cash drawer balance.
- **Voice-to-Transaction Conversion**: Uses browser Web Speech API (`en-IN`) + Google Gemini API (`gemini-2.5-flash`) to convert spoken sales, Udhaar/credit entries, and expenses directly into SQLite records.
- **Live Financial Calculations**: Real-time computation of Today's Sales, Cash & UPI Received, Udhaar Pending, Cash Drawer Balance, Net Profit, and 7-Day Cash-Flow Forecast.
- **Complete Modules**: Dashboard, Sales (Manual & Inventory), Udhaar Book (Customer Credit Ledger), Expenses, Inventory, Reports, and DukaanAI Assistant.

## Setup & Run

### 1. Backend (Python FastAPI + SQLite + Gemini API)
```bash
cd dukaanai/backend
pip install -r requirements.txt
cp .env.example .env   # Add your GEMINI_API_KEY inside .env
uvicorn main:app --reload --port 8000
```

### 2. Frontend (React + Vite)
```bash
cd dukaanai/frontend
npm install
npm run dev
```
Open `http://localhost:5173` in Chrome/Edge to use the dashboard and microphone voice entry.
