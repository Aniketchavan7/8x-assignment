import { describe, it, expect } from 'vitest';
import { classifyLookupInput } from './classify';

describe('classifyLookupInput', () => {
  describe('URLs — posts', () => {
    it('classifies tiktok video URL', () => {
      expect(
        classifyLookupInput('https://www.tiktok.com/@user/video/7234567890123456789')
      ).toEqual({
        kind: 'post-url',
        platform: 'tiktok',
        nativePostId: '7234567890123456789',
        postUrl: 'https://www.tiktok.com/@user/video/7234567890123456789',
      });
    });

    it('handles tiktok.com without www', () => {
      const r = classifyLookupInput('https://tiktok.com/@user/video/123');
      expect(r.kind).toBe('post-url');
      if (r.kind === 'post-url') {
        expect(r.platform).toBe('tiktok');
        expect(r.nativePostId).toBe('123');
      }
    });

    it('classifies instagram /p/ post URL', () => {
      expect(classifyLookupInput('https://www.instagram.com/p/CABC123xyz/')).toEqual({
        kind: 'post-url',
        platform: 'instagram',
        nativePostId: 'CABC123xyz',
        postUrl: 'https://www.instagram.com/p/CABC123xyz/',
      });
    });

    it('classifies instagram /reel/ post URL', () => {
      const r = classifyLookupInput('https://www.instagram.com/reel/CXYZ789/');
      expect(r.kind).toBe('post-url');
      if (r.kind === 'post-url') {
        expect(r.platform).toBe('instagram');
        expect(r.nativePostId).toBe('CXYZ789');
      }
    });

    it('classifies youtube watch URL', () => {
      const r = classifyLookupInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(r.kind).toBe('post-url');
      if (r.kind === 'post-url') {
        expect(r.platform).toBe('youtube');
        expect(r.nativePostId).toBe('dQw4w9WgXcQ');
      }
    });

    it('classifies youtu.be short URL', () => {
      const r = classifyLookupInput('https://youtu.be/dQw4w9WgXcQ');
      expect(r.kind).toBe('post-url');
      if (r.kind === 'post-url') {
        expect(r.platform).toBe('youtube');
        expect(r.nativePostId).toBe('dQw4w9WgXcQ');
      }
    });

    it('classifies youtube shorts URL', () => {
      const r = classifyLookupInput('https://www.youtube.com/shorts/abc123');
      expect(r.kind).toBe('post-url');
      if (r.kind === 'post-url') {
        expect(r.platform).toBe('youtube');
        expect(r.nativePostId).toBe('abc123');
      }
    });
  });

  describe('URLs — accounts', () => {
    it('classifies tiktok account URL', () => {
      expect(classifyLookupInput('https://www.tiktok.com/@coolcreator')).toEqual({
        kind: 'account-url',
        platform: 'tiktok',
        username: 'coolcreator',
      });
    });

    it('classifies instagram account URL', () => {
      expect(classifyLookupInput('https://www.instagram.com/coolcreator/')).toEqual({
        kind: 'account-url',
        platform: 'instagram',
        username: 'coolcreator',
      });
    });

    it('classifies youtube @handle URL', () => {
      expect(classifyLookupInput('https://www.youtube.com/@coolchannel')).toEqual({
        kind: 'account-url',
        platform: 'youtube',
        username: 'coolchannel',
      });
    });
  });

  describe('UUIDs', () => {
    it('classifies a UUID as post-id (resolver re-classifies on miss)', () => {
      expect(classifyLookupInput('123e4567-e89b-12d3-a456-426614174000')).toEqual({
        kind: 'post-id',
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
    });

    it('handles upper-case UUIDs', () => {
      const r = classifyLookupInput('123E4567-E89B-12D3-A456-426614174000');
      expect(r.kind).toBe('post-id');
    });
  });

  describe('ad codes', () => {
    it('classifies a short upper-alphanumeric as ad-code', () => {
      expect(classifyLookupInput('ABC123')).toEqual({ kind: 'ad-code', adCode: 'ABC123' });
    });

    it('classifies all-letters short upper as ad-code', () => {
      expect(classifyLookupInput('ABCDEF')).toEqual({ kind: 'ad-code', adCode: 'ABCDEF' });
    });

    it('does not classify lower-case strings as ad-code', () => {
      const r = classifyLookupInput('abc123');
      expect(r.kind).toBe('username');
    });
  });

  describe('usernames', () => {
    it('classifies @username', () => {
      expect(classifyLookupInput('@coolcreator')).toEqual({
        kind: 'username',
        username: 'coolcreator',
      });
    });

    it('classifies bare lower-case username', () => {
      expect(classifyLookupInput('coolcreator')).toEqual({
        kind: 'username',
        username: 'coolcreator',
      });
    });

    it('strips leading @ on usernames', () => {
      expect(classifyLookupInput('@user.name')).toEqual({
        kind: 'username',
        username: 'user.name',
      });
    });
  });

  describe('bare hostname URLs (no scheme)', () => {
    it('classifies bare tiktok.com account URL', () => {
      expect(classifyLookupInput('tiktok.com/@teomakingmoney')).toEqual({
        kind: 'account-url',
        platform: 'tiktok',
        username: 'teomakingmoney',
      });
    });

    it('classifies bare tiktok.com video URL', () => {
      const r = classifyLookupInput('tiktok.com/@user/video/12345');
      expect(r.kind).toBe('post-url');
      if (r.kind === 'post-url') {
        expect(r.platform).toBe('tiktok');
        expect(r.nativePostId).toBe('12345');
      }
    });

    it('classifies bare instagram.com post URL', () => {
      const r = classifyLookupInput('instagram.com/p/abc123');
      expect(r.kind).toBe('post-url');
      if (r.kind === 'post-url') {
        expect(r.platform).toBe('instagram');
        expect(r.nativePostId).toBe('abc123');
      }
    });

    it('classifies bare www.tiktok.com account URL', () => {
      expect(classifyLookupInput('www.tiktok.com/@user')).toEqual({
        kind: 'account-url',
        platform: 'tiktok',
        username: 'user',
      });
    });

    it('classifies bare youtube.com @handle URL', () => {
      expect(classifyLookupInput('youtube.com/@channel')).toEqual({
        kind: 'account-url',
        platform: 'youtube',
        username: 'channel',
      });
    });
  });

  describe('TikTok disclosure ad codes', () => {
    it('classifies #-prefixed base64 ad code', () => {
      const code = '#4zIcx9YUxZsSy+r0xZkt/Sz6sKs8ETLZqnWPJJx4/j059/WItsmzY6R9U2bP2GI=';
      expect(classifyLookupInput(code)).toEqual({ kind: 'ad-code', adCode: code });
    });

    it('classifies another real-shape disclosure ad code', () => {
      const code = '#kecJjjDIe25VS6vPLqcBWCDgrs4hDc6X3aXtvc2afqz6hXvLbu3+lD8wM86WyJ0=';
      expect(classifyLookupInput(code)).toEqual({ kind: 'ad-code', adCode: code });
    });

    it('classifies vm.tiktok.com short URL as ad-code', () => {
      const url = 'https://vm.tiktok.com/ZNRsmT9Cp/';
      expect(classifyLookupInput(url)).toEqual({ kind: 'ad-code', adCode: url });
    });

    it('normalizes bare vm.tiktok.com host to canonical https URL', () => {
      // Bare hostname must resolve to the same canonical form as full URL so
      // the eq('ad_code', ...) DB lookup hits the stored value.
      expect(classifyLookupInput('vm.tiktok.com/ZNRsmT9Cp/')).toEqual({
        kind: 'ad-code',
        adCode: 'https://vm.tiktok.com/ZNRsmT9Cp/',
      });
    });
  });

  describe('edge cases', () => {
    it('returns unknown for empty string', () => {
      expect(classifyLookupInput('')).toEqual({ kind: 'unknown', raw: '' });
    });

    it('returns unknown for whitespace-only', () => {
      expect(classifyLookupInput('   ')).toEqual({ kind: 'unknown', raw: '   ' });
    });

    it('returns unknown for nonsense long strings', () => {
      const r = classifyLookupInput('this is a multi word random search string');
      expect(r.kind).toBe('unknown');
    });

    it('trims input before classifying', () => {
      const r = classifyLookupInput('  @creator  ');
      expect(r).toEqual({ kind: 'username', username: 'creator' });
    });

    it('treats unknown URL host as unknown', () => {
      const r = classifyLookupInput('https://example.com/x/y/z');
      expect(r.kind).toBe('unknown');
    });
  });
});
