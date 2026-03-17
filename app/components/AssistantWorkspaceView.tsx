import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRevalidator, useSearchParams } from "react-router";
import { BookOpen, BrainCircuit, FlaskConical, PanelRightOpen, Plug, Settings2, Sparkles, Square, Wrench } from "lucide-react";
import { useChatStream } from "~/hooks/useChatStream";
import type { Message } from "~/lib/types";
import type { WorkspaceContextData } from "~/lib/workspace-context.server";
import { MessageCard } from "./MessageCard";

interface AssistantWorkspaceViewProps {
  projectId: string;
  taskId?: string;
  taskTitle?: string;
  initialMessages?: Array<{
    id: string;
    role: string;
    content: unknown;
    timestamp: string | Date;
  }>;
  workspaceContext: WorkspaceContextData;
}

function mapMessages(
  taskId: string | undefined,
  initialMessages: AssistantWorkspaceViewProps["initialMessages"]
): Message[] {
  return (initialMessages || []).map((message) => ({
    id: message.id,
    sessionId: taskId || "",
    role: message.role as Message["role"],
    content: Array.isArray(message.content)
      ? (message.content as Message["content"])
      : [{ type: "text", text: String(message.content ?? "") }],
    timestamp:
      typeof message.timestamp === "string"
        ? new Date(message.timestamp).getTime()
        : message.timestamp instanceof Date
          ? message.timestamp.getTime()
          : Date.now(),
  }));
}

export function AssistantWorkspaceView({
  projectId,
  taskId,
  taskTitle,
  initialMessages,
  workspaceContext,
}: AssistantWorkspaceViewProps) {
  const navigate = useNavigate();
  const { revalidate } = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendMessage, stop, isStreaming, streamingMessage } = useChatStream();

  const deepResearch = searchParams.get("deepResearch") === "true";
  const activePanel = searchParams.get("panel") || "";
  const collectionId = searchParams.get("collection") || "";
  const activeConnectorCount = workspaceContext.activeConnectorIds.length;
  const activeToolCount = workspaceContext.tools.filter(
    (tool) => tool.source === "local" || tool.active
  ).length;
  const activeSkillCount = workspaceContext.skills.filter(
    (skill) => skill.pinned || skill.enabled
  ).length;
  const isProjectHome = !taskId;

  const serverMessages = useMemo(
    () => mapMessages(taskId, initialMessages),
    [taskId, initialMessages]
  );

  const displayedMessages = useMemo(() => {
    const scopedOptimisticMessages = optimisticMessages.filter((message) =>
      taskId ? message.sessionId === taskId : !message.sessionId
    );
    const merged = [...serverMessages, ...scopedOptimisticMessages];
    if (!streamingMessage) return merged;
    return [...merged, streamingMessage];
  }, [serverMessages, optimisticMessages, streamingMessage, taskId]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [displayedMessages.length, streamingMessage]);

  const setPanel = (panel: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (panel) next.set("panel", panel);
        else next.delete("panel");
        if (panel !== "settings") {
          next.delete("tab");
        }
        return next;
      },
      { replace: true }
    );
  };

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const nextPrompt = prompt.trim();
    if (!nextPrompt || isStreaming) return;

    const optimisticMessage: Message = {
      id: `optimistic-${Date.now()}`,
      sessionId: taskId || "",
      role: "user",
      content: [{ type: "text", text: nextPrompt }],
      timestamp: Date.now(),
      localStatus: "queued",
    };

    setOptimisticMessages((current) => [...current, optimisticMessage]);
    setPrompt("");

    try {
      const result = await sendMessage({
        prompt: nextPrompt,
        projectId,
        taskId,
        collectionId: collectionId || undefined,
        deepResearch,
      });
      setOptimisticMessages([]);
      await revalidate();
      if (!taskId && result.taskId) {
        const next = new URLSearchParams(searchParams);
        navigate(
          `/projects/${projectId}/tasks/${result.taskId}${next.toString() ? `?${next.toString()}` : ""}`,
          { replace: true }
        );
        return;
      }
    } catch (error) {
      setOptimisticMessages((current) =>
        current.filter((message) => message.id !== optimisticMessage.id)
      );
      setPrompt(nextPrompt);
      console.error("[AssistantWorkspaceView] chat submit failed", error);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="border-b border-border bg-surface/80 backdrop-blur-sm px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-text-muted mb-1">
              Analyst Workspace
            </div>
            <h1 className="text-lg font-semibold text-text-primary">
              {isProjectHome ? "Project Home" : taskTitle || "Interactive Project Thread"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span className="tag">
                <Plug className="w-3.5 h-3.5" />
                {activeConnectorCount} connectors
              </span>
              <span className="tag">
                <Wrench className="w-3.5 h-3.5" />
                {activeToolCount} tools
              </span>
              <span className="tag">
                <Sparkles className="w-3.5 h-3.5" />
                {activeSkillCount} skills
              </span>
              <span className="tag">
                <BrainCircuit className="w-3.5 h-3.5" />
                {workspaceContext.memories.active.length} memories
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPanel(activePanel === "context" ? null : "context")}
              className={`btn btn-secondary text-sm ${activePanel === "context" ? "bg-accent-muted text-accent" : ""}`}
            >
              <BrainCircuit className="w-4 h-4" />
              Context
            </button>
            <button
              type="button"
              onClick={() => setPanel(activePanel === "sources" ? null : "sources")}
              className={`btn btn-secondary text-sm ${activePanel === "sources" ? "bg-accent-muted text-accent" : ""}`}
            >
              <BookOpen className="w-4 h-4" />
              Sources
            </button>
            <button
              type="button"
              onClick={() => setPanel(activePanel === "canvas" ? null : "canvas")}
              className={`btn btn-secondary text-sm ${activePanel === "canvas" ? "bg-accent-muted text-accent" : ""}`}
            >
              <PanelRightOpen className="w-4 h-4" />
              Canvas
            </button>
            <button
              type="button"
              onClick={() => setPanel(activePanel === "settings" ? null : "settings")}
              className={`btn btn-secondary text-sm ${activePanel === "settings" ? "bg-accent-muted text-accent" : ""}`}
            >
              <Settings2 className="w-4 h-4" />
              Settings
            </button>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
          {displayedMessages.length === 0 ? (
            <div className="card p-8 text-center">
              <h2 className="text-lg font-semibold mb-2">
                {isProjectHome ? "Start a new analyst thread" : "Start an analyst conversation"}
              </h2>
              <p className="text-sm text-text-secondary max-w-2xl mx-auto">
                {isProjectHome
                  ? "You are back at the main project workspace. Start a fresh thread here, open sources from the right panel, or adjust settings and memory from the left panel."
                  : "Ask for research, planning, synthesis, critique, argument mapping, or report drafting. Use the left panel for settings and thread context, and the right panel for sources, file preview, and canvas work."}
              </p>
              {isProjectHome ? (
                <div className="mt-5 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => textareaRef.current?.focus()}
                  >
                    New Thread
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setPanel("sources")}
                  >
                    Browse Sources
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {displayedMessages.map((message) => (
            <MessageCard
              key={message.id}
              message={message}
              isStreaming={Boolean(streamingMessage && message.id === streamingMessage.id)}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-border bg-background px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              onClick={() =>
                setSearchParams(
                  (prev) => {
                    const next = new URLSearchParams(prev);
                    if (deepResearch) next.delete("deepResearch");
                    else next.set("deepResearch", "true");
                    return next;
                  },
                  { replace: true }
                )
              }
              className={`tag text-xs ${deepResearch ? "tag-active" : ""}`}
            >
              <FlaskConical className="w-3.5 h-3.5" />
              Deep Research
            </button>
            {isStreaming ? (
              <button type="button" className="btn btn-secondary text-sm" onClick={stop}>
                <Square className="w-4 h-4" />
                Stop
              </button>
            ) : null}
          </div>

          <form onSubmit={handleSubmit} className="relative">
            <textarea
              ref={textareaRef}
              className="input text-base py-4 pr-14 min-h-[120px] resize-none rounded-2xl"
              placeholder="Ask the analyst to research, reason, critique, or draft..."
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              disabled={isStreaming}
            />
            <button
              type="submit"
              disabled={!prompt.trim() || isStreaming}
              className="absolute bottom-3 right-3 w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center hover:bg-accent-hover disabled:opacity-40 transition-colors"
              aria-label="Send message"
            >
              <PanelRightOpen className="w-5 h-5 rotate-180" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
