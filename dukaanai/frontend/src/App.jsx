import React, { useEffect, useRef, useState } from "react";
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
import { api } from "./api";

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

const QUICK_PROMPTS = [
  "What is today's net profit and cash balance?",
  "Who has pending Udhaar and how much?",
  "Which items are low on stock right now?",
  "Give me practical tips to boost daily sales",
];

function formatINR(val) {
  const num = Number(val || 0);
  return `₹${num.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");

  // Onboarding form state
  const [setupForm, setSetupForm] = useState({
    shop_name: "",
    owner_name: "",
    opening_cash: "",
    phone: "",
    gstin: "",
    address: "",
    low_stock_threshold: "5",
  });
  const [setupError, setSetupError] = useState("");

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

  // Sales form state (supports both selecting existing customer and typing any customer name)
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [customItemName, setCustomItemName] = useState("");
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

  // Inventory form state
  const [prodName, setProdName] = useState("");
  const [prodUnit, setProdUnit] = useState("kg");
  const [prodPrice, setProdPrice] = useState("");
  const [prodStock, setProdStock] = useState("");

  // Assistant state
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Namaste! I'm DukaanAI. Ask me any question about your shop, sales, profit, Udhaar, stock, or business growth — or speak/type a transaction to record it instantly.",
    },
  ]);

  // Notifications state
  const [notifOpen, setNotifOpen] = useState(false);
  const [readNotifIds, setReadNotifIds] = useState([]);

  // Voice recognition state (auto-sends when speech stops)
  const [isListening, setIsListening] = useState(false);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("");
  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef("");

  const [toast, setToast] = useState("");

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? "" : prev));
    }, 3400);
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
    try {
      const shopData = await api.getShop();
      setShop(shopData);
      syncProfileFromShop(shopData);

      if (!shopData.is_configured) {
        setLoading(false);
        return;
      }

      const [dashData, prodData, custData, txData, repData] = await Promise.all([
        api.getDashboard(),
        api.getProducts(),
        api.getCustomers(),
        api.getTransactions(),
        api.getReports(),
      ]);

      setDashboard(dashData);
      setProducts(prodData);
      setCustomers(custData);
      setTransactions(txData);
      setReports(repData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAllData();
  }, []);

  // Build live notifications from shop alerts & recent transactions
  const threshold = Number(shop?.low_stock_threshold || 5);
  const notifications = React.useMemo(() => {
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
      .filter((p) => Number(p.stock || 0) <= threshold)
      .forEach((p) => {
        list.push({
          id: `stock-${p.id}`,
          title: `Low Stock: ${p.name}`,
          detail: `Only ${p.stock} ${p.unit} left in inventory`,
          badge: "Stock",
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

  async function submitVoiceText(textToSend, target = "transaction") {
    const cleaned = (textToSend || "").trim();
    if (!cleaned) return;

    if (target === "assistant") {
      setChatInput("");
      setMessages((prev) => [...prev, { role: "user", text: cleaned }]);
      setChatSending(true);
      try {
        const res = await api.askAssistant(cleaned);
        setMessages((prev) => [...prev, { role: "assistant", text: res.reply }]);
        if (res.action_taken) {
          await refreshAllData();
        }
      } catch (err) {
        setMessages((prev) => [...prev, { role: "assistant", text: `⚠️ ${err.message}` }]);
      } finally {
        setChatSending(false);
      }
      return;
    }

    setVoiceStatus("Auto-sending spoken transaction...");
    try {
      const res = await api.voiceTransaction(cleaned, true);
      const p = res.parsed || {};
      const summary = `Recorded ${String(p.tx_type || "sale").replace("_", " ")}: ${p.title || cleaned} for ${formatINR(p.amount)} (${p.payment_method || "Cash"})`;
      setVoiceStatus(`✅ ${summary}`);
      showToast(`🎤 ${summary}`);
      await refreshAllData();
      setTimeout(() => {
        setVoiceModalOpen(false);
        setVoiceStatus("");
        setVoiceTranscript("");
      }, 1100);
    } catch (err) {
      setVoiceStatus(`⚠️ ${err.message}`);
    }
  }

  function startSpeechRecognition(target = "transaction") {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceModalOpen(true);
      setVoiceStatus("SpeechRecognition not supported in this browser. Type your entry below.");
      return;
    }

    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = true;
    recognition.continuous = false;
    finalTranscriptRef.current = "";

    setIsListening(true);
    if (target === "transaction") {
      setVoiceModalOpen(true);
      setVoiceTranscript("");
      setVoiceStatus("Listening... speak naturally, it will auto-send when you stop.");
    } else {
      setVoiceStatus("Listening to your question... will send automatically.");
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
      setVoiceStatus(`Mic error: ${event.error}. You can type below.`);
    };

    recognition.onend = () => {
      setIsListening(false);
      const spoken = (finalTranscriptRef.current || "").trim();
      if (spoken) {
        submitVoiceText(spoken, target);
      } else if (target === "transaction") {
        setVoiceStatus("No speech detected. Speak again or type below.");
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  async function handleSetupSubmit(e) {
    e.preventDefault();
    setSetupError("");
    if (!setupForm.shop_name.trim() || !setupForm.owner_name.trim()) {
      setSetupError("Please enter both Shop Name and Owner Name.");
      return;
    }
    try {
      await api.setupShop({
        shop_name: setupForm.shop_name.trim(),
        owner_name: setupForm.owner_name.trim(),
        opening_cash: Number(setupForm.opening_cash || 0),
        phone: setupForm.phone.trim(),
        gstin: setupForm.gstin.trim(),
        address: setupForm.address.trim(),
        low_stock_threshold: Number(setupForm.low_stock_threshold || 5),
      });
      showToast("Store setup complete! Welcome to DukaanAI.");
      await refreshAllData();
    } catch (err) {
      setSetupError(err.message);
    }
  }

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

  function handleProductSelect(prodId) {
    setSelectedProductId(prodId);
    const found = products.find((p) => String(p.id) === String(prodId));
    if (found) {
      setUnitPrice(String(found.price));
      setCustomItemName("");
    }
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
    if (price <= 0 || qty <= 0) {
      showToast("Enter valid quantity and unit price");
      return;
    }

    const typedCust = customerInputName.trim();
    if (paymentMethod === "Credit" && !selectedCustomerId && !typedCust) {
      showToast("Enter or select customer name for Credit (Udhaar) sale");
      return;
    }

    const selectedProd = products.find((p) => String(p.id) === String(selectedProductId));
    const itemLabel = selectedProd
      ? `${selectedProd.name} x${qty}`
      : `${(customItemName || "Item").trim()} x${qty}`;

    try {
      const res = await api.createSale({
        items: [
          {
            product_id: selectedProd ? selectedProd.id : null,
            custom_name: selectedProd ? null : (customItemName || "Counter Item").trim(),
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
        itemLabel,
        paymentMethod,
        customerName: resolvedCust,
        total: res.total,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });

      setCustomItemName("");
      setSelectedProductId("");
      setQuantity(1);
      setUnitPrice("");
      setCustomerInputName("");
      setSelectedCustomerId("");
      setDueDate("");
      showToast(`Sale recorded: ${formatINR(res.total)}`);
      await refreshAllData();
    } catch (err) {
      showToast(err.message);
    }
  }

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

  async function handleAddProduct(e) {
    e.preventDefault();
    if (!prodName.trim() || Number(prodPrice || 0) <= 0) return;
    try {
      await api.addProduct({
        name: prodName.trim(),
        unit: prodUnit.trim() || "unit",
        price: Number(prodPrice),
        stock: Number(prodStock || 0),
      });
      setProdName("");
      setProdPrice("");
      setProdStock("");
      showToast("Product added to inventory");
      await refreshAllData();
    } catch (err) {
      showToast(err.message);
    }
  }

  async function handleSendChat(textOverride) {
    const promptText = (typeof textOverride === "string" ? textOverride : chatInput).trim();
    if (!promptText || chatSending) return;
    await submitVoiceText(promptText, "assistant");
  }

  async function handleResetStore() {
    try {
      await api.resetShop();
      setLastReceipt(null);
      setActiveTab("dashboard");
      showToast("All store data reset");
      await refreshAllData();
    } catch (err) {
      showToast(err.message);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
        Loading DukaanAI...
      </div>
    );
  }

  if (!shop || !shop.is_configured) {
    return (
      <div className="login-wrapper">
        <div className="login-hero">
          <div className="hero-badge-pill">
            <Sparkles size={14} /> Smart Indian Shop Accounting & Voice AI
          </div>
          <div className="hero-brand">
            <Store size={42} /> DukaanAI
          </div>
          <div className="hero-tagline">Apni Dukaan, Ab Smart & Voice-First</div>
          <p className="hero-sub">
            Track daily sales, customer Udhaar khata, shop expenses, stock alerts, and instant AI business answers in one clean workspace.
          </p>
          <div className="hero-illustration">
            <div className="hero-mini-row">
              <span>🎤 Auto-Send Voice Khata</span>
              <strong>Instant Entry</strong>
            </div>
            <div className="hero-mini-row">
              <span>📒 Udhaar & Customer Ledger</span>
              <strong>Live Balances</strong>
            </div>
            <div className="hero-mini-row">
              <span>🤖 DukaanAI Shop Copilot</span>
              <strong>Any Question</strong>
            </div>
          </div>
        </div>

        <div className="login-form-side">
          <form className="login-card" onSubmit={handleSetupSubmit}>
            <h1>Set Up Your Shop</h1>
            <p className="subtitle">Launch your store ledger in seconds</p>

            <div className="sample-presets">
              <button
                type="button"
                className="preset-chip"
                onClick={() =>
                  setSetupForm((p) => ({
                    ...p,
                    shop_name: "Sharma Kirana & General Store",
                    owner_name: "Ramesh Sharma",
                    opening_cash: "5000",
                    phone: "9876543210",
                  }))
                }
              >
                ✨ Fill Kirana Sample
              </button>
              <button
                type="button"
                className="preset-chip"
                onClick={() =>
                  setSetupForm((p) => ({
                    ...p,
                    shop_name: "Verma Traders",
                    owner_name: "Amit Verma",
                    opening_cash: "10000",
                    phone: "9811122233",
                  }))
                }
              >
                ✨ Fill Traders Sample
              </button>
            </div>

            {setupError && (
              <div style={{ background: "#fef2f2", color: "#b91c1c", padding: "10px 12px", borderRadius: 10, fontSize: 13, marginBottom: 14, fontWeight: 600 }}>
                {setupError}
              </div>
            )}

            <label className="field-label">Shop Name *</label>
            <div className="input-group">
              <Store size={18} color="#5b32d6" />
              <input
                type="text"
                placeholder="e.g., Sharma Kirana Store"
                value={setupForm.shop_name}
                onChange={(e) => setSetupForm({ ...setupForm, shop_name: e.target.value })}
              />
            </div>

            <label className="field-label">Owner Name *</label>
            <div className="input-group">
              <User size={18} color="#5b32d6" />
              <input
                type="text"
                placeholder="e.g., Ramesh Sharma"
                value={setupForm.owner_name}
                onChange={(e) => setSetupForm({ ...setupForm, owner_name: e.target.value })}
              />
            </div>

            <label className="field-label">Opening Cash Balance (₹)</label>
            <div className="input-group">
              <IndianRupee size={18} color="#5b32d6" />
              <input
                type="number"
                step="any"
                placeholder="0"
                value={setupForm.opening_cash}
                onChange={(e) => setSetupForm({ ...setupForm, opening_cash: e.target.value })}
              />
            </div>

            <label className="field-label">Phone Number (Optional)</label>
            <div className="input-group">
              <Phone size={18} color="#5b32d6" />
              <input
                type="text"
                placeholder="e.g., +91 98765 43210"
                value={setupForm.phone}
                onChange={(e) => setSetupForm({ ...setupForm, phone: e.target.value })}
              />
            </div>

            <button type="submit" className="btn-primary">
              Start My Dukaan <Sparkles size={17} />
            </button>
          </form>
        </div>
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

  const initials = (shop.owner_name || "DU")
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

        <div style={{ padding: "12px 10px", fontSize: 12, color: "#b7aedc" }}>
          <div style={{ fontWeight: 700, color: "#ffffff", marginBottom: 2 }}>{shop.shop_name}</div>
          <div>Owner: {shop.owner_name}</div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <span>{shop.shop_name}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              type="button"
              className={`voice-bar-btn ${isListening ? "listening" : ""}`}
              onClick={() => startSpeechRecognition("transaction")}
            >
              <Mic size={15} />
              <span>{isListening ? "Listening (Auto-Sends)..." : "Voice Entry"}</span>
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

                <label className="field-label">Select Product from Inventory (Optional)</label>
                <div className="input-group">
                  <select value={selectedProductId} onChange={(e) => handleProductSelect(e.target.value)}>
                    <option value="">-- Choose product or type custom item below --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.stock} {p.unit} left @ ₹{p.price})
                      </option>
                    ))}
                  </select>
                </div>

                {!selectedProductId && (
                  <>
                    <label className="field-label">Item / Sale Name</label>
                    <div className="input-group">
                      <input
                        type="text"
                        placeholder="e.g., Basmati Rice 2kg or Kirana Items"
                        value={customItemName}
                        onChange={(e) => setCustomItemName(e.target.value)}
                      />
                    </div>
                  </>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label className="field-label">Quantity</label>
                    <div className="input-group">
                      <input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="field-label">Unit Price (₹)</label>
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
                    {lastReceipt ? "Last recorded bill summary" : "Record a sale on the left to generate a receipt"}
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
                  Tip: Typing a new customer name automatically adds them to Udhaar Book when recorded.
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
            <div className="sale-grid">
              <form className="card" onSubmit={handleAddProduct}>
                <div className="card-header">
                  <h3>Add Inventory Item</h3>
                </div>
                <label className="field-label">Product Name</label>
                <div className="input-group">
                  <input
                    type="text"
                    placeholder="e.g., Toor Dal"
                    value={prodName}
                    onChange={(e) => setProdName(e.target.value)}
                  />
                </div>
                <label className="field-label">Unit</label>
                <div className="input-group">
                  <input
                    type="text"
                    placeholder="kg / packet / litre / pcs"
                    value={prodUnit}
                    onChange={(e) => setProdUnit(e.target.value)}
                  />
                </div>
                <label className="field-label">Selling Price (₹)</label>
                <div className="input-group">
                  <input
                    type="number"
                    step="any"
                    placeholder="0"
                    value={prodPrice}
                    onChange={(e) => setProdPrice(e.target.value)}
                  />
                </div>
                <label className="field-label">Opening Stock</label>
                <div className="input-group">
                  <input
                    type="number"
                    placeholder="0"
                    value={prodStock}
                    onChange={(e) => setProdStock(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn-primary">Add to Inventory</button>
              </form>

              <div className="card">
                <div className="card-header">
                  <h3>Current Stock (Alert ≤ {threshold})</h3>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Price</th>
                      <th>Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 700 }}>{p.name}</td>
                        <td>{formatINR(p.price)} / {p.unit}</td>
                        <td>
                          <span className={`badge ${p.stock <= threshold ? "badge-due" : "badge-cleared"}`}>
                            {p.stock} {p.unit}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                <h3>DukaanAI Assistant (Answers Any Shop or Business Question)</h3>
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
                  placeholder="Ask any question or say 'Sold 2 kg Rice for 120 Cash'..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                  style={{ flex: 1, padding: "12px 14px", borderRadius: 12, border: "1.5px solid var(--border-light)" }}
                />
                <button
                  type="button"
                  className="btn-outline"
                  title="Speak & auto-send question"
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
                Manage your shop configuration or reset all transactions, customers, and inventory to start fresh.
              </p>
              <div style={{ display: "flex", gap: 12 }}>
                <button type="button" className="btn-outline" onClick={() => setActiveTab("profile")}>
                  Edit Shop Profile
                </button>
                <button
                  type="button"
                  style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", padding: "10px 14px", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}
                  onClick={handleResetStore}
                >
                  Reset All Store Data
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {voiceModalOpen && (
        <div className="voice-modal-backdrop" onClick={() => setVoiceModalOpen(false)}>
          <div className="voice-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800 }}>🎤 Voice Transaction (Auto-Send)</h3>
              <button
                type="button"
                onClick={() => setVoiceModalOpen(false)}
                style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14 }}>
              {voiceStatus || "Speak naturally — once you finish speaking, your entry is sent automatically."}
            </p>
            <div className="input-group">
              <input
                type="text"
                placeholder="e.g., Sold 2 kg Rice for 120 Cash or Rahul Udhaar 250"
                value={voiceTranscript}
                onChange={(e) => setVoiceTranscript(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="btn-outline" onClick={() => startSpeechRecognition("transaction")}>
                <Mic size={16} /> {isListening ? "Listening..." : "Speak Again"}
              </button>
              <button type="button" className="btn-primary" onClick={() => submitVoiceText(voiceTranscript, "transaction")}>
                Send Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}