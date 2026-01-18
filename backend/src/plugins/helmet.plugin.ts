/**
 * =============================================================================
 * Helmet Security Plugin
 * =============================================================================
 * Configures security headers using @fastify/helmet.
 * Protects against common web vulnerabilities.
 * =============================================================================
 */

import { FastifyInstance } from 'fastify';
import fastifyHelmet from '@fastify/helmet';
import { isProduction, corsOrigins } from '../config/env.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('helmet-plugin');

/**
 * Register Helmet security plugin with comprehensive security headers.
 */
export async function registerHelmetPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fastifyHelmet, {
    /**
     * Content Security Policy (CSP)
     * Prevents XSS attacks by controlling what resources can be loaded.
     */
    contentSecurityPolicy: isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", ...corsOrigins],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: [],
          },
        }
      : false, // Disable in development for easier debugging

    /**
     * Cross-Origin-Embedder-Policy
     * Prevents document from loading cross-origin resources that don't
     * explicitly grant permission.
     */
    crossOriginEmbedderPolicy: isProduction,

    /**
     * Cross-Origin-Opener-Policy
     * Isolates browsing context to prevent cross-origin attacks.
     */
    crossOriginOpenerPolicy: isProduction ? { policy: 'same-origin' } : false,

    /**
     * Cross-Origin-Resource-Policy
     * Blocks cross-origin reading of resources.
     */
    crossOriginResourcePolicy: isProduction ? { policy: 'same-origin' } : false,

    /**
     * DNS Prefetch Control
     * Controls browser DNS prefetching behavior.
     */
    dnsPrefetchControl: { allow: false },

    /**
     * Expect-CT
     * Enforces Certificate Transparency.
     * Deprecated but still supported by some browsers.
     */
    // expectCt: false, // Deprecated

    /**
     * Frameguard (X-Frame-Options)
     * Prevents clickjacking by controlling if page can be embedded.
     */
    frameguard: { action: 'deny' },

    /**
     * Hide Powered By
     * Removes X-Powered-By header to prevent server fingerprinting.
     */
    hidePoweredBy: true,

    /**
     * HSTS (HTTP Strict Transport Security)
     * Forces browsers to use HTTPS.
     */
    hsts: isProduction
      ? {
          maxAge: 31536000, // 1 year
          includeSubDomains: true,
          preload: true,
        }
      : false,

    /**
     * IE No Open
     * Prevents IE from executing downloads in site's context.
     */
    ieNoOpen: true,

    /**
     * No Sniff (X-Content-Type-Options)
     * Prevents browsers from MIME-sniffing response.
     */
    noSniff: true,

    /**
     * Origin Agent Cluster
     * Provides isolation for the origin.
     */
    originAgentCluster: true,

    /**
     * Permitted Cross-Domain Policies
     * Controls Adobe Flash/Acrobat cross-domain requests.
     */
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },

    /**
     * Referrer Policy
     * Controls how much referrer information is sent.
     */
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

    /**
     * XSS Filter (X-XSS-Protection)
     * Legacy XSS protection header.
     * Set to 0 as CSP is more effective and this can cause issues.
     */
    xssFilter: true,
  });

  logger.info('Helmet security plugin registered', {
    isProduction,
    cspEnabled: isProduction,
    hstsEnabled: isProduction,
  });
}

/**
 * Additional security headers not covered by Helmet.
 * Apply these as a hook.
 */
export function additionalSecurityHeaders(fastify: FastifyInstance): void {
  fastify.addHook('onSend', async (_request, reply, _payload) => {
    // Prevent caching of sensitive responses
    if (!reply.hasHeader('Cache-Control')) {
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      reply.header('Pragma', 'no-cache');
      reply.header('Expires', '0');
    }

    // Additional security headers
    reply.header('X-Download-Options', 'noopen');
    reply.header('X-Permitted-Cross-Domain-Policies', 'none');

    return _payload;
  });

  logger.info('Additional security headers configured');
}
