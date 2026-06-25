"""
stocks.py
---------
Fetches and caches stock data for 40 tickers across 5 sectors.

Data sources, in priority order per refresh:
  1. Real data from yfinance (free, no API key, needs internet).
  2. A built-in simulator (random walk around realistic base prices) for any
     ticker yfinance could not return — and for ALL tickers when DEMO_MODE=true
     or when yfinance is unreachable.

This guarantees the universe always animates: prices drift, change_pct flips
between positive/negative, so spheres pulse and dim even fully offline.

A background task refreshes the in-memory cache on a fixed interval so that
WebSocket broadcasts and REST reads never hit yfinance directly.
"""

from __future__ import annotations

import asyncio
import logging
import math
import os
import random
import time
from collections import deque
from typing import Deque, Dict, List, Optional

logger = logging.getLogger("orion.stocks")

REFRESH_INTERVAL = int(os.getenv("REFRESH_INTERVAL", "5"))
# DEMO_MODE=true skips yfinance entirely and runs the simulator (fully offline).
DEMO_MODE = os.getenv("DEMO_MODE", "false").strip().lower() in {"1", "true", "yes"}

# Sector -> {ticker: name}. The name is hard-coded so the UI always has a
# readable label even if yfinance metadata is slow or unavailable.
SECTORS: Dict[str, Dict[str, str]] = {
    "Tech": {
        "AAPL": "Apple Inc.",
        "MSFT": "Microsoft Corporation",
        "GOOGL": "Alphabet Inc.",
        "NVDA": "NVIDIA Corporation",
        "META": "Meta Platforms, Inc.",
        "TSLA": "Tesla, Inc.",
        "AMD": "Advanced Micro Devices, Inc.",
        "INTC": "Intel Corporation",
        "AVGO": "Broadcom Inc.",
        "QCOM": "QUALCOMM Incorporated",
    },
    "Finance": {
        "JPM": "JPMorgan Chase & Co.",
        "BAC": "Bank of America Corporation",
        "GS": "The Goldman Sachs Group, Inc.",
        "WFC": "Wells Fargo & Company",
        "MS": "Morgan Stanley",
        "BLK": "BlackRock, Inc.",
        "C": "Citigroup Inc.",
        "AXP": "American Express Company",
        "SCHW": "The Charles Schwab Corporation",
        "V": "Visa Inc.",
    },
    "Healthcare": {
        "JNJ": "Johnson & Johnson",
        "PFE": "Pfizer Inc.",
        "UNH": "UnitedHealth Group Incorporated",
        "ABBV": "AbbVie Inc.",
        "MRK": "Merck & Co., Inc.",
        "LLY": "Eli Lilly and Company",
        "TMO": "Thermo Fisher Scientific Inc.",
        "ABT": "Abbott Laboratories",
        "CVS": "CVS Health Corporation",
        "AMGN": "Amgen Inc.",
    },
    "Energy": {
        "XOM": "Exxon Mobil Corporation",
        "CVX": "Chevron Corporation",
        "COP": "ConocoPhillips",
        "SLB": "Schlumberger Limited",
        "EOG": "EOG Resources, Inc.",
        "PXD": "Pioneer Natural Resources Company",
        "MPC": "Marathon Petroleum Corporation",
        "VLO": "Valero Energy Corporation",
        "PSX": "Phillips 66",
        "OXY": "Occidental Petroleum Corporation",
    },
    "Consumer": {
        "AMZN": "Amazon.com, Inc.",
        "WMT": "Walmart Inc.",
        "PG": "The Procter & Gamble Company",
        "KO": "The Coca-Cola Company",
        "MCD": "McDonald's Corporation",
        "NKE": "NIKE, Inc.",
        "SBUX": "Starbucks Corporation",
        "TGT": "Target Corporation",
        "HD": "The Home Depot, Inc.",
        "COST": "Costco Wholesale Corporation",
    },
}

# Flat lookups built from SECTORS.
TICKER_SECTOR: Dict[str, str] = {}
TICKER_NAME: Dict[str, str] = {}
for _sector, _members in SECTORS.items():
    for _ticker, _name in _members.items():
        TICKER_SECTOR[_ticker] = _sector
        TICKER_NAME[_ticker] = _name

ALL_TICKERS: List[str] = list(TICKER_SECTOR.keys())

# Approximate base prices (USD) used to seed the simulator. They don't need to
# be exact — just realistic enough for a believable demo.
_BASE_PRICE: Dict[str, float] = {
    "AAPL": 230, "MSFT": 430, "GOOGL": 175, "NVDA": 130, "META": 560,
    "TSLA": 250, "AMD": 160, "INTC": 30, "AVGO": 170, "QCOM": 170,
    "JPM": 215, "BAC": 42, "GS": 480, "WFC": 65, "MS": 100,
    "BLK": 880, "C": 65, "AXP": 250, "SCHW": 72, "V": 280,
    "JNJ": 150, "PFE": 28, "UNH": 500, "ABBV": 175, "MRK": 125,
    "LLY": 800, "TMO": 560, "ABT": 110, "CVS": 60, "AMGN": 310,
    "XOM": 115, "CVX": 155, "COP": 110, "SLB": 45, "EOG": 125,
    "PXD": 260, "MPC": 165, "VLO": 140, "PSX": 130, "OXY": 60,
    "AMZN": 185, "WMT": 70, "PG": 165, "KO": 62, "MCD": 290,
    "NKE": 80, "SBUX": 95, "TGT": 150, "HD": 360, "COST": 880,
}

# Approximate shares outstanding (billions) so market cap = price * shares
# stays consistent as simulated prices drift.
_SHARES_B: Dict[str, float] = {
    "AAPL": 15.2, "MSFT": 7.4, "GOOGL": 12.2, "NVDA": 24.5, "META": 2.5,
    "TSLA": 3.2, "AMD": 1.6, "INTC": 4.3, "AVGO": 4.7, "QCOM": 1.1,
    "JPM": 2.8, "BAC": 7.6, "GS": 0.32, "WFC": 3.4, "MS": 1.6,
    "BLK": 0.15, "C": 1.9, "AXP": 0.72, "SCHW": 1.8, "V": 2.0,
    "JNJ": 2.4, "PFE": 5.7, "UNH": 0.92, "ABBV": 1.8, "MRK": 2.5,
    "LLY": 0.95, "TMO": 0.38, "ABT": 1.7, "CVS": 1.3, "AMGN": 0.54,
    "XOM": 4.4, "CVX": 1.8, "COP": 1.2, "SLB": 1.4, "EOG": 0.57,
    "PXD": 0.23, "MPC": 0.34, "VLO": 0.32, "PSX": 0.42, "OXY": 0.94,
    "AMZN": 10.5, "WMT": 8.0, "PG": 2.4, "KO": 4.3, "MCD": 0.72,
    "NKE": 1.5, "SBUX": 1.1, "TGT": 0.46, "HD": 1.0, "COST": 0.44,
}

# In-memory cache: ticker -> stock dict. Protected by a lock.
_cache: Dict[str, dict] = {}
_cache_lock = asyncio.Lock()

# Simulator state: ticker -> {"open": float, "price": float}. "open" is the
# session reference used to compute change_pct; "price" random-walks each tick.
_sim: Dict[str, Dict[str, float]] = {}

# Rolling recent-price buffer per ticker, used to draw list sparklines.
SPARK_LEN = 32
_spark: Dict[str, Deque[float]] = {}

# range -> (yf period, yf interval, synthetic point count, synthetic step secs)
_HIST_SPEC: Dict[str, tuple] = {
    "1D": ("1d", "5m", 78, 300),
    "1W": ("5d", "30m", 70, 1800),
    "1M": ("1mo", "1d", 30, 86400),
    "1Y": ("1y", "1d", 252, 86400),
}


def _synth_closes(end_price: float, n: int, vol: float, rnd: random.Random) -> List[float]:
    """A geometric random walk of n closes that ends exactly at end_price."""
    cum = 0.0
    raw: List[float] = []
    for _ in range(n):
        cum += rnd.gauss(0, vol)
        raw.append(end_price * math.exp(cum))
    factor = end_price / raw[-1] if raw[-1] else 1.0
    return [p * factor for p in raw]


def _market_cap(ticker: str, price: float) -> float:
    shares = _SHARES_B.get(ticker, 1.0) * 1e9
    return price * shares


def _seed_sim() -> None:
    """Initialize the simulator open/price and sparkline buffer for each ticker."""
    for ticker in ALL_TICKERS:
        if ticker not in _sim:
            base = _BASE_PRICE.get(ticker, 100.0)
            # Open slightly off the base so the first tick already shows motion.
            open_price = base * (1 + random.uniform(-0.01, 0.01))
            _sim[ticker] = {"open": round(open_price, 2), "price": round(open_price, 2)}
        if ticker not in _spark:
            # Seed a short synthetic trend so sparklines render immediately.
            rnd = random.Random(hash(ticker) & 0xFFFFFFFF)
            series = _synth_closes(_sim[ticker]["price"], SPARK_LEN, 0.01, rnd)
            dq: Deque[float] = deque(maxlen=SPARK_LEN)
            for p in series:
                dq.append(round(p, 2))
            _spark[ticker] = dq


def _simulate(ticker: str) -> dict:
    """Advance the random walk one step and return a stock dict."""
    state = _sim[ticker]
    # Small step with mild mean-reversion toward the session open.
    drift = random.gauss(0, 0.0035)
    reversion = (state["open"] - state["price"]) / state["open"] * 0.05
    new_price = max(0.5, state["price"] * (1 + drift + reversion))
    state["price"] = new_price

    change_pct = (new_price / state["open"] - 1) * 100 if state["open"] else 0.0
    base_vol = _BASE_PRICE.get(ticker, 100.0) * 1e5  # cheap, ticker-stable scale
    volume = int(base_vol * random.uniform(0.7, 1.3))

    return {
        "ticker": ticker,
        "name": TICKER_NAME[ticker],
        "price": round(new_price, 2),
        "change_pct": round(change_pct, 2),
        "volume": volume,
        "market_cap": _market_cap(ticker, new_price),
        "sector": TICKER_SECTOR[ticker],
        "spark": list(_spark.get(ticker, [])),
    }


def _fetch_blocking() -> Dict[str, dict]:
    """
    Synchronous yfinance fetch for all tickers (runs in a worker thread).
    Returns ticker -> stock dict only for tickers that returned usable data.
    Raises on a hard failure (caught by refresh_once, which then simulates).
    """
    import yfinance as yf  # imported lazily so DEMO_MODE needs no network libs

    result: Dict[str, dict] = {}
    data = yf.download(
        tickers=ALL_TICKERS,
        period="1d",
        interval="1m",
        group_by="ticker",
        threads=True,
        progress=False,
        auto_adjust=False,
    )

    for ticker in ALL_TICKERS:
        try:
            level0 = data.columns.get_level_values(0)
            frame = data[ticker] if ticker in level0 else None
        except Exception:
            frame = None

        price: Optional[float] = None
        prev: Optional[float] = None
        volume = 0

        if frame is not None and not frame.empty:
            closes = frame["Close"].dropna()
            if len(closes) >= 1:
                price = float(closes.iloc[-1])
                prev = float(closes.iloc[0])
            vols = frame["Volume"].dropna()
            if len(vols) >= 1:
                volume = int(vols.sum())

        if price is None:
            continue

        market_cap = _market_cap(ticker, price)
        try:
            fast = yf.Ticker(ticker).fast_info
            mc = fast.get("market_cap") if hasattr(fast, "get") else None
            if mc:
                market_cap = float(mc)
        except Exception:
            pass

        change_pct = ((price - prev) / prev * 100) if (prev and prev != 0) else 0.0

        result[ticker] = {
            "ticker": ticker,
            "name": TICKER_NAME[ticker],
            "price": round(price, 2),
            "change_pct": round(change_pct, 2),
            "volume": volume,
            "market_cap": market_cap,
            "sector": TICKER_SECTOR[ticker],
        }

    return result


async def refresh_once() -> None:
    """Refresh the cache: real data where possible, simulated for the rest."""
    fetched: Dict[str, dict] = {}

    if not DEMO_MODE:
        try:
            fetched = await asyncio.to_thread(_fetch_blocking)
        except Exception as exc:  # noqa: BLE001 - never let the loop die
            logger.warning("yfinance unavailable, simulating all: %s", exc)
            fetched = {}

    # Any ticker missing from the real fetch gets a simulated record so the
    # universe always has motion.
    merged: Dict[str, dict] = {}
    simulated = 0
    for ticker in ALL_TICKERS:
        if ticker in fetched:
            merged[ticker] = fetched[ticker]
            # Keep the simulator anchored near the latest real price.
            _sim[ticker]["price"] = fetched[ticker]["price"]
        else:
            merged[ticker] = _simulate(ticker)
            simulated += 1

    # Push the latest price into each sparkline buffer and attach it.
    for ticker in ALL_TICKERS:
        rec = merged[ticker]
        dq = _spark.setdefault(ticker, deque(maxlen=SPARK_LEN))
        dq.append(rec["price"])
        rec["spark"] = list(dq)

    async with _cache_lock:
        _cache.update(merged)

    if DEMO_MODE:
        logger.info("Refreshed (DEMO) %d simulated tickers", len(merged))
    else:
        logger.info(
            "Refreshed %d real, %d simulated", len(fetched), simulated
        )


async def init_cache() -> None:
    """Seed the simulator and cache, then do one refresh."""
    _seed_sim()
    async with _cache_lock:
        for ticker in ALL_TICKERS:
            _cache.setdefault(ticker, _simulate(ticker))
    await refresh_once()


async def refresh_loop(stop_event: asyncio.Event) -> None:
    """Background task: refresh the cache every REFRESH_INTERVAL seconds."""
    while not stop_event.is_set():
        await refresh_once()
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=REFRESH_INTERVAL)
        except asyncio.TimeoutError:
            pass


async def get_all_stocks() -> List[dict]:
    """Return a snapshot list of all cached stocks (ordered by ALL_TICKERS)."""
    async with _cache_lock:
        return [_cache[ticker] for ticker in ALL_TICKERS if ticker in _cache]


async def get_stock(ticker: str) -> Optional[dict]:
    """Return a single cached stock, or None if the ticker is unknown."""
    ticker = ticker.upper()
    if ticker not in TICKER_SECTOR:
        return None
    async with _cache_lock:
        return _cache.get(ticker)


def _history_yf(ticker: str, period: str, interval: str) -> List[dict]:
    """Real OHLC candles from yfinance. Raises/returns [] on failure."""
    import yfinance as yf  # lazy import so DEMO_MODE needs no network libs

    df = yf.Ticker(ticker).history(period=period, interval=interval)
    candles: List[dict] = []
    for idx, row in df.iterrows():
        o, h, l, c = row.get("Open"), row.get("High"), row.get("Low"), row.get("Close")
        vals = [o, h, l, c]
        if any(v is None or (isinstance(v, float) and math.isnan(v)) for v in vals):
            continue
        candles.append(
            {
                "time": int(idx.timestamp()),
                "open": round(float(o), 2),
                "high": round(float(h), 2),
                "low": round(float(l), 2),
                "close": round(float(c), 2),
            }
        )
    return candles


def _history_synth(ticker: str, rng: str, count: int, step: int) -> List[dict]:
    """Believable synthetic OHLC candles ending near the current price."""
    rnd = random.Random((hash(ticker) ^ hash(rng)) & 0xFFFFFFFF)
    end_price = _sim.get(ticker, {}).get("price") or _BASE_PRICE.get(ticker, 100.0)
    vol = {"1D": 0.004, "1W": 0.008, "1M": 0.012, "1Y": 0.02}.get(rng, 0.012)

    closes = _synth_closes(end_price, count, vol, rnd)
    now = int(time.time())
    candles: List[dict] = []
    prev = closes[0] * (1 + rnd.uniform(-0.003, 0.003))
    for i, close in enumerate(closes):
        t = now - (count - 1 - i) * step
        open_ = prev
        high = max(open_, close) * (1 + abs(rnd.gauss(0, vol * 0.6)))
        low = min(open_, close) * (1 - abs(rnd.gauss(0, vol * 0.6)))
        candles.append(
            {
                "time": t,
                "open": round(open_, 2),
                "high": round(high, 2),
                "low": round(low, 2),
                "close": round(close, 2),
            }
        )
        prev = close
    return candles


def get_history(ticker: str, rng: str) -> Optional[List[dict]]:
    """
    Return OHLC candles for one ticker over a range (1D/1W/1M/1Y).
    Tries yfinance in live mode and falls back to synthetic candles.
    Returns None if the ticker is unknown. Runs blocking work; call via
    asyncio.to_thread from async code.
    """
    ticker = ticker.upper()
    if ticker not in TICKER_SECTOR:
        return None
    rng = rng.upper()
    if rng not in _HIST_SPEC:
        rng = "1M"
    period, interval, count, step = _HIST_SPEC[rng]

    if not DEMO_MODE:
        try:
            data = _history_yf(ticker, period, interval)
            if data and len(data) >= 2:
                return data
        except Exception as exc:  # noqa: BLE001
            logger.warning("history yfinance failed for %s: %s", ticker, exc)

    return _history_synth(ticker, rng, count, step)
