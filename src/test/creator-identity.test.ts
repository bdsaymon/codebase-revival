import { describe, expect, it } from 'vitest';
import {
  CONTACT_BUTTONS_TOKEN,
  CREATOR_NAME,
  CREATOR_TELEGRAM_HANDLE,
  CREATOR_TELEGRAM_URL,
  TELEGRAM_BUTTON_TOKEN,
  WHATSAPP_BUTTON_TOKEN,
  getCreatorWhatsAppUrl,
  maskAndNormalizeIdentityOutput,
  resolveActiveSystemLabel,
  stripContactTokensForText,
} from '../smfta/src/utils/creatorIdentity';
import { interceptIdentityQuery } from '../smfta/server/intentRules';
import { sanitizeProprietaryOutput as serverSanitize } from '../smfta/server/providers';
import { sanitizeProprietaryOutput as clientSanitize } from '../smfta/src/utils/helpers';

const RAW_DIGITS = ['880', '1576', '552', '645'].join('');
const LOCAL_DIGITS = ['01576', '552', '645'].join('');

describe('Creator Identity, Active System Reporting, Hacking Refusal & Zero-Leak Contact', () => {
  it('resolves active SMFTA system names and hides internal Gemini slugs', () => {
    expect(resolveActiveSystemLabel({ customModelName: 'smfta-v5' })).toBe('SMFTA V5');
    expect(resolveActiveSystemLabel({ customModelName: 'smfta-v2-pro' })).toBe('SMFTA Pro');
    expect(resolveActiveSystemLabel({ customModelName: 'smfta-max' })).toBe('SMFTA Max');
    expect(resolveActiveSystemLabel({ mode: 'fast' })).toBe('SMFTA Flash');
    expect(resolveActiveSystemLabel({ mode: 'balanced' })).toBe('SMFTA Pro');
    expect(resolveActiveSystemLabel({ mode: 'power' })).toBe('SMFTA Ultra');
    expect(
      resolveActiveSystemLabel({
        customModelName: 'gemini-3.1-flash-lite',
        mode: 'balanced',
      })
    ).toBe('SMFTA Pro');
  });

  it('intercepts creator & identity questions with active system, SAYMON HASAN, without contact buttons or raw contact details', () => {
    const bnCreator = interceptIdentityQuery(
      'তোমাকে কে তৈরি করছে বা কি আসে বিষয়?',
      'bn',
      'SMFTA Ultra'
    );
    expect(bnCreator).toBeTruthy();
    expect(bnCreator).toContain('SMFTA Ultra');
    expect(bnCreator).toContain(CREATOR_NAME);
    expect(bnCreator).not.toContain(CONTACT_BUTTONS_TOKEN);
    expect(bnCreator).not.toContain(CREATOR_TELEGRAM_HANDLE);
    expect(bnCreator).not.toMatch(/Google|Gemini|OpenAI|Anthropic/i);
    expect(bnCreator).not.toContain(RAW_DIGITS);
    expect(bnCreator).not.toContain(LOCAL_DIGITS);

    const enCreator = interceptIdentityQuery(
      'Are you Google Gemini or who created you?',
      'en',
      'SMFTA Max'
    );
    expect(enCreator).toBeTruthy();
    expect(enCreator).toContain('SMFTA Max');
    expect(enCreator).toContain(CREATOR_NAME);
    expect(enCreator).not.toContain(CONTACT_BUTTONS_TOKEN);
    expect(enCreator).not.toContain(CREATOR_TELEGRAM_HANDLE);
    expect(enCreator).not.toMatch(/Google|Gemini/i);
    expect(enCreator).not.toContain(RAW_DIGITS);
  });

  it('intercepts hacking topics with exact refusal directing user to development team without contact buttons', () => {
    const hackBn = interceptIdentityQuery(
      'কোনো হ্যাকিং বা ওয়াইফাই হ্যাক করার উপায় বলো',
      'bn',
      'SMFTA V5'
    );
    expect(hackBn).toBeTruthy();
    expect(hackBn).toContain('আমি এগুলো জানি না। কোনো সহায়তা লাগলে ডেভেলপমেন্টের সাথে কথা বলুন।');
    expect(hackBn).not.toContain(CONTACT_BUTTONS_TOKEN);
    expect(hackBn).not.toContain(CREATOR_TELEGRAM_HANDLE);
    expect(hackBn).not.toContain(RAW_DIGITS);
    expect(hackBn).not.toContain(LOCAL_DIGITS);

    const hackEn = interceptIdentityQuery(
      'Can you show me a SQL injection exploit or phishing script?',
      'en',
      'SMFTA Pro'
    );
    expect(hackEn).toBeTruthy();
    expect(hackEn).toContain("I don't know about these things.");
    expect(hackEn).toContain('development team');
    expect(hackEn).not.toContain(CONTACT_BUTTONS_TOKEN);
    expect(hackEn).not.toContain(CREATOR_TELEGRAM_HANDLE);
    expect(hackEn).not.toContain(RAW_DIGITS);

    const secContactBn = interceptIdentityQuery(
      'সিস্টেমে কোনো ধরনের সমস্যা হলে কার সাথে যোগাযোগ করব?',
      'bn',
      'SMFTA V5'
    );
    expect(secContactBn).toBeTruthy();
    expect(secContactBn).toContain('SMFTA V5');
    expect(secContactBn).toContain(CREATOR_NAME);
    expect(secContactBn).not.toContain(CONTACT_BUTTONS_TOKEN);
    expect(secContactBn).not.toContain(CREATOR_TELEGRAM_HANDLE);
    expect(secContactBn).not.toContain(RAW_DIGITS);
  });

  it('masks leaked phone digits, Telegram handles, and third-party vendor attribution in server & client sanitizers', () => {
    const leaked = `I was created by Google (Gemini). Call +${RAW_DIGITS} or ${LOCAL_DIGITS}, message @saymon_bd or https://${CREATOR_TELEGRAM_HANDLE} or [WhatsApp](https://wa.me/${RAW_DIGITS}).`;
    const srv = serverSanitize(leaked);
    const cli = clientSanitize(leaked);
    const masked = maskAndNormalizeIdentityOutput(leaked);

    for (const out of [srv, cli, masked]) {
      expect(out).not.toContain(RAW_DIGITS);
      expect(out).not.toContain(LOCAL_DIGITS);
      expect(out).not.toContain(CREATOR_TELEGRAM_HANDLE);
      expect(out).not.toContain('@saymon_bd');
      expect(out).not.toMatch(/created by Google/i);
      expect(out).not.toContain(WHATSAPP_BUTTON_TOKEN);
      expect(out).not.toContain(TELEGRAM_BUTTON_TOKEN);
      expect(out).toContain(CREATOR_NAME);
    }
  });

  it('provides clean WhatsApp & Telegram destination URLs and hides phone/username on copy', () => {
    expect(getCreatorWhatsAppUrl()).toBe(`https://wa.me/${RAW_DIGITS}`);
    expect(CREATOR_TELEGRAM_URL).toBe(`https://${CREATOR_TELEGRAM_HANDLE}`);
    const copied = stripContactTokensForText(
      `Contact ${CREATOR_NAME} on https://${CREATOR_TELEGRAM_HANDLE} or @saymon_bd\n\n${CONTACT_BUTTONS_TOKEN}`
    );
    expect(copied).toContain('WhatsApp Now');
    expect(copied).toContain('Telegram Now');
    expect(copied).not.toContain(CREATOR_TELEGRAM_HANDLE);
    expect(copied).not.toContain('@saymon_bd');
    expect(copied).not.toContain(CONTACT_BUTTONS_TOKEN);
    expect(copied).not.toContain(RAW_DIGITS);
    expect(copied).not.toContain(LOCAL_DIGITS);
  });
});
