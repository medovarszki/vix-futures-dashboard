/**
 * Data contracts of the dashboard. ContractDto, MarketPrice and SpreadQuote mirror the JSON of the IBKR Facade
 * (GET /futures/chain, GET /prices, GET /spread), so the mock can be replaced by the real client without touching
 * the UI. CurveSnapshot is the dashboard's own daily store: the facade keeps no history.
 */

export interface ContractDto {
  conid: number;
  symbol: string;
  sec_type: string;
  exchange?: string;
  currency?: string;
  local_symbol?: string;
  trading_class?: string;
  multiplier?: string;
  /** yyyyMMdd */
  last_trade_date?: string;
  /** yyyyMM */
  contract_month?: string;
  underlying_conid?: number;
  min_tick?: number;
}

export interface MarketPrice {
  conid: number;
  bid: number | null;
  ask: number | null;
  last: number | null;
  bid_time: string | null;
  ask_time: string | null;
  last_time: string | null;
  bid_size: number | null;
  ask_size: number | null;
  last_size: number | null;
  volume: number | null;
  open_interest: number | null;
  /** Previous close, for futures the previous settlement price */
  close: number | null;
  mid: number | null;
  spread: number | null;
  quote_time: string | null;
  quote_age_seconds: number | null;
  stale: boolean;
  quote_basis: 'BID_ASK' | 'LAST';
  subscribed: boolean;
  stream_error: string | null;
  market_data_type: 'LIVE' | 'FROZEN' | 'DELAYED' | 'DELAYED_FROZEN' | null;
}

export interface SyntheticSpread {
  /** far bid - near ask: the price the spread can be sold at by legging */
  bid: number | null;
  /** far ask - near bid: the price the spread can be bought at by legging */
  ask: number | null;
  mid: number | null;
  last: number | null;
  /** spread of the previous settlement prices */
  close: number | null;
  stale: boolean;
}

export interface NativeSpread {
  bid: number | null;
  ask: number | null;
  mid: number | null;
  last: number | null;
  close: number | null;
  bid_size: number | null;
  ask_size: number | null;
  quote_age_seconds: number | null;
  stale: boolean;
  subscribed: boolean;
  stream_error: string | null;
}

export interface SpreadQuote {
  near_conid: number;
  far_conid: number;
  near: MarketPrice;
  far: MarketPrice;
  synthetic: SyntheticSpread;
  native: NativeSpread;
}

/** Settlement curve of one trading day: index 0 is the spot, 1..n are the futures by expiration (M1..Mn). */
export interface CurveSnapshot {
  /** yyyy-MM-dd */
  date: string;
  spot: number;
  settlements: number[];
}

export interface SpreadTick {
  /** epoch millis */
  time: number;
  mid: number;
}

export interface MarketDataApi {
  /** Monthly VX futures ordered by expiration; underlying_conid is the VIX index */
  getFuturesChain(): Promise<ContractDto[]>;
  getPrices(conids: number[]): Promise<MarketPrice[]>;
  getSpread(nearConid: number, farConid: number): Promise<SpreadQuote>;
  /** Daily settlement curves in ascending order of date */
  getCurveHistory(): Promise<CurveSnapshot[]>;
  /** Mid of the spread since the start of the trading day */
  getSpreadIntraday(nearConid: number, farConid: number): Promise<SpreadTick[]>;
}
