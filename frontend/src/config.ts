// Backend connection config.
// In development this defaults to the local FastAPI server (http://localhost:8000).
// In production (Vercel) set VITE_API_URL to the deployed backend URL,
// e.g. https://hamza2210-orion.hf.space — both REST and WebSocket derive from it.
const ENV = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const RAW = (ENV.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');

export const API_BASE = RAW;
export const WS_BASE = RAW.replace(/^http/, 'ws'); // http->ws, https->wss
