import { RequestHandler } from 'express';
interface ProxyConfig {
    target: string;
    pathRewrite?: Record<string, string>;
}
interface HealthStatus {
    healthy: boolean;
    lastChecked: string;
}
declare class ConditionalProxyManager {
    private healthyProxies;
    private healthCheckInterval;
    private activeProxies;
    constructor();
    checkProxyHealth(target: string, serviceName: string): Promise<boolean>;
    createConditionalProxy(serviceName: string, proxyConfig: ProxyConfig): RequestHandler;
    createFallbackHandler(serviceName: string, proxyConfig: ProxyConfig): RequestHandler;
    startHealthChecking(gameProxies: Record<string, ProxyConfig>): void;
    getHealthStatus(): Record<string, HealthStatus>;
}
export default ConditionalProxyManager;
//# sourceMappingURL=conditionalProxy.d.ts.map