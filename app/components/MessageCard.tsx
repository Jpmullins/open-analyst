import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, ChevronDown, ChevronRight, Copy, Download, ExternalLink, FileText, Loader2, Sparkles, Terminal } from "lucide-react";
import { useAppStore } from "~/lib/store";
import { formatRelativeTime } from "~/lib/format";
import type {
  ArtifactMeta,
  ContentBlock,
  Message,
  StatusContent,
  ToolResultContent,
  ToolUseContent,
} from "~/lib/types";

interface MessageCardProps {
  message: Message;
  isStreaming?: boolean;
}

function normalizeContent(content: unknown): ContentBlock[] {
  if (!Array.isArray(content)) {
    return [{ type: "text", text: String(content ?? "") }];
  }
  return content.filter(Boolean) as ContentBlock[];
}

function joinTextBlocks(blocks: ContentBlock[]): string {
  return blocks
    .filter((block): block is Extract<ContentBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ArtifactCard({ artifact }: { artifact: ArtifactMeta }) {
  const openFileViewer = useAppStore((state) => state.openFileViewer);

  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
      data-testid="artifact-card"
    >
      <div className="w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center">
        <FileText className="w-4 h-4 text-accent" />
      </div>
      <button
        type="button"
        className="flex-1 min-w-0 text-left"
        onClick={() => openFileViewer(artifact)}
      >
        <p className="text-sm font-medium text-text-primary truncate">
          {artifact.title || artifact.filename}
        </p>
        <p className="text-xs text-text-muted">{formatFileSize(artifact.size)}</p>
      </button>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => openFileViewer(artifact)}
          className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-surface-muted transition-colors text-text-muted hover:text-accent"
          title="Preview"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
        <a
          href={artifact.downloadUrl}
          className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-surface-muted transition-colors text-text-muted hover:text-accent"
          title="Download"
        >
          <Download className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}

function StatusBlock({ block }: { block: StatusContent }) {
  if (block.status === "error") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4a.75.75 0 011.5 0v3a.75.75 0 01-1.5 0V5zm.75 6.25a.75.75 0 100-1.5.75.75 0 000 1.5z"/>
        </svg>
        <span>{block.text}</span>
      </div>
    );
  }

  const tone =
    block.status === "completed"
      ? "border-success/30 bg-success/5 text-success"
      : "border-accent/30 bg-accent/5 text-accent";

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${tone}`}
    >
      {block.status === "running" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
      <span>{block.text}</span>
    </div>
  );
}

function ToolUseBlock({ block }: { block: ToolUseContent }) {
  const [expanded, setExpanded] = useState(false);
  const input = (block.input || {}) as Record<string, unknown>;
  const isTaskDelegation = block.name === "task";

  const summary = useMemo(() => {
    if (isTaskDelegation) {
      const subType = String(input.subagent_type || "agent");
      const desc = String(input.description || "").slice(0, 80);
      return `Delegating to ${subType}${desc ? `: ${desc}…` : ""}`;
    }
    if (block.name === "search_literature" || block.name === "search_project_documents") {
      return `Searching for "${input.query || '...'}"`;
    }
    if (block.name === "search_project_memories") {
      return `Searching memories for "${input.query || '...'}"`;
    }
    if (block.name === "read_project_document") {
      return `Reading document ${String(input.document_id || '...').slice(0, 12)}`;
    }
    if (block.name === "execute_command") {
      return `Running: ${input.command || '...'}`;
    }
    if (block.name === "save_canvas_markdown") {
      return `Saving canvas: ${input.title || 'draft'}`;
    }
    if (block.name === "stage_literature_collection") {
      return `Collecting sources for "${input.query || '...'}"`;
    }
    if (block.name === "stage_web_source") {
      return `Capturing: ${input.url || '...'}`;
    }
    if (block.name === "publish_canvas_document") {
      return "Publishing canvas document";
    }
    if (block.name === "publish_workspace_file") {
      return `Publishing: ${input.relative_path || 'file'}`;
    }
    if (block.name === "capture_artifact") {
      return `Capturing artifact: ${input.relativePath || input.title || 'file'}`;
    }
    if (block.name === "propose_project_memory") {
      return `Saving memory: ${input.title || 'note'}`;
    }
    if (block.name === "write_file") {
      return `Writing ${input.path || 'file'}`;
    }
    if (block.name === "write_todos") {
      return "Updating plan";
    }
    const firstVal = Object.values(input)[0];
    return firstVal ? String(firstVal).slice(0, 60) : block.name.replace(/_/g, " ");
  }, [block, input, isTaskDelegation]);

  // For task() delegations, don't show the expanded detail — the SubagentCard handles that
  if (isTaskDelegation && !expanded) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-text-muted">
        <Terminal className="w-3 h-3" />
        <span>{summary}</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-surface">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full px-4 py-2.5 flex items-center gap-3 bg-surface-muted hover:bg-surface-active transition-colors"
      >
        <Terminal className="w-3.5 h-3.5 text-accent shrink-0" />
        <div className="flex-1 text-left min-w-0">
          <span className="text-xs text-text-muted truncate">{summary}</span>
        </div>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
        )}
      </button>
      {expanded ? (
        <div className="px-4 py-3 text-xs space-y-1.5 border-t border-border">
          {Object.entries(input).map(([key, val]) => (
            <div key={key} className="flex gap-2">
              <span className="text-text-muted shrink-0 w-28 text-right">{key}:</span>
              <span className="text-text-secondary break-all">
                {typeof val === "string" && val.length > 200
                  ? `${val.slice(0, 200)}…`
                  : typeof val === "object"
                    ? JSON.stringify(val)
                    : String(val ?? "")}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ToolResultBlock({
  block,
  allBlocks,
}: {
  block: ToolResultContent;
  allBlocks: ContentBlock[];
}) {
  const [expanded, setExpanded] = useState(false);
  const toolUse = allBlocks.find(
    (candidate) =>
      candidate.type === "tool_use" && (candidate as ToolUseContent).id === block.toolUseId
  ) as ToolUseContent | undefined;

  // For task() results, the content is the subagent's summary — show it inline
  const isTaskResult = toolUse?.name === "task";

  const summary = useMemo(() => {
    if (block.isError) {
      const text = block.content.split("\n")[0] || "Tool failed";
      return `Failed: ${text}`;
    }
    if (block.artifacts?.length) {
      return `Produced ${block.artifacts.length} artifact${block.artifacts.length === 1 ? "" : "s"}`;
    }
    if (!block.content) {
      return "Completed";
    }
    // Try to extract a clean text summary (strip JSON wrappers)
    const trimmed = block.content.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === "object" && parsed.status) {
          return `${parsed.status}${parsed.count ? ` (${parsed.count} items)` : ""}`;
        }
      } catch { /* use raw */ }
    }
    return trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed;
  }, [block]);

  // For task() results, render the subagent's summary as markdown directly (no collapsible)
  if (isTaskResult && block.content && !block.isError) {
    return null; // SubagentCard handles displaying the result
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-surface">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full px-4 py-2.5 flex items-center gap-3 bg-surface-muted hover:bg-surface-active transition-colors"
      >
        {block.isError ? (
          <FileText className="w-3.5 h-3.5 text-error shrink-0" />
        ) : (
          <Check className="w-3.5 h-3.5 text-success shrink-0" />
        )}
        <div className="flex-1 min-w-0 text-left">
          <span className="text-xs text-text-muted truncate">{summary}</span>
        </div>
        {block.content && (
          expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
          )
        )}
      </button>
      {expanded && block.content ? (
        <div className="px-4 py-3 space-y-3 border-t border-border">
          <div className="prose prose-sm prose-invert max-w-none text-xs">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {block.content}
            </ReactMarkdown>
          </div>
          {block.artifacts?.map((artifact) => (
            <ArtifactCard
              key={artifact.documentId || artifact.artifactId || `${artifact.filename}-${artifact.artifactUrl}`}
              artifact={artifact}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ContentBlockView({
  block,
  allBlocks,
}: {
  block: ContentBlock;
  allBlocks: ContentBlock[];
}) {
  switch (block.type) {
    case "text":
      if (!block.text) return null;
      return (
        <div className="prose-chat max-w-none text-text-primary">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a({ children, href }) {
                return (
                  <a href={href} target="_blank" rel="noreferrer">
                    {children}
                  </a>
                );
              },
            }}
          >
            {block.text}
          </ReactMarkdown>
        </div>
      );
    case "status":
      return <StatusBlock block={block} />;
    case "tool_use":
      return <ToolUseBlock block={block} />;
    case "tool_result":
      return <ToolResultBlock block={block} allBlocks={allBlocks} />;
    case "file_attachment":
      return (
        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-muted border border-border">
          <FileText className="w-4 h-4 text-accent flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-text-primary truncate">{block.filename}</p>
          </div>
        </div>
      );
    case "thinking":
      return <div className="text-sm text-text-muted italic">{block.thinking}</div>;
    default:
      return null;
  }
}

export function MessageCard({ message, isStreaming }: MessageCardProps) {
  const isUser = message.role === "user";
  const contentBlocks = normalizeContent(message.content);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = joinTextBlocks(contentBlocks);
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  if (isUser) {
    return (
      <div className="space-y-1">
        <div className="text-[11px] text-text-muted text-right pr-1">You</div>
        <div className="flex items-start gap-2 justify-end group">
          <div className="message-user px-4 py-2.5 max-w-[80%] break-words">
            {contentBlocks.map((block, index) =>
              block.type === "text" ? (
                <p key={index} className="text-text-primary whitespace-pre-wrap break-words text-left">
                  {block.text}
                </p>
              ) : (
                <ContentBlockView key={index} block={block} allBlocks={contentBlocks} />
              )
            )}
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="mt-1 w-6 h-6 flex items-center justify-center rounded-md bg-surface-muted hover:bg-surface-active transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
            title="Copy message"
          >
            {copied ? (
              <Check className="w-3 h-3 text-success" />
            ) : (
              <Copy className="w-3 h-3 text-text-muted" />
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
        <Sparkles className="w-3 h-3" />
        <span>Assistant</span>
        {message.timestamp ? (
          <span suppressHydrationWarning>· {formatRelativeTime(message.timestamp)}</span>
        ) : null}
      </div>
      {contentBlocks.map((block, index) => (
        <ContentBlockView key={index} block={block} allBlocks={contentBlocks} />
      ))}
      {isStreaming ? <span className="inline-block w-2 h-4 bg-accent ml-1 animate-pulse" /> : null}
    </div>
  );
}
