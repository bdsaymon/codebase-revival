import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng, toSvg } from 'html-to-image';
import {
  AlertTriangle,
  Download,
  GitBranch,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  listDiagramsFromDb,
  saveDiagramToDb,
  type StoredDiagramRecord,
} from '../services/indexedDbStore';

export interface DiagramStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onToast?: (msg: string) => void;
}

const DEFAULT_NODES: Node[] = [
  {
    id: 'root',
    position: { x: 260, y: 40 },
    data: { label: 'Main Idea' },
    style: {
      borderRadius: 12,
      padding: '10px 16px',
      fontWeight: 600,
    },
  },
];

export const DiagramStudioModal: React.FC<DiagramStudioModalProps> = ({
  isOpen,
  onClose,
  projectId,
  onToast,
}) => {
  const [kind, setKind] = useState<'mindmap' | 'flowchart'>('mindmap');
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('Untitled Diagram');
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(DEFAULT_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [savedDiagrams, setSavedDiagrams] = useState<StoredDiagramRecord[]>([]);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const flowWrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    listDiagramsFromDb(projectId).then(setSavedDiagrams).catch(() => {});
  }, [isOpen, projectId]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, animated: true }, eds));
    },
    [setEdges]
  );

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/diagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), kind }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        code?: string;
        title?: string;
        nodes?: Array<{ id: string; label: string; category?: string; note?: string; x?: number; y?: number }>;
        edges?: Array<{ id: string; source: string; target: string; label?: string }>;
        diagram?: {
          title?: string;
          nodes?: Array<{ id: string; label: string; category?: string; note?: string; x?: number; y?: number }>;
          edges?: Array<{ id: string; source: string; target: string; label?: string }>;
        };
      } | null;

      if (!res.ok || !data || data.error) {
        const msg =
          data?.code === 'INTEGRATION_REQUIRED'
            ? data.error || 'Integration required: Configure GEMINI_API_KEY on the server.'
            : data?.error || `Request failed (${res.status})`;
        setErrorMsg(msg);
        return;
      }

      const payload = data.diagram || data;
      const rawNodes = payload.nodes || [];
      const rawEdges = payload.edges || [];

      const nextNodes: Node[] = rawNodes.map((n, idx) => ({
        id: String(n.id || `n-${idx + 1}`),
        position: {
          x: typeof n.x === 'number' ? n.x : (idx % 3) * 230 + 40,
          y: typeof n.y === 'number' ? n.y : Math.floor(idx / 3) * 125 + 30,
        },
        data: { label: n.note ? `${n.label}\n${n.note}` : String(n.label || `Node ${idx + 1}`) },
        style: { borderRadius: 12, padding: '8px 14px', fontSize: 13 },
      }));
      const nextEdges: Edge[] = rawEdges.map((e, idx) => ({
        id: String(e.id || `e-${idx + 1}`),
        source: String(e.source),
        target: String(e.target),
        label: e.label ? String(e.label) : undefined,
        animated: kind === 'flowchart',
      }));

      setTitle(payload.title || prompt.trim().slice(0, 60));
      setNodes(nextNodes.length > 0 ? nextNodes : DEFAULT_NODES);
      setEdges(nextEdges);
      onToast?.(`Generated ${kind}: ${nextNodes.length} nodes`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNode = () => {
    const id = `node-${Date.now().toString(36)}`;
    const next: Node = {
      id,
      position: {
        x: 120 + (nodes.length % 4) * 90,
        y: 120 + Math.floor(nodes.length / 4) * 80,
      },
      data: { label: `New Node ${nodes.length + 1}` },
      style: { borderRadius: 12, padding: '8px 14px', fontSize: 13 },
    };
    setNodes((prev) => [...prev, next]);
  };

  const handleDeleteSelected = () => {
    const selectedIds = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
    if (selectedIds.size === 0) return;
    setNodes((prev) => prev.filter((n) => !selectedIds.has(n.id)));
    setEdges((prev) =>
      prev.filter(
        (e) => !e.selected && !selectedIds.has(e.source) && !selectedIds.has(e.target)
      )
    );
  };

  const handleSave = async () => {
    const record: StoredDiagramRecord = {
      id: `diag-${Date.now().toString(36)}`,
      projectId,
      kind,
      title: title.trim() || 'Untitled Diagram',
      nodes: nodes.map((n) => ({
        id: n.id,
        label: String(n.data?.label || ''),
        x: n.position.x,
        y: n.position.y,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: typeof e.label === 'string' ? e.label : undefined,
      })),
      updatedAt: Date.now(),
    };
    await saveDiagramToDb(record);
    const updated = await listDiagramsFromDb(projectId);
    setSavedDiagrams(updated);
    onToast?.(`Saved "${record.title}" to IndexedDB`);
  };

  const handleExport = async (format: 'png' | 'svg') => {
    if (!flowWrapperRef.current) return;
    try {
      const target =
        (flowWrapperRef.current.querySelector('.react-flow__viewport') as HTMLElement) ||
        flowWrapperRef.current;
      const dataUrl =
        format === 'png'
          ? await toPng(flowWrapperRef.current, { backgroundColor: '#ffffff' })
          : await toSvg(target);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'diagram'}.${format}`;
      a.click();
      onToast?.(`Exported ${format.toUpperCase()}`);
    } catch (err: unknown) {
      onToast?.(err instanceof Error ? err.message : 'Export failed');
    }
  };

  return (
    <div
      data-testid="diagram-studio-modal"
      className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-2 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-6xl h-[90dvh] rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <header className="px-4 py-3 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-2 bg-[var(--bg)]">
          <div className="flex items-center gap-2.5">
            <GitBranch className="w-5 h-5 text-[var(--primary)]" />
            <h3 className="text-sm sm:text-base font-bold text-[var(--ink)]">
              Mind Map & Flowchart Studio
            </h3>
            <div className="inline-flex p-0.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-xs">
              <button
                type="button"
                onClick={() => setKind('mindmap')}
                className={`px-2.5 py-1 rounded-md cursor-pointer ${
                  kind === 'mindmap' ? 'bg-[var(--surface)] font-semibold text-[var(--ink)]' : 'text-[var(--ink-dim)]'
                }`}
              >
                Mind Map
              </button>
              <button
                type="button"
                onClick={() => setKind('flowchart')}
                className={`px-2.5 py-1 rounded-md cursor-pointer ${
                  kind === 'flowchart' ? 'bg-[var(--surface)] font-semibold text-[var(--ink)]' : 'text-[var(--ink-dim)]'
                }`}
              >
                Flowchart
              </button>
            </div>
          </div>

          <button
            type="button"
            aria-label="Close Diagram Studio"
            onClick={onClose}
            className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Prompt + Actions Toolbar */}
        <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-2)]/40 flex flex-wrap items-center gap-2">
          <input
            type="text"
            data-testid="diagram-prompt-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleGenerate()}
            placeholder={`Describe the ${kind} you want Gemini to build…`}
            className="flex-1 min-w-[220px] px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-xs sm:text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
          />
          <button
            type="button"
            data-testid="diagram-generate-btn"
            disabled={loading || !prompt.trim()}
            onClick={() => void handleGenerate()}
            className="px-3.5 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>Generate with AI</span>
          </button>

          <button
            type="button"
            onClick={handleAddNode}
            className="px-2.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-medium text-[var(--ink)] inline-flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Node</span>
          </button>

          <button
            type="button"
            onClick={handleDeleteSelected}
            className="px-2.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-medium text-[var(--ink-dim)] hover:text-rose-500 inline-flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            data-testid="diagram-save-btn"
            onClick={() => void handleSave()}
            className="px-2.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-medium text-[var(--ink)] inline-flex items-center gap-1 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5 text-emerald-500" />
            <span>Save</span>
          </button>

          <button
            type="button"
            data-testid="diagram-export-png-btn"
            onClick={() => void handleExport('png')}
            className="px-2.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-medium text-[var(--ink)] inline-flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>PNG</span>
          </button>

          <button
            type="button"
            data-testid="diagram-export-svg-btn"
            onClick={() => void handleExport('svg')}
            className="px-2.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-medium text-[var(--ink)] inline-flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>SVG</span>
          </button>
        </div>

        {errorMsg && (
          <div
            data-testid="diagram-error-banner"
            className="mx-4 mt-2.5 px-3.5 py-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-500 text-xs flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Inline node rename bar */}
        {editingNodeId && (
          <div className="mx-4 mt-2 px-3 py-2 rounded-xl border border-[var(--primary)] bg-[var(--primary-soft)] flex items-center gap-2 text-xs">
            <span className="font-semibold text-[var(--ink)]">Rename Node:</span>
            <input
              type="text"
              autoFocus
              value={editingLabel}
              onChange={(e) => setEditingLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setNodes((prev) =>
                    prev.map((n) =>
                      n.id === editingNodeId
                        ? { ...n, data: { ...n.data, label: editingLabel } }
                        : n
                    )
                  );
                  setEditingNodeId(null);
                }
              }}
              className="flex-1 px-2.5 py-1 rounded bg-[var(--bg)] border border-[var(--border)] text-[var(--ink)] outline-none"
            />
            <button
              type="button"
              onClick={() => {
                setNodes((prev) =>
                  prev.map((n) =>
                    n.id === editingNodeId
                      ? { ...n, data: { ...n.data, label: editingLabel } }
                      : n
                  )
                );
                setEditingNodeId(null);
              }}
              className="px-2.5 py-1 rounded bg-[var(--primary)] text-white font-semibold cursor-pointer"
            >
              Apply
            </button>
          </div>
        )}

        {/* Canvas + Saved List */}
        <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
          <div ref={flowWrapperRef} className="flex-1 h-full min-h-0 bg-white dark:bg-[#141417]">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeDoubleClick={(_e, node) => {
                setEditingNodeId(node.id);
                setEditingLabel(String(node.data?.label || ''));
              }}
              fitView
            >
              <Background />
              <Controls />
              <MiniMap />
            </ReactFlow>
          </div>

          {savedDiagrams.length > 0 && (
            <aside className="hidden md:flex w-56 border-l border-[var(--border)] bg-[var(--surface)] flex-col p-2.5 gap-1.5 overflow-y-auto">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-dim)] px-1">
                Saved ({savedDiagrams.length})
              </div>
              {savedDiagrams.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setTitle(d.title);
                    setKind(d.kind);
                    setNodes(
                      d.nodes.map((n) => ({
                        id: n.id,
                        position: { x: n.x, y: n.y },
                        data: { label: n.label },
                        style: { borderRadius: 12, padding: '8px 14px', fontSize: 13 },
                      }))
                    );
                    setEdges(
                      d.edges.map((e) => ({
                        id: e.id,
                        source: e.source,
                        target: e.target,
                        label: e.label,
                      }))
                    );
                  }}
                  className="text-left px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--surface-2)] text-xs cursor-pointer"
                >
                  <div className="font-semibold text-[var(--ink)] truncate">{d.title}</div>
                  <div className="text-[10px] text-[var(--ink-dim)] uppercase">{d.kind}</div>
                </button>
              ))}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
};
