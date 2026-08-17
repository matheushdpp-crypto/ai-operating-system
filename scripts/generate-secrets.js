import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

function generateSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

console.log('==================================================');
console.log('🔑 AiOS Production Secret Generator');
console.log('==================================================\n');

const secrets = {
  JWT_SECRET: generateSecret(32),
  DATABASE_PASSWORD: generateSecret(24),
  N8N_ENCRYPTION_KEY: generateSecret(24),
  STORAGE_SECRET_KEY: generateSecret(24),
  STORAGE_ACCESS_KEY: 'aios_storage_admin',
};

console.log('Generated Cryptographically Secure Secrets:\n');
for (const [k, v] of Object.entries(secrets)) {
  console.log(`${k}=${v}`);
}

console.log('\nCopy these values into your .env file before starting in production mode.\n');
