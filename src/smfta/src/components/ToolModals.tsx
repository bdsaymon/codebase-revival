import React, { useState, useEffect } from 'react';
import {
  X,
  Image as ImageIcon,
  BookOpen,
  Code,
  Swords,
  BarChart3,
  Sparkles,
  Play,
  Trophy,
  Loader2,
  PhoneOff,
  Mic,
  Plus,
  Pencil,
  Trash2,
  Send,
  Search,
  Check,
} from 'lucide-react';
import { ChatSession } from '../types';
import {
  PROMPT_BANK,
  CHANGELOG,
  APP_VERSION,
} from '../utils/helpers';
import {
  CustomPrompt,
  addCustomPrompt,
  deleteCustomPrompt,
  loadCustomPrompts,
  promptErrorMessage,
  saveCustomPrompts,
  updateCustomPrompt,
} from '../utils/customPrompts';

// 1. IMAGE STUDIO MODAL (Generate & Edit via Gemini Image API)
export const ImageStudioModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (
    prompt: string,
    style: string,
    size: number,
    referenceImage?: { base64: string; mimeType: string; name: string }
  ) => void;
}> = ({ isOpen, onClose, onGenerate }) => {
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('photorealistic, cinematic lighting, 8k');
  const [size, setSize] = useState(768);
  const [refImage, setRefImage] = useState<{
    base64: string;
    mimeType: string;
    name: string;
    dataUrl: string;
  } | null>(null);

  if (!isOpen) return null;

  const handlePickReference = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      const base64 = res.includes(',') ? res.split(',')[1] : '';
      if (base64) {
        setRefImage({
          base64,
          mimeType: file.type || 'image/png',
          name: file.name,
          dataUrl: res,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      data-testid="image-studio-modal"
      className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 sm:p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold flex items-center gap-2 text-[var(--text)]">
            <ImageIcon className="w-5 h-5 text-[var(--primary)]" />
            <span>Image Studio (Generate & Edit)</span>
          </h3>
          <button
            type="button"
            aria-label="Close Image Studio"
            onClick={onClose}
            className="text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-2)] uppercase mb-1">
              {refImage ? 'Edit Instruction' : 'Image Description'}
            </label>
            <input
              type="text"
              data-testid="image-studio-prompt-input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                refImage
                  ? 'e.g. Change background to snowy mountains at golden hour'
                  : 'e.g. Futuristic Dhaka skyline in monsoon rain at dusk'
              }
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-2)] uppercase mb-1">
              Reference Image (Optional — for editing)
            </label>
            <div className="flex items-center gap-2">
              <label className="flex-1 px-3 py-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] text-xs text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer truncate">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePickReference}
                  className="hidden"
                />
                {refImage ? `Uploaded: ${refImage.name}` : 'Upload image to edit…'}
              </label>
              {refImage && (
                <button
                  type="button"
                  onClick={() => setRefImage(null)}
                  className="px-2.5 py-2 rounded-xl border border-[var(--border)] text-xs text-rose-500 cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
            {refImage && (
              <img
                src={refImage.dataUrl}
                alt="Reference preview"
                className="mt-2 h-24 rounded-lg border border-[var(--border)] object-cover"
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-2)] uppercase mb-1">
              Art Style
            </label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none"
            >
              <option value="photorealistic, cinematic lighting, 8k">
                Cinematic Realism
              </option>
              <option value="anime style, vibrant, studio ghibli inspired">
                Anime & Illustration
              </option>
              <option value="oil painting, artistic brush strokes, canvas texture">
                Fine Oil Painting
              </option>
              <option value="3d render, octane, unreal engine, soft studio light">
                3D Octane Render
              </option>
              <option value="isometric vector illustration, clean flat colors">
                Isometric Vector Art
              </option>
            </select>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
            <select
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none"
            >
              <option value={512}>Fast (1:1 · 512)</option>
              <option value={768}>HD (1:1 · 768)</option>
              <option value={1024}>Ultra (1:1 · 1024)</option>
            </select>

            <button
              type="button"
              data-testid="image-studio-generate-btn"
              onClick={() => {
                if (!prompt.trim()) return;
                onGenerate(
                  prompt.trim(),
                  style,
                  size,
                  refImage
                    ? {
                        base64: refImage.base64,
                        mimeType: refImage.mimeType,
                        name: refImage.name,
                      }
                    : undefined
                );
                setPrompt('');
                setRefImage(null);
                onClose();
              }}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] text-white px-4 py-2.5 text-sm font-semibold hover:opacity-90 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>{refImage ? 'Edit Image' : 'Generate'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// 2. PROMPT BANK MODAL — built-in library + full custom prompt CRUD
export const PromptBankModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  /** Send the prompt immediately as a chat request. */
  onSelectPrompt: (prompt: string) => void;
  /** Apply the prompt to the composer without sending (edit before sending). */
  onUsePrompt?: (prompt: string) => void;
  notify?: (msg: string) => void;
}> = ({ isOpen, onClose, onSelectPrompt, onUsePrompt, notify }) => {
  const [customPrompts, setCustomPrompts] = useState<CustomPrompt[]>([]);
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState('Custom');
  const [formText, setFormText] = useState('');
  const [formError, setFormError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCustomPrompts(loadCustomPrompts());
      setQuery('');
      setShowForm(false);
      setEditingId(null);
      setFormError('');
      setConfirmDeleteId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const q = query.trim().toLowerCase();
  const matches = (title: string, text: string, category: string) =>
    !q ||
    title.toLowerCase().includes(q) ||
    text.toLowerCase().includes(q) ||
    category.toLowerCase().includes(q);

  const resetForm = () => {
    setFormTitle('');
    setFormCategory('Custom');
    setFormText('');
    setFormError('');
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (p: CustomPrompt) => {
    setEditingId(p.id);
    setFormTitle(p.title);
    setFormCategory(p.category || 'Custom');
    setFormText(p.text);
    setFormError('');
    setShowForm(true);
  };

  const handleSave = () => {
    const draft = {
      title: formTitle,
      text: formText,
      category: formCategory || 'Custom',
    };
    if (editingId) {
      const result = updateCustomPrompt(customPrompts, editingId, draft);
      if (!result.ok) {
        setFormError(promptErrorMessage(result.error));
        return;
      }
      setCustomPrompts(result.list);
      saveCustomPrompts(result.list);
      notify?.('Prompt updated');
    } else {
      const result = addCustomPrompt(customPrompts, draft);
      if (!result.ok) {
        setFormError(promptErrorMessage(result.error));
        return;
      }
      setCustomPrompts(result.list);
      saveCustomPrompts(result.list);
      notify?.('Prompt saved to your library');
    }
    resetForm();
  };

  const handleDelete = (id: string) => {
    const next = deleteCustomPrompt(customPrompts, id);
    setCustomPrompts(next);
    saveCustomPrompts(next);
    setConfirmDeleteId(null);
    if (editingId === id) resetForm();
    notify?.('Prompt deleted');
  };

  const visibleBuiltins = PROMPT_BANK.filter((item) =>
    matches(item.title, item.prompt, item.category)
  );
  const visibleCustom = customPrompts.filter((p) =>
    matches(p.title, p.text, p.category)
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-2xl rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold flex items-center gap-2 text-[var(--text)]">
            <BookOpen className="w-5 h-5 text-amber-500" />
            <span>Prompt Library</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)] pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search prompts…"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] pl-9 pr-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
          />
        </div>

        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-3)]">
            My prompts ({customPrompts.length})
          </h4>
          <button
            type="button"
            onClick={() => {
              if (showForm) resetForm();
              else {
                setShowForm(true);
                setEditingId(null);
                setFormError('');
              }
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)] hover:opacity-80 cursor-pointer"
          >
            {showForm ? (
              <>
                <X className="w-3.5 h-3.5" /> Close
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" /> New prompt
              </>
            )}
          </button>
        </div>

        {showForm && (
          <div className="rounded-xl border border-[var(--primary-border,var(--border))] bg-[var(--surface-2)] p-3 mb-3 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Title (required)"
                maxLength={80}
                className="sm:col-span-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
              />
              <input
                type="text"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                placeholder="Category"
                maxLength={40}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
              />
            </div>
            <textarea
              value={formText}
              onChange={(e) => setFormText(e.target.value)}
              placeholder="Write the prompt text. Use it in the composer or send it directly."
              rows={4}
              maxLength={4000}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)] resize-y"
            />
            {formError && (
              <p className="text-xs text-rose-400 font-medium">{formError}</p>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] text-white px-3.5 py-2 text-xs font-semibold hover:opacity-90 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                {editingId ? 'Save changes' : 'Save prompt'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-[var(--border)] px-3.5 py-2 text-xs font-semibold text-[var(--text-2)] hover:bg-[var(--surface)] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {visibleCustom.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
            {visibleCustom.map((p) => (
              <div
                key={p.id}
                className="flex flex-col gap-2 p-3 rounded-xl border border-[var(--primary-border,var(--border))] bg-[var(--surface-2)] text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="block text-xs font-semibold text-[var(--text)] truncate">
                      {p.title}
                    </span>
                    <span className="text-[10px] text-[var(--text-3)]">
                      {p.category || 'Custom'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      title="Edit"
                      onClick={() => startEdit(p)}
                      className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--surface)] cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      onClick={() =>
                        setConfirmDeleteId(confirmDeleteId === p.id ? null : p.id)
                      }
                      className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-rose-400 hover:bg-[var(--surface)] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-[11px] leading-relaxed text-[var(--text-3)] line-clamp-3 whitespace-pre-wrap">
                  {p.text}
                </p>
                {confirmDeleteId === p.id && (
                  <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-rose-300 font-medium">
                      Delete this prompt?
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id)}
                        className="rounded-md bg-rose-500 text-white px-2.5 py-1 text-[11px] font-semibold cursor-pointer"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--text-2)] cursor-pointer"
                      >
                        Keep
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex gap-2 mt-auto">
                  <button
                    type="button"
                    onClick={() => {
                      onUsePrompt?.(p.text);
                      onClose();
                    }}
                    disabled={!onUsePrompt}
                    className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text)] hover:border-[var(--primary)] disabled:opacity-40 cursor-pointer"
                  >
                    Use in composer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectPrompt(p.text);
                      onClose();
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-[var(--primary)] text-white px-2.5 py-1.5 text-[11px] font-semibold hover:opacity-90 cursor-pointer"
                  >
                    <Send className="w-3 h-3" /> Send now
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-3)] mb-2">
          Built-in library
        </h4>
        {visibleBuiltins.length === 0 && visibleCustom.length === 0 && (
          <p className="text-sm text-[var(--text-3)] py-6 text-center">
            No prompts match “{query}”.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {visibleBuiltins.map((item, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--text)]">
                  {item.title}
                </span>
                <span className="text-[10px] text-[var(--text-3)] shrink-0">
                  {item.category}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-[var(--text-3)] line-clamp-2">
                {item.prompt}
              </p>
              <div className="flex gap-2 mt-auto">
                <button
                  type="button"
                  onClick={() => {
                    onUsePrompt?.(item.prompt);
                    onClose();
                  }}
                  disabled={!onUsePrompt}
                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text)] hover:border-[var(--primary)] disabled:opacity-40 cursor-pointer"
                >
                  Use in composer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSelectPrompt(item.prompt);
                    onClose();
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-[var(--primary)] text-white px-2.5 py-1.5 text-[11px] font-semibold hover:opacity-90 cursor-pointer"
                >
                  <Send className="w-3 h-3" /> Send now
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// 3. CODE LAB MODAL (HTML + Live JS Console)
export const CodeLabModal: React.FC<{
  isOpen: boolean;
  initialCode: string;
  onClose: () => void;
  onFixWithAi?: (payload: { filename: string; code: string; error: string }) => void;
}> = ({ isOpen, initialCode, onClose, onFixWithAi }) => {
  const defaultCode = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;text-align:center;padding:32px;background:#f8fafc;color:#0f172a;">
  <h2 style="color:#4f46e5;">SMFTA Code Lab v${APP_VERSION}</h2>
  <p>Edit HTML, CSS, or pure JavaScript and run live!</p>
  <button onclick="document.body.style.background='#dcfce7'" style="padding:10px 20px;background:#4f46e5;color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:600;">
    Test live action
  </button>
</body>
</html>`;

  const [code, setCode] = useState(initialCode || defaultCode);
  const [srcDoc, setSrcDoc] = useState('');
  const [logs, setLogs] = useState<Array<{ type: string; text: string }>>([]);

  useEffect(() => {
    if (initialCode && initialCode.trim()) {
      setCode(initialCode);
      setLogs([]);
    }
  }, [initialCode]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data && e.data.smftaLab === 1) {
        setLogs((prev) => [
          ...prev.slice(-80),
          { type: e.data.t || 'log', text: String(e.data.a || '') },
        ]);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleRun = () => {
    setLogs([]);
    const trimmed = code.trim();
    const labTelemetryScript = `<script>
      (function(){
        var S=function(t,a){try{parent.postMessage({smftaLab:1,t:t,a:a},"*")}catch(_){}};
        ["log","info","warn","error"].forEach(function(k){
          var orig=console[k];
          console[k]=function(){
            S(k,Array.prototype.map.call(arguments,function(v){
              try{return typeof v==="object"?JSON.stringify(v):String(v)}catch(e){return String(v)}
            }).join(" "));
            if(orig)try{orig.apply(console,arguments)}catch(_){}
          };
        });
        window.addEventListener("error",function(e){S("error",e.message||(e.error&&e.error.message)||"Runtime error")});
        window.addEventListener("unhandledrejection",function(e){var r=e.reason;S("error","Unhandled Promise: "+(r&&r.message?r.message:String(r)))});
      })();
    </script>`;

    if (!trimmed.includes('<') && trimmed.length > 0) {
      const safeScript = trimmed.replace(/<\/script>/gi, '<\\/script>');
      const jsRunnerHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">${labTelemetryScript}</head><body><script>
        try {
          ${safeScript}
        } catch(e) {
          console.error(e && e.message ? e.message : String(e));
        }
      </script></body></html>`;
      setSrcDoc(jsRunnerHtml);
    } else if (/<head[^>]*>/i.test(code)) {
      setSrcDoc(code.replace(/<head[^>]*>/i, (m) => `${m}\n${labTelemetryScript}`));
    } else {
      setSrcDoc(`${labTelemetryScript}\n${code}`);
    }
  };

  const firstError = logs.find((l) => l.type === 'error')?.text || '';

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-3xl rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 sm:p-5 shadow-xl space-y-3 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold flex items-center gap-2 text-[var(--text)]">
            <Code className="w-5 h-5 text-emerald-500" />
            <span>Code Lab — Live HTML & JS Sandbox</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          className="w-full h-48 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 font-mono-num text-xs text-[var(--text)] outline-none focus:border-[var(--primary)] resize-y"
          placeholder="Write HTML/CSS or pure JavaScript (console.log) here..."
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRun}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] text-white py-2.5 text-sm font-semibold hover:opacity-90 cursor-pointer"
          >
            <Play className="w-4 h-4" /> Run Code
          </button>
          {firstError && onFixWithAi && (
            <button
              type="button"
              onClick={() => {
                onFixWithAi({
                  filename: code.trim().includes('<') ? 'index.html' : 'script.js',
                  code,
                  error: firstError,
                });
                onClose();
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-500 hover:bg-rose-500/25 px-4 py-2.5 text-xs font-semibold cursor-pointer shrink-0"
            >
              <Sparkles className="w-4 h-4" />
              <span>Fix with AI</span>
            </button>
          )}
        </div>

        {srcDoc.trim().length > 0 ? (
          <iframe
            title="code-lab-preview"
            sandbox="allow-scripts"
            srcDoc={srcDoc}
            className="w-full h-56 rounded-xl border border-[var(--border)] bg-white block"
          />
        ) : (
          <div className="w-full h-32 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-center text-xs text-[var(--text-2)]">
            Click &ldquo;Run Code&rdquo; above to execute in the isolated sandbox.
          </div>
        )}

        {logs.length > 0 && (
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 font-mono-num text-xs text-slate-200 max-h-36 overflow-y-auto space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
              Console Output
            </div>
            {logs.map((l, idx) => (
              <div
                key={idx}
                className={
                  l.type === 'error'
                    ? 'text-rose-400'
                    : l.type === 'warn'
                    ? 'text-amber-400'
                    : 'text-emerald-300'
                }
              >
                {l.type !== 'log' ? `[${l.type}] ` : '> '}
                {l.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// 4. BATTLE ARENA MODAL (SMFTA-1 Flash vs SMFTA-2 Ultra)
export const BattleArenaModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}> = ({ isOpen, onClose, onToast }) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultA, setResultA] = useState<{
    text: string;
    ms: number;
    words: number;
  } | null>(null);
  const [resultB, setResultB] = useState<{
    text: string;
    ms: number;
    words: number;
  } | null>(null);
  const [wins, setWins] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem('smfta_battle_wins') || '{}');
    } catch {
      return {};
    }
  });

  if (!isOpen) return null;

  const handleFight = async () => {
    if (!prompt.trim()) {
      onToast('আগে একটি প্রশ্ন লিখুন');
      return;
    }
    setLoading(true);
    setResultA(null);
    setResultB(null);
    try {
      const res = await fetch('/api/battle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Battle failed');
      }
      setResultA(data.engineA);
      setResultB(data.engineB);
    } catch (err: unknown) {
      console.warn(
        '[BattleArenaModal.handleFight]',
        err instanceof Error ? err.message : 'Battle failed'
      );
      onToast(err instanceof Error ? err.message : 'Battle failed');
    } finally {
      setLoading(false);
    }
  };

  const recordWin = (engineName: string) => {
    const next = { ...wins, [engineName]: (wins[engineName] || 0) + 1 };
    setWins(next);
    localStorage.setItem('smfta_battle_wins', JSON.stringify(next));
    onToast(`${engineName} won`);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-3xl rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 sm:p-5 shadow-xl space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold flex items-center gap-2 text-[var(--text)]">
              <Swords className="w-5 h-5 text-rose-500" />
              <span>Battle Arena — দুই ইঞ্জিন, এক প্রশ্ন</span>
            </h3>
            <p className="text-xs text-[var(--text-2)] mt-0.5">
              Compare SMFTA-1 Flash vs SMFTA-3 Ultra side-by-side in real
              time
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleFight()}
            placeholder="একই প্রশ্ন দুই ইঞ্জিনকে করুন — যেমন: বাংলাদেশ নিয়ে ৪ লাইনের কবিতা লেখো"
            className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
          />
          <button
            type="button"
            disabled={loading}
            onClick={handleFight}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] text-white px-5 py-2.5 text-sm font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Fighting...
              </>
            ) : (
              <>
                <Swords className="w-4 h-4" /> Fight!
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Engine A */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] flex flex-col overflow-hidden">
            <div className="px-3.5 py-2.5 bg-[var(--surface-3)] border-b border-[var(--border)] flex items-center justify-between text-xs font-bold">
              <span>SMFTA-1 Flash</span>
              {resultA && (
                <span className="font-mono-num text-[11px] text-emerald-600 dark:text-emerald-400">
                  {(resultA.ms / 1000).toFixed(1)}s · {resultA.words} words
                </span>
              )}
            </div>
            <div className="p-3.5 text-xs leading-relaxed flex-1 min-h-[140px] max-h-72 overflow-y-auto whitespace-pre-wrap text-[var(--text)]">
              {loading ? (
                <span className="text-[var(--text-3)] animate-pulse">
                  Generating response...
                </span>
              ) : resultA ? (
                resultA.text
              ) : (
                <span className="text-[var(--text-3)]">Ready for battle…</span>
              )}
            </div>
            {resultA && (
              <button
                type="button"
                onClick={() => recordWin('SMFTA-1 Flash')}
                className="w-full py-2 border-t border-[var(--border)] bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trophy className="w-3.5 h-3.5" /> Vote SMFTA-1 Flash Winner (
                {wins['SMFTA-1 Flash'] || 0})
              </button>
            )}
          </div>

          {/* Engine B */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] flex flex-col overflow-hidden">
            <div className="px-3.5 py-2.5 bg-[var(--surface-3)] border-b border-[var(--border)] flex items-center justify-between text-xs font-bold">
              <span>SMFTA-3 Ultra</span>
              {resultB && (
                <span className="font-mono-num text-[11px] text-emerald-600 dark:text-emerald-400">
                  {(resultB.ms / 1000).toFixed(1)}s · {resultB.words} words
                </span>
              )}
            </div>
            <div className="p-3.5 text-xs leading-relaxed flex-1 min-h-[140px] max-h-72 overflow-y-auto whitespace-pre-wrap text-[var(--text)]">
              {loading ? (
                <span className="text-[var(--text-3)] animate-pulse">
                  Generating response...
                </span>
              ) : resultB ? (
                resultB.text
              ) : (
                <span className="text-[var(--text-3)]">Ready for battle…</span>
              )}
            </div>
            {resultB && (
              <button
                type="button"
                onClick={() => recordWin('SMFTA-3 Ultra')}
                className="w-full py-2 border-t border-[var(--border)] bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trophy className="w-3.5 h-3.5" /> Vote SMFTA-3 Ultra Winner (
                {wins['SMFTA-3 Ultra'] || 0})
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// 5. STATS & WHAT'S NEW MODAL
export const StatsAndWhatsNewModal: React.FC<{
  mode: 'stats' | 'whatsnew' | null;
  onClose: () => void;
  chats: ChatSession[];
  usageToday: number;
}> = ({ mode, onClose, chats, usageToday }) => {
  if (!mode) return null;

  let totalMsgs = 0;
  let totalWords = 0;
  let totalEdits = 0;
  const activeDays = new Set<string>();

  chats.forEach((c) =>
    c.msgs.forEach((m) => {
      totalMsgs++;
      totalWords += (m.text || '').trim().split(/\s+/).filter(Boolean).length;
      totalEdits += m.revisions?.length || 0;
      if (m.ts) activeDays.add(new Date(m.ts).toDateString());
    })
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 sm:p-6 shadow-xl max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold flex items-center gap-2 text-[var(--text)]">
            {mode === 'stats' ? (
              <>
                <BarChart3 className="w-5 h-5 text-[var(--primary)]" />
                <span>My Workspace Stats</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 text-[var(--primary)]" />
                <span>What's New in SMFTA AI Pro</span>
              </>
            )}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {mode === 'stats' ? (
          <div className="grid grid-cols-2 gap-3">
            {[
              { n: chats.length, l: 'Total Chats' },
              { n: totalMsgs, l: 'Messages' },
              { n: totalWords.toLocaleString(), l: 'Total Words' },
              { n: totalEdits, l: 'Inline Edits' },
              { n: activeDays.size, l: 'Active Days' },
              { n: usageToday, l: 'Sent Today' },
            ].map((s, i) => (
              <div
                key={i}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-center"
              >
                <div className="text-2xl font-bold font-mono-num text-[var(--primary)]">
                  {s.n}
                </div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-2)] mt-1">
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {CHANGELOG.map((rel, i) => (
              <div
                key={rel.v}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3.5"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono-num text-xs font-bold text-[var(--primary)]">
                    v{rel.v} {i === 0 ? '· LATEST' : ''}
                  </span>
                  <span className="text-[11px] text-[var(--text-3)]">
                    {rel.d}
                  </span>
                </div>
                <ul className="space-y-1.5 pl-4 list-disc text-xs text-[var(--text)] leading-relaxed">
                  {rel.items.map((it, idx) => (
                    <li key={idx}>{it}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// 6. VOICE CALL OVERLAY
export const VoiceCallOverlay: React.FC<{
  isOpen: boolean;
  isListening: boolean;
  isGenerating: boolean;
  lastUserText: string;
  lastAiText: string;
  onToggleMic: () => void;
  onEndCall: () => void;
}> = ({
  isOpen,
  isListening,
  isGenerating,
  lastUserText,
  lastAiText,
  onToggleMic,
  onEndCall,
}) => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setSeconds(0);
      return;
    }
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const formattedTime =
    String(Math.floor(seconds / 60)).padStart(2, '0') +
    ':' +
    String(seconds % 60).padStart(2, '0');

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col items-center justify-between p-6 sm:p-8 text-center">
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
          LIVE VOICE CONVERSATION
        </div>
        <div className="font-mono-num text-sm text-slate-400 mt-1">
          {formattedTime}
        </div>
      </div>

      <div className="flex flex-col items-center max-w-md w-full space-y-4">
        <div className="w-24 h-24 rounded-3xl bg-indigo-600 flex items-center justify-center text-4xl shadow-lg">
          ⚡
        </div>
        <div>
          <h3 className="text-xl font-bold">SMFTA AI Pro</h3>
          <p className="text-xs text-emerald-400 mt-1">
            {isGenerating
              ? 'Thinking & Preparing Voice...'
              : isListening
              ? 'Listening — speak naturally...'
              : 'Ready — tap Mic to speak'}
          </p>
        </div>

        <div className="w-full rounded-xl bg-slate-900 border border-slate-800 p-4 text-left text-xs space-y-2 min-h-[84px]">
          {lastUserText && (
            <div className="text-slate-400">
              <strong className="text-sky-400">You:</strong>{' '}
              {lastUserText.slice(0, 160)}
            </div>
          )}
          {lastAiText ? (
            <div className="text-slate-200">
              <strong className="text-indigo-400">SMFTA AI:</strong>{' '}
              {lastAiText.slice(0, 240)}
            </div>
          ) : (
            <div className="text-slate-500">
              Say something in Bengali or English — your conversation transcript
              appears here.
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onToggleMic}
          className={`inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold cursor-pointer transition-all ${
            isListening
              ? 'bg-amber-500 text-slate-950'
              : 'bg-indigo-600 text-white hover:bg-indigo-500'
          }`}
        >
          <Mic className="w-4 h-4" />
          {isListening ? 'Listening...' : 'Speak'}
        </button>
        <button
          type="button"
          onClick={onEndCall}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold cursor-pointer"
        >
          <PhoneOff className="w-4 h-4" />
          End Call
        </button>
      </div>
    </div>
  );
};
