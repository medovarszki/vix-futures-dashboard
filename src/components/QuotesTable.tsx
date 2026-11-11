import type { MarketPrice } from '../api/types';
import { legSpread, type CurveRow } from '../domain/curve';
import { int, longDate, num, signed, time, tone, widthTone } from '../format';

/** Quotes and liquidity of every expiration */
export function QuotesTable({ rows, spot }: { rows: CurveRow[]; spot?: MarketPrice }) {
  const maxSize = Math.max(1, ...rows.flatMap((r) => [r.price.bid_size ?? 0, r.price.ask_size ?? 0]));
  const maxVolume = Math.max(1, ...rows.map((r) => r.price.volume ?? 0));
  const maxOpenInterest = Math.max(1, ...rows.map((r) => r.price.open_interest ?? 0));
  const spotChange = spot?.last != null && spot.close != null ? spot.last - spot.close : null;

  return (
    <div>
      <div className="scroll">
        <table className="quotes">
          <thead>
            <tr>
              <th className="l">Kontraktus</th><th className="l">Lejárat</th><th>Nap</th><th>Bid méret</th><th>Bid</th>
              <th>Ask</th><th className="l">Ask méret</th><th>Szélesség</th><th>Mid</th><th>Last · idő</th>
              <th>Elsz. ár</th><th>Vált.</th><th>Forgalom</th><th>Nyitott köt.</th><th>Spread az előzőhöz</th><th>Contango</th>
            </tr>
          </thead>
          <tbody>
            <tr className="spot-row">
              <td className="l text strong">VIX spot</td><td className="l">index</td><td>0</td><td>–</td><td>–</td><td>–</td>
              <td className="l">–</td><td>–</td><td>–</td>
              <td className="num"><span className="text">{num(spot?.last)}</span> {time(spot?.last_time ?? null)}</td>
              <td className="num">{num(spot?.close)}</td>
              <td className={`num ${tone(spotChange)}`}>{signed(spotChange)}</td>
              <td>–</td><td>–</td><td>–</td><td>–</td>
            </tr>
            {rows.map((row, i) => {
              const previous = i > 0 ? rows[i - 1] : undefined;
              const spread = previous ? legSpread(previous, row) : undefined;
              const base = previous ? previous.mid : spot?.last;
              const contango = row.mid != null && base ? (row.mid / base - 1) * 100 : null;
              return (
                <tr key={row.conid}>
                  <td className="l num"><span className="muted m">{row.label}</span><span className="strong">{row.code}</span></td>
                  <td className="l">{longDate(row.expiry)}</td>
                  <td className="num">{row.dte}</td>
                  <td className="num"><span className="size">{int(row.price.bid_size)}<i className="bar bid-bar" style={{ width: bar(row.price.bid_size, maxSize, 44) }} /></span></td>
                  <td className="num bid strong">{num(row.price.bid)}</td>
                  <td className="num ask strong">{num(row.price.ask)}</td>
                  <td className="l num"><span className="size"><i className="bar ask-bar" style={{ width: bar(row.price.ask_size, maxSize, 44) }} />{int(row.price.ask_size)}</span></td>
                  <td className="num"><span className={`chip w-${widthTone(row.widthTicks)}`}>{row.widthTicks ?? '–'} tick</span></td>
                  <td className="num">{num(row.mid, 3)}</td>
                  <td className="num">{num(row.price.last)} <span className="muted">{time(row.price.last_time)}</span></td>
                  <td className="num muted">{num(row.price.close)}</td>
                  <td className={`num ${tone(row.change)}`}>{signed(row.change, 3)}</td>
                  <td className="num"><span className="stack">{int(row.price.volume)}<i className="bar thin" style={{ width: bar(row.price.volume, maxVolume, 80) }} /></span></td>
                  <td className="num"><span className="stack">{int(row.price.open_interest)}<i className="bar thin" style={{ width: bar(row.price.open_interest, maxOpenInterest, 80) }} /></span></td>
                  <td className="num">{spread ? <>{num(spread.buy)} <span className="muted">/</span> {num(spread.sell)}</> : '–'}</td>
                  <td className="num">{signed(contango)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint pad-x">
        <span><span className="text">Szélesség</span>: ask − bid tickben; 1 tick zöld, 2–3 sárga, 4+ piros.</span>{' '}
        <span><span className="text">Spread az előzőhöz</span>: vehető (ask − előző bid) / eladható (bid − előző ask).</span>{' '}
        <span><span className="text">Contango</span>: mid az előző lejárat midjéhez (M1-nél a spothoz) képest.</span>
      </p>
    </div>
  );
}

function bar(value: number | null, max: number, pixels: number): number {
  return Math.max(2, ((value ?? 0) / max) * pixels);
}
