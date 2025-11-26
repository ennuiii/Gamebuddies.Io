"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupCoreStaticRoutes = setupCoreStaticRoutes;
exports.setupGameStaticRoutes = setupGameStaticRoutes;
exports.setupCatchAllRoute = setupCatchAllRoute;
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
// Game build configurations
const gameConfigs = [
    {
        name: 'DDF',
        route: '/ddf',
        buildPath: '../../DDF/client/dist',
    },
    {
        name: 'BingoBuddies',
        route: '/bingo',
        buildPath: '../../BingoBuddies/client/dist',
    },
    {
        name: 'SUSD',
        route: '/susd',
        buildPath: '../../SUSD/dist',
    },
    {
        name: 'ClueScale',
        route: '/cluescale',
        buildPath: '../../ClueScale/client/dist',
    },
    {
        name: 'ThinkAlike',
        route: '/thinkalike',
        buildPath: '../../ThinkAlike/client/dist',
    },
];
/**
 * Setup core static file serving routes
 * Must be called early in app setup
 */
function setupCoreStaticRoutes(app) {
    // Serve static files from React build
    app.use(express_1.default.static(path_1.default.join(__dirname, '../../client/build')));
    // Serve static avatars
    app.use('/avatars', express_1.default.static(path_1.default.join(__dirname, '../public/avatars')));
    // Serve screenshots
    app.use('/screenshots', express_1.default.static(path_1.default.join(__dirname, '../screenshots')));
    // Normalize direct deep links to DDF routes so they load via home
    app.get(['/ddf/game', '/ddf/game/*', '/ddf/lobby', '/ddf/lobby/*'], (req, res) => {
        res.redirect(302, '/ddf/');
    });
}
/**
 * Setup game-specific static routes
 * Should be called after proxies are set up
 */
function setupGameStaticRoutes(app) {
    for (const config of gameConfigs) {
        const buildPath = path_1.default.join(__dirname, '..', config.buildPath);
        try {
            // Serve static files
            app.use(config.route, express_1.default.static(buildPath));
            // SPA fallback for client-side routing
            app.get(`${config.route}/*`, (req, res) => {
                res.sendFile(path_1.default.join(buildPath, 'index.html'));
            });
            console.log(`✅ ${config.name} routes configured`);
        }
        catch (err) {
            console.warn(`⚠️  ${config.name} build not found, will use proxy fallback:`, err.message);
        }
    }
}
/**
 * Setup catch-all route for SPA
 * MUST be called LAST, after all other routes and proxies
 */
function setupCatchAllRoute(app) {
    app.get('*', (req, res) => {
        res.sendFile(path_1.default.join(__dirname, '../../client/build/index.html'));
    });
    console.log('✅ Catch-all route registered (after game routes & proxies)');
}
//# sourceMappingURL=staticRoutes.js.map