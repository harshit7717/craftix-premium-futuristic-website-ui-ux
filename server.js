const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const HOST = "127.0.0.1";
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "data.json");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "0607";
const SESSION_SECRET = process.env.SESSION_SECRET || "craftix-change-this-secret";
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v) => `"${String(v ?? "").replace(/"/g, "\"\"")}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    const seed = {
      products: [
        { id: "p1", name: "Custom Acrylic Nameplate", price: 1499, image: "https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=1200&q=80", description: "Edge-lit acrylic plate with precision engraving for desks and studios." },
        { id: "p2", name: "Laser Engraved Wooden Plaque", price: 999, image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=1200&q=80", description: "Premium hardwood plaque with deep-burn detail and matte finish." },
        { id: "p3", name: "3D Printed Prototype Kit", price: 2499, image: "https://images.unsplash.com/photo-1581093458791-9d42e8428d14?auto=format&fit=crop&w=1200&q=80", description: "Functional rapid-prototype parts printed for fit and form validation." }
      ],
      orders: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function sendJson(res, code, payload) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}

function createSession() {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const raw = `admin.${exp}`;
  return `${raw}.${sign(raw)}`;
}

function verifySession(token) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 4) return false;
  const [role, exp] = [parts[0], parts[1]];
  if (role !== "admin") return false;
  const raw = `${parts[0]}.${parts[1]}`;
  if (sign(raw) !== parts[3]) return false;
  return Number(exp) > Date.now();
}

function getCookies(req) {
  const h = req.headers.cookie || "";
  return Object.fromEntries(h.split(";").map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf("=");
    return [v.slice(0, i), decodeURIComponent(v.slice(i + 1))];
  }));
}

function requireAdmin(req, res) {
  const token = getCookies(req).craftix_session;
  if (!verifySession(token)) {
    sendJson(res, 401, { error: "Unauthorized" });
    return false;
  }
  return true;
}

function serveStatic(req, res, pathname) {
  let filePath = path.join(ROOT, pathname === "/" ? "index.html" : pathname.slice(1));
  if (!filePath.startsWith(ROOT)) return sendJson(res, 403, { error: "Forbidden" });
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(ROOT, "index.html");
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

function createRazorpayOrder({ amountInPaise, receipt }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      amount: amountInPaise,
      currency: "INR",
      receipt,
      payment_capture: 1
    });

    const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");
    const options = {
      hostname: "api.razorpay.com",
      path: "/v1/orders",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        Authorization: `Basic ${auth}`
      }
    };

    const rq = https.request(options, (rp) => {
      let body = "";
      rp.on("data", (chunk) => {
        body += chunk;
      });
      rp.on("end", () => {
        try {
          const parsed = JSON.parse(body || "{}");
          if (rp.statusCode >= 200 && rp.statusCode < 300) return resolve(parsed);
          reject(new Error(parsed.error?.description || "Razorpay order failed"));
        } catch {
          reject(new Error("Invalid Razorpay response"));
        }
      });
    });
    rq.on("error", reject);
    rq.write(payload);
    rq.end();
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  try {
    if (pathname === "/api/products" && req.method === "GET") {
      return sendJson(res, 200, { products: readData().products });
    }

    if (pathname === "/api/orders" && req.method === "POST") {
      const body = await parseBody(req);
      if (!body.productId || !body.customerName || !body.phone) return sendJson(res, 400, { error: "Missing fields" });
      const data = readData();
      const product = data.products.find(p => p.id === body.productId);
      if (!product) return sendJson(res, 404, { error: "Product not found" });
      const quantity = Math.max(1, Number(body.quantity || 1));
      const order = {
        id: crypto.randomUUID(),
        productId: product.id,
        productName: product.name,
        unitPrice: product.price,
        quantity,
        total: product.price * quantity,
        customerName: String(body.customerName).trim(),
        phone: String(body.phone).trim(),
        notes: String(body.notes || "").trim(),
        status: "new",
        createdAt: new Date().toISOString()
      };
      data.orders.unshift(order);
      writeData(data);
      return sendJson(res, 201, { ok: true, orderId: order.id });
    }

    if (pathname === "/api/payments/create-order" && req.method === "POST") {
      const body = await parseBody(req);
      if (!body.productId || !body.customerName || !body.phone) return sendJson(res, 400, { error: "Missing fields" });
      if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) return sendJson(res, 400, { error: "Payment gateway not configured" });
      const data = readData();
      const product = data.products.find((p) => p.id === body.productId);
      if (!product) return sendJson(res, 404, { error: "Product not found" });

      const quantity = Math.max(1, Number(body.quantity || 1));
      const amount = product.price * quantity;
      const draftOrder = {
        id: crypto.randomUUID(),
        productId: product.id,
        productName: product.name,
        unitPrice: product.price,
        quantity,
        total: amount,
        customerName: String(body.customerName).trim(),
        phone: String(body.phone).trim(),
        notes: String(body.notes || "").trim(),
        status: "new",
        paymentStatus: "pending",
        createdAt: new Date().toISOString()
      };
      data.orders.unshift(draftOrder);
      writeData(data);

      const rzpOrder = await createRazorpayOrder({
        amountInPaise: amount * 100,
        receipt: draftOrder.id
      });
      return sendJson(res, 201, {
        ok: true,
        keyId: RAZORPAY_KEY_ID,
        razorpayOrderId: rzpOrder.id,
        amount: rzpOrder.amount,
        currency: rzpOrder.currency,
        localOrderId: draftOrder.id,
        customerName: draftOrder.customerName,
        phone: draftOrder.phone
      });
    }

    if (pathname === "/api/payments/verify" && req.method === "POST") {
      const body = await parseBody(req);
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, localOrderId } = body;
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !localOrderId) {
        return sendJson(res, 400, { error: "Missing payment verification fields" });
      }
      const expected = crypto
        .createHmac("sha256", RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");
      if (expected !== razorpay_signature) return sendJson(res, 400, { error: "Invalid payment signature" });

      const data = readData();
      const order = data.orders.find((o) => o.id === localOrderId);
      if (!order) return sendJson(res, 404, { error: "Order not found" });
      order.paymentStatus = "paid";
      order.paymentId = razorpay_payment_id;
      order.razorpayOrderId = razorpay_order_id;
      writeData(data);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === "/api/admin/login" && req.method === "POST") {
      const body = await parseBody(req);
      if (body.password !== ADMIN_PASSWORD) return sendJson(res, 401, { error: "Invalid password" });
      const token = createSession();
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": `craftix_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`
      });
      return res.end(JSON.stringify({ ok: true }));
    }

    if (pathname === "/api/admin/logout" && req.method === "POST") {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": "craftix_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
      });
      return res.end(JSON.stringify({ ok: true }));
    }

    if (pathname === "/api/admin/me" && req.method === "GET") {
      return sendJson(res, 200, { authenticated: verifySession(getCookies(req).craftix_session) });
    }

    if (pathname === "/api/admin/products" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = await parseBody(req);
      if (!body.name || !body.description || !body.price) return sendJson(res, 400, { error: "Missing fields" });
      const data = readData();
      const product = {
        id: crypto.randomUUID(),
        name: String(body.name).trim(),
        price: Number(body.price),
        image: String(body.image || "").trim(),
        description: String(body.description).trim()
      };
      data.products.unshift(product);
      writeData(data);
      return sendJson(res, 201, { ok: true, product });
    }

    if (pathname.startsWith("/api/admin/products/") && req.method === "DELETE") {
      if (!requireAdmin(req, res)) return;
      const id = pathname.split("/").pop();
      const data = readData();
      data.products = data.products.filter(p => p.id !== id);
      writeData(data);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === "/api/admin/orders" && req.method === "GET") {
      if (!requireAdmin(req, res)) return;
      return sendJson(res, 200, { orders: readData().orders });
    }

    if (pathname.startsWith("/api/admin/orders/") && req.method === "PATCH") {
      if (!requireAdmin(req, res)) return;
      const id = pathname.split("/").pop();
      const body = await parseBody(req);
      const allowed = new Set(["new", "confirmed", "shipped", "delivered"]);
      if (!allowed.has(String(body.status || ""))) return sendJson(res, 400, { error: "Invalid status" });
      const data = readData();
      const order = data.orders.find((o) => o.id === id);
      if (!order) return sendJson(res, 404, { error: "Order not found" });
      order.status = body.status;
      writeData(data);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === "/api/admin/stats" && req.method === "GET") {
      if (!requireAdmin(req, res)) return;
      const orders = readData().orders;
      const totalOrders = orders.length;
      const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
      return sendJson(res, 200, { totalOrders, totalRevenue });
    }

    if (pathname === "/api/admin/export/orders.csv" && req.method === "GET") {
      if (!requireAdmin(req, res)) return;
      const rows = readData().orders.map((o) => ({
        id: o.id,
        createdAt: o.createdAt,
        status: o.status || "new",
        productName: o.productName,
        quantity: o.quantity,
        total: o.total,
        customerName: o.customerName,
        phone: o.phone,
        notes: o.notes || ""
      }));
      const csv = toCsv(rows);
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=craftix-orders.csv"
      });
      return res.end(csv);
    }

    serveStatic(req, res, pathname);
  } catch (err) {
    sendJson(res, 500, { error: "Server error", detail: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Craftix server running on http://${HOST}:${PORT}`);
});
