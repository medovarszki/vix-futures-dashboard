import { MockMarketDataApi } from './mock';
import type { MarketDataApi } from './types';

/** The only place which knows where the data comes from: replace the mock with the IBKR Facade client here. */
export const api: MarketDataApi = new MockMarketDataApi();
