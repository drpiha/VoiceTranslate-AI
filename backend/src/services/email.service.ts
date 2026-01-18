/**
 * =============================================================================
 * Email Service
 * =============================================================================
 * Handles email sending using Resend API.
 * Provides templates for verification, welcome, and password reset emails.
 * =============================================================================
 */

import { env } from '../config/env.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('email-service');

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

class EmailService {
  private apiKey: string | undefined;
  private from: string;
  private appUrl: string;
  private useMock: boolean;

  constructor() {
    this.apiKey = env.RESEND_API_KEY;
    this.from = env.EMAIL_FROM;
    this.appUrl = env.APP_URL;
    this.useMock = !this.apiKey;

    if (this.useMock) {
      logger.warn('Email service running in mock mode - no emails will be sent');
    } else {
      logger.info('Email service initialized with Resend');
    }
  }

  /**
   * Send an email using Resend API
   */
  async sendEmail(options: SendEmailOptions): Promise<EmailResult> {
    if (this.useMock) {
      logger.info('Mock email sent', {
        to: options.to,
        subject: options.subject,
      });
      return { success: true, messageId: 'mock-' + Date.now() };
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
        }),
      });

      const data = await response.json() as { id?: string; message?: string };

      if (!response.ok) {
        logger.error('Email send failed', { error: data });
        return { success: false, error: data.message || 'Failed to send email' };
      }

      logger.info('Email sent successfully', {
        to: options.to,
        subject: options.subject,
        messageId: data.id,
      });

      return { success: true, messageId: data.id };
    } catch (error: any) {
      logger.error('Email service error', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Send welcome email after registration
   */
  async sendWelcomeEmail(email: string, name?: string): Promise<EmailResult> {
    const userName = name || 'there';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to VoiceTranslate AI</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td style="background: linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%); padding: 40px; border-radius: 16px 16px 0 0; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">VoiceTranslate AI</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Real-time Voice Translation</p>
      </td>
    </tr>
    <tr>
      <td style="background-color: #ffffff; padding: 40px; border-radius: 0 0 16px 16px;">
        <h2 style="color: #18181b; margin: 0 0 20px 0; font-size: 24px;">Welcome, ${userName}!</h2>

        <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
          Thank you for joining VoiceTranslate AI! You're now part of a community that breaks language barriers with cutting-edge AI technology.
        </p>

        <div style="background-color: #f4f4f5; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <h3 style="color: #18181b; margin: 0 0 15px 0; font-size: 18px;">What you can do:</h3>
          <ul style="color: #52525b; margin: 0; padding-left: 20px; font-size: 15px; line-height: 1.8;">
            <li>Translate voice in real-time</li>
            <li>Support for 20+ languages</li>
            <li>Text and voice translation</li>
            <li>Save translation history</li>
          </ul>
        </div>

        <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 20px 0;">
          Open the app and start translating right away!
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${this.appUrl}" style="display: inline-block; background: linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Open App</a>
        </div>

        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 30px 0;">

        <p style="color: #a1a1aa; font-size: 13px; text-align: center; margin: 0;">
          If you didn't create this account, you can safely ignore this email.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding: 20px; text-align: center;">
        <p style="color: #a1a1aa; font-size: 12px; margin: 0;">
          © ${new Date().getFullYear()} VoiceTranslate AI. All rights reserved.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const text = `
Welcome to VoiceTranslate AI, ${userName}!

Thank you for joining VoiceTranslate AI! You're now part of a community that breaks language barriers with cutting-edge AI technology.

What you can do:
- Translate voice in real-time
- Support for 20+ languages
- Text and voice translation
- Save translation history

Open the app and start translating right away!

If you didn't create this account, you can safely ignore this email.

© ${new Date().getFullYear()} VoiceTranslate AI. All rights reserved.
    `;

    return this.sendEmail({
      to: email,
      subject: 'Welcome to VoiceTranslate AI!',
      html,
      text,
    });
  }

  /**
   * Send email verification link
   */
  async sendVerificationEmail(email: string, token: string, name?: string): Promise<EmailResult> {
    const userName = name || 'there';
    const verificationUrl = `${this.appUrl}/verify-email?token=${token}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td style="background: linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%); padding: 40px; border-radius: 16px 16px 0 0; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">VoiceTranslate AI</h1>
      </td>
    </tr>
    <tr>
      <td style="background-color: #ffffff; padding: 40px; border-radius: 0 0 16px 16px;">
        <h2 style="color: #18181b; margin: 0 0 20px 0; font-size: 24px;">Verify your email address</h2>

        <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
          Hi ${userName}, please click the button below to verify your email address:
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="display: inline-block; background: linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Verify Email</a>
        </div>

        <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 20px 0;">
          Or copy and paste this link into your browser:<br>
          <a href="${verificationUrl}" style="color: #3B82F6; word-break: break-all;">${verificationUrl}</a>
        </p>

        <p style="color: #a1a1aa; font-size: 13px; margin: 20px 0 0 0;">
          This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const text = `
Verify your email address

Hi ${userName}, please click the link below to verify your email address:

${verificationUrl}

This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
    `;

    return this.sendEmail({
      to: email,
      subject: 'Verify your email - VoiceTranslate AI',
      html,
      text,
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email: string, token: string, name?: string): Promise<EmailResult> {
    const userName = name || 'there';
    const resetUrl = `${this.appUrl}/reset-password?token=${token}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td style="background: linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%); padding: 40px; border-radius: 16px 16px 0 0; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">VoiceTranslate AI</h1>
      </td>
    </tr>
    <tr>
      <td style="background-color: #ffffff; padding: 40px; border-radius: 0 0 16px 16px;">
        <h2 style="color: #18181b; margin: 0 0 20px 0; font-size: 24px;">Reset your password</h2>

        <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
          Hi ${userName}, we received a request to reset your password. Click the button below to create a new password:
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Reset Password</a>
        </div>

        <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 20px 0;">
          Or copy and paste this link into your browser:<br>
          <a href="${resetUrl}" style="color: #3B82F6; word-break: break-all;">${resetUrl}</a>
        </p>

        <p style="color: #a1a1aa; font-size: 13px; margin: 20px 0 0 0;">
          This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const text = `
Reset your password

Hi ${userName}, we received a request to reset your password. Click the link below to create a new password:

${resetUrl}

This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
    `;

    return this.sendEmail({
      to: email,
      subject: 'Reset your password - VoiceTranslate AI',
      html,
      text,
    });
  }
}

export const emailService = new EmailService();
