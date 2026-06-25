"""
ai.py
-----
Streaming stock analysis backed by a local Ollama model (llama3.2:1b).

We talk to Ollama's REST API directly with httpx so we can forward the
streamed tokens to the FastAPI client as they arrive, without buffering the
whole completion in memory.
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import AsyncGenerator

import httpx

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:1b")

# Google Gemini (free tier) — used in the cloud where there is no local Ollama.
# Set GEMINI_API_KEY to enable; otherwise the app uses Ollama or the rule-based note.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

SYSTEM_PROMPT = (
    "You are a sharp financial analyst. Give a 3-sentence max insight on this "
    "stock. Be direct, no fluff, no disclaimers."
)


async def _fallback_insight(
    ticker: str, price: float, change_pct: float, sector: str
) -> AsyncGenerator[str, None]:
    """
    A rule-based analyst note used when Ollama is not reachable, so the
    "AI Analysis" button always returns something useful. Streamed word by
    word to mimic the real model's UX.
    """
    if change_pct > 1.5:
        tone = f"{ticker} is showing strong upward momentum today, up {change_pct:.2f}%."
        read = f"That kind of move in the {sector.lower()} space often reflects positive sentiment or sector rotation."
    elif change_pct > 0:
        tone = f"{ticker} is modestly higher, up {change_pct:.2f}%."
        read = f"A quiet green day for a {sector.lower()} name — steady rather than dramatic."
    elif change_pct < -1.5:
        tone = f"{ticker} is under clear pressure, down {abs(change_pct):.2f}%."
        read = f"Sharp drops in {sector.lower()} names can signal profit-taking or a broader risk-off mood."
    else:
        tone = f"{ticker} is slightly lower, down {abs(change_pct):.2f}%."
        read = f"A muted red session — typical noise for a {sector.lower()} stock at ${price:.2f}."

    close = "Watch sector peers and volume to judge whether the move has conviction behind it."
    text = f"{tone} {read} {close}"

    for word in text.split(" "):
        yield word + " "
        await asyncio.sleep(0.04)


def _build_prompt(ticker: str, price: float, change_pct: float, sector: str) -> str:
    direction = "up" if change_pct >= 0 else "down"
    return (
        f"Ticker: {ticker}\n"
        f"Sector: {sector}\n"
        f"Price: ${price:.2f}\n"
        f"Today: {direction} {abs(change_pct):.2f}%\n\n"
        "Give your insight now."
    )


async def _gemini_insight(
    ticker: str, price: float, change_pct: float, sector: str
) -> AsyncGenerator[str, None]:
    """Stream a written insight from Google Gemini. Falls back to the rule-based
    note on any error, so the stream always completes with something useful."""
    url = f"{GEMINI_BASE}/{GEMINI_MODEL}:streamGenerateContent?alt=sse&key={GEMINI_API_KEY}"
    body = {
        "contents": [
            {"role": "user", "parts": [{"text": _build_prompt(ticker, price, change_pct, sector)}]}
        ],
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        # thinkingBudget 0 keeps 2.5-flash snappy and spends tokens on the answer.
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": 200,
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    try:
        timeout = httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", url, json=body) as response:
                if response.status_code != 200:
                    async for w in _fallback_insight(ticker, price, change_pct, sector):
                        yield w
                    return
                async for line in response.aiter_lines():
                    line = line.strip()
                    if not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if not payload or payload == "[DONE]":
                        continue
                    try:
                        obj = json.loads(payload)
                    except json.JSONDecodeError:
                        continue
                    for cand in obj.get("candidates", []):
                        for part in cand.get("content", {}).get("parts", []):
                            chunk = part.get("text", "")
                            if chunk:
                                yield chunk
    except Exception:
        async for w in _fallback_insight(ticker, price, change_pct, sector):
            yield w


async def analyze_stock(
    ticker: str,
    price: float,
    change_pct: float,
    sector: str,
) -> AsyncGenerator[str, None]:
    """
    Async generator yielding text chunks from the active AI provider.

    Prefers Gemini (cloud) when GEMINI_API_KEY is set, else streams from a local
    Ollama model, else a rule-based note. Never raises — the HTTP stream always
    completes cleanly.
    """
    # Cloud path: use Gemini when configured (no local Ollama in the cloud).
    if GEMINI_API_KEY:
        async for chunk in _gemini_insight(ticker, price, change_pct, sector):
            yield chunk
        return

    payload = {
        "model": OLLAMA_MODEL,
        "prompt": _build_prompt(ticker, price, change_pct, sector),
        "system": SYSTEM_PROMPT,
        "stream": True,
        "options": {
            # Keep it snappy and short on CPU-only hardware.
            "temperature": 0.4,
            "num_predict": 160,
        },
    }

    url = f"{OLLAMA_HOST}/api/generate"

    try:
        timeout = httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", url, json=payload) as response:
                if response.status_code != 200:
                    # Model missing or server error -> use the offline note.
                    async for w in _fallback_insight(
                        ticker, price, change_pct, sector
                    ):
                        yield w
                    return

                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        obj = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    chunk = obj.get("response", "")
                    if chunk:
                        yield chunk
                    if obj.get("done"):
                        break
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout):
        # Ollama not running / not reachable -> stream the offline analyst note.
        async for w in _fallback_insight(ticker, price, change_pct, sector):
            yield w
    except Exception as exc:  # noqa: BLE001 - surface any failure to the client
        yield f"[AI analysis failed: {exc}]"
