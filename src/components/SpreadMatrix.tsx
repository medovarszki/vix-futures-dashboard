import { useEffect, useState } from 'react';
import { api } from '../api';
import type { SpreadTick } from '../api/types';
import { legSpread, type CurveRow } from '../domain/curve';
import { num, shortDate, signed, tone } from '../format';

type Mode = 'exec' | 'mid' | 'last';
const MODES: [Mode, string, string][] = [
  ['exec', 'Végrehajtható', 'Felső szám: ennyiért vehető meg a spread most (távoli láb az askon, közeli a biden). Alsó szám: ennyiért adható el.'],
  ['mid', 'Mid', 'Felső szám: a két láb midjének különbsége. Alsó szám: változás az előző elszámolóárakból számolt spreadhez képest.'],
  ['last', 'Last', 'Felső szám: az utolsó kötések különbsége. Alsó szám: eltérés a midtől – a last régi lehet, ezért csak tájékoztató.'],
];

interface Props {
  rows: CurveRow[];
  near: CurveRow;
  far: CurveRow;
  onSelect: (near: number, far: number) => void;
}

/** Every pair of expirations: far leg minus near leg, computed from the quotes of the legs */
export function SpreadMatrix({ rows, near, far, onSelect }: Props) {
  const [mode, setMode] = useState<Mode>('exec');
  const selected = legSpread(near, far);

  return (
    <div className="spreads">
      <div className="matrix-side">
        <div className="card-head">
          <h2>Spread mátrix</h2>
          <span className="muted">távoli láb − közeli láb, pontban</span>
          <div className="grow" />
          <div className="segmented">
            {MODES.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}>{label}</button>
            ))}
          </div>
        </div>
        <p className="hint">{MODES.find(([id]) => id === mode)![2]}</p>
        <div className="scroll">
          <div className="matrix" style={{ gridTemplateColumns: `92px repeat(${rows.length - 1}, minmax(84px, 1fr))` }}>
            <div className="th corner">Közeli ↓ / távoli →</div>
            {rows.slice(1).map((row) => (
              <div key={row.conid} className="col-head">
                <div className="num text">{row.code}</div>
                <div className="muted small">{row.label} · {row.dte} nap</div>
              </div>
            ))}
            {rows.slice(0, -1).map((a) => [
              <div key={a.conid} className="row-head">
                <span className="num strong">{a.code}</span>
                <span className="muted small">{a.label} · {a.dte} nap</span>
              </div>,
              ...rows.slice(1).map((b) => {
                if (b.index <= a.index) {
                  return <div key={b.conid} />;
                }
                const s = legSpread(a, b);
                const wide = s.width == null ? 'wide' : s.width <= 0.1001 ? 'tight' : s.width <= 0.2501 ? 'medium' : 'wide';
                const isSelected = a.conid === near.conid && b.conid === far.conid;
                return (
                  <button key={b.conid} type="button" className={`cell num bg-${wide}`} aria-pressed={isSelected}
                          aria-label={`${b.code} mínusz ${a.code} spread kiválasztása`} onClick={() => onSelect(a.index, b.index)}>
                    {mode === 'exec' && <><span className="ask strong">{num(s.buy)}</span><span className="bid">{num(s.sell)}</span></>}
                    {mode === 'mid' && <><span className="strong">{num(s.mid, 3)}</span><span className={tone(s.change)}>{signed(s.change, 3)}</span></>}
                    {mode === 'last' && <><span className="strong">{num(s.last)}</span><span className="muted">{signed(s.last != null && s.mid != null ? s.last - s.mid : null, 3)}</span></>}
                  </button>
                );
              }),
            ])}
          </div>
        </div>
        <p className="hint">
          A cella színe a spread szélességét jelzi (vehető − eladható): <span className="w-tight">≤ 0.10</span> ·{' '}
          <span className="w-medium">≤ 0.25</span> · <span className="w-wide">szélesebb</span>. Kattints egy cellára:
          a pár a spread kalkulátorba és a görbére is átkerül.
        </p>
      </div>

      <div className="detail-side">
        <div className="calc-title">
          <span className="num pair">{far.code} − {near.code}</span>
          <span className="muted">{far.label} − {near.label} · {selected.days} nap</span>
        </div>
        <div className="scroll"><table className="legs">
          <thead><tr><th className="l">Láb</th><th className="l">Kontr.</th><th className="l">Lejárat</th><th>Bid</th><th>Ask</th><th>Last</th></tr></thead>
          <tbody>
            {[['Közeli', near] as const, ['Távoli', far] as const].map(([role, row]) => (
              <tr key={role}>
                <td className="l muted">{role}</td>
                <td className="l num strong">{row.code}</td>
                <td className="l">{shortDate(row.expiry)} · {row.dte} nap</td>
                <td className="num bid">{num(row.price.bid)} <span className="muted small">×{row.price.bid_size}</span></td>
                <td className="num ask">{num(row.price.ask)} <span className="muted small">×{row.price.ask_size}</span></td>
                <td className="num">{num(row.price.last)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <dl className="kv num">
          <div><dt>Last alapján</dt><dd>{num(selected.last)}</dd></div>
          <div><dt>Előző elszámolóárak alapján</dt><dd>{num(selected.prev)}</dd></div>
          <div><dt>Változás (mid)</dt><dd className={tone(selected.change)}>{signed(selected.change, 3)}</dd></div>
          <div>
            <dt>Contango (mid)</dt>
            <dd>
              {signed(selected.contangoPct)}% · havi{' '}
              {signed(selected.contangoPct != null && selected.days ? (selected.contangoPct * 30) / selected.days : null)}%
            </dd>
          </div>
          <div><dt>Meredekség</dt><dd>{selected.mid != null && selected.days ? (selected.mid / selected.days).toFixed(4) : '–'} pt/nap</dd></div>
        </dl>
        <IntradaySpread near={near} far={far} prev={selected.prev} />
      </div>
    </div>
  );
}

function IntradaySpread({ near, far, prev }: { near: CurveRow; far: CurveRow; prev: number | null }) {
  const [ticks, setTicks] = useState<SpreadTick[]>([]);
  useEffect(() => {
    let active = true;
    setTicks([]);
    api.getSpreadIntraday(near.conid, far.conid).then((result) => active && setTicks(result), console.warn);
    return () => {
      active = false;
    };
  }, [near.conid, far.conid]);

  if (ticks.length < 2) {
    return null;
  }
  const values = ticks.map((t) => t.mid).concat(prev ?? []);
  const lo = Math.min(...values) - 0.05;
  const hi = Math.max(...values) + 0.05;
  const from = ticks[0].time;
  const to = ticks[ticks.length - 1].time;
  const x = (t: number) => 44 + ((t - from) / (to - from)) * 466;
  const y = (v: number) => 140 - ((v - lo) / (hi - lo)) * 120;
  const last = ticks[ticks.length - 1];

  return (
    <div>
      <div className="card-head">
        <div className="th">Napon belüli spread (mid)</div>
        <div className="grow" />
        <div className="legend">
          <span><i className="swatch live-line" />ma</span>
          <span><i className="swatch prev-line" />előző elsz. ár</span>
        </div>
      </div>
      <svg viewBox="0 0 520 170" className="intraday" role="img"
           aria-label="A kiválasztott spread napon belüli alakulása az előző elszámolóárból számolt szinthez képest">
        {[hi, (hi + lo) / 2, lo].map((v) => (
          <g key={v}>
            <line x1={44} x2={510} y1={y(v)} y2={y(v)} className="grid" />
            <text x={38} y={y(v) + 4} textAnchor="end" className="axis num">{v.toFixed(2)}</text>
          </g>
        ))}
        <text x={44} y={160} className="axis num">00:00</text>
        <text x={510} y={160} textAnchor="end" className="axis num">most</text>
        {prev != null && <line x1={44} x2={510} y1={y(prev)} y2={y(prev)} className="prev-line" />}
        <polyline points={ticks.map((t) => `${x(t.time).toFixed(1)},${y(t.mid).toFixed(1)}`).join(' ')} className="live-line thin" />
        <circle cx={x(last.time)} cy={y(last.mid)} r={4} className="dot" />
      </svg>
    </div>
  );
}
