import type { MarketPrice } from '../api/types';
import { legSpread, type CurveRow } from '../domain/curve';
import { int, num, shortDate, signed, tone, widthTone } from '../format';
import { useElementWidth } from '../hooks';

const HEIGHT = 470;
const LEFT = 104;
const RIGHT = 36;
const TOP = 40;
const BOTTOM = 300;
const BARS_BASE = 412;
const BARS_HEIGHT = 55;
const MIN_WIDTH = 980;

interface Props {
  rows: CurveRow[];
  spot?: MarketPrice;
  /** Legs of the selected calendar spread */
  near: CurveRow;
  far: CurveRow;
}

/**
 * The futures curve by the days to expiration: live mid with the bid-ask range, previous settlement, spot,
 * the spread of the adjacent months, volume, open interest and the width of the quotes.
 */
export function CurveChart({ rows, spot, near, far }: Props) {
  const [ref, measured] = useElementWidth<HTMLDivElement>();
  const width = Math.max(measured, MIN_WIDTH);

  const values = rows.flatMap((r) => [r.price.bid, r.price.ask, r.price.close]).concat(spot?.last ?? null, spot?.close ?? null)
    .filter((v): v is number => v != null);
  const lo = Math.floor(Math.min(...values) - 0.3);
  const hi = Math.ceil(Math.max(...values) + 0.3);
  const maxDte = Math.max(...rows.map((r) => r.dte)) * 1.04;
  const x = (dte: number) => LEFT + (dte / maxDte) * (width - LEFT - RIGHT);
  const y = (price: number) => BOTTOM - ((price - lo) / (hi - lo)) * (BOTTOM - TOP);
  const yTicks = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

  const points = rows.filter((r) => r.mid != null).map((r) => ({ row: r, px: x(r.dte), py: y(r.mid!) }));
  const line = (pick: (r: CurveRow) => number | null) =>
    rows.filter((r) => pick(r) != null).map((r) => `${x(r.dte).toFixed(1)},${y(pick(r)!).toFixed(1)}`).join(' ');
  const maxVolume = Math.max(1, ...rows.map((r) => r.price.volume ?? 0));
  const maxOpenInterest = Math.max(1, ...rows.map((r) => r.price.open_interest ?? 0));
  const spotChange = spot?.last != null && spot.close != null ? spot.last - spot.close : null;
  const selected = [near, far].filter((r) => r.mid != null);

  return (
    <div className="chart-block">
      <div className="chart-head">
        <h2>Határidős görbe</h2>
        <div className="legend">
          <span><i className="swatch live-line" />Élő mid, bid–ask sávval</span>
          <span><i className="swatch prev-line" />Előző elszámolóár</span>
          <span><i className="swatch spot-dot" />VIX spot</span>
          <span><i className="swatch vol-bar" />Forgalom</span>
          <span><i className="swatch oi-bar" />Nyitott kötésállomány</span>
          <span><i className="swatch sel-line" />Kiválasztott spread</span>
        </div>
      </div>
      <div className="chart-scroll" ref={ref}>
        <svg width={width} height={HEIGHT} role="img"
             aria-label="VIX határidős görbe a lejáratig hátralévő napok függvényében: élő mid árak bid–ask sávval, előző elszámolóárak, a szomszédos lejáratok spreadje, forgalom és nyitott kötésállomány">
          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={LEFT} x2={width - RIGHT} y1={y(tick)} y2={y(tick)} className="grid" />
              <text x={LEFT - 8} y={y(tick) + 4} textAnchor="end" className="axis num">{tick}</text>
            </g>
          ))}
          <line x1={LEFT} x2={width - RIGHT} y1={BARS_BASE} y2={BARS_BASE} className="grid" />
          <text x={0} y={BOTTOM + 20} className="axis">Lejárat</text>
          <text x={0} y={BARS_BASE - 22} className="axis">Forgalom · OI</text>
          <text x={0} y={BARS_BASE + 34} className="axis">Szélesség</text>

          {points.map(({ row, px, py }) => {
            const volume = Math.max(1.5, ((row.price.volume ?? 0) / maxVolume) * BARS_HEIGHT);
            const openInterest = Math.max(1.5, ((row.price.open_interest ?? 0) / maxOpenInterest) * BARS_HEIGHT);
            return (
              <g key={row.conid}>
                <line x1={px} x2={px} y1={py + 6} y2={BOTTOM} className="guide" />
                <rect x={px - 10} y={BARS_BASE - volume} width={9} height={volume} className="vol-bar" />
                <rect x={px + 1} y={BARS_BASE - openInterest} width={9} height={openInterest} className="oi-bar" />
                <text x={px} y={BOTTOM + 20} textAnchor="middle" className="label">{shortDate(row.expiry)}</text>
                <text x={px} y={BOTTOM + 35} textAnchor="middle" className="axis num">{row.dte} nap</text>
                <text x={px} y={BARS_BASE + 16} textAnchor="middle" className="label num">
                  {int(row.price.volume)} <tspan className="axis">· {int(row.price.open_interest)}</tspan>
                </text>
                <text x={px} y={BARS_BASE + 34} textAnchor="middle" className={`label num w-${widthTone(row.widthTicks)}`}>
                  {row.widthTicks} tick <tspan className="axis">{row.price.bid_size}×{row.price.ask_size}</tspan>
                </text>
              </g>
            );
          })}

          {/* spread of the adjacent months under each segment */}
          {points.slice(1).map(({ row, px, py }, i) => {
            const previous = points[i];
            const spread = legSpread(previous.row, row);
            const sx = (previous.px + px) / 2 + 22;
            const sy = (previous.py + py) / 2 + 30;
            return (
              <g key={row.conid} className="seg">
                <text x={sx} y={sy} className="label num">
                  <tspan className="strong">{signed(spread.mid, 3)}</tspan> <tspan className="axis">{signed(spread.contangoPct)}%</tspan>
                </text>
                <text x={sx} y={sy + 14} className="label num">
                  <tspan className="ask">{num(spread.buy)}</tspan><tspan className="axis"> / </tspan><tspan className="bid">{num(spread.sell)}</tspan>
                </text>
              </g>
            );
          })}

          {spot?.last != null && points[0] && (
            <line x1={LEFT} y1={y(spot.last)} x2={points[0].px} y2={points[0].py} className="spot-link" />
          )}
          <polyline points={line((r) => r.price.close)} className="prev-line" />
          <polyline points={line((r) => r.mid)} className="live-line" />

          {points.map(({ row, px, py }, i) => {
            const bid = y(row.price.bid!);
            const ask = y(row.price.ask!);
            const first = i === 0;
            return (
              <g key={row.conid}>
                <path d={`M${px},${bid}V${ask}M${px - 5},${bid}h10M${px - 5},${ask}h10`} className="whisker" />
                <circle cx={px} cy={py} r={4} className="dot" />
                <g textAnchor={first ? 'start' : 'end'} transform={`translate(${px + (first ? 12 : 10)},${first ? py + 20 : py - 40})`}>
                  <text className="label num"><tspan className="strong">{row.code}</tspan> <tspan className="axis">{row.label}</tspan></text>
                  <text y={14} className="label num">
                    {num(row.mid, 3)} <tspan className={tone(row.change)}>{signed(row.change, 3)}</tspan>
                  </text>
                  <text y={28} className="axis num">{num(row.price.bid)} / {num(row.price.ask)}</text>
                </g>
              </g>
            );
          })}

          {spot?.close != null && <circle cx={LEFT} cy={y(spot.close)} r={4} className="spot-prev" />}
          {spot?.last != null && (
            <g>
              <circle cx={LEFT} cy={y(spot.last)} r={4.5} className="spot-dot" />
              <text x={0} y={y(spot.last) - 2} className="label num">spot <tspan className="strong">{num(spot.last)}</tspan></text>
              <text x={0} y={y(spot.last) + 12} className={`label num ${tone(spotChange)}`}>{signed(spotChange)}</text>
            </g>
          )}

          {selected.length === 2 && (
            <g>
              <line x1={x(near.dte)} y1={y(near.mid!)} x2={x(far.dte)} y2={y(far.mid!)} className="sel-line" />
              {selected.map((r) => <circle key={r.conid} cx={x(r.dte)} cy={y(r.mid!)} r={9} className="sel-ring" />)}
            </g>
          )}
        </svg>
      </div>
      <p className="hint">
        Pontok mellett: kontraktus, mid és változás az elszámolóárhoz, alatta bid / ask. Szakaszok alatt: a szomszédos
        lejáratok mid spreadje és contangója, alatta <span className="ask">vehető</span> / <span className="bid">eladható</span> ár.
      </p>
    </div>
  );
}
