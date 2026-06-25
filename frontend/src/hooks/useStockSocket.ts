import { useEffect, useRef, useState } from 'react';
import type { Stock } from '../types/stock';
import { WS_BASE } from '../config';

const WS_URL = `${WS_BASE}/ws/stocks`;
const RECONNECT_DELAY = 3000;

interface SocketState {
  stocks: Stock[];
  isConnected: boolean;
  lastUpdated: Date | null;
}

interface IncomingMessage {
  stocks: Stock[];
}

/**
 * Manages the WebSocket connection to the backend stock broadcaster.
 * Auto-reconnects every 3s if the socket drops.
 */
export function useStockSocket(): SocketState {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const closedByUser = useRef(false);

  useEffect(() => {
    closedByUser.current = false;

    const connect = (): void => {
      const ws = new WebSocket(WS_URL);
      socketRef.current = ws;

      ws.onopen = (): void => {
        setIsConnected(true);
      };

      ws.onmessage = (event: MessageEvent<string>): void => {
        try {
          const data = JSON.parse(event.data) as IncomingMessage;
          if (Array.isArray(data.stocks)) {
            setStocks(data.stocks);
            setLastUpdated(new Date());
          }
        } catch {
          // Ignore malformed frames; the next broadcast will refresh state.
        }
      };

      ws.onclose = (): void => {
        setIsConnected(false);
        if (!closedByUser.current) {
          reconnectRef.current = window.setTimeout(connect, RECONNECT_DELAY);
        }
      };

      ws.onerror = (): void => {
        // Force a close so onclose schedules a reconnect.
        ws.close();
      };
    };

    connect();

    return (): void => {
      closedByUser.current = true;
      if (reconnectRef.current !== null) {
        window.clearTimeout(reconnectRef.current);
      }
      socketRef.current?.close();
    };
  }, []);

  return { stocks, isConnected, lastUpdated };
}
