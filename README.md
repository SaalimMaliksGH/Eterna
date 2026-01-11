# 🚀 Real-time DEX Aggregator

A real-time cryptocurrency token data aggregation service that fetches meme coin data from multiple DEX (Decentralized Exchange) APIs, implements efficient caching with Redis, and provides live updates via WebSockets.

Deployed here - https://dexflow-realtime.onrender.com

## 📋 Features

- ✅ **Multi-Source Aggregation**: Fetches data from DexScreener and Jupiter APIs
- ✅ **Smart Caching**: Redis-based caching with configurable TTL (30s default)
- ✅ **Real-time Updates**: WebSocket support for live price and volume updates
- ✅ **Rate Limiting**: Intelligent rate limiting with exponential backoff
- ✅ **Token Deduplication**: Merges duplicate tokens across different DEXs
- ✅ **Advanced Filtering**: Filter by time period, volume, and search
- ✅ **Sorting Options**: Sort by volume, price change, market cap, or liquidity
- ✅ **Cursor Pagination**: Efficient pagination for large token lists
- ✅ **Error Handling**: Comprehensive error handling and recovery

## 🛠️ Tech Stack

- **Runtime**: Node.js with TypeScript
- **Web Framework**: Express.js
- **WebSocket**: Socket.io
- **Cache**: Upstash Redis (serverless, ioredis client)
- **HTTP Client**: Axios
- **Task Scheduling**: node-cron

## 📁 Project Structure

```
src/
├── api/                    # External API clients
│   ├── dexscreener.api.ts  # DexScreener API wrapper
│   └── jupiter.api.ts      # Jupiter API wrapper
├── config/                 # Configuration files
│   └── index.ts            # App configuration
├── controllers/            # Route controllers
│   ├── token.controller.ts # Token endpoints logic
│   └── routes.ts           # API routes
├── middleware/             # Express middleware
│   └── errorHandler.ts     # Error handling middleware
├── services/               # Business logic
│   ├── aggregator.service.ts  # Token aggregation
│   ├── cache.service.ts       # Redis caching
│   └── websocket.service.ts   # WebSocket real-time updates
├── types/                  # TypeScript type definitions
│   └── index.ts
├── utils/                  # Utility functions
│   ├── logger.ts           # Logging utility
│   └── rateLimiter.ts      # Rate limiting utility
└── server.ts               # Main application entry point

frontend/
├── index.html              # Main landing page (redirects to test client)
├── test-client.html        # Real-time WebSocket client UI
├── styles.css              # UI styling
└── script.js               # Client-side JavaScript
```

## 🚀 Getting Started

### Prerequisites

- Node.js >= 18.x
- Upstash Redis account (free tier available at [upstash.com](https://upstash.com))
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/raunaksarawgi/dexflow_realtime.git
   cd dexflow_realtime
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your Upstash Redis configuration:
   ```env
   NODE_ENV=development
   PORT=3000
   REDIS_URL=rediss://default:your_password@your-instance.upstash.io:6379
   CACHE_TTL=30
   ```
   
   **Getting your Upstash Redis URL:**
   1. Sign up at [upstash.com](https://upstash.com)
   2. Create a new Redis database
   3. Copy the connection string (starts with `rediss://`)
   4. Paste it as the `REDIS_URL` value

4. **Build the project**
   ```bash
   npm run build
   ```

5. **Start the server**
   ```bash
   # Development mode (with hot reload)
   npm run dev
   
   # Production mode
   npm start
   ```

The server will start on `http://localhost:3000`

## 🎨 UI

A modern black-themed WebSocket client accessible at `http://localhost:3000/test-client.html`

Features:
- Real-time token price updates
- Live volume spike notifications  
- Advanced sorting and filtering
- Modern dark UI with smooth animations
- Lightweight and responsive
- Separated HTML, CSS, and JavaScript files for better maintainability

## 📚 API Documentation

### Base URL
```
http://localhost:3000/api
```

### Endpoints

#### 1. Get Tokens (Paginated)
```http
GET /api/tokens
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 30 | Page size (1-100) |
| `cursor` | string | - | Pagination cursor |
| `sortBy` | string | volume | Sort field: `volume`, `price_change`, `market_cap`, `liquidity` |
| `order` | string | desc | Sort order: `asc`, `desc` |
| `period` | string | 24h | Time period: `1h`, `24h`, `7d` |

**Example Request:**
```bash
curl "http://localhost:3000/api/tokens?limit=10&sortBy=volume&order=desc"
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "token_address": "576P1t7XsRL4ZVj38LV2eYWxXRPguBADA8BxcNz1xo8y",
        "token_name": "PIPE CTO",
        "token_ticker": "PIPE",
        "price_sol": 4.4141209798877615e-7,
        "market_cap_sol": 441.41,
        "volume_sol": 1322.43,
        "liquidity_sol": 149.36,
        "transaction_count": 2205,
        "price_24hr_change": 120.61,
        "protocol": "Raydium CLMM"
      }
    ],
    "pagination": {
      "nextCursor": "10",
      "total": 50,
      "limit": 10
    }
  },
  "timestamp": 1700000000000
}
```

#### 2. Get Token by Address
```http
GET /api/tokens/:address
```

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `address` | string | Yes | Token address (32+ characters) |

**Example Request:**
```bash
curl "http://localhost:3000/api/tokens/576P1t7XsRL4ZVj38LV2eYWxXRPguBADA8BxcNz1xo8y"
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "token_address": "576P1t7XsRL4ZVj38LV2eYWxXRPguBADA8BxcNz1xo8y",
    "token_name": "PIPE CTO",
    "token_ticker": "PIPE",
    "price_sol": 4.4141209798877615e-7,
    "market_cap_sol": 441.41,
    "volume_sol": 1322.43,
    "liquidity_sol": 149.36,
    "transaction_count": 2205,
    "price_24hr_change": 120.61,
    "protocol": "Raydium CLMM"
  },
  "timestamp": 1700000000000
}
```

#### 3. Search Tokens
```http
GET /api/search?q={query}
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | Yes | Search query (token name or ticker) |

**Example Request:**
```bash
curl "http://localhost:3000/api/search?q=PIPE"
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "token_address": "576P1t7XsRL4ZVj38LV2eYWxXRPguBADA8BxcNz1xo8y",
      "token_name": "PIPE CTO",
      "token_ticker": "PIPE",
      "price_sol": 4.4141209798877615e-7,
      "volume_sol": 1322.43,
      "liquidity_sol": 149.36
    }
  ],
  "timestamp": 1700000000000
}
```

#### 4. Health Check
```http
GET /api/health
```

**Description:** Returns server health status, uptime, and memory usage.

**Example Request:**
```bash
curl "http://localhost:3000/api/health"
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": 1700000000000,
    "uptime": 12345.67,
    "memory": {
      "rss": 50331648,
      "heapTotal": 20971520,
      "heapUsed": 15728640,
      "external": 1048576
    }
  }
}
```

---

## 🔌 WebSocket Events

### Connection
```javascript
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('✅ Connected to WebSocket server!');
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
});
```

### Events from Server

#### 1. `initial_data`
Sent immediately after connection with top tokens.

```javascript
socket.on('initial_data', (event) => {
  console.log('📦 Initial tokens:', event.data);
  // event = { type: 'initial_data', data: Array<Token>, timestamp: number }
});
```

#### 2. `tokens_updated`
Sent when any token data changes (price, volume, liquidity, etc.).

```javascript
socket.on('tokens_updated', (event) => {
  console.log('🔄 Updated tokens:', event.data);
  // event = { type: 'tokens_updated', data: Array<Token>, timestamp: number }
});
```

#### 3. `price_update`
Sent when token prices change.

```javascript
socket.on('price_update', (event) => {
  console.log('💰 Price changes:', event.data);
  // event = { 
  //   type: 'price_update', 
  //   data: Array<{
  //     token_address: string,
  //     old_price: number,
  //     new_price: number,
  //     change_percent: number
  //   }>,
  //   timestamp: number 
  // }
});
```

#### 4. `volume_spike`
Sent when volume increases significantly (>20%).

```javascript
socket.on('volume_spike', (event) => {
  console.log('📊 Volume spikes:', event.data);
  // event = { 
  //   type: 'volume_spike', 
  //   data: Array<{
  //     token_address: string,
  //     old_volume: number,
  //     new_volume: number,
  //     spike_percent: number
  //   }>,
  //   timestamp: number 
  // }
});
```

#### 5. `new_token`
Sent when a new token is discovered.

```javascript
socket.on('new_token', (event) => {
  console.log('🆕 New token:', event.data);
  // event = { type: 'new_token', data: Token, timestamp: number }
});
```

### Events to Server

#### Subscribe to Specific Tokens
Monitor specific tokens by subscribing to their addresses.

```javascript
socket.emit('subscribe', ['token_address_1', 'token_address_2']);

socket.on('subscribed', (data) => {
  console.log('✅ Subscribed to:', data.tokens);
});
```

#### Unsubscribe from Tokens
Stop monitoring specific tokens.

```javascript
socket.emit('unsubscribe', ['token_address_1']);

socket.on('unsubscribed', (data) => {
  console.log('❌ Unsubscribed from:', data.tokens);
});
```

---

## 🧪 API Testing

### Postman Collection

A comprehensive Postman collection (`postman_collection.json`) is included with **19 requests**:
- ✅ **Successful requests** return `200` status codes with data
- ✅ **Error test cases** return `400/404` status codes with error messages (expected behavior)
- ✅ Includes custom token address testing for flexible validation

**Import Instructions:**
1. Open Postman → Click "Import" → Upload `postman_collection.json`
2. Set `baseUrl` variable to `https://dexflow-realtime.onrender.com` (or `http://localhost:3000` for local)
3. Run requests to test API functionality

### Performance Testing

To demonstrate API performance with rapid calls:

```bash
# Make sure server is running first
npm run dev

# In another terminal, run performance test
node performance-test.js
```

This will make 10 rapid API calls and show:
- ✅ Individual response times for each endpoint
- ✅ Average/min/max response times
- ✅ Cache performance improvements
- ✅ Success rate

Expected results:
- First call (cache miss): ~100-300ms
- Cached calls: ~10-50ms (90%+ faster)
- Average response time: <100ms

---

## 🏗️ Architecture & Design Decisions

### 1. Caching Strategy
- **Dual-layer caching**: API responses (configurable TTL, default 30s) and aggregated results (configurable TTL, default 30s)
- **Cache key pattern**: Organized by source and type (e.g., `dexscreener:search:SOL`, `aggregated:popular`)
- **Upstash Redis**: Serverless Redis with fast in-memory caching and automatic expiration
- **Graceful degradation**: System continues working if Redis is unavailable (cache misses fallback to API)

### 2. Rate Limiting
- **Exponential backoff**: Prevents API rate limit violations with intelligent retry logic
- **Per-API limiters**: Separate rate limiters for DexScreener (300/min) and Jupiter (600/min)
- **Request queuing**: Queues requests when approaching limits to avoid "429 errors"

### 3. Real-time Updates
- **Cache-aligned polling**: WebSocket updates sync with cache refresh cycle (every 10-30s configurable)
- **Change detection**: Compares current vs previous data to identify meaningful changes
- **Smart broadcasting**: Only emits events for significant changes (price changes, volume spikes >20%)

### 4. Token Deduplication
- **Address-based matching**: Primary key is token address (case-insensitive)
- **Multi-source merging**: Combines data from DexScreener and Jupiter, preferring most complete info
- **Conflict resolution**: Uses latest/most reliable data when sources conflict

### 5. Error Handling
- **Graceful failures**: API failures don't crash the server
- **Promise.allSettled**: Parallel API calls continue even if one fails
- **Consistent error format**: All errors follow standard `{ success, error: { code, message } }` structure
- **Error logging**: Comprehensive error tracking with context

### 6. Performance Optimizations
- **Parallel API calls**: Multiple APIs fetched simultaneously using `Promise.allSettled`
- **Connection pooling**: Reuses HTTP connections via axios keep-alive
- **Cursor pagination**: Memory-efficient pagination that doesn't re-scan entire dataset
- **Selective updates**: Only broadcasts tokens that actually changed

### 7. Frontend Architecture
- **Separated concerns**: HTML, CSS, and JavaScript in separate files for maintainability
- **WebSocket integration**: Real-time updates without polling
- **Responsive design**: Works across desktop and mobile devices
- **Dark theme**: Modern UI optimized for extended viewing

## 🔒 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | development |
| `PORT` | Server port | 3000 |
| `REDIS_URL` | Upstash Redis connection URL (rediss://) | Required |
| `CACHE_TTL` | Cache TTL in seconds | 30 |
| `API_CACHE_TTL` | API cache TTL in seconds | 30 |
| `RATE_LIMIT_PER_MINUTE` | Max requests per minute | 300 |
| `WS_UPDATE_INTERVAL` | WebSocket update interval (ms) | 30000 |
| `CORS_ORIGIN` | CORS origin | * |

## 🛠️ Development Commands

```bash
# Development mode with hot reload
npm run dev

# Build TypeScript to JavaScript
npm run build

# Production mode
npm start

# Lint code
npm run lint

# Fix linting issues automatically
npm run lint:fix
```

## 🐛 Troubleshooting

### Redis Connection Issues
- **Check Upstash Dashboard**: Verify your Redis instance is active at [console.upstash.com](https://console.upstash.com)
- **Verify REDIS_URL format**: Should start with `rediss://` (note the double 's' for SSL)
- **Check credentials**: Ensure your password and host are correct
- **Network issues**: Upstash requires internet connection, verify your network

```bash
# Test connection using redis-cli (optional)
redis-cli -u your_upstash_redis_url
```

### Port Already in Use
```bash
# Find process using port 3000
netstat -ano | findstr :3000

# Kill the process (Windows)
taskkill /PID <process_id> /F
```

### TypeScript Errors
```bash
# Clean build
rm -rf dist/
npm run build
```

---

## 📝 License

This project is licensed under the MIT License.

## 👤 Author

**Raunak Sarawgi**

- GitHub: [@raunaksarawgi](https://github.com/raunaksarawgi)

---

## 🙏 Acknowledgments

- DexScreener API for comprehensive DEX data
- Jupiter Aggregator for Solana token information
- Socket.io for real-time WebSocket communication
- Redis for high-performance caching
