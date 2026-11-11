import { round } from '../domain/curve';
import { parseCompactDate, toCompactDate } from '../domain/expiry';
import type {
  ContractDto, CurveSnapshot, MarketDataApi, MarketPrice, SpreadQuote, SpreadTick,
} from './types';

interface HistoricalBar {
  /** yyyy-MM-dd for daily bars */
  time: string;
  /** epoch millis */
  timestamp: number;
  close: number;
}

interface HistoryResponse {
  bars: HistoricalBar[];
}

/** Error answer of the facade (RFC 9457 problem detail with a machine readable code) */
export class FacadeError extends Error {
  constructor(readonly status: number, readonly code: string, detail: string) {
    super(`${code}: ${detail}`);
  }
}

export interface FacadeOptions {
  /** Base path of the facade, by default the /ibkr path proxied by the dev server */
  baseUrl?: string;
  /** Number of monthly expirations on the curve */
  contracts?: number;
  /** Calendar days of history loaded for the historical curves */
  historyDays?: number;
  fetch?: typeof fetch;
  now?: () => Date;
}

const DAY = 86_400_000;

/**
 * Market data from the IBKR Facade. The facade is only a wrapper over IBKR and stores nothing, so the historical
 * curves are assembled here from the daily bars of the live and the expired contracts.
 */
export class FacadeMarketDataApi implements MarketDataApi {

  private readonly baseUrl: string;
  private readonly contracts: number;
  private readonly historyDays: number;
  private readonly fetch: typeof fetch;
  private readonly now: () => Date;
  private history?: Promise<CurveSnapshot[]>;

  constructor(options: FacadeOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '/ibkr').replace(/\/$/, '');
    this.contracts = options.contracts ?? 8;
    this.historyDays = options.historyDays ?? 185;
    this.fetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? (() => new Date());
  }

  async getFuturesChain(): Promise<ContractDto[]> {
    const chain = await this.chain(false);
    const today = toCompactDate(this.now());
    return chain.filter((c) => c.last_trade_date != null && c.last_trade_date >= today).slice(0, this.contracts);
  }

  getPrices(conids: number[]): Promise<MarketPrice[]> {
    return this.get<MarketPrice[]>('/prices', { conids: conids.join(',') });
  }

  getSpread(nearConid: number, farConid: number): Promise<SpreadQuote> {
    return this.get<SpreadQuote>('/spread', { near: nearConid, far: farConid });
  }

  /** Loaded once per page load: it takes a history request per contract */
  getCurveHistory(): Promise<CurveSnapshot[]> {
    this.history ??= this.loadCurveHistory().catch((e) => {
      this.history = undefined;
      throw e;
    });
    return this.history;
  }

  async getSpreadIntraday(nearConid: number, farConid: number): Promise<SpreadTick[]> {
    const query = { duration: '1 D', barSize: '5 mins', whatToShow: 'MIDPOINT', useRth: false };
    const [near, far] = await Promise.all([
      this.get<HistoryResponse>(`/history/${nearConid}`, query),
      this.get<HistoryResponse>(`/history/${farConid}`, query),
    ]);
    const nearByTime = new Map(near.bars.map((bar) => [bar.timestamp, bar.close]));
    return far.bars.flatMap((bar) => {
      const nearClose = nearByTime.get(bar.timestamp);
      return nearClose == null ? [] : [{ time: bar.timestamp, mid: round(bar.close - nearClose, 3) }];
    });
  }

  /**
   * The curve of a past day is made of the contracts which were alive on that day (M1 is the first one not expired
   * yet), with their daily closes. A day without a close for the spot or for M1 and M2 is skipped.
   */
  private async loadCurveHistory(): Promise<CurveSnapshot[]> {
    const now = this.now();
    const from = toCompactDate(new Date(now.getTime() - this.historyDays * DAY));
    const today = now.toISOString().slice(0, 10);
    const all = (await this.chain(true)).filter((c) => c.last_trade_date != null && c.last_trade_date >= from);
    const live = all.filter((c) => c.last_trade_date! >= toCompactDate(now)).slice(0, this.contracts);
    const expired = all.filter((c) => c.last_trade_date! < toCompactDate(now));
    const contracts = [...expired, ...live];
    const spotConid = contracts[0]?.underlying_conid;
    if (!spotConid) {
      return [];
    }

    const duration = `${Math.ceil(this.historyDays / 30)} M`;
    const closes = async (conid: number, lastTradeDate?: string) => {
      const expiry = lastTradeDate ? parseCompactDate(lastTradeDate).getTime() + DAY - 1000 : Infinity;
      const end = new Date(Math.min(now.getTime(), expiry));
      const endDateTime = `${toCompactDate(end)}-${end.toISOString().slice(11, 19)}`;
      try {
        const response = await this.get<HistoryResponse>(`/history/${conid}`, {
          duration, barSize: '1 day', whatToShow: 'TRADES', useRth: true, endDateTime,
        });
        return new Map(response.bars.map((bar) => [bar.time.slice(0, 10), bar.close]));
      } catch (e) {
        // eg. no historical data for a contract which never traded: the curve is drawn without it
        console.warn(`No history for conid ${conid}`, e);
        return new Map<string, number>();
      }
    };

    // one request at a time: IBKR limits the pace of the historical data requests
    const spot = await closes(spotConid);
    const byContract: Map<string, number>[] = [];
    for (const contract of contracts) {
      byContract.push(await closes(contract.conid, contract.last_trade_date));
    }

    const snapshots: CurveSnapshot[] = [];
    for (const date of [...spot.keys()].sort()) {
      if (date >= today) {
        continue; // today is the live curve
      }
      const compact = date.replaceAll('-', '');
      const settlements: number[] = [];
      for (let i = 0; i < contracts.length && settlements.length < this.contracts; i++) {
        if (contracts[i].last_trade_date! < compact) {
          continue;
        }
        const close = byContract[i].get(date);
        if (close == null) {
          break; // no gap in the curve: the months after a missing one are dropped
        }
        settlements.push(close);
      }
      if (settlements.length >= 2) {
        snapshots.push({ date, spot: spot.get(date)!, settlements });
      }
    }
    return snapshots;
  }

  private chain(includeExpired: boolean): Promise<ContractDto[]> {
    return this.get<ContractDto[]>('/futures/chain', {
      symbol: 'VIX', exchange: 'CFE', trading_class: 'VX', include_expired: includeExpired,
    });
  }

  private async get<T>(path: string, query: Record<string, string | number | boolean>): Promise<T> {
    const params = new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)]));
    let response: Response;
    try {
      response = await this.fetch(`${this.baseUrl}${path}?${params}`, { headers: { Accept: 'application/json' } });
    } catch (e) {
      throw new FacadeError(0, 'FACADE_UNREACHABLE', e instanceof Error ? e.message : String(e));
    }
    if (!response.ok) {
      const problem = await response.json().catch(() => ({}));
      throw new FacadeError(response.status, problem.code ?? `HTTP_${response.status}`,
        problem.detail ?? problem.title ?? response.statusText);
    }
    return response.json();
  }
}
