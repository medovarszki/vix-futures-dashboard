import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { ContractDto } from './api/types';
import { CurveChart } from './components/CurveChart';
import { Header } from './components/Header';
import { HistoryTab } from './components/HistoryTab';
import { QuotesTable } from './components/QuotesTable';
import { SpreadCalculator } from './components/SpreadCalculator';
import { SpreadMatrix } from './components/SpreadMatrix';
import { buildCurve } from './domain/curve';
import { usePolling } from './hooks';

const PRICE_INTERVAL_MS = 1000;

type Tab = 'quotes' | 'spreads' | 'history';
const TABS: [Tab, string][] = [
  ['quotes', 'Árjegyzés és likviditás'],
  ['spreads', 'Calendar spreadek'],
  ['history', 'Történeti görbe'],
];

export function App() {
  const [chain, setChain] = useState<ContractDto[]>();
  const [error, setError] = useState<string>();
  const [tab, setTab] = useState<Tab>('quotes');
  /** Legs of the selected calendar spread as positions on the curve */
  const [pair, setPair] = useState({ near: 0, far: 1 });

  useEffect(() => {
    api.getFuturesChain().then(setChain, (e) => setError(String(e)));
  }, []);

  const spotConid = chain?.[0]?.underlying_conid;
  const prices = usePolling(
    async () => (chain ? api.getPrices([...(spotConid ? [spotConid] : []), ...chain.map((c) => c.conid)]) : undefined),
    PRICE_INTERVAL_MS,
    [chain],
  );

  const rows = useMemo(() => (chain && prices ? buildCurve(chain, prices, new Date()) : []), [chain, prices]);
  const spot = prices?.find((price) => price.conid === spotConid);
  const near = rows[pair.near];
  const far = rows[pair.far];

  const selectNear = (index: number) => setPair((p) => ({ near: index, far: p.far > index ? p.far : index + 1 }));
  const selectFar = (index: number) => setPair((p) => ({ far: index, near: p.near < index ? p.near : index - 1 }));

  if (error) {
    return <div className="state">Nem sikerült betölteni a futures láncot: {error}</div>;
  }
  if (!rows.length || !near || !far) {
    return <div className="state">Betöltés…</div>;
  }

  return (
    <div className="app">
      <Header spot={spot} />
      <main>
        <section className="card pad">
          <CurveChart rows={rows} spot={spot} near={near} far={far} />
        </section>

        <SpreadCalculator rows={rows} near={near} far={far} onNear={selectNear} onFar={selectFar} />

        <section className="card">
          <div className="tabs" role="tablist">
            {TABS.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className="tab" onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
            <span className="tabs-note">tick = 0.05 pt = 50 USD/kontraktus</span>
          </div>
          {tab === 'quotes' && <QuotesTable rows={rows} spot={spot} />}
          {tab === 'spreads' && (
            <SpreadMatrix rows={rows} near={near} far={far} onSelect={(n, f) => setPair({ near: n, far: f })} />
          )}
          {tab === 'history' && <HistoryTab rows={rows} spot={spot} />}
        </section>
      </main>
    </div>
  );
}
