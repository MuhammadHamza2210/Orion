---
title: Orion API
emoji: 📈
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# Orion — Stock Universe

> 🔴 **Live demo:** **https://orion-nine-wine.vercel.app/**
>
> The React trading dashboard is on Vercel; the FastAPI backend runs on Hugging
> Face. Written AI analysis is powered by Google Gemini; live market data streams
> from Yahoo Finance with a built-in simulator fallback.

A full-stack stock dashboard for 50 tickers across 5 sectors. Live prices stream
from a FastAPI + yfinance backend over WebSockets into a dark trading UI with
interactive charts (TradingView lightweight-charts), and a local Ollama model
(`llama3.2:1b`) provides on-demand AI analysis for any stock.

```
orion/
├── backend/    FastAPI · yfinance · Ollama
└── frontend/   React + TypeScript · lightweight-charts · Tailwind CSS
```

## Features

- **Interactive charts** — line/area and candlestick views with 1D/1W/1M/1Y
  timeframes for the selected stock, powered by TradingView lightweight-charts.
- **Sortable stock list** — 50 tickers with inline sparklines, sector filter
  pills, and sort by market cap / % change / price / name.
- **Sector performance bars** — live average % change per sector along the bottom.
- **Live data** — backend refreshes yfinance every 5s and broadcasts to all
  WebSocket clients. The client auto-reconnects if the socket drops.
- **AI analysis** — streaming, word-by-word insight from a local Ollama model.
  No API keys, no paid services.
- **Search** — autocomplete by ticker or company name jumps to any stock.

## Prerequisites

- Python 3.10+
- Node.js 18+
- [Ollama](https://ollama.com) installed locally

Pull the model once:

```bash
ollama pull llama3.2:1b
```

## Run it

Open three terminals.

**1. Ollama** (if not already running as a service):

```bash
ollama serve
```

**2. Backend:**

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

The API comes up on `http://localhost:8000`. Optionally copy `.env.example` to
`.env` to tweak the model, refresh interval, or CORS origin.

**3. Frontend:**

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**.

## How it fits together

| Piece | Endpoint | Purpose |
| --- | --- | --- |
| WebSocket | `ws://localhost:8000/ws/stocks` | Broadcasts all stocks (with sparkline data) every 5s |
| REST | `GET /stock/{ticker}` | Detailed data for one ticker |
| REST | `GET /history/{ticker}?range=1D\|1W\|1M\|1Y` | OHLC candles for the chart |
| REST | `POST /ai/analyze` | Streams Ollama analysis as plain text |
| REST | `GET /health` | Liveness + how many tickers have loaded |

The frontend proxies REST calls through Vite (`/api/*` → `http://localhost:8000`),
while the WebSocket connects directly.


## It works even offline

The app is built to always render and animate, so it's reliable as a portfolio
demo regardless of network conditions:

- **No internet / Yahoo rate-limited?** The backend has a built-in price
  simulator (random walk around realistic base prices). Any ticker yfinance
  can't return is simulated automatically, so spheres always pulse and dim.
  To skip yfinance entirely and run fully offline, set `DEMO_MODE=true` in
  `backend/.env`.
- **Ollama not running?** The "AI Analysis" button falls back to a rule-based
  analyst note (streamed word by word, same UX) instead of erroring. Pull the
  model and run `ollama serve` to get real LLM output.

## Notes

- The first WebSocket frame is sent immediately on connect, so the universe
  renders without waiting for the next 5s tick.
- yfinance is queried in a single batched download per refresh and cached in
  memory — WebSocket broadcasts never hit yfinance directly.
- The ticker lists contain 50 names (10 per sector × 5 sectors); the universe
  renders all of them. The count shown in the HUD is dynamic.

## Tech stack

**Frontend:** React 18, TypeScript, lightweight-charts, Tailwind CSS, Vite
**Backend:** FastAPI, yfinance, httpx, Ollama (`llama3.2:1b`), Uvicorn

## How to run

**Terminal 1 — backend:**
cd C:\Users\ihamz\.spyder-py3\projects\orion\backend
python -m uvicorn main:app --port 8000

**Terminal 2 — frontend:**
cd C:\Users\ihamz\.spyder-py3\projects\orion\frontend
npm run dev