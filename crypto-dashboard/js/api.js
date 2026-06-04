// ============================================================
// js/api.js — CoinGecko API Layer
// Supports: multi-call batching, per-TTL cache, retry on 429,
//           auto-refresh polling, and user-controlled options.
// ============================================================

const API_BASE = "https://api.coingecko.com/api/v3";

// ─────────────────────────────────────────────
// CACHE — per-URL with individual TTLs
// ─────────────────────────────────────────────
const _cache = new Map();

function cacheGet(url) {
  if (!_cache.has(url)) return null;
  const { data, expiresAt } = _cache.get(url);
  return Date.now() < expiresAt ? data : null;
}

function cacheSet(url, data, ttlMs) {
  _cache.set(url, { data, expiresAt: Date.now() + ttlMs });
}

export function cacheBust(url) { _cache.delete(url); }
export function clearCache()   { _cache.clear(); }

// ─────────────────────────────────────────────
// CORE FETCHER — retry + cache + error handling
// ─────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Internal fetch with caching + exponential back-off retry on 429.
 * @param {string} url
 * @param {object} opts
 * @param {number} opts.ttl       Cache TTL ms   (default 60 000)
 * @param {number} opts.retries   Max 429 retries (default 3)
 * @param {number} opts.retryMs   Initial back-off ms (default 2 000)
 */
async function apiFetch(url, { ttl = 60_000, retries = 3, retryMs = 2_000 } = {}) {
  // Serve from cache if still fresh
  const cached = cacheGet(url);
  if (cached !== null) return cached;

  let attempt = 0;
  while (true) {
    const res = await fetch(url);

    if (res.ok) {
      const data = await res.json();
      cacheSet(url, data, ttl);
      return data;
    }

    if (res.status === 429 && attempt < retries) {
      const wait = retryMs * Math.pow(2, attempt);
      console.warn(`[API] 429 — retrying in ${wait}ms (attempt ${attempt + 1}/${retries})`);
      await sleep(wait);
      attempt++;
      continue;
    }

    const msg = {
      400: "Bad request — check coin ID or parameters.",
      404: "Coin not found. Try the exact CoinGecko ID (e.g. 'bitcoin').",
      429: "Rate limit exceeded. Please wait a moment and try again.",
      500: "CoinGecko server error. Try again later.",
    }[res.status] || `API error ${res.status}`;
    throw new Error(msg);
  }
}

// ─────────────────────────────────────────────
// MULTI-CALL BATCH HELPER
// ─────────────────────────────────────────────

/**
 * Run multiple API calls in PARALLEL and return all results.
 * Failed calls don't block others — each gets a status tag.
 *
 * Returns: Array of { label, status: "ok"|"error", data, error }
 *
 * Example:
 *   const [global, coins, btc] = await apiBatch([
 *     { label: "global", fn: fetchGlobalStats },
 *     { label: "coins",  fn: () => fetchTopCoins({ perPage: 20 }) },
 *     { label: "btc",    fn: () => fetchCoin("bitcoin") },
 *   ]);
 *   if (coins.status === "ok") renderTable(coins.data);
 */
export async function apiBatch(calls) {
  const results = await Promise.allSettled(calls.map(({ fn }) => fn()));
  return results.map((r, i) => ({
    label:  calls[i].label ?? i,
    status: r.status === "fulfilled" ? "ok" : "error",
    data:   r.status === "fulfilled" ? r.value : null,
    error:  r.status === "rejected"  ? r.reason : null,
  }));
}

// ─────────────────────────────────────────────
// AUTO-REFRESH POLLING
// ─────────────────────────────────────────────
const _pollers = new Map();

/**
 * Poll an API function on a timer and call onData() with fresh results.
 * Minimum interval is 30 s to respect CoinGecko rate limits.
 *
 * @param {string}   key        Unique name (e.g. "topCoins")
 * @param {Function} fn         Async function returning data
 * @param {number}   intervalMs Polling interval (min enforced: 30 000)
 * @param {Function} onData     Called with fresh data each tick
 * @param {Function} [onError]  Optional — called with error on failure
 */
export function startPolling(key, fn, intervalMs, onData, onError) {
  stopPolling(key);
  const safe = Math.max(intervalMs, 30_000);
  const id = setInterval(async () => {
    try {
      // Bust cache so the real fetch fires
      clearCache();
      const data = await fn();
      onData(data);
    } catch (err) {
      onError && onError(err);
    }
  }, safe);
  _pollers.set(key, id);
  console.log(`[Poller] "${key}" started — every ${safe / 1000}s`);
}

export function stopPolling(key) {
  if (_pollers.has(key)) {
    clearInterval(_pollers.get(key));
    _pollers.delete(key);
  }
}

export function stopAllPolling() {
  _pollers.forEach((_, k) => stopPolling(k));
}

// ─────────────────────────────────────────────
// ENDPOINT FUNCTIONS — all user-configurable
// ─────────────────────────────────────────────

/**
 * Full coin detail by ID (price, market data, ATH, description, links…)
 * @param {string} coinId  e.g. "bitcoin"
 */
export async function fetchCoin(coinId) {
  if (!coinId) throw new Error("coinId is required");
  const url =
    `${API_BASE}/coins/${coinId}` +
    `?localization=false&tickers=false&community_data=false&developer_data=false`;
  return apiFetch(url, { ttl: 90_000 });
}

/**
 * Top N coins by market cap, with sparklines and change percentages.
 *
 * @param {object} opts
 * @param {number}  opts.perPage   1–250  (default 20)
 * @param {number}  opts.page      Page # (default 1)
 * @param {string}  opts.currency  vs_currency (default "usd")
 * @param {string}  opts.order     "market_cap_desc" | "market_cap_asc" |
 *                                 "gecko_desc" | "volume_asc" | "volume_desc" (default "market_cap_desc")
 */
export async function fetchTopCoins({
  perPage  = 20,
  page     = 1,
  currency = "usd",
  order    = "market_cap_desc",
} = {}) {
  const url =
    `${API_BASE}/coins/markets` +
    `?vs_currency=${currency}` +
    `&order=${order}` +
    `&per_page=${perPage}` +
    `&page=${page}` +
    `&sparkline=true` +
    `&price_change_percentage=1h,24h,7d`;
  return apiFetch(url, { ttl: 60_000 });
}

/**
 * Price history for a coin (used for charts).
 *
 * @param {string} coinId
 * @param {object} opts
 * @param {number|string} opts.days      1, 7, 14, 30, 90, 180, 365, "max"
 * @param {string}        opts.currency  vs_currency (default "usd")
 * @param {string}        [opts.interval] "daily" | "hourly" (auto if omitted)
 */
export async function fetchHistory(coinId, {
  days     = 7,
  currency = "usd",
  interval,
} = {}) {
  if (!coinId) throw new Error("coinId is required");
  let url =
    `${API_BASE}/coins/${coinId}/market_chart` +
    `?vs_currency=${currency}&days=${days}`;
  if (interval) url += `&interval=${interval}`;
  // Older data changes less — give it a longer cache
  const ttl = days <= 1 ? 30_000 : days <= 7 ? 60_000 : 300_000;
  return apiFetch(url, { ttl });
}

/**
 * Price history between two UNIX timestamps (seconds).
 *
 * @param {string} coinId
 * @param {number} from     Unix timestamp
 * @param {number} to       Unix timestamp
 * @param {string} currency
 */
export async function fetchHistoryRange(coinId, from, to, currency = "usd") {
  const url =
    `${API_BASE}/coins/${coinId}/market_chart/range` +
    `?vs_currency=${currency}&from=${from}&to=${to}`;
  return apiFetch(url, { ttl: 300_000 });
}

/**
 * OHLC (candlestick) data for a coin.
 *
 * @param {string} coinId
 * @param {object} opts
 * @param {number} opts.days      1, 7, 14, 30, 90, 180, 365
 * @param {string} opts.currency
 */
export async function fetchOHLC(coinId, { days = 7, currency = "usd" } = {}) {
  const url =
    `${API_BASE}/coins/${coinId}/ohlc` +
    `?vs_currency=${currency}&days=${days}`;
  return apiFetch(url, { ttl: 60_000 });
}

/**
 * Lightweight real-time price for one or more coins in one or more currencies.
 * Most real-time endpoint — TTL is only 30 s.
 *
 * @param {string|string[]} ids           e.g. "bitcoin" or ["bitcoin","ethereum"]
 * @param {string|string[]} vsCurrencies  e.g. "usd" or ["usd","inr","eur"]
 * @param {object}          opts
 * @param {boolean}         opts.include24hChange
 * @param {boolean}         opts.includeMarketCap
 * @param {boolean}         opts.include24hVol
 */
export async function fetchSimplePrice(ids, vsCurrencies = "usd", {
  include24hChange = true,
  includeMarketCap = false,
  include24hVol    = false,
} = {}) {
  const idStr  = Array.isArray(ids)          ? ids.join(",")          : ids;
  const curStr = Array.isArray(vsCurrencies) ? vsCurrencies.join(",") : vsCurrencies;
  const url =
    `${API_BASE}/simple/price` +
    `?ids=${idStr}` +
    `&vs_currencies=${curStr}` +
    `&include_24hr_change=${include24hChange}` +
    `&include_market_cap=${includeMarketCap}` +
    `&include_24hr_vol=${include24hVol}`;
  return apiFetch(url, { ttl: 30_000 });
}

/**
 * Search coins by name / ticker.
 *
 * @param {string} query
 * @param {number} limit  Max results (default 6)
 */
export async function searchCoins(query, limit = 6) {
  if (!query || query.trim().length < 2) return [];
  const url = `${API_BASE}/search?query=${encodeURIComponent(query.trim())}`;
  const data = await apiFetch(url, { ttl: 120_000 });
  return (data.coins ?? []).slice(0, limit);
}

/**
 * Global market stats (total market cap, BTC dominance, active coins…)
 */
export async function fetchGlobalStats() {
  return apiFetch(`${API_BASE}/global`, { ttl: 120_000 });
}

/**
 * CoinGecko's trending list (top 7 search coins right now).
 */
export async function fetchTrending() {
  return apiFetch(`${API_BASE}/search/trending`, { ttl: 300_000 });
}

/**
 * All coins list — id, symbol, name only. Used for validation / autocomplete.
 * TTL: 1 hour (rarely changes).
 */
export async function fetchCoinsList() {
  return apiFetch(`${API_BASE}/coins/list?include_platform=false`, { ttl: 3_600_000 });
}

/**
 * Live USD → any currency exchange rate (derived from USDT price on CoinGecko).
 *
 * @param {string} from  e.g. "usd"
 * @param {string} to    e.g. "inr"
 */
export async function getExchangeRate(from = "usd", to = "inr") {
  try {
    const data = await fetchSimplePrice("tether", [from, to], { include24hChange: false });
    const fromRate = data.tether?.[from] ?? 1;
    const toRate   = data.tether?.[to]   ?? 83.5;
    return toRate / fromRate;
  } catch {
    const fallbacks = {
      usd_inr: 83.5, inr_usd: 0.012,
      usd_eur: 0.92, eur_usd: 1.09,
      usd_gbp: 0.79, gbp_usd: 1.27,
    };
    return fallbacks[`${from}_${to}`] ?? 1;
  }
}

// ─────────────────────────────────────────────
// DERIVED / COMPUTED HELPERS
// ─────────────────────────────────────────────

/**
 * Split a coins array into top gainers and losers.
 *
 * @param {Array}  coins   From fetchTopCoins()
 * @param {number} count   Per side (default 5)
 * @param {string} field   Change field (default "price_change_percentage_24h")
 */
export function getGainersLosers(coins, count = 5, field = "price_change_percentage_24h") {
  const valid  = coins.filter((c) => c[field] != null);
  const sorted = [...valid].sort((a, b) => b[field] - a[field]);
  return {
    gainers: sorted.slice(0, count),
    losers:  sorted.slice(-count).reverse(),
  };
}

/**
 * Fetch top coins AND split into gainers/losers in a single call.
 *
 * @param {object} topCoinsOpts   Forwarded to fetchTopCoins (e.g. { currency: "inr" })
 * @param {number} count          Movers per side
 */
export async function fetchMovers(topCoinsOpts = {}, count = 5) {
  const coins = await fetchTopCoins({ perPage: 50, ...topCoinsOpts });
  return { coins, ...getGainersLosers(coins, count) };
}
