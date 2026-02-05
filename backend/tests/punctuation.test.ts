/**
 * Punctuation Service Tests
 *
 * Tests for the AI-powered punctuation service that adds proper
 * punctuation to STT transcripts.
 */

import { describe, it, expect } from 'vitest';
import {
  hasSentenceEndingPunctuation,
  needsPunctuation,
} from '../src/services/ai/punctuation.service.js';

describe('Punctuation Service', () => {
  describe('hasSentenceEndingPunctuation', () => {
    it('should detect Western punctuation marks', () => {
      expect(hasSentenceEndingPunctuation('Hello world.')).toBe(true);
      expect(hasSentenceEndingPunctuation('Is this a question?')).toBe(true);
      expect(hasSentenceEndingPunctuation('Wow!')).toBe(true);
    });

    it('should detect Chinese/Japanese punctuation', () => {
      // Chinese ideographic full stop
      expect(hasSentenceEndingPunctuation('\u4F60\u597D\u3002')).toBe(true);
      // Japanese question mark
      expect(hasSentenceEndingPunctuation('\u304A\u5143\u6C17\u3067\u3059\u304B\uFF1F')).toBe(true);
      // Fullwidth exclamation
      expect(hasSentenceEndingPunctuation('\u3053\u3093\u306B\u3061\u306F\uFF01')).toBe(true);
    });

    it('should detect Arabic question mark', () => {
      // Arabic text with Arabic question mark
      expect(hasSentenceEndingPunctuation('\u0643\u064A\u0641 \u062D\u0627\u0644\u0643\u061F')).toBe(true);
    });

    it('should detect Hindi/Devanagari danda', () => {
      // Hindi text with danda (|)
      expect(hasSentenceEndingPunctuation('\u0928\u092E\u0938\u094D\u0924\u0947\u0964')).toBe(true);
    });

    it('should return false for text without punctuation', () => {
      expect(hasSentenceEndingPunctuation('Hello world')).toBe(false);
      expect(hasSentenceEndingPunctuation('Is this a question')).toBe(false);
      expect(hasSentenceEndingPunctuation('Some text here')).toBe(false);
    });

    it('should handle empty and whitespace strings', () => {
      expect(hasSentenceEndingPunctuation('')).toBe(true);
      expect(hasSentenceEndingPunctuation('   ')).toBe(true);
    });

    it('should ignore trailing whitespace', () => {
      expect(hasSentenceEndingPunctuation('Hello world.   ')).toBe(true);
      expect(hasSentenceEndingPunctuation('Hello world   ')).toBe(false);
    });
  });

  describe('needsPunctuation', () => {
    it('should return true for long text without punctuation', () => {
      expect(needsPunctuation('Hello this is a long sentence without punctuation')).toBe(true);
      expect(needsPunctuation('Merhaba bu uzun bir cumle noktalama olmadan')).toBe(true);
    });

    it('should return false for text with punctuation', () => {
      expect(needsPunctuation('Hello this is a sentence.')).toBe(false);
      expect(needsPunctuation('Is this a question?')).toBe(false);
    });

    it('should return false for short text', () => {
      expect(needsPunctuation('Hello')).toBe(false);
      expect(needsPunctuation('Short text')).toBe(false);
      expect(needsPunctuation('Under twenty')).toBe(false);
    });

    it('should respect custom minimum length', () => {
      expect(needsPunctuation('Hello world test', 10)).toBe(true);
      expect(needsPunctuation('Hello', 10)).toBe(false);
    });

    it('should handle empty strings', () => {
      expect(needsPunctuation('')).toBe(false);
      expect(needsPunctuation('   ')).toBe(false);
    });
  });

  describe('Turkish language support', () => {
    it('should correctly identify Turkish text needing punctuation', () => {
      const turkishText = 'Merhaba nasilsiniz bugun hava cok guzel';
      expect(needsPunctuation(turkishText)).toBe(true);
    });

    it('should correctly identify Turkish text with punctuation', () => {
      const turkishTextWithPunctuation = 'Merhaba, nasilsiniz? Bugun hava cok guzel.';
      expect(hasSentenceEndingPunctuation(turkishTextWithPunctuation)).toBe(true);
    });
  });
});
