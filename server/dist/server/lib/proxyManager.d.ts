import { Application } from 'express';
import { Server as HttpServer } from 'http';
interface ProxyConfig {
    path: string;
    target: string;
    pathRewrite: Record<string, string>;
    ws: boolean;
}
declare class ProxyManager {
    private _gameProxies;
    private proxyInstances;
    constructor();
    /**
     * Get the game proxy configurations
     */
    get gameProxies(): Record<string, ProxyConfig>;
    loadGameProxiesFromDatabase(): Promise<Record<string, ProxyConfig>>;
    setupGameProxies(app: Application, server: HttpServer): Promise<void>;
}
export default ProxyManager;
//# sourceMappingURL=proxyManager.d.ts.map