/**
 * =============================================================================
 * Translation Tests
 * =============================================================================
 * Tests for translation endpoints and services.
 * =============================================================================
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

describe('Translation', () => {
  let app: FastifyInstance;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.refreshToken.deleteMany({});
    await prisma.translation.deleteMany({});
    await prisma.subscriptionReceipt.deleteMany({});
    await prisma.user.deleteMany({});

    // Create a test user
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'translator@example.com',
        password: 'TestPassword123',
      },
    });

    const body = JSON.parse(response.body);
    accessToken = body.data.tokens.accessToken;
    userId = body.data.user.id;
  });

  describe('POST /api/translate/text', () => {
    it('should translate text successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/translate/text',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        payload: {
          text: 'Hello',
          sourceLang: 'en',
          targetLang: 'es',
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.translatedText).toBeDefined();
      expect(body.data.detectedSourceLang).toBe('en');
      expect(body.data.targetLang).toBe('es');
      expect(body.data.confidence).toBeGreaterThan(0);
    });

    it('should auto-detect source language', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/translate/text',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        payload: {
          text: 'Bonjour',
          sourceLang: 'auto',
          targetLang: 'en',
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.detectedSourceLang).toBeDefined();
    });

    it('should save translation to history', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/translate/text',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        payload: {
          text: 'Hello world',
          sourceLang: 'en',
          targetLang: 'fr',
          saveHistory: true,
        },
      });

      // Check history
      const historyResponse = await app.inject({
        method: 'GET',
        url: '/api/translate/history',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const historyBody = JSON.parse(historyResponse.body);
      expect(historyBody.data.translations.length).toBe(1);
      expect(historyBody.data.translations[0].sourceText).toBe('Hello world');
    });

    it('should not save translation when saveHistory is false', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/translate/text',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        payload: {
          text: 'Hello world',
          sourceLang: 'en',
          targetLang: 'fr',
          saveHistory: false,
        },
      });

      // Check history
      const historyResponse = await app.inject({
        method: 'GET',
        url: '/api/translate/history',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const historyBody = JSON.parse(historyResponse.body);
      expect(historyBody.data.translations.length).toBe(0);
    });

    it('should reject translation without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/translate/text',
        payload: {
          text: 'Hello',
          sourceLang: 'en',
          targetLang: 'es',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject empty text', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/translate/text',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        payload: {
          text: '',
          sourceLang: 'en',
          targetLang: 'es',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/translate/detect', () => {
    it('should detect language successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/translate/detect',
        payload: {
          text: 'Bonjour le monde',
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.language).toBeDefined();
      expect(body.data.confidence).toBeGreaterThan(0);
    });

    it('should work without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/translate/detect',
        payload: {
          text: 'Hello world',
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /api/translate/languages', () => {
    it('should return list of supported languages', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/translate/languages',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.languages).toBeInstanceOf(Array);
      expect(body.data.languages.length).toBeGreaterThan(0);

      // Check language structure
      const lang = body.data.languages[0];
      expect(lang.code).toBeDefined();
      expect(lang.name).toBeDefined();
      expect(lang.nativeName).toBeDefined();
    });
  });

  describe('GET /api/translate/history', () => {
    beforeEach(async () => {
      // Create some translations
      for (let i = 0; i < 5; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/translate/text',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          payload: {
            text: `Hello ${i}`,
            sourceLang: 'en',
            targetLang: 'es',
          },
        });
      }
    });

    it('should return translation history', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/translate/history',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.data.translations.length).toBe(5);
      expect(body.data.pagination.total).toBe(5);
    });

    it('should support pagination', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/translate/history?page=1&limit=2',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.data.translations.length).toBe(2);
      expect(body.data.pagination.hasMore).toBe(true);
    });
  });

  describe('DELETE /api/translate/history/:id', () => {
    it('should delete a translation from history', async () => {
      // Create a translation
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/translate/text',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        payload: {
          text: 'To be deleted',
          sourceLang: 'en',
          targetLang: 'es',
        },
      });

      const createBody = JSON.parse(createResponse.body);
      const translationId = createBody.data.translationId;

      // Delete it
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/translate/history/${translationId}`,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      expect(deleteResponse.statusCode).toBe(200);

      // Verify it's gone
      const historyResponse = await app.inject({
        method: 'GET',
        url: '/api/translate/history',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const historyBody = JSON.parse(historyResponse.body);
      expect(historyBody.data.translations.length).toBe(0);
    });
  });
});
