import { FacadeMarketDataApi } from './facade';
import { MockMarketDataApi } from './mock';
import type { MarketDataApi } from './types';

/** facade: the IBKR Facade behind the /ibkr proxy of the dev server; anything else: made up data */
export const dataSource: 'facade' | 'mock' = import.meta.env.VITE_DATA_SOURCE === 'facade' ? 'facade' : 'mock';

export const api: MarketDataApi = dataSource === 'facade' ? new FacadeMarketDataApi() : new MockMarketDataApi();
