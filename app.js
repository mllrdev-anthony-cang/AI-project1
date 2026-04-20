const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const ui = {
  productGrid: document.getElementById("productGrid"),
  categoryFilter: document.getElementById("categoryFilter"),
  searchInput: document.getElementById("searchInput"),
  cartItems: document.getElementById("cartItems"),
  subtotalValue: document.getElementById("subtotalValue"),
  taxValue: document.getElementById("taxValue"),
  totalValue: document.getElementById("totalValue"),
  taxInput: document.getElementById("taxInput"),
  discountInput: document.getElementById("discountInput"),
  clearCartButton: document.getElementById("clearCartButton"),
  checkoutButton: document.getElementById("checkoutButton"),
  receiptList: document.getElementById("receiptList"),
  resetSalesButton: document.getElementById("resetSalesButton"),
  dailyRevenue: document.getElementById("dailyRevenue"),
  dailyTransactions: document.getElementById("dailyTransactions"),
  dailyItems: document.getElementById("dailyItems"),
  appStatus: document.getElementById("appStatus"),
  productCardTemplate: document.getElementById("productCardTemplate"),
  cartItemTemplate: document.getElementById("cartItemTemplate"),
  receiptTemplate: document.getElementById("receiptTemplate"),
};

const state = {
  products: [],
  sales: [],
  cart: [],
  activeCategory: "All",
  searchTerm: "",
  loading: true,
};

function formatCurrency(amount) {
  return currencyFormatter.format(amount);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function setStatus(message, tone = "neutral") {
  ui.appStatus.textContent = message;
  ui.appStatus.dataset.tone = tone;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.error || "Request failed.");
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function loadStore() {
  state.loading = true;
  setStatus("Syncing with backend...", "neutral");

  try {
    const payload = await apiRequest("/api/state");
    state.products = payload.products;
    state.sales = payload.sales;
    reconcileCart();
    renderCategoryFilters();
    renderProducts();
    renderCart();
    renderReceipts();
    renderMetrics();
    setStatus("Connected to Utang Tracker server.", "success");
  } catch (error) {
    setStatus(error.message || "Unable to reach backend.", "danger");
    ui.productGrid.innerHTML = '<div class="empty-state">The backend is not reachable. Start the local server and refresh this page.</div>';
  } finally {
    state.loading = false;
  }
}

function reconcileCart() {
  state.cart = state.cart.filter((cartItem) => {
    const product = state.products.find((entry) => entry.id === cartItem.id);
    if (!product || product.stock <= 0) {
      return false;
    }

    cartItem.price = product.price;
    cartItem.category = product.category;
    cartItem.quantity = clamp(cartItem.quantity, 1, product.stock);
    return true;
  });
}

function getCategories() {
  return ["All", ...new Set(state.products.map((product) => product.category))];
}

function filteredProducts() {
  return state.products.filter((product) => {
    const matchesCategory =
      state.activeCategory === "All" || product.category === state.activeCategory;
    const query = state.searchTerm.trim().toLowerCase();
    const matchesSearch =
      !query ||
      product.name.toLowerCase().includes(query) ||
      product.category.toLowerCase().includes(query);

    return matchesCategory && matchesSearch;
  });
}

function totals() {
  const subtotal = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = clamp(Number.parseFloat(ui.discountInput.value) || 0, 0, subtotal);
  const taxRate = Math.max(Number.parseFloat(ui.taxInput.value) || 0, 0) / 100;
  const taxable = Math.max(subtotal - discount, 0);
  const tax = taxable * taxRate;
  const total = taxable + tax;

  return { subtotal, discount, taxRate, taxable, tax, total };
}

function renderCategoryFilters() {
  ui.categoryFilter.innerHTML = "";

  getCategories().forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-chip${category === state.activeCategory ? " active" : ""}`;
    button.textContent = category;
    button.addEventListener("click", () => {
      state.activeCategory = category;
      renderProducts();
      renderCategoryFilters();
    });
    ui.categoryFilter.append(button);
  });
}

function renderProducts() {
  ui.productGrid.innerHTML = "";
  const products = filteredProducts();

  if (!products.length) {
    ui.productGrid.innerHTML = '<div class="empty-state">No products match this search right now.</div>';
    return;
  }

  products.forEach((product) => {
    const fragment = ui.productCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".product-card");
    const stockLabel = fragment.querySelector(".product-stock");
    const addButton = fragment.querySelector("button");
    const quantityInCart = cartQuantity(product.id);

    fragment.querySelector(".product-category").textContent = product.category;
    stockLabel.textContent = `${product.stock} in stock`;
    if (product.stock <= 5) {
      stockLabel.classList.add("low-stock");
    }
    fragment.querySelector(".product-name").textContent = product.name;
    fragment.querySelector(".product-description").textContent = product.description;
    fragment.querySelector(".product-price").textContent = formatCurrency(product.price);

    if (product.stock === 0 || quantityInCart >= product.stock) {
      addButton.disabled = true;
      addButton.textContent = product.stock === 0 ? "Out" : "Maxed";
      card.style.opacity = "0.6";
    }

    addButton.addEventListener("click", () => addToCart(product.id));
    ui.productGrid.append(fragment);
  });
}

function cartQuantity(productId) {
  return state.cart.find((item) => item.id === productId)?.quantity || 0;
}

function addToCart(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product || product.stock <= cartQuantity(productId)) {
    return;
  }

  const existing = state.cart.find((item) => item.id === productId);
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      category: product.category,
      quantity: 1,
    });
  }

  renderCart();
  renderProducts();
}

function updateCartItem(productId, direction) {
  const item = state.cart.find((entry) => entry.id === productId);
  const product = state.products.find((entry) => entry.id === productId);
  if (!item || !product) {
    return;
  }

  const nextQuantity = item.quantity + direction;
  if (nextQuantity <= 0) {
    state.cart = state.cart.filter((entry) => entry.id !== productId);
  } else if (nextQuantity <= product.stock) {
    item.quantity = nextQuantity;
  }

  renderCart();
  renderProducts();
}

function renderCart() {
  ui.cartItems.innerHTML = "";

  if (!state.cart.length) {
    ui.cartItems.innerHTML = '<div class="empty-state">The cart is empty. Add products from the left panel to start a sale.</div>';
  } else {
    state.cart.forEach((item) => {
      const fragment = ui.cartItemTemplate.content.cloneNode(true);

      fragment.querySelector(".cart-item-name").textContent = item.name;
      fragment.querySelector(".cart-item-meta").textContent = `${item.category} - ${formatCurrency(item.price)} each`;
      fragment.querySelector(".cart-item-qty").textContent = item.quantity;
      fragment.querySelector(".cart-item-total").textContent = formatCurrency(item.price * item.quantity);

      fragment.querySelector(".increment").addEventListener("click", () => updateCartItem(item.id, 1));
      fragment.querySelector(".decrement").addEventListener("click", () => updateCartItem(item.id, -1));
      fragment.querySelector(".remove-item").addEventListener("click", () => {
        state.cart = state.cart.filter((entry) => entry.id !== item.id);
        renderCart();
        renderProducts();
      });

      ui.cartItems.append(fragment);
    });
  }

  const saleTotals = totals();
  ui.subtotalValue.textContent = formatCurrency(saleTotals.subtotal);
  ui.taxValue.textContent = formatCurrency(saleTotals.tax);
  ui.totalValue.textContent = formatCurrency(saleTotals.total);
}

function renderReceipts() {
  ui.receiptList.innerHTML = "";

  if (!state.sales.length) {
    ui.receiptList.innerHTML = '<div class="empty-state">Completed transactions will appear here as soon as you ring up the first sale.</div>';
    return;
  }

  state.sales
    .slice()
    .reverse()
    .forEach((sale) => {
      const fragment = ui.receiptTemplate.content.cloneNode(true);
      fragment.querySelector(".receipt-id").textContent = sale.id;
      fragment.querySelector(".receipt-meta").textContent = `${sale.timestamp} - ${sale.items} items`;
      fragment.querySelector(".receipt-total").textContent = formatCurrency(sale.total);
      ui.receiptList.append(fragment);
    });
}

function renderMetrics() {
  const revenue = state.sales.reduce((sum, sale) => sum + sale.total, 0);
  const transactions = state.sales.length;
  const itemsSold = state.sales.reduce((sum, sale) => sum + sale.items, 0);

  ui.dailyRevenue.textContent = formatCurrency(revenue);
  ui.dailyTransactions.textContent = transactions;
  ui.dailyItems.textContent = itemsSold;
}

async function checkout() {
  if (!state.cart.length || state.loading) {
    return;
  }

  const saleTotals = totals();
  setStatus("Submitting sale...", "neutral");

  try {
    const payload = await apiRequest("/api/checkout", {
      method: "POST",
      body: JSON.stringify({
        items: state.cart.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
        })),
        discount: saleTotals.discount,
        taxRate: Number.parseFloat(ui.taxInput.value) || 0,
      }),
    });

    state.products = payload.products;
    state.sales = payload.sales;
    state.cart = [];
    ui.discountInput.value = "0";
    renderProducts();
    renderCart();
    renderReceipts();
    renderMetrics();
    setStatus(`Sale ${payload.sale.id} completed.`, "success");
  } catch (error) {
    setStatus(error.message || "Checkout failed.", "danger");
  }
}

function clearCart() {
  state.cart = [];
  ui.discountInput.value = "0";
  renderCart();
  renderProducts();
}

async function resetDay() {
  if (state.loading) {
    return;
  }

  setStatus("Resetting store data...", "neutral");

  try {
    const payload = await apiRequest("/api/reset", {
      method: "POST",
    });

    state.products = payload.products;
    state.sales = payload.sales;
    state.cart = [];
    ui.searchInput.value = "";
    ui.discountInput.value = "0";
    ui.taxInput.value = "8.5";
    state.activeCategory = "All";
    state.searchTerm = "";
    renderCategoryFilters();
    renderProducts();
    renderCart();
    renderReceipts();
    renderMetrics();
    setStatus("Store reset back to starter inventory.", "success");
  } catch (error) {
    setStatus(error.message || "Reset failed.", "danger");
  }
}

ui.searchInput.addEventListener("input", (event) => {
  state.searchTerm = event.target.value;
  renderProducts();
});

ui.discountInput.addEventListener("input", renderCart);
ui.taxInput.addEventListener("input", renderCart);
ui.clearCartButton.addEventListener("click", clearCart);
ui.checkoutButton.addEventListener("click", checkout);
ui.resetSalesButton.addEventListener("click", resetDay);

renderCart();
loadStore();
