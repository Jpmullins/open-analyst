import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, ChevronRight, Loader2, CheckCircle, XCircle, Terminal } from "lucide-react";

/**
 * SubagentCard renders a single subagent's work inline in the chat.
 *
 * Designed to look like Claude Code's subagent display:
 * - Compact header with colored indicator, type label, and status
 * - While running: shows what it's doing in natural language
 * - When complete: shows summary, expandable for detail
 */

interface SubagentData {
  id?: string;
  toolCall?: {
    id?: string;
    name?: string;
    args?: Record<string, unknown>;
  };
  status?: string;
  messages?: Array<{
    id?: string;
    type?: string;
    content?: unknown;
    tool_calls?: Array<{ name?: string; args?: Record<string, unknown> }>;
  }>;
  result?: string;
}

const SUBAGENT_STYLES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  reviewer: { label: "Reviewer", color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20" },
  retriever: { label: "Retriever", color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20" },
  researcher: { label: "Researcher", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  "argument-planner": { label: "Planner", color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/20" },
  drafter: { label: "Drafter", color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
  critic: { label: "Critic", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" },
  packager: { label: "Packager", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  publisher: { label: "Publisher", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  "general-purpose": { label: "Fallback", color: "text-neutral-400", bg: "bg-neutral-500/10", border: "border-neutral-500/20" },
};

function getSubagentType(sub: SubagentData): string {
  return String(sub.toolCall?.args?.subagent_type || sub.toolCall?.name || "agent");
}

function getTaskDescription(sub: SubagentData): string {
  return String(sub.toolCall?.args?.description || "").slice(0, 120);
}

function getLatestActivity(sub: SubagentData): string {
  const msgs = sub.messages || [];
  // Walk backwards to find the latest meaningful content
  for (let i = msgs.length - 1; i >= 0; i--) {
    const msg = msgs[i];
    if (!msg) continue;

    // If it's an AI message with tool calls, describe the tool
    if (msg.type === "ai" && msg.tool_calls?.length) {
      const lastTool = msg.tool_calls[msg.tool_calls.length - 1];
      const toolName = String(lastTool?.name || "").replace(/_/g, " ");
      const query = lastTool?.args?.query;
      if (query) return `${toolName}: "${String(query).slice(0, 60)}"`;
      return toolName;
    }

    // If it's an AI message with text content
    if (msg.type === "ai" && msg.content) {
      const text = typeof msg.content === "string"
        ? msg.content
        : Array.isArray(msg.content)
          ? (msg.content as Array<{ type?: string; text?: string }>)
              .filter((b) => b?.type === "text")
              .map((b) => b.text || "")
              .join("")
          : "";
      if (text.trim()) {
        return text.trim().slice(0, 200);
      }
    }
  }
  return "";
}

function StatusIndicator({ status }: { status: string }) {
  switch (status) {
    case "pending":
    case "running":
      return <Loader2 className="w-3 h-3 animate-spin" />;
    case "complete":
      return <CheckCircle className="w-3 h-3 text-green-400" />;
    case "error":
      return <XCircle className="w-3 h-3 text-red-400" />;
    default:
      return <Loader2 className="w-3 h-3 animate-spin" />;
  }
}

export function SubagentCard({ subagent }: { subagent: SubagentData }) {
  const [expanded, setExpanded] = useState(false);
  const subType = getSubagentType(subagent);
  const style = SUBAGENT_STYLES[subType] || SUBAGENT_STYLES["general-purpose"];
  const status = subagent.status || "pending";
  const isActive = status === "pending" || status === "running";
  const activity = getLatestActivity(subagent);
  const taskDesc = getTaskDescription(subagent);

  return (
    <div className={`rounded-lg border ${style.border} ${style.bg} overflow-hidden`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
      >
        <StatusIndicator status={status} />
        <span className={`text-xs font-semibold ${style.color}`}>{style.label}</span>
        <span className="text-xs text-text-muted flex-1 truncate">
          {isActive
            ? activity || taskDesc || "Working…"
            : status === "complete"
              ? "Done"
              : "Failed"}
        </span>
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-text-muted shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-text-muted shrink-0" />
        )}
      </button>

      {/* Running: show live activity */}
      {isActive && activity && !expanded && (
        <div className="px-3 pb-2">
          <p className="text-xs text-text-secondary leading-relaxed line-clamp-2">
            {activity}
          </p>
        </div>
      )}

      {/* Complete: show result summary */}
      {status === "complete" && subagent.result && !expanded && (
        <div className="px-3 pb-2">
          <p className="text-xs text-text-secondary leading-relaxed line-clamp-3">
            {subagent.result.slice(0, 200)}{subagent.result.length > 200 ? "…" : ""}
          </p>
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-current/10 mt-1 pt-2 space-y-2">
          {/* Task description */}
          {taskDesc && (
            <div className="text-[11px] text-text-muted">
              <span className="font-medium">Task:</span> {taskDesc}
            </div>
          )}

          {/* Full result as markdown */}
          {subagent.result && (
            <div className="prose prose-sm prose-invert max-w-none text-xs">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {subagent.result}
              </ReactMarkdown>
            </div>
          )}

          {/* Tool call history */}
          {(subagent.messages || []).length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-medium text-text-muted uppercase tracking-wider">Activity</div>
              {(subagent.messages || []).map((msg, idx) => {
                if (msg.type === "ai" && msg.tool_calls?.length) {
                  return (
                    <div key={msg.id || idx} className="flex items-center gap-1.5 text-[11px] text-text-muted">
                      <Terminal className="w-2.5 h-2.5 shrink-0" />
                      {msg.tool_calls.map((tc, i) => (
                        <span key={i} className="font-mono">
                          {tc.name?.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Renders multiple subagent cards for a single supervisor message.
 * Parallel subagents appear side-by-side on wide screens.
 */
export function SubagentCards({ subagents }: { subagents: SubagentData[] }) {
  if (!subagents || subagents.length === 0) return null;

  return (
    <div className={`${subagents.length > 1 ? "grid grid-cols-1 md:grid-cols-2 gap-2" : "space-y-2"}`}>
      {subagents.map((sub, idx) => (
        <SubagentCard key={sub.id || sub.toolCall?.id || idx} subagent={sub} />
      ))}
    </div>
  );
}
