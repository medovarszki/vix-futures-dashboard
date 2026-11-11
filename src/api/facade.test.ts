import { describe, expect, it, vi } from 'vitest';
import { FacadeError, FacadeMarketDataApi } from './facade';
import type { ContractDto } from './types';

const NOW = new Date('2026-11-11T15:00:00Z');

const future = (conid: number, lastTradeDate: string): ContractDto => ({
  conid, symbol: 'VIX', sec_type: 'FUT', local_symbol: `VX${conid}`, trading_class: 'VX',
  last_trade_date: lastTradeDate, underlying_conid: 1,
});

const OCT = future(10, '20261021');
const NOV = future(11, '20261118');
const DEC = future(12, '20261216');
const JAN = future(13, '20270120');

/** Fake facade: answers by path, records the requested URLs */
function facade(routes: Record<string, (params: URLSearchParams) => unknown>) {
  const urls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://facade');
    urls.push(url.pathname + url.search);
    const route = routes[url.pathname];
    if (!route) {
      return new Response(JSON.stringify({ status: 404, code: 'CONTRACT_NOT_FOUND', detail: 'No such contract' }), { status: 404 });
    }
    return new Response(JSON.stringify(route(url.searchParams)));
  });
  return { api: new FacadeMarketDataApi({ fetch: fetchMock as typeof fetch, now: () => NOW, contracts: 2 }), urls };
}

const bars = (closes: Record<string, number>) => ({
  bars: Object.entries(closes).map(([time, close]) => ({ time, timestamp: Date.parse(time), close })),
});

describe('IBKR Facade client', () => {
  it('asks for the monthly VX chain and keeps the next expirations', async () => {
    const { api, urls } = facade({ '/ibkr/futures/chain': () => [OCT, NOV, DEC, JAN] });

    const chain = await api.getFuturesChain();

    expect(chain.map((c) => c.conid)).toEqual([11, 12]);
    expect(urls[0]).toBe('/ibkr/futures/chain?symbol=VIX&exchange=CFE&trading_class=VX&include_expired=false');
  });

  it('keeps the contract expiring today', async () => {
    const { api } = facade({ '/ibkr/futures/chain': () => [future(11, '20261111'), DEC] });
    expect((await api.getFuturesChain()).map((c) => c.conid)).toEqual([11, 12]);
  });

  it('requests the prices of several instruments at once', async () => {
    const { api, urls } = facade({ '/ibkr/prices': (p) => p.get('conids')!.split(',').map((conid) => ({ conid: +conid })) });

    expect((await api.getPrices([1, 11, 12])).map((p) => p.conid)).toEqual([1, 11, 12]);
    expect(urls[0]).toBe('/ibkr/prices?conids=1%2C11%2C12');
  });

  it('turns a problem detail into an error with its code', async () => {
    const { api } = facade({});
    await expect(api.getSpread(11, 12)).rejects.toMatchObject({ status: 404, code: 'CONTRACT_NOT_FOUND' });
    await expect(api.getSpread(11, 12)).rejects.toBeInstanceOf(FacadeError);
  });

  it('reports an unreachable facade', async () => {
    const api = new FacadeMarketDataApi({ fetch: async () => { throw new TypeError('fetch failed'); } });
    await expect(api.getPrices([1])).rejects.toMatchObject({ code: 'FACADE_UNREACHABLE' });
  });

  it('builds the past curves from the contracts alive on each day', async () => {
    const { api, urls } = facade({
      '/ibkr/futures/chain': () => [OCT, NOV, DEC, JAN],
      '/ibkr/history/1': () => bars({ '2026-10-20': 20, '2026-10-21': 19, '2026-10-22': 18, '2026-11-10': 16.9, '2026-11-11': 16.4 }),
      '/ibkr/history/10': () => bars({ '2026-10-20': 20.5, '2026-10-21': 19.2 }),
      '/ibkr/history/11': () => bars({ '2026-10-20': 21, '2026-10-21': 20, '2026-10-22': 19, '2026-11-10': 17.35 }),
      '/ibkr/history/12': () => bars({ '2026-10-20': 21.5, '2026-10-21': 20.6, '2026-10-22': 19.8, '2026-11-10': 18.55 }),
    });

    const history = await api.getCurveHistory();

    expect(history).toEqual([
      // October was still the front month until its expiration...
      { date: '2026-10-20', spot: 20, settlements: [20.5, 21] },
      { date: '2026-10-21', spot: 19, settlements: [19.2, 20] },
      // ...then November took over
      { date: '2026-10-22', spot: 18, settlements: [19, 19.8] },
      { date: '2026-11-10', spot: 16.9, settlements: [17.35, 18.55] },
      // today is not part of the history
    ]);
    // the expired contract is requested until its expiration, the live ones until now
    expect(urls).toContain('/ibkr/futures/chain?symbol=VIX&exchange=CFE&trading_class=VX&include_expired=true');
    expect(urls.find((u) => u.startsWith('/ibkr/history/10?'))).toContain('endDateTime=20261021-23%3A59%3A59');
    expect(urls.find((u) => u.startsWith('/ibkr/history/11?'))).toContain('endDateTime=20261111-15%3A00%3A00');
    // JAN is beyond the two contracts of the curve today, so it is not requested
    expect(urls.some((u) => u.startsWith('/ibkr/history/13?'))).toBe(false);
  });

  it('draws the curve without a contract which has no history', async () => {
    const { api } = facade({
      '/ibkr/futures/chain': () => [NOV, DEC],
      '/ibkr/history/1': () => bars({ '2026-11-10': 16.9 }),
      '/ibkr/history/11': () => bars({ '2026-11-10': 17.35 }),
      // 404 for conid 12
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // a single point is not a curve
    expect(await api.getCurveHistory()).toEqual([]);
  });

  it('computes the intraday spread from the midpoint bars of the two legs', async () => {
    const { api } = facade({
      '/ibkr/history/11': () => ({ bars: [{ time: 'a', timestamp: 1000, close: 17.1 }, { time: 'b', timestamp: 2000, close: 17.2 }] }),
      '/ibkr/history/12': () => ({ bars: [{ time: 'b', timestamp: 2000, close: 18.45 }, { time: 'c', timestamp: 3000, close: 18.5 }] }),
    });

    expect(await api.getSpreadIntraday(11, 12)).toEqual([{ time: 2000, mid: 1.25 }]);
  });
});
