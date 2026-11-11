import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { CurveSnapshot, MarketPrice } from '../api/types';
import type { CurveRow } from '../domain/curve';
import { num, signed } from '../format';
import { useElementWidth } from '../hooks';

interface Series {
  id: string;
  label: string;
  date: string;
  /** spot, M1, M2, ... */
  values: (number | null)[];
  live?: boolean;
}

const contango = (values: (number | null)[]) =>
  values[1] && values[2] ? (values[2] / values[1] - 1) * 100 : null;

/** Historical settlement curves compared to the live curve, and the M1-M2 contango over time */
export function HistoryTab({ rows, spot }: { rows: CurveRow[]; spot?: MarketPrice }) {
  const [history, setHistory] = useState<CurveSnapshot[]>([]);
  const [pick, setPick] = useState<number>();
  const [visible, setVisible] = useState<Record<string, boolean>>({ live: true, prev: true, month: true, pick: true });
  const [ref, measured] = useElementWidth<HTMLDivElement>();
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | string>('loading');

  useEffect(() => {
    api.getCurveHistory().then((result) => {
      setHistory(result);
      setPick(Math.max(0, result.length - 41));
      setState(result.length > 1 ? 'ready' : 'empty');
    }, (e) => setState(e instanceof Error ? e.message : String(e)));
  }, []);

  const series = useMemo<Series[]>(() => {
    if (!history.length) {
      return [];
    }
    const snapshot = (id: string, label: string, back: number): Series[] => {
      const s = history[history.length - 1 - back];
      return s ? [{ id, label, date: s.date, values: [s.spot, ...s.settlements] }] : [];
    };
    const picked = pick != null ? history[pick] : undefined;
    return [
      { id: 'live', label: 'Élő', date: 'most', values: [spot?.last ?? null, ...rows.map((r) => r.mid)], live: true },
      ...snapshot('prev', 'Előző záró', 0),
      ...snapshot('week', '1 hete', 5),
      ...snapshot('month', '1 hónapja', 21),
      ...snapshot('quarter', '3 hónapja', 63),
      ...(picked ? [{ id: 'pick', label: 'Választott nap', date: picked.date, values: [picked.spot, ...picked.settlements] }] : []),
    ];
  }, [history, pick, rows, spot]);

  if (state === 'loading') {
    return <div className="state">Történeti adatok betöltése… (lejáratonként egy lekérdezés, ez eltarthat egy ideig)</div>;
  }
  if (state === 'empty') {
    return <div className="state">Nincs történeti adat.</div>;
  }
  if (state !== 'ready' || pick == null) {
    return <div className="state down">A történeti adatok nem érhetők el: {state}</div>;
  }

  const shown = series.filter((s) => visible[s.id]);
  const liveValues = series[0].values;
  const width = Math.max(measured, 760);
  const count = liveValues.length;

  // curves by position on the curve
  const all = shown.flatMap((s) => s.values).filter((v): v is number => v != null);
  const lo = Math.floor(Math.min(...all, 100) - 0.5);
  const hi = Math.ceil(Math.max(...all, 0) + 0.5);
  const cx = (k: number) => 56 + (k / (count - 1)) * (width - 56 - 30);
  const cy = (v: number) => 290 - ((v - lo) / (hi - lo)) * 270;
  const step = hi - lo > 10 ? 2 : 1;
  const ticks = Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step);

  // contango time line
  const line = history.map((s) => contango([s.spot, ...s.settlements]) ?? 0);
  const tLo = Math.floor(Math.min(...line, 0) - 1);
  const tHi = Math.ceil(Math.max(...line, 0) + 1);
  const tx = (i: number) => 56 + (i / (history.length - 1)) * (width - 56 - 30);
  const ty = (v: number) => 150 - ((v - tLo) / (tHi - tLo)) * 130;
  const picked = history[pick];

  return (
    <div className="history">
      <div className="block">
        <div className="card-head">
          <h2>Görbék összehasonlítása</h2>
          <span className="muted">napi elszámolóárak, az élő görbe mid árakból</span>
        </div>
        <div className="chips">
          {series.map((s) => (
            <button key={s.id} type="button" className={`chip-button s-${s.id}`} aria-pressed={!!visible[s.id]}
                    onClick={() => setVisible((v) => ({ ...v, [s.id]: !v[s.id] }))}>
              <i className="swatch" /><span className="strong">{s.label}</span><span className="num small">{s.date}</span>
            </button>
          ))}
        </div>
        <div className="chart-scroll" ref={ref}>
          <svg width={width} height={320} role="img"
               aria-label="A kiválasztott napok VIX határidős görbéi egymásra rajzolva, a spot indextől az utolsó lejáratig">
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={56} x2={width - 30} y1={cy(tick)} y2={cy(tick)} className="grid" />
                <text x={48} y={cy(tick) + 4} textAnchor="end" className="axis num">{tick}</text>
              </g>
            ))}
            {liveValues.map((_, k) => (
              <text key={k} x={cx(k)} y={310} textAnchor="middle" className="axis num">{k === 0 ? 'spot' : `M${k}`}</text>
            ))}
            {[...shown].reverse().map((s) => (
              <polyline key={s.id} className={`curve s-${s.id}`}
                        points={s.values.flatMap((v, k) => (v == null ? [] : [`${cx(k).toFixed(1)},${cy(v).toFixed(1)}`])).join(' ')} />
            ))}
          </svg>
        </div>
      </div>

      <div className="block">
        <div className="card-head">
          <h2>Idővonal: M1–M2 contango</h2>
          <span className="muted">napi záró · a csúszka a „Választott nap” görbét állítja</span>
        </div>
        <div className="chart-scroll">
          <svg width={width} height={180} role="img"
               aria-label="Az M1–M2 contango százalékos alakulása az elmúlt hónapokban, a kiválasztott nap jelölésével">
            {[tHi, 0, tLo].map((v) => (
              <g key={v}>
                <line x1={56} x2={width - 30} y1={ty(v)} y2={ty(v)} className={v === 0 ? 'zero' : 'grid'} />
                <text x={48} y={ty(v) + 4} textAnchor="end" className="axis num">{signed(v, 0)}%</text>
              </g>
            ))}
            <text x={56} y={172} className="axis num">{history[0].date}</text>
            <text x={width - 30} y={172} textAnchor="end" className="axis num">{history[history.length - 1].date}</text>
            <text x={(width + 26) / 2} y={172} textAnchor="middle" className="axis">backwardation a 0% vonal alatt</text>
            <polyline className="live-line thin" points={line.map((v, i) => `${tx(i).toFixed(1)},${ty(v).toFixed(1)}`).join(' ')} />
            <line x1={tx(pick)} x2={tx(pick)} y1={14} y2={150} className="pick-line" />
            <circle cx={tx(pick)} cy={ty(line[pick])} r={4.5} className="spot-dot" />
          </svg>
        </div>
        <div className="slider">
          <label htmlFor="daypick" className="muted">Választott nap</label>
          <input id="daypick" type="range" min={0} max={history.length - 1} step={1} value={pick}
                 onChange={(e) => setPick(Number(e.target.value))} />
          <span className="num">{picked.date} · spot {num(picked.spot)} · {signed(line[pick])}%</span>
        </div>
      </div>

      <div className="scroll">
        <table className="quotes history-table">
          <thead>
            <tr>
              <th className="l">Görbe</th><th className="l">Dátum</th><th>Spot</th>
              {rows.map((r) => <th key={r.conid}>{r.label}</th>)}
              <th>M2−M1</th><th>Contango</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => {
              const spread = s.values[1] != null && s.values[2] != null ? s.values[2] - s.values[1] : null;
              const liveSpread = liveValues[1] != null && liveValues[2] != null ? liveValues[2] - liveValues[1] : null;
              const c = contango(s.values);
              const liveContango = contango(liveValues);
              return [
                <tr key={s.id} className={s.live ? '' : 'no-border'}>
                  <td className={`l strong s-${s.id}`}><i className="swatch" />{s.label}</td>
                  <td className="l num muted">{s.date}</td>
                  {liveValues.map((_, k) => <td key={k} className="num">{num(s.values[k])}</td>)}
                  <td className="num">{num(spread)}</td>
                  <td className="num">{signed(c)}%</td>
                </tr>,
                !s.live && (
                  <tr key={`${s.id}-diff`} className="diff">
                    <td className="l" colSpan={2}>élő − ez a nap</td>
                    {liveValues.map((liveValue, k) => (
                      <td key={k} className="num">{signed(s.values[k] != null && liveValue != null ? liveValue - s.values[k]! : null)}</td>
                    ))}
                    <td className="num">{signed(spread != null && liveSpread != null ? liveSpread - spread : null)}</td>
                    <td className="num">{signed(c != null && liveContango != null ? liveContango - c : null)} %p</td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
