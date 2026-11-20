import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutDashboard,
  ReceiptText,
  ShoppingBag,
  BookOpen,
  Wallet,
  Boxes,
  BarChart3,
  Bot,
  Settings,
  UserCircle2,
  Mic,
  Bell,
  Calendar,
  TrendingUp,
  IndianRupee,
  Clock,
  Sparkles,
  Store,
  User,
  Plus,
  CheckCircle2,
  Send,
  Phone,
  FileText,
  MapPin,
  Mail,
  Lock,
  Eye,
  EyeOff,
  LogOut,
  Search,
  Edit3,
  Trash2,
  AlertTriangle,
  Globe,
  ShieldCheck,
  ArrowRight,
  PackagePlus,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  api,
  clearAuthSession,
  getAuthToken,
  getStoredUser,
  setAuthSession,
} from "./api";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "transactions", label: "Transactions", icon: ReceiptText },
  { id: "sales", label: "Sales", icon: ShoppingBag },
  { id: "udhaar", label: "Udhaar Book", icon: BookOpen },
  { id: "expenses", label: "Expenses", icon: Wallet },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "assistant", label: "DukaanAI Bot", icon: Bot },
  { id: "profile", label: "Profile", icon: UserCircle2 },
  { id: "settings", label: "Settings", icon: Settings },
];

const VOICE_LANGUAGES = [
  { code: "en-IN", label: "English", sample: '"Add 10 kg of rice at ₹60 per kg" or "Sold 2 kg of rice for ₹120"' },
  { code: "hi-IN", label: "हिन्दी (Hindi)", sample: '"10 किलो चावल 60 रुपये के हिसाब से जोड़ो" या "2 किलो चावल 120 में बेचा"' },
  { code: "kn-IN", label: "ಕನ್ನಡ (Kannada)", sample: '"10 ಕೆಜಿ ಅಕ್ಕಿ 60 ರೂಪಾಯಿಗೆ ಸೇರಿಸಿ" ಅಥವಾ "2 ಕೆಜಿ ಅಕ್ಕಿ 120 ರೂಪಾಯಿಗೆ ಮಾರಾಟ"' },
  { code: "ta-IN", label: "தமிழ் (Tamil)", sample: '"10 கிலோ அரிசி 60 ரூபாய்க்கு சேர்" அல்லது "2 கிலோ அரிசி 120 ரூபாய்க்கு விற்றேன்"' },
  { code: "te-IN", label: "తెలుగు (Telugu)", sample: '"10 కిలోల బియ్యం 60 రూపాయలకు జోడించు" లేదా "2 కిలోల బియ్యం 120 కి అమ్మాను"' },
];

const QUICK_PROMPTS = [
  "What is today's net profit and cash balance?",
  "Who has pending Udhaar and how much?",
  "Which items are low on stock or out of stock right now?",
  "Give me practical tips to boost daily sales",
];

function formatINR(val) {
  const num = Number(val || 0);
  return `₹${num.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function App() {
  // Authentication & Route Guard State
  const [authMode, setAuthMode] = useState("login"); // "login" | "register"
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());
  const [authChecking, setAuthChecking] = useState(true);

  // Login Form State
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loginShowPwd, setLoginShowPwd] = useState(false);
  const [loginErrors, setLoginErrors] = useState({});
  const [loginServerError, setLoginServerError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Registration Form State
  const [regForm, setRegForm] = useState({
    owner_name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [regShowPwd, setRegShowPwd] = useState(false);
  const [regErrors, setRegErrors] = useState({});
  const [regServerError, setRegServerError] = useState("");

  // Logout Confirmation Modal State
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);

  // App State
  const [loading, setLoading] = useState(false);
  const [shop, setShop] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    shop_name: "",
    owner_name: "",
    phone: "",
    gstin: "",
    address: "",
    opening_cash: "0",
    low_stock_threshold: "5",
  });
  const [profileSavedMsg, setProfileSavedMsg] = useState("");

  // Dashboard & Data states
  const [dashboard, setDashboard] = useState(null);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [reports, setReports] = useState({ expense_breakdown: [] });

  // Sales form state (with Searchable Product Selection)
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isCustomSaleItem, setIsCustomSaleItem] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState("");
  const [customerInputName, setCustomerInputName] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [lastReceipt, setLastReceipt] = useState(null);

  // Udhaar Book state
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustCredit, setNewCustCredit] = useState("");
  const [newCustDue, setNewCustDue] = useState("");
  const [payAmounts, setPayAmounts] = useState({});

  // Expenses form state
  const [expTitle, setExpTitle] = useState("");
  const [expCategory, setExpCategory] = useState("Electricity");
  const [expAmount, setExpAmount] = useState("");
  const [expMethod, setExpMethod] = useState("Cash");

  // Inventory Management state
  const [prodName, setProdName] = useState("");
  const [prodUnit, setProdUnit] = useState("kg");
  const [prodPurchasePrice, setProdPurchasePrice] = useState("");
  const [prodPrice, setProdPrice] = useState("");
  const [prodStock, setProdStock] = useState("");
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryFilter, setInventoryFilter] = useState("all"); // "all" | "low" | "out"
  const [editingProduct, setEditingProduct] = useState(null);

  // Assistant state
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Namaste! I'm DukaanAI. Ask me any question about your shop, sales, profit, Udhaar, stock, or business growth.",
    },
  ]);

  // Notifications state
  const [notifOpen, setNotifOpen] = useState(false);
  const [readNotifIds, setReadNotifIds] = useState([]);

  // Multilingual Voice Assistant + Confirmation Preview State
  const [voiceLanguage, setVoiceLanguage] = useState("en-IN");
  const [isListening, setIsListening] = useState(false);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("");
  const [voiceParsing, setVoiceParsing] = useState(false);
  const [pendingVoiceAction, setPendingVoiceAction] = useState(null);
  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef("");

  const [toast, setToast] = useState("");

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? "" : prev));
    }, 3600);
  }

  function syncProfileFromShop(shopData) {
    if (!shopData) return;
    setProfileForm({
      shop_name: shopData.shop_name || "",
      owner_name: shopData.owner_name || "",
      phone: shopData.phone || "",
      gstin: shopData.gstin || "",
      address: shopData.address || "",
      opening_cash: String(shopData.opening_cash ?? 0),
      low_stock_threshold: String(shopData.low_stock_threshold ?? 5),
    });
  }

  async function refreshAllData() {
    setLoading(true);
    try {
      const [shopData, dashData, prodData, custData, txData, repData] =
        await Promise.all([
          api.getShop(),
          api.getDashboard(),
          api.getProducts(),
          api.getCustomers(),
          api.getTransactions(),
          api.getReports(),
        ]);

      setShop(shopData);
      syncProfileFromShop(shopData);
      setDashboard(dashData);
      setProducts(prodData);
      setCustomers(custData);
      setTransactions(txData);
      setReports(repData);
    } catch (err) {
      if (err.status === 401) {
        setCurrentUser(null);
        setAuthMode("login");
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Verify existing session on load
  useEffect(() => {
    async function verifySession() {
      const token = getAuthToken();
      if (!token) {
        setCurrentUser(null);
        setAuthChecking(false);
        return;
      }
      try {
        const res = await api.getMe();
        setCurrentUser(res.user);
        setAuthChecking(false);
        await refreshAllData();
      } catch {
        clearAuthSession();
        setCurrentUser(null);
        setAuthChecking(false);
      }
    }
    verifySession();
  }, []);

  // --- Registration & Login Handlers ---
  function validateRegistration() {
    const errs = {};
    if (!regForm.owner_name.trim() || regForm.owner_name.trim().length < 2) {
      errs.owner_name = "Please enter the shop owner's full name.";
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(regForm.email.trim())) {
      errs.email = "Please enter a valid email address.";
    }
    const digits = regForm.phone.replace(/\D/g, "");
    if (digits.length < 10) {
      errs.phone = "Please enter a valid 10-digit phone number.";
    }
    if (!regForm.password || regForm.password.length < 6) {
      errs.password = "Password must be at least 6 characters.";
    }
    setRegErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleRegisterSubmit(e) {
    e.preventDefault();
    setRegServerError("");
    if (!validateRegistration()) return;

    setAuthSubmitting(true);
    try {
      const res = await api.register({
        owner_name: regForm.owner_name.trim(),
        email: regForm.email.trim(),
        phone: regForm.phone.trim(),
        password: regForm.password,
      });
      setAuthSession(res.token, res.user);
      setCurrentUser(res.user);
      setActiveTab("dashboard");
      setRegForm({ owner_name: "", email: "", phone: "", password: "" });
      showToast(`Welcome to DukaanAI, ${res.user.owner_name}!`);
      await refreshAllData();
    } catch (err) {
      setRegServerError(err.message);
    } finally {
      setAuthSubmitting(false);
    }
  }

  function validateLogin() {
    const errs = {};
    if (!loginForm.email.trim()) {
      errs.email = "Please enter your registered email or phone number.";
    }
    if (!loginForm.password) {
      errs.password = "Please enter your password.";
    }
    setLoginErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleLoginSubmit(e) {
    e.preventDefault();
    setLoginServerError("");
    if (!validateLogin()) return;

    setAuthSubmitting(true);
    try {
      const res = await api.login({
        email: loginForm.email.trim(),
        password: loginForm.password,
      });
      setAuthSession(res.token, res.user);
      setCurrentUser(res.user);
      setActiveTab("dashboard");
      setLoginForm({ email: "", password: "" });
      showToast(`Welcome back, ${res.user.owner_name}!`);
      await refreshAllData();
    } catch (err) {
      setLoginServerError(err.message);
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleConfirmLogout() {
    try {
      await api.logout();
    } catch {
      // Ignore network errors on logout
    }
    clearAuthSession();
    setCurrentUser(null);
    setShop(null);
    setDashboard(null);
    setProducts([]);
    setCustomers([]);
    setTransactions([]);
    setLastReceipt(null);
    setLogoutModalOpen(false);
    setAuthMode("login");
  }

  // --- Notifications ---
  const threshold = Number(shop?.low_stock_threshold || 5);
  const notifications = useMemo(() => {
    const list = [];
    customers
      .filter((c) => Number(c.balance || 0) > 0)
      .forEach((c) => {
        list.push({
          id: `udhaar-${c.id}`,
          title: `Pending Udhaar: ${c.name}`,
          detail: `${formatINR(c.balance)} due (${c.due_date || "Upcoming"})`,
          badge: "Udhaar",
        });
      });

    products
      .filter((p) => Number(p.stock || 0) <= Number(p.low_stock_threshold || threshold))
      .forEach((p) => {
        const isOut = Number(p.stock || 0) <= 0;
        list.push({
          id: `stock-${p.id}`,
          title: isOut ? `Out of Stock: ${p.name}` : `Low Stock: ${p.name}`,
          detail: isOut
            ? "0 units remaining — restock immediately"
            : `Only ${p.stock} ${p.unit} left in inventory`,
          badge: isOut ? "Out" : "Low Stock",
        });
      });

    transactions.slice(0, 5).forEach((t) => {
      list.push({
        id: `tx-${t.id}`,
        title: t.title,
        detail: `${formatINR(t.amount)} via ${t.payment_method} • ${t.tx_time}`,
        badge: t.tx_type === "expense" ? "Expense" : "Entry",
      });
    });

    return list;
  }, [customers, products, transactions, threshold]);

  const unreadCount = notifications.filter((n) => !readNotifIds.includes(n.id)).length;

  function handleMarkAllRead() {
    setReadNotifIds(notifications.map((n) => n.id));
  }

  // --- Multilingual Voice Recognition & Two-Step Confirmation ---
  async function analyzeVoiceTranscript(textToParse) {
    const cleaned = (textToParse || "").trim();
    if (!cleaned) {
      setVoiceStatus("Please speak or type a command first.");
      return;
    }
    setVoiceParsing(true);
    setPendingVoiceAction(null);
    setVoiceStatus("Recognizing command and extracting details...");
    try {
      const res = await api.parseVoiceCommand(cleaned, voiceLanguage);
      setPendingVoiceAction(res.parsed);
      setVoiceStatus("Review the extracted details below and confirm to save.");
    } catch (err) {
      setVoiceStatus(`⚠️ ${err.message}`);
    } finally {
      setVoiceParsing(false);
    }
  }

  async function handleConfirmVoiceAction() {
    if (!pendingVoiceAction) return;
    setVoiceParsing(true);
    try {
      const res = await api.confirmVoiceAction(
        pendingVoiceAction,
        voiceTranscript,
        voiceLanguage
      );
      const msg =
        res.parsed?.result_message ||
        "Action confirmed and saved successfully!";
      showToast(`✅ ${msg}`);
      setVoiceStatus(`✅ ${msg}`);
      setPendingVoiceAction(null);
      await refreshAllData();
      setTimeout(() => {
        setVoiceModalOpen(false);
        setVoiceTranscript("");
        setVoiceStatus("");
      }, 1100);
    } catch (err) {
      setVoiceStatus(`⚠️ ${err.message}`);
    } finally {
      setVoiceParsing(false);
    }
  }

  function startSpeechRecognition(target = "transaction") {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceModalOpen(true);
      setVoiceStatus(
        "Browser speech recognition is unavailable here. Type your command below in your chosen language."
      );
      return;
    }

    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = voiceLanguage;
    recognition.interimResults = true;
    recognition.continuous = false;
    finalTranscriptRef.current = "";

    setIsListening(true);
    if (target === "transaction") {
      setVoiceModalOpen(true);
      setPendingVoiceAction(null);
      setVoiceTranscript("");
      const langObj = VOICE_LANGUAGES.find((l) => l.code === voiceLanguage);
      setVoiceStatus(
        `Listening in ${langObj?.label || voiceLanguage}... speak now.`
      );
    }

    recognition.onresult = (event) => {
      let interim = "";
      let finalText = finalTranscriptRef.current;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += `${chunk} `;
        } else {
          interim += chunk;
        }
      }
      finalTranscriptRef.current = finalText.trim();
      const display = (finalTranscriptRef.current || interim).trim();
      if (target === "transaction") {
        setVoiceTranscript(display);
      } else {
        setChatInput(display);
      }
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      setVoiceStatus(`Mic error (${event.error}). You can type your command below.`);
    };

    recognition.onend = () => {
      setIsListening(false);
      const spoken = (finalTranscriptRef.current || "").trim();
      if (spoken && target === "transaction") {
        analyzeVoiceTranscript(spoken);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  // --- Profile & Shop Handlers ---
  async function handleProfileSave(e) {
    e.preventDefault();
    setProfileSavedMsg("");
    try {
      await api.updateProfile({
        shop_name: profileForm.shop_name.trim(),
        owner_name: profileForm.owner_name.trim(),
        phone: profileForm.phone.trim(),
        gstin: profileForm.gstin.trim(),
        address: profileForm.address.trim(),
        opening_cash: Number(profileForm.opening_cash || 0),
        low_stock_threshold: Number(profileForm.low_stock_threshold || 5),
      });
      setProfileSavedMsg("Profile details updated!");
      showToast("Shop & owner profile saved!");
      await refreshAllData();
    } catch (err) {
      setProfileSavedMsg(`⚠️ ${err.message}`);
    }
  }

  async function handleToggleShop() {
    try {
      const res = await api.toggleShop();
      showToast(res.is_open ? "Shop status set to OPEN" : "Shop status set to CLOSED");
      await refreshAllData();
    } catch (err) {
      showToast(err.message);
    }
  }

  // --- Searchable Product Selection in Sales ---
  const matchingProducts = useMemo(() => {
    const q = productSearchQuery.trim().toLowerCase();
    if (!q) return products.slice(0, 8);
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.unit || "").toLowerCase().includes(q)
    );
  }, [products, productSearchQuery]);

  function handleSelectInventoryProduct(prod) {
    setSelectedProduct(prod);
    setIsCustomSaleItem(false);
    setProductSearchQuery(prod.name);
    setUnitPrice(String(prod.price));
    setQuantity(1);
    setShowProductDropdown(false);
  }

  function handleUseCustomSaleItem() {
    setSelectedProduct(null);
    setIsCustomSaleItem(true);
    setShowProductDropdown(false);
  }

  function handleCustomerNameInput(val) {
    setCustomerInputName(val);
    const exactMatch = customers.find(
      (c) => c.name.trim().toLowerCase() === val.trim().toLowerCase()
    );
    setSelectedCustomerId(exactMatch ? String(exactMatch.id) : "");
  }

  async function handleRecordSale(e) {
    e.preventDefault();
    const qty = Number(quantity || 1);
    const price = Number(unitPrice || 0);
    const itemTitle = selectedProduct
      ? selectedProduct.name
      : productSearchQuery.trim();

    if (!itemTitle) {
      showToast("Search and select a product or enter a custom item name");
      return;
    }
    if (price <= 0 || qty <= 0) {
      showToast("Enter valid quantity and selling price");
      return;
    }

    const typedCust = customerInputName.trim();
    if (paymentMethod === "Credit" && !selectedCustomerId && !typedCust) {
      showToast("Enter or select customer name for Credit (Udhaar) sale");
      return;
    }

    try {
      const res = await api.createSale({
        items: [
          {
            product_id: selectedProduct ? selectedProduct.id : null,
            custom_name: selectedProduct ? null : itemTitle,
            quantity: qty,
            unit_price: price,
          },
        ],
        payment_method: paymentMethod,
        customer_id: selectedCustomerId ? Number(selectedCustomerId) : null,
        customer_name: typedCust,
        due_date: dueDate,
      });

      const resolvedCust =
        res.customer_name ||
        typedCust ||
        customers.find((c) => String(c.id) === String(selectedCustomerId))?.name ||
        "Walk-in";

      setLastReceipt({
        title: res.title,
        itemLabel: `${itemTitle} x${qty}`,
        paymentMethod,
        customerName: resolvedCust,
        total: res.total,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });

      setProductSearchQuery("");
      setSelectedProduct(null);
      setIsCustomSaleItem(false);
      setQuantity(1);
      setUnitPrice("");
      setCustomerInputName("");
      setSelectedCustomerId("");
      setDueDate("");
      showToast(`Sale recorded: ${formatINR(res.total)} (Inventory updated)`);
      await refreshAllData();
    } catch (err) {
      showToast(err.message);
    }
  }

  // --- Udhaar & Expenses ---
  async function handleAddCustomer(e) {
    e.preventDefault();
    if (!newCustName.trim()) return;
    try {
      await api.addCustomer({
        name: newCustName.trim(),
        phone: newCustPhone.trim(),
        initial_credit: Number(newCustCredit || 0),
        due_date: newCustDue.trim(),
      });
      setNewCustName("");
      setNewCustPhone("");
      setNewCustCredit("");
      setNewCustDue("");
      showToast("Customer added to Udhaar Book");
      await refreshAllData();
    } catch (err) {
      showToast(err.message);
    }
  }

  async function handleCustomerPayment(custId) {
    const amt = Number(payAmounts[custId] || 0);
    if (amt <= 0) {
      showToast("Enter payment amount");
      return;
    }
    try {
      const res = await api.payCustomer(custId, amt, "Cash");
      setPayAmounts((prev) => ({ ...prev, [custId]: "" }));
      showToast(`Received ${formatINR(res.paid_amount)} Udhaar payment`);
      await refreshAllData();
    } catch (err) {
      showToast(err.message);
    }
  }

  async function handleAddExpense(e) {
    e.preventDefault();
    if (!expTitle.trim() || Number(expAmount || 0) <= 0) return;
    try {
      await api.addExpense({
        title: expTitle.trim(),
        category: expCategory,
        amount: Number(expAmount),
        payment_method: expMethod,
      });
      setExpTitle("");
      setExpAmount("");
      showToast("Expense recorded");
      await refreshAllData();
    } catch (err) {
      showToast(err.message);
    }
  }

  // --- Inventory Management Handlers ---
  async function handleAddProduct(e) {
    e.preventDefault();
    if (!prodName.trim() || Number(prodPrice || 0) < 0) {
      showToast("Enter product name and valid selling price");
      return;
    }
    try {
      await api.addProduct({
        name: prodName.trim(),
        unit: prodUnit.trim() || "unit",
        purchase_price: Number(prodPurchasePrice || 0),
        price: Number(prodPrice || 0),
        stock: Number(prodStock || 0),
      });
      setProdName("");
      setProdPurchasePrice("");
      setProdPrice("");
      setProdStock("");
      showToast("Product added to inventory");
      await refreshAllData();
    } catch (err) {
      showToast(err.message);
    }
  }

  async function handleQuickStockChange(productId, delta) {
    try {
      await api.adjustStock(productId, delta);
      await refreshAllData();
    } catch (err) {
      showToast(err.message);
    }
  }

  async function handleSaveEditedProduct(e) {
    e.preventDefault();
    if (!editingProduct) return;
    try {
      await api.updateProduct(editingProduct.id, {
        name: editingProduct.name,
        unit: editingProduct.unit,
        purchase_price: Number(editingProduct.purchase_price || 0),
        price: Number(editingProduct.price || 0),
        stock: Number(editingProduct.stock || 0),
      });
      setEditingProduct(null);
      showToast("Product details updated");
      await refreshAllData();
    } catch (err) {
      showToast(err.message);
    }
  }

  async function handleDeleteProduct(prod) {
    if (!window.confirm(`Delete "${prod.name}" from inventory?`)) return;
    try {
      await api.deleteProduct(prod.id);
      showToast(`Deleted ${prod.name}`);
      await refreshAllData();
    } catch (err) {
      showToast(err.message);
    }
  }

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const q = inventorySearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.unit || "").toLowerCase().includes(q);
      const itemThresh = Number(p.low_stock_threshold || threshold);
      const isOut = Number(p.stock) <= 0;
      const isLow = !isOut && Number(p.stock) <= itemThresh;

      if (inventoryFilter === "out") return matchesSearch && isOut;
      if (inventoryFilter === "low") return matchesSearch && isLow;
      return matchesSearch;
    });
  }, [products, inventorySearch, inventoryFilter, threshold]);

  const lowStockCount = products.filter((p) => {
    const t = Number(p.low_stock_threshold || threshold);
    return Number(p.stock) > 0 && Number(p.stock) <= t;
  }).length;
  const outOfStockCount = products.filter((p) => Number(p.stock) <= 0).length;

  // --- Assistant Chat ---
  async function handleSendChat(textOverride) {
    const promptText = (typeof textOverride === "string" ? textOverride : chatInput).trim();
    if (!promptText || chatSending) return;
    setChatInput("");
    setMessages((prev) => [...prev, { role: "user", text: promptText }]);
    setChatSending(true);
    try {
      const res = await api.askAssistant(promptText);
      setMessages((prev) => [...prev, { role: "assistant", text: res.reply }]);
      if (res.action_taken) {
        await refreshAllData();
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", text: `⚠️ ${err.message}` }]);
    } finally {
      setChatSending(false);
    }
  }

  async function handleResetStore() {
    if (!window.confirm("Reset all transactions, inventory, and customer records for your shop?")) {
      return;
    }
    try {
      await api.resetShop();
      setLastReceipt(null);
      setActiveTab("dashboard");
      showToast("Shop data reset");
      await refreshAllData();
    } catch (err) {
      showToast(err.message);
    }
  }

  if (authChecking) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
        Verifying DukaanAI session...
      </div>
    );
  }

  // --- Unauthenticated View: Separate Creative Professional Login & Registration Pages ---
  if (!currentUser) {
    return (
      <div className="auth-wrapper">
        <div className="auth-hero">
          <div className="auth-grid-overlay" />
          <div className="auth-orb auth-orb-1" />
          <div className="auth-orb auth-orb-2" />

          <div className="hero-top-bar">
            <div className="hero-brand-lockup">
              <div className="hero-brand-icon">
                <Store size={24} color="#ffffff" />
              </div>
              <span className="hero-brand-title">DukaanAI</span>
            </div>
            <div className="hero-badge-pill">
              <Sparkles size={13} /> Voice-First Retail OS
            </div>
          </div>

          <div className="hero-center-content">
            <h2 className="hero-headline">
              Run Your Dukaan with <span>Voice, Clarity & AI</span>
            </h2>
            <p className="hero-sub">
              Record bills by speaking in your own language, auto-update stock, manage customer Udhaar khata, and track live daily profit from one secure shop account.
            </p>

            <div className="hero-showcase-card">
              <div className="showcase-header">
                <span>🎙️ MULTILINGUAL VOICE COMMANDS</span>
                <span style={{ color: "#6ee7b7" }}>● Ready</span>
              </div>
              <div className="showcase-pill-row">
                <span className="lang-tag">English</span>
                <span className="lang-tag">ಕನ್ನಡ</span>
                <span className="lang-tag">हिन्दी</span>
                <span className="lang-tag">தமிழ்</span>
                <span className="lang-tag">తెలుగు</span>
              </div>
              <div className="hero-mini-row">
                <span>“Add 10 kg of rice at ₹60 per kg”</span>
                <strong style={{ color: "#a78bfa" }}>+10 kg Stock</strong>
              </div>
              <div className="hero-mini-row">
                <span>“Sold 2 oil bottles on credit to Ramesh”</span>
                <strong style={{ color: "#6ee7b7" }}>Udhaar + Auto-Stock</strong>
              </div>
            </div>
          </div>

          <div className="hero-footer-stats">
            <div className="hero-stat-item">
              <strong>5 Languages</strong>
              <span>Regional voice support</span>
            </div>
            <div className="hero-stat-item">
              <strong>100% Isolated</strong>
              <span>Private shop ledger per owner</span>
            </div>
            <div className="hero-stat-item">
              <strong>Real-Time</strong>
              <span>Auto stock & profit sync</span>
            </div>
          </div>
        </div>

        <div className="auth-form-side">
          <div className="auth-card">
            <div className="auth-switcher">
              <button
                type="button"
                className={`auth-switch-btn ${authMode === "login" ? "active" : ""}`}
                onClick={() => {
                  setAuthMode("login");
                  setLoginServerError("");
                  setLoginErrors({});
                }}
              >
                Owner Login
              </button>
              <button
                type="button"
                className={`auth-switch-btn ${authMode === "register" ? "active" : ""}`}
                onClick={() => {
                  setAuthMode("register");
                  setRegServerError("");
                  setRegErrors({});
                }}
              >
                Create Account
              </button>
            </div>

            {authMode === "login" ? (
              <form onSubmit={handleLoginSubmit} noValidate>
                <h1>Welcome Back</h1>
                <p className="subtitle">Sign in to access your shop dashboard & inventory</p>

                {loginServerError && (
                  <div style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", padding: "10px 12px", borderRadius: 11, fontSize: 13, marginBottom: 14, fontWeight: 600 }}>
                    {loginServerError}
                  </div>
                )}

                <label className="field-label">Email or Phone Number</label>
                <div className={`input-group ${loginErrors.email ? "has-error" : ""}`}>
                  <Mail size={18} color="#5b32d6" />
                  <input
                    type="text"
                    placeholder="owner@shop.com or 9876543210"
                    value={loginForm.email}
                    onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                  />
                </div>
                {loginErrors.email && <div className="field-error-text">{loginErrors.email}</div>}

                <label className="field-label">Password</label>
                <div className={`input-group ${loginErrors.password ? "has-error" : ""}`}>
                  <Lock size={18} color="#5b32d6" />
                  <input
                    type={loginShowPwd ? "text" : "password"}
                    placeholder="Enter your password"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  />
                  <button
                    type="button"
                    className="eye-toggle-btn"
                    aria-label="Toggle password visibility"
                    onClick={() => setLoginShowPwd((v) => !v)}
                  >
                    {loginShowPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {loginErrors.password && <div className="field-error-text">{loginErrors.password}</div>}

                <button type="submit" className="btn-primary" disabled={authSubmitting}>
                  {authSubmitting ? "Signing in..." : "Login to Dashboard"} <ArrowRight size={17} />
                </button>

                <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-muted)", marginTop: 18 }}>
                  New shop owner?{" "}
                  <button
                    type="button"
                    onClick={() => setAuthMode("register")}
                    style={{ background: "none", border: "none", color: "var(--primary)", fontWeight: 700, cursor: "pointer" }}
                  >
                    Register your shop here
                  </button>
                </p>
              </form>
            ) : (
              <form onSubmit={handleRegisterSubmit} noValidate>
                <h1>Register Your Shop</h1>
                <p className="subtitle">Create a secure shop owner account in seconds</p>

                {regServerError && (
                  <div style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", padding: "10px 12px", borderRadius: 11, fontSize: 13, marginBottom: 14, fontWeight: 600 }}>
                    {regServerError}
                  </div>
                )}

                <label className="field-label">Shop Owner&apos;s Name *</label>
                <div className={`input-group ${regErrors.owner_name ? "has-error" : ""}`}>
                  <User size={18} color="#5b32d6" />
                  <input
                    type="text"
                    placeholder="e.g., Ramesh Sharma"
                    value={regForm.owner_name}
                    onChange={(e) => setRegForm({ ...regForm, owner_name: e.target.value })}
                  />
                </div>
                {regErrors.owner_name && <div className="field-error-text">{regErrors.owner_name}</div>}

                <label className="field-label">Email Address *</label>
                <div className={`input-group ${regErrors.email ? "has-error" : ""}`}>
                  <Mail size={18} color="#5b32d6" />
                  <input
                    type="email"
                    placeholder="e.g., ramesh@kirana.in"
                    value={regForm.email}
                    onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                  />
                </div>
                {regErrors.email && <div className="field-error-text">{regErrors.email}</div>}

                <label className="field-label">Phone Number *</label>
                <div className={`input-group ${regErrors.phone ? "has-error" : ""}`}>
                  <Phone size={18} color="#5b32d6" />
                  <input
                    type="tel"
                    placeholder="e.g., 9876543210"
                    value={regForm.phone}
                    onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                  />
                </div>
                {regErrors.phone && <div className="field-error-text">{regErrors.phone}</div>}

                <label className="field-label">Password *</label>
                <div className={`input-group ${regErrors.password ? "has-error" : ""}`}>
                  <Lock size={18} color="#5b32d6" />
                  <input
                    type={regShowPwd ? "text" : "password"}
                    placeholder="Minimum 6 characters"
                    value={regForm.password}
                    onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                  />
                  <button
                    type="button"
                    className="eye-toggle-btn"
                    aria-label="Toggle password visibility"
                    onClick={() => setRegShowPwd((v) => !v)}
                  >
                    {regShowPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {regErrors.password && <div className="field-error-text">{regErrors.password}</div>}

                <button type="submit" className="btn-primary" disabled={authSubmitting}>
                  {authSubmitting ? "Creating Account..." : "Create Shop Account"} <ShieldCheck size={17} />
                </button>

                <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-muted)", marginTop: 18 }}>
                  Already registered?{" "}
                  <button
                    type="button"
                    onClick={() => setAuthMode("login")}
                    style={{ background: "none", border: "none", color: "var(--primary)", fontWeight: 700, cursor: "pointer" }}
                  >
                    Sign in
                  </button>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (loading || !shop) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
        Loading {currentUser.owner_name}&apos;s shop...
      </div>
    );
  }

  const kpis = dashboard?.kpis || {
    todays_sales: 0,
    cash_received: 0,
    udhaar_pending: 0,
    cash_balance: 0,
    net_profit: 0,
    forecast_range: "Record sales to generate forecast",
  };

  const initials = (shop.owner_name || currentUser.owner_name || "DU")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const todayFormatted = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const currentLangLabel =
    VOICE_LANGUAGES.find((l) => l.code === voiceLanguage)?.label.split(" ")[0] || "English";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="sidebar-logo">
            <Store size={24} color="#a78bfa" />
            <span>DukaanAI</span>
          </div>
          <nav className="nav-list">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={`nav-item ${activeTab === item.id ? "active" : ""}`}
                  onClick={() => setActiveTab(item.id)}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div style={{ padding: "12px 10px", fontSize: 12, color: "#b7aedc", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ fontWeight: 700, color: "#ffffff", marginBottom: 2 }}>{shop.shop_name}</div>
          <div>Owner: {shop.owner_name}</div>
          <button
            type="button"
            className="sidebar-logout-btn"
            onClick={() => setLogoutModalOpen(true)}
          >
            <LogOut size={15} /> Logout
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <span>{shop.shop_name}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className={`voice-bar-btn ${isListening ? "listening" : ""}`}
              onClick={() => {
                setVoiceModalOpen(true);
                setPendingVoiceAction(null);
                setVoiceStatus("");
              }}
            >
              <Mic size={15} />
              <span>Voice Assistant ({currentLangLabel})</span>
            </button>

            <button
              type="button"
              className={`shop-pill ${shop.is_open ? "" : "closed"}`}
              onClick={handleToggleShop}
            >
              <span className="dot" />
              <span>{shop.is_open ? "Shop Open" : "Shop Closed"}</span>
            </button>

            <button
              type="button"
              className="bell-btn"
              title="Notifications"
              onClick={() => setNotifOpen((prev) => !prev)}
            >
              <Bell size={17} />
              {unreadCount > 0 && <span className="bell-badge">{unreadCount}</span>}
            </button>

            <button
              type="button"
              className="avatar"
              title="Open Shop & Owner Profile"
              onClick={() => setActiveTab("profile")}
            >
              {initials}
            </button>

            <button
              type="button"
              className="btn-danger-outline"
              title="Logout"
              onClick={() => setLogoutModalOpen(true)}
            >
              <LogOut size={15} />
              <span>Logout</span>
            </button>
          </div>

          {notifOpen && (
            <div className="notif-dropdown">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <strong style={{ fontSize: 14 }}>Notifications ({unreadCount} unread)</strong>
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  style={{ background: "none", border: "none", color: "var(--primary)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                >
                  Mark all read
                </button>
              </div>
              {notifications.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No new alerts right now.</p>
              ) : (
                notifications.map((n) => {
                  const isUnread = !readNotifIds.includes(n.id);
                  return (
                    <div key={n.id} className={`notif-item ${isUnread ? "unread" : ""}`}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginBottom: 2 }}>
                        <span>{n.title}</span>
                        <span style={{ fontSize: 11, color: "var(--primary)" }}>{n.badge}</span>
                      </div>
                      <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{n.detail}</div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </header>

        {toast && (
          <div style={{ margin: "14px 28px 0", background: "#25195e", color: "#ffffff", padding: "10px 16px", borderRadius: 12, fontSize: 13, fontWeight: 700 }}>
            {toast}
          </div>
        )}

        <main className="page-content">
          {activeTab === "dashboard" && (
            <>
              <div className="greeting-row">
                <div>
                  <h2>Namaste, {shop.owner_name}!</h2>
                  <p>Here is the live financial overview for {shop.shop_name}</p>
                </div>
                <div className="date-chip">
                  <Calendar size={15} color="#5b32d6" />
                  <span>{todayFormatted}</span>
                </div>
              </div>

              {(outOfStockCount > 0 || lowStockCount > 0) && (
                <div
                  style={{
                    background: "#fff7ed",
                    border: "1px solid #fed7aa",
                    borderRadius: 14,
                    padding: "12px 18px",
                    marginBottom: 18,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 700, color: "#9a3412" }}>
                    <AlertTriangle size={18} color="#ea580c" />
                    <span>
                      Inventory Alert: {outOfStockCount} out-of-stock item(s) and {lowStockCount} low-stock item(s).
                    </span>
                  </div>
                  <button type="button" className="btn-outline" onClick={() => setActiveTab("inventory")}>
                    Manage Inventory
                  </button>
                </div>
              )}

              <div className="kpi-grid">
                <div className="kpi-card tint-purple">
                  <div className="kpi-icon" style={{ background: "#5b32d6" }}><IndianRupee size={17} /></div>
                  <div className="kpi-label">Today&apos;s Sales</div>
                  <div className="kpi-val">{formatINR(kpis.todays_sales)}</div>
                </div>
                <div className="kpi-card tint-green">
                  <div className="kpi-icon" style={{ background: "#16a34a" }}><Wallet size={17} /></div>
                  <div className="kpi-label">Cash Received</div>
                  <div className="kpi-val">{formatINR(kpis.cash_received)}</div>
                </div>
                <div className="kpi-card tint-amber">
                  <div className="kpi-icon" style={{ background: "#ea580c" }}><Clock size={17} /></div>
                  <div className="kpi-label">Udhaar Pending</div>
                  <div className="kpi-val">{formatINR(kpis.udhaar_pending)}</div>
                </div>
                <div className="kpi-card tint-blue">
                  <div className="kpi-icon" style={{ background: "#2563eb" }}><IndianRupee size={17} /></div>
                  <div className="kpi-label">Cash Balance</div>
                  <div className="kpi-val">{formatINR(kpis.cash_balance)}</div>
                </div>
                <div className="kpi-card tint-mint">
                  <div className="kpi-icon" style={{ background: "#0d9488" }}><TrendingUp size={17} /></div>
                  <div className="kpi-label">Net Profit</div>
                  <div className="kpi-val">{formatINR(kpis.net_profit)}</div>
                </div>
              </div>

              <div className="mid-grid">
                <div className="card">
                  <div className="card-header">
                    <h3>Sales vs. Expenses (Last 7 Days)</h3>
                  </div>
                  <div style={{ width: "100%", height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dashboard?.chart || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#efeafd" />
                        <XAxis dataKey="day" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="sales" name="Sales (₹)" fill="#5b32d6" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="expenses" name="Expenses (₹)" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <h3>Recent Transactions</h3>
                    <button type="button" className="btn-outline" onClick={() => setActiveTab("transactions")}>
                      View All
                    </button>
                  </div>
                  {(dashboard?.recent_transactions || []).length === 0 ? (
                    <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No transactions recorded yet.</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Entry</th>
                          <th>Mode</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(dashboard?.recent_transactions || []).map((tx) => (
                          <tr key={tx.id}>
                            <td>
                              <div style={{ fontWeight: 700 }}>{tx.title}</div>
                              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{tx.tx_time}</div>
                            </td>
                            <td>{tx.payment_method}</td>
                            <td style={{ fontWeight: 700, color: tx.tx_type === "expense" ? "#dc2626" : "#15803d" }}>
                              {tx.tx_type === "expense" ? "-" : "+"}
                              {formatINR(tx.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="forecast-banner">
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#5b32d6" }}>7-DAY CASH-FLOW FORECAST</div>
                  <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{kpis.forecast_range}</div>
                </div>
                <button type="button" className="btn-outline" onClick={() => setActiveTab("assistant")}>
                  Ask DukaanAI Bot
                </button>
              </div>
            </>
          )}

          {activeTab === "transactions" && (
            <div className="card">
              <div className="card-header">
                <h3>All Transactions</h3>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Payment</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t.id}>
                      <td>{t.tx_date} • {t.tx_time}</td>
                      <td style={{ fontWeight: 700 }}>{t.title}</td>
                      <td>{t.category}</td>
                      <td>{t.payment_method}</td>
                      <td style={{ fontWeight: 700, color: t.tx_type === "expense" ? "#dc2626" : "#15803d" }}>
                        {t.tx_type === "expense" ? "-" : "+"}
                        {formatINR(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "sales" && (
            <div className="sale-grid">
              <form className="card" onSubmit={handleRecordSale}>
                <div className="card-header">
                  <h3>Record New Sale</h3>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => {
                      setVoiceModalOpen(true);
                      setPendingVoiceAction(null);
                      setVoiceStatus("");
                    }}
                  >
                    <Mic size={15} /> Voice Sale
                  </button>
                </div>

                <div className="tab-row">
                  {["Cash", "UPI", "Credit"].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`tab-btn ${paymentMethod === mode ? "active" : ""}`}
                      onClick={() => setPaymentMethod(mode)}
                    >
                      {mode === "Credit" ? "Credit (Udhaar)" : mode}
                    </button>
                  ))}
                </div>

                {/* Searchable Product Selection Field */}
                <label className="field-label">Search Product or Enter Custom Item *</label>
                <div className="product-search-wrap">
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    <Search size={17} color="#5b32d6" />
                    <input
                      type="text"
                      placeholder="Type a few letters (e.g. Rice, Biscuit, Oil) or custom item..."
                      value={productSearchQuery}
                      onFocus={() => setShowProductDropdown(true)}
                      onChange={(e) => {
                        const val = e.target.value;
                        setProductSearchQuery(val);
                        setShowProductDropdown(true);
                        if (selectedProduct && selectedProduct.name.toLowerCase() !== val.trim().toLowerCase()) {
                          setSelectedProduct(null);
                        }
                      }}
                    />
                    {productSearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setProductSearchQuery("");
                          setSelectedProduct(null);
                          setIsCustomSaleItem(false);
                          setUnitPrice("");
                        }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontWeight: 700 }}
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {showProductDropdown && (
                    <div className="product-suggestions">
                      {matchingProducts.map((p) => (
                        <div
                          key={p.id}
                          className="suggestion-item"
                          onClick={() => handleSelectInventoryProduct(p)}
                        >
                          <div>
                            <strong>{p.name}</strong>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                              Selling Price: {formatINR(p.price)} / {p.unit}
                            </div>
                          </div>
                          <span className={`badge ${Number(p.stock) <= 0 ? "badge-out" : Number(p.stock) <= threshold ? "badge-due" : "badge-cleared"}`}>
                            {p.stock} {p.unit} in stock
                          </span>
                        </div>
                      ))}
                      {productSearchQuery.trim() && (
                        <div
                          className="suggestion-item custom-action"
                          onClick={handleUseCustomSaleItem}
                        >
                          <span>+ Use &ldquo;{productSearchQuery.trim()}&rdquo; as custom item</span>
                          <span>Custom</span>
                        </div>
                      )}
                      {matchingProducts.length === 0 && !productSearchQuery.trim() && (
                        <div style={{ padding: 12, fontSize: 13, color: "var(--text-muted)" }}>
                          No inventory items yet. Type an item name above to enter a custom sale item.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {selectedProduct && (
                  <div
                    style={{
                      background: "#f4f1ff",
                      border: "1px solid #d8ccff",
                      borderRadius: 11,
                      padding: "9px 13px",
                      marginBottom: 14,
                      fontSize: 13,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>
                      <strong>{selectedProduct.name}</strong> • Available Stock:{" "}
                      <strong style={{ color: Number(selectedProduct.stock) <= 0 ? "#dc2626" : "#15803d" }}>
                        {selectedProduct.stock} {selectedProduct.unit}
                      </strong>
                    </span>
                    <span style={{ color: "var(--primary)", fontWeight: 700 }}>
                      {formatINR(selectedProduct.price)} / {selectedProduct.unit}
                    </span>
                  </div>
                )}

                {isCustomSaleItem && !selectedProduct && productSearchQuery.trim() && (
                  <div style={{ fontSize: 12, color: "var(--primary)", fontWeight: 700, marginBottom: 12 }}>
                    Recording &ldquo;{productSearchQuery.trim()}&rdquo; as a custom item (not deducted from inventory)
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label className="field-label">
                      Quantity {selectedProduct ? `(${selectedProduct.unit})` : ""}
                    </label>
                    <div className="input-group">
                      <input
                        type="number"
                        step="any"
                        min="0.1"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="field-label">Selling Price (₹)</label>
                    <div className="input-group">
                      <input
                        type="number"
                        step="any"
                        placeholder="0"
                        value={unitPrice}
                        onChange={(e) => setUnitPrice(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {selectedProduct && Number(quantity) > Number(selectedProduct.stock) && (
                  <div style={{ color: "#c2410c", fontSize: 12, fontWeight: 700, marginTop: -8, marginBottom: 12 }}>
                    ⚠️ Requested quantity ({quantity}) exceeds available stock ({selectedProduct.stock} {selectedProduct.unit}).
                  </div>
                )}

                <label className="field-label">
                  Customer Name {paymentMethod === "Credit" ? "*" : "(Select existing or type new name)"}
                </label>
                <div className="input-group">
                  <User size={17} color="#5b32d6" />
                  <input
                    type="text"
                    list="sales-customer-list"
                    placeholder="Type customer name or pick from list..."
                    value={customerInputName}
                    onChange={(e) => handleCustomerNameInput(e.target.value)}
                  />
                  <datalist id="sales-customer-list">
                    {customers.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </div>

                {paymentMethod === "Credit" && (
                  <>
                    <label className="field-label">Due Date (Optional)</label>
                    <div className="input-group">
                      <input
                        type="text"
                        placeholder="e.g., 28 Nov"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                      />
                    </div>
                  </>
                )}

                <button type="submit" className="btn-primary">
                  <Plus size={18} /> Record Sale ({formatINR((Number(quantity || 1)) * (Number(unitPrice || 0)))})
                </button>
              </form>

              <div className="receipt-card">
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Live Sale Receipt</h3>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
                    {lastReceipt ? "Last recorded bill summary" : "Search a product or enter a custom item to record a sale"}
                  </p>
                  {lastReceipt && (
                    <div style={{ background: "#ffffff", borderRadius: 14, padding: 18, border: "1px solid var(--border-light)" }}>
                      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>{shop.shop_name}</div>
                      <div style={{ fontSize: 13, marginBottom: 6 }}><strong>Entry:</strong> {lastReceipt.title}</div>
                      <div style={{ fontSize: 13, marginBottom: 6 }}><strong>Customer:</strong> {lastReceipt.customerName}</div>
                      <div style={{ fontSize: 13, marginBottom: 6 }}><strong>Payment:</strong> {lastReceipt.paymentMethod}</div>
                      <div style={{ fontSize: 13, marginBottom: 10 }}><strong>Time:</strong> {lastReceipt.time}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "var(--primary)", borderTop: "1px dashed #ddd", paddingTop: 10 }}>
                        Total: {formatINR(lastReceipt.total)}
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 16 }}>
                  Inventory quantities deduct automatically whenever an inventory product is sold.
                </div>
              </div>
            </div>
          )}

          {activeTab === "udhaar" && (
            <div style={{ display: "grid", gap: 20 }}>
              <form className="card" onSubmit={handleAddCustomer}>
                <div className="card-header">
                  <h3>Add Customer / Udhaar Entry</h3>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                  <input
                    type="text"
                    placeholder="Customer Name *"
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    style={{ padding: 11, borderRadius: 10, border: "1.5px solid var(--border-light)" }}
                  />
                  <input
                    type="text"
                    placeholder="Phone Number"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    style={{ padding: 11, borderRadius: 10, border: "1.5px solid var(--border-light)" }}
                  />
                  <input
                    type="number"
                    step="any"
                    placeholder="Udhaar Amount (₹)"
                    value={newCustCredit}
                    onChange={(e) => setNewCustCredit(e.target.value)}
                    style={{ padding: 11, borderRadius: 10, border: "1.5px solid var(--border-light)" }}
                  />
                  <input
                    type="text"
                    placeholder="Due Date (e.g. 30 Nov)"
                    value={newCustDue}
                    onChange={(e) => setNewCustDue(e.target.value)}
                    style={{ padding: 11, borderRadius: 10, border: "1.5px solid var(--border-light)" }}
                  />
                </div>
                <div style={{ marginTop: 14 }}>
                  <button type="submit" className="btn-outline">
                    <Plus size={16} /> Save to Udhaar Book
                  </button>
                </div>
              </form>

              <div className="card">
                <div className="card-header">
                  <h3>Customer Udhaar Ledger</h3>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Phone</th>
                      <th>Total Credit</th>
                      <th>Paid</th>
                      <th>Balance Due</th>
                      <th>Due Date</th>
                      <th>Status</th>
                      <th>Record Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 700 }}>{c.name}</td>
                        <td>{c.phone || "—"}</td>
                        <td>{formatINR(c.total_credit)}</td>
                        <td>{formatINR(c.paid)}</td>
                        <td style={{ fontWeight: 800, color: c.balance > 0 ? "#c2410c" : "#15803d" }}>
                          {formatINR(c.balance)}
                        </td>
                        <td>{c.due_date || "—"}</td>
                        <td>
                          <span className={`badge ${c.balance > 0 ? "badge-due" : "badge-cleared"}`}>
                            {c.status}
                          </span>
                        </td>
                        <td>
                          {c.balance > 0 ? (
                            <div style={{ display: "flex", gap: 6 }}>
                              <input
                                type="number"
                                placeholder="₹ Amt"
                                value={payAmounts[c.id] || ""}
                                onChange={(e) => setPayAmounts((prev) => ({ ...prev, [c.id]: e.target.value }))}
                                style={{ width: 84, padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border-light)" }}
                              />
                              <button type="button" className="btn-outline" onClick={() => handleCustomerPayment(c.id)}>
                                Settle
                              </button>
                            </div>
                          ) : (
                            <span>Settled</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "expenses" && (
            <div className="sale-grid">
              <form className="card" onSubmit={handleAddExpense}>
                <div className="card-header">
                  <h3>Add Shop Expense</h3>
                </div>
                <label className="field-label">Expense Title</label>
                <div className="input-group">
                  <input
                    type="text"
                    placeholder="e.g., Shop Electricity Bill"
                    value={expTitle}
                    onChange={(e) => setExpTitle(e.target.value)}
                  />
                </div>
                <label className="field-label">Category</label>
                <div className="input-group">
                  <select value={expCategory} onChange={(e) => setExpCategory(e.target.value)}>
                    <option value="Electricity">Electricity</option>
                    <option value="Rent">Rent</option>
                    <option value="Others">Others</option>
                  </select>
                </div>
                <label className="field-label">Amount (₹)</label>
                <div className="input-group">
                  <input
                    type="number"
                    step="any"
                    placeholder="0"
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                  />
                </div>
                <label className="field-label">Payment Method</label>
                <div className="input-group">
                  <select value={expMethod} onChange={(e) => setExpMethod(e.target.value)}>
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                  </select>
                </div>
                <button type="submit" className="btn-primary">Save Expense</button>
              </form>

              <div className="card">
                <div className="card-header">
                  <h3>Recorded Expenses</h3>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Category</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions
                      .filter((t) => t.tx_type === "expense")
                      .map((eItem) => (
                        <tr key={eItem.id}>
                          <td style={{ fontWeight: 700 }}>{eItem.title}</td>
                          <td>{eItem.category}</td>
                          <td style={{ fontWeight: 700, color: "#dc2626" }}>-{formatINR(eItem.amount)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "inventory" && (
            <div style={{ display: "grid", gap: 20 }}>
              {/* Quick Add Product Form */}
              <form className="card" onSubmit={handleAddProduct}>
                <div className="card-header">
                  <h3>Add Inventory Item</h3>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => {
                      setVoiceModalOpen(true);
                      setPendingVoiceAction(null);
                      setVoiceStatus("");
                    }}
                  >
                    <Mic size={15} /> Add via Voice
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 12 }}>
                  <div>
                    <label className="field-label">Product Name *</label>
                    <div className="input-group" style={{ marginBottom: 0 }}>
                      <input
                        type="text"
                        placeholder="e.g., Basmati Rice"
                        value={prodName}
                        onChange={(e) => setProdName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="field-label">Unit</label>
                    <div className="input-group" style={{ marginBottom: 0 }}>
                      <select value={prodUnit} onChange={(e) => setProdUnit(e.target.value)}>
                        <option value="kg">kg</option>
                        <option value="g">g</option>
                        <option value="L">L</option>
                        <option value="ml">ml</option>
                        <option value="packets">packets</option>
                        <option value="bottles">bottles</option>
                        <option value="pcs">pcs</option>
                        <option value="boxes">boxes</option>
                        <option value="unit">unit</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="field-label">Purchase Price (₹)</label>
                    <div className="input-group" style={{ marginBottom: 0 }}>
                      <input
                        type="number"
                        step="any"
                        placeholder="0"
                        value={prodPurchasePrice}
                        onChange={(e) => setProdPurchasePrice(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="field-label">Selling Price (₹) *</label>
                    <div className="input-group" style={{ marginBottom: 0 }}>
                      <input
                        type="number"
                        step="any"
                        placeholder="0"
                        value={prodPrice}
                        onChange={(e) => setProdPrice(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="field-label">Available Qty *</label>
                    <div className="input-group" style={{ marginBottom: 0 }}>
                      <input
                        type="number"
                        step="any"
                        placeholder="0"
                        value={prodStock}
                        onChange={(e) => setProdStock(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 14 }}>
                  <button type="submit" className="btn-primary" style={{ width: "auto" }}>
                    <PackagePlus size={17} /> Add Product to Inventory
                  </button>
                </div>
              </form>

              {/* Inventory List with Search, Stock Alerts & Quick Edit/Delete */}
              <div className="card">
                <div className="card-header">
                  <div>
                    <h3>Product Inventory ({products.length} items)</h3>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                      Low-stock threshold: ≤ {threshold} units •{" "}
                      <span style={{ color: "#c2410c", fontWeight: 700 }}>{lowStockCount} Low Stock</span> •{" "}
                      <span style={{ color: "#b91c1c", fontWeight: 700 }}>{outOfStockCount} Out of Stock</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <div className="input-group" style={{ marginBottom: 0, padding: "7px 12px", width: 240 }}>
                      <Search size={15} color="#5b32d6" />
                      <input
                        type="text"
                        placeholder="Search products..."
                        value={inventorySearch}
                        onChange={(e) => setInventorySearch(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      className={`tab-btn ${inventoryFilter === "all" ? "active" : ""}`}
                      onClick={() => setInventoryFilter("all")}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className={`tab-btn ${inventoryFilter === "low" ? "active" : ""}`}
                      onClick={() => setInventoryFilter("low")}
                    >
                      Low Stock ({lowStockCount})
                    </button>
                    <button
                      type="button"
                      className={`tab-btn ${inventoryFilter === "out" ? "active" : ""}`}
                      onClick={() => setInventoryFilter("out")}
                    >
                      Out of Stock ({outOfStockCount})
                    </button>
                  </div>
                </div>

                {filteredProducts.length === 0 ? (
                  <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
                    No matching products found. Add products above or via Voice Assistant.
                  </p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Product Name</th>
                        <th>Purchase Price</th>
                        <th>Selling Price</th>
                        <th>Available Quantity</th>
                        <th>Unit</th>
                        <th>Stock Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((p) => {
                        const isOut = Number(p.stock) <= 0;
                        const isLow = !isOut && Number(p.stock) <= Number(p.low_stock_threshold || threshold);
                        return (
                          <tr key={p.id}>
                            <td style={{ fontWeight: 700 }}>{p.name}</td>
                            <td>{formatINR(p.purchase_price)}</td>
                            <td style={{ fontWeight: 700 }}>{formatINR(p.price)}</td>
                            <td>
                              <div className="stock-pill-qty">
                                <button
                                  type="button"
                                  className="qty-step-btn"
                                  title="Decrease stock by 1"
                                  onClick={() => handleQuickStockChange(p.id, -1)}
                                >
                                  −
                                </button>
                                <strong style={{ minWidth: 32, textAlign: "center" }}>{p.stock}</strong>
                                <button
                                  type="button"
                                  className="qty-step-btn"
                                  title="Increase stock by 1"
                                  onClick={() => handleQuickStockChange(p.id, 1)}
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td>{p.unit}</td>
                            <td>
                              {isOut ? (
                                <span className="badge badge-out">Out of Stock</span>
                              ) : isLow ? (
                                <span className="badge badge-due">Low Stock</span>
                              ) : (
                                <span className="badge badge-cleared">In Stock</span>
                              )}
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button
                                  type="button"
                                  className="btn-outline"
                                  onClick={() => setEditingProduct({ ...p })}
                                >
                                  <Edit3 size={14} /> Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn-danger-outline"
                                  onClick={() => handleDeleteProduct(p)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {activeTab === "reports" && (
            <div className="card">
              <div className="card-header">
                <h3>Expense Breakdown Report</h3>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Total Spend</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {(reports.expense_breakdown || []).map((row) => (
                    <tr key={row.category}>
                      <td style={{ fontWeight: 700 }}>{row.category}</td>
                      <td>{formatINR(row.amount)}</td>
                      <td>{row.percent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "assistant" && (
            <div className="chat-box">
              <div className="card-header">
                <h3>DukaanAI Assistant</h3>
              </div>

              <div className="chip-grid">
                {QUICK_PROMPTS.map((q) => (
                  <button key={q} type="button" className="prompt-chip" onClick={() => handleSendChat(q)}>
                    {q}
                  </button>
                ))}
              </div>

              <div style={{ maxHeight: 340, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
                {messages.map((m, idx) => (
                  <div
                    key={idx}
                    style={{
                      alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                      background: m.role === "user" ? "var(--primary)" : "#f5f2ff",
                      color: m.role === "user" ? "#ffffff" : "var(--text-dark)",
                      padding: "11px 15px",
                      borderRadius: 14,
                      maxWidth: "85%",
                      fontSize: 14,
                      lineHeight: 1.45,
                    }}
                  >
                    {m.text}
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  placeholder="Ask any question about sales, Udhaar, profit, or stock..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                  style={{ flex: 1, padding: "12px 14px", borderRadius: 12, border: "1.5px solid var(--border-light)" }}
                />
                <button
                  type="button"
                  className="btn-outline"
                  title="Speak question"
                  onClick={() => startSpeechRecognition("assistant")}
                >
                  <Mic size={16} />
                </button>
                <button type="button" className="btn-primary" style={{ width: "auto" }} onClick={() => handleSendChat()}>
                  <Send size={16} /> {chatSending ? "..." : "Ask"}
                </button>
              </div>
            </div>
          )}

          {activeTab === "profile" && (
            <form className="card" style={{ maxWidth: 680 }} onSubmit={handleProfileSave}>
              <div className="card-header">
                <h3>Shop & Owner Profile</h3>
              </div>

              {profileSavedMsg && (
                <div style={{ background: "#ecfdf5", color: "#15803d", padding: "10px 14px", borderRadius: 10, marginBottom: 14, fontWeight: 700, fontSize: 13 }}>
                  <CheckCircle2 size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />
                  {profileSavedMsg}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label className="field-label">Shop Name *</label>
                  <div className="input-group">
                    <Store size={17} color="#5b32d6" />
                    <input
                      type="text"
                      value={profileForm.shop_name}
                      onChange={(e) => setProfileForm({ ...profileForm, shop_name: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="field-label">Owner Name *</label>
                  <div className="input-group">
                    <User size={17} color="#5b32d6" />
                    <input
                      type="text"
                      value={profileForm.owner_name}
                      onChange={(e) => setProfileForm({ ...profileForm, owner_name: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="field-label">Phone Number</label>
                  <div className="input-group">
                    <Phone size={17} color="#5b32d6" />
                    <input
                      type="text"
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="field-label">GSTIN (Optional)</label>
                  <div className="input-group">
                    <FileText size={17} color="#5b32d6" />
                    <input
                      type="text"
                      value={profileForm.gstin}
                      onChange={(e) => setProfileForm({ ...profileForm, gstin: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="field-label">Opening Cash (₹)</label>
                  <div className="input-group">
                    <IndianRupee size={17} color="#5b32d6" />
                    <input
                      type="number"
                      step="any"
                      value={profileForm.opening_cash}
                      onChange={(e) => setProfileForm({ ...profileForm, opening_cash: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="field-label">Low-Stock Alert Threshold</label>
                  <div className="input-group">
                    <Boxes size={17} color="#5b32d6" />
                    <input
                      type="number"
                      min="1"
                      value={profileForm.low_stock_threshold}
                      onChange={(e) => setProfileForm({ ...profileForm, low_stock_threshold: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <label className="field-label">Shop Address</label>
              <div className="input-group">
                <MapPin size={17} color="#5b32d6" />
                <input
                  type="text"
                  placeholder="Street, area, city, pincode"
                  value={profileForm.address}
                  onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                />
              </div>

              <button type="submit" className="btn-primary">Save Profile Changes</button>
            </form>
          )}

          {activeTab === "settings" && (
            <div className="card" style={{ maxWidth: 560 }}>
              <div className="card-header">
                <h3>Store Settings</h3>
              </div>
              <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 18 }}>
                Account: <strong>{currentUser.email}</strong> • Manage your shop profile or reset your store data.
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button type="button" className="btn-outline" onClick={() => setActiveTab("profile")}>
                  Edit Shop Profile
                </button>
                <button
                  type="button"
                  className="btn-danger-outline"
                  onClick={handleResetStore}
                >
                  Reset Store Data
                </button>
                <button
                  type="button"
                  className="btn-danger-outline"
                  onClick={() => setLogoutModalOpen(true)}
                >
                  <LogOut size={15} /> Logout
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="modal-backdrop" onClick={() => setEditingProduct(null)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSaveEditedProduct}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800 }}>Edit Inventory Product</h3>
              <button type="button" onClick={() => setEditingProduct(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>
                ✕
              </button>
            </div>

            <label className="field-label">Product Name</label>
            <div className="input-group">
              <input
                type="text"
                value={editingProduct.name}
                onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="field-label">Unit</label>
                <div className="input-group">
                  <input
                    type="text"
                    value={editingProduct.unit}
                    onChange={(e) => setEditingProduct({ ...editingProduct, unit: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="field-label">Available Stock</label>
                <div className="input-group">
                  <input
                    type="number"
                    step="any"
                    value={editingProduct.stock}
                    onChange={(e) => setEditingProduct({ ...editingProduct, stock: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="field-label">Purchase Price (₹)</label>
                <div className="input-group">
                  <input
                    type="number"
                    step="any"
                    value={editingProduct.purchase_price}
                    onChange={(e) => setEditingProduct({ ...editingProduct, purchase_price: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="field-label">Selling Price (₹)</label>
                <div className="input-group">
                  <input
                    type="number"
                    step="any"
                    value={editingProduct.price}
                    onChange={(e) => setEditingProduct({ ...editingProduct, price: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button type="button" className="btn-outline" onClick={() => setEditingProduct(null)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Multilingual Voice Assistant Modal (Inventory + Sales + Confirmation Preview) */}
      {voiceModalOpen && (
        <div className="modal-backdrop" onClick={() => setVoiceModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800 }}>🎙️ Multilingual Voice Assistant</h3>
              <button
                type="button"
                onClick={() => setVoiceModalOpen(false)}
                style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {/* Regional Language Selector */}
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
              <Globe size={14} color="#5b32d6" /> Select Preferred Language:
            </div>
            <div className="lang-selector-row">
              {VOICE_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  className={`lang-chip ${voiceLanguage === lang.code ? "active" : ""}`}
                  onClick={() => setVoiceLanguage(lang.code)}
                >
                  {lang.label}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 12, color: "var(--text-muted)", background: "#faf8ff", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border-light)", marginBottom: 12 }}>
              <strong>Examples:</strong>{" "}
              {VOICE_LANGUAGES.find((l) => l.code === voiceLanguage)?.sample}
            </div>

            <label className="field-label">Recognised Command (Edit or Speak)</label>
            <div className="input-group" style={{ marginBottom: 10 }}>
              <input
                type="text"
                placeholder="Speak or type command here..."
                value={voiceTranscript}
                onChange={(e) => setVoiceTranscript(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <button
                type="button"
                className="btn-outline"
                onClick={() => startSpeechRecognition("transaction")}
              >
                <Mic size={16} /> {isListening ? "Listening..." : "Start Speaking"}
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={voiceParsing || !voiceTranscript.trim()}
                onClick={() => analyzeVoiceTranscript(voiceTranscript)}
              >
                {voiceParsing ? "Extracting..." : "Extract Details"}
              </button>
            </div>

            {voiceStatus && (
              <p style={{ fontSize: 13, fontWeight: 600, color: voiceStatus.startsWith("⚠️") ? "#dc2626" : "var(--primary)", marginBottom: 8 }}>
                {voiceStatus}
              </p>
            )}

            {/* Extracted Details Confirmation Preview */}
            {pendingVoiceAction && (
              <div className="confirm-preview-box">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <strong style={{ fontSize: 14, color: "var(--primary)" }}>
                    {pendingVoiceAction.action_type === "add_inventory"
                      ? "📦 Confirm Inventory Addition"
                      : pendingVoiceAction.action_type === "sale"
                      ? "🧾 Confirm Sale Entry"
                      : "✅ Confirm Transaction"}
                  </strong>
                  <span className="badge badge-cleared">
                    {pendingVoiceAction.action_type.replace("_", " ").toUpperCase()}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
                  {pendingVoiceAction.product_name && (
                    <div>
                      <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Product</span>
                      <input
                        type="text"
                        value={pendingVoiceAction.product_name || ""}
                        onChange={(e) =>
                          setPendingVoiceAction({ ...pendingVoiceAction, product_name: e.target.value })
                        }
                        style={{ width: "100%", padding: "6px 8px", borderRadius: 8, border: "1px solid #d5c7ff", marginTop: 2 }}
                      />
                    </div>
                  )}

                  <div>
                    <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Quantity ({pendingVoiceAction.unit || "unit"})</span>
                    <input
                      type="number"
                      step="any"
                      value={pendingVoiceAction.quantity ?? 1}
                      onChange={(e) => {
                        const q = Number(e.target.value || 0);
                        const up = Number(pendingVoiceAction.unit_price || 0);
                        setPendingVoiceAction({
                          ...pendingVoiceAction,
                          quantity: q,
                          amount: up > 0 ? Number((q * up).toFixed(2)) : pendingVoiceAction.amount,
                        });
                      }}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: 8, border: "1px solid #d5c7ff", marginTop: 2 }}
                    />
                  </div>

                  <div>
                    <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Unit Price (₹)</span>
                    <input
                      type="number"
                      step="any"
                      value={pendingVoiceAction.unit_price ?? 0}
                      onChange={(e) => {
                        const up = Number(e.target.value || 0);
                        const q = Number(pendingVoiceAction.quantity || 1);
                        setPendingVoiceAction({
                          ...pendingVoiceAction,
                          unit_price: up,
                          amount: Number((q * up).toFixed(2)),
                        });
                      }}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: 8, border: "1px solid #d5c7ff", marginTop: 2 }}
                    />
                  </div>

                  <div>
                    <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Total Amount (₹)</span>
                    <input
                      type="number"
                      step="any"
                      value={pendingVoiceAction.amount ?? 0}
                      onChange={(e) =>
                        setPendingVoiceAction({ ...pendingVoiceAction, amount: Number(e.target.value || 0) })
                      }
                      style={{ width: "100%", padding: "6px 8px", borderRadius: 8, border: "1px solid #d5c7ff", marginTop: 2, fontWeight: 700 }}
                    />
                  </div>

                  {pendingVoiceAction.action_type !== "add_inventory" && (
                    <>
                      <div>
                        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Payment Mode</span>
                        <select
                          value={pendingVoiceAction.payment_method || "Cash"}
                          onChange={(e) =>
                            setPendingVoiceAction({ ...pendingVoiceAction, payment_method: e.target.value })
                          }
                          style={{ width: "100%", padding: "6px 8px", borderRadius: 8, border: "1px solid #d5c7ff", marginTop: 2 }}
                        >
                          <option value="Cash">Cash</option>
                          <option value="UPI">UPI</option>
                          <option value="Credit">Credit (Udhaar)</option>
                        </select>
                      </div>

                      <div>
                        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Customer (for Credit)</span>
                        <input
                          type="text"
                          placeholder="Optional"
                          value={pendingVoiceAction.customer_name || ""}
                          onChange={(e) =>
                            setPendingVoiceAction({ ...pendingVoiceAction, customer_name: e.target.value })
                          }
                          style={{ width: "100%", padding: "6px 8px", borderRadius: 8, border: "1px solid #d5c7ff", marginTop: 2 }}
                        />
                      </div>
                    </>
                  )}
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setPendingVoiceAction(null)}
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={voiceParsing}
                    onClick={handleConfirmVoiceAction}
                  >
                    <CheckCircle2 size={16} /> Confirm & Save
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {logoutModalOpen && (
        <div className="modal-backdrop" onClick={() => setLogoutModalOpen(false)}>
          <div className="modal-card" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 8 }}>Confirm Logout</h3>
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 20 }}>
              Are you sure you want to log out of <strong>{shop.shop_name}</strong>? You will need to sign in again to access your shop dashboard.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="btn-outline"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => setLogoutModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ flex: 1, background: "#dc2626" }}
                onClick={handleConfirmLogout}
              >
                <LogOut size={16} /> Yes, Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}