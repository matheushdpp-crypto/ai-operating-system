import dotenv from 'dotenv';

// Load .env from root if available
dotenv.config();

export const config = {
  platform: {
    name: process.env.PLATFORM_NAME || 'AiOS Enterprise',
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.API_PORT || '3000', 10),
    host: process.env.API_HOST || '0.0.0.0',
    baseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
    controlCenterUrl: process.env.CONTROL_CENTER_URL || 'http://localhost:8080',
    logLevel: process.env.LOG_LEVEL || 'info',
  },
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    user: process.env.DATABASE_USER || 'aios_admin',
    password: process.env.DATABASE_PASSWORD || 'aios_secure_password_change_me',
    database: process.env.DATABASE_NAME || 'aios_platform',
    ssl: process.env.DATABASE_SSL === 'true',
    url: process.env.DATABASE_URL,
  },
  n8n: {
    baseUrl: process.env.N8N_BASE_URL || 'http://localhost:5678',
    webhookUrl: process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook',
    apiKey: process.env.N8N_API_KEY || '',
  },
  ai: {
    defaultProvider: process.env.AI_DEFAULT_PROVIDER || 'openai',
    defaultModel: process.env.AI_DEFAULT_MODEL || 'gpt-4o-mini',
    embeddingModel: process.env.AI_EMBEDDING_MODEL || 'text-embedding-3-small',
    embeddingDimensions: parseInt(process.env.AI_EMBEDDING_DIMENSIONS || '1536', 10),
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    hermesApiUrl: process.env.HERMES_API_URL || '',
    hermesApiKey: process.env.HERMES_API_KEY || '',
    openclawApiUrl: process.env.OPENCLAW_API_URL || '',
    openclawApiKey: process.env.OPENCLAW_API_KEY || '',
  },
  storage: {
    provider: process.env.STORAGE_PROVIDER || 'local',
    localPath: process.env.STORAGE_LOCAL_PATH || './storage_data',
    endpoint: process.env.STORAGE_ENDPOINT || 'localhost',
    port: parseInt(process.env.STORAGE_PORT || '9000', 10),
    useSSL: process.env.STORAGE_USE_SSL === 'true',
    accessKey: process.env.STORAGE_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.STORAGE_SECRET_KEY || 'minioadmin_secure_key',
    bucket: process.env.STORAGE_BUCKET || 'aios-documents',
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'aios_jwt_default_secret_key_change_in_prod',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    corsOrigin: process.env.CORS_ORIGIN || '*',
    corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS ? process.env.CORS_ALLOWED_ORIGINS.split(',') : ['http://localhost:8080', 'http://localhost:3000', 'http://127.0.0.1:8080'],
  },
};

/**
 * Enforces production security checks to prevent deployment with default insecure secrets
 */
export function validateProductionConfig() {
  if (config.platform.nodeEnv === 'production') {
    const insecurePatterns = ['change_me', 'change_in_prod', 'minioadmin', 'default_secret'];
    const errors: string[] = [];

    if (insecurePatterns.some((p) => config.database.password.includes(p))) {
      errors.push('DATABASE_PASSWORD contains default/insecure placeholder.');
    }
    if (insecurePatterns.some((p) => config.auth.jwtSecret.includes(p)) || config.auth.jwtSecret.length < 32) {
      errors.push('JWT_SECRET is using default value or is shorter than 32 characters.');
    }
    if (config.auth.corsOrigin === '*') {
      errors.push('CORS_ORIGIN cannot be "*" in production. Specify exact domains in CORS_ALLOWED_ORIGINS.');
    }

    if (errors.length > 0) {
      console.error('\n❌ [CRITICAL SECURITY ERROR] Production startup blocked due to insecure configurations:');
      for (const err of errors) {
        console.error(`   - ${err}`);
      }
      console.error('\nRun "node scripts/generate-secrets.js" to generate secure production secrets.\n');
      throw new Error(`Production configuration validation failed: ${errors.join(', ')}`);
    }
  }
}
