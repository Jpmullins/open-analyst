import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { BookOpen, BrainCircuit, FlaskConical, PanelRightOpen, Plug, Settings2, Sparkles, Square, Wrench } from "lucide-react";
import { useAnalystStream } from "~/hooks/useAnalystStream";
import type { Message } from "~/lib/types";
import type { WorkspaceContextData } from "~/lib/workspace-context.server";
import { MessageCard } from "./MessageCard";
import { InterruptCard } from "./InterruptCard";
import { SubagentCards } from "./SubagentPanel";

interface AssistantWorkspaceViewProps {
  projectId: string;
  agentThreadId?: string;
  workspaceContext: WorkspaceContextData;
}

/**
 * Convert a LangGraph BaseMessage (from useStream) to our Message type
 * so MessageCard can render it.
 */
function langGraphMessageToMessage(
  msg: { id?: string; type: string; content: unknown; tool_calls?: unknown[] },
  sessionId: string,
): Message | null {
  const role = msg.type === "human" ? "user" : msg.type === "ai" ? "assistant" : null;
  if (!role) return null;

  // Build ContentBlock[] from LangGraph message content
  const content: Message["content"] = [];

  if (typeof msg.content === "string" && msg.content) {
    content.push({ type: "text", text: msg.content });
  } else if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (typeof block === "string") {
        content.push({ type: "text", text: block });
      } else if (block && typeof block === "object") {
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string") {
          content.push({ type: "text", text: b.text });
        } else if (b.type === "tool_use") {
          content.push({
            type: "tool_use",
            id: String(b.id || ""),
            name: String(b.name || ""),
            input: (b.input as Record<string, unknown>) || {},
          });
        }
      }
    }
  }

  // Add tool_calls as tool_use blocks
  if (Array.isArray(msg.tool_calls)) {
    for (const tc of msg.tool_calls) {
      const call = tc as { id?: string; name?: string; args?: Record<string, unknown> };
      content.push({
        type: "tool_use",
        id: String(call.id || ""),
        name: String(call.name || ""),
        input: call.args || {},
      });
    }
  }

  if (content.length === 0) return null;

  return {
    id: msg.id || `lg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sessionId,
    role,
    content,
    timestamp: Date.now(),
  };
}

export function AssistantWorkspaceView({
  projectId,
  agentThreadId: initialAgentThreadId,
  workspaceContext,
}: AssistantWorkspaceViewProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isResuming, setIsResuming] = useState(false);

  const stream = useAnalystStream({
    threadId: initialAgentThreadId,
    onThreadId: useCallback((id: string) => {
      // Navigate to the thread route when a new thread is created
      const next = new URLSearchParams(searchParams);
      navigate(
        `/projects/${projectId}/threads/${id}${next.toString() ? `?${next.toString()}` : ""}`,
        { replace: true },
      );
    }, [projectId, searchParams, navigate]),
  });

  const deepResearch = searchParams.get("deepResearch") === "true";
  const activePanel = searchParams.get("panel") || "";
  const activeConnectorCount = workspaceContext.activeConnectorIds.length;
  const activeToolCount = workspaceContext.tools.filter(
    (tool) => tool.source === "local" || tool.active
  ).length;
  const activeSkillCount = workspaceContext.skills.filter(
    (skill) => skill.pinned || skill.enabled
  ).length;
  const isProjectHome = !initialAgentThreadId;

  // Stream messages from Agent Server (converted to our format)
  const displayedMessages = useMemo(() => {
    return (stream.messages || [])
      .map((msg) => langGraphMessageToMessage(
        msg as { id?: string; type: string; content: unknown; tool_calls?: unknown[] },
        initialAgentThreadId || "",
      ))
      .filter((m): m is Message => m !== null);
  }, [stream.messages, initialAgentThreadId]);

  // Interrupt from Agent Server
  const interruptValue = useMemo(() => {
    if (!stream.interrupt) return null;
    const val = stream.interrupt.value as Record<string, unknown> | undefined;
    if (!val || typeof val !== "object") return null;
    return { type: String(val.type || "tool_approval"), ...val };
  }, [stream.interrupt]);

  const handleInterruptResume = async (resumeValue: Record<string, unknown>) => {
    setIsResuming(true);
    try {
      stream.submit(null, {
        command: { resume: resumeValue },
        streamSubgraphs: true,
      } as any);
      setIsResuming(false);
    } catch (error) {
      console.error("[AssistantWorkspaceView] resume failed", error);
      setIsResuming(false);
    }
  };

  // Extract subagents for a given message from the stream
  const getSubagentsForMessage = useCallback((messageId: string) => {
    const getter = (stream as unknown as {
      getSubagentsByMessage?: (id: string) => unknown[];
    }).getSubagentsByMessage;
    if (!getter) return [];
    try {
      return (getter(messageId) || []) as Array<Record<string, unknown>>;
    } catch {
      return [];
    }
  }, [stream]);

  // Auto-scroll
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [displayedMessages.length, stream.isLoading]);

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
    setErrorMessage(null);
    const nextPrompt = prompt.trim();
    if (!nextPrompt || stream.isLoading) return;

    setPrompt("");

    try {
      stream.submit(
        { messages: [{ role: "human", content: nextPrompt }] },
        {
          config: { configurable: { project_id: projectId } },
          metadata: { project_id: projectId },
          streamSubgraphs: true,
          onDisconnect: "continue",
          streamResumable: true,
        } as any,
      );
    } catch (error) {
      setPrompt(nextPrompt);
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      console.error("[AssistantWorkspaceView] submit failed", error);
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
              {isProjectHome ? "Project Home" : "Interactive Project Thread"}
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
          {displayedMessages.length === 0 && !stream.isLoading ? (
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
            <React.Fragment key={message.id}>
              <MessageCard
                message={message}
                isStreaming={stream.isLoading && message === displayedMessages[displayedMessages.length - 1]}
              />
              {/* Inline subagent cards after assistant messages that delegated */}
              {message.role === "assistant" && (
                <SubagentCards subagents={getSubagentsForMessage(message.id)} />
              )}
            </React.Fragment>
          ))}

          {/* Interrupt card for in-chat approvals */}
          {interruptValue && (
            <InterruptCard
              interrupt={{ value: interruptValue }}
              onResume={handleInterruptResume}
              isProcessing={isResuming}
            />
          )}
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
            {stream.isLoading ? (
              <button type="button" className="btn btn-secondary text-sm" onClick={() => stream.stop()}>
                <Square className="w-4 h-4" />
                Stop
              </button>
            ) : null}
          </div>

          {errorMessage ? (
            <div className="mb-3 px-4 py-3 rounded-xl bg-error/10 border border-error/30 text-error text-sm flex items-center gap-2">
              <span className="font-medium">Error:</span>
              <span className="flex-1">{errorMessage}</span>
              <button type="button" onClick={() => setErrorMessage(null)} className="text-error/60 hover:text-error">&#x2715;</button>
            </div>
          ) : null}

          {stream.error ? (
            <div className="mb-3 px-4 py-3 rounded-xl bg-error/10 border border-error/30 text-error text-sm">
              <span className="font-medium">Stream error:</span> {String(stream.error)}
            </div>
          ) : null}

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
              disabled={stream.isLoading}
            />
            <button
              type="submit"
              disabled={!prompt.trim() || stream.isLoading}
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
