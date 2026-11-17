import React, { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  ArrowLeftRight,
  ShoppingCart,
  BookOpen,
  Receipt,
  Package,
  BarChart3,
  Bot,
  Settings,
  LogOut,
  Store,
  Bell,
  Calendar,
  TrendingUp,
  Wallet,
  IndianRupee,
  Landmark,
  CheckCircle2,
  Plus,
  Send,
  Mic,
  MicOff,
  Download,
  Search,
  User,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { api } from "./api";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "transactions", label: "Transactions", icon: ArrowLeftRight },
  { id: "sales", label: "Sales", icon: ShoppingCart },
  { id: "udhaar", label: "Udhaar Book", icon: BookOpen },
  { id: "expenses", label: "Expenses", icon: Receipt },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "assistant", label: "DukaanAI Bot", icon: Bot },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function App() {
  const [shopInfo, setShopInfo] = useState(null);
  const [loadingInit, setLoadingInit] = useState(true);

  // Store Setup Form (100% User-Entered)
  const [setupShopName, setSetupShopName] = useState("");
  const [setupOwnerName, setSetupOwnerName] = useState("");
  const [setupOpeningCash, setSetupOpeningCash] = useState("");

  const [activeTab, setActiveTab] = useState("dashboard");
  const [dashboard, setDashboard] = useState(null);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [reports, setReports] = useState({ expense_breakdown: [] });

  // Add Sale state
  const [saleMode, setSaleMode] = useState("custom");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [customItemName, setCustomItemName] = useState("");
  const [customItemPrice, setCustomItemPrice] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [saleSuccess, setSaleSuccess] = useState("");

  // Udhaar state
  const [customerSearch, setCustomerSearch] = useState("");
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustCredit, setNewCustCredit] = useState("");
  const [reminderToast, setReminderToast] = useState("");

  // Expense state
  const [expTitle, setExpTitle] = useState("");
  const [expCategory, setExpCategory] = useState("Electricity");
  const [expAmount, setExpAmount] = useState("");

  // Inventory state
  const [prodName, setProdName] = useState("");
  const [prodUnit, setProdUnit] = useState("kg");
  const [prodPrice, setProdPrice] = useState("");
  const [prodStock, setProdStock] = useState("");

  // Voice-to-Transaction Modal & Web Speech API
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("");
  const recognitionRef = useRef(null);

  // Assistant state
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([]);

  const loadAll = async () => {
    try {
      const [d, p, c, t, r] = await Promise.all([
        api.getDashboard(),
        api.getProducts(),
        api.getCustomers(),
        api.getTransactions(),
        api.getReports(),
      ]);
      setDashboard(d);
      setProducts(p);
      if (p.length > 0) {
        setSelectedProductId((prev) => prev || String(p[0].id));
      } else {
        setSaleMode("custom");
      }
      setCustomers(c);
      setTransactions(t);
      setReports(r);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    api
      .getShop()
      .then((s) => {
        setShopInfo(s);
        if (s.is_configured) {
          setMessages([
            {
              sender: "bot",
              text: `Namaste ${s.owner_name}! I'm DukaanAI. Speak or type any sale, expense, Udhaar entry, or ask about your store's profit & cash flow.`,
            },
          ]);
          loadAll();
        }
      })
      .finally(() => setLoadingInit(false));
  }, []);

  const handleCompleteSetup = async (e) => {
    e.preventDefault();
    const res = await api.setupShop({
      shop_name: setupShopName,
      owner_name: setupOwnerName,
      opening_cash: Number(setupOpeningCash || 0),
    });
    setShopInfo(res);
    setMessages([
      {
        sender: "bot",
        text: `Namaste ${res.owner_name}! Welcome to ${res.shop_name}. Speak or type any sale, expense, or Udhaar entry to get started.`,
      },
    ]);
    await loadAll();
  };

  const handleToggleShop = async () => {
    await api.toggleShop();
    loadAll();
  };

  const handleResetStore = async () => {
    if (!window.confirm("Clear all transactions, customers, inventory, and store setup to start fresh?")) return;
    await api.resetShop();
    setShopInfo({ is_configured: 0 });
    setDashboard(null);
    setSetupShopName("");
    setSetupOwnerName("");
    setSetupOpeningCash("");
  };

  // --- Voice Recognition (Browser SpeechRecognition + Backend Gemini Parser) ---
  const startSpeechRecognition = (target = "modal") => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser does not support Speech Recognition. Please type your command in the box instead.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceStatus("Listening... Speak your transaction clearly (e.g. 'Sold 2 kg Rice for 120 UPI')");
    };

    recognition.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      if (target === "modal") {
        setVoiceTranscript(text);
      } else {
        setChatInput(text);
      }
    };

    recognition.onerror = (e) => {
      setIsListening(false);
      setVoiceStatus(`Mic error: ${e.error}. You can also type below.`);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopSpeechRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  };

  const handleProcessVoiceTransaction = async () => {
    if (!voiceTranscript.trim()) return;
    try {
      setVoiceStatus("Converting with DukaanAI...");
      const res = await api.voiceTransaction(voiceTranscript, true);
      setVoiceStatus(
        `✓ Saved ${res.parsed.tx_type.replace("_", " ")}: ${res.parsed.title} — ₹${res.parsed.amount} (${res.parsed.payment_method})`
      );
      setVoiceTranscript("");
      await loadAll();
    } catch (err) {
      setVoiceStatus(`⚠️ ${err.message}`);
    }
  };

  // --- Manual Sale Entry ---
  const selectedProduct = products.find((p) => String(p.id) === String(selectedProductId));
  const activeUnitPrice =
    saleMode === "custom" ? Number(customItemPrice || 0) : selectedProduct?.price || 0;
  const activeItemLabel =
    saleMode === "custom" ? customItemName || "Item" : selectedProduct?.name || "Item";
  const activeTotal = activeUnitPrice * quantity;

  const handleSaveSale = async () => {
    try {
      const payload = {
        items: [
          saleMode === "custom"
            ? {
                custom_name: customItemName,
                quantity,
                unit_price: Number(customItemPrice),
              }
            : {
                product_id: Number(selectedProductId),
                quantity,
                unit_price: selectedProduct?.price || 0,
              },
        ],
        payment_method: paymentMethod,
        customer_id: selectedCustomerId ? Number(selectedCustomerId) : null,
      };
      await api.createSale(payload);
      setSaleSuccess("Sale Recorded Successfully!");
      setQuantity(1);
      setCustomItemName("");
      setCustomItemPrice("");
      await loadAll();
      setTimeout(() => setSaleSuccess(""), 3000);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAddCustomer = async (e) => {
    e.preventDefault();
    await api.addCustomer({
      name: newCustName,
      phone: newCustPhone,
      initial_credit: Number(newCustCredit || 0),
    });
    setNewCustName("");
    setNewCustPhone("");
    setNewCustCredit("");
    setShowAddCustomer(false);
    loadAll();
  };

  const handleSettleCustomer = async (cust) => {
    const amtStr = prompt(
      `Enter payment received from ${cust.name} (Pending: ₹${cust.balance}):`,
      String(cust.balance)
    );
    if (!amtStr) return;
    await api.payCustomer(cust.id, Number(amtStr));
    loadAll();
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!expTitle || !expAmount) return;
    await api.addExpense({
      title: expTitle,
      category: expCategory,
      amount: Number(expAmount),
    });
    setExpTitle("");
    setExpAmount("");
    loadAll();
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!prodName || !prodPrice) return;
    await api.addProduct({
      name: prodName,
      unit: prodUnit,
      price: Number(prodPrice),
      stock: Number(prodStock || 0),
    });
    setProdName("");
    setProdPrice("");
    setProdStock("");
    loadAll();
  };

  const sendChat = async (promptText) => {
    const text = promptText || chatInput;
    if (!text.trim()) return;
    setMessages((prev) => [...prev, { sender: "user", text }]);
    setChatInput("");
    const res = await api.askAssistant(text);
    setMessages((prev) => [...prev, { sender: "bot", text: res.reply }]);
    if (res.action_taken) {
      await loadAll();
    }
  };

  if (loadingInit) return <div style={{ padding: 40 }}>Loading DukaanAI...</div>;

  // --- USER-ENTERED STORE ONBOARDING ---
  if (!shopInfo || !shopInfo.is_configured) {
    return (
      <div className="login-wrapper">
        <div className="login-hero">
          <div className="hero-brand">
            <Store size={44} color="#5b32d6" />
            <span>DukaanAI</span>
          </div>
          <div className="hero-tagline">Your Dukaan. Your Voice. Your Control.</div>
          <div className="hero-sub">
            Smart Accounting, Voice-to-Transaction Entry & Cash-Flow Intelligence for Shopkeepers
          </div>
          <div className="hero-illustration">
            <Mic size={54} color="#5b32d6" />
            <div style={{ fontWeight: 800, color: "#25195e", fontSize: 16 }}>
              Speak or Type Entries
            </div>
            <div style={{ fontSize: 12, color: "#6e678c" }}>
              Zero pre-filled clutter — built from your live store numbers
            </div>
          </div>
        </div>

        <div className="login-form-side">
          <form className="login-card" onSubmit={handleCompleteSetup}>
            <h1>Set Up Your Dukaan</h1>
            <p className="subtitle">Enter your store details to start fresh</p>

            <label className="field-label">Shop / Dukaan Name *</label>
            <div className="input-group">
              <Store size={18} color="#6e678c" />
              <input
                type="text"
                placeholder="e.g. Sri Ganesh General Stores"
                value={setupShopName}
                onChange={(e) => setSetupShopName(e.target.value)}
                required
              />
            </div>

            <label className="field-label">Shopkeeper / Owner Name *</label>
            <div className="input-group">
              <User size={18} color="#6e678c" />
              <input
                type="text"
                placeholder="e.g. Rajeshwari"
                value={setupOwnerName}
                onChange={(e) => setSetupOwnerName(e.target.value)}
                required
              />
            </div>

            <label className="field-label">Opening Cash in Drawer (₹)</label>
            <div className="input-group">
              <IndianRupee size={18} color="#6e678c" />
              <input
                type="number"
                min="0"
                placeholder="0"
                value={setupOpeningCash}
                onChange={(e) => setSetupOpeningCash(e.target.value)}
              />
            </div>

            <button type="submit" className="btn-primary">
              Open My Dukaan →
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!dashboard) return <div style={{ padding: 40 }}>Loading Store Dashboard...</div>;

  const { shop, kpis, chart, recent_transactions, gemini_enabled } = dashboard;
  const maxChartVal = Math.max(...chart.map((c) => Math.max(c.sales, c.expenses)), 1000);
  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase())
  );
  const totalOutstanding = customers.reduce((acc, c) => acc + c.balance, 0);
  const initials = shop.owner_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const todayFormatted = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    weekday: "long",
  });

  return (
    <div className="app-shell">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div>
          <div className="sidebar-logo">
            <Sparkles size={25} color="#a78bfa" />
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

        <button className="nav-item" onClick={handleResetStore}>
          <RotateCcw size={18} />
          <span>Reset Store</span>
        </button>
      </aside>

      {/* MAIN WORKSPACE */}
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <Store size={19} color="#5b32d6" />
            <span>{shop.shop_name}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button
              className="voice-bar-btn"
              onClick={() => {
                setVoiceStatus("");
                setVoiceModalOpen(true);
              }}
            >
              <Mic size={16} />
              <span>Voice Entry</span>
            </button>

            <button
              className={`shop-pill ${shop.is_open ? "" : "closed"}`}
              onClick={handleToggleShop}
            >
              <span className="dot" />
              {shop.is_open ? "Shop Open" : "Shop Closed"}
            </button>
            <Bell size={19} color="#6e678c" />
            <div className="avatar">{initials || "DK"}</div>
          </div>
        </header>

        <main className="page-content">
          {/* 1. DASHBOARD */}
          {activeTab === "dashboard" && (
            <>
              <div className="greeting-row">
                <div>
                  <h2>Namaste, {shop.owner_name}! 👋</h2>
                  <p>Here's your live business overview for today.</p>
                </div>
                <div className="date-chip">
                  <Calendar size={16} color="#5b32d6" />
                  <span>{todayFormatted}</span>
                </div>
              </div>

              <div className="kpi-grid">
                <div className="kpi-card tint-purple">
                  <div className="kpi-icon" style={{ background: "#5b32d6" }}>
                    <ShoppingCart size={18} />
                  </div>
                  <div className="kpi-label">Today's Sales</div>
                  <div className="kpi-val">
                    ₹{kpis.todays_sales.toLocaleString("en-IN")}
                  </div>
                </div>

                <div className="kpi-card tint-green">
                  <div className="kpi-icon" style={{ background: "#16a34a" }}>
                    <Wallet size={18} />
                  </div>
                  <div className="kpi-label">Cash & UPI Received</div>
                  <div className="kpi-val">
                    ₹{kpis.cash_received.toLocaleString("en-IN")}
                  </div>
                </div>

                <div className="kpi-card tint-amber">
                  <div className="kpi-icon" style={{ background: "#f59e0b" }}>
                    <IndianRupee size={18} />
                  </div>
                  <div className="kpi-label">Udhaar Pending</div>
                  <div className="kpi-val">
                    ₹{kpis.udhaar_pending.toLocaleString("en-IN")}
                  </div>
                </div>

                <div className="kpi-card tint-blue">
                  <div className="kpi-icon" style={{ background: "#2563eb" }}>
                    <Landmark size={18} />
                  </div>
                  <div className="kpi-label">Cash Balance</div>
                  <div className="kpi-val">
                    ₹{kpis.cash_balance.toLocaleString("en-IN")}
                  </div>
                </div>

                <div className="kpi-card tint-mint">
                  <div className="kpi-icon" style={{ background: "#0d9488" }}>
                    <TrendingUp size={18} />
                  </div>
                  <div className="kpi-label">Net Profit (Est.)</div>
                  <div className="kpi-val">
                    ₹{kpis.net_profit.toLocaleString("en-IN")}
                  </div>
                </div>
              </div>

              <div className="mid-grid">
                <div className="card">
                  <div className="card-header">
                    <h3>Sales & Expenses Overview</h3>
                    <div style={{ display: "flex", gap: 14, fontSize: 12, fontWeight: 700 }}>
                      <span style={{ color: "#5b32d6" }}>● Sales</span>
                      <span style={{ color: "#f59e0b" }}>● Expenses</span>
                    </div>
                  </div>

                  <svg viewBox="0 0 520 190" style={{ width: "100%", height: 190 }}>
                    {[0, 1, 2, 3].map((step) => {
                      const y = 155 - step * 42;
                      const labelVal = Math.round((maxChartVal / 3) * step);
                      return (
                        <g key={step}>
                          <line x1="48" y1={y} x2="500" y2={y} stroke="#eeeaf9" />
                          <text x="4" y={y + 4} fontSize="10" fill="#8b83a8">
                            ₹{labelVal}
                          </text>
                        </g>
                      );
                    })}

                    <polyline
                      fill="none"
                      stroke="#5b32d6"
                      strokeWidth="3"
                      points={chart
                        .map((d, i) => {
                          const x = 68 + i * 68;
                          const y = 155 - (d.sales / maxChartVal) * 126;
                          return `${x},${y}`;
                        })
                        .join(" ")}
                    />
                    <polyline
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="3"
                      points={chart
                        .map((d, i) => {
                          const x = 68 + i * 68;
                          const y = 155 - (d.expenses / maxChartVal) * 126;
                          return `${x},${y}`;
                        })
                        .join(" ")}
                    />

                    {chart.map((d, i) => {
                      const x = 68 + i * 68;
                      const sy = 155 - (d.sales / maxChartVal) * 126;
                      const ey = 155 - (d.expenses / maxChartVal) * 126;
                      return (
                        <g key={d.day}>
                          <circle cx={x} cy={sy} r="4.5" fill="#5b32d6" />
                          <circle cx={x} cy={ey} r="4.5" fill="#f59e0b" />
                          <text x={x - 12} y="180" fontSize="11" fill="#6e678c">
                            {d.day}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                <div className="card">
                  <div className="card-header">
                    <h3>Recent Transactions</h3>
                    <button
                      className="btn-outline"
                      onClick={() => setActiveTab("transactions")}
                    >
                      View All →
                    </button>
                  </div>

                  {recent_transactions.length === 0 ? (
                    <div style={{ color: "#6e678c", fontSize: 14, padding: "24px 0", textAlign: "center" }}>
                      No transactions yet. Click <strong>Sales</strong> or <strong>Voice Entry</strong> to record your first transaction!
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {recent_transactions.slice(0, 4).map((tx) => {
                        const isExp = tx.tx_type === "expense";
                        return (
                          <div
                            key={tx.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              paddingBottom: 10,
                              borderBottom: "1px solid #f2effb",
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 14 }}>{tx.title}</div>
                              <div style={{ fontSize: 12, color: "#6e678c" }}>
                                {tx.tx_date} • {tx.tx_time}
                              </div>
                            </div>
                            <div
                              style={{
                                fontWeight: 800,
                                color: isExp ? "#dc2626" : "#16a34a",
                              }}
                            >
                              {isExp ? `-₹${tx.amount}` : `+₹${tx.amount.toLocaleString("en-IN")}`}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="forecast-banner">
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  ✨ Cash-flow forecast for next week:{" "}
                  <span style={{ color: "#5b32d6", fontWeight: 800 }}>
                    {kpis.forecast_range}
                  </span>
                </div>
                <button className="btn-outline" onClick={() => setActiveTab("reports")}>
                  View Prediction →
                </button>
              </div>
            </>
          )}

          {/* 2. ADD NEW SALE */}
          {activeTab === "sales" && (
            <div className="sale-grid">
              <div className="card">
                <div className="card-header">
                  <h3>← Add New Sale</h3>
                  <button
                    className="btn-outline"
                    onClick={() => {
                      setVoiceStatus("");
                      setVoiceModalOpen(true);
                    }}
                  >
                    <Mic size={15} /> Speak Sale
                  </button>
                </div>

                <div className="tab-row">
                  <button
                    className={`tab-btn ${saleMode === "custom" ? "active" : ""}`}
                    onClick={() => setSaleMode("custom")}
                  >
                    Manual Item Entry
                  </button>
                  <button
                    className={`tab-btn ${saleMode === "quick" ? "active" : ""}`}
                    onClick={() => setSaleMode("quick")}
                  >
                    From Inventory ({products.length})
                  </button>
                </div>

                {saleMode === "quick" ? (
                  <>
                    <label className="field-label">Select Product from Inventory</label>
                    {products.length === 0 ? (
                      <p style={{ fontSize: 13, color: "#6e678c", marginBottom: 14 }}>
                        No inventory items added yet. Switch to <strong>Manual Item Entry</strong> or add items in the <strong>Inventory</strong> tab.
                      </p>
                    ) : (
                      <div className="input-group">
                        <select
                          value={selectedProductId}
                          onChange={(e) => setSelectedProductId(e.target.value)}
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (₹{p.price}/{p.unit}) — Stock: {p.stock}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
                    <div>
                      <label className="field-label">Item / Description *</label>
                      <div className="input-group">
                        <input
                          placeholder="e.g. Groceries / Rice 5kg"
                          value={customItemName}
                          onChange={(e) => setCustomItemName(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="field-label">Unit Price (₹) *</label>
                      <div className="input-group">
                        <input
                          type="number"
                          min="1"
                          placeholder="0"
                          value={customItemPrice}
                          onChange={(e) => setCustomItemPrice(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <label className="field-label">Quantity</label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    margin: "6px 0 18px",
                  }}
                >
                  <button
                    className="btn-outline"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  >
                    -
                  </button>
                  <span style={{ fontWeight: 800, fontSize: 16 }}>{quantity}</span>
                  <button
                    className="btn-outline"
                    onClick={() => setQuantity((q) => q + 1)}
                  >
                    +
                  </button>
                </div>

                <label className="field-label">Payment Method</label>
                <div style={{ display: "flex", gap: 18, margin: "6px 0 18px" }}>
                  {["Cash", "UPI", "Credit"].map((m) => (
                    <label
                      key={m}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontWeight: 700,
                        fontSize: 14,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name="payMethod"
                        checked={paymentMethod === m}
                        onChange={() => setPaymentMethod(m)}
                      />
                      {m}
                    </label>
                  ))}
                </div>

                <label className="field-label">
                  Customer {paymentMethod === "Credit" ? "(Required for Udhaar)" : "(Optional)"}
                </label>
                <div className="input-group">
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                  >
                    <option value="">Select Customer</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <button className="btn-primary" onClick={handleSaveSale}>
                  Save Sale ✓
                </button>
              </div>

              <div className="receipt-card">
                <div>
                  <div style={{ textAlign: "center", marginBottom: 20 }}>
                    <div style={{ fontWeight: 800, fontSize: 20, color: "#25195e" }}>
                      DukaanAI
                    </div>
                    <div style={{ fontSize: 13, color: "#6e678c" }}>{shop.shop_name}</div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "12px 0",
                      borderBottom: "1px solid #e5e0f7",
                    }}
                  >
                    <span>{activeItemLabel}</span>
                    <span>x{quantity}</span>
                    <strong>₹{activeTotal}</strong>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "16px 0",
                      fontSize: 18,
                      fontWeight: 800,
                    }}
                  >
                    <span>Total</span>
                    <span>₹{activeTotal}</span>
                  </div>

                  <div style={{ fontSize: 14 }}>
                    Payment: <strong>{paymentMethod}</strong>
                  </div>
                </div>

                {saleSuccess && (
                  <div
                    style={{
                      marginTop: 20,
                      background: "#dcfce7",
                      color: "#15803d",
                      padding: 14,
                      borderRadius: 12,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontWeight: 700,
                    }}
                  >
                    <CheckCircle2 size={20} />
                    <span>{saleSuccess}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. UDHAAR BOOK */}
          {activeTab === "udhaar" && (
            <div className="card">
              <div className="card-header">
                <h3>← Customer Credit Ledger (Udhaar Book)</h3>
                <button
                  className="btn-primary"
                  style={{ width: "auto" }}
                  onClick={() => setShowAddCustomer(!showAddCustomer)}
                >
                  <Plus size={16} /> Add Customer
                </button>
              </div>

              {showAddCustomer && (
                <form
                  onSubmit={handleAddCustomer}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr auto",
                    gap: 12,
                    marginBottom: 18,
                    background: "#f8f7fd",
                    padding: 14,
                    borderRadius: 12,
                  }}
                >
                  <input
                    placeholder="Customer Name *"
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    required
                    style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
                  />
                  <input
                    placeholder="Phone Number"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder="Opening Credit (₹)"
                    value={newCustCredit}
                    onChange={(e) => setNewCustCredit(e.target.value)}
                    style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
                  />
                  <button type="submit" className="btn-primary" style={{ width: "auto" }}>
                    Save
                  </button>
                </form>
              )}

              <div className="input-group" style={{ maxWidth: 360 }}>
                <Search size={17} color="#6e678c" />
                <input
                  placeholder="Search customer..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
              </div>

              {filteredCustomers.length === 0 ? (
                <p style={{ color: "#6e678c", padding: "20px 0", textAlign: "center" }}>
                  No customers added yet. Click <strong>+ Add Customer</strong> or record a Credit sale by voice.
                </p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Total Credit</th>
                      <th>Paid</th>
                      <th>Balance</th>
                      <th>Due Date</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.name}</strong>
                          {c.phone && <div style={{ fontSize: 12, color: "#6e678c" }}>{c.phone}</div>}
                        </td>
                        <td>₹{c.total_credit.toLocaleString("en-IN")}</td>
                        <td>₹{c.paid.toLocaleString("en-IN")}</td>
                        <td style={{ fontWeight: 800, color: c.balance > 0 ? "#dc2626" : "#15803d" }}>
                          ₹{c.balance.toLocaleString("en-IN")}
                        </td>
                        <td>{c.due_date}</td>
                        <td>
                          <span
                            className={`badge ${
                              c.status === "Cleared" ? "badge-cleared" : "badge-due"
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td>
                          {c.balance > 0 ? (
                            <button
                              className="btn-outline"
                              onClick={() => handleSettleCustomer(c)}
                            >
                              Record Payment
                            </button>
                          ) : (
                            <span style={{ fontSize: 12, color: "#6e678c" }}>Settled</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div
                style={{
                  marginTop: 22,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "#f4f2fc",
                  padding: 16,
                  borderRadius: 14,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: "#6e678c", fontWeight: 700 }}>
                    Total Outstanding
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#5b32d6" }}>
                    ₹{totalOutstanding.toLocaleString("en-IN")}
                  </div>
                </div>

                <button
                  className="btn-primary"
                  style={{ width: "auto" }}
                  onClick={() => {
                    setReminderToast("Payment reminders queued for customers with pending balances!");
                    setTimeout(() => setReminderToast(""), 3500);
                  }}
                >
                  Send Reminders
                </button>
              </div>

              {reminderToast && (
                <div style={{ marginTop: 12, color: "#15803d", fontWeight: 700, fontSize: 13 }}>
                  ✓ {reminderToast}
                </div>
              )}
            </div>
          )}

          {/* 4. REPORTS */}
          {activeTab === "reports" && (
            <div className="card">
              <div className="card-header">
                <h3>Sales & Expense Reports</h3>
                <button
                  className="btn-primary"
                  style={{ width: "auto" }}
                  onClick={() => window.print()}
                >
                  <Download size={16} /> Download Report
                </button>
              </div>

              <div className="mid-grid">
                <div>
                  <h4 style={{ marginBottom: 14 }}>Sales vs Expenses (Last 7 Days)</h4>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-end",
                      gap: 18,
                      height: 190,
                      padding: "16px 10px",
                      background: "#faf9fe",
                      borderRadius: 14,
                    }}
                  >
                    {chart.map((d) => (
                      <div
                        key={d.day}
                        style={{
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 130 }}>
                          <div
                            style={{
                              width: 12,
                              height: `${Math.max(6, (d.sales / maxChartVal) * 125)}px`,
                              background: "#5b32d6",
                              borderRadius: 4,
                            }}
                          />
                          <div
                            style={{
                              width: 12,
                              height: `${Math.max(6, (d.expenses / maxChartVal) * 125)}px`,
                              background: "#f59e0b",
                              borderRadius: 4,
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{d.day}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 style={{ marginBottom: 14 }}>Expense Categories</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {reports.expense_breakdown.map((item, idx) => {
                      const colors = ["#5b32d6", "#f59e0b", "#10b981"];
                      return (
                        <div
                          key={item.category}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: 12,
                            borderRadius: 12,
                            background: "#f8f7fd",
                          }}
                        >
                          <span style={{ fontWeight: 700 }}>
                            <span style={{ color: colors[idx % 3] }}>● </span>
                            {item.category}
                          </span>
                          <strong>
                            ₹{item.amount.toLocaleString("en-IN")} ({item.percent}%)
                          </strong>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 5. DUKAANAI ASSISTANT (CHAT + VOICE) */}
          {activeTab === "assistant" && (
            <div className="chat-box">
              <div style={{ textAlign: "center", marginBottom: 18 }}>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    background: "#ebe4ff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 8,
                  }}
                >
                  <Bot size={34} color="#5b32d6" />
                </div>
                <h3>DukaanAI Assistant ✨</h3>
                <div style={{ fontSize: 12, color: "#6e678c", marginTop: 4 }}>
                  {gemini_enabled
                    ? "Connected to Google Gemini API"
                    : "Smart Local Mode (Add GEMINI_API_KEY in backend/.env for full Gemini LLM)"}
                </div>
              </div>

              <div
                style={{
                  maxHeight: 280,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                {messages.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      alignSelf: m.sender === "user" ? "flex-end" : "flex-start",
                      background: m.sender === "user" ? "#5b32d6" : "#f3effe",
                      color: m.sender === "user" ? "#ffffff" : "#1d163b",
                      padding: "11px 15px",
                      borderRadius: 14,
                      maxWidth: "82%",
                      fontSize: 14,
                      lineHeight: 1.5,
                    }}
                  >
                    {m.text}
                  </div>
                ))}
              </div>

              <div className="chip-grid">
                {[
                  "What's my profit today?",
                  "Show pending Udhaar balances",
                  "Predict next week's cash flow",
                  "Check inventory stock",
                ].map((q) => (
                  <button key={q} className="prompt-chip" onClick={() => sendChat(q)}>
                    {q}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className="btn-outline"
                  onClick={() =>
                    isListening ? stopSpeechRecognition() : startSpeechRecognition("chat")
                  }
                  title="Speak into mic"
                >
                  {isListening ? <MicOff size={18} color="#dc2626" /> : <Mic size={18} />}
                </button>
                <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                  <input
                    placeholder="Ask DukaanAI or say 'Sold 2 kg Sugar for 90 Cash'..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendChat()}
                  />
                </div>
                <button
                  className="btn-primary"
                  style={{ width: "auto" }}
                  onClick={() => sendChat()}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          )}

          {/* 6. TRANSACTIONS */}
          {activeTab === "transactions" && (
            <div className="card">
              <div className="card-header">
                <h3>All Shop Transactions</h3>
              </div>
              {transactions.length === 0 ? (
                <p style={{ color: "#6e678c", textAlign: "center", padding: 20 }}>
                  No transactions recorded yet.
                </p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Category</th>
                      <th>Method</th>
                      <th>Time</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td>
                          <strong>{tx.title}</strong>
                        </td>
                        <td>{tx.category}</td>
                        <td>{tx.payment_method}</td>
                        <td>
                          {tx.tx_date} • {tx.tx_time}
                        </td>
                        <td
                          style={{
                            fontWeight: 800,
                            color: tx.tx_type === "expense" ? "#dc2626" : "#16a34a",
                          }}
                        >
                          {tx.tx_type === "expense" ? `-₹${tx.amount}` : `+₹${tx.amount}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* 7. EXPENSES */}
          {activeTab === "expenses" && (
            <div className="card">
              <div className="card-header">
                <h3>Record Shop Expense</h3>
              </div>
              <form
                onSubmit={handleAddExpense}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.5fr 1fr 1fr auto",
                  gap: 12,
                  marginBottom: 20,
                }}
              >
                <input
                  placeholder="Expense description (e.g., Electricity Bill)"
                  value={expTitle}
                  onChange={(e) => setExpTitle(e.target.value)}
                  required
                  style={{ padding: 11, borderRadius: 10, border: "1px solid #ddd" }}
                />
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value)}
                  style={{ padding: 11, borderRadius: 10, border: "1px solid #ddd" }}
                >
                  <option value="Electricity">Electricity</option>
                  <option value="Rent">Rent</option>
                  <option value="Others">Others</option>
                </select>
                <input
                  type="number"
                  min="1"
                  placeholder="Amount (₹)"
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  required
                  style={{ padding: 11, borderRadius: 10, border: "1px solid #ddd" }}
                />
                <button type="submit" className="btn-primary" style={{ width: "auto" }}>
                  Add Expense
                </button>
              </form>

              <table>
                <thead>
                  <tr>
                    <th>Expense</th>
                    <th>Category</th>
                    <th>Date</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions
                    .filter((t) => t.tx_type === "expense")
                    .map((e) => (
                      <tr key={e.id}>
                        <td>{e.title}</td>
                        <td>{e.category}</td>
                        <td>{e.tx_date}</td>
                        <td style={{ color: "#dc2626", fontWeight: 700 }}>-₹{e.amount}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 8. INVENTORY */}
          {activeTab === "inventory" && (
            <div className="card">
              <div className="card-header">
                <h3>Store Inventory</h3>
              </div>
              <form
                onSubmit={handleAddProduct}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.4fr 0.7fr 0.9fr 0.9fr auto",
                  gap: 10,
                  marginBottom: 20,
                }}
              >
                <input
                  placeholder="Product Name *"
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  required
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                />
                <input
                  placeholder="Unit (kg/L/pcs)"
                  value={prodUnit}
                  onChange={(e) => setProdUnit(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                />
                <input
                  type="number"
                  min="1"
                  placeholder="Price (₹) *"
                  value={prodPrice}
                  onChange={(e) => setProdPrice(e.target.value)}
                  required
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                />
                <input
                  type="number"
                  min="0"
                  placeholder="Stock Qty *"
                  value={prodStock}
                  onChange={(e) => setProdStock(e.target.value)}
                  required
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                />
                <button type="submit" className="btn-primary" style={{ width: "auto" }}>
                  Add Item
                </button>
              </form>

              {products.length === 0 ? (
                <p style={{ color: "#6e678c", textAlign: "center", padding: 20 }}>
                  No products in inventory yet. Add your store items above.
                </p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Unit Price</th>
                      <th>Available Stock</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                        </td>
                        <td>
                          ₹{p.price}/{p.unit}
                        </td>
                        <td>
                          {p.stock} {p.unit}
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              p.stock <= 10 ? "badge-due" : "badge-cleared"
                            }`}
                          >
                            {p.stock <= 10 ? "Low Stock" : "In Stock"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* 9. SETTINGS */}
          {activeTab === "settings" && (
            <div className="card" style={{ maxWidth: 540 }}>
              <div className="card-header">
                <h3>Store Settings</h3>
              </div>
              <p style={{ marginBottom: 12 }}>
                <strong>Store Name:</strong> {shop.shop_name}
              </p>
              <p style={{ marginBottom: 12 }}>
                <strong>Owner:</strong> {shop.owner_name}
              </p>
              <p style={{ marginBottom: 20 }}>
                <strong>Opening Cash Drawer:</strong> ₹{shop.opening_cash.toLocaleString("en-IN")}
              </p>
              <div style={{ display: "flex", gap: 12 }}>
                <button className="btn-primary" style={{ width: "auto" }} onClick={handleToggleShop}>
                  {shop.is_open ? "Close Shop for Today" : "Open Shop"}
                </button>
                <button className="btn-outline" onClick={handleResetStore}>
                  Reset All Store Data
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* VOICE-TO-TRANSACTION MODAL */}
      {voiceModalOpen && (
        <div className="voice-modal-backdrop" onClick={() => setVoiceModalOpen(false)}>
          <div className="voice-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800 }}>🎙️ Voice-to-Transaction</h3>
              <button className="btn-outline" onClick={() => setVoiceModalOpen(false)}>
                Close
              </button>
            </div>

            <p style={{ fontSize: 13, color: "#6e678c", marginBottom: 16 }}>
              Tap the mic and speak naturally in Indian English or Hinglish:
              <br />
              <em>"Sold 2 kg Rice for 120 UPI"</em>, <em>"Ramesh Credit 500"</em>, or <em>"Electricity bill expense 350 Cash"</em>.
            </p>

            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <button
                className={`voice-bar-btn ${isListening ? "listening" : ""}`}
                style={{ padding: "12px 22px", fontSize: 14 }}
                onClick={() =>
                  isListening ? stopSpeechRecognition() : startSpeechRecognition("modal")
                }
              >
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                <span>{isListening ? "Stop Listening" : "Tap to Speak"}</span>
              </button>
            </div>

            <div className="input-group">
              <input
                placeholder="Spoken text appears here (or type manually)..."
                value={voiceTranscript}
                onChange={(e) => setVoiceTranscript(e.target.value)}
              />
            </div>

            <button className="btn-primary" onClick={handleProcessVoiceTransaction}>
              Convert & Save Transaction ✓
            </button>

            {voiceStatus && (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 10,
                  background: "#f4f2fc",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#25195e",
                }}
              >
                {voiceStatus}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
