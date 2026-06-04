// js/utils.js — Utility functions for formatting, storage, and UI helpers

// ========== FAVORITES (LocalStorage) ==========

/**
 * Save a coin to favorites
 * @param {Object} coin — { id, name, symbol, image }
 */
export function saveFavorite(coin) {
  const favs = loadFavorites();
  if (!favs.find(f => f.id === coin.id)) {
    favs.push(coin);
    localStorage.setItem("cd-favorites", JSON.stringify(favs));
    return true; // newly added
  }
  return false; // already existed
}

/**
 * Remove a coin from favorites by id
 */
export function removeFavorite(coinId) {
  const favs = loadFavorites().filter(f => f.id !== coinId);
  localStorage.setItem("cd-favorites", JSON.stringify(favs));
}

/**
 * Load all favorites from LocalStorage
 */
export function loadFavorites() {
  try {
    return JSON.parse(localStorage.getItem("cd-favorites")) || [];
  } catch {
    return [];
  }
}

/**
 * Check if a coin is already in favorites
 */
export function isFavorite(coinId) {
  return loadFavorites().some(f => f.id === coinId);
}

// ========== FORMATTING ==========

/**
 * Format a number as USD price
 */
export function formatPrice(num, currency = "USD") {
  if (num == null || isNaN(num)) return "—";
  if (num < 0.01) {
    return `$${num.toFixed(6)}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Format a number as INR price
 */
export function formatINR(num) {
  if (num == null || isNaN(num)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * Format large numbers with B/M/K abbreviations
 */
export function formatLargeNum(num) {
  if (num == null || isNaN(num)) return "—";
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

/**
 * Format percentage change with sign
 */
export function formatPct(pct) {
  if (pct == null || isNaN(pct)) return "—";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

/**
 * Returns CSS class name for a positive/negative value
 */
export function changeClass(val) {
  if (val > 0) return "price-up";
  if (val < 0) return "price-down";
  return "";
}

/**
 * Format a date string or timestamp to short date
 */
export function formatDate(ts) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Format a date to HH:MM
 */
export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

// ========== TOAST NOTIFICATIONS ==========

export function showToast(message, type = "info", duration = 3000) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration + 300);
}

// ========== DEBOUNCE ==========

export function debounce(fn, delay = 350) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ========== SPINNER ==========

export function showSpinner(message = "Loading...") {
  let overlay = document.getElementById("spinnerOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "spinnerOverlay";
    overlay.className = "spinner-overlay";
    overlay.innerHTML = `
      <div class="spinner"></div>
      <p class="spinner-text" id="spinnerText">${message}</p>
    `;
    document.body.appendChild(overlay);
  } else {
    const txt = document.getElementById("spinnerText");
    if (txt) txt.textContent = message;
    overlay.style.display = "flex";
  }
}

export function hideSpinner() {
  const overlay = document.getElementById("spinnerOverlay");
  if (overlay) overlay.style.display = "none";
}

// ========== SPARKLINE ==========
/**
 * Render a tiny inline SVG sparkline from an array of prices
 */
export function renderSparkline(prices, isUp = true) {
  if (!prices || prices.length < 2) return "";
  const vals = prices.map(p => (Array.isArray(p) ? p[1] : p));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const w = 80, h = 28;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  const color = isUp ? "#00e676" : "#ff4d4d";
  return `
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>
  `;
}
