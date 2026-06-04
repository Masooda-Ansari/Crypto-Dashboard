# CryptoDash — Real-Time Crypto Market Tracker

> A production-ready, zero-dependency crypto dashboard built with vanilla HTML, CSS, and JavaScript ES Modules.

---

## 🚀 Live Demo

Deploy on [Render](https://render.com), [Vercel](https://vercel.com), [Netlify](https://netlify.com), or GitHub Pages.

---

## 📁 Project Structure

```
crypto-dashboard/
├── components/
│   ├── header.html          # Sticky header with nav, theme toggle, live badge
│   └── footer.html          # Footer with links, disclaimer, toast container
├── pages/
│   ├── index.html           # Main dashboard
│   └── about.html           # About / architecture page
├── css/
│   ├── base.css             # CSS custom properties, reset, typography
│   ├── layout.css           # Grid, flex utilities, responsive breakpoints
│   ├── components.css       # Header, footer, cards, buttons, inputs, spinner
│   └── dashboard.css        # Ticker, table, charts, sidebar widgets
├── js/
│   ├── loader.js            # Dynamic component loader, theme/nav wiring
│   ├── api.js               # CoinGecko API + cache layer
│   ├── utils.js             # Formatters, LocalStorage, toast, sparklines
│   └── dashboard.js         # Main app logic (ES module entry point)
├── images/
│   └── logo.png             # (optional) Static logo asset
└── README.md
```

---

## ✅ Core Features (70%)

| Feature | File |
|---|---|
| Search with live autocomplete | `dashboard.js` → `searchCoins()` |
| Live coin data (price, 24h change, market cap) | `api.js` → `fetchCoin()` |
| 7/30/90-day price history chart | `api.js` → `fetchHistory()` + Chart.js |
| Top 20 coins market table with sparklines | `dashboard.js` → `renderCoinsTable()` |
| Save/load favorites via LocalStorage | `utils.js` → `saveFavorite / loadFavorites` |

---

## 🎓 Trainee Additions (30%)

| Feature | File |
|---|---|
| Currency converter (USD ↔ INR, live rate) | `dashboard.js` → converter section |
| Top Gainers / Losers widget | `api.js` → `getGainersLosers()` |
| Dark / Light mode toggle (persisted) | `loader.js` + CSS variables |
| Loading spinner (global + inline) | `utils.js` → `showSpinner / hideSpinner` |

---

## 🔌 API Used

**CoinGecko Public API v3** — `https://api.coingecko.com/api/v3`

| Endpoint | Used For |
|---|---|
| `/coins/{id}` | Full coin detail |
| `/coins/markets` | Top N coins table + ticker |
| `/coins/{id}/market_chart` | Price history for chart |
| `/search?query=` | Search autocomplete |
| `/global` | Market stats bar |
| `/simple/price` | Exchange rate for converter |

> ⚠️ Free tier has rate limits (~50 req/min). The `api.js` includes a 60-second in-memory cache.

---

## 🛠 How to Run Locally

### Option A — Simple HTTP Server (recommended)
```bash
# Python 3
python3 -m http.server 8080
# Open http://localhost:8080/pages/index.html
```

```bash
# Node.js (npx)
npx serve .
```

### Option B — VS Code Live Server
Install the **Live Server** extension and click "Go Live".

> ⚠️ **Must use a local server** — ES Modules (`type="module"`) don't work with `file://` protocol due to CORS restrictions.

---

## 🌍 Deploy on Render (Free)

1. Push this project to a GitHub repo
2. Go to [render.com](https://render.com) → New → Static Site
3. Set **Publish directory** to `.` (project root)
4. Set **Build command** to (leave blank — no build step)
5. Your site will be live at `https://your-name.onrender.com/pages/index.html`

---

## 🎨 Design System

| Token | Value |
|---|---|
| Background | `#0a0e1a` (dark) / `#f0f4ff` (light) |
| Accent Cyan | `#00d4ff` |
| Accent Green | `#00e676` |
| Accent Red | `#ff4d4d` |
| Display Font | Syne (Google Fonts) |
| Mono Font | Space Mono (Google Fonts) |
| Body Font | DM Sans (Google Fonts) |

---

## 📖 Workflow

```
Page Load
  └─ loader.js injects header + footer HTML
  └─ loader.js wires: theme toggle, active nav, mobile menu
  └─ dashboard.js (ES module) fires init()
       ├─ fetchGlobalStats() → renderGlobalStats()
       ├─ fetchTopCoins()    → renderTicker() + renderCoinsTable()
       ├─ loadFavorites()    → renderFavorites()
       ├─ getGainersLosers() → renderMovers()
       └─ getExchangeRate()  → renderConverter()

User searches a coin
  └─ debounced input → searchCoins() → renderSuggestions()
  └─ user picks/enters → fetchCoin() → renderCoinResult()
                       → fetchHistory() → renderChart()

User stars a coin
  └─ saveFavorite() → localStorage
  └─ renderFavorites() updates sidebar

User clicks table row
  └─ loadCoinDetail(coinId) → same flow as search
```

---

## 📝 License

MIT — free to use, modify, and deploy.
