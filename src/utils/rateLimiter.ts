import { config } from '../config';
import { Logger } from '../utils/logger';
import { RateLimitInfo } from '../types';

export class RateLimiter {
  private requestCounts: Map<string, RateLimitInfo> = new Map();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = config.rateLimit.perMinute, windowMs: number = config.rateLimit.windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Cleanup old entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  canMakeRequest(identifier: string): boolean {
    const now = Date.now();
    const info = this.requestCounts.get(identifier);

    if (!info) {
      this.requestCounts.set(identifier, {
        requests: 1,
        windowStart: now,
        blocked: false,
      });
      return true;
    }

    // Check if window has expired
    if (now - info.windowStart >= this.windowMs) {
      this.requestCounts.set(identifier, {
        requests: 1,
        windowStart: now,
        blocked: false,
      });
      return true;
    }

    // Check if limit reached
    if (info.requests >= this.maxRequests) {
      info.blocked = true;
      Logger.warn('Rate limit exceeded', { identifier, requests: info.requests });
      return false;
    }

    // Increment counter
    info.requests++;
    return true;
  }

  getRemainingRequests(identifier: string): number {
    const info = this.requestCounts.get(identifier);
    if (!info) {
      return this.maxRequests;
    }

    const now = Date.now();
    if (now - info.windowStart >= this.windowMs) {
      return this.maxRequests;
    }

    return Math.max(0, this.maxRequests - info.requests);
  }

  getResetTime(identifier: string): number {
    const info = this.requestCounts.get(identifier);
    if (!info) {
      return Date.now();
    }

    return info.windowStart + this.windowMs;
  }

  async waitForSlot(identifier: string, maxRetries: number = 5): Promise<boolean> {
    let retries = 0;
    let baseDelay = 1000; // Start with 1 second

    while (retries < maxRetries) {
      if (this.canMakeRequest(identifier)) {
        return true;
      }

      const delay = baseDelay * Math.pow(2, retries); // Exponential backoff
      const jitter = Math.random() * 1000; // Add jitter to prevent thundering herd
      const totalDelay = delay + jitter;

      Logger.debug(`Rate limited, waiting ${totalDelay}ms before retry ${retries + 1}/${maxRetries}`);
      
      await this.sleep(totalDelay);
      retries++;
    }

    Logger.error('Max retries exceeded for rate limiter', { identifier, maxRetries });
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    this.requestCounts.forEach((info, identifier) => {
      if (now - info.windowStart >= this.windowMs * 2) {
        toDelete.push(identifier);
      }
    });

    toDelete.forEach(identifier => this.requestCounts.delete(identifier));

    if (toDelete.length > 0) {
      Logger.debug(`Cleaned up ${toDelete.length} rate limit entries`);
    }
  }

  reset(identifier: string): void {
    this.requestCounts.delete(identifier);
  }

  resetAll(): void {
    this.requestCounts.clear();
  }
}

// Singleton instances for different APIs
export const dexScreenerLimiter = new RateLimiter(300, 60000); // 300 req/min
export const jupiterLimiter = new RateLimiter(600, 60000); // Higher limit for Jupiter
