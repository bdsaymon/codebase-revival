import React from 'react';
import { HardDrive, NotebookPen, X, Sparkles, Database, Globe } from 'lucide-react';
import { GithubIcon } from './icons/GithubIcon';
import { NotebookNote } from '../types';
import {
  VaultConnections,
  resolveConnectionStatus,
  formatConnectionStatusLabel,
} from '../utils/cloudVault';
import { VaultConnectionsPanel } from './VaultConnectionsPanel';

export interface ConnectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  connections: VaultConnections;
  onChange: (next: VaultConnections) => void;
  notes: NotebookNote[];
  notify: (msg: string) => void;
  onOpenNotebook?: () => void;
}

/**
 * First-class Cloud Connectors & OAuth Integrations Hub (v19.0.0).
 */
export const ConnectionsModal: React.FC<ConnectionsModalProps> = ({
  isOpen,
  onClose,
  connections,
  onChange,
  notes,
  notify,
  onOpenNotebook,
}) => {
  if (!isOpen) return null;

  const ghStatus = resolveConnectionStatus('github', connections);
  const vcStatus = resolveConnectionStatus('vercel', connections);
  const sbStatus = resolveConnectionStatus('supabase', connections);
  const ggStatus = resolveConnectionStatus('google', connections);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-2 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-3xl max-h-[92vh] rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-2xl flex flex-col overflow-hidden">
        <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[var(--primary-soft)] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-[var(--primary)]" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[var(--text)] truncate">
                Integrations &amp; Cloud Connectors
              </h3>
              <p className="text-[10.5px] text-[var(--text-3)] truncate">
                GitHub ({formatConnectionStatusLabel(ghStatus)}) · Vercel (
                {formatConnectionStatusLabel(vcStatus)}) · Supabase (
                {formatConnectionStatusLabel(sbStatus)}) · Google (
                {formatConnectionStatusLabel(ggStatus)})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenNotebook && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenNotebook();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[10.5px] font-medium text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
              >
                <NotebookPen className="w-3.5 h-3.5" /> Notebook
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div
              className={`rounded-xl border px-3 py-2 ${
                connections.github.connected
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : 'border-[var(--border)] bg-[var(--surface-2)]'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text)]">
                <GithubIcon className="w-3.5 h-3.5" /> GitHub
              </div>
              <div className="text-[10px] font-mono text-[var(--text-3)] truncate">
                {connections.github.connected
                  ? connections.github.owner && connections.github.repo
                    ? `${connections.github.owner}/${connections.github.repo}`
                    : connections.github.account || 'Connected'
                  : formatConnectionStatusLabel(ghStatus)}
              </div>
            </div>

            <div
              className={`rounded-xl border px-3 py-2 ${
                connections.vercel?.connected
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : 'border-[var(--border)] bg-[var(--surface-2)]'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text)]">
                <Globe className="w-3.5 h-3.5" /> Vercel
              </div>
              <div className="text-[10px] font-mono text-[var(--text-3)] truncate">
                {connections.vercel?.connected
                  ? connections.vercel.account || connections.vercel.projectId || 'Connected'
                  : formatConnectionStatusLabel(vcStatus)}
              </div>
            </div>

            <div
              className={`rounded-xl border px-3 py-2 ${
                connections.supabase?.connected
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : 'border-[var(--border)] bg-[var(--surface-2)]'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text)]">
                <Database className="w-3.5 h-3.5" /> Supabase
              </div>
              <div className="text-[10px] font-mono text-[var(--text-3)] truncate">
                {connections.supabase?.connected
                  ? connections.supabase.account || 'Connected'
                  : formatConnectionStatusLabel(sbStatus)}
              </div>
            </div>

            <div
              className={`rounded-xl border px-3 py-2 ${
                connections.drive.connected
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : 'border-[var(--border)] bg-[var(--surface-2)]'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text)]">
                <HardDrive className="w-3.5 h-3.5" /> Google
              </div>
              <div className="text-[10px] font-mono text-[var(--text-3)] truncate">
                {connections.drive.connected
                  ? connections.drive.account || 'Connected'
                  : formatConnectionStatusLabel(ggStatus)}
              </div>
            </div>
          </div>

          <VaultConnectionsPanel
            connections={connections}
            onChange={onChange}
            notes={notes}
            notify={notify}
            compact
          />
        </div>
      </div>
    </div>
  );
};

export default ConnectionsModal;
