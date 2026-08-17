import dotenv from 'dotenv';
import path from 'path';

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
    hermesApiUrl: process.env.HERMES_API_URL || 'http://localhost:8000',
    hermesApiKey: process.env.HERMES_API_KEY || '',
    openclawApiUrl: process.env.OPENCLAW_API_URL || 'http://localhost:8001',
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
  },
};
