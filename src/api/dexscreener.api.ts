import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../config';
import { Logger } from '../utils/logger';
import { dexScreenerLimiter } from '../utils/rateLimiter';
import { cacheService } from '../services/cache.service';
import { Token } from '../types';

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    symbol: string;
  };
  priceNative: string;
  priceUsd?: string;
  txns: {
    h24: { buys: number; sells: number };
    h1: { buys: number; sells: number };
  };
  volume: {
    h24: number;
    h1: number;
  };
  priceChange: {
    h24: number;
    h1: number;
  };
  liquidity?: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv?: number;
  marketCap?: number;
}

interface DexScreenerResponse {
  schemaVersion: string;
  pairs: DexScreenerPair[] | null;
}

export class DexScreenerAPI {
  private client: AxiosInstance;
  private readonly CACHE_PREFIX = 'dexscreener:';
  
  // Read TTL dynamically from config instead of caching it
  private get CACHE_TTL() {
    return config.cache.apiCacheTTL;
  }

  constructor() {
    this.client = axios.create({
      baseURL: config.api.dexScreener.baseUrl,
      timeout: config.api.dexScreener.timeout,
      headers: {
        'Accept': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        Logger.debug('DexScreener API Request', { 
          url: config.url,
          method: config.method 
        });
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 429) {
          Logger.warn('DexScreener rate limit hit, implementing backoff');
          await dexScreenerLimiter.waitForSlot('global');
        }
        return Promise.reject(error);
      }
    );
  }

  async searchTokens(query: string): Promise<Token[]> {
    try {
      // Check cache first
      const cacheKey = `${this.CACHE_PREFIX}search:${query}`;
      const cached = await cacheService.get<Token[]>(cacheKey);
      
      if (cached) {
        Logger.debug('DexScreener cache hit', { query });
        return cached;
      }

      // Rate limit check
      const canProceed = await dexScreenerLimiter.waitForSlot('search');
      if (!canProceed) {
        throw new Error('Rate limit exceeded for DexScreener');
      }

      // Make API request
      const response = await this.client.get<DexScreenerResponse>(`/search`, {
        params: { q: query },
      });

      const tokens = this.transformPairsToTokens(response.data.pairs || []);
      
      // Cache the result
      await cacheService.set(cacheKey, tokens, this.CACHE_TTL);

      Logger.info('DexScreener search successful', { 
        query, 
        tokensFound: tokens.length 
      });

      return tokens;
    } catch (error) {
      Logger.error('DexScreener search error', { query, error });
      throw error;
    }
  }

  async getTokenByAddress(address: string): Promise<Token | null> {
    try {
      // Check cache first
      const cacheKey = `${this.CACHE_PREFIX}token:${address}`;
      const cached = await cacheService.get<Token>(cacheKey);
      
      if (cached) {
        Logger.debug('DexScreener cache hit', { address });
        return cached;
      }

      // Rate limit check
      const canProceed = await dexScreenerLimiter.waitForSlot('token');
      if (!canProceed) {
        throw new Error('Rate limit exceeded for DexScreener');
      }

      // Make API request
      const response = await this.client.get<DexScreenerResponse>(`/tokens/${address}`);

      if (!response.data.pairs || response.data.pairs.length === 0) {
        return null;
      }

      // Get the first pair (usually the most liquid)
      const token = this.transformPairToToken(response.data.pairs[0]);
      
      // Cache the result
      await cacheService.set(cacheKey, token, this.CACHE_TTL);

      Logger.info('DexScreener token fetch successful', { address });

      return token;
    } catch (error) {
      Logger.error('DexScreener token fetch error', { address, error });
      return null;
    }
  }

  private transformPairsToTokens(pairs: DexScreenerPair[]): Token[] {
    return pairs.map(pair => this.transformPairToToken(pair));
  }

  private transformPairToToken(pair: DexScreenerPair): Token {
    const priceInSol = parseFloat(pair.priceNative) || 0;
    const volumeInSol = pair.volume.h24 / (parseFloat(pair.priceUsd || '0') || 1);
    const liquidityInSol = (pair.liquidity?.base || 0);

    return {
      token_address: pair.baseToken.address,
      token_name: pair.baseToken.name,
      token_ticker: pair.baseToken.symbol,
      price_sol: priceInSol,
      market_cap_sol: pair.marketCap ? pair.marketCap / (parseFloat(pair.priceUsd || '0') || 1) : 0,
      volume_sol: volumeInSol,
      liquidity_sol: liquidityInSol,
      transaction_count: pair.txns.h24.buys + pair.txns.h24.sells,
      price_1hr_change: pair.priceChange.h1,
      price_24hr_change: pair.priceChange.h24,
      protocol: pair.dexId,
      dex_id: pair.dexId,
      pair_address: pair.pairAddress,
      price_usd: parseFloat(pair.priceUsd || '0'),
      fdv: pair.fdv,
      last_updated: Date.now(),
    };
  }
}

export const dexScreenerAPI = new DexScreenerAPI();
