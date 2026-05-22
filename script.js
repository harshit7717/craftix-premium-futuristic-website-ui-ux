const particleRoot = document.getElementById("particles");
const productGrid = document.getElementById("productGrid");
const adminSection = document.getElementById("admin");
const brandMark = document.getElementById("brandMark");
const adminLoginForm = document.getElementById("adminLoginForm");
const adminPassword = document.getElementById("adminPassword");
const adminLoginMsg = document.getElementById("adminLoginMsg");
const adminPanel = document.getElementById("adminPanel");
const adminForm = document.getElementById("adminForm");
const productImageFile = document.getElementById("productImageFile");
const salesListEl = document.getElementById("salesList");
const totalOrdersEl = document.getElementById("totalOrders");
const totalRevenueEl = document.getElementById("totalRevenue");
const adminLogoutBtn = document.getElementById("adminLogoutBtn");

const checkoutModal = document.getElementById("checkoutModal");
const checkoutForm = document.getElementById("checkoutForm");
const checkoutProduct = document.getElementById("checkoutProduct");
const closeCheckout = document.getElementById("closeCheckout");

let selectedProductId = null;
let logoTapCount = 0;
let logoTapTimer = null;

function formatINR(price) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(price);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Image read failed"));
    reader.readAsDataURL(file);
  });
}

async function request(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function loadProducts() {
  const { products } = await request("/api/products");
  productGrid.innerHTML = "";
  products.forEach((product) => {
    const card = document.createElement("article");
    card.className = "product-card glass reveal visible";
    card.innerHTML = `
      <img src="${product.image}" alt="${product.name}" loading="lazy" />
      <div class="product-meta"><h3>${product.name}</h3><strong>${formatINR(product.price)}</strong></div>
      <p>${product.description}</p>
      <button class="btn btn-secondary" data-buy="${product.id}">Buy Now</button>
    `;
    productGrid.appendChild(card);
  });

  document.querySelectorAll("[data-buy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { products } = await request("/api/products");
      const p = products.find((x) => x.id === btn.dataset.buy);
      if (!p) return;
      selectedProductId = p.id;
      checkoutProduct.textContent = `${p.name} - ${formatINR(p.price)}`;
      checkoutModal.hidden = false;
    });
  });
}

async function refreshAdmin() {
  const [statsData, orderData] = await Promise.all([request("/api/admin/stats"), request("/api/admin/orders")]);
  totalOrdersEl.textContent = String(statsData.totalOrders);
  totalRevenueEl.textContent = formatINR(statsData.totalRevenue);
  salesListEl.innerHTML = "";
  orderData.orders.slice(0, 12).forEach((o) => {
    const li = document.createElement("li");
    li.innerHTML = `${o.productName} x${o.quantity} - ${formatINR(o.total)} - ${o.customerName} (${o.phone}) <strong>[${(o.status || "new").toUpperCase()}]</strong>
    <select data-order-id="${o.id}" class="order-status">
      <option value="new" ${o.status === "new" ? "selected" : ""}>new</option>
      <option value="confirmed" ${o.status === "confirmed" ? "selected" : ""}>confirmed</option>
      <option value="shipped" ${o.status === "shipped" ? "selected" : ""}>shipped</option>
      <option value="delivered" ${o.status === "delivered" ? "selected" : ""}>delivered</option>
    </select>`;
    salesListEl.appendChild(li);
  });
  if (!orderData.orders.length) {
    const li = document.createElement("li");
    li.textContent = "No orders yet.";
    salesListEl.appendChild(li);
  }

  document.querySelectorAll(".order-status").forEach((sel) => {
    sel.addEventListener("change", async () => {
      try {
        await request(`/api/admin/orders/${sel.dataset.orderId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: sel.value })
        });
        await refreshAdmin();
      } catch (err) {
        adminLoginMsg.textContent = err.message;
      }
    });
  });
}

function revealAdminLogin() {
  adminSection.hidden = false;
  adminPanel.hidden = true;
  adminLoginMsg.textContent = "";
  adminSection.scrollIntoView({ behavior: "smooth" });
  document.querySelectorAll("#admin .reveal").forEach((el) => el.classList.add("visible"));
}

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "a") revealAdminLogin();
});

brandMark.addEventListener("click", () => {
  logoTapCount += 1;
  if (logoTapTimer) clearTimeout(logoTapTimer);
  logoTapTimer = setTimeout(() => { logoTapCount = 0; }, 1600);
  if (logoTapCount >= 5) {
    logoTapCount = 0;
    revealAdminLogin();
  }
});

adminLoginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await request("/api/admin/login", { method: "POST", body: JSON.stringify({ password: adminPassword.value }) });
    adminLoginMsg.textContent = "Logged in";
    adminPanel.hidden = false;
    await refreshAdmin();
  } catch (err) {
    adminLoginMsg.textContent = err.message;
  }
});

adminLogoutBtn.addEventListener("click", async () => {
  await request("/api/admin/logout", { method: "POST", body: JSON.stringify({}) });
  adminPanel.hidden = true;
  adminSection.hidden = true;
});

adminForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  let imagePayload = document.getElementById("productImage").value.trim();
  const file = productImageFile.files && productImageFile.files[0];
  if (file) {
    imagePayload = await readFileAsDataUrl(file);
  }
  const payload = {
    name: document.getElementById("productName").value.trim(),
    price: Number(document.getElementById("productPrice").value),
    image: imagePayload,
    description: document.getElementById("productDescription").value.trim()
  };
  try {
    await request("/api/admin/products", { method: "POST", body: JSON.stringify(payload) });
    adminForm.reset();
    await loadProducts();
    await refreshAdmin();
  } catch (err) {
    adminLoginMsg.textContent = err.message;
  }
});

checkoutForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    productId: selectedProductId,
    customerName: document.getElementById("customerName").value.trim(),
    phone: document.getElementById("customerPhone").value.trim(),
    quantity: Number(document.getElementById("orderQty").value),
    notes: document.getElementById("orderNotes").value.trim()
  };
  try {
    const paymentOrder = await request("/api/payments/create-order", { method: "POST", body: JSON.stringify(payload) });
    const rzp = new window.Razorpay({
      key: paymentOrder.keyId,
      amount: paymentOrder.amount,
      currency: paymentOrder.currency,
      name: "Craftix",
      description: "Custom Manufacturing Order",
      order_id: paymentOrder.razorpayOrderId,
      prefill: {
        name: paymentOrder.customerName,
        contact: paymentOrder.phone
      },
      handler: async (response) => {
        await request("/api/payments/verify", {
          method: "POST",
          body: JSON.stringify({
            ...response,
            localOrderId: paymentOrder.localOrderId
          })
        });
        checkoutForm.reset();
        checkoutModal.hidden = true;
        alert("Payment successful and order confirmed.");
      },
      theme: { color: "#33caff" }
    });
    rzp.on("payment.failed", async () => {
      // Fallback: keep order as inquiry if payment fails.
      await request("/api/orders", { method: "POST", body: JSON.stringify(payload) });
      alert("Payment failed. Order inquiry has still been submitted.");
    });
    rzp.open();
  } catch (err) {
    // If Razorpay is not configured, fallback to inquiry order.
    if (String(err.message).toLowerCase().includes("not configured")) {
      await request("/api/orders", { method: "POST", body: JSON.stringify(payload) });
      checkoutForm.reset();
      checkoutModal.hidden = true;
      alert("Payment is not live yet. Your order inquiry has been submitted.");
      return;
    }
    alert(err.message || "Checkout failed");
  }
});

closeCheckout.addEventListener("click", () => { checkoutModal.hidden = true; });

const particleCount = window.innerWidth < 768 ? 30 : 65;
for (let i = 0; i < particleCount; i += 1) {
  const p = document.createElement("span");
  p.className = "particle";
  p.style.left = `${Math.random() * 100}%`;
  p.style.top = `${Math.random() * 100}%`;
  p.style.animationDuration = `${6 + Math.random() * 12}s`;
  p.style.animationDelay = `${Math.random() * -10}s`;
  p.style.opacity = `${0.2 + Math.random() * 0.8}`;
  particleRoot.appendChild(p);
}

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.18 });
document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

loadProducts();
