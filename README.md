# 🏪 DukaanAI – AI-Powered Digital Business Assistant

DukaanAI is an AI-powered digital business management platform designed to help small shop owners manage their daily business activities more efficiently.

It brings essential business operations such as sales tracking, inventory management, customer records, expense tracking, and AI-powered financial assistance into one platform.

## ✨ Features

- **Dashboard:** View important business information and daily performance.
- **Sales Management:** Record and monitor daily sales.
- **Inventory Management:** Manage product details and stock information.
- **Customer Management:** Maintain customer records and track credit (Udhaar).
- **Expense Tracking:** Record and monitor business expenses.
- **Financial Reports:** Understand sales, expenses, and profit.
- **AI Business Assistant:** Ask business-related questions and receive intelligent responses using Google Gemini.
- **Voice-Based Input:** Make business operations easier through voice-based interaction.

## 🤖 AI Integration

DukaanAI uses **Google Gemini 2.5 Flash** to provide intelligent business assistance.

The AI assistant can:
- Answer financial and business-related questions.
- Analyze available shop data.
- Provide useful insights based on sales, expenses, customers, and products.

**AI Model:** Gemini 2.5 Flash  
**API:** Google Gemini API  
**Python SDK:** `google-genai`

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| Frontend | React.js, Vite, JavaScript, CSS |
| Backend | Python, FastAPI |
| Database | SQLite |
| AI Integration | Google Gemini 2.5 Flash |
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
    ├── backend/
    │   ├── main.py
    │   ├── requirements.txt
    │   └── .env.example
    │
    └── frontend/
        ├── src/
        ├── public/
        ├── package.json
        └── index.html
```

## 🚀 How to Run the Project

### 1. Clone the Repository

```bash
git clone https://github.com/Anaghabhat28/DukaanAI.git
cd DukaanAI
```

### 2. Set Up the Backend

```bash
cd dukaanai/backend
```

Create and activate a virtual environment:

```bash
python -m venv .venv
.venv\Scripts\activate
```

Install the required dependencies:

```bash
pip install -r requirements.txt
```

Create a `.env` file inside the backend folder and add your Gemini API key:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

Start the backend server:

```bash
uvicorn main:app --reload --port 8000
```

Backend API documentation:

`http://127.0.0.1:8000/docs`

### 3. Set Up the Frontend

Open another terminal:

```bash
cd dukaanai/frontend
```

Install dependencies:

```bash
npm install
```

Start the frontend:

```bash
npm run dev
```

Open the application:

`http://localhost:5173`

## 🔐 Environment Variables

The project uses environment variables to protect sensitive information.

Create a `.env` file in the backend folder:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

Never upload your actual API key or `.env` file to GitHub.

## 🎯 Project Objective

The main objective of DukaanAI is to simplify business management for small shop owners by combining digital record-keeping with AI-powered assistance.

It aims to make everyday business operations easier, more organized, and more accessible through a single platform.

## 👥 Team Members

**This project is collaboratively developed by:**

1. **J. Anagha Bhat**  
   GitHub: [@Anaghabhat28](https://github.com/Anaghabhat28)

2. **Janani N**  
   GitHub: [@jananigowda18](https://github.com/jananigowda18)

---

**DukaanAI – Smarter Business Management, Powered by AI.**
