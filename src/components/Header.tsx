import { useEffect, useState } from 'react';
import type { MarketPrice } from '../api/types';
import { clock, num, signed, tone } from '../format';

export function Header({ spot, front, mock }: { spot?: MarketPrice; front: MarketPrice; mock: boolean }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const change = spot?.last != null && spot.close != null ? spot.last - spot.close : null;

  return (
    <header className="header">
      <div className="brand">VIX Futures</div>
      <div className="spot">
        <span className="th">VIX spot</span>
        <span className="num spot-value">{num(spot?.last)}</span>
        <span className={`num ${tone(change)}`}>{signed(change)}</span>
        <span className="num muted">előző záró {num(spot?.close)}</span>
      </div>
      <div className="grow" />
      <div className="pills">
        <span className="pill"><span className="num live">{front.market_data_type ?? '–'}</span></span>
        <span className="num muted">{clock(now)}</span>
        {mock ? <span className="pill mock">Mintaadat</span> : <span className="pill">IBKR</span>}
      </div>
    </header>
  );
}
