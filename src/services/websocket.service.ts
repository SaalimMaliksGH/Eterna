import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { aggregatorService } from './aggregator.service';
import { Logger } from '../utils/logger';
import { Token, WebSocketEvent, PriceUpdateEvent, VolumeSpike } from '../types';
import { config } from '../config';

export class WebSocketService {
  private io: SocketIOServer;
  private previousTokenData: Map<string, Token> = new Map();
  private updateInterval?: NodeJS.Timeout;
  private isRunning: boolean = false;
  private updateCount: number = 0;

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: config.server.corsOrigin,
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.setupSocketHandlers();
    this.startRealtimeUpdates();
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      Logger.info('Client connected', { socketId: socket.id });

      // Send initial data on connection
      this.sendInitialData(socket.id);

      // Handle subscription to specific tokens
      socket.on('subscribe', (tokenAddresses: string[]) => {
        Logger.debug('Client subscribing to tokens', { 
          socketId: socket.id, 
          tokens: tokenAddresses 
        });
        
        tokenAddresses.forEach((address) => {
          socket.join(`token:${address}`);
        });

        socket.emit('subscribed', { tokens: tokenAddresses });
      });

      // Handle unsubscribe
      socket.on('unsubscribe', (tokenAddresses: string[]) => {
        Logger.debug('Client unsubscribing from tokens', { 
          socketId: socket.id, 
          tokens: tokenAddresses 
        });
        
        tokenAddresses.forEach((address) => {
          socket.leave(`token:${address}`);
        });

        socket.emit('unsubscribed', { tokens: tokenAddresses });
      });

      // Handle disconnect
      socket.on('disconnect', (reason) => {
        Logger.info('Client disconnected', { 
          socketId: socket.id, 
          reason 
        });
      });

      // Handle errors
      socket.on('error', (error) => {
        Logger.error('Socket error', { 
          socketId: socket.id, 
          error 
        });
      });
    });
  }

  private async sendInitialData(socketId: string): Promise<void> {
    try {
      const tokens = await aggregatorService.getFilteredTokens({
        limit: 30,
        sortBy: 'volume',
        order: 'desc',
      });

      this.io.to(socketId).emit('initial_data', {
        type: 'initial_data',
        data: tokens.data,
        timestamp: Date.now(),
      });

      Logger.debug('Initial data sent', { socketId, tokenCount: tokens.data.length });
    } catch (error) {
      Logger.error('Error sending initial data', { socketId, error });
    }
  }

  private startRealtimeUpdates(): void {
    // Use the cache TTL (30s) as update interval to match cache refresh cycle
    // This ensures we only broadcast when fresh data arrives from APIs
    const updateInterval = config.cache.ttl * 1000; // Convert seconds to milliseconds
    
    this.isRunning = true;
    
    // Immediate first fetch
    this.fetchAndBroadcastUpdates();
    
    // Then poll at cache TTL interval (30s by default)
    // This aligns with the Redis cache expiry and upstream API refresh
    this.updateInterval = setInterval(async () => {
      if (this.isRunning) {
        await this.fetchAndBroadcastUpdates();
      }
    }, updateInterval);

    Logger.info('Real-time streaming started', { 
      updateInterval: `${config.cache.ttl}s`,
      strategy: 'cache-aligned',
      description: 'Updates broadcast when cache refreshes from upstream APIs'
    });
  }

  private async fetchAndBroadcastUpdates(): Promise<void> {
    try {
      this.updateCount++;
      
      // Fetch latest token data
      const tokens = await aggregatorService.getFilteredTokens({
        limit: 50,
        sortBy: 'volume',
        order: 'desc',
      });

      const currentTokens = tokens.data;
      const updates: Token[] = [];
      const priceUpdates: PriceUpdateEvent[] = [];
      const volumeSpikes: VolumeSpike[] = [];
      let hasChanges = false;

      for (const currentToken of currentTokens) {
        // Skip tokens without valid addresses
        if (!currentToken.token_address || typeof currentToken.token_address !== 'string') {
          continue;
        }

        const previous = this.previousTokenData.get(currentToken.token_address);

        if (!previous) {
          // New token discovered - store a deep copy
          updates.push(currentToken);
          this.emitEvent('new_token', currentToken);
          hasChanges = true;
          this.previousTokenData.set(currentToken.token_address, { ...currentToken });
          continue;
        }

        // Check for ANY price changes (instant detection, no threshold)
        // Use Number comparison to handle floating point precision
        const priceDiff = Math.abs(currentToken.price_sol - previous.price_sol);
        const hasMinimalPriceChange = priceDiff > 0.000000001; // Tiny threshold for floating point
        
        if (hasMinimalPriceChange) {
          const priceChange = ((currentToken.price_sol - previous.price_sol) / previous.price_sol) * 100;
          
          const priceUpdate: PriceUpdateEvent = {
            token_address: currentToken.token_address,
            old_price: previous.price_sol,
            new_price: currentToken.price_sol,
            change_percent: priceChange,
          };
          priceUpdates.push(priceUpdate);
          updates.push(currentToken);
          hasChanges = true;
        }

        // Check for volume changes (any change)
        const volumeDiff = Math.abs(currentToken.volume_sol - previous.volume_sol);
        const hasMinimalVolumeChange = volumeDiff > 0.000001; // Tiny threshold for floating point
        
        if (hasMinimalVolumeChange) {
          const volumeChange = ((currentToken.volume_sol - previous.volume_sol) / previous.volume_sol) * 100;

          // Only emit spike event if > 20% increase (but still track all changes)
          if (volumeChange > 20) {
            const volumeSpike: VolumeSpike = {
              token_address: currentToken.token_address,
              old_volume: previous.volume_sol,
              new_volume: currentToken.volume_sol,
              spike_percent: volumeChange,
            };
            volumeSpikes.push(volumeSpike);
            hasChanges = true;
          }
          
          if (!updates.includes(currentToken)) {
            updates.push(currentToken);
          }
        }

        // Always update previous data with current snapshot (deep copy to avoid reference issues)
        this.previousTokenData.set(currentToken.token_address, { ...currentToken });
      }

      // Emit updates when significant changes are detected
      if (updates.length > 0) {
        this.emitEvent('tokens_updated', updates);
        Logger.info('Broadcasting token updates', { 
          count: updates.length,
          priceChanges: priceUpdates.length,
          volumeSpikes: volumeSpikes.length
        });
      }

      if (priceUpdates.length > 0) {
        this.emitEvent('price_update', priceUpdates);
        Logger.debug('Price changes detected', { count: priceUpdates.length });
      }

      if (volumeSpikes.length > 0) {
        this.emitEvent('volume_spike', volumeSpikes);
        Logger.debug('Volume spikes detected', { count: volumeSpikes.length });
      }

    } catch (error) {
      Logger.error('Error in real-time fetch', { error });
    }
  }

  private emitEvent(type: WebSocketEvent['type'], data: unknown): void {
    const event: WebSocketEvent = {
      type,
      data,
      timestamp: Date.now(),
    };

    this.io.emit(type, event);
  }

  getConnectedClients(): number {
    return this.io.engine.clientsCount;
  }

  stop(): void {
    this.isRunning = false;
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      Logger.info('Real-time streaming stopped', { 
        totalUpdates: this.updateCount,
        updateIntervalSeconds: config.cache.ttl
      });
    }

    this.io.close();
    Logger.info('WebSocket server closed');
  }
}
