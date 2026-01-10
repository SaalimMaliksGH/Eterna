import { Token, TokenQuery, PaginatedResponse } from '../types';
import { dexScreenerAPI } from '../api/dexscreener.api';
import { jupiterAPI } from '../api/jupiter.api';
import { cacheService } from './cache.service';
import { Logger } from '../utils/logger';
import { config } from '../config';

export class AggregatorService {
  private readonly CACHE_PREFIX = 'aggregated:';
  
  // Read TTL dynamically from config instead of caching it
  private get CACHE_TTL() {
    return config.cache.ttl;
  }

  async searchTokens(query: string): Promise<Token[]> {
    try {
      // Check cache first
      const cacheKey = `${this.CACHE_PREFIX}search:${query}`;
      const cached = await cacheService.get<Token[]>(cacheKey);
      
      if (cached) {
        Logger.debug('Aggregator cache hit', { query });
        return cached;
      }

      Logger.info('Fetching tokens from multiple sources', { query });

      // Fetch from both APIs in parallel
      const [dexScreenerTokens, jupiterTokens] = await Promise.allSettled([
        dexScreenerAPI.searchTokens(query),
        jupiterAPI.searchTokens(query),
      ]);

      const dexTokens = dexScreenerTokens.status === 'fulfilled' ? dexScreenerTokens.value : [];
      const jupTokens = jupiterTokens.status === 'fulfilled' ? jupiterTokens.value : [];

      Logger.debug('Tokens fetched from sources', {
        dexScreener: dexTokens.length,
        jupiter: jupTokens.length,
      });

      // Merge and deduplicate tokens
      const mergedTokens = this.mergeAndDeduplicateTokens([...dexTokens, ...jupTokens]);

      // Cache the aggregated result
      await cacheService.set(cacheKey, mergedTokens, this.CACHE_TTL);

      Logger.info('Tokens aggregated successfully', { 
        query, 
        totalTokens: mergedTokens.length 
      });

      return mergedTokens;
    } catch (error) {
      Logger.error('Token aggregation error', { query, error });
      throw error;
    }
  }

  async getTokenByAddress(address: string): Promise<Token | null> {
    try {
      // Check cache first
      const cacheKey = `${this.CACHE_PREFIX}token:${address}`;
      const cached = await cacheService.get<Token>(cacheKey);
      
      if (cached) {
        Logger.debug('Aggregator token cache hit', { address });
        return cached;
      }

      // Fetch from both APIs in parallel
      const [dexToken, jupToken] = await Promise.allSettled([
        dexScreenerAPI.getTokenByAddress(address),
        jupiterAPI.getTokenInfo(address),
      ]);

      const dexResult = dexToken.status === 'fulfilled' ? dexToken.value : null;
      const jupResult = jupToken.status === 'fulfilled' ? jupToken.value : null;

      // Merge the token data (prefer DexScreener as it has more data)
      const mergedToken = this.mergeTokenData(dexResult, jupResult);

      if (!mergedToken) {
        return null;
      }

      // Cache the result
      await cacheService.set(cacheKey, mergedToken, this.CACHE_TTL);

      return mergedToken;
    } catch (error) {
      Logger.error('Token fetch error', { address, error });
      return null;
    }
  }

  async getFilteredTokens(query: TokenQuery): Promise<PaginatedResponse<Token>> {
    try {
      const { 
        limit = 30, 
        cursor, 
        sortBy = 'volume', 
        order = 'desc',
        period = '24h',
        search = '',
        minVolume = 0
      } = query;

      // Get all tokens (from cache or API)
      let tokens: Token[];
      
      if (search) {
        tokens = await this.searchTokens(search);
      } else {
        // Get popular tokens (default search)
        const cacheKey = `${this.CACHE_PREFIX}popular`;
        const cached = await cacheService.get<Token[]>(cacheKey);
        
        if (cached) {
          tokens = cached;
        } else {
          // Fetch popular tokens from DexScreener
          tokens = await dexScreenerAPI.searchTokens('SOL');
          await cacheService.set(cacheKey, tokens, this.CACHE_TTL);
        }
      }

      // Apply filters
      let filteredTokens = this.applyFilters(tokens, { period, minVolume });

      // Apply sorting
      filteredTokens = this.sortTokens(filteredTokens, sortBy, order);

      // Apply pagination
      const startIndex = cursor ? parseInt(cursor, 10) : 0;
      const endIndex = startIndex + limit;
      const paginatedTokens = filteredTokens.slice(startIndex, endIndex);

      const nextCursor = endIndex < filteredTokens.length ? endIndex.toString() : undefined;

      return {
        data: paginatedTokens,
        pagination: {
          nextCursor,
          total: filteredTokens.length,
          limit,
        },
      };
    } catch (error) {
      Logger.error('Token filtering error', { query, error });
      throw error;
    }
  }

  private mergeAndDeduplicateTokens(tokens: Token[]): Token[] {
    const tokenMap = new Map<string, Token>();

    for (const token of tokens) {
      const key = token.token_address.toLowerCase();
      
      if (!tokenMap.has(key)) {
        tokenMap.set(key, token);
      } else {
        // Merge with existing token
        const existing = tokenMap.get(key)!;
        tokenMap.set(key, this.mergeTokenData(existing, token)!);
      }
    }

    return Array.from(tokenMap.values());
  }

  private mergeTokenData(token1: Token | null, token2: Token | null): Token | null {
    if (!token1 && !token2) return null;
    if (!token1) return token2;
    if (!token2) return token1;

    // Prefer token with more complete data (DexScreener usually has more)
    const base = token1.price_sol > 0 ? token1 : token2;
    const supplement = token1.price_sol > 0 ? token2 : token1;

    return {
      ...base,
      // Aggregate volumes from both sources
      volume_sol: base.volume_sol + supplement.volume_sol,
      // Take the maximum liquidity
      liquidity_sol: Math.max(base.liquidity_sol, supplement.liquidity_sol),
      // Take the maximum transaction count
      transaction_count: Math.max(base.transaction_count, supplement.transaction_count),
      // Use most recent update
      last_updated: Math.max(base.last_updated || 0, supplement.last_updated || 0),
    };
  }

  private applyFilters(tokens: Token[], filters: { period: string; minVolume: number }): Token[] {
    return tokens.filter(token => {
      // Filter by minimum volume
      if (token.volume_sol < filters.minVolume) {
        return false;
      }

      // Filter by price change availability based on period
      if (filters.period === '1h' && token.price_1hr_change === undefined) {
        return false;
      }

      return true;
    });
  }

  private sortTokens(tokens: Token[], sortBy: string, order: string): Token[] {
    const sorted = [...tokens].sort((a, b) => {
      let aValue: number;
      let bValue: number;

      switch (sortBy) {
        case 'volume':
          aValue = a.volume_sol;
          bValue = b.volume_sol;
          break;
        case 'price_change':
          aValue = a.price_24hr_change || 0;
          bValue = b.price_24hr_change || 0;
          break;
        case 'market_cap':
          aValue = a.market_cap_sol;
          bValue = b.market_cap_sol;
          break;
        case 'liquidity':
          aValue = a.liquidity_sol;
          bValue = b.liquidity_sol;
          break;
        default:
          aValue = a.volume_sol;
          bValue = b.volume_sol;
      }

      return order === 'asc' ? aValue - bValue : bValue - aValue;
    });

    return sorted;
  }

  async invalidateCache(pattern?: string): Promise<number> {
    const deletePattern = pattern || `${this.CACHE_PREFIX}*`;
    return await cacheService.deletePattern(deletePattern);
  }
}

export const aggregatorService = new AggregatorService();
