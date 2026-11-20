const API_BASE = "/api";
const TOKEN_KEY = "dukaanai_auth_token";
const USER_KEY = "dukaanai_auth_user";

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setAuthSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request(path, options = {}) {
  const token = getAuthToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearAuthSession();
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    const error = new Error(err.detail || "API Error");
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export const api = {
  register: (data) =>
    request("/auth/register", { method: "POST", body: JSON.stringify(data) }),
  login: (data) =>
    request("/auth/login", { method: "POST", body: JSON.stringify(data) }),
  getMe: () => request("/auth/me"),
  logout: () => request("/auth/logout", { method: "POST" }),

  getShop: () => request("/shop"),
  setupShop: (data) =>
    request("/shop/setup", { method: "POST", body: JSON.stringify(data) }),
  updateProfile: (data) =>
    request("/shop/profile", { method: "POST", body: JSON.stringify(data) }),
  resetShop: () => request("/shop/reset", { method: "POST" }),
  toggleShop: () => request("/shop/toggle", { method: "POST" }),
  getDashboard: () => request("/dashboard"),

  getProducts: () => request("/products"),
  addProduct: (data) =>
    request("/products", { method: "POST", body: JSON.stringify(data) }),
  updateProduct: (id, data) =>
    request(`/products/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  adjustStock: (id, delta) =>
    request(`/products/${id}/adjust-stock`, {
      method: "POST",
      body: JSON.stringify({ delta }),
    }),
  deleteProduct: (id) =>
    request(`/products/${id}`, { method: "DELETE" }),

  createSale: (data) =>
    request("/sales", { method: "POST", body: JSON.stringify(data) }),
  getCustomers: () => request("/customers"),
  addCustomer: (data) =>
    request("/customers", { method: "POST", body: JSON.stringify(data) }),
  payCustomer: (id, amount, payment_method = "Cash") =>
    request(`/customers/${id}/pay`, {
      method: "POST",
      body: JSON.stringify({ amount, payment_method }),
    }),
  getTransactions: () => request("/transactions"),
  addExpense: (data) =>
    request("/expenses", { method: "POST", body: JSON.stringify(data) }),
  getReports: () => request("/reports"),

  parseVoiceCommand: (transcript, language = "en-IN") =>
    request("/voice-transaction", {
      method: "POST",
      body: JSON.stringify({ transcript, language, auto_save: false }),
    }),
  confirmVoiceAction: (confirmed_action, transcript = "", language = "en-IN") =>
    request("/voice-transaction", {
      method: "POST",
      body: JSON.stringify({
        transcript,
        language,
        auto_save: true,
        confirmed_action,
      }),
    }),
  askAssistant: (message) =>
    request("/assistant", {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
};