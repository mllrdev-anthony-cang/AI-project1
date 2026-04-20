const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "3000", 10);
const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const storeFile = path.join(dataDir, "store.json");

const staticFiles = {
  "/": "index.html",
  "/index.html": "index.html",
  "/styles.css": "styles.css",
  "/app.js": "app.js",
};

const seedProducts = [
  {
    id: "latte",
    name: "House Latte",
    category: "Coffee",
    description: "Double espresso, textured milk, and a smooth caramel finish.",
    price: 4.75,
    stock: 21,
  },
  {
    id: "americano",
    name: "Americano",
    category: "Coffee",
    description: "Bold espresso stretched with hot water for a clean finish.",
    price: 3.5,
    stock: 18,
  },
  {
    id: "matcha",
    name: "Matcha Cooler",
    category: "Tea",
    description: "Ceremonial matcha, citrus syrup, and sparkling water.",
    price: 5.25,
    stock: 14,
  },
  {
    id: "croissant",
    name: "Butter Croissant",
    category: "Bakery",
    description: "Flaky laminated pastry baked fresh every morning.",
    price: 3.2,
    stock: 10,
  },
  {
    id: "bagel",
    name: "Smoked Salmon Bagel",
    category: "Kitchen",
    description: "Whipped cream cheese, capers, dill, and smoked salmon.",
    price: 8.95,
    stock: 7,
  },
  {
    id: "wrap",
    name: "Falafel Wrap",
    category: "Kitchen",
    description: "Warm pita with falafel, pickled onion, and tahini slaw.",
    price: 9.5,
    stock: 12,
  },
  {
    id: "cookie",
    name: "Sea Salt Cookie",
    category: "Bakery",
    description: "Brown butter cookie with dark chocolate and sea salt.",
    price: 2.85,
    stock: 16,
  },
  {
    id: "juice",
    name: "Sunrise Juice",
    category: "Cold Drinks",
    description: "Orange, pineapple, and ginger pressed fresh to order.",
    price: 4.4,
    stock: 9,
  },
];

const defaultStore = {
  products: seedProducts,
  sales: [],
};

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(storeFile);
  } catch {
    await writeStore(defaultStore);
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(storeFile, "utf8");
  return JSON.parse(raw);
}

async function writeStore(store) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(storeFile, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(message);
}

async function readRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function buildSaleId(salesCount, now) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const sequence = String(salesCount + 1).padStart(3, "0");
  return `TX-${year}${month}${day}-${sequence}`;
}

function buildSaleTimestamp(now) {
  return now.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function calculateSaleTotals(products, items, discount, taxRate) {
  const normalizedItems = items.map((item) => {
    const product = products.find((entry) => entry.id === item.productId);
    if (!product) {
      throw new Error(`Product ${item.productId} does not exist.`);
    }

    const quantity = Number.parseInt(item.quantity, 10);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Quantity for ${product.name} must be greater than zero.`);
    }

    if (quantity > product.stock) {
      throw new Error(`${product.name} only has ${product.stock} left in stock.`);
    }

    return {
      product,
      quantity,
      lineTotal: product.price * quantity,
    };
  });

  const subtotal = normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const safeDiscount = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const safeTaxRate = Math.max(Number(taxRate) || 0, 0);
  const taxable = Math.max(subtotal - safeDiscount, 0);
  const tax = taxable * (safeTaxRate / 100);
  const total = taxable + tax;

  return {
    normalizedItems,
    subtotal,
    discount: Number(safeDiscount.toFixed(2)),
    taxRate: Number(safeTaxRate.toFixed(2)),
    tax: Number(tax.toFixed(2)),
    total: Number(total.toFixed(2)),
  };
}

async function handleApi(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/state") {
    const store = await readStore();
    return sendJson(response, 200, store);
  }

  if (request.method === "POST" && pathname === "/api/checkout") {
    const payload = await readRequestBody(request);
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      return sendJson(response, 400, {
        error: "Checkout requires at least one cart item.",
      });
    }

    const store = await readStore();
    const now = new Date();
    const totals = calculateSaleTotals(store.products, payload.items, payload.discount, payload.taxRate);

    totals.normalizedItems.forEach((item) => {
      item.product.stock -= item.quantity;
    });

    const sale = {
      id: buildSaleId(store.sales.length, now),
      timestamp: buildSaleTimestamp(now),
      items: totals.normalizedItems.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: Number(totals.subtotal.toFixed(2)),
      discount: totals.discount,
      taxRate: totals.taxRate,
      tax: totals.tax,
      total: totals.total,
    };

    store.sales.push(sale);
    await writeStore(store);

    return sendJson(response, 201, {
      sale,
      products: store.products,
      sales: store.sales,
    });
  }

  if (request.method === "POST" && pathname === "/api/reset") {
    const resetStore = JSON.parse(JSON.stringify(defaultStore));
    await writeStore(resetStore);
    return sendJson(response, 200, resetStore);
  }

  if (request.method === "GET" && pathname === "/api/health") {
    return sendJson(response, 200, {
      status: "ok",
    });
  }

  return false;
}

async function serveStatic(response, pathname) {
  const fileName = staticFiles[pathname];
  if (!fileName) {
    return false;
  }

  const filePath = path.join(rootDir, fileName);
  const content = await fs.readFile(filePath);
  const contentType = fileName.endsWith(".css")
    ? "text/css; charset=utf-8"
    : fileName.endsWith(".js")
      ? "application/javascript; charset=utf-8"
      : "text/html; charset=utf-8";

  response.writeHead(200, {
    "Content-Type": contentType,
  });
  response.end(content);
  return true;
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);
    const apiHandled = await handleApi(request, response, url.pathname);
    if (apiHandled !== false) {
      return;
    }

    const staticHandled = await serveStatic(response, url.pathname);
    if (staticHandled) {
      return;
    }

    sendText(response, 404, "Not found");
  } catch (error) {
    sendJson(response, 500, {
      error: error.message || "Server error.",
    });
  }
});

ensureStore()
  .then(() => {
    server.listen(port, host, () => {
      console.log(`Utang Tracker server running at http://${host}:${port}`);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
