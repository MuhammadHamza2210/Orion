import { useEffect, useState } from 'react';
import { useStockSocket } from './hooks/useStockSocket';
import Header from './components/Header';
import StockList from './components/StockList';
import StockDetail from './components/StockDetail';
import SectorBar from './components/SectorBar';

export default function App() {
  const { stocks, isConnected, lastUpdated } = useStockSocket();
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  // Auto-select the first stock once data arrives.
  useEffect(() => {
    if (!selectedTicker && stocks.length > 0) {
      setSelectedTicker(stocks[0].ticker);
    }
  }, [stocks, selectedTicker]);

  const selected =
    stocks.find((s) => s.ticker === selectedTicker) ?? null;

  return (
    <div className="flex h-full w-full flex-col bg-[#0a0b0e] text-white">
      <Header
        stocks={stocks}
        isConnected={isConnected}
        lastUpdated={lastUpdated}
        onSelect={setSelectedTicker}
      />

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[360px_1fr]">
        <div className="hidden min-h-0 lg:block">
          <StockList
            stocks={stocks}
            selected={selectedTicker}
            onSelect={setSelectedTicker}
          />
        </div>
        <StockDetail stock={selected} />
      </main>

      <SectorBar stocks={stocks} />
    </div>
  );
}
