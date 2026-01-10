export interface Token {
  token_address: string;
  token_name: string;
  token_ticker: string;
  price_sol: number;
  market_cap_sol: number;
  volume_sol: number;
  liquidity_sol: number;
  transaction_count: number;
  price_1hr_change?: number;
  price_24hr_change?: number;
  price_7d_change?: number;
  protocol: string;
  dex_id?: string;
  pair_address?: string;
  price_usd?: number;
  fdv?: number;
  last_updated?: number;
}

export interface TokenQuery {
  limit?: number;
  cursor?: string;
  sortBy?: 'volume' | 'price_change' | 'market_cap' | 'liquidity';
  order?: 'asc' | 'desc';
  period?: '1h' | '24h' | '7d';
  search?: string;
  minVolume?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    nextCursor?: string;
    total: number;
    limit: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: number;
}

export interface ApiError {
  code: string;
  message: string;
  statusCode: number;
  details?: unknown;
}

export interface WebSocketEvent {
  type: 'price_update' | 'volume_spike' | 'tokens_updated' | 'new_token';
  data: unknown;
  timestamp: number;
}

export interface PriceUpdateEvent {
  token_address: string;
  old_price: number;
  new_price: number;
  change_percent: number;
}

export interface VolumeSpike {
  token_address: string;
  old_volume: number;
  new_volume: number;
  spike_percent: number;
}

export interface RateLimitInfo {
  requests: number;
  windowStart: number;
  blocked: boolean;
}
