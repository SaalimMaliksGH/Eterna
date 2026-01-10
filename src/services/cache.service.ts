import Redis from 'ioredis';
import { config } from '../config';
import { Logger } from '../utils/logger';

export class CacheService {
  private client: Redis;
  private isConnected: boolean = false;

  constructor() {
    // Use REDIS_URL if available (for cloud services like Upstash, Redis Cloud)
    // Otherwise fall back to individual host/port config (for local development)
    const redisUrl = process.env.REDIS_URL;
    
    if (redisUrl && (redisUrl.startsWith('redis://') || redisUrl.startsWith('rediss://'))) {
      // Use connection URL (Upstash, Redis Cloud, Railway, etc.)
      this.client = new Redis(redisUrl, {
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        // For TLS connections (rediss://)
        tls: redisUrl.startsWith('rediss://') ? {} : undefined,
      });
    } else {
      // Use individual config (local development)
      this.client = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
      });
    }

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      Logger.info('Redis connected successfully', {
        host: config.redis.host,
        port: config.redis.port,
      });
      this.isConnected = true;
    });

    this.client.on('error', (error) => {
      const errorMessage = error.message || 'Unknown Redis error';
      Logger.error('Redis connection error', { 
        error: errorMessage,
        host: config.redis.host,
        port: config.redis.port,
        hint: 'Check REDIS_URL environment variable. For production, use a Redis cloud service like Upstash (https://upstash.com) or Redis Cloud. See DEPLOYMENT.md for setup guide.',
      });
      this.isConnected = false;
    });

    this.client.on('close', () => {
      Logger.warn('Redis connection closed', {
        host: config.redis.host,
        port: config.redis.port,
      });
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      Logger.info('Redis reconnecting...', {
        host: config.redis.host,
        port: config.redis.port,
      });
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      if (!this.isConnected) {
        Logger.warn('Redis not connected, skipping cache get');
        return null;
      }

      const value = await this.client.get(key);
      if (!value) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (error) {
      Logger.error('Cache get error', { key, error });
      return null;
    }
  }

  async set(key: string, value: unknown, ttl: number = config.cache.ttl): Promise<boolean> {
    try {
      if (!this.isConnected) {
        Logger.warn('Redis not connected, skipping cache set');
        return false;
      }

      const serialized = JSON.stringify(value);
      await this.client.setex(key, ttl, serialized);
      return true;
    } catch (error) {
      Logger.error('Cache set error', { key, error });
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      await this.client.del(key);
      return true;
    } catch (error) {
      Logger.error('Cache delete error', { key, error });
      return false;
    }
  }

  async deletePattern(pattern: string): Promise<number> {
    try {
      if (!this.isConnected) {
        return 0;
      }

      const keys = await this.client.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      await this.client.del(...keys);
      return keys.length;
    } catch (error) {
      Logger.error('Cache delete pattern error', { pattern, error });
      return 0;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      Logger.error('Cache exists error', { key, error });
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      if (!this.isConnected) {
        return -1;
      }

      return await this.client.ttl(key);
    } catch (error) {
      Logger.error('Cache TTL error', { key, error });
      return -1;
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
    this.isConnected = false;
  }

  async flushAll(): Promise<void> {
    if (config.server.nodeEnv === 'test') {
      await this.client.flushall();
    }
  }
}

// Singleton instance
export const cacheService = new CacheService();
