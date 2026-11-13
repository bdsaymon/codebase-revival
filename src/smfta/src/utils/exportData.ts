import { APP_VERSION } from '../version';
import {
  AppSettings,
  ChatMessage,
  ChatSession,
  DataBridgeConfig,
  DbConnectionConfig,
  KnowledgeDocument,
  McpServerConfig,
  SavedProviderProfile,
  SelfUpdateWidget,
} from '../types';
import { DEFAULT_SETTINGS } from './settings';
import type { SelfSkill } from './selfEngine';

export const EXPORT_SCHEMA_VERSION = 2;
export const MAX_IMPORT_PAYLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

export interface ExportEnvelopeV2 {
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  secretsStripped: boolean;
  itemCounts: {
    chats: number;
    memory: number;
    notebook: number;
    savedProfiles: number;
    widgets: number;
    skills: number;
    knowledgeDocs?: number;
    mcpServers?: number;
    dbConnections?: number;
  };
  chats: ChatSession[];
  settings?: Partial<AppSettings>;
  savedProfiles?: SavedProviderProfile[];
  memory?: string[];
  notebook?: unknown[];
  widgets?: SelfUpdateWidget[];
  skills?: SelfSkill[];
  autonomy?: 'safe' | 'full';
  mcpServers?: McpServerConfig[];
  dbConnections?: DbConnectionConfig[];
  dataBridgeConfig?: DataBridgeConfig | null;
  knowledgeDocs?: KnowledgeDocument[];
}

export interface ParsedImportPayload {
  schemaVersion: number;
  chats: ChatSession[];
  settings?: Partial<AppSettings>;
  savedProfiles?: SavedProviderProfile[];
  memory?: string[];
  notebook?: unknown[];
  widgets?: SelfUpdateWidget[];
  skills?: SelfSkill[];
  autonomy?: 'safe' | 'full';
  mcpServers?: McpServerConfig[];
  dbConnections?: DbConnectionConfig[];
  dataBridgeConfig?: DataBridgeConfig;
  knowledgeDocs?: KnowledgeDocument[];
}

/**
 * Strips sensitive fields (API keys, profile secrets) unless `includeKeys` is explicitly true.
 */
export function sanitizeSettingsForExport(
  settings: Partial<AppSettings> | undefined,
  includeKeys = false
): Partial<AppSettings> | undefined {
  if (!settings) return undefined;
  const copy: Partial<AppSettings> = { ...settings };
  if (!includeKeys) {
    copy.externalKeys = '';
  }
  return copy;
}

export function sanitizeProfilesForExport(
  profiles: SavedProviderProfile[] | undefined,
  includeKeys = false
): SavedProviderProfile[] | undefined {
  if (!Array.isArray(profiles)) return undefined;
  return profiles.map((p) => ({
    ...p,
    externalKeys: includeKeys ? p.externalKeys : '',
    verified: includeKeys ? p.verified : false,
    verificationStatus: includeKeys ? p.verificationStatus : 'untested',
  }));
}

export function buildExportEnvelope(params: {
  chats: ChatSession[];
  settings?: Partial<AppSettings>;
  savedProfiles?: SavedProviderProfile[];
  memory?: string[];
  notebook?: unknown[];
  widgets?: SelfUpdateWidget[];
  skills?: SelfSkill[];
  autonomy?: 'safe' | 'full';
  mcpServers?: McpServerConfig[];
  dbConnections?: DbConnectionConfig[];
  dataBridgeConfig?: DataBridgeConfig | null;
  knowledgeDocs?: KnowledgeDocument[];
  includeKeys?: boolean;
}): ExportEnvelopeV2 {
  const includeKeys = Boolean(params.includeKeys);
  const chats = Array.isArray(params.chats) ? params.chats : [];
  const memory = Array.isArray(params.memory) ? params.memory : [];
  const notebook = Array.isArray(params.notebook) ? params.notebook : [];
  const savedProfiles = sanitizeProfilesForExport(params.savedProfiles, includeKeys);
  const widgets = Array.isArray(params.widgets) ? params.widgets : undefined;
  const skills = Array.isArray(params.skills) ? params.skills : undefined;
  const mcpServers = Array.isArray(params.mcpServers)
    ? params.mcpServers.map((s) => ({ ...s, authSecret: includeKeys ? s.authSecret : '' }))
    : undefined;
  const dbConnections = Array.isArray(params.dbConnections)
    ? params.dbConnections.map((d) => ({ ...d, secret: includeKeys ? d.secret : '' }))
    : undefined;
  const knowledgeDocs = Array.isArray(params.knowledgeDocs) ? params.knowledgeDocs : undefined;

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    secretsStripped: !includeKeys,
    itemCounts: {
      chats: chats.length,
      memory: memory.length,
      notebook: notebook.length,
      savedProfiles: savedProfiles?.length || 0,
      widgets: widgets?.length || 0,
      skills: skills?.length || 0,
      knowledgeDocs: knowledgeDocs?.length || 0,
      mcpServers: mcpServers?.length || 0,
      dbConnections: dbConnections?.length || 0,
    },
    chats,
    settings: sanitizeSettingsForExport(params.settings, includeKeys),
    savedProfiles,
    memory,
    notebook,
    widgets,
    skills,
    autonomy: params.autonomy,
    mcpServers,
    dbConnections,
    dataBridgeConfig: params.dataBridgeConfig ?? undefined,
    knowledgeDocs,
  };
}

function normalizeChatSession(
  raw: unknown,
  idx: number,
  seenChatIds: Set<number>,
  seenMsgIds: Set<string>
): ChatSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const rawMsgs = Array.isArray(obj.msgs)
    ? obj.msgs
    : Array.isArray(obj.messages)
    ? obj.messages
    : null;
  if (!rawMsgs) return null;

  let id =
    typeof obj.id === 'number' && Number.isFinite(obj.id)
      ? obj.id
      : Date.now() + idx;
  while (seenChatIds.has(id)) {
    id += 1;
  }
  seenChatIds.add(id);

  const title =
    typeof obj.title === 'string' && obj.title.trim()
      ? obj.title.trim()
      : 'Imported Chat';

  const msgs: ChatMessage[] = rawMsgs
    .filter((m): m is Record<string, unknown> =>
      Boolean(m && typeof m === 'object')
    )
    .map((m, mIdx) => {
      let msgId =
        typeof m.id === 'string' && m.id.trim()
          ? m.id.trim()
          : `m-${id}-${mIdx}`;
      if (seenMsgIds.has(msgId)) {
        msgId = `${msgId}-remap-${id}-${mIdx}`;
      }
      seenMsgIds.add(msgId);

      const ts =
        typeof m.ts === 'number' && Number.isFinite(m.ts)
          ? m.ts
          : Date.now();

      return {
        id: msgId,
        role: (m.role === 'user' ? 'user' : 'ai') as 'user' | 'ai',
        text: String(m.text ?? m.content ?? ''),
        ts,
        ...(typeof m.status === 'string'
          ? { status: m.status as ChatMessage['status'] }
          : {}),
        ...(m.timing && typeof m.timing === 'object'
          ? { timing: m.timing as ChatMessage['timing'] }
          : {}),
      };
    });

  return {
    id,
    title,
    titleSource:
      obj.titleSource === 'user' || obj.titleSource === 'auto'
        ? obj.titleSource
        : undefined,
    pinned: Boolean(obj.pinned),
    draft: typeof obj.draft === 'string' ? obj.draft : undefined,
    msgs,
  };
}

/**
 * Validates and migrates both legacy array exports (`ChatSession[]`),
 * v1 object exports (`{ sessions, memory, settings }`), and v2 envelope exports.
 */
export function parseImportPayload(rawInput: unknown): ParsedImportPayload {
  if (typeof rawInput === 'string' && rawInput.length > MAX_IMPORT_PAYLOAD_BYTES) {
    throw new Error('Import file exceeds the maximum allowed size (15 MB).');
  }

  const parsed =
    typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;

  const seenChatIds = new Set<number>();
  const seenMsgIds = new Set<string>();

  if (Array.isArray(parsed)) {
    const chats = parsed
      .map((item, i) => normalizeChatSession(item, i, seenChatIds, seenMsgIds))
      .filter((c): c is ChatSession => c !== null);
    if (chats.length === 0 && parsed.length > 0) {
      throw new Error('Invalid chat session format in imported array');
    }
    return {
      schemaVersion: 1,
      chats,
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Import file must be a JSON object or array');
  }

  const obj = parsed as Record<string, unknown>;
  const schemaVersion =
    typeof obj.schemaVersion === 'number' ? obj.schemaVersion : 1;

  if (schemaVersion > EXPORT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported future backup schemaVersion ${schemaVersion} (supported up to v${EXPORT_SCHEMA_VERSION}).`
    );
  }

  const rawChats = Array.isArray(obj.chats)
    ? obj.chats
    : Array.isArray(obj.sessions)
    ? obj.sessions
    : null;

  if (!rawChats) {
    throw new Error('Import payload is missing chats/sessions array');
  }

  const chats = rawChats
    .map((item, i) => normalizeChatSession(item, i, seenChatIds, seenMsgIds))
    .filter((c): c is ChatSession => c !== null);

  if (chats.length === 0 && rawChats.length > 0) {
    throw new Error('No valid chat sessions found in import payload');
  }

  const settings =
    obj.settings && typeof obj.settings === 'object'
      ? sanitizeSettingsForExport(
          { ...DEFAULT_SETTINGS, ...(obj.settings as Partial<AppSettings>) },
          false
        )
      : undefined;

  const savedProfiles = Array.isArray(obj.savedProfiles)
    ? sanitizeProfilesForExport(obj.savedProfiles as SavedProviderProfile[], false)
    : undefined;

  const memory = Array.isArray(obj.memory)
    ? obj.memory
        .map((m) => {
          if (typeof m === 'string') return m;
          if (m && typeof m === 'object' && 'text' in m) {
            return String((m as { text: unknown }).text || '');
          }
          return '';
        })
        .filter(Boolean)
    : undefined;

  const notebook = Array.isArray(obj.notebook) ? obj.notebook : undefined;
  const widgets = Array.isArray(obj.widgets)
    ? (obj.widgets as SelfUpdateWidget[])
    : undefined;
  const skills = Array.isArray(obj.skills)
    ? (obj.skills as SelfSkill[])
    : undefined;
  const autonomy =
    obj.autonomy === 'safe' || obj.autonomy === 'full'
      ? obj.autonomy
      : undefined;

  const mcpServers = Array.isArray(obj.mcpServers)
    ? (obj.mcpServers as ExportEnvelopeV2['mcpServers'])?.map((srv) => ({
        ...srv,
        authSecret: '',
      }))
    : undefined;

  const dbConnections = Array.isArray(obj.dbConnections)
    ? (obj.dbConnections as ExportEnvelopeV2['dbConnections'])?.map((conn) => ({
        ...conn,
        secret: '',
      }))
    : undefined;

  const dataBridgeConfig =
    obj.dataBridgeConfig && typeof obj.dataBridgeConfig === 'object'
      ? (obj.dataBridgeConfig as DataBridgeConfig)
      : undefined;

  const knowledgeDocs = Array.isArray(obj.knowledgeDocs)
    ? (obj.knowledgeDocs as ExportEnvelopeV2['knowledgeDocs'])
    : undefined;

  return {
    schemaVersion,
    chats,
    settings,
    savedProfiles,
    memory,
    notebook,
    widgets,
    skills,
    autonomy,
    mcpServers,
    dbConnections,
    dataBridgeConfig,
    knowledgeDocs,
  };
}
