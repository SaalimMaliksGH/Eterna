import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../config';
import { Logger } from '../utils/logger';
import { jupiterLimiter } from '../utils/rateLimiter';
import { cacheService } from '../services/cache.service';
import { Token } from '../types';

interface JupiterToken {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  tags?: string[];
  daily_volume?: number;
  created_at?: string;
  freeze_authority?: string;
  mint_authority?: string;
  permanent_delegate?: string;
  minted_at?: string;
  extensions?: {
    coingeckoId?: string;
  };
}

interface JupiterSearchResponse {
  data: JupiterToken[];
  timeTaken: number;
}

export class JupiterAPI {
  private client: AxiosInstance;
  private readonly CACHE_PREFIX = 'jupiter:';
  
  // Read TTL dynamically from config instead of caching it
  private get CACHE_TTL() {
    return config.cache.apiCacheTTL;
  }

  constructor() {
    this.client = axios.create({
      baseURL: config.api.jupiter.baseUrl,
      timeout: config.api.jupiter.timeout,
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
        Logger.debug('Jupiter API Request', { 
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
          Logger.warn('Jupiter rate limit hit, implementing backoff');
          await jupiterLimiter.waitForSlot('global');
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
        Logger.debug('Jupiter cache hit', { query });
        return cached;
      }

      // Rate limit check
      const canProceed = await jupiterLimiter.waitForSlot('search');
      if (!canProceed) {
        throw new Error('Rate limit exceeded for Jupiter');
      }

      // Make API request
      const response = await this.client.get<JupiterSearchResponse>('/search', {
        params: { query },
      });

      const tokens = this.transformJupiterTokens(response.data.data || []);
      
      // Cache the result
      await cacheService.set(cacheKey, tokens, this.CACHE_TTL);

      Logger.info('Jupiter search successful', { 
        query, 
        tokensFound: tokens.length,
        timeTaken: response.data.timeTaken 
      });

      return tokens;
    } catch (error) {
      Logger.error('Jupiter search error', { query, error });
      // Return empty array on error instead of throwing
      return [];
    }
  }

  private transformJupiterTokens(jupiterTokens: JupiterToken[]): Token[] {
    return jupiterTokens.map(jToken => ({
      token_address: jToken.address,
      token_name: jToken.name,
      token_ticker: jToken.symbol,
      price_sol: 0, // Jupiter doesn't provide price in this endpoint
      market_cap_sol: 0,
      volume_sol: jToken.daily_volume || 0,
      liquidity_sol: 0,
      transaction_count: 0,
      protocol: 'Jupiter',
      last_updated: Date.now(),
    }));
  }

  async getTokenInfo(address: string): Promise<Token | null> {
    try {
      // Check cache first
      const cacheKey = `${this.CACHE_PREFIX}token:${address}`;
      const cached = await cacheService.get<Token>(cacheKey);
      
      if (cached) {
        Logger.debug('Jupiter cache hit', { address });
        return cached;
      }

      // Rate limit check
      const canProceed = await jupiterLimiter.waitForSlot('token');
      if (!canProceed) {
        throw new Error('Rate limit exceeded for Jupiter');
      }

      // Jupiter doesn't have a direct token info endpoint in the lite API
      // We'll search by address instead
      const tokens = await this.searchTokens(address);
      
      if (tokens.length === 0) {
        return null;
      }

      const token = tokens[0];
      
      // Cache the result
      await cacheService.set(cacheKey, token, this.CACHE_TTL);

      return token;
    } catch (error) {
      Logger.error('Jupiter token fetch error', { address, error });
      return null;
    }
  }
}

export const jupiterAPI = new JupiterAPI();
