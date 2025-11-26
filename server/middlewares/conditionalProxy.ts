import { createProxyMiddleware, Options as ProxyOptions } from 'http-proxy-middleware';
import { Request, Response, NextFunction, RequestHandler } from 'express';

interface ProxyConfig {
  target: string;
  pathRewrite?: Record<string, string>;
}

interface HealthStatus {
  healthy: boolean;
  lastChecked: string;
}

class ConditionalProxyManager {
  private healthyProxies: Map<string, boolean>;
  private healthCheckInterval: number;
  private activeProxies: Map<string, RequestHandler>;

  constructor() {
    this.healthyProxies = new Map();
    this.healthCheckInterval = 60000; // Check every minute
    this.activeProxies = new Map();
  }

  // Check if a proxy target is reachable
  async checkProxyHealth(target: string, serviceName: string): Promise<boolean> {
    try {
      // Use global fetch (Node 18+ has built-in fetch)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(target + '/health', {
        method: 'HEAD',
        signal: controller.signal,
        headers: { 'User-Agent': 'GameBuddies-HealthCheck' }
      });

      clearTimeout(timeout);
      const isHealthy = response.ok;

      if (isHealthy !== this.healthyProxies.get(serviceName)) {
        console.log(`🔄 [PROXY] ${serviceName.toUpperCase()} service status changed: ${isHealthy ? 'healthy' : 'unhealthy'}`);
      }

      this.healthyProxies.set(serviceName, isHealthy);
      return isHealthy;

    } catch (error) {
      const wasHealthy = this.healthyProxies.get(serviceName);
      if (wasHealthy) {
        console.warn(`⚠️ [PROXY] ${serviceName.toUpperCase()} service became unreachable: ${(error as Error).message}`);
      }
      this.healthyProxies.set(serviceName, false);
      return false;
    }
  }

  // Create conditional proxy middleware
  createConditionalProxy(serviceName: string, proxyConfig: ProxyConfig): RequestHandler {
    const proxyMiddleware = createProxyMiddleware({
      target: proxyConfig.target,
      changeOrigin: true,
      pathRewrite: proxyConfig.pathRewrite,
      ws: false, // Disable WebSocket proxying for unreliable services initially

      // Enhanced error handling
      on: {
        error: (err: Error, req: Request, res: Response) => {
          console.error(`❌ [PROXY] ${serviceName.toUpperCase()} error: ${err.message}`);

          // Mark service as unhealthy
          this.healthyProxies.set(serviceName, false);

          if (!res.headersSent) {
            res.status(502).json({
              error: `${serviceName.toUpperCase()} game service is temporarily unavailable`,
              message: 'The game server may be starting up or temporarily down. Please try again in a few moments.',
              service: serviceName,
              timestamp: new Date().toISOString()
            });
          }
        }
      },

      // Router function to conditionally proxy requests
      router: () => {
        const isHealthy = this.healthyProxies.get(serviceName);

        if (!isHealthy) {
          // Return null to skip proxying
          return null;
        }

        return proxyConfig.target;
      }
    } as ProxyOptions);

    this.activeProxies.set(serviceName, proxyMiddleware);
    return proxyMiddleware;
  }

  // Middleware that handles requests to potentially down services
  createFallbackHandler(serviceName: string, proxyConfig: ProxyConfig): RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void => {
      const isHealthy = this.healthyProxies.get(serviceName);

      if (isHealthy === false) {
        // Service is known to be down, return error immediately
        res.status(503).json({
          error: `${serviceName.toUpperCase()} game service is currently unavailable`,
          message: 'The game server is temporarily down. Please check back later.',
          service: serviceName,
          target: proxyConfig.target,
          lastHealthCheck: new Date().toISOString()
        });
        return;
      }

      // Service status unknown or healthy, proceed with proxy
      const proxy = this.activeProxies.get(serviceName);
      if (proxy) {
        proxy(req, res, next);
      } else {
        next();
      }
    };
  }

  // Start periodic health checking
  startHealthChecking(gameProxies: Record<string, ProxyConfig>): void {
    // Initial health check
    Object.entries(gameProxies).forEach(async ([serviceName, proxyConfig]) => {
      const isHealthy = await this.checkProxyHealth(proxyConfig.target, serviceName);
      console.log(`🏥 [PROXY] ${serviceName.toUpperCase()} initial health: ${isHealthy ? 'healthy' : 'unhealthy'}`);
    });

    // Periodic health checks
    setInterval(async () => {
      for (const [serviceName, proxyConfig] of Object.entries(gameProxies)) {
        await this.checkProxyHealth(proxyConfig.target, serviceName);
      }
    }, this.healthCheckInterval);
  }

  // Get health status of all services
  getHealthStatus(): Record<string, HealthStatus> {
    const status: Record<string, HealthStatus> = {};
    for (const [service, isHealthy] of this.healthyProxies) {
      status[service] = {
        healthy: isHealthy,
        lastChecked: new Date().toISOString()
      };
    }
    return status;
  }
}

export default ConditionalProxyManager;
