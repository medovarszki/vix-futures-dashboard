import { round } from '../domain/curve';
import { daysUntil, toCompactDate, upcomingVxExpiries, vxLocalSymbol } from '../domain/expiry';
import type {
  ContractDto, CurveSnapshot, MarketDataApi, MarketPrice, NativeSpread, SpreadQuote, SpreadTick, SyntheticSpread,
} from './types';

const VIX_CONID = 13455763;
const CONTRACTS = 8;
const TICK = 0.05;

/** Bid/ask width in ticks, sizes, volume and open interest by the position on the curve */
const LIQUIDITY = [
  { ticks: 1, bidSize: 142, askSize: 98, volume: 48210, openInterest: 96400 },
  { ticks: 1, bidSize: 210, askSize: 187, volume: 71530, openInterest: 138900 },
  { ticks: 1, bidSize: 95, askSize: 120, volume: 22870, openInterest: 71200 },
  { ticks: 2, bidSize: 44, askSize: 51, volume: 9640, openInterest: 38500 },
  { ticks: 2, bidSize: 31, askSize: 28, volume: 4120, openInterest: 24100 },
  { ticks: 3, bidSize: 18, askSize: 22, volume: 1930, openInterest: 12700 },
  { ticks: 4, bidSize: 9, askSize: 12, volume: 610, openInterest: 6300 },
  { ticks: 6, bidSize: 5, askSize: 7, volume: 180, openInterest: 2900 },
];

const SPOT_CLOSE = 16.9;
const LONG_RUN = 21.6;

/** Term structure: the future converges to the long run level with the time to expiration */
function curveLevel(spot: number, dte: number): number {
  return spot + (LONG_RUN - spot) * (1 - Math.exp(-(dte + 3) / 85));
}

const toTick = (value: number) => round(Math.round(value / TICK) * TICK, 2);

/**
 * Mock of the IBKR Facade with a random walk, so the UI behaves like with live data. Every value is made up.
 */
export class MockMarketDataApi implements MarketDataApi {

  private readonly today = new Date();
  private readonly chain: ContractDto[];
  private readonly dte: number[];
  private readonly settlements: number[];
  /** Offset of the spot and of each future from its previous close, in points */
  private spotDrift = -0.48;
  private readonly drift: number[];

  constructor() {
    const expiries = upcomingVxExpiries(this.today, CONTRACTS);
    this.chain = expiries.map(({ year, month, expiry }, index) => ({
      conid: 800000 + index,
      symbol: 'VIX',
      sec_type: 'FUT',
      exchange: 'CFE',
      currency: 'USD',
      local_symbol: vxLocalSymbol(year, month),
      trading_class: 'VX',
      multiplier: '1000',
      last_trade_date: toCompactDate(expiry),
      contract_month: toCompactDate(expiry).slice(0, 6),
      underlying_conid: VIX_CONID,
      min_tick: TICK,
    }));
    this.dte = expiries.map(({ expiry }) => daysUntil(expiry, this.today));
    this.settlements = this.dte.map((dte) => toTick(curveLevel(SPOT_CLOSE, dte)));
    // the front of the curve follows the spot more closely than the back
    this.drift = this.dte.map((dte) => this.spotDrift * Math.exp(-dte / 60) * 0.6);
  }

  async getFuturesChain(): Promise<ContractDto[]> {
    return this.chain;
  }

  async getPrices(conids: number[]): Promise<MarketPrice[]> {
    this.step();
    return conids.map((conid) => (conid === VIX_CONID ? this.spotPrice() : this.futurePrice(conid)));
  }

  async getSpread(nearConid: number, farConid: number): Promise<SpreadQuote> {
    const near = this.futurePrice(nearConid);
    const far = this.futurePrice(farConid);
    const synthetic = syntheticSpread(near, far);
    const distance = Math.abs(this.indexOf(farConid) - this.indexOf(nearConid));
    return { near_conid: nearConid, far_conid: farConid, near, far, synthetic, native: nativeSpread(synthetic, distance) };
  }

  async getCurveHistory(): Promise<CurveSnapshot[]> {
    const days = 126;
    const result: CurveSnapshot[] = [];
    const date = new Date(this.today.getTime() - 86_400_000);
    while (result.length < days) {
      const weekday = date.getUTCDay();
      if (weekday !== 0 && weekday !== 6) {
        const back = result.length;
        const spot = back === 0 ? SPOT_CLOSE
          : SPOT_CLOSE + 2.2 * Math.sin(back / 17) + 1.1 * Math.sin(back / 5.3)
            + 8.5 * Math.exp(-(((back - 21) / 4) ** 2));
        result.push({
          date: date.toISOString().slice(0, 10),
          spot: round(spot, 2),
          settlements: back === 0 ? this.settlements : this.dte.map((dte) => toTick(curveLevel(spot, dte))),
        });
      }
      date.setUTCDate(date.getUTCDate() - 1);
    }
    return result.reverse();
  }

  async getSpreadIntraday(nearConid: number, farConid: number): Promise<SpreadTick[]> {
    const { synthetic } = await this.getSpread(nearConid, farConid);
    const from = synthetic.close ?? 0;
    const to = synthetic.mid ?? from;
    const now = Date.now();
    const start = new Date(now).setHours(0, 0, 0, 0);
    const steps = 60;
    const seed = this.indexOf(nearConid) * 2 + this.indexOf(farConid);
    return Array.from({ length: steps + 1 }, (_, k) => {
      const t = k / steps;
      const noise = 0.03 * Math.sin(k * 0.9 + seed) * (1 - t) + 0.015 * Math.sin(k * 2.3 + seed);
      const mid = k === steps ? to : from + (to - from) * (t * t * (3 - 2 * t)) + noise;
      return { time: start + (now - start) * t, mid: round(mid, 3) };
    });
  }

  /** Random walk of the spot, the futures follow it with a damping by the time to expiration */
  private step() {
    const move = (Math.random() - 0.5) * 0.04;
    this.spotDrift = clamp(this.spotDrift + move, -1.5, 1.5);
    this.dte.forEach((dte, index) => {
      const own = (Math.random() - 0.5) * 0.02;
      this.drift[index] = clamp(this.drift[index] + move * Math.exp(-dte / 60) * 0.6 + own, -1.2, 1.2);
    });
  }

  private indexOf(conid: number): number {
    const index = this.chain.findIndex((contract) => contract.conid === conid);
    if (index < 0) {
      throw new Error(`CONTRACT_NOT_FOUND: ${conid}`);
    }
    return index;
  }

  private spotPrice(): MarketPrice {
    const now = new Date().toISOString();
    return {
      ...EMPTY_PRICE, conid: VIX_CONID, last: round(SPOT_CLOSE + this.spotDrift, 2), last_time: now,
      close: SPOT_CLOSE, quote_time: now, quote_age_seconds: 0, quote_basis: 'LAST',
    };
  }

  private futurePrice(conid: number): MarketPrice {
    const index = this.indexOf(conid);
    const liquidity = LIQUIDITY[index];
    const fair = this.settlements[index] + this.drift[index];
    const bid = toTick(fair - (liquidity.ticks * TICK) / 2);
    const ask = round(bid + liquidity.ticks * TICK, 2);
    const now = Date.now();
    // the back months trade rarely: their last trade is older
    const lastAge = Math.round(index ** 2.6 * 40_000);
    return {
      ...EMPTY_PRICE,
      conid,
      bid,
      ask,
      last: index % 2 === 0 ? ask : bid,
      bid_time: new Date(now).toISOString(),
      ask_time: new Date(now).toISOString(),
      last_time: new Date(now - lastAge).toISOString(),
      bid_size: liquidity.bidSize,
      ask_size: liquidity.askSize,
      last_size: 1 + (index % 3),
      volume: liquidity.volume,
      open_interest: liquidity.openInterest,
      close: this.settlements[index],
      mid: round((bid + ask) / 2),
      spread: round(ask - bid, 2),
      quote_time: new Date(now).toISOString(),
      quote_age_seconds: 0,
    };
  }
}

const EMPTY_PRICE: MarketPrice = {
  conid: 0, bid: null, ask: null, last: null, bid_time: null, ask_time: null, last_time: null, bid_size: null,
  ask_size: null, last_size: null, volume: null, open_interest: null, close: null, mid: null, spread: null,
  quote_time: null, quote_age_seconds: null, stale: false, quote_basis: 'BID_ASK', subscribed: true,
  stream_error: null, market_data_type: 'LIVE',
};

function syntheticSpread(near: MarketPrice, far: MarketPrice): SyntheticSpread {
  const bid = round(far.bid! - near.ask!, 2);
  const ask = round(far.ask! - near.bid!, 2);
  return {
    bid, ask, mid: round((bid + ask) / 2, 3), last: round(far.last! - near.last!, 2),
    close: round(far.close! - near.close!, 2), stale: false,
  };
}

/** The exchange listed spread trades in 0.01 steps, tighter than the legs; wider between distant months */
function nativeSpread(synthetic: SyntheticSpread, distance: number): NativeSpread {
  const half = Math.min(0.01 * distance, (synthetic.ask! - synthetic.bid!) / 2);
  const bid = round(Math.floor((synthetic.mid! - half) * 100 + 1e-6) / 100, 2);
  const ask = round(Math.ceil((synthetic.mid! + half) * 100 - 1e-6) / 100, 2);
  return {
    bid, ask, mid: round((bid + ask) / 2, 3), last: bid, close: synthetic.close,
    bid_size: Math.round(170 / (distance + 1)), ask_size: Math.round(120 / (distance + 1)),
    quote_age_seconds: 0, stale: false, subscribed: true, stream_error: null,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
