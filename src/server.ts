import express, { Application } from 'express';
import { createServer, Server as HTTPServer } from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { config } from './config';
import routes from './controllers/routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { WebSocketService } from './services/websocket.service';
import { cacheService } from './services/cache.service';
import { Logger } from './utils/logger';

// Load environment variables
dotenv.config();

class Server {
  private app: Application;
  private httpServer: HTTPServer;
  private wsService?: WebSocketService;

  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // CORS
    this.app.use(cors({
      origin: config.server.corsOrigin,
      credentials: true,
    }));

    // Serve static files (test-client.html)
    this.app.use(express.static('.'));

    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, _res, next) => {
      Logger.info('Incoming request', {
        method: req.method,
        path: req.path,
        query: req.query,
      });
      next();
    });

    // Performance monitoring
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        Logger.debug('Request completed', {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration: `${duration}ms`,
        });
      });
      next();
    });
  }

  private setupRoutes(): void {
    // API routes
    this.app.use('/api', routes);

    // Root endpoint - redirect to test client for demo
    this.app.get('/', (_req, res) => {
      res.redirect('/demo/test-client.html');
    });

    // API info endpoint
    this.app.get('/api', (_req, res) => {
      res.json({
        success: true,
        message: 'Real-time DEX Aggregator API',
        version: '1.0.0',
        endpoints: {
          health: '/api/health',
          tokens: '/api/tokens',
          token: '/api/tokens/:address',
          search: '/api/search?q=:query',
        },
        testClient: '/demo/test-client.html',
        documentation: 'See README.md for full API documentation',
        timestamp: Date.now(),
      });
    });
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);
  }

  private async checkRedisConnection(): Promise<boolean> {
    try {
      const isConnected = cacheService.getConnectionStatus();
      if (isConnected) {
        Logger.info('Redis connection established');
        return true;
      }
      
      Logger.warn('Redis not connected, waiting...');
      // Wait a bit and check again
      await new Promise(resolve => setTimeout(resolve, 2000));
      return cacheService.getConnectionStatus();
    } catch (error) {
      Logger.error('Redis connection check failed', { error });
      return false;
    }
  }

  async start(): Promise<void> {
    try {
      // Log Redis configuration (without password)
      const redisUrl = process.env.REDIS_URL;
      let redisInfo: string;
      
      if (redisUrl) {
        // Hide password in URL for logging
        redisInfo = redisUrl.replace(/:([^:@]+)@/, ':****@');
      } else {
        redisInfo = `${config.redis.host}:${config.redis.port}`;
      }
      
      Logger.info('Starting server with Redis configuration', { 
        redis: redisInfo,
        nodeEnv: config.server.nodeEnv,
        redisUrlProvided: !!redisUrl,
      });

      // Validate Redis URL format if provided
      if (redisUrl && !redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://')) {
        Logger.error('Invalid REDIS_URL format', {
          format: 'Must start with redis:// or rediss://',
          example: 'rediss://default:password@host.upstash.io:6379',
          provided: redisUrl.substring(0, 20) + '...',
        });
      }

      // Check Redis connection
      const redisConnected = await this.checkRedisConnection();
      if (!redisConnected) {
        Logger.error('❌ REDIS CONNECTION FAILED - This is a CRITICAL issue!');
        Logger.error('Redis is MANDATORY for this project. App functionality will be degraded.');
        Logger.error('Setup instructions:');
        Logger.error('1. Go to https://upstash.com/ and create a free Redis database');
        Logger.error('2. Copy the connection URL (starts with rediss://)');
        Logger.error('3. In Render dashboard → Environment → Add variable:');
        Logger.error('   REDIS_URL=rediss://default:YOUR_PASSWORD@YOUR_ENDPOINT.upstash.io:6379');
        Logger.error('4. Save and redeploy');
        Logger.error('Full guide: See DEPLOYMENT.md in the repository');
      }

      // Initialize WebSocket service
      this.wsService = new WebSocketService(this.httpServer);
      Logger.info('WebSocket service initialized');

      // Start HTTP server
      this.httpServer.listen(config.server.port, () => {
        Logger.info('Server started successfully', {
          port: config.server.port,
          environment: config.server.nodeEnv,
          redis: redisConnected ? 'connected' : 'disconnected',
        });
        
        console.log('\n🚀 Server is running!');
        console.log(`📡 HTTP Server: http://localhost:${config.server.port}`);
        console.log(`🔌 WebSocket: ws://localhost:${config.server.port}`);
        console.log(`📚 API Documentation: http://localhost:${config.server.port}/`);
        console.log('\nPress CTRL+C to stop\n');
      });

      // Graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      Logger.error('Failed to start server', { error });
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      Logger.info(`${signal} received, shutting down gracefully...`);

      // Stop accepting new connections
      this.httpServer.close(() => {
        Logger.info('HTTP server closed');
      });

      // Stop WebSocket service
      if (this.wsService) {
        this.wsService.stop();
      }

      // Close Redis connection
      try {
        await cacheService.disconnect();
        Logger.info('Redis connection closed');
      } catch (error) {
        Logger.error('Error closing Redis connection', { error });
      }

      Logger.info('Shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      Logger.error('Uncaught exception', { error });
      shutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason) => {
      Logger.error('Unhandled rejection', { reason });
      shutdown('UNHANDLED_REJECTION');
    });
  }
}

// Start server
const server = new Server();
server.start();

export default server;
