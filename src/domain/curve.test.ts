import { describe, expect, it } from 'vitest';
import { MockMarketDataApi } from '../api/mock';
import type { MarketPrice } from '../api/types';
import { buildCurve, leggingCost, legSpread, type CurveRow } from './curve';
import { upcomingVxExpiries, vxExpiry, vxLocalSymbol } from './expiry';

const row = (bid: number, ask: number, close: number, dte: number, last = bid): CurveRow => ({
  index: 0, label: 'M1', code: 'VX', conid: 1, expiry: new Date(), dte, mid: (bid + ask) / 2, widthTicks: 1,
  change: 0, price: { bid, ask, last, close } as MarketPrice,
});

describe('VX expirations', () => {
  it('is the Wednesday 30 days before the third Friday of the following month', () => {
    expect(vxExpiry(2026, 10).toISOString().slice(0, 10)).toBe('2026-11-18');
    expect(vxExpiry(2026, 11).toISOString().slice(0, 10)).toBe('2026-12-16');
    expect(vxExpiry(2027, 0).toISOString().slice(0, 10)).toBe('2027-01-20');
    expect(vxExpiry(2027, 5).toISOString().slice(0, 10)).toBe('2027-06-16');
  });

  it('names the contracts by month code and the last digit of the year', () => {
    expect(vxLocalSymbol(2026, 10)).toBe('VXX6');
    expect(vxLocalSymbol(2027, 0)).toBe('VXF7');
  });

  it('skips the expiration which is over, keeps the one expiring today', () => {
    const after = upcomingVxExpiries(new Date('2026-11-19T10:00:00Z'), 2);
    expect(after.map((e) => e.expiry.toISOString().slice(0, 10))).toEqual(['2026-12-16', '2027-01-20']);
    const onTheDay = upcomingVxExpiries(new Date('2026-11-18T10:00:00Z'), 1);
    expect(onTheDay[0].expiry.toISOString().slice(0, 10)).toBe('2026-11-18');
  });
});

describe('calendar spread from the legs', () => {
  const near = row(17.05, 17.1, 17.35, 7, 17.1);
  const far = row(18.35, 18.4, 18.55, 35, 18.35);
  const spread = legSpread(near, far);

  it('buys the far leg on the ask and sells the near leg on the bid', () => {
    expect(spread.buy).toBe(1.35);
    expect(spread.sell).toBe(1.25);
    expect(spread.mid).toBe(1.3);
    expect(spread.width).toBe(0.1);
  });

  it('compares to the previous settlement prices', () => {
    expect(spread.prev).toBe(1.2);
    expect(spread.change).toBe(0.1);
    expect(spread.last).toBe(1.25);
    expect(spread.days).toBe(28);
    expect(spread.contangoPct).toBeCloseTo(7.6135, 3);
  });

  it('tells how much worse legging is than the exchange listed spread', () => {
    expect(leggingCost(spread, { bid: 1.29, ask: 1.31 })).toEqual({ buy: 0.04, sell: 0.04 });
    expect(leggingCost(spread, { bid: null, ask: 1.31 })).toEqual({ buy: 0.04, sell: null });
  });

  it('has no price without a quote on a leg', () => {
    const noBid = { ...near, price: { ...near.price, bid: null } };
    expect(legSpread(noBid, far).buy).toBeNull();
    expect(legSpread(noBid, far).mid).toBeNull();
    expect(legSpread(noBid, far).sell).toBe(1.25);
  });
});

describe('mock market data', () => {
  it('serves a consistent curve', async () => {
    const mock = new MockMarketDataApi();
    const chain = await mock.getFuturesChain();
    const prices = await mock.getPrices(chain.map((c) => c.conid));
    const curve = buildCurve(chain, prices, new Date());

    expect(curve).toHaveLength(8);
    expect(curve.map((r) => r.dte)).toEqual([...curve.map((r) => r.dte)].sort((a, b) => a - b));
    for (const r of curve) {
      expect(r.price.ask!).toBeGreaterThan(r.price.bid!);
      expect(r.widthTicks).toBeGreaterThanOrEqual(1);
    }

    const quote = await mock.getSpread(chain[0].conid, chain[1].conid);
    expect(quote.synthetic.ask!).toBeGreaterThan(quote.synthetic.bid!);
    // the listed spread is inside the synthetic one
    expect(quote.native.ask!).toBeLessThanOrEqual(quote.synthetic.ask!);
    expect(quote.native.bid!).toBeGreaterThanOrEqual(quote.synthetic.bid!);
    expect(quote.native.ask!).toBeGreaterThan(quote.native.bid!);

    const history = await mock.getCurveHistory();
    expect(history).toHaveLength(126);
    expect(history[0].date < history[125].date).toBe(true);
    expect(history[125].settlements).toHaveLength(8);
  });
});
