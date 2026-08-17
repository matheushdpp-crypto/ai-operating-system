import fastify from 'fastify';
import cors from '@fastify/cors';
import { config, validateProductionConfig } from './config/env.js';
import { db } from './database/index.js';
import { databaseMigrator } from './database/migrator.js';
import { apiRoutes } from './routes/api.routes.js';

export async function buildApp() {
  // Validate production configuration safety
  validateProductionConfig();

  const app = fastify({
    logger: {
      level: config.platform.logLevel,
    },
  });

  // Enable CORS with environment-aware origin rules
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || config.platform.nodeEnv !== 'production') {
        cb(null, true);
        return;
      }
      if (config.auth.corsAllowedOrigins.includes(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error('CORS request blocked by security policy'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    credentials: true,
  });

  // Register API routes with prefix
  await app.register(apiRoutes, { prefix: '/api/v1' });

  // Root welcome ping
  app.get('/', async () => ({
    name: config.platform.name,
    status: 'ACTIVE',
    version: '1.0.0',
    documentation: '/api/v1/health',
    control_center: config.platform.controlCenterUrl,
  }));

  return app;
}

export async function startServer() {
  // Initialize Database Service (Postgres or In-Memory)
  await db.init();

  if (db.isPostgres) {
    const migrations = await databaseMigrator.runMigrations();
    console.log(`[DatabaseMigrator] Applied migrations: ${migrations.join(', ') || 'None (up to date)'}`);
  }

  const app = await buildApp();

  try {
    const address = await app.listen({
      port: config.platform.port,
      host: config.platform.host,
    });
    console.log(`\n🚀 [AiOS Platform] API Server listening at: ${address}`);
    console.log(`📡 Health Check: ${address}/api/v1/health`);
    console.log(`🎛️ Control Center: ${config.platform.controlCenterUrl}\n`);
    return app;
  } catch (err: any) {
    console.error('❌ Failed to start AiOS Server:', err);
    process.exit(1);
  }
}

// Start if executed directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  startServer();
}
