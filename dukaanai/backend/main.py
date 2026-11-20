import os
import re
import json
import uuid
import hashlib
import secrets
import sqlite3
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Header, Depends
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


def hash_password(password: str, salt: str) -> str:
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return dk.hex()


def verify_password(password: str, salt: str, password_hash: str) -> bool:
    return secrets.compare_digest(hash_password(password, salt), password_hash)


def ensure_columns(cur):
    # Users table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS auth_sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL
    )
    """)

    # Shops table (per user)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS shops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        shop_name TEXT NOT NULL DEFAULT '',
        owner_name TEXT NOT NULL DEFAULT '',
        is_open INTEGER NOT NULL DEFAULT 1,
        opening_cash REAL NOT NULL DEFAULT 0,
        is_configured INTEGER NOT NULL DEFAULT 0,
        phone TEXT NOT NULL DEFAULT '',
        gstin TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        low_stock_threshold INTEGER NOT NULL DEFAULT 5
    )
    """)

    # Products migrations
    prod_cols = {row["name"] for row in cur.execute("PRAGMA table_info(products)").fetchall()}
    if "user_id" not in prod_cols:
        cur.execute("ALTER TABLE products ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1")
    if "purchase_price" not in prod_cols:
        cur.execute("ALTER TABLE products ADD COLUMN purchase_price REAL NOT NULL DEFAULT 0")
    if "low_stock_threshold" not in prod_cols:
        cur.execute("ALTER TABLE products ADD COLUMN low_stock_threshold INTEGER NOT NULL DEFAULT 5")

    # Customers migrations
    cust_cols = {row["name"] for row in cur.execute("PRAGMA table_info(customers)").fetchall()}
    if "user_id" not in cust_cols:
        cur.execute("ALTER TABLE customers ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1")

    # Transactions migrations
    tx_cols = {row["name"] for row in cur.execute("PRAGMA table_info(transactions)").fetchall()}
    if "user_id" not in tx_cols:
        cur.execute("ALTER TABLE transactions ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1")


def init_db():
    conn = get_db()
    cur = conn.cursor()

    cur.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        shop_name TEXT NOT NULL DEFAULT '',
        owner_name TEXT NOT NULL DEFAULT '',
        is_open INTEGER NOT NULL DEFAULT 1,
        opening_cash REAL NOT NULL DEFAULT 0,
        is_configured INTEGER NOT NULL DEFAULT 0,
        phone TEXT NOT NULL DEFAULT '',
        gstin TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        low_stock_threshold INTEGER NOT NULL DEFAULT 5
    );

    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL DEFAULT 1,
        name TEXT NOT NULL,
        unit TEXT NOT NULL,
        purchase_price REAL NOT NULL DEFAULT 0,
        price REAL NOT NULL,
        stock INTEGER NOT NULL,
        low_stock_threshold INTEGER NOT NULL DEFAULT 5
    );

    CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL DEFAULT 1,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        total_credit REAL NOT NULL DEFAULT 0,
        paid REAL NOT NULL DEFAULT 0,
        due_date TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL DEFAULT 1,
        tx_type TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        amount REAL NOT NULL,
        customer_id INTEGER,
        tx_date TEXT NOT NULL,
        tx_time TEXT NOT NULL
    );
    """)

    ensure_columns(cur)
    conn.commit()
    conn.close()


init_db()


# --- Auth Dependency ---
def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated. Please log in.")
    token = authorization.replace("Bearer ", "", 1).strip()
    if not token:
        raise HTTPException(status_code=401, detail="Invalid session token.")
    conn = get_db()
    row = conn.execute(
        """SELECT u.id, u.owner_name, u.email, u.phone
           FROM auth_sessions s
           JOIN users u ON u.id = s.user_id
           WHERE s.token = ?""",
        (token,),
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    return dict(row)


def ensure_user_shop(cur, user: dict) -> dict:
    shop_row = cur.execute("SELECT * FROM shops WHERE user_id = ?", (user["id"],)).fetchone()
    if not shop_row:
        default_shop_name = f"{user['owner_name'].split()[0]}'s Store" if user.get("owner_name") else "My Store"
        cur.execute(
            """INSERT INTO shops
               (user_id, shop_name, owner_name, is_open, opening_cash, is_configured, phone, gstin, address, low_stock_threshold)
               VALUES (?, ?, ?, 1, 0, 1, ?, '', '', 5)""",
            (user["id"], default_shop_name, user["owner_name"], user.get("phone", "")),
        )
        shop_row = cur.execute("SELECT * FROM shops WHERE user_id = ?", (user["id"],)).fetchone()
    return dict(shop_row)


# --- Pydantic Models ---
class RegisterRequest(BaseModel):
    owner_name: str
    email: str
    phone: str
    password: str
    shop_name: Optional[str] = ""


class LoginRequest(BaseModel):
    email: str
    password: str


class SetupStoreRequest(BaseModel):
    shop_name: str
    owner_name: str
    opening_cash: float = 0.0
    phone: str = ""
    gstin: str = ""
    address: str = ""
    low_stock_threshold: int = 5


class UpdateProfileRequest(BaseModel):
    shop_name: str
    owner_name: str
    phone: str = ""
    gstin: str = ""
    address: str = ""
    opening_cash: float = 0.0
    low_stock_threshold: int = 5


class SaleItem(BaseModel):
    product_id: Optional[int] = None
    custom_name: Optional[str] = None
    quantity: float = 1
    unit_price: float


class CreateSaleRequest(BaseModel):
    items: List[SaleItem]
    payment_method: str
    customer_id: Optional[int] = None
    customer_name: Optional[str] = ""
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
    unit: str = "unit"
    purchase_price: float = 0.0
    price: float
    stock: float
    low_stock_threshold: Optional[int] = None


class UpdateProductRequest(BaseModel):
    name: Optional[str] = None
    unit: Optional[str] = None
    purchase_price: Optional[float] = None
    price: Optional[float] = None
    stock: Optional[float] = None
    low_stock_threshold: Optional[int] = None


class StockDeltaRequest(BaseModel):
    delta: float


class ChatRequest(BaseModel):
    message: str


class VoiceTransactionRequest(BaseModel):
    transcript: str
    language: str = "en-IN"
    auto_save: bool = False
    confirmed_action: Optional[dict] = None


# --- Auth Endpoints ---
@app.post("/api/auth/register")
def register_user(payload: RegisterRequest):
    owner_name = payload.owner_name.strip()
    email = payload.email.strip().lower()
    phone = re.sub(r"\s+", "", payload.phone.strip())
    password = payload.password

    if not owner_name or len(owner_name) < 2:
        raise HTTPException(status_code=400, detail="Shop owner's full name is required.")
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")
    digits = re.sub(r"\D", "", phone)
    if len(digits) < 10:
        raise HTTPException(status_code=400, detail="Please enter a valid 10-digit phone number.")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long.")

    conn = get_db()
    cur = conn.cursor()
    existing = cur.execute("SELECT id FROM users WHERE LOWER(email) = ?", (email,)).fetchone()
    if existing:
        conn.close()
        raise HTTPException(status_code=400, detail="An account with this email already exists. Please log in.")

    salt = secrets.token_hex(16)
    pwd_hash = hash_password(password, salt)
    now_iso = datetime.now().isoformat()

    cur.execute(
        "INSERT INTO users (owner_name, email, phone, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (owner_name, email, phone, pwd_hash, salt, now_iso),
    )
    user_id = cur.lastrowid

    shop_name = (payload.shop_name or "").strip() or f"{owner_name.split()[0]}'s Store"
    cur.execute(
        """INSERT INTO shops
           (user_id, shop_name, owner_name, is_open, opening_cash, is_configured, phone, gstin, address, low_stock_threshold)
           VALUES (?, ?, ?, 1, 0, 1, ?, '', '', 5)""",
        (user_id, shop_name, owner_name, phone),
    )

    token = uuid.uuid4().hex + secrets.token_hex(16)
    cur.execute("INSERT INTO auth_sessions (token, user_id, created_at) VALUES (?, ?, ?)", (token, user_id, now_iso))

    conn.commit()
    conn.close()

    return {
        "token": token,
        "user": {
            "id": user_id,
            "owner_name": owner_name,
            "email": email,
            "phone": phone,
        },
    }


@app.post("/api/auth/login")
def login_user(payload: LoginRequest):
    identifier = payload.email.strip().lower()
    password = payload.password

    if not identifier or not password:
        raise HTTPException(status_code=400, detail="Email/phone and password are required.")

    conn = get_db()
    cur = conn.cursor()
    user_row = cur.execute(
        "SELECT * FROM users WHERE LOWER(email) = ? OR REPLACE(phone, ' ', '') = ?",
        (identifier, identifier),
    ).fetchone()

    if not user_row or not verify_password(password, user_row["salt"], user_row["password_hash"]):
        conn.close()
        raise HTTPException(status_code=401, detail="Invalid email/phone or password.")

    user_dict = {
        "id": user_row["id"],
        "owner_name": user_row["owner_name"],
        "email": user_row["email"],
        "phone": user_row["phone"],
    }
    ensure_user_shop(cur, user_dict)

    token = uuid.uuid4().hex + secrets.token_hex(16)
    cur.execute(
        "INSERT INTO auth_sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_row["id"], datetime.now().isoformat()),
    )
    conn.commit()
    conn.close()

    return {"token": token, "user": user_dict}


@app.get("/api/auth/me")
def get_me(user: dict = Depends(get_current_user)):
    return {"user": user}


@app.post("/api/auth/logout")
def logout_user(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "", 1).strip()
        if token:
            conn = get_db()
            conn.execute("DELETE FROM auth_sessions WHERE token = ?", (token,))
            conn.commit()
            conn.close()
    return {"status": "logged_out"}


# --- Helper: Gemini AI Client ---
def get_gemini_client():
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if api_key and api_key != "your_gemini_api_key_here" and genai is not None:
        return genai.Client(api_key=api_key)
    return None


def _normalize_unit(raw_unit: Optional[str]) -> str:
    if not raw_unit:
        return "unit"
    u = raw_unit.strip().lower()
    mapping = {
        "kg": "kg", "kgs": "kg", "kilo": "kg", "kilos": "kg", "kilogram": "kg", "kilograms": "kg", "किलो": "kg", "ಕೆಜಿ": "kg", "கிலோ": "kg", "కిలో": "kg",
        "g": "g", "gm": "g", "gms": "g", "gram": "g", "grams": "g",
        "l": "L", "ltr": "L", "litre": "L", "litres": "L", "liter": "L", "liters": "L", "लीटर": "L", "ಲೀಟರ್": "L", "லிட்டர்": "L", "లీటర్": "L",
        "ml": "ml",
        "packet": "packets", "packets": "packets", "pkt": "packets", "pkts": "packets", "पैकेट": "packets", "ಪ್ಯಾಕೆಟ್": "packets", "பாக்கெட்": "packets", "ప్యాకెట్": "packets",
        "bottle": "bottles", "bottles": "bottles", "बोतल": "bottles", "ಬಾಟಲ್": "bottles", "பாட்டில்": "bottles", "బాటిల్": "bottles",
        "pc": "pcs", "pcs": "pcs", "piece": "pcs", "pieces": "pcs", "unit": "unit", "units": "unit",
        "box": "boxes", "boxes": "boxes", "bag": "bags", "bags": "bags", "dozen": "dozen",
    }
    return mapping.get(u, raw_unit.strip())


def _find_matching_product(products: list, candidate_name: str):
    if not candidate_name:
        return None
    cand = candidate_name.strip().lower()
    for p in products:
        if p["name"].lower() == cand:
            return p
    for p in products:
        if cand in p["name"].lower() or p["name"].lower() in cand:
            return p
    return None


def parse_voice_with_fallback(transcript: str, products: list, customers: list, language: str = "en-IN") -> dict:
    client = get_gemini_client()
    product_names = [f"{p['name']} (selling ₹{p['price']}/{p['unit']}, stock: {p['stock']} {p['unit']})" for p in products]
    customer_names = [c["name"] for c in customers]

    if client:
        prompt = f"""
        You are an intelligent multilingual accounting & inventory parser for an Indian retail shop (DukaanAI).
        The shopkeeper spoke in language '{language}' (could be English, Hindi, Kannada, Tamil, Telugu, or code-mixed Hinglish/Kanglish/Tanglish/Tenglish).
        Convert the spoken command into strict JSON.

        Available inventory products: {product_names}
        Available customers: {customer_names}
        Spoken transcript: "{transcript}"

        Determine the intent carefully:
        1. "add_inventory": Adding/restocking products into inventory (e.g., "Add 10 kg of rice at ₹60 per kg", "Add 20 packets of biscuits at ₹10 each", "Add 5 bottles of oil", or regional equivalents like "10 kg akki add madi 60 rupees", "10 kilo chawal 60 rupaye ke hisab se add karo").
        2. "sale": Recording a sale (e.g., "Sold 2 kg of rice for ₹120", "Record 3 biscuit packets paid through UPI", "Sold 2 oil bottles on credit to Ramesh", or regional equivalents).
        3. "credit_payment": Customer paying back Udhaar/credit.
        4. "expense": Recording shop expense (rent, electricity, transport, etc.).

        Return ONLY valid JSON with these keys:
        {{
          "action_type": "add_inventory" | "sale" | "expense" | "credit_payment",
          "product_name": string or null,
          "quantity": number,
          "unit": string,
          "unit_price": number,
          "amount": number,
          "payment_method": "Cash" | "UPI" | "Credit",
          "customer_name": string or null,
          "category": "Groceries" | "Inventory" | "Electricity" | "Rent" | "Udhaar Recovery" | "Others",
          "title": "clear human-readable summary in English"
        }}

        Rules:
        - For "add_inventory": if price is "at ₹60 per kg" or "at ₹10 each", unit_price is 60 or 10, and amount is quantity * unit_price. If no price is stated (e.g., "Add 5 bottles of oil"), set unit_price to existing product price if matched else 0, and amount = quantity * unit_price.
        - For "sale": if total price is given ("Sold 2 kg of rice for ₹120"), amount is 120 and unit_price is 60. If only quantity is given ("Record 3 biscuit packets paid through UPI"), look up the product's selling price in Available inventory products to compute unit_price and amount = quantity * unit_price.
        - Normalize product_name cleanly (e.g. "rice" -> "Rice" or matched inventory name, "biscuit packets" -> "Biscuits" if "Biscuits" is in inventory).
        """
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
            )
            raw = response.text.strip()
            raw = re.sub(r"^```json|```$", "", raw, flags=re.MULTILINE).strip()
            data = json.loads(raw)
            action = data.get("action_type") or data.get("tx_type") or "sale"
            if action == "inventory":
                action = "add_inventory"
            data["action_type"] = action
            data["unit"] = _normalize_unit(data.get("unit"))
            qty = float(data.get("quantity") or 1)
            u_price = float(data.get("unit_price") or 0)
            amt = float(data.get("amount") or 0)

            matched_prod = _find_matching_product(products, data.get("product_name") or "")
            if matched_prod:
                data["matched_product_id"] = matched_prod["id"]
                data["product_name"] = matched_prod["name"]
                if not data.get("unit") or data["unit"] == "unit":
                    data["unit"] = matched_prod["unit"]
                if action == "sale" and u_price <= 0 and amt <= 0:
                    u_price = float(matched_prod["price"])
                    amt = round(qty * u_price, 2)
                elif action == "add_inventory" and u_price <= 0 and amt <= 0:
                    u_price = float(matched_prod["price"])
                    amt = round(qty * u_price, 2)

            if amt <= 0 and u_price > 0:
                amt = round(qty * u_price, 2)
            if u_price <= 0 and amt > 0 and qty > 0:
                u_price = round(amt / qty, 2)

            data["quantity"] = qty
            data["unit_price"] = u_price
            data["amount"] = amt
            return data
        except Exception:
            pass

    # --- Deterministic Multilingual & Code-Mixed Fallback Parser ---
    text = transcript.strip()
    lower = text.lower()

    # Multilingual keyword mappings for common items & verbs
    regional_item_aliases = {
        "chawal": "Rice", "चावल": "Rice", "akki": "Rice", "ಅಕ್ಕಿ": "Rice", "arisi": "Rice", "அரிசி": "Rice", "biyyam": "Rice", "బియ్యం": "Rice",
        "biscuit": "Biscuits", "biscuits": "Biscuits", "बिस्किट": "Biscuits", "ಬಿಸ್ಕೆಟ್": "Biscuits", "பிஸ்கட்": "Biscuits", "బిస్కెట్": "Biscuits",
        "oil": "Oil", "tel": "Oil", "तेल": "Oil", "enne": "Oil", "ಎಣ್ಣೆ": "Oil", "ennai": "Oil", "எண்ணெய்": "Oil", "nune": "Oil", "నూనె": "Oil",
        "sugar": "Sugar", "cheeni": "Sugar", "चीनी": "Sugar", "sakkare": "Sugar", "ಸಕ್ಕರೆ": "Sugar", "sarkkarai": "Sugar", "சர்க்கரை": "Sugar", "panchadara": "Sugar", "పంచదార": "Sugar",
        "milk": "Milk", "doodh": "Milk", "दूध": "Milk", "haalu": "Milk", "ಹಾಲು": "Milk", "paal": "Milk", "பால்": "Milk", "paalu": "Milk", "పాలు": "Milk",
        "dal": "Dal", "दाल": "Dal", "bele": "Dal", "ಬೇಳೆ": "Dal", "paruppu": "Dal", "பருப்பு": "Dal", "pappu": "Dal", "పప్పు": "Dal",
    }

    # Payment method detection (EN + HI + KN + TA + TE)
    if any(w in lower for w in ["upi", "gpay", "phonepe", "paytm", "online", "यूपीआई", "ಯುಪಿಐ", "யுபிஐ", "యూపీఐ"]):
        pay_method = "UPI"
    elif any(w in lower for w in ["credit", "udhaar", "udhar", "khata", "उधार", "ಸಾಲ", "கடன்", "అప్పు"]):
        pay_method = "Credit"
    else:
        pay_method = "Cash"

    # Extract quantity + unit
    unit_pattern = r"(\d+(?:\.\d+)?)\s*(kg|kgs|kilo|kilos|kilogram|g|gm|gram|grams|l|ltr|litre|litres|liter|ml|packet|packets|pkt|bottle|bottles|pc|pcs|piece|pieces|box|boxes|bag|bags|dozen|unit|units|किलो|लीटर|पैकेट|बोतल|ಕೆಜಿ|ಲೀಟರ್|ಪ್ಯಾಕೆಟ್|ಬಾಟಲ್|கிலோ|லிட்டர்|பாக்கெட்|பாட்டில்|కిలో|లీటర్|ప్యాకెట్|బాటిల్)\b"
    qty_match = re.search(unit_pattern, lower)
    qty = float(qty_match.group(1)) if qty_match else 1.0
    unit = _normalize_unit(qty_match.group(2)) if qty_match else "unit"

    # Extract explicit price (per unit vs total)
    per_unit_match = re.search(r"(?:at|@|per|each|rate|ke hisab se|ge|ku|ki)\s*(?:₹|rs\.?|rupees)?\s*(\d+(?:\.\d+)?)\s*(?:per\s*\w+|each|rupees|rs)?", lower)
    total_price_match = re.search(r"(?:for|total|₹|rs\.?|rupees|rupai|rupaye|ரூபாய்|రూపాయలు|ರೂಪಾಯಿ)\s*(\d+(?:\.\d+)?)", lower)
    all_nums = [float(n) for n in re.findall(r"\d+(?:\.\d+)?", lower)]

    # Detect intent: add_inventory vs expense vs credit_payment vs sale
    add_inv_triggers = [
        "add ", "stock ", "restock", "purchase", "bought", "new item", "inventory",
        "जोड़ो", "ऐड", "स्टॉक", "ಸೇರಿಸಿ", "ಆಡ್", "சேர்", "ஆட்", "జోడించు", "యాడ్",
    ]
    sold_triggers = [
        "sold", "sell", "record ", "sale", "becha", "बेचा", "ಮಾರಾಟ", "ವಿಕ್ರಯ", "விற்றேன்", "అమ్మాను",
    ]

    is_add_inventory = any(t in lower for t in add_inv_triggers) and not any(s in lower for s in ["sold", "becha", "बेचा", "விற்றேன்", "అమ్మాను"])

    # Match product from existing inventory or regional aliases or phrase extraction
    matched_prod = None
    for p in products:
        if p["name"].lower() in lower:
            matched_prod = p
            break
    if not matched_prod:
        for alias, eng_name in regional_item_aliases.items():
            if alias in lower:
                matched_prod = _find_matching_product(products, eng_name)
                if not matched_prod:
                    matched_prod = {"id": None, "name": eng_name, "unit": unit, "price": 0.0, "stock": 0}
                break

    extracted_prod_name = matched_prod["name"] if matched_prod else None
    if not extracted_prod_name:
        # Try extracting product name after quantity+unit or after "of"
        of_match = re.search(
            r"(?:of|packets of|bottles of|kg of|kilo of)\s+([a-zA-Z\u0900-\u0D7F][a-zA-Z\u0900-\u0D7F\s]{1,28}?)(?:\s+(?:at|for|on|paid|via|through|to|@|₹|rs|\d)|$)",
            text,
            re.IGNORECASE,
        )
        if of_match:
            extracted_prod_name = of_match.group(1).strip().title()
        elif qty_match:
            after_qty = lower[qty_match.end():].strip()
            after_qty = re.sub(r"^(?:of|packets|bottles)\s+", "", after_qty)
            cand = re.split(r"\s+(?:at|for|on|paid|via|through|to|@|₹|rs|\d)", after_qty)[0].strip()
            if cand and cand not in {"cash", "upi", "credit", "udhaar"}:
                extracted_prod_name = cand.title()

    if matched_prod and unit == "unit" and matched_prod.get("unit"):
        unit = matched_prod["unit"]

    # Match customer name
    matched_cust = None
    for c in customers:
        if c["name"].lower() in lower:
            matched_cust = c["name"]
            break
    if not matched_cust:
        cust_match = re.search(
            r"(?:to|from|customer)\s+([a-zA-Z\u0900-\u0D7F][a-zA-Z\u0900-\u0D7F\s]{1,24}?)(?:\s+(?:for|on|of|udhaar|udhar|credit|cash|upi|rs|rupees|₹|\d)|$)",
            text,
            re.IGNORECASE,
        )
        if cust_match:
            cand_c = cust_match.group(1).strip()
            if cand_c.lower() not in {"cash", "upi", "credit", "udhaar", "udhar", "inventory", "stock"}:
                matched_cust = cand_c.title()

    # Expense branch
    if any(w in lower for w in ["expense", "electricity", "rent", "transport", "salary", "repair", "spent", "बिजली", "किराया", "ಖರ್ಚು", "செலவு", "ఖర్చు"]):
        amt = float(total_price_match.group(1)) if total_price_match else (all_nums[-1] if all_nums else 0.0)
        cat = "Electricity" if "electricity" in lower or "power" in lower else ("Rent" if "rent" in lower else "Others")
        return {
            "action_type": "expense",
            "product_name": None,
            "quantity": 1,
            "unit": "unit",
            "unit_price": amt,
            "amount": amt,
            "payment_method": pay_method if pay_method != "Credit" else "Cash",
            "customer_name": None,
            "category": cat,
            "title": text.capitalize(),
        }

    # Udhaar recovery branch
    if any(w in lower for w in ["received from", "settled", "cleared", "paid back", "udhaar paid", "udhar paid"]):
        amt = float(total_price_match.group(1)) if total_price_match else (all_nums[-1] if all_nums else 0.0)
        return {
            "action_type": "credit_payment",
            "product_name": None,
            "quantity": 1,
            "unit": "unit",
            "unit_price": amt,
            "amount": amt,
            "payment_method": pay_method if pay_method != "Credit" else "Cash",
            "customer_name": matched_cust,
            "category": "Udhaar Recovery",
            "title": f"{matched_cust or 'Customer'} - Udhaar Paid",
        }

    # Add Inventory branch
    if is_add_inventory:
        unit_price = 0.0
        if per_unit_match:
            unit_price = float(per_unit_match.group(1))
        elif total_price_match:
            total_val = float(total_price_match.group(1))
            unit_price = round(total_val / qty, 2) if qty > 0 else total_val
        elif matched_prod and float(matched_prod.get("price") or 0) > 0:
            unit_price = float(matched_prod["price"])

        total_amount = round(qty * unit_price, 2)
        prod_label = extracted_prod_name or "New Item"
        return {
            "action_type": "add_inventory",
            "matched_product_id": matched_prod.get("id") if matched_prod else None,
            "product_name": prod_label,
            "quantity": qty,
            "unit": unit,
            "unit_price": unit_price,
            "amount": total_amount,
            "payment_method": "Cash",
            "customer_name": None,
            "category": "Inventory",
            "title": f"Add {qty:g} {unit} {prod_label}" + (f" @ ₹{unit_price:g}/{unit}" if unit_price > 0 else ""),
        }

    # Sale branch (default)
    prod_label = extracted_prod_name or "Counter Sale"
    unit_price = 0.0
    total_amount = 0.0

    if per_unit_match:
        unit_price = float(per_unit_match.group(1))
        total_amount = round(qty * unit_price, 2)
    elif total_price_match:
        total_amount = float(total_price_match.group(1))
        unit_price = round(total_amount / qty, 2) if qty > 0 else total_amount
    elif matched_prod and float(matched_prod.get("price") or 0) > 0:
        unit_price = float(matched_prod["price"])
        total_amount = round(qty * unit_price, 2)
    elif len(all_nums) >= 2:
        total_amount = all_nums[-1]
        unit_price = round(total_amount / qty, 2) if qty > 0 else total_amount
    elif len(all_nums) == 1 and not qty_match:
        total_amount = all_nums[0]
        unit_price = total_amount

    title = (
        f"{matched_cust} - Credit ({prod_label} x{qty:g})"
        if (pay_method == "Credit" and matched_cust)
        else f"{pay_method} Sale - {prod_label} ({qty:g} {unit})"
    )

    return {
        "action_type": "sale",
        "matched_product_id": matched_prod.get("id") if matched_prod else None,
        "product_name": prod_label,
        "quantity": qty,
        "unit": unit,
        "unit_price": unit_price,
        "amount": total_amount,
        "payment_method": pay_method,
        "customer_name": matched_cust,
        "category": "Groceries",
        "title": title,
    }


def execute_parsed_action(parsed: dict, user_id: int) -> dict:
    action_type = parsed.get("action_type") or parsed.get("tx_type") or "sale"
    conn = get_db()
    cur = conn.cursor()
    now = datetime.now()
    tx_date = now.strftime("%Y-%m-%d")
    tx_time = now.strftime("%I:%M %p")

    if action_type == "add_inventory":
        prod_name = (parsed.get("product_name") or "").strip()
        qty = float(parsed.get("quantity") or 0)
        unit = _normalize_unit(parsed.get("unit") or "unit")
        unit_price = float(parsed.get("unit_price") or 0)

        if not prod_name or qty <= 0:
            conn.close()
            raise HTTPException(status_code=400, detail="Product name and positive quantity are required to add inventory.")

        existing = cur.execute(
            "SELECT * FROM products WHERE user_id = ? AND LOWER(name) = LOWER(?)",
            (user_id, prod_name),
        ).fetchone()

        if existing:
            new_stock = float(existing["stock"]) + qty
            new_price = unit_price if unit_price > 0 else float(existing["price"])
            new_unit = unit if unit != "unit" else existing["unit"]
            cur.execute(
                "UPDATE products SET stock = ?, price = ?, unit = ? WHERE id = ? AND user_id = ?",
                (new_stock, new_price, new_unit, existing["id"], user_id),
            )
            result_msg = f"Updated {existing['name']}: added {qty:g} {new_unit} (New stock: {new_stock:g} {new_unit})"
        else:
            shop_row = cur.execute("SELECT low_stock_threshold FROM shops WHERE user_id = ?", (user_id,)).fetchone()
            default_thresh = int(shop_row["low_stock_threshold"]) if shop_row else 5
            cur.execute(
                """INSERT INTO products (user_id, name, unit, purchase_price, price, stock, low_stock_threshold)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (user_id, prod_name.title(), unit, 0.0, unit_price, qty, default_thresh),
            )
            result_msg = f"Added {qty:g} {unit} of {prod_name.title()} to inventory" + (f" at ₹{unit_price:g}/{unit}" if unit_price > 0 else "")

        conn.commit()
        conn.close()
        parsed["result_message"] = result_msg
        return parsed

    amount = float(parsed.get("amount") or 0)
    if amount <= 0:
        conn.close()
        raise HTTPException(status_code=400, detail="Could not determine a valid ₹ amount. Please review and enter the price before confirming.")

    pay_method = parsed.get("payment_method", "Cash")
    cust_name = parsed.get("customer_name")
    prod_name = parsed.get("product_name")
    qty = float(parsed.get("quantity") or 1)

    customer_id = None
    if cust_name:
        row = cur.execute(
            "SELECT id, total_credit, paid, due_date FROM customers WHERE user_id = ? AND LOWER(name) = LOWER(?)",
            (user_id, cust_name.strip()),
        ).fetchone()
        if row:
            customer_id = row["id"]
        elif action_type == "sale" and pay_method == "Credit":
            cur.execute(
                "INSERT INTO customers (user_id, name, phone, total_credit, paid, due_date) VALUES (?, ?, '', 0, 0, ?)",
                (user_id, cust_name.strip().title(), (now + timedelta(days=7)).strftime("%d %b")),
            )
            customer_id = cur.lastrowid

    if action_type == "sale":
        if prod_name:
            prow = cur.execute(
                "SELECT id, stock FROM products WHERE user_id = ? AND LOWER(name) = LOWER(?)",
                (user_id, prod_name),
            ).fetchone()
            if not prow:
                prow = cur.execute(
                    "SELECT id, stock FROM products WHERE user_id = ? AND LOWER(name) LIKE LOWER(?)",
                    (user_id, f"%{prod_name}%"),
                ).fetchone()
            if prow:
                cur.execute(
                    "UPDATE products SET stock = ? WHERE id = ? AND user_id = ?",
                    (max(0, float(prow["stock"]) - qty), prow["id"], user_id),
                )

        if pay_method == "Credit":
            if not customer_id:
                conn.close()
                raise HTTPException(status_code=400, detail="For a Credit/Udhaar sale, please specify the customer's name.")
            due_str = (now + timedelta(days=7)).strftime("%d %b")
            cur.execute(
                "UPDATE customers SET total_credit = total_credit + ?, due_date = ? WHERE id = ? AND user_id = ?",
                (amount, due_str, customer_id, user_id),
            )

        cur.execute(
            """INSERT INTO transactions (user_id, tx_type, title, category, payment_method, amount, customer_id, tx_date, tx_time)
               VALUES (?, 'sale', ?, ?, ?, ?, ?, ?, ?)""",
            (user_id, parsed.get("title", "Voice Sale"), parsed.get("category", "Groceries"), pay_method, amount, customer_id, tx_date, tx_time),
        )
        parsed["result_message"] = f"Recorded {pay_method} sale: {parsed.get('title', 'Sale')} for ₹{amount:,.0f}"

    elif action_type == "credit_payment":
        if not customer_id:
            conn.close()
            raise HTTPException(status_code=400, detail="Please specify which customer paid back their Udhaar.")
        crow = cur.execute(
            "SELECT total_credit, paid, due_date FROM customers WHERE id = ? AND user_id = ?",
            (customer_id, user_id),
        ).fetchone()
        bal = max(0, crow["total_credit"] - crow["paid"])
        applied = min(bal, amount) if bal > 0 else amount
        new_paid = crow["paid"] + applied
        new_due = "-" if (crow["total_credit"] - new_paid) <= 0 else crow["due_date"]
        cur.execute(
            "UPDATE customers SET paid = ?, due_date = ? WHERE id = ? AND user_id = ?",
            (new_paid, new_due, customer_id, user_id),
        )
        cur.execute(
            """INSERT INTO transactions (user_id, tx_type, title, category, payment_method, amount, customer_id, tx_date, tx_time)
               VALUES (?, 'credit_payment', ?, 'Udhaar Recovery', ?, ?, ?, ?, ?)""",
            (user_id, parsed.get("title", f"{cust_name} - Udhaar Paid"), pay_method, applied, customer_id, tx_date, tx_time),
        )
        parsed["result_message"] = f"Recorded Udhaar recovery of ₹{applied:,.0f} from {cust_name}"

    elif action_type == "expense":
        cur.execute(
            """INSERT INTO transactions (user_id, tx_type, title, category, payment_method, amount, customer_id, tx_date, tx_time)
               VALUES (?, 'expense', ?, ?, ?, ?, NULL, ?, ?)""",
            (user_id, parsed.get("title", "Voice Expense"), parsed.get("category", "Others"), pay_method, amount, tx_date, tx_time),
        )
        parsed["result_message"] = f"Recorded expense: {parsed.get('title', 'Expense')} for ₹{amount:,.0f}"

    conn.commit()
    conn.close()
    return parsed


# --- Shop & Profile Routes (Per User) ---
@app.get("/api/shop")
def get_shop(user: dict = Depends(get_current_user)):
    conn = get_db()
    cur = conn.cursor()
    shop = ensure_user_shop(cur, user)
    conn.commit()
    conn.close()
    return shop


@app.post("/api/shop/setup")
def setup_shop(payload: SetupStoreRequest, user: dict = Depends(get_current_user)):
    if not payload.shop_name.strip() or not payload.owner_name.strip():
        raise HTTPException(status_code=400, detail="Shop name and owner name are required")
    conn = get_db()
    cur = conn.cursor()
    ensure_user_shop(cur, user)
    cur.execute(
        """UPDATE shops
           SET shop_name = ?, owner_name = ?, opening_cash = ?, phone = ?, gstin = ?, address = ?,
               low_stock_threshold = ?, is_open = 1, is_configured = 1
           WHERE user_id = ?""",
        (
            payload.shop_name.strip(),
            payload.owner_name.strip(),
            payload.opening_cash,
            payload.phone.strip(),
            payload.gstin.strip(),
            payload.address.strip(),
            max(1, int(payload.low_stock_threshold or 5)),
            user["id"],
        ),
    )
    conn.commit()
    shop = dict(cur.execute("SELECT * FROM shops WHERE user_id = ?", (user["id"],)).fetchone())
    conn.close()
    return shop


@app.post("/api/shop/profile")
def update_profile(payload: UpdateProfileRequest, user: dict = Depends(get_current_user)):
    if not payload.shop_name.strip() or not payload.owner_name.strip():
        raise HTTPException(status_code=400, detail="Shop name and owner name are required")
    conn = get_db()
    cur = conn.cursor()
    ensure_user_shop(cur, user)
    cur.execute(
        """UPDATE shops
           SET shop_name = ?, owner_name = ?, phone = ?, gstin = ?, address = ?,
               opening_cash = ?, low_stock_threshold = ?, is_configured = 1
           WHERE user_id = ?""",
        (
            payload.shop_name.strip(),
            payload.owner_name.strip(),
            payload.phone.strip(),
            payload.gstin.strip(),
            payload.address.strip(),
            payload.opening_cash,
            max(1, int(payload.low_stock_threshold or 5)),
            user["id"],
        ),
    )
    conn.commit()
    shop = dict(cur.execute("SELECT * FROM shops WHERE user_id = ?", (user["id"],)).fetchone())
    conn.close()
    return shop


@app.post("/api/shop/reset")
def reset_all_data(user: dict = Depends(get_current_user)):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM transactions WHERE user_id = ?", (user["id"],))
    cur.execute("DELETE FROM customers WHERE user_id = ?", (user["id"],))
    cur.execute("DELETE FROM products WHERE user_id = ?", (user["id"],))
    cur.execute(
        """UPDATE shops
           SET opening_cash = 0, low_stock_threshold = 5
           WHERE user_id = ?""",
        (user["id"],),
    )
    conn.commit()
    conn.close()
    return {"status": "reset"}


@app.post("/api/shop/toggle")
def toggle_shop(user: dict = Depends(get_current_user)):
    conn = get_db()
    cur = conn.cursor()
    shop = ensure_user_shop(cur, user)
    new_state = 0 if shop["is_open"] == 1 else 1
    cur.execute("UPDATE shops SET is_open = ? WHERE user_id = ?", (new_state, user["id"]))
    conn.commit()
    conn.close()
    return {"is_open": bool(new_state)}


# --- Dashboard ---
@app.get("/api/dashboard")
def get_dashboard(user: dict = Depends(get_current_user)):
    conn = get_db()
    cur = conn.cursor()
    today = datetime.now().strftime("%Y-%m-%d")
    uid = user["id"]

    shop = ensure_user_shop(cur, user)

    todays_sales = cur.execute(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE user_id = ? AND tx_type = 'sale' AND tx_date = ?",
        (uid, today),
    ).fetchone()["total"]

    cash_received = cur.execute(
        """SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
           WHERE user_id = ? AND ((tx_type = 'sale' AND payment_method IN ('Cash', 'UPI')) OR tx_type = 'credit_payment')
           AND tx_date = ?""",
        (uid, today),
    ).fetchone()["total"]

    all_cash_in = cur.execute(
        """SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
           WHERE user_id = ? AND ((tx_type = 'sale' AND payment_method IN ('Cash', 'UPI')) OR tx_type = 'credit_payment')""",
        (uid,),
    ).fetchone()["total"]

    all_expenses = cur.execute(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE user_id = ? AND tx_type = 'expense'",
        (uid,),
    ).fetchone()["total"]

    udhaar_pending = cur.execute(
        "SELECT COALESCE(SUM(total_credit - paid), 0) AS pending FROM customers WHERE user_id = ?",
        (uid,),
    ).fetchone()["pending"]

    todays_expenses = cur.execute(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE user_id = ? AND tx_type = 'expense' AND tx_date = ?",
        (uid, today),
    ).fetchone()["total"]

    cash_balance = shop["opening_cash"] + all_cash_in - all_expenses
    net_profit = todays_sales - todays_expenses

    day_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    chart_data = []
    active_sales_days = []
    active_expense_days = []

    for i in range(6, -1, -1):
        d = datetime.now() - timedelta(days=i)
        d_str = d.strftime("%Y-%m-%d")
        s_val = cur.execute(
            "SELECT COALESCE(SUM(amount), 0) AS s FROM transactions WHERE user_id = ? AND tx_type = 'sale' AND tx_date = ?",
            (uid, d_str),
        ).fetchone()["s"]
        e_val = cur.execute(
            "SELECT COALESCE(SUM(amount), 0) AS e FROM transactions WHERE user_id = ? AND tx_type = 'expense' AND tx_date = ?",
            (uid, d_str),
        ).fetchone()["e"]
        if s_val > 0:
            active_sales_days.append(s_val)
        if e_val > 0:
            active_expense_days.append(e_val)
        chart_data.append({"day": day_labels[d.weekday()], "sales": s_val, "expenses": e_val})

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
        dict(r) for r in cur.execute("SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 6", (uid,)).fetchall()
    ]

    conn.commit()
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


# --- Inventory Products ---
@app.get("/api/products")
def list_products(user: dict = Depends(get_current_user)):
    conn = get_db()
    rows = conn.execute("SELECT * FROM products WHERE user_id = ? ORDER BY id DESC", (user["id"],)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/products")
def add_product(payload: CreateProductRequest, user: dict = Depends(get_current_user)):
    if not payload.name.strip() or payload.price < 0:
        raise HTTPException(status_code=400, detail="Valid product name and selling price are required")
    conn = get_db()
    cur = conn.cursor()
    shop = ensure_user_shop(cur, user)
    thresh = payload.low_stock_threshold if payload.low_stock_threshold is not None else int(shop.get("low_stock_threshold") or 5)
    cur.execute(
        """INSERT INTO products (user_id, name, unit, purchase_price, price, stock, low_stock_threshold)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            user["id"],
            payload.name.strip(),
            _normalize_unit(payload.unit or "unit"),
            max(0.0, float(payload.purchase_price or 0)),
            float(payload.price),
            max(0.0, float(payload.stock or 0)),
            max(1, int(thresh)),
        ),
    )
    conn.commit()
    conn.close()
    return {"status": "ok"}


@app.put("/api/products/{product_id}")
def update_product(product_id: int, payload: UpdateProductRequest, user: dict = Depends(get_current_user)):
    conn = get_db()
    cur = conn.cursor()
    existing = cur.execute(
        "SELECT * FROM products WHERE id = ? AND user_id = ?",
        (product_id, user["id"]),
    ).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Product not found")

    name = payload.name.strip() if payload.name is not None and payload.name.strip() else existing["name"]
    unit = _normalize_unit(payload.unit) if payload.unit is not None and payload.unit.strip() else existing["unit"]
    purchase_price = max(0.0, float(payload.purchase_price)) if payload.purchase_price is not None else float(existing["purchase_price"])
    price = max(0.0, float(payload.price)) if payload.price is not None else float(existing["price"])
    stock = max(0.0, float(payload.stock)) if payload.stock is not None else float(existing["stock"])
    low_thresh = max(1, int(payload.low_stock_threshold)) if payload.low_stock_threshold is not None else int(existing["low_stock_threshold"] or 5)

    cur.execute(
        """UPDATE products
           SET name = ?, unit = ?, purchase_price = ?, price = ?, stock = ?, low_stock_threshold = ?
           WHERE id = ? AND user_id = ?""",
        (name, unit, purchase_price, price, stock, low_thresh, product_id, user["id"]),
    )
    conn.commit()
    conn.close()
    return {"status": "updated"}


@app.post("/api/products/{product_id}/adjust-stock")
def adjust_product_stock(product_id: int, payload: StockDeltaRequest, user: dict = Depends(get_current_user)):
    conn = get_db()
    cur = conn.cursor()
    existing = cur.execute(
        "SELECT * FROM products WHERE id = ? AND user_id = ?",
        (product_id, user["id"]),
    ).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Product not found")

    new_stock = max(0.0, float(existing["stock"]) + float(payload.delta))
    cur.execute(
        "UPDATE products SET stock = ? WHERE id = ? AND user_id = ?",
        (new_stock, product_id, user["id"]),
    )
    conn.commit()
    conn.close()
    return {"status": "adjusted", "stock": new_stock}


@app.delete("/api/products/{product_id}")
def delete_product(product_id: int, user: dict = Depends(get_current_user)):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM products WHERE id = ? AND user_id = ?", (product_id, user["id"]))
    conn.commit()
    conn.close()
    return {"status": "deleted"}


# --- Sales ---
@app.post("/api/sales")
def create_sale(payload: CreateSaleRequest, user: dict = Depends(get_current_user)):
    if not payload.items:
        raise HTTPException(status_code=400, detail="Add at least one item")

    typed_name = (payload.customer_name or "").strip()
    if payload.payment_method == "Credit" and not payload.customer_id and not typed_name:
        raise HTTPException(status_code=400, detail="Enter or select a customer name for Credit (Udhaar) sale")

    conn = get_db()
    cur = conn.cursor()
    uid = user["id"]

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
                "SELECT name, stock, unit FROM products WHERE id = ? AND user_id = ?",
                (item.product_id, uid),
            ).fetchone()
            if row:
                item_names.append(f"{row['name']} x{item.quantity:g}")
                new_stock = max(0.0, float(row["stock"]) - float(item.quantity))
                cur.execute(
                    "UPDATE products SET stock = ? WHERE id = ? AND user_id = ?",
                    (new_stock, item.product_id, uid),
                )
        elif item.custom_name:
            item_names.append(f"{item.custom_name.strip()} x{item.quantity:g}")

    now = datetime.now()
    tx_date = now.strftime("%Y-%m-%d")
    tx_time = now.strftime("%I:%M %p")

    resolved_customer_id = payload.customer_id
    customer_name = None

    if resolved_customer_id:
        cust = cur.execute(
            "SELECT id, name FROM customers WHERE id = ? AND user_id = ?",
            (resolved_customer_id, uid),
        ).fetchone()
        if cust:
            customer_name = cust["name"]
        else:
            resolved_customer_id = None

    if not resolved_customer_id and typed_name:
        existing = cur.execute(
            "SELECT id, name FROM customers WHERE user_id = ? AND LOWER(name) = LOWER(?)",
            (uid, typed_name),
        ).fetchone()
        if existing:
            resolved_customer_id = existing["id"]
            customer_name = existing["name"]
        else:
            default_due = payload.due_date.strip() if payload.due_date else (now + timedelta(days=7)).strftime("%d %b")
            cur.execute(
                "INSERT INTO customers (user_id, name, phone, total_credit, paid, due_date) VALUES (?, ?, '', 0, 0, ?)",
                (uid, typed_name.title(), default_due if payload.payment_method == "Credit" else "-"),
            )
            resolved_customer_id = cur.lastrowid
            customer_name = typed_name.title()

    if payload.payment_method == "Credit" and resolved_customer_id:
        due_str = payload.due_date.strip() if payload.due_date else (now + timedelta(days=7)).strftime("%d %b")
        cur.execute(
            "UPDATE customers SET total_credit = total_credit + ?, due_date = ? WHERE id = ? AND user_id = ?",
            (total_amount, due_str, resolved_customer_id, uid),
        )
        title = f"{customer_name} - Credit"
    else:
        summary = ", ".join(item_names[:2]) if item_names else "Counter Sale"
        title = (
            f"{customer_name} - {payload.payment_method} Sale ({summary})"
            if customer_name
            else f"{payload.payment_method} Sale - {summary}"
        )

    cur.execute(
        """INSERT INTO transactions
           (user_id, tx_type, title, category, payment_method, amount, customer_id, tx_date, tx_time)
           VALUES (?, 'sale', ?, 'Groceries', ?, ?, ?, ?, ?)""",
        (uid, title, payload.payment_method, total_amount, resolved_customer_id, tx_date, tx_time),
    )

    conn.commit()
    conn.close()
    return {"status": "recorded", "total": total_amount, "title": title, "customer_name": customer_name}


# --- Customers / Udhaar ---
@app.get("/api/customers")
def list_customers(user: dict = Depends(get_current_user)):
    conn = get_db()
    rows = conn.execute("SELECT * FROM customers WHERE user_id = ? ORDER BY id ASC", (user["id"],)).fetchall()
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
def add_customer(payload: CreateCustomerRequest, user: dict = Depends(get_current_user)):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Customer name is required")
    conn = get_db()
    cur = conn.cursor()
    uid = user["id"]
    existing = cur.execute(
        "SELECT id, total_credit, paid FROM customers WHERE user_id = ? AND LOWER(name) = LOWER(?)",
        (uid, payload.name.strip()),
    ).fetchone()
    default_due = payload.due_date.strip() or (datetime.now() + timedelta(days=7)).strftime("%d %b")

    if existing:
        new_credit = existing["total_credit"] + max(0.0, payload.initial_credit)
        new_due = default_due if (new_credit - existing["paid"]) > 0 else "-"
        cur.execute(
            "UPDATE customers SET phone = CASE WHEN ? != '' THEN ? ELSE phone END, total_credit = ?, due_date = ? WHERE id = ? AND user_id = ?",
            (payload.phone.strip(), payload.phone.strip(), new_credit, new_due, existing["id"], uid),
        )
    else:
        cur.execute(
            "INSERT INTO customers (user_id, name, phone, total_credit, paid, due_date) VALUES (?, ?, ?, ?, 0, ?)",
            (
                uid,
                payload.name.strip().title(),
                payload.phone.strip(),
                payload.initial_credit,
                default_due if payload.initial_credit > 0 else "-",
            ),
        )
    conn.commit()
    conn.close()
    return {"status": "ok"}


@app.post("/api/customers/{customer_id}/pay")
def record_customer_payment(customer_id: int, payload: CreditPaymentRequest, user: dict = Depends(get_current_user)):
    conn = get_db()
    cur = conn.cursor()
    uid = user["id"]
    cust = cur.execute("SELECT * FROM customers WHERE id = ? AND user_id = ?", (customer_id, uid)).fetchone()
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
        "UPDATE customers SET paid = ?, due_date = ? WHERE id = ? AND user_id = ?",
        (new_paid, new_due, customer_id, uid),
    )

    now = datetime.now()
    cur.execute(
        """INSERT INTO transactions
           (user_id, tx_type, title, category, payment_method, amount, customer_id, tx_date, tx_time)
           VALUES (?, 'credit_payment', ?, 'Udhaar Recovery', ?, ?, ?, ?, ?)""",
        (
            uid,
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


# --- Transactions & Expenses ---
@app.get("/api/transactions")
def list_transactions(user: dict = Depends(get_current_user)):
    conn = get_db()
    rows = conn.execute("SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC", (user["id"],)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/expenses")
def add_expense(payload: CreateExpenseRequest, user: dict = Depends(get_current_user)):
    if not payload.title.strip() or payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Valid expense title and amount are required")
    conn = get_db()
    cur = conn.cursor()
    now = datetime.now()
    cur.execute(
        """INSERT INTO transactions
           (user_id, tx_type, title, category, payment_method, amount, customer_id, tx_date, tx_time)
           VALUES (?, 'expense', ?, ?, ?, ?, NULL, ?, ?)""",
        (
            user["id"],
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
def get_reports(user: dict = Depends(get_current_user)):
    conn = get_db()
    cur = conn.cursor()
    rows = cur.execute(
        "SELECT category, COALESCE(SUM(amount), 0) AS total FROM transactions WHERE user_id = ? AND tx_type = 'expense' GROUP BY category",
        (user["id"],),
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


# --- Voice Command Endpoint (Parse Preview & Confirm Save) ---
@app.post("/api/voice-transaction")
def voice_to_transaction(payload: VoiceTransactionRequest, user: dict = Depends(get_current_user)):
    if payload.confirmed_action:
        saved = execute_parsed_action(payload.confirmed_action, user["id"])
        return {"status": "saved", "parsed": saved}

    if not payload.transcript.strip():
        raise HTTPException(status_code=400, detail="Voice transcript is empty")

    conn = get_db()
    products = [dict(r) for r in conn.execute("SELECT * FROM products WHERE user_id = ?", (user["id"],)).fetchall()]
    customers = [dict(r) for r in conn.execute("SELECT * FROM customers WHERE user_id = ?", (user["id"],)).fetchall()]
    conn.close()

    parsed = parse_voice_with_fallback(payload.transcript, products, customers, payload.language)
    if payload.auto_save:
        saved = execute_parsed_action(parsed, user["id"])
        return {"status": "saved", "parsed": saved}
    return {"status": "parsed", "parsed": parsed}


# --- DukaanAI Assistant ---
def build_comprehensive_assistant_reply(
    msg: str, shop: dict, sales_today: float, exp_today: float, all_sales: float, all_exp: float,
    cash_balance: float, customers: list, products: list, recent_tx: list
) -> str:
    lower = msg.lower().strip()
    owner = shop.get("owner_name") or "Shopkeeper"
    store = shop.get("shop_name") or "your store"

    if any(w in lower for w in ["hello", "hi", "hey", "namaste", "good morning", "good evening"]):
        return (
            f"Namaste {owner}! Welcome to {store}'s assistant. "
            f"Today's sales stand at ₹{sales_today:,.0f}, expenses at ₹{exp_today:,.0f}, and cash in hand is ₹{cash_balance:,.0f}. "
            f"Ask me anything about sales, profit, Udhaar, inventory, expenses, cash flow, or retail tips!"
        )

    matched_cust = None
    for c in customers:
        if c["name"].lower() in lower:
            matched_cust = c
            break

    if matched_cust and any(w in lower for w in ["udhaar", "udhar", "balance", "due", "pending", "credit", "owe", "paid", "khata"]):
        bal = max(0.0, matched_cust["total_credit"] - matched_cust["paid"])
        return (
            f"{matched_cust['name']} has a pending Udhaar balance of ₹{bal:,.0f} "
            f"(Total Credit: ₹{matched_cust['total_credit']:,.0f}, Paid: ₹{matched_cust['paid']:,.0f}, Due Date: {matched_cust['due_date'] or 'N/A'})."
        )

    if any(w in lower for w in ["pending", "udhaar", "udhar", "credit", "khata", "due"]):
        pending_list = [c for c in customers if (c["total_credit"] - c["paid"]) > 0]
        if not pending_list:
            return "No pending Udhaar balances right now — all customers are settled!"
        total_u = sum(c["total_credit"] - c["paid"] for c in pending_list)
        details = ", ".join([f"{c['name']}: ₹{c['total_credit'] - c['paid']:,.0f} (due {c['due_date'] or 'soon'})" for c in pending_list])
        return f"Total pending Udhaar across {len(pending_list)} customer(s) is ₹{total_u:,.0f} — {details}."

    if any(w in lower for w in ["profit", "margin", "earning", "kamai"]):
        today_profit = sales_today - exp_today
        overall_profit = all_sales - all_exp
        margin = (today_profit / sales_today * 100) if sales_today > 0 else 0
        return (
            f"Today's net profit is ₹{today_profit:,.0f} (Sales ₹{sales_today:,.0f} − Expenses ₹{exp_today:,.0f}, {margin:.1f}% margin). "
            f"Overall cumulative net (Sales − Expenses) is ₹{overall_profit:,.0f}."
        )

    if any(w in lower for w in ["cash", "balance", "galla", "drawer", "hand"]):
        return (
            f"Estimated cash & liquid balance is ₹{cash_balance:,.0f} "
            f"(Opening Cash: ₹{shop.get('opening_cash', 0):,.0f} + Cash/UPI/Udhaar inflows − Expenses)."
        )

    if any(w in lower for w in ["today", "sale", "sales", "bikri", "revenue"]) and "forecast" not in lower:
        sale_tx = [t for t in recent_tx if t["tx_type"] == "sale" and t["tx_date"] == datetime.now().strftime("%Y-%m-%d")]
        return (
            f"Today's recorded sales total ₹{sales_today:,.0f} across {len(sale_tx)} sale entry/entries, "
            f"while cumulative recorded sales are ₹{all_sales:,.0f}."
        )

    if any(w in lower for w in ["expense", "expenses", "kharcha", "rent", "electricity", "bill"]):
        cat_map = {}
        for t in recent_tx:
            if t["tx_type"] == "expense":
                cat_map[t["category"]] = cat_map.get(t["category"], 0) + t["amount"]
        cats = ", ".join([f"{k}: ₹{v:,.0f}" for k, v in cat_map.items()]) if cat_map else "no recent category breakdown"
        return f"Today's expenses are ₹{exp_today:,.0f} (Cumulative expenses: ₹{all_exp:,.0f}; recent breakdown: {cats})."

    if any(w in lower for w in ["stock", "inventory", "low", "out of stock", "item", "product", "maalgadi"]):
        if not products:
            return "Your inventory list is currently empty. Add items in the Inventory tab or via Voice Entry to track stock automatically."
        threshold = int(shop.get("low_stock_threshold") or 5)
        out_items = [p for p in products if float(p["stock"]) <= 0]
        low_items = [p for p in products if 0 < float(p["stock"]) <= int(p.get("low_stock_threshold") or threshold)]
        all_items = ", ".join([f"{p['name']} ({p['stock']:g} {p['unit']} @ ₹{p['price']:g})" for p in products])
        alerts = []
        if out_items:
            alerts.append("Out of stock: " + ", ".join([p["name"] for p in out_items]))
        if low_items:
            alerts.append("Low stock: " + ", ".join([f"{p['name']} ({p['stock']:g} {p['unit']})" for p in low_items]))
        if alerts:
            return f"{' | '.join(alerts)}. Full inventory: {all_items}."
        return f"All items are well-stocked: {all_items}."

    if any(w in lower for w in ["cash flow", "forecast", "predict", "next 7", "week", "future"]):
        net = max(0.0, sales_today - exp_today)
        return (
            f"At today's net pace of ₹{net:,.0f}/day, a 7-day baseline run-rate is ₹{net * 7:,.0f}. "
            f"Collecting pending Udhaar can boost short-term liquidity."
        )

    if any(w in lower for w in ["tip", "advice", "grow", "increase", "suggest", "help", "how to", "customer", "reminder"]):
        return (
            f"Practical tips for {store}: (1) Follow up politely on overdue Udhaar every 3–5 days, "
            f"(2) Reorder fast-moving items before hitting low stock, and (3) Bundle high-margin daily essentials near checkout. "
            f"You can also ask me for exact numbers on today's sales, profit, Udhaar, expenses, or stock!"
        )

    return (
        f"Here is a quick snapshot for {store}: Today's Sales = ₹{sales_today:,.0f}, Today's Expenses = ₹{exp_today:,.0f}, "
        f"Cash Balance = ₹{cash_balance:,.0f}, and {len(customers)} customer(s) in Udhaar book. "
        f"Ask me any specific question about your shop, customers, stock, finances, or business growth!"
    )


@app.post("/api/assistant")
def ask_assistant(payload: ChatRequest, user: dict = Depends(get_current_user)):
    msg = payload.message.strip()
    if not msg:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    conn = get_db()
    cur = conn.cursor()
    today = datetime.now().strftime("%Y-%m-%d")
    uid = user["id"]

    shop = ensure_user_shop(cur, user)
    sales_today = cur.execute(
        "SELECT COALESCE(SUM(amount), 0) AS s FROM transactions WHERE user_id = ? AND tx_type = 'sale' AND tx_date = ?",
        (uid, today),
    ).fetchone()["s"]
    exp_today = cur.execute(
        "SELECT COALESCE(SUM(amount), 0) AS e FROM transactions WHERE user_id = ? AND tx_type = 'expense' AND tx_date = ?",
        (uid, today),
    ).fetchone()["e"]
    all_sales = cur.execute(
        "SELECT COALESCE(SUM(amount), 0) AS s FROM transactions WHERE user_id = ? AND tx_type = 'sale'",
        (uid,),
    ).fetchone()["s"]
    all_exp = cur.execute(
        "SELECT COALESCE(SUM(amount), 0) AS e FROM transactions WHERE user_id = ? AND tx_type = 'expense'",
        (uid,),
    ).fetchone()["e"]
    all_cash_in = cur.execute(
        """SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
           WHERE user_id = ? AND ((tx_type = 'sale' AND payment_method IN ('Cash', 'UPI')) OR tx_type = 'credit_payment')""",
        (uid,),
    ).fetchone()["total"]
    cash_balance = shop["opening_cash"] + all_cash_in - all_exp
    customers = [dict(r) for r in cur.execute("SELECT * FROM customers WHERE user_id = ?", (uid,)).fetchall()]
    products = [dict(r) for r in cur.execute("SELECT * FROM products WHERE user_id = ?", (uid,)).fetchall()]
    recent_tx = [dict(r) for r in cur.execute("SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 15", (uid,)).fetchall()]
    conn.commit()
    conn.close()

    lower_msg = msg.lower()
    if any(k in lower_msg for k in ["record ", "add sale", "sold ", "add expense", "spent ", "credit sale"]) or (
        ("udhaar" in lower_msg or "udhar" in lower_msg) and re.search(r"\d+", lower_msg) and any(v in lower_msg for v in ["add", "give", "gave", "record", "paid", "received"])
    ):
        try:
            parsed = parse_voice_with_fallback(msg, products, customers)
            if parsed.get("amount", 0) > 0:
                saved = execute_parsed_action(parsed, uid)
                return {
                    "reply": f"✅ {saved.get('result_message') or 'Recorded entry.'}",
                    "action_taken": True,
                }
        except HTTPException as he:
            return {"reply": f"⚠️ {he.detail}", "action_taken": False}

    client = get_gemini_client()
    if client:
        context = {
            "shop_name": shop["shop_name"],
            "owner_name": shop["owner_name"],
            "todays_sales": sales_today,
            "todays_expenses": exp_today,
            "todays_net_profit": sales_today - exp_today,
            "all_sales": all_sales,
            "all_expenses": all_exp,
            "cash_balance": cash_balance,
            "customers": customers,
            "products": products,
            "recent_transactions": recent_tx,
        }
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=f"""You are DukaanAI, a helpful financial and business assistant for {shop['owner_name']}'s store '{shop['shop_name']}'.

Answer any question asked by the shop owner accurately and helpfully using Indian Rupees (₹).
When answering shop-specific questions, use this live shop data:
{json.dumps(context)}

Shopkeeper question: {msg}""",
            )
            return {
                "reply": response.text.strip(),
                "action_taken": False,
            }
        except Exception as e:
            print("Gemini API Error:", e)

    reply = build_comprehensive_assistant_reply(
        msg, shop, sales_today, exp_today, all_sales, all_exp, cash_balance, customers, products, recent_tx
    )
    return {"reply": reply, "action_taken": False}