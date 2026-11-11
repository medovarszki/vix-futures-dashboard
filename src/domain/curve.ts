import type { ContractDto, MarketPrice } from '../api/types';
import { daysUntil, parseCompactDate } from './expiry';

export const TICK = 0.05;
/** USD value of one index point of a VX future */
export const POINT_VALUE = 1000;

export interface CurveRow {
  index: number;
  /** M1, M2, ... */
  label: string;
  code: string;
  conid: number;
  expiry: Date;
  dte: number;
  price: MarketPrice;
  mid: number | null;
  /** ask - bid in ticks */
  widthTicks: number | null;
  /** mid - previous settlement */
  change: number | null;
}

export function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function buildCurve(chain: ContractDto[], prices: MarketPrice[], today: Date): CurveRow[] {
  const byConid = new Map(prices.map((price) => [price.conid, price]));
  return chain.flatMap((contract, index) => {
    const price = byConid.get(contract.conid);
    if (!price || !contract.last_trade_date) {
      return [];
    }
    const expiry = parseCompactDate(contract.last_trade_date);
    const mid = price.bid != null && price.ask != null ? round((price.bid + price.ask) / 2) : null;
    return [{
      index,
      label: `M${index + 1}`,
      code: contract.local_symbol ?? String(contract.conid),
      conid: contract.conid,
      expiry,
      dte: daysUntil(expiry, today),
      price,
      mid,
      widthTicks: price.bid != null && price.ask != null ? Math.round((price.ask - price.bid) / TICK) : null,
      change: mid != null && price.close != null ? round(mid - price.close) : null,
    }];
  });
}

export interface LegSpread {
  /** far ask - near bid: buying the spread leg by leg */
  buy: number | null;
  /** far bid - near ask: selling the spread leg by leg */
  sell: number | null;
  mid: number | null;
  last: number | null;
  /** spread of the previous settlement prices */
  prev: number | null;
  /** buy - sell */
  width: number | null;
  /** mid - prev */
  change: number | null;
  /** mid spread relative to the mid of the near leg, in percent */
  contangoPct: number | null;
  days: number;
}

const diff = (a: number | null, b: number | null) => (a == null || b == null ? null : round(a - b));

/** Calendar spread (far - near) computed from the quotes of the two legs */
export function legSpread(near: CurveRow, far: CurveRow): LegSpread {
  const buy = diff(far.price.ask, near.price.bid);
  const sell = diff(far.price.bid, near.price.ask);
  const mid = buy != null && sell != null ? round((buy + sell) / 2) : null;
  const prev = diff(far.price.close, near.price.close);
  return {
    buy,
    sell,
    mid,
    last: diff(far.price.last, near.price.last),
    prev,
    width: diff(buy, sell),
    change: diff(mid, prev),
    contangoPct: mid != null && near.mid ? round((mid / near.mid) * 100) : null,
    days: far.dte - near.dte,
  };
}

/** How much worse legging is than the exchange listed spread, in points (positive: the listed spread is better) */
export function leggingCost(leg: LegSpread, native: { bid: number | null; ask: number | null }) {
  return {
    buy: diff(leg.buy, native.ask),
    sell: diff(native.bid, leg.sell),
  };
}
