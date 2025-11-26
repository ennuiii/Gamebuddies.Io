import express, { Application, Request, Response, NextFunction } from 'express';
import path from 'path';

interface GameStaticConfig {
  name: string;
  route: string;
  buildPath: string;
}

// Game build configurations
const gameConfigs: GameStaticConfig[] = [
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

// Base directory - use process.cwd() for consistent paths regardless of dist structure
const PROJECT_ROOT = process.cwd();
const SERVER_ROOT = path.join(PROJECT_ROOT, 'server');

/**
 * Setup core static file serving routes
 * Must be called early in app setup
 */
export function setupCoreStaticRoutes(app: Application): void {
  // Serve static files from React build
  // Note: Socket.IO handles /socket.io paths before Express when properly configured
  app.use(express.static(path.join(PROJECT_ROOT, 'client/build')));

  // Serve static avatars
  app.use('/avatars', express.static(path.join(SERVER_ROOT, 'public/avatars')));

  // Serve screenshots
  app.use('/screenshots', express.static(path.join(SERVER_ROOT, 'screenshots')));

  // Normalize direct deep links to DDF routes so they load via home
  app.get(
    ['/ddf/game', '/ddf/game/*', '/ddf/lobby', '/ddf/lobby/*'],
    (req: Request, res: Response) => {
      res.redirect(302, '/ddf/');
    }
  );
}

/**
 * Setup game-specific static routes
 * Should be called after proxies are set up
 */
export function setupGameStaticRoutes(app: Application): void {
  for (const config of gameConfigs) {
    const buildPath = path.join(PROJECT_ROOT, config.buildPath.replace(/^\.\.\/\.\.\//, ''));

    try {
      // Serve static files
      app.use(config.route, express.static(buildPath));

      // SPA fallback for client-side routing
      app.get(`${config.route}/*`, (req: Request, res: Response) => {
        res.sendFile(path.join(buildPath, 'index.html'));
      });

      console.log(`✅ ${config.name} routes configured`);
    } catch (err) {
      console.warn(
        `⚠️  ${config.name} build not found, will use proxy fallback:`,
        (err as Error).message
      );
    }
  }
}

/**
 * Setup catch-all route for SPA
 * MUST be called LAST, after all other routes and proxies
 */
export function setupCatchAllRoute(app: Application): void {
  // Catch-all for client-side routing (SPA)
  // Note: Socket.IO handles /socket.io before this when properly configured
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(PROJECT_ROOT, 'client/build/index.html'));
  });
  console.log('✅ Catch-all route registered (after game routes & proxies)');
}
