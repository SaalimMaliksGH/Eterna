import dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    corsOrigin: process.env.CORS_ORIGIN || '*',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  cache: {
    ttl: parseInt(process.env.CACHE_TTL || '30', 10),
    apiCacheTTL: parseInt(process.env.API_CACHE_TTL || '30', 10),
  },
  rateLimit: {
    perMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '300', 10),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  },
  api: {
    dexScreener: {
      baseUrl: process.env.DEXSCREENER_BASE_URL || 'https://api.dexscreener.com/latest/dex',
      timeout: 10000,
    },
    jupiter: {
      baseUrl: process.env.JUPITER_BASE_URL || 'https://lite-api.jup.ag/tokens/v2',
      timeout: 10000,
    },
  },
  websocket: {
    updateInterval: parseInt(process.env.WS_UPDATE_INTERVAL || '30000', 10),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
