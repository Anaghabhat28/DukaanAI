const API_BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail || "API Error");
  }
  return res.json();
}

export const api = {
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
  voiceTransaction: (transcript, auto_save = true) =>
    request("/voice-transaction", {
      method: "POST",
      body: JSON.stringify({ transcript, auto_save }),
    }),
  askAssistant: (message) =>
    request("/assistant", {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
};