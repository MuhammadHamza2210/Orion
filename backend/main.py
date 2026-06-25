"""
main.py
-------
FastAPI entrypoint for Orion — Stock Universe.

Endpoints:
  GET  /health            -> liveness + cache status
  GET  /stock/{ticker}    -> detailed cached data for one ticker
  POST /ai/analyze        -> streaming Ollama analysis (StreamingResponse)
  WS   /ws/stocks         -> broadcasts the full stock list every N seconds
"""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

import stocks
from ai import analyze_stock

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("orion.main")

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
BROADCAST_INTERVAL = int(os.getenv("BROADCAST_INTERVAL", "5"))

_stop_event = asyncio.Event()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Seed the cache and start the background refresher on startup."""
    await stocks.init_cache()
    refresher = asyncio.create_task(stocks.refresh_loop(_stop_event))
    logger.info("Orion backend ready — %d tickers cached", len(stocks.ALL_TICKERS))
    try:
        yield
    finally:
        _stop_event.set()
        refresher.cancel()
        try:
            await refresher
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Orion — Stock Universe", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN, "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    ticker: str
    price: float
    change: float
    sector: str


@app.get("/health")
async def health() -> dict:
    snapshot = await stocks.get_all_stocks()
    loaded = sum(1 for s in snapshot if s["price"] > 0)
    return {
        "status": "ok",
        "tickers": len(stocks.ALL_TICKERS),
        "loaded": loaded,
    }


@app.get("/stock/{ticker}")
async def stock_detail(ticker: str):
    data = await stocks.get_stock(ticker)
    if data is None:
        return JSONResponse(status_code=404, content={"error": f"Unknown ticker {ticker}"})
    return data


@app.get("/history/{ticker}")
async def stock_history(
    ticker: str,
    range_: str = Query("1M", alias="range"),
):
    """OHLC candles for one ticker over a range (1D / 1W / 1M / 1Y)."""
    candles = await asyncio.to_thread(stocks.get_history, ticker, range_)
    if candles is None:
        return JSONResponse(status_code=404, content={"error": f"Unknown ticker {ticker}"})
    return {"ticker": ticker.upper(), "range": range_.upper(), "candles": candles}


@app.post("/ai/analyze")
async def ai_analyze(req: AnalyzeRequest):
    """Stream the Ollama analysis back to the client as plain text chunks."""

    async def token_stream():
        async for chunk in analyze_stock(
            req.ticker, req.price, req.change, req.sector
        ):
            yield chunk

    return StreamingResponse(
        token_stream(),
        media_type="text/plain; charset=utf-8",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.websocket("/ws/stocks")
async def ws_stocks(websocket: WebSocket):
    """Push the full cached stock list to the client every BROADCAST_INTERVAL s."""
    await websocket.accept()
    logger.info("WebSocket client connected")
    try:
        # Send an immediate snapshot so the client renders without waiting.
        await websocket.send_json({"stocks": await stocks.get_all_stocks()})
        while True:
            await asyncio.sleep(BROADCAST_INTERVAL)
            await websocket.send_json({"stocks": await stocks.get_all_stocks()})
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as exc:  # noqa: BLE001
        logger.warning("WebSocket closed: %s", exc)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
