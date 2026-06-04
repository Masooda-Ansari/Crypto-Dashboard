// js/dashboard.js — Main Dashboard Logic (ES Module)
import {
  fetchCoin,
  fetchTopCoins,
  fetchHistory,
  searchCoins,
  fetchGlobalStats,
  fetchSimplePrice,
  fetchTrending,
  getGainersLosers,
  getExchangeRate,
  apiBatch,
  startPolling,
  stopAllPolling,
} from "./api.js";

import {
  saveFavorite,
  removeFavorite,
  loadFavorites,
  isFavorite,
  formatPrice,
  formatINR,
  formatLargeNum,
  formatPct,
  changeClass,
  formatDate,
  formatTime,
  showToast,
  debounce,
  showSpinner,
  hideSpinner,
  renderSparkline,
} from "./utils.js";

// ============================
// STATE
// ============================
let activeChart = null;
let currentCoin = null;
let topCoins = [];
let exchangeRate = 83.5; // USD → INR fallback

// ============================
// DOM REFERENCES
// ============================
const searchInput   = document.getElementById("search");
const suggestions   = document.getElementById("searchSuggestions");
const resultsEl     = document.getElementById("results");
const chartSection  = document.getElementById("chartSection");
const priceChart    = document.getElementById("priceChart");
const favListEl     = document.getElementById("favList");
const coinsTableBody = document.getElementById("coinsTableBody");
const tickerInner   = document.getElementById("tickerInner");
const converterUsd  = document.getElementById("converterUsd");
const converterInr  = document.getElementById("converterInr");
const converterResult = document.getElementById("converterResult");
const moversList    = document.getElementById("moversList");
const statMktCap    = document.getElementById("statMktCap");
const statBtcDom    = document.getElementById("statBtcDom");
const statCoins     = document.getElementById("statCoins");
const statVol       = document.getElementById("statVol");

// ============================
// INIT — all startup calls in one apiBatch
// ============================
async function init() {
  showSpinner("Loading market data…");

  // ── BATCH: fire all startup API calls in parallel ──────────────────
  // Each entry has a label and a fn. Failed calls don't block others.
  const results = await apiBatch([
    { label: "global",   fn: () => fetchGlobalStats() },
    { label: "coins",    fn: () => fetchTopCoins({ perPage: 20 }) },
    { label: "rate",     fn: () => getExchangeRate("usd", "inr") },
    { label: "trending", fn: () => fetchTrending() },
  ]);

  // Destructure by label position (same order as array above)
  const [globalRes, coinsRes, rateRes] = results;

  results.forEach(r => {
    if (r.status === "error") {
      console.warn(`[init] "${r.label}" failed:`, r.error?.message);
    }
  });

  // Apply results — each guarded so a single failure doesn't break the rest
  if (globalRes.status === "ok") renderGlobalStats(globalRes.data.data);
  else showToast("Could not load global stats", "error");

  if (coinsRes.status === "ok") {
    topCoins = coinsRes.data;
    renderTicker(topCoins);
    renderCoinsTable(topCoins);
    renderMovers("gainers");
  } else {
    showToast("Could not load coin list", "error");
  }

  if (rateRes.status === "ok") {
    exchangeRate = rateRes.data;
  }

  renderFavorites();
  renderConverter();
  hideSpinner();

  // ── POLLING: re-fetch live data every 60 s automatically ──────────
  // Each poller calls the API independently so one failure doesn't
  // kill the others. Cache is cleared each tick so fresh data arrives.

  startPolling(
    "topCoins",                               // key (unique name)
    () => fetchTopCoins({ perPage: 20 }),      // what to fetch
    10_000,                                   // every 10 s
    (freshCoins) => {                          // onData
      topCoins = freshCoins;
      renderTicker(freshCoins);
      renderCoinsTable(freshCoins);
      renderMovers(currentMoverTab);
      showToast("Market data refreshed", "info");
    },
    (err) => console.warn("[poll:topCoins]", err.message)
  );

  startPolling(
    "globalStats",
    () => fetchGlobalStats(),
    120_000,                                  // every 2 min (changes slowly)
    (fresh) => renderGlobalStats(fresh.data),
    (err) => console.warn("[poll:globalStats]", err.message)
  );

  // If a coin detail is open, refresh its price every 30 s
  startPolling(
    "activeCoin",
    async () => {
      if (!currentCoin) return null;
      // Use lightweight simple/price endpoint — not the full coin endpoint
      const prices = await fetchSimplePrice(
        currentCoin.id,
        ["usd", "inr"],
        { include24hChange: true }
      );
      return prices[currentCoin.id] ?? null;
    },
    30_000,
    (price) => {
      if (!price || !currentCoin) return;
      // Patch the live price into the already-rendered card without full re-render
      const priceEl = document.getElementById("livePriceUsd");
      const inrEl   = document.getElementById("livePriceInr");
      const chgEl   = document.getElementById("liveChange24h");
      if (priceEl) priceEl.textContent = formatPrice(price.usd);
      if (inrEl)   inrEl.textContent   = formatINR(price.usd * exchangeRate);
      if (chgEl) {
        const chg = price.usd_24h_change ?? 0;
        chgEl.textContent  = formatPct(chg);
        chgEl.className    = `coin-stat-val ${changeClass(chg)}`;
      }
    },
    (err) => console.warn("[poll:activeCoin]", err.message)
  );
}

// Stop all pollers when page unloads
window.addEventListener("beforeunload", stopAllPolling);

// ============================
// GLOBAL STATS
// ============================
function renderGlobalStats(data) {
  if (statMktCap) {
    statMktCap.textContent = formatLargeNum(data.total_market_cap?.usd || 0);
  }
  if (statBtcDom) {
    statBtcDom.textContent = `${(data.market_cap_percentage?.btc || 0).toFixed(1)}%`;
  }
  if (statCoins) {
    statCoins.textContent = (data.active_cryptocurrencies || 0).toLocaleString();
  }
  if (statVol) {
    statVol.textContent = formatLargeNum(data.total_volume?.usd || 0);
  }
}

// ============================
// TICKER TAPE
// ============================
function renderTicker(coins) {
  if (!tickerInner) return;
  const items = [...coins, ...coins]; // duplicate for seamless loop
  tickerInner.innerHTML = items.map(c => {
    const chg = c.price_change_percentage_24h || 0;
    return `
      <div class="ticker-item">
        <img src="${c.image}" alt="${c.name}" width="16" height="16" onerror="this.style.display='none'">
        <span>${c.symbol.toUpperCase()}</span>
        <span class="ticker-price">${formatPrice(c.current_price)}</span>
        <span class="ticker-change ${chg >= 0 ? 'up' : 'down'}">${formatPct(chg)}</span>
      </div>
    `;
  }).join("");
}

// ============================
// SEARCH
// ============================
if (searchInput) {
  searchInput.addEventListener("input", debounce(handleSearchInput, 300));
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      hideSuggestions();
      const val = searchInput.value.trim().toLowerCase();
      if (val) loadCoinDetail(val);
    }
    if (e.key === "Escape") hideSuggestions();
  });

  document.addEventListener("click", (e) => {
    if (!searchInput.contains(e.target)) hideSuggestions();
  });
}

async function handleSearchInput() {
  const query = searchInput.value.trim();
  if (!query || query.length < 2) return hideSuggestions();
  try {
    const results = await searchCoins(query);
    renderSuggestions(results);
  } catch {
    hideSuggestions();
  }
}

function renderSuggestions(coins) {
  if (!suggestions) return;
  if (!coins.length) return hideSuggestions();
  suggestions.innerHTML = coins.map(c => `
    <div class="suggestion-item" data-id="${c.id}">
      <img src="${c.large || c.thumb}" alt="${c.name}" width="28" height="28" onerror="this.src='https://via.placeholder.com/28'">
      <div>
        <div class="suggestion-name">${c.name}</div>
        <div class="suggestion-symbol">${c.symbol.toUpperCase()} · #${c.market_cap_rank || '?'}</div>
      </div>
    </div>
  `).join("");
  suggestions.style.display = "block";

  suggestions.querySelectorAll(".suggestion-item").forEach(item => {
    item.addEventListener("click", () => {
      searchInput.value = item.dataset.id;
      hideSuggestions();
      loadCoinDetail(item.dataset.id);
    });
  });
}

function hideSuggestions() {
  if (suggestions) suggestions.style.display = "none";
}

// ============================
// COIN DETAIL — batch: coin data + history in one go
// ============================
async function loadCoinDetail(coinId) {
  showSpinner(`Fetching ${coinId}…`);

  // Fire coin detail AND 7-day history in parallel — one apiBatch call
  const [coinRes, histRes] = await apiBatch([
    { label: "coin",    fn: () => fetchCoin(coinId) },
    { label: "history", fn: () => fetchHistory(coinId, { days: 7 }) },
  ]);

  hideSpinner();

  if (coinRes.status === "error") {
    if (resultsEl) {
      resultsEl.innerHTML = `
        <div class="card" style="text-align:center;padding:2rem;color:var(--accent-red);">
          <div style="font-size:2rem;margin-bottom:0.5rem;">⚠️</div>
          <p><strong>Coin not found</strong></p>
          <p style="font-size:0.85rem;color:var(--text-muted);margin-top:0.4rem;">${coinRes.error?.message ?? "Unknown error"}</p>
        </div>`;
    }
    showToast(coinRes.error?.message || "Coin not found", "error");
    return;
  }

  currentCoin = coinRes.data;
  renderCoinResult(coinRes.data);

  if (histRes.status === "ok") {
    renderChart(coinId, 7, histRes.data); // pass pre-fetched history — no extra call
  } else {
    showToast("Chart data unavailable", "error");
  }

  renderFavorites();
}

function renderCoinResult(data) {
  if (!resultsEl) return;
  const price = data.market_data?.current_price?.usd || 0;
  const change24h = data.market_data?.price_change_percentage_24h || 0;
  const mktCap = data.market_data?.market_cap?.usd || 0;
  const vol24h = data.market_data?.total_volume?.usd || 0;
  const fav = isFavorite(data.id);

  resultsEl.innerHTML = `
    <div class="coin-result-card">
      <div class="coin-result-header">
        <img class="coin-result-img" src="${data.image?.large}" alt="${data.name}">
        <div>
          <div class="coin-result-name">${data.name}</div>
          <div class="coin-result-symbol">${data.symbol.toUpperCase()}</div>
        </div>
        <div class="coin-result-rank">#${data.market_cap_rank || '?'}</div>
      </div>

      <div class="coin-result-stats">
        <div class="coin-stat">
          <div class="coin-stat-label">Price (USD) <span style="font-size:0.65rem;color:var(--accent-green);">● live</span></div>
          <div class="coin-stat-val" id="livePriceUsd">${formatPrice(price)}</div>
        </div>
        <div class="coin-stat">
          <div class="coin-stat-label">24h Change <span style="font-size:0.65rem;color:var(--accent-green);">● live</span></div>
          <div class="coin-stat-val ${changeClass(change24h)}" id="liveChange24h">${formatPct(change24h)}</div>
        </div>
        <div class="coin-stat">
          <div class="coin-stat-label">Market Cap</div>
          <div class="coin-stat-val">${formatLargeNum(mktCap)}</div>
        </div>
        <div class="coin-stat">
          <div class="coin-stat-label">24h Volume</div>
          <div class="coin-stat-val">${formatLargeNum(vol24h)}</div>
        </div>
        <div class="coin-stat">
          <div class="coin-stat-label">Price (INR) <span style="font-size:0.65rem;color:var(--accent-green);">● live</span></div>
          <div class="coin-stat-val" id="livePriceInr">${formatINR(price * exchangeRate)}</div>
        </div>
        <div class="coin-stat">
          <div class="coin-stat-label">All Time High</div>
          <div class="coin-stat-val">${formatPrice(data.market_data?.ath?.usd || 0)}</div>
        </div>
      </div>

      <div class="coin-result-actions">
        <button class="btn btn-primary" id="favBtn">
          ${fav ? '★ Favorited' : '☆ Add to Favorites'}
        </button>
        <button class="btn btn-ghost" id="chartDays7">7D</button>
        <button class="btn btn-ghost" id="chartDays30">30D</button>
        <button class="btn btn-ghost" id="chartDays90">90D</button>
      </div>
    </div>
  `;

  // Favorite toggle
  document.getElementById("favBtn").addEventListener("click", () => {
    const added = saveFavorite({
      id: data.id,
      name: data.name,
      symbol: data.symbol,
      image: data.image?.small,
    });
    if (added) {
      showToast(`${data.name} added to favorites ★`, "success");
    } else {
      showToast(`${data.name} already in favorites`, "info");
    }
    renderCoinResult(data);
    renderFavorites();
  });

  // Chart timeframe buttons — each fires a new fetchHistory call
  ["7", "30", "90"].forEach(d => {
    const btn = document.getElementById(`chartDays${d}`);
    if (btn) btn.addEventListener("click", () => renderChart(data.id, Number(d)));
  });
}

// ============================
// CHART — accepts pre-fetched data or fetches on demand
// ============================
async function renderChart(coinId, days = 7, prefetchedHistory = null) {
  if (!priceChart) return;
  if (chartSection) chartSection.style.display = "block";

  const chartTitle = document.getElementById("chartTitle");
  if (chartTitle) chartTitle.textContent = `${coinId.toUpperCase()} — ${days}D Price Chart`;

  try {
    // Use pre-fetched data if available (avoids a redundant API call),
    // otherwise fetch it now (e.g. when user clicks 30D / 90D button)
    const history = prefetchedHistory ?? await fetchHistory(coinId, { days });
    const prices = history.prices;

    if (activeChart) activeChart.destroy();

    const labels = prices.map(p => formatDate(p[0]));
    const dataPoints = prices.map(p => p[1]);
    const isUp = dataPoints[dataPoints.length - 1] >= dataPoints[0];
    const borderColor = isUp ? "#00e676" : "#ff4d4d";
    const gradientColor = isUp ? "rgba(0,230,118,0.15)" : "rgba(255,77,77,0.15)";

    const ctx = priceChart.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, gradientColor);
    gradient.addColorStop(1, "transparent");

    activeChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: `${coinId} Price (USD)`,
          data: dataPoints,
          borderColor,
          backgroundColor: gradient,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: borderColor,
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(19,25,41,0.95)",
            borderColor: "rgba(255,255,255,0.1)",
            borderWidth: 1,
            titleFont: { family: "'Space Mono', monospace", size: 11 },
            bodyFont: { family: "'DM Sans', sans-serif", size: 13 },
            callbacks: {
              label: (ctx) => ` ${formatPrice(ctx.parsed.y)}`,
            }
          }
        },
        scales: {
          x: {
            grid: { color: "rgba(255,255,255,0.04)", drawBorder: false },
            ticks: {
              color: "#8892a4",
              font: { family: "'Space Mono', monospace", size: 10 },
              maxTicksLimit: 7,
            }
          },
          y: {
            position: "right",
            grid: { color: "rgba(255,255,255,0.04)", drawBorder: false },
            ticks: {
              color: "#8892a4",
              font: { family: "'Space Mono', monospace", size: 10 },
              callback: (val) => formatPrice(val),
            }
          }
        }
      }
    });
  } catch (err) {
    showToast("Failed to load chart data", "error");
    console.error(err);
  }
}

// ============================
// COINS TABLE
// ============================
function renderCoinsTable(coins) {
  if (!coinsTableBody) return;
  coinsTableBody.innerHTML = coins.map(c => {
    const chg24 = c.price_change_percentage_24h || 0;
    const spark = renderSparkline(c.sparkline_in_7d?.price, chg24 >= 0);
    return `
      <tr data-id="${c.id}">
        <td><span class="coin-rank">${c.market_cap_rank}</span></td>
        <td>
          <div class="coin-table-info">
            <img class="coin-table-img" src="${c.image}" alt="${c.name}" width="30" height="30" onerror="this.style.display='none'">
            <div>
              <div class="coin-table-name">${c.name}</div>
              <div class="coin-table-symbol">${c.symbol.toUpperCase()}</div>
            </div>
          </div>
        </td>
        <td class="right" style="font-family:var(--font-mono);font-size:0.875rem;">${formatPrice(c.current_price)}</td>
        <td class="right ${changeClass(chg24)}">${formatPct(chg24)}</td>
        <td class="right" style="color:var(--text-secondary);">${formatLargeNum(c.market_cap)}</td>
        <td class="right sparkline-cell">${spark}</td>
      </tr>
    `;
  }).join("");

  coinsTableBody.querySelectorAll("tr[data-id]").forEach(row => {
    row.addEventListener("click", () => {
      searchInput.value = row.dataset.id;
      loadCoinDetail(row.dataset.id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

// ============================
// FAVORITES
// ============================
function renderFavorites() {
  if (!favListEl) return;
  const favs = loadFavorites();
  if (!favs.length) {
    favListEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⭐</div>
        <p>No favorites yet.<br>Search a coin and star it!</p>
      </div>`;
    return;
  }
  favListEl.innerHTML = favs.map(f => `
    <li class="fav-item" data-id="${f.id}">
      <div class="fav-coin-info">
        <img class="fav-coin-img" src="${f.image}" alt="${f.name}" width="22" height="22" onerror="this.style.display='none'">
        <span class="fav-coin-name">${f.name}</span>
        <span style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-muted);margin-left:0.25rem;">${f.symbol?.toUpperCase()}</span>
      </div>
      <button class="fav-remove" data-id="${f.id}" title="Remove">✕</button>
    </li>
  `).join("");

  favListEl.querySelectorAll(".fav-item").forEach(item => {
    item.addEventListener("click", (e) => {
      if (e.target.classList.contains("fav-remove")) return;
      searchInput.value = item.dataset.id;
      loadCoinDetail(item.dataset.id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  favListEl.querySelectorAll(".fav-remove").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      removeFavorite(id);
      showToast("Removed from favorites", "info");
      renderFavorites();
    });
  });
}

// ============================
// MOVERS (Gainers / Losers)
// ============================
let currentMoverTab = "gainers";

function renderMovers(type = "gainers") {
  currentMoverTab = type;
  if (!moversList || !topCoins.length) return;

  const { gainers, losers } = getGainersLosers(topCoins, 5);
  const list = type === "gainers" ? gainers : losers;

  moversList.innerHTML = list.map(c => {
    const chg = c.price_change_percentage_24h || 0;
    return `
      <div class="mover-item" data-id="${c.id}">
        <div class="mover-coin">
          <img src="${c.image}" alt="${c.name}" width="20" height="20" onerror="this.style.display='none'">
          ${c.symbol.toUpperCase()}
        </div>
        <span class="mover-change ${chg >= 0 ? 'up' : 'down'}">${formatPct(chg)}</span>
      </div>`;
  }).join("");

  moversList.querySelectorAll(".mover-item").forEach(item => {
    item.addEventListener("click", () => {
      searchInput.value = item.dataset.id;
      loadCoinDetail(item.dataset.id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  // Update tab states
  document.querySelectorAll(".mover-tab").forEach(tab => {
    tab.classList.remove("active");
    if (tab.dataset.type === type) tab.classList.add("active");
  });
}

// Mover tabs
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("mover-tab")) {
    renderMovers(e.target.dataset.type);
  }
});

// ============================
// CURRENCY CONVERTER (USD ↔ INR)
// ============================
function renderConverter() {
  if (converterUsd && converterInr) {
    converterUsd.addEventListener("input", () => {
      const usd = parseFloat(converterUsd.value) || 0;
      converterInr.value = (usd * exchangeRate).toFixed(2);
      updateConverterResult(usd);
    });
    converterInr.addEventListener("input", () => {
      const inr = parseFloat(converterInr.value) || 0;
      converterUsd.value = (inr / exchangeRate).toFixed(4);
      updateConverterResult(inr / exchangeRate);
    });
  }
}

function updateConverterResult(usd) {
  if (!converterResult) return;
  const inr = usd * exchangeRate;
  converterResult.textContent = usd > 0
    ? `$${usd.toFixed(2)} USD = ₹${inr.toFixed(2)} INR`
    : "";
}

// Swap button
document.addEventListener("click", (e) => {
  if (e.target.id === "converterSwap") {
    if (!converterUsd || !converterInr) return;
    const t = converterUsd.value;
    converterUsd.value = (parseFloat(converterInr.value) / exchangeRate).toFixed(4);
    converterInr.value = (parseFloat(t) * exchangeRate).toFixed(2);
  }
});

// ============================
// START
// ============================
init();
