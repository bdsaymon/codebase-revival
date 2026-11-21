import type { ArtifactVersion, WorkspaceArtifactFile } from './artifactManager';
import type { ChatSession } from '../types';

const DB_NAME = 'smfta_workspace_db';
const DB_VERSION = 1;
const STORE_PROJECTS_DATA = 'project_workspaces';
const STORE_DIAGRAMS = 'diagrams';

export interface StoredDiagramNode {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface StoredDiagramEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface StoredDiagram {
  id: string;
  projectId: string;
  title: string;
  kind: 'mindmap' | 'flowchart';
  nodes: StoredDiagramNode[];
  edges: StoredDiagramEdge[];
  updatedAt: number;
}

export type StoredDiagramRecord = StoredDiagram;

export interface ProjectWorkspaceSnapshot {
  projectId: string;
  files: Record<string, WorkspaceArtifactFile>;
  history: Record<string, ArtifactVersion[]>;
  chats: ChatSession[];
  activeChatId: number | string | null;
  updatedAt: number;
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openWorkspaceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error('IndexedDB is unavailable in this environment'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS_DATA)) {
        db.createObjectStore(STORE_PROJECTS_DATA, { keyPath: 'projectId' });
      }
      if (!db.objectStoreNames.contains(STORE_DIAGRAMS)) {
        db.createObjectStore(STORE_DIAGRAMS, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });
}

export function normalizeProjectWorkspaceKey(projectId?: string | null): string {
  const clean = String(projectId || '').trim();
  return clean || '__default_workspace__';
}

export async function loadProjectWorkspaceSnapshot(
  projectId?: string | null
): Promise<ProjectWorkspaceSnapshot | null> {
  if (!hasIndexedDb()) return null;
  const key = normalizeProjectWorkspaceKey(projectId);
  try {
    const db = await openWorkspaceDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_PROJECTS_DATA, 'readonly');
      const store = tx.objectStore(STORE_PROJECTS_DATA);
      const req = store.get(key);
      req.onsuccess = () => {
        const res = req.result as ProjectWorkspaceSnapshot | undefined;
        resolve(res || null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveProjectWorkspaceSnapshot(
  snapshot: ProjectWorkspaceSnapshot
): Promise<boolean> {
  if (!hasIndexedDb()) return false;
  const key = normalizeProjectWorkspaceKey(snapshot.projectId);
  try {
    const db = await openWorkspaceDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_PROJECTS_DATA, 'readwrite');
      const store = tx.objectStore(STORE_PROJECTS_DATA);
      const cleanRecord: ProjectWorkspaceSnapshot = {
        ...snapshot,
        projectId: key,
        updatedAt: Date.now(),
      };
      const req = store.put(cleanRecord);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function listSavedDiagrams(
  projectId?: string | null
): Promise<StoredDiagram[]> {
  if (!hasIndexedDb()) return [];
  const targetProj = normalizeProjectWorkspaceKey(projectId);
  try {
    const db = await openWorkspaceDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_DIAGRAMS, 'readonly');
      const store = tx.objectStore(STORE_DIAGRAMS);
      const req = store.getAll();
      req.onsuccess = () => {
        const all = (Array.isArray(req.result) ? req.result : []) as StoredDiagram[];
        resolve(
          all
            .filter((d) => !projectId || d.projectId === targetProj)
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        );
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export const listDiagramsFromDb = listSavedDiagrams;

export async function saveDiagramToDb(diagram: StoredDiagram): Promise<boolean> {
  if (!hasIndexedDb()) return false;
  try {
    const db = await openWorkspaceDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_DIAGRAMS, 'readwrite');
      const store = tx.objectStore(STORE_DIAGRAMS);
      const req = store.put({
        ...diagram,
        projectId: normalizeProjectWorkspaceKey(diagram.projectId),
        updatedAt: Date.now(),
      });
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}
