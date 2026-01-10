import { Request, Response, NextFunction } from 'express';
import { aggregatorService } from '../services/aggregator.service';
import { ApiResponse, PaginatedResponse, Token } from '../types';
import { AppError } from '../middleware/errorHandler';
import { Logger } from '../utils/logger';

export class TokenController {
  async getTokens(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        limit = '30',
        cursor,
        sortBy = 'volume',
        order = 'desc',
        period = '24h',
        search = '',
        minVolume = '0',
      } = req.query;

      // Validate query parameters
      const parsedLimit = parseInt(limit as string, 10);
      const parsedMinVolume = parseFloat(minVolume as string);

      if (parsedLimit < 1 || parsedLimit > 100) {
        throw new AppError(400, 'INVALID_LIMIT', 'Limit must be between 1 and 100');
      }

      if (!['volume', 'price_change', 'market_cap', 'liquidity'].includes(sortBy as string)) {
        throw new AppError(400, 'INVALID_SORT_BY', 'Invalid sortBy parameter');
      }

      if (!['asc', 'desc'].includes(order as string)) {
        throw new AppError(400, 'INVALID_ORDER', 'Order must be asc or desc');
      }

      if (!['1h', '24h', '7d'].includes(period as string)) {
        throw new AppError(400, 'INVALID_PERIOD', 'Period must be 1h, 24h, or 7d');
      }

      const result: PaginatedResponse<Token> = await aggregatorService.getFilteredTokens({
        limit: parsedLimit,
        cursor: cursor as string,
        sortBy: sortBy as 'volume' | 'price_change' | 'market_cap' | 'liquidity',
        order: order as 'asc' | 'desc',
        period: period as '1h' | '24h' | '7d',
        search: search as string,
        minVolume: parsedMinVolume,
      });

      const response: ApiResponse<PaginatedResponse<Token>> = {
        success: true,
        data: result,
        timestamp: Date.now(),
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }

  async getTokenByAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { address } = req.params;

      if (!address || address.length < 32) {
        throw new AppError(400, 'INVALID_ADDRESS', 'Invalid token address');
      }

      Logger.info('Fetching token by address', { address });

      const token = await aggregatorService.getTokenByAddress(address);

      if (!token) {
        throw new AppError(404, 'TOKEN_NOT_FOUND', 'Token not found');
      }

      const response: ApiResponse<Token> = {
        success: true,
        data: token,
        timestamp: Date.now(),
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }

  async searchTokens(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { q } = req.query;

      if (!q || typeof q !== 'string' || q.trim().length === 0) {
        throw new AppError(400, 'INVALID_QUERY', 'Search query is required');
      }

      Logger.info('Searching tokens', { query: q });

      const tokens = await aggregatorService.searchTokens(q);

      const response: ApiResponse<Token[]> = {
        success: true,
        data: tokens,
        timestamp: Date.now(),
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }

  async getHealth(_req: Request, res: Response): Promise<void> {
    const response = {
      success: true,
      data: {
        status: 'healthy',
        timestamp: Date.now(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      },
      timestamp: Date.now(),
    };

    res.json(response);
  }
}

export const tokenController = new TokenController();
