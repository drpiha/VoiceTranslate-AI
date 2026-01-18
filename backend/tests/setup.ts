/**
 * Test Setup - Global test configuration
 */
import { beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { prisma } from '../src/lib/prisma.js';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test.db';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-characters-long';
process.env.ENCRYPTION_KEY = 'test-encryption-key-at-least-32-characters';
process.env.USE_MOCK_AI_SERVICES = 'true';

beforeAll(async () => {
  console.log('Setting up test database...');
  try {
    execSync('npx prisma db push --force-reset --skip-generate', {
      env: { ...process.env, DATABASE_URL: 'file:./test.db' },
      stdio: 'pipe',
    });
    console.log('Test database ready');
  } catch (e) {
    console.error('DB setup failed:', e);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
  console.log('Test cleanup complete');
});
