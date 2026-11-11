import { api } from '../api';
import { leggingCost, legSpread, POINT_VALUE, type CurveRow } from '../domain/curve';
import { num, shortDate, signed, tone } from '../format';
import { usePolling } from '../hooks';

interface Props {
  rows: CurveRow[];
  near: CurveRow;
  far: CurveRow;
  onNear: (index: number) => void;
  onFar: (index: number) => void;
}

/**
 * Two expirations picked by the user: the price of the calendar as one order on the exchange listed spread book,
 * next to the price of trading the two legs separately.
 */
export function SpreadCalculator({ rows, near, far, onNear, onFar }: Props) {
  const [quote, quoteError] = usePolling(() => api.getSpread(near.conid, far.conid), 1000, [near.conid, far.conid]);
  // the quote carries the legs of the same moment as the listed spread, the curve may be a tick older
  const fromCurve = legSpread(near, far);
  const legs = quote ? { ...fromCurve, buy: quote.synthetic.ask, sell: quote.synthetic.bid, mid: quote.synthetic.mid } : fromCurve;
  const nearPrice = quote?.near ?? near.price;
  const farPrice = quote?.far ?? far.price;
  const native = quote?.native;
  const cost = native ? leggingCost(legs, native) : undefined;
  const usd = (points: number | null | undefined) => (points == null ? '–' : `${Math.round(points * POINT_VALUE)} USD / spread`);

  return (
    <section className="card pad calc">
      <div className="card-head">
        <h2>Spread kalkulátor</h2>
        <span className="muted">válassz két lejáratot: mennyibe kerül a calendar egyben, és mennyibe, ha a két lábat külön kötöd</span>
      </div>
      <div className="leg-pickers">
        <LegPicker title="Közeli láb" rows={rows.slice(0, -1)} selected={near} onPick={onNear} />
        <LegPicker title="Távoli láb" rows={rows.slice(1)} selected={far} onPick={onFar} />
      </div>
      <div className="calc-title">
        <span className="num pair">{far.code} − {near.code}</span>
        <span className="muted">{far.label} − {near.label} · {legs.days} nap a két lejárat között</span>
        <span className="num muted">
          mid <span className="text">{num(legs.mid, 3)}</span> · előző elsz. ár alapján {num(legs.prev)} ·{' '}
          <span className={tone(legs.change)}>{signed(legs.change, 3)}</span>
        </span>
      </div>
      <div className="calc-grid">
        <div className="box">
          <div>
            <div className="box-title">Calendar egyben</div>
            <div className="muted small">
              tőzsdei spread könyv (CFE), egy megbízás
              {native?.bid_size != null && ` · méret ${native.bid_size} × ${native.ask_size}`}
            </div>
          </div>
          {native?.stream_error && <div className="down small">Nincs jegyzés: {native.stream_error}</div>}
          {quoteError && <div className="down small">A spread jegyzése nem érhető el: {quoteError}</div>}
          <div className="two">
            <Price title="Megveszem" value={num(native?.ask)} className="ask" note="a spread ask ára" />
            <Price title="Eladom" value={num(native?.bid)} className="bid" note="a spread bid ára" />
          </div>
        </div>
        <div className="box">
          <div>
            <div className="box-title">Lábanként kötve</div>
            <div className="muted small">két külön megbízás az egyes lejáratok bid / ask árán</div>
          </div>
          <div className="two">
            <Price title="Megveszem" value={num(legs.buy)} className="ask"
                   note={<>{far.code} vétel {num(farPrice.ask)}<br />{near.code} eladás {num(nearPrice.bid)}</>} />
            <Price title="Eladom" value={num(legs.sell)} className="bid"
                   note={<>{far.code} eladás {num(farPrice.bid)}<br />{near.code} vétel {num(nearPrice.ask)}</>} />
          </div>
        </div>
        <div className="box">
          <div>
            <div className="box-title">Különbség</div>
            <div className="muted small">ennyivel drágább lábanként kötni, 1 spreadre (1 pt = 1 000 USD)</div>
          </div>
          <div className="two">
            <Price title="Vételnél" value={`${signed(cost?.buy, 3)} pt`} note={usd(cost?.buy)} />
            <Price title="Eladásnál" value={`${signed(cost?.sell, 3)} pt`} note={usd(cost?.sell)} />
          </div>
        </div>
      </div>
    </section>
  );
}

function LegPicker({ title, rows, selected, onPick }: {
  title: string; rows: CurveRow[]; selected: CurveRow; onPick: (index: number) => void;
}) {
  return (
    <div className="leg-picker">
      <div className="th">{title}</div>
      <div className="leg-buttons">
        {rows.map((row) => (
          <button key={row.conid} type="button" className="leg-button" aria-pressed={row.conid === selected.conid}
                  onClick={() => onPick(row.index)}>
            <span className="num strong">{row.code}</span>
            <span className="small">{shortDate(row.expiry)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Price({ title, value, note, className = '' }: {
  title: string; value: string; note: React.ReactNode; className?: string;
}) {
  return (
    <div>
      <div className="th">{title}</div>
      <div className={`num big ${className}`}>{value}</div>
      <div className="num muted small">{note}</div>
    </div>
  );
}
