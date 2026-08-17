import fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config/env.js';
import { db } from './database/index.js';
import { apiRoutes } from './routes/api.routes.js';

export async function buildApp() {
  const app = fastify({
    logger: {
      level: config.platform.logLevel,
    },
  });

  // Enable CORS
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
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
