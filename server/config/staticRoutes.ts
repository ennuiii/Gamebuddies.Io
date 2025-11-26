import express, { Application, Request, Response } from 'express';
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

/**
 * Setup core static file serving routes
 * Must be called early in app setup
 */
export function setupCoreStaticRoutes(app: Application): void {
  // Serve static files from React build
  app.use(express.static(path.join(__dirname, '../../client/build')));

  // Serve static avatars
  app.use('/avatars', express.static(path.join(__dirname, '../public/avatars')));

  // Serve screenshots
  app.use('/screenshots', express.static(path.join(__dirname, '../screenshots')));

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
    const buildPath = path.join(__dirname, '..', config.buildPath);

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
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../../client/build/index.html'));
  });
  console.log('✅ Catch-all route registered (after game routes & proxies)');
}
