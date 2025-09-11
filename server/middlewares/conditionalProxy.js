const { createProxyMiddleware } = require('http-proxy-middleware');

class ConditionalProxyManager {
  constructor() {
    this.healthyProxies = new Map();
    this.healthCheckInterval = 60000; // Check every minute
    this.activeProxies = new Map();
  }

  // Check if a proxy target is reachable
  async checkProxyHealth(target, serviceName) {
    try {
      const fetch = require('node-fetch');
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
        console.warn(`⚠️ [PROXY] ${serviceName.toUpperCase()} service became unreachable: ${error.message}`);
      }
      this.healthyProxies.set(serviceName, false);
      return false;
    }
  }

  // Create conditional proxy middleware
  createConditionalProxy(serviceName, proxyConfig) {
    const proxyMiddleware = createProxyMiddleware({
      target: proxyConfig.target,
      changeOrigin: true,
      pathRewrite: proxyConfig.pathRewrite,
      timeout: 15000,
      proxyTimeout: 15000,
      ws: false, // Disable WebSocket proxying for unreliable services initially
      logLevel: 'silent',
      
      // Enhanced error handling
      onError: (err, req, res) => {
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
      },

      // Router function to conditionally proxy requests
      router: (req) => {
        const isHealthy = this.healthyProxies.get(serviceName);
        
        if (!isHealthy) {
          // Return null to skip proxying
          return null;
        }
        
        return proxyConfig.target;
      }
    });

    this.activeProxies.set(serviceName, proxyMiddleware);
    return proxyMiddleware;
  }

  // Middleware that handles requests to potentially down services
  createFallbackHandler(serviceName, proxyConfig) {
    return (req, res, next) => {
      const isHealthy = this.healthyProxies.get(serviceName);
      
      if (isHealthy === false) {
        // Service is known to be down, return error immediately
        return res.status(503).json({
          error: `${serviceName.toUpperCase()} game service is currently unavailable`,
          message: 'The game server is temporarily down. Please check back later.',
          service: serviceName,
          target: proxyConfig.target,
          lastHealthCheck: new Date().toISOString()
        });
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
  startHealthChecking(gameProxies) {
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
  getHealthStatus() {
    const status = {};
    for (const [service, isHealthy] of this.healthyProxies) {
      status[service] = {
        healthy: isHealthy,
        lastChecked: new Date().toISOString()
      };
    }
    return status;
  }
}

module.exports = ConditionalProxyManager;