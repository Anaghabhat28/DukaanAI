# 🏪 DukaanAI – AI-Powered Digital Business Assistant

DukaanAI is an AI-powered digital business management platform designed to help small shop owners manage their daily business activities more efficiently.

It brings essential business operations such as sales tracking, inventory management, customer records, expense tracking, financial reporting, and AI-powered assistance into one platform.

The platform combines digital record-keeping with voice-based interaction and intelligent financial insights to make everyday shop management easier and more accessible.

## ✨ Features

- **User-Driven Store Setup:** Shopkeepers can enter their own store name, owner name, and opening cash drawer balance.
- **Dashboard:** View important business information and daily financial performance.
- **Sales Management:** Record and monitor daily sales through manual entry and inventory-based sales.
- **Voice-to-Transaction Conversion:** Convert spoken sales, Udhaar/credit entries, and expenses into transaction records using the browser Web Speech API (`en-IN`) and Google Gemini.
- **Inventory Management:** Manage products, product details, stock quantities, and inventory information.
- **Customer Management:** Maintain customer records and track credit transactions through the Udhaar Book.
- **Expense Tracking:** Record and monitor daily business expenses.
- **Live Financial Calculations:** View Today's Sales, Cash & UPI Received, Udhaar Pending, Cash Drawer Balance, and Net Profit.
- **Cash-Flow Forecast:** View a 7-day cash-flow forecast to understand expected financial activity.
- **Financial Reports:** Analyze sales, expenses, and business performance.
- **Data Visualization:** Interactive financial charts and dashboard visualizations using Recharts.
- **DukaanAI Assistant:** Get AI-powered answers and useful business insights based on available shop data.

## 🤖 AI Integration

DukaanAI integrates **Google Gemini 2.5 Flash** to provide intelligent business assistance.

The AI assistant can:

- Answer financial and business-related questions.
- Analyze available shop data.
- Provide insights based on sales, expenses, customers, and products.
- Convert voice-based business entries into structured transaction information.

**AI Model:** Gemini 2.5 Flash (`gemini-2.5-flash`)  
**API:** Google Gemini API  
**Python SDK:** `google-genai`

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| Frontend | React.js, Vite, JavaScript, CSS |
| Data Visualization | Recharts |
| Backend | Python, FastAPI |
| Database | SQLite |
| AI Integration | Google Gemini 2.5 Flash |
| Voice Input | Browser Web Speech API |
| API Communication | REST API |
| Development Tools | VS Code, Git, GitHub |

## 📂 Project Structure

```text
DukaanAI/
│
├── README.md
├── .gitignore
│
└── dukaanai/
    │
    ├── backend/
    │   ├── main.py
    │   ├── requirements.txt
    │   ├── .env.example
    │   └── ...
    │
    └── frontend/
        ├── src/
        │   ├── App.jsx
        │   ├── api.js
        │   ├── index.css
        │   └── ...
        ├── public/
        ├── package.json
        ├── package-lock.json
        └── index.html
```

## 🚀 How to Run the Project

### Prerequisites

- Python 3.10 or above
- Node.js and npm
- Google Gemini API key ([Get your API key from Google AI Studio](https://aistudio.google.com/))
- Git

### 1. Clone the Repository

Open PowerShell:

```powershell
git clone https://github.com/Anaghabhat28/DukaanAI.git
cd DukaanAI
```

### 2. Set Up the Backend

Open Terminal 1 (PowerShell):

```powershell
cd dukaanai\backend

python -m venv .venv

.venv\Scripts\activate

pip install -r requirements.txt
```

Create a `.env` file from `.env.example` if it does not already exist:

```powershell
Copy-Item .env.example .env
```

Open the `.env` file and add your Gemini API key:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

Start the backend server:

```powershell
uvicorn main:app --reload --port 8000
```

**Backend URL:** `http://127.0.0.1:8000`

**API Documentation:** `http://127.0.0.1:8000/docs`

### 3. Set Up the Frontend

Open a second terminal (PowerShell):

```powershell
cd dukaanai\frontend

npm install

npm run dev
```

Open the URL displayed in the terminal (usually `http://localhost:5173`) in Chrome or Edge.

**Note:** `npm install` automatically installs all frontend dependencies listed in `package.json`, including Recharts. You do not need to install Recharts separately.

## 🔐 Environment Variables

The backend uses environment variables to protect sensitive information.

Create a `.env` file inside the `dukaanai/backend/` directory and add:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

- Never upload your actual `.env` file or expose your Gemini API key.
- Keep your `.env.example` file for other developers to understand the required configuration.
- Ensure `.env` is included in `.gitignore`.

## 🎯 Project Objective

The main objective of DukaanAI is to simplify business management for small shop owners by combining digital record-keeping with AI-powered assistance.

It aims to make everyday business operations easier, more organized, and more accessible through a single platform.

## 👥 Team Members

This project is collaboratively developed by:

1. **J. Anagha Bhat**  
   GitHub: [@Anaghabhat28](https://github.com/Anaghabhat28)

2. **Janani N**  
   GitHub: [@jananigowda18](https://github.com/jananigowda18)

---

**DukaanAI – Smarter Business Management, Powered by AI.**
