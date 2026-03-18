import { useState, useCallback } from "react";
import { CheckCircle, XCircle, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";

interface SourceItem {
  index: number;
  title: string;
  authors?: string[];
  venue?: string;
  year?: string;
  abstract?: string;
  doi?: string | null;
  url?: string | null;
  citation_count?: number;
}

interface InterruptValue {
  type: string;
  query?: string;
  total_found?: number;
  sources?: SourceItem[];
  message?: string;
  url?: string;
  title?: string;
  // For tool-level interrupts (execute_command, publish)
  name?: string;
  args?: Record<string, unknown>;
  [key: string]: unknown;
}

interface InterruptCardProps {
  interrupt: { value: InterruptValue };
  onResume: (value: Record<string, unknown>) => void;
  isProcessing?: boolean;
}

function SourceCollectionCard({
  interrupt,
  onResume,
  isProcessing,
}: {
  interrupt: InterruptValue;
  onResume: (value: Record<string, unknown>) => void;
  isProcessing?: boolean;
}) {
  const sources = interrupt.sources || [];
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(sources.map((s) => s.index))
  );
  const [expandedAbstracts, setExpandedAbstracts] = useState<Set<number>>(new Set());

  const toggleAll = useCallback(() => {
    if (selected.size === sources.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sources.map((s) => s.index)));
    }
  }, [selected.size, sources]);

  const toggleOne = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const toggleAbstract = useCallback((index: number) => {
    setExpandedAbstracts((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-900/10 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-amber-300">
          Found {interrupt.total_found || sources.length} sources for &ldquo;{interrupt.query}&rdquo;
        </h3>
        <button
          onClick={toggleAll}
          className="text-xs text-amber-400 hover:text-amber-300 underline"
          disabled={isProcessing}
        >
          {selected.size === sources.length ? "Deselect all" : "Select all"}
        </button>
      </div>

      <div className="max-h-80 overflow-y-auto space-y-2">
        {sources.map((source) => (
          <div
            key={source.index}
            className={`rounded-lg border p-3 transition-colors cursor-pointer ${
              selected.has(source.index)
                ? "border-amber-500/40 bg-amber-900/20"
                : "border-neutral-700 bg-neutral-900/50 opacity-60"
            }`}
            onClick={() => toggleOne(source.index)}
          >
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={selected.has(source.index)}
                onChange={() => toggleOne(source.index)}
                className="mt-1 accent-amber-500"
                onClick={(e) => e.stopPropagation()}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white leading-snug">
                  {source.title}
                </div>
                <div className="text-xs text-neutral-400 mt-0.5">
                  {source.authors?.slice(0, 3).join(", ")}
                  {(source.authors?.length || 0) > 3 ? " et al." : ""}
                  {source.venue ? ` · ${source.venue}` : ""}
                  {source.year ? ` · ${source.year}` : ""}
                  {source.citation_count ? ` · ${source.citation_count} citations` : ""}
                </div>
                {source.abstract && (
                  <div className="mt-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleAbstract(source.index);
                      }}
                      className="text-xs text-neutral-500 hover:text-neutral-300 flex items-center gap-0.5"
                    >
                      {expandedAbstracts.has(source.index) ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                      Abstract
                    </button>
                    {expandedAbstracts.has(source.index) && (
                      <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                        {source.abstract}
                      </p>
                    )}
                  </div>
                )}
                {(source.doi || source.url) && (
                  <div className="flex gap-2 mt-1">
                    {source.doi && (
                      <a
                        href={`https://doi.org/${source.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        DOI <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                    {source.url && (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Link <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() =>
            onResume({ approved: true, approved_indices: Array.from(selected) })
          }
          disabled={isProcessing || selected.size === 0}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-green-800 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
        >
          <CheckCircle className="w-3.5 h-3.5" />
          Approve selected ({selected.size})
        </button>
        <button
          onClick={() => onResume({ approved: false })}
          disabled={isProcessing}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600/80 hover:bg-red-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
        >
          <XCircle className="w-3.5 h-3.5" />
          Reject all
        </button>
      </div>
    </div>
  );
}

function WebSourceCard({
  interrupt,
  onResume,
  isProcessing,
}: {
  interrupt: InterruptValue;
  onResume: (value: Record<string, unknown>) => void;
  isProcessing?: boolean;
}) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-900/10 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-amber-300">Add web source to project?</h3>
      <div className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-3">
        <div className="text-sm text-white">{interrupt.title || interrupt.url}</div>
        {interrupt.url && (
          <a
            href={interrupt.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-0.5 mt-1"
          >
            {interrupt.url} <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onResume({ approved: true })}
          disabled={isProcessing}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
        >
          <CheckCircle className="w-3.5 h-3.5" />
          Approve
        </button>
        <button
          onClick={() => onResume({ approved: false })}
          disabled={isProcessing}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600/80 hover:bg-red-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
        >
          <XCircle className="w-3.5 h-3.5" />
          Reject
        </button>
      </div>
    </div>
  );
}

function ToolApprovalCard({
  interrupt,
  onResume,
  isProcessing,
}: {
  interrupt: InterruptValue;
  onResume: (value: Record<string, unknown>) => void;
  isProcessing?: boolean;
}) {
  const toolName = interrupt.name || "action";
  const toolArgs = interrupt.args || {};

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-900/10 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-amber-300">
        Approve {toolName}?
      </h3>
      <pre className="text-xs bg-neutral-900 border border-neutral-700 rounded-lg p-3 overflow-x-auto text-neutral-300">
        {JSON.stringify(toolArgs, null, 2)}
      </pre>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onResume({ type: "approve" })}
          disabled={isProcessing}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
        >
          <CheckCircle className="w-3.5 h-3.5" />
          Approve
        </button>
        <button
          onClick={() => onResume({ type: "reject", message: "User rejected" })}
          disabled={isProcessing}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600/80 hover:bg-red-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
        >
          <XCircle className="w-3.5 h-3.5" />
          Reject
        </button>
      </div>
    </div>
  );
}

export function InterruptCard({ interrupt, onResume, isProcessing }: InterruptCardProps) {
  const value = interrupt.value;

  if (value.type === "source_collection_approval") {
    return (
      <SourceCollectionCard
        interrupt={value}
        onResume={onResume}
        isProcessing={isProcessing}
      />
    );
  }

  if (value.type === "web_source_approval") {
    return (
      <WebSourceCard
        interrupt={value}
        onResume={onResume}
        isProcessing={isProcessing}
      />
    );
  }

  // Default: generic tool approval (execute_command, publish_*)
  return (
    <ToolApprovalCard
      interrupt={value}
      onResume={onResume}
      isProcessing={isProcessing}
    />
  );
}
