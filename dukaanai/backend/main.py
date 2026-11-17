import os
import re
import json
import sqlite3
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

try:
    from google import genai
except ImportError:
    genai = None

app = FastAPI(title="DukaanAI — Smart Shop Accounting & Voice AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "dukaanai.db"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    cur = conn.cursor()

    cur.executescript("""
    CREATE TABLE IF NOT EXISTS shop_status (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        shop_name TEXT NOT NULL DEFAULT '',
        owner_name TEXT NOT NULL DEFAULT '',
        is_open INTEGER NOT NULL DEFAULT 1,
        opening_cash REAL NOT NULL DEFAULT 0,
        is_configured INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        unit TEXT NOT NULL,
        price REAL NOT NULL,
        stock INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        total_credit REAL NOT NULL DEFAULT 0,
        paid REAL NOT NULL DEFAULT 0,
        due_date TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tx_type TEXT NOT NULL, -- 'sale', 'credit_payment', 'expense'
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        payment_method TEXT NOT NULL, -- 'Cash', 'UPI', 'Credit'
        amount REAL NOT NULL,
        customer_id INTEGER,
        tx_date TEXT NOT NULL,
        tx_time TEXT NOT NULL
    );
    """)

    cur.execute("SELECT COUNT(*) FROM shop_status")
    if cur.fetchone()[0] == 0:
        cur.execute(
            "INSERT INTO shop_status (id, shop_name, owner_name, is_open, opening_cash, is_configured) VALUES (1, '', '', 1, 0, 0)"
        )

    conn.commit()
    conn.close()


init_db()


# --- Pydantic Models ---
class SetupStoreRequest(BaseModel):
    shop_name: str
    owner_name: str
    opening_cash: float = 0.0


class SaleItem(BaseModel):
    product_id: Optional[int] = None
    custom_name: Optional[str] = None
    quantity: int = 1
    unit_price: float


class CreateSaleRequest(BaseModel):
    items: List[SaleItem]
    payment_method: str
    customer_id: Optional[int] = None
    due_date: Optional[str] = ""


class CreateCustomerRequest(BaseModel):
    name: str
    phone: str
    initial_credit: float = 0.0
    due_date: str = ""


class CreditPaymentRequest(BaseModel):
    amount: float
    payment_method: str = "Cash"


class CreateExpenseRequest(BaseModel):
    title: str
    category: str
    amount: float
    payment_method: str = "Cash"


class CreateProductRequest(BaseModel):
    name: str
    unit: str
    price: float
    stock: int


class ChatRequest(BaseModel):
    message: str


class VoiceTransactionRequest(BaseModel):
    transcript: str
    auto_save: bool = True


# --- Helper: Gemini AI Client ---
def get_gemini_client():
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if api_key and api_key != "your_gemini_api_key_here" and genai is not None:
        return genai.Client(api_key=api_key)
    return None


def parse_voice_with_fallback(transcript: str, products: list, customers: list) -> dict:
    """
    Uses Gemini API when GEMINI_API_KEY is configured, with a deterministic NLP parser
    fallback so voice-to-transaction conversion works immediately out of the box.
    """
    client = get_gemini_client()
    product_names = [f"{p['name']} (₹{p['price']}/{p['unit']})" for p in products]
    customer_names = [c["name"] for c in customers]

    if client:
        prompt = f"""
        You are an accounting parser for an Indian retail shop (DukaanAI).
        Convert the shopkeeper's spoken sentence into strict JSON.
        Available products: {product_names}
        Available customers: {customer_names}
        Spoken sentence: "{transcript}"

        Return ONLY valid JSON with keys:
        {{
          "tx_type": "sale" | "expense" | "credit_payment",
          "title": "short description",
          "category": "Groceries" | "Electricity" | "Rent" | "Udhaar Recovery" | "Others",
          "payment_method": "Cash" | "UPI" | "Credit",
          "amount": number,
          "quantity": integer,
          "product_name": string or null,
          "customer_name": string or null
        }}
        """
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
            )
            raw = response.text.strip()
            raw = re.sub(r"^```json|```$", "", raw, flags=re.MULTILINE).strip()
            return json.loads(raw)
        except Exception:
            pass

    # Deterministic rule-based fallback parser
    text = transcript.lower().strip()
    amount_match = re.search(r"(?:₹|rs\.?|rupees)?\s*(\d+(?:\.\d+)?)", text)
    qty_match = re.search(r"(\d+)\s*(?:kg|kilo|packet|packets|litre|liter|l|pcs|pieces|unit|units|x)", text)

    qty = int(qty_match.group(1)) if qty_match else 1
    extracted_amount = float(amount_match.group(1)) if amount_match else 0.0

    # Payment method
    if "upi" in text or "gpay" in text or "phonepe" in text or "online" in text or "paytm" in text:
        pay_method = "UPI"
    elif "credit" in text or "udhaar" in text or "udhar" in text or "khata" in text:
        pay_method = "Credit"
    else:
        pay_method = "Cash"

    # Match customer
    matched_cust = None
    for c in customers:
        if c["name"].lower() in text:
            matched_cust = c["name"]
            break

    # Match product
    matched_prod = None
    for p in products:
        if p["name"].lower() in text:
            matched_prod = p
            break

    # Determine transaction type
    if any(w in text for w in ["expense", "paid for", "electricity", "bill", "rent", "transport", "salary", "repair", "spent"]):
        cat = "Electricity" if "electricity" in text or "power" in text else ("Rent" if "rent" in text else "Others")
        return {
            "tx_type": "expense",
            "title": transcript.strip().capitalize(),
            "category": cat,
            "payment_method": pay_method if pay_method != "Credit" else "Cash",
            "amount": extracted_amount,
            "quantity": 1,
            "product_name": None,
            "customer_name": None,
        }

    if any(w in text for w in ["received from", "settled", "cleared", "paid back", "udhaar paid", "udhar paid"]):
        return {
            "tx_type": "credit_payment",
            "title": f"{matched_cust or 'Customer'} - Udhaar Paid",
            "category": "Udhaar Recovery",
            "payment_method": pay_method if pay_method != "Credit" else "Cash",
            "amount": extracted_amount,
            "quantity": 1,
            "product_name": None,
            "customer_name": matched_cust,
        }

    # Default: Sale
    if matched_prod:
        final_amt = extracted_amount if (extracted_amount > 0 and not qty_match) else (matched_prod["price"] * qty)
        if extracted_amount > 0 and qty_match and extracted_amount != qty:
            final_amt = extracted_amount
        title = f"{matched_cust} - Credit" if (pay_method == "Credit" and matched_cust) else f"{pay_method} Sale - {matched_prod['name']} x{qty}"
        return {
            "tx_type": "sale",
            "title": title,
            "category": "Groceries",
            "payment_method": pay_method,
            "amount": final_amt,
            "quantity": qty,
            "product_name": matched_prod["name"],
            "customer_name": matched_cust,
        }

    title = f"{matched_cust} - Credit" if (pay_method == "Credit" and matched_cust) else f"{pay_method} Sale - {transcript.strip().capitalize()}"
    return {
        "tx_type": "sale",
        "title": title,
        "category": "Groceries",
        "payment_method": pay_method,
        "amount": extracted_amount,
        "quantity": qty,
        "product_name": None,
        "customer_name": matched_cust,
    }


def execute_parsed_transaction(parsed: dict) -> dict:
    amount = float(parsed.get("amount") or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Could not detect a valid ₹ amount from voice input. Please mention the amount.")

    conn = get_db()
    cur = conn.cursor()
    now = datetime.now()
    tx_date = now.strftime("%Y-%m-%d")
    tx_time = now.strftime("%I:%M %p")

    tx_type = parsed.get("tx_type", "sale")
    pay_method = parsed.get("payment_method", "Cash")
    cust_name = parsed.get("customer_name")
    prod_name = parsed.get("product_name")
    qty = int(parsed.get("quantity") or 1)

    customer_id = None
    if cust_name:
        row = cur.execute("SELECT id, total_credit, paid, due_date FROM customers WHERE LOWER(name) = LOWER(?)", (cust_name,)).fetchone()
        if row:
            customer_id = row["id"]
        elif tx_type == "sale" and pay_method == "Credit":
            # Automatically create customer if spoken during a Credit sale
            cur.execute(
                "INSERT INTO customers (name, phone, total_credit, paid, due_date) VALUES (?, '', 0, 0, ?)",
                (cust_name.title(), (now + timedelta(days=7)).strftime("%d %b")),
            )
            customer_id = cur.lastrowid

    if tx_type == "sale":
        if prod_name:
            prow = cur.execute("SELECT id, stock FROM products WHERE LOWER(name) = LOWER(?)", (prod_name,)).fetchone()
            if prow:
                cur.execute("UPDATE products SET stock = ? WHERE id = ?", (max(0, prow["stock"] - qty), prow["id"]))

        if pay_method == "Credit":
            if not customer_id:
                conn.close()
                raise HTTPException(status_code=400, detail="For a Credit/Udhaar voice sale, please say the customer's name.")
            due_str = (now + timedelta(days=7)).strftime("%d %b")
            cur.execute(
                "UPDATE customers SET total_credit = total_credit + ?, due_date = ? WHERE id = ?",
                (amount, due_str, customer_id),
            )

        cur.execute(
            """INSERT INTO transactions (tx_type, title, category, payment_method, amount, customer_id, tx_date, tx_time)
               VALUES ('sale', ?, ?, ?, ?, ?, ?, ?)""",
            (parsed.get("title", "Voice Sale"), parsed.get("category", "Groceries"), pay_method, amount, customer_id, tx_date, tx_time),
        )

    elif tx_type == "credit_payment":
        if not customer_id:
            conn.close()
            raise HTTPException(status_code=400, detail="Please mention which customer paid back their Udhaar.")
        crow = cur.execute("SELECT total_credit, paid, due_date FROM customers WHERE id = ?", (customer_id,)).fetchone()
        bal = max(0, crow["total_credit"] - crow["paid"])
        applied = min(bal, amount) if bal > 0 else amount
        new_paid = crow["paid"] + applied
        new_due = "-" if (crow["total_credit"] - new_paid) <= 0 else crow["due_date"]
        cur.execute("UPDATE customers SET paid = ?, due_date = ? WHERE id = ?", (new_paid, new_due, customer_id))
        cur.execute(
            """INSERT INTO transactions (tx_type, title, category, payment_method, amount, customer_id, tx_date, tx_time)
               VALUES ('credit_payment', ?, 'Udhaar Recovery', ?, ?, ?, ?, ?)""",
            (parsed.get("title", f"{cust_name} - Udhaar Paid"), pay_method, applied, customer_id, tx_date, tx_time),
        )

    elif tx_type == "expense":
        cur.execute(
            """INSERT INTO transactions (tx_type, title, category, payment_method, amount, customer_id, tx_date, tx_time)
               VALUES ('expense', ?, ?, ?, ?, NULL, ?, ?)""",
            (parsed.get("title", "Voice Expense"), parsed.get("category", "Others"), pay_method, amount, tx_date, tx_time),
        )

    conn.commit()
    conn.close()
    return parsed


# --- API Routes ---
@app.get("/api/shop")
def get_shop():
    conn = get_db()
    shop = dict(conn.execute("SELECT * FROM shop_status WHERE id = 1").fetchone())
    conn.close()
    return shop


@app.post("/api/shop/setup")
def setup_shop(payload: SetupStoreRequest):
    if not payload.shop_name.strip() or not payload.owner_name.strip():
        raise HTTPException(status_code=400, detail="Shop name and owner name are required")
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """UPDATE shop_status
           SET shop_name = ?, owner_name = ?, opening_cash = ?, is_open = 1, is_configured = 1
           WHERE id = 1""",
        (payload.shop_name.strip(), payload.owner_name.strip(), payload.opening_cash),
    )
    conn.commit()
    shop = dict(cur.execute("SELECT * FROM shop_status WHERE id = 1").fetchone())
    conn.close()
    return shop


@app.post("/api/shop/reset")
def reset_all_data():
    conn = get_db()
    cur = conn.cursor()
    cur.executescript("""
        DELETE FROM transactions;
        DELETE FROM customers;
        DELETE FROM products;
        UPDATE shop_status SET shop_name = '', owner_name = '', is_open = 1, opening_cash = 0, is_configured = 0 WHERE id = 1;
    """)
    conn.commit()
    conn.close()
    return {"status": "reset"}


@app.post("/api/shop/toggle")
def toggle_shop():
    conn = get_db()
    cur = conn.cursor()
    current = cur.execute("SELECT is_open FROM shop_status WHERE id = 1").fetchone()["is_open"]
    new_state = 0 if current == 1 else 1
    cur.execute("UPDATE shop_status SET is_open = ? WHERE id = 1", (new_state,))
    conn.commit()
    conn.close()
    return {"is_open": bool(new_state)}


@app.get("/api/dashboard")
def get_dashboard():
    conn = get_db()
    cur = conn.cursor()
    today = datetime.now().strftime("%Y-%m-%d")

    shop = dict(cur.execute("SELECT * FROM shop_status WHERE id = 1").fetchone())

    # Financial Calculations
    todays_sales = cur.execute(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE tx_type = 'sale' AND tx_date = ?",
        (today,),
    ).fetchone()["total"]

    cash_received = cur.execute(
        """SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
           WHERE ((tx_type = 'sale' AND payment_method IN ('Cash', 'UPI')) OR tx_type = 'credit_payment')
           AND tx_date = ?""",
        (today,),
    ).fetchone()["total"]

    all_cash_in = cur.execute(
        """SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
           WHERE (tx_type = 'sale' AND payment_method IN ('Cash', 'UPI')) OR tx_type = 'credit_payment'"""
    ).fetchone()["total"]

    all_expenses = cur.execute(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE tx_type = 'expense'"
    ).fetchone()["total"]

    udhaar_pending = cur.execute(
        "SELECT COALESCE(SUM(total_credit - paid), 0) AS pending FROM customers"
    ).fetchone()["pending"]

    todays_expenses = cur.execute(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE tx_type = 'expense' AND tx_date = ?",
        (today,),
    ).fetchone()["total"]

    cash_balance = shop["opening_cash"] + all_cash_in - all_expenses
    net_profit = todays_sales - todays_expenses

    # 7-day chart & Cash-flow prediction calculation
    day_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    chart_data = []
    active_sales_days = []
    active_expense_days = []

    for i in range(6, -1, -1):
        d = datetime.now() - timedelta(days=i)
        d_str = d.strftime("%Y-%m-%d")
        s_val = cur.execute(
            "SELECT COALESCE(SUM(amount), 0) AS s FROM transactions WHERE tx_type = 'sale' AND tx_date = ?",
            (d_str,),
        ).fetchone()["s"]
        e_val = cur.execute(
            "SELECT COALESCE(SUM(amount), 0) AS e FROM transactions WHERE tx_type = 'expense' AND tx_date = ?",
            (d_str,),
        ).fetchone()["e"]
        if s_val > 0:
            active_sales_days.append(s_val)
        if e_val > 0:
            active_expense_days.append(e_val)
        chart_data.append({"day": day_labels[d.weekday()], "sales": s_val, "expenses": e_val})

    # Dynamic Cash-Flow Prediction for next 7 days
    if active_sales_days:
        avg_daily_inflow = sum(active_sales_days) / len(active_sales_days)
        avg_daily_outflow = (sum(active_expense_days) / len(active_expense_days)) if active_expense_days else 0
        net_daily = max(0, avg_daily_inflow - avg_daily_outflow)
        projected_mid = (net_daily * 7) + (udhaar_pending * 0.5)
        low_est = round(projected_mid * 0.92)
        high_est = round(projected_mid * 1.08)
        forecast_range = f"₹{low_est:,.0f} – ₹{high_est:,.0f}"
    else:
        forecast_range = "Record sales to generate forecast"

    recent_transactions = [
        dict(r) for r in cur.execute("SELECT * FROM transactions ORDER BY id DESC LIMIT 6").fetchall()
    ]

    conn.close()
    return {
        "shop": shop,
        "gemini_enabled": get_gemini_client() is not None,
        "kpis": {
            "todays_sales": todays_sales,
            "cash_received": cash_received,
            "udhaar_pending": udhaar_pending,
            "cash_balance": cash_balance,
            "net_profit": net_profit,
            "forecast_range": forecast_range,
        },
        "chart": chart_data,
        "recent_transactions": recent_transactions,
    }


@app.get("/api/products")
def list_products():
    conn = get_db()
    rows = conn.execute("SELECT * FROM products ORDER BY id ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/products")
def add_product(payload: CreateProductRequest):
    if not payload.name.strip() or payload.price <= 0:
        raise HTTPException(status_code=400, detail="Valid product name and price are required")
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO products (name, unit, price, stock) VALUES (?, ?, ?, ?)",
        (payload.name.strip(), payload.unit.strip() or "unit", payload.price, payload.stock),
    )
    conn.commit()
    conn.close()
    return {"status": "ok"}


@app.post("/api/sales")
def create_sale(payload: CreateSaleRequest):
    if not payload.items:
        raise HTTPException(status_code=400, detail="Add at least one item")
    if payload.payment_method == "Credit" and not payload.customer_id:
        raise HTTPException(status_code=400, detail="Select a customer for Credit (Udhaar) sale")

    conn = get_db()
    cur = conn.cursor()

    total_amount = 0.0
    item_names = []

    for item in payload.items:
        if item.unit_price <= 0 or item.quantity <= 0:
            conn.close()
            raise HTTPException(status_code=400, detail="Enter valid item price and quantity")
        line_total = item.quantity * item.unit_price
        total_amount += line_total
        if item.product_id:
            row = cur.execute(
                "SELECT name, stock FROM products WHERE id = ?", (item.product_id,)
            ).fetchone()
            if row:
                item_names.append(f"{row['name']} x{item.quantity}")
                new_stock = max(0, row["stock"] - item.quantity)
                cur.execute("UPDATE products SET stock = ? WHERE id = ?", (new_stock, item.product_id))
        elif item.custom_name:
            item_names.append(f"{item.custom_name.strip()} x{item.quantity}")

    now = datetime.now()
    tx_date = now.strftime("%Y-%m-%d")
    tx_time = now.strftime("%I:%M %p")

    customer_name = None
    if payload.customer_id:
        cust = cur.execute("SELECT name FROM customers WHERE id = ?", (payload.customer_id,)).fetchone()
        if cust:
            customer_name = cust["name"]

    if payload.payment_method == "Credit" and payload.customer_id:
        due_str = payload.due_date.strip() if payload.due_date else (now + timedelta(days=7)).strftime("%d %b")
        cur.execute(
            "UPDATE customers SET total_credit = total_credit + ?, due_date = ? WHERE id = ?",
            (total_amount, due_str, payload.customer_id),
        )
        title = f"{customer_name} - Credit"
    else:
        summary = ", ".join(item_names[:2]) if item_names else "Counter Sale"
        title = f"{payload.payment_method} Sale - {summary}"

    cur.execute(
        """INSERT INTO transactions
           (tx_type, title, category, payment_method, amount, customer_id, tx_date, tx_time)
           VALUES ('sale', ?, 'Groceries', ?, ?, ?, ?, ?)""",
        (title, payload.payment_method, total_amount, payload.customer_id, tx_date, tx_time),
    )

    conn.commit()
    conn.close()
    return {"status": "recorded", "total": total_amount, "title": title}


@app.get("/api/customers")
def list_customers():
    conn = get_db()
    rows = conn.execute("SELECT * FROM customers ORDER BY id ASC").fetchall()
    conn.close()
    result = []
    for r in rows:
        item = dict(r)
        balance = max(0, item["total_credit"] - item["paid"])
        item["balance"] = balance
        item["status"] = "Cleared" if balance == 0 else "Due"
        result.append(item)
    return result


@app.post("/api/customers")
def add_customer(payload: CreateCustomerRequest):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Customer name is required")
    conn = get_db()
    cur = conn.cursor()
    default_due = payload.due_date.strip() or (datetime.now() + timedelta(days=7)).strftime("%d %b")
    cur.execute(
        "INSERT INTO customers (name, phone, total_credit, paid, due_date) VALUES (?, ?, ?, 0, ?)",
        (
            payload.name.strip(),
            payload.phone.strip(),
            payload.initial_credit,
            default_due if payload.initial_credit > 0 else "-",
        ),
    )
    conn.commit()
    conn.close()
    return {"status": "ok"}


@app.post("/api/customers/{customer_id}/pay")
def record_customer_payment(customer_id: int, payload: CreditPaymentRequest):
    conn = get_db()
    cur = conn.cursor()
    cust = cur.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone()
    if not cust:
        conn.close()
        raise HTTPException(status_code=404, detail="Customer not found")

    balance = max(0, cust["total_credit"] - cust["paid"])
    pay_amt = min(balance, payload.amount)
    if pay_amt <= 0:
        conn.close()
        raise HTTPException(status_code=400, detail="No pending balance")

    new_paid = cust["paid"] + pay_amt
    new_due = "-" if (cust["total_credit"] - new_paid) <= 0 else cust["due_date"]
    cur.execute(
        "UPDATE customers SET paid = ?, due_date = ? WHERE id = ?",
        (new_paid, new_due, customer_id),
    )

    now = datetime.now()
    cur.execute(
        """INSERT INTO transactions
           (tx_type, title, category, payment_method, amount, customer_id, tx_date, tx_time)
           VALUES ('credit_payment', ?, 'Udhaar Recovery', ?, ?, ?, ?, ?)""",
        (
            f"{cust['name']} - Udhaar Paid",
            payload.payment_method,
            pay_amt,
            customer_id,
            now.strftime("%Y-%m-%d"),
            now.strftime("%I:%M %p"),
        ),
    )
    conn.commit()
    conn.close()
    return {"status": "paid", "paid_amount": pay_amt}


@app.get("/api/transactions")
def list_transactions():
    conn = get_db()
    rows = conn.execute("SELECT * FROM transactions ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/expenses")
def add_expense(payload: CreateExpenseRequest):
    if not payload.title.strip() or payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Valid expense title and amount are required")
    conn = get_db()
    cur = conn.cursor()
    now = datetime.now()
    cur.execute(
        """INSERT INTO transactions
           (tx_type, title, category, payment_method, amount, customer_id, tx_date, tx_time)
           VALUES ('expense', ?, ?, ?, ?, NULL, ?, ?)""",
        (
            payload.title.strip(),
            payload.category,
            payload.payment_method,
            payload.amount,
            now.strftime("%Y-%m-%d"),
            now.strftime("%I:%M %p"),
        ),
    )
    conn.commit()
    conn.close()
    return {"status": "ok"}


@app.get("/api/reports")
def get_reports():
    conn = get_db()
    cur = conn.cursor()
    rows = cur.execute(
        "SELECT category, COALESCE(SUM(amount), 0) AS total FROM transactions WHERE tx_type = 'expense' GROUP BY category"
    ).fetchall()

    totals = {"Electricity": 0, "Rent": 0, "Others": 0}
    for r in rows:
        cat = r["category"] if r["category"] in totals else "Others"
        totals[cat] += r["total"]

    grand = sum(totals.values())
    breakdown = [
        {
            "category": k,
            "amount": v,
            "percent": round((v / grand) * 100) if grand > 0 else 0,
        }
        for k, v in totals.items()
    ]
    conn.close()
    return {"expense_breakdown": breakdown}


@app.post("/api/voice-transaction")
def voice_to_transaction(payload: VoiceTransactionRequest):
    if not payload.transcript.strip():
        raise HTTPException(status_code=400, detail="Voice transcript is empty")

    conn = get_db()
    products = [dict(r) for r in conn.execute("SELECT * FROM products").fetchall()]
    customers = [dict(r) for r in conn.execute("SELECT * FROM customers").fetchall()]
    conn.close()

    parsed = parse_voice_with_fallback(payload.transcript, products, customers)
    if payload.auto_save:
        saved = execute_parsed_transaction(parsed)
        return {"status": "saved", "parsed": saved}
    return {"status": "parsed", "parsed": parsed}


@app.post("/api/assistant")
def ask_assistant(payload: ChatRequest):
    msg = payload.message.strip()
    if not msg:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    conn = get_db()
    cur = conn.cursor()
    today = datetime.now().strftime("%Y-%m-%d")

    shop = dict(cur.execute("SELECT * FROM shop_status WHERE id = 1").fetchone())
    sales_today = cur.execute(
        "SELECT COALESCE(SUM(amount), 0) AS s FROM transactions WHERE tx_type = 'sale' AND tx_date = ?",
        (today,),
    ).fetchone()["s"]
    exp_today = cur.execute(
        "SELECT COALESCE(SUM(amount), 0) AS e FROM transactions WHERE tx_type = 'expense' AND tx_date = ?",
        (today,),
    ).fetchone()["e"]
    customers = [dict(r) for r in cur.execute("SELECT * FROM customers").fetchall()]
    products = [dict(r) for r in cur.execute("SELECT * FROM products").fetchall()]
    recent_tx = [dict(r) for r in cur.execute("SELECT * FROM transactions ORDER BY id DESC LIMIT 10").fetchall()]
    conn.close()

    # Check if user is asking the AI to record a transaction directly in chat
    lower_msg = msg.lower()
    if any(k in lower_msg for k in ["record ", "add sale", "sold ", "add expense", "spent ", "udhaar", "credit sale"]):
        try:
            parsed = parse_voice_with_fallback(msg, products, customers)
            if parsed.get("amount", 0) > 0:
                saved = execute_parsed_transaction(parsed)
                return {
                    "reply": f"✅ Recorded {saved['tx_type'].replace('_', ' ')}: {saved['title']} for ₹{saved['amount']:,.0f} ({saved['payment_method']}).",
                    "action_taken": True,
                }
        except HTTPException as he:
            return {"reply": f"⚠️ {he.detail}", "action_taken": False}

        # Try Gemini API for intelligent financial Q&A
    client = get_gemini_client()

    if client:
        context = {
            "shop_name": shop["shop_name"],
            "owner_name": shop["owner_name"],
            "todays_sales": sales_today,
            "todays_expenses": exp_today,
            "todays_net_profit": sales_today - exp_today,
            "customers": customers,
            "products": products,
            "recent_transactions": recent_tx,
        }

        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=f"""You are DukaanAI, a helpful financial assistant for {shop['owner_name']}'s store '{shop['shop_name']}'.

Use Indian Rupees (₹).
Answer concisely based on this live shop data:

{json.dumps(context)}

Shopkeeper question: {msg}"""
            )

            return {
                "reply": response.text.strip(),
                "action_taken": False
            }

        except Exception as e:
            print("Gemini API Error:", e)
            pass
    

    # Deterministic live-DB fallback answers
    if "profit" in lower_msg:
        reply = f"Today's estimated net profit is ₹{sales_today - exp_today:,.0f} (Sales: ₹{sales_today:,.0f} − Expenses: ₹{exp_today:,.0f})."
    elif "pending" in lower_msg or "udhaar" in lower_msg or "credit" in lower_msg:
        pending_list = [c for c in customers if (c["total_credit"] - c["paid"]) > 0]
        if not pending_list:
            reply = "No pending Udhaar balances right now."
        else:
            total_u = sum(c["total_credit"] - c["paid"] for c in pending_list)
            details = ", ".join([f"{c['name']}: ₹{c['total_credit'] - c['paid']:,.0f}" for c in pending_list])
            reply = f"Total pending Udhaar is ₹{total_u:,.0f} ({details})."
    elif "cash flow" in lower_msg or "forecast" in lower_msg or "predict" in lower_msg:
        net = max(0, sales_today - exp_today)
        reply = f"At your current daily net pace of ₹{net:,.0f}/day, next 7 days projected cash flow is ₹{net * 7:,.0f}."
    elif "stock" in lower_msg or "inventory" in lower_msg:
        if not products:
            reply = "Your inventory list is currently empty. Add products in the Inventory tab."
        else:
            items = ", ".join([f"{p['name']} ({p['stock']} {p['unit']})" for p in products])
            reply = f"Current inventory: {items}."
    else:
        reply = f"Hi {shop['owner_name']}! Ask me about today's profit, pending Udhaar, cash-flow forecast, or speak/type a sale like 'Sold 2 kg Rice for 120 Cash'."

    return {"reply": reply, "action_taken": False}
