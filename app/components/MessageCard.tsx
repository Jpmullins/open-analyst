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
        <a
          href={artifact.artifactUrl}
          target="_blank"
          rel="noreferrer"
          className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-surface-muted transition-colors text-text-muted hover:text-accent"
          title="Preview"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
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
  const tone =
    block.status === "error"
      ? "border-error/30 bg-error/5 text-error"
      : block.status === "completed"
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

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-surface">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full px-4 py-3 flex items-center gap-3 bg-surface-muted hover:bg-surface-active transition-colors"
      >
        <div className="w-6 h-6 rounded-lg bg-accent-muted flex items-center justify-center">
          <Terminal className="w-3.5 h-3.5 text-accent" />
        </div>
        <div className="flex-1 text-left">
          <span className="font-medium text-sm text-text-primary">
            {block.name.replace(/_/g, " ")}
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-text-muted" />
        ) : (
          <ChevronRight className="w-4 h-4 text-text-muted" />
        )}
      </button>
      {expanded ? (
        <div className="p-4">
          <pre className="code-block text-xs whitespace-pre-wrap">
            {JSON.stringify(block.input, null, 2)}
          </pre>
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
    return block.content.length > 120 ? `${block.content.slice(0, 120)}...` : block.content;
  }, [block]);

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-surface">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full px-4 py-3 flex items-center gap-3 bg-surface-muted hover:bg-surface-active transition-colors"
      >
        <div className="w-6 h-6 rounded-lg bg-surface flex items-center justify-center border border-border">
          {block.isError ? (
            <FileText className="w-3.5 h-3.5 text-error" />
          ) : (
            <Check className="w-3.5 h-3.5 text-success" />
          )}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-medium text-text-primary">
            {toolUse?.name.replace(/_/g, " ") || "Tool result"}
          </div>
          <div className="text-xs text-text-muted truncate">{summary}</div>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-text-muted" />
        ) : (
          <ChevronRight className="w-4 h-4 text-text-muted" />
        )}
      </button>
      {expanded ? (
        <div className="p-4 space-y-3">
          {block.content ? (
            <pre className="code-block text-xs whitespace-pre-wrap">{block.content}</pre>
          ) : null}
          {block.artifacts?.map((artifact) => (
            <ArtifactCard key={artifact.documentId} artifact={artifact} />
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
