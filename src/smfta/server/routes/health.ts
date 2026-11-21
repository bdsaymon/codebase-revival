import { Router, Request, Response } from '../runtime/express';
import { APP_VERSION } from '../../src/version';
import { getSharedHardenedEngine } from '../engine/router';
import { getNeuralStatus } from '../intentRules';
import { getResponseCacheSize } from '../responseCache';
import { timingSafeTokenEqual } from '../engine/security';
import { uidSessionStore } from './chat';
import {
  GEMINI_TEXT_MODELS,
  isGeminiConfigured,
} from '../services/geminiService';

export const healthRouter = Router();

export interface KillSwitchAuditEntry {
  actor: string;
  timestamp: string;
  previousState: boolean;
  newState: boolean;
}

export const killSwitchAuditLog: KillSwitchAuditEntry[] = [];

healthRouter.get('/health', (_req: Request, res: Response) => {
  const engine = getSharedHardenedEngine();
  const engineHealth = engine.getHealth();
  const neural = getNeuralStatus();
  const geminiConfigured = isGeminiConfigured();

  return res.json({
    ok: true,
    status: engineHealth.killSwitchEnabled ? 'online' : 'maintenance',
    version: APP_VERSION,
    engine: `SMFTA Neural Core v${APP_VERSION}`,
    geminiConfigured,
    geminiModels: GEMINI_TEXT_MODELS,
    killSwitchEnabled: engineHealth.killSwitchEnabled,
    serverKeyDailyCap: engineHealth.serverKeyDailyCap,
    serverKeyDailyCount: engineHealth.serverKeyDailyCount,
    serverKeyBudgetReached: engineHealth.serverKeyBudgetReached,
    cacheEntries: getResponseCacheSize(),
    activeUidSessions: uidSessionStore.size,
    trainedPairs: neural.weights.pairsLearned,
  });
});

healthRouter.get('/models/status', (_req: Request, res: Response) => {
  const geminiConfigured = isGeminiConfigured();
  return res.json({
    ok: true,
    geminiConfigured,
    models: GEMINI_TEXT_MODELS,
    message: geminiConfigured
      ? 'Gemini API connected via server secret.'
      : 'Integration required: GEMINI_API_KEY is not configured in server secrets.',
  });
});

healthRouter.get('/ai/health', (req: Request, res: Response) => {
  const adminToken = (process.env.AI_ADMIN_TOKEN || '').trim();
  const mustRequireToken =
    Boolean(adminToken) ||
    process.env.NODE_ENV === 'production' ||
    process.env.REQUIRE_ADMIN_TOKEN === 'true';

  if (mustRequireToken) {
    if (!adminToken) {
      return res.status(503).json({
        ok: false,
        error: 'AI_ADMIN_TOKEN is not configured; failing closed.',
      });
    }
    const provided = String(
      req.headers['x-admin-token'] ||
        req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
        ''
    ).trim();
    if (!timingSafeTokenEqual(provided, adminToken)) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
  }

  const engine = getSharedHardenedEngine();
  return res.json({
    ok: true,
    persistence: engine.storage.persistenceMode,
    ...engine.getHealth(),
  });
});

healthRouter.post('/ai/kill-switch', (req: Request, res: Response) => {
  const adminToken = (process.env.AI_ADMIN_TOKEN || '').trim();
  const mustRequireToken =
    Boolean(adminToken) ||
    process.env.NODE_ENV === 'production' ||
    process.env.REQUIRE_ADMIN_TOKEN === 'true';

  if (mustRequireToken) {
    if (!adminToken) {
      return res.status(503).json({
        ok: false,
        error: 'AI_ADMIN_TOKEN is not configured; failing closed.',
      });
    }
    const provided = String(
      req.headers['x-admin-token'] ||
        req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
        ''
    ).trim();
    if (!timingSafeTokenEqual(provided, adminToken)) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
  }

  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({
      ok: false,
      error: 'enabled (boolean) is required',
    });
  }
  const engine = getSharedHardenedEngine();
  const previousState = engine.storage.isKillSwitchEnabled();
  engine.setGlobalKillSwitch(!enabled);
  const newState = engine.storage.isKillSwitchEnabled();

  const auditEntry: KillSwitchAuditEntry = {
    actor: adminToken ? 'authenticated-admin' : 'local-dev',
    timestamp: new Date().toISOString(),
    previousState,
    newState,
  };
  killSwitchAuditLog.push(auditEntry);
  if (killSwitchAuditLog.length > 200) {
    killSwitchAuditLog.shift();
  }

  return res.json({
    ok: true,
    engine_enabled: newState,
    killSwitchEnabled: newState,
    updatedAt: auditEntry.timestamp,
  });
});

