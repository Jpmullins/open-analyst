import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useMatches, useNavigate, useSearchParams } from "react-router";
import {
  BookOpen,
  Bot,
  ListTodo,
  MessageSquare,
  PanelRightOpen,
  PenTool,
  Search,
  ShieldAlert,
  Square,
} from "lucide-react";
import { useAnalystStream } from "~/hooks/useAnalystStream";
import { useAppStore } from "~/lib/store";
import type { Message } from "~/lib/types";
import { normalizeUuid } from "~/lib/uuid";
import type { WorkspaceContextData } from "~/lib/workspace-context.server";
import { InterruptCard } from "./InterruptCard";
import { MessageCard } from "./MessageCard";
import { SubagentCards } from "./SubagentPanel";

interface AssistantWorkspaceViewProps {
  projectId: string;
  agentThreadId?: string;
  workspaceContext: WorkspaceContextData;
  threadMetadata?: {
    collectionId?: string | null;
    analysisMode?: string | null;
  };
}

type AnalysisMode = "chat" | "research" | "product";

type StreamTodo = {
  id?: string;
  title?: string;
  content?: string;
  status?: string;
  actor?: string;
};

type StreamInterrupt = {
  id?: string;
  value?: Record<string, unknown>;
};

type StreamSubagent = {
  id?: string;
  status?: string;
  result?: string;
  messages?: Array<{
    id?: string;
    type?: string;
    content?: unknown;
    tool_calls?: Array<{ name?: string; args?: Record<string, unknown> }>;
  }>;
  toolCall?: {
    id?: string;
    name?: string;
    args?: Record<string, unknown>;
  };
};

function normalizeTodo(raw: unknown): StreamTodo | null {
  if (!raw || typeof raw !== "object") return null;
  const todo = raw as Record<string, unknown>;
  return {
    id: typeof todo.id === "string" ? todo.id : undefined,
    title:
      typeof todo.title === "string"
        ? todo.title
        : typeof todo.content === "string"
          ? todo.content
          : undefined,
    content: typeof todo.content === "string" ? todo.content : undefined,
    status: typeof todo.status === "string" ? todo.status : undefined,
    actor: typeof todo.actor === "string" ? todo.actor : undefined,
  };
}

function normalizeSubagent(raw: unknown): StreamSubagent | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as StreamSubagent;
}

function prettifyName(value: string | undefined): string {
  const text = String(value || "agent").trim();
  if (!text) return "Agent";
  return text
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function prettifyStatus(value: string | undefined): string {
  return String(value || "pending")
    .replace(/_/g, " ")
    .trim();
}

function summarizeApproval(value: Record<string, unknown>, index: number): string {
  const labelCandidates = [
    value.title,
    value.label,
    value.name,
    value.tool_name,
    value.tool,
    value.reason,
    value.message,
  ];
  for (const candidate of labelCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return `Approval ${index + 1}`;
}

function deriveThreadTitle(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Untitled thread";
  const sentence = cleaned.split(/[\n.!?]/, 1)[0]?.trim() || cleaned;
  const normalized = sentence.replace(/^[-*#\d.\s]+/, "").trim();
  return normalized.slice(0, 72) || "Untitled thread";
}

function deriveThreadSummary(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.slice(0, 140);
}

function normalizeAnalysisMode(value: unknown): AnalysisMode {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "product") return "product";
  if (mode === "research") return "research";
  return "chat";
}

function summarizeMessageContent(content: unknown): string {
  if (typeof content === "string") return content.trim().slice(0, 80);
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (typeof block === "string") return block;
      if (!block || typeof block !== "object") return "";
      const candidate = block as Record<string, unknown>;
      if (candidate.type === "text" && typeof candidate.text === "string") {
        return candidate.text;
      }
      if (candidate.type === "tool_use") {
        return `${String(candidate.name || "tool")} ${JSON.stringify(candidate.input || {})}`;
      }
      return "";
    })
    .join(" ")
    .trim()
    .slice(0, 80);
}

function buildStableMessageId(
  msg: { id?: string; type: string; content: unknown; tool_calls?: unknown[] },
  sessionId: string,
  index: number,
): string {
  if (msg.id && msg.id.trim()) return msg.id;
  const toolCallId = Array.isArray(msg.tool_calls)
    ? String((msg.tool_calls[0] as { id?: string } | undefined)?.id || "").trim()
    : "";
  const fingerprint = toolCallId || summarizeMessageContent(msg.content).replace(/\s+/g, "-").slice(0, 32) || "message";
  return `lg-${sessionId || "thread"}-${msg.type}-${index}-${fingerprint}`;
}

/**
 * Convert a LangGraph BaseMessage (from useStream) to our Message type
 * so MessageCard can render it.
 */
function langGraphMessageToMessage(
  msg: { id?: string; type: string; content: unknown; tool_calls?: unknown[] },
  sessionId: string,
  index: number,
  timestamp: number,
): Message | null {
  const role = msg.type === "human" ? "user" : msg.type === "ai" ? "assistant" : null;
  if (!role) return null;

  const content: Message["content"] = [];

  if (typeof msg.content === "string" && msg.content) {
    content.push({ type: "text", text: msg.content });
  } else if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (typeof block === "string") {
        content.push({ type: "text", text: block });
      } else if (block && typeof block === "object") {
        const candidate = block as Record<string, unknown>;
        if (candidate.type === "text" && typeof candidate.text === "string") {
          content.push({ type: "text", text: candidate.text });
        } else if (candidate.type === "tool_use") {
          content.push({
            type: "tool_use",
            id: String(candidate.id || ""),
            name: String(candidate.name || ""),
            input: (candidate.input as Record<string, unknown>) || {},
          });
        }
      }
    }
  }

  if (Array.isArray(msg.tool_calls)) {
    for (const toolCall of msg.tool_calls) {
      const call = toolCall as { id?: string; name?: string; args?: Record<string, unknown> };
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
    id: buildStableMessageId(msg, sessionId, index),
    sessionId,
    role,
    content,
    timestamp,
  };
}

export function AssistantWorkspaceView({
  projectId,
  agentThreadId: initialAgentThreadId,
  workspaceContext,
  threadMetadata,
}: AssistantWorkspaceViewProps) {
  const location = useLocation();
  const matches = useMatches();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSubmittedPromptRef = useRef<string | null>(null);
  const hasNavigatedToThreadRef = useRef(false);
  const hasAutoSubmittedPendingPromptRef = useRef(false);
  const [resumingInterruptId, setResumingInterruptId] = useState<string | null>(null);
  const activeCollectionId = useAppStore((state) => state.activeCollectionByProject[projectId] || null);
  const setProjectActiveCollection = useAppStore((state) => state.setProjectActiveCollection);
  const appLayoutMatch = matches.find((match) => match.id === "routes/_app");
  const runtimeConfig = appLayoutMatch?.data as { langgraphRuntimeUrl?: unknown } | undefined;
  const agentServerUrl =
    typeof runtimeConfig?.langgraphRuntimeUrl === "string"
      ? runtimeConfig.langgraphRuntimeUrl.replace(/\/+$/g, "")
      : "http://localhost:8081";

  const navigateToThread = useCallback(
    (threadId: string) => {
      if (initialAgentThreadId || hasNavigatedToThreadRef.current) return;
      hasNavigatedToThreadRef.current = true;
      const next = new URLSearchParams(searchParams);
      const pendingPrompt = lastSubmittedPromptRef.current;
      navigate(
        `/projects/${projectId}/threads/${threadId}${next.toString() ? `?${next.toString()}` : ""}`,
        {
          replace: true,
          state: pendingPrompt ? { pendingPrompt } : null,
        },
      );
    },
    [initialAgentThreadId, navigate, projectId, searchParams],
  );

  const stream = useAnalystStream({
    apiUrl: agentServerUrl,
    threadId: initialAgentThreadId,
    onThreadId: useCallback(
      (threadId: string) => {
        navigateToThread(threadId);
      },
      [navigateToThread],
    ),
    onCreated: useCallback(
      (meta: { thread_id: string; run_id: string }) => {
        navigateToThread(meta.thread_id);
      },
      [navigateToThread],
    ),
  });
  type StreamSubmitOptions = NonNullable<Parameters<typeof stream.submit>[1]>;

  const activePanel = searchParams.get("panel") || "";
  const isProjectHome = !initialAgentThreadId;
  const deferredStreamMessages = useDeferredValue(stream.messages || []);
  const deferredStreamValues = useDeferredValue((stream.values || {}) as Record<string, unknown>);
  const deferredStreamInterrupts = useDeferredValue((stream as { interrupts?: unknown }).interrupts);
  const deferredStreamActiveSubagents = useDeferredValue(
    Array.isArray((stream as { activeSubagents?: unknown }).activeSubagents)
      ? ((stream as { activeSubagents?: unknown[] }).activeSubagents || [])
      : [],
  );
  const deferredStreamSubagents = useDeferredValue(
    Array.isArray((stream as { subagents?: unknown }).subagents)
      ? ((stream as { subagents?: unknown[] }).subagents || [])
      : [],
  );
  const messageTimestampCacheRef = useRef<Map<string, number>>(new Map());
  const contextSummary = useMemo(() => {
    const connectorCount = workspaceContext.activeConnectorIds.length;
    const skillCount = workspaceContext.skills.filter((skill) => skill.pinned || skill.enabled).length;
    const memoryCount = workspaceContext.memories.active.length;
    return `${connectorCount} connectors, ${skillCount} skills, ${memoryCount} memories active in project context`;
  }, [workspaceContext]);
  const [selectedMode, setSelectedMode] = useState<AnalysisMode>(
    normalizeAnalysisMode(threadMetadata?.analysisMode),
  );
  const resolvedCollectionId = normalizeUuid(
    initialAgentThreadId
      ? activeCollectionId ?? threadMetadata?.collectionId ?? null
      : activeCollectionId
  );
  const resolvedAnalysisMode = selectedMode;
  const requestMetadata = useMemo(
    () => ({
      project_id: projectId,
      collection_id: resolvedCollectionId,
      analysis_mode: resolvedAnalysisMode,
    }),
    [projectId, resolvedAnalysisMode, resolvedCollectionId],
  );

  useEffect(() => {
    setSelectedMode(normalizeAnalysisMode(threadMetadata?.analysisMode));
  }, [threadMetadata?.analysisMode, initialAgentThreadId]);

  useEffect(() => {
    const collectionFromUrl = normalizeUuid(searchParams.get("collection"));
    const preferredCollectionId = collectionFromUrl ?? normalizeUuid(threadMetadata?.collectionId ?? null);
    if (!preferredCollectionId || preferredCollectionId === activeCollectionId) return;
    setProjectActiveCollection(projectId, preferredCollectionId);
  }, [
    activeCollectionId,
    projectId,
    searchParams,
    setProjectActiveCollection,
    threadMetadata?.collectionId,
  ]);

  useEffect(() => {
    if (!initialAgentThreadId) return;
    const nextMode = normalizeAnalysisMode(threadMetadata?.analysisMode);
    if (nextMode === selectedMode) return;
    void fetch(`${agentServerUrl}/threads/${initialAgentThreadId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        metadata: {
          project_id: projectId,
          collection_id: resolvedCollectionId,
          analysis_mode: selectedMode,
        },
      }),
    }).catch((error) => {
      console.error("[AssistantWorkspaceView] mode patch failed", error);
    });
  }, [
    agentServerUrl,
    initialAgentThreadId,
    projectId,
    resolvedCollectionId,
    selectedMode,
    threadMetadata?.analysisMode,
  ]);
  const pendingPromptFromNavigation = useMemo(() => {
    const state = location.state as { pendingPrompt?: unknown } | null;
    return typeof state?.pendingPrompt === "string" && state.pendingPrompt.trim()
      ? state.pendingPrompt.trim()
      : null;
  }, [location.state]);
  const shouldAutoSubmitPendingPrompt = useMemo(() => {
    const state = location.state as { autoSubmit?: unknown } | null;
    return state?.autoSubmit === true;
  }, [location.state]);

  const displayedMessages = useMemo(() => {
    const nextTimestampCache = new Map<string, number>();
    const messages = deferredStreamMessages
      .map((msg, index) => {
        const typedMessage = msg as { id?: string; type: string; content: unknown; tool_calls?: unknown[] };
        const stableId = buildStableMessageId(typedMessage, initialAgentThreadId || "", index);
        const timestamp = messageTimestampCacheRef.current.get(stableId) || Date.now();
        nextTimestampCache.set(stableId, timestamp);
        return langGraphMessageToMessage(
          typedMessage,
          initialAgentThreadId || "",
          index,
          timestamp,
        );
      })
      .filter((message): message is Message => message !== null);
    messageTimestampCacheRef.current = nextTimestampCache;
    return messages;
  }, [deferredStreamMessages, initialAgentThreadId]);

  const renderedMessages = useMemo(() => {
    if (displayedMessages.length > 0 || !initialAgentThreadId || !pendingPromptFromNavigation) {
      return displayedMessages;
    }
    return [
      {
        id: `pending-${initialAgentThreadId}`,
        sessionId: initialAgentThreadId,
        role: "user" as const,
        content: [{ type: "text", text: pendingPromptFromNavigation }],
        timestamp: Date.now(),
      },
    ];
  }, [displayedMessages, initialAgentThreadId, pendingPromptFromNavigation]);

  const pendingInterrupts = useMemo(() => {
    const interruptCandidates: unknown[] = [];
    const valueInterrupts = deferredStreamValues.__interrupt__ ?? deferredStreamValues.interrupts;

    const collectInterrupts = (source: unknown) => {
      if (Array.isArray(source)) {
        interruptCandidates.push(...source);
        return;
      }
      if (!source || typeof source !== "object") return;
      for (const value of Object.values(source as Record<string, unknown>)) {
        if (Array.isArray(value)) {
          interruptCandidates.push(...value);
        } else if (value && typeof value === "object") {
          interruptCandidates.push(value);
        }
      }
    };

    collectInterrupts(deferredStreamInterrupts);
    collectInterrupts(valueInterrupts);

    if (stream.interrupt) {
      interruptCandidates.push(stream.interrupt);
    }
    if (deferredStreamValues.interrupt) {
      interruptCandidates.push(deferredStreamValues.interrupt);
    }

    const unique = new Map<string, { id?: string; value: Record<string, unknown> }>();
    interruptCandidates.forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      const interrupt = item as StreamInterrupt;
      const value = interrupt.value;
      if (!value || typeof value !== "object") return;
      const normalizedValue = {
        type: String((value as Record<string, unknown>).type || "tool_approval"),
        ...(value as Record<string, unknown>),
      };
      const key = interrupt.id || `${normalizedValue.type}-${index}`;
      unique.set(key, { id: interrupt.id, value: normalizedValue });
    });
    return Array.from(unique.values());
  }, [deferredStreamInterrupts, deferredStreamValues, stream.interrupt]);

  const planTodos = useMemo(() => {
    const rawTodos = Array.isArray(deferredStreamValues.todos)
      ? deferredStreamValues.todos
      : Array.isArray(deferredStreamValues.active_plan)
        ? deferredStreamValues.active_plan
        : [];
    return rawTodos.map(normalizeTodo).filter((todo): todo is StreamTodo => todo !== null);
  }, [deferredStreamValues]);

  const activeSubagents = useMemo(() => {
    return deferredStreamActiveSubagents
      .map(normalizeSubagent)
      .filter((subagent): subagent is StreamSubagent => subagent !== null);
  }, [deferredStreamActiveSubagents]);

  const recentSubagents = useMemo(() => {
    const activeIds = new Set(activeSubagents.map((subagent) => subagent.id).filter(Boolean));
    const unique = new Map<string, StreamSubagent>();
    for (const item of deferredStreamSubagents) {
      const subagent = normalizeSubagent(item);
      if (!subagent) continue;
      const fallbackId = `${subagent.toolCall?.id || ""}:${subagent.toolCall?.args?.subagent_type || "agent"}:${subagent.status || "pending"}`;
      unique.set(subagent.id || fallbackId, subagent);
    }
    return Array.from(unique.values())
      .filter((subagent) => !subagent.id || !activeIds.has(subagent.id))
      .filter((subagent) => {
        const status = String(subagent.status || "").toLowerCase();
        return status === "complete" || status === "completed" || status === "error";
      })
      .slice(-6)
      .reverse();
  }, [activeSubagents, deferredStreamSubagents]);

  const subagentsByMessageId = useMemo(() => {
    const getter = stream.getSubagentsByMessage;
    const grouped = new Map<string, StreamSubagent[]>();
    const subagentCount = deferredStreamSubagents.length;
    if (subagentCount === 0 && displayedMessages.length === 0) return grouped;
    if (!getter) return grouped;
    displayedMessages.forEach((message) => {
      if (message.role !== "assistant") return;
      try {
        const subagents = (getter(message.id) || [])
          .map(normalizeSubagent)
          .filter((subagent): subagent is StreamSubagent => subagent !== null);
        if (subagents.length > 0) {
          grouped.set(message.id, subagents);
        }
      } catch {
        // Ignore transient SDK lookup issues during stream transitions.
      }
    });
    return grouped;
  }, [displayedMessages, stream.getSubagentsByMessage, deferredStreamSubagents.length]);

  const completedTodoCount = useMemo(
    () => planTodos.filter((todo) => todo.status === "completed" || todo.status === "complete").length,
    [planTodos],
  );
  const hasRailContent = planTodos.length > 0 || activeSubagents.length > 0 || recentSubagents.length > 0 || pendingInterrupts.length > 0;

  const handleInterruptResume = async (resumeValue: Record<string, unknown>, interruptId?: string) => {
    setResumingInterruptId(interruptId || "__next__");
    try {
      stream.submit(null, {
        command: { resume: interruptId ? { [interruptId]: resumeValue } : resumeValue },
        metadata: requestMetadata,
        streamSubgraphs: true,
        onDisconnect: "continue",
        streamResumable: true,
      } as StreamSubmitOptions);
      setResumingInterruptId(null);
    } catch (error) {
      console.error("[AssistantWorkspaceView] resume failed", error);
      setResumingInterruptId(null);
    }
  };

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [renderedMessages.length, stream.isLoading, stream.isThreadLoading]);

  const setPanel = (panel: string | null) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (panel) next.set("panel", panel);
        else next.delete("panel");
        if (panel !== "settings") {
          next.delete("tab");
        }
        return next;
      },
      { replace: true },
    );
  };

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setErrorMessage(null);
    const nextPrompt = prompt.trim();
    if (!nextPrompt || stream.isLoading) return;

    setPrompt("");
    lastSubmittedPromptRef.current = nextPrompt;
    hasNavigatedToThreadRef.current = false;

    if (!initialAgentThreadId) {
      try {
        const response = await fetch(`${agentServerUrl}/threads`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            metadata: {
              ...requestMetadata,
              title: deriveThreadTitle(nextPrompt),
              summary: deriveThreadSummary(nextPrompt),
            },
          }),
        });
        if (!response.ok) {
          throw new Error(`Thread creation failed with status ${response.status}`);
        }
        const payload = (await response.json()) as { thread_id?: unknown };
        const threadId =
          typeof payload.thread_id === "string" && payload.thread_id.trim()
            ? payload.thread_id.trim()
            : "";
        if (!threadId) {
          throw new Error("Thread creation response did not include a thread id.");
        }
        const next = new URLSearchParams(searchParams);
        navigate(
          `/projects/${projectId}/threads/${threadId}${next.toString() ? `?${next.toString()}` : ""}`,
          {
            replace: true,
            state: {
              pendingPrompt: nextPrompt,
              autoSubmit: true,
            },
          },
        );
        return;
      } catch (error) {
        lastSubmittedPromptRef.current = null;
        setPrompt(nextPrompt);
        const message = error instanceof Error ? error.message : String(error);
        setErrorMessage(message);
        console.error("[AssistantWorkspaceView] thread creation failed", error);
        return;
      }
    }

    try {
      stream.submit(
        { messages: [{ role: "human", content: nextPrompt }] },
        {
          optimisticValues: (previous: Record<string, unknown>) => ({
            ...previous,
            messages: [
              ...(Array.isArray(previous.messages) ? previous.messages : []),
              {
                id: `optimistic-${Date.now()}`,
                type: "human",
                content: nextPrompt,
              },
            ],
          }),
          metadata: requestMetadata,
          streamSubgraphs: true,
          onDisconnect: "continue",
          streamResumable: true,
        } as StreamSubmitOptions,
      );
    } catch (error) {
      lastSubmittedPromptRef.current = null;
      setPrompt(nextPrompt);
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      console.error("[AssistantWorkspaceView] submit failed", error);
    }
  };

  useEffect(() => {
    if (!initialAgentThreadId) return;
    if (!shouldAutoSubmitPendingPrompt || !pendingPromptFromNavigation) return;
    if (hasAutoSubmittedPendingPromptRef.current) return;
    if (stream.isLoading || stream.isThreadLoading) return;
    hasAutoSubmittedPendingPromptRef.current = true;
    stream.submit(
      { messages: [{ role: "human", content: pendingPromptFromNavigation }] },
      {
        optimisticValues: (previous: Record<string, unknown>) => ({
          ...previous,
          messages: [
            ...(Array.isArray(previous.messages) ? previous.messages : []),
            {
              id: `optimistic-${Date.now()}`,
              type: "human",
              content: pendingPromptFromNavigation,
            },
          ],
        }),
        metadata: requestMetadata,
        streamSubgraphs: true,
        onDisconnect: "continue",
        streamResumable: true,
      } as StreamSubmitOptions,
    );
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [
    initialAgentThreadId,
    location.pathname,
    location.search,
    navigate,
    pendingPromptFromNavigation,
    requestMetadata,
    shouldAutoSubmitPendingPrompt,
    stream,
  ]);

  const lastRenderedMessageId = renderedMessages[renderedMessages.length - 1]?.id;

  const rail = hasRailContent ? (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-text-primary">Active Plan</h2>
          </div>
          {planTodos.length > 0 ? (
            <span className="text-xs text-text-muted">
              {completedTodoCount}/{planTodos.length}
            </span>
          ) : null}
        </div>
        {planTodos.length > 0 ? (
          <div className="space-y-2">
            {planTodos.map((todo, index) => {
              const status = todo.status || "pending";
              const isDone = status === "completed" || status === "complete";
              const isRunning = status === "running" || status === "in_progress";
              return (
                <div
                  key={todo.id || `${todo.title || "todo"}-${index}`}
                  className="rounded-xl border border-border bg-surface px-3 py-2.5"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-1.5 h-2.5 w-2.5 rounded-full ${
                        isDone
                          ? "bg-success"
                          : isRunning
                            ? "bg-accent animate-pulse"
                            : "bg-text-muted/40"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text-primary">
                        {todo.title || todo.content || "Untitled step"}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-text-muted">
                        <span>{prettifyStatus(status)}</span>
                        {todo.actor ? <span>{todo.actor}</span> : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            The supervisor has not published a visible plan yet.
          </p>
        )}
      </section>

      <section className="card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Bot className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-text-primary">Parallel Work</h2>
        </div>
        {activeSubagents.length > 0 ? (
          <div className="space-y-2">
            {activeSubagents.map((subagent, index) => {
              const role = prettifyName(String(subagent.toolCall?.args?.subagent_type || "agent"));
              const description = String(subagent.toolCall?.args?.description || "").trim();
              return (
                <div
                  key={subagent.id || `${role}-${index}`}
                  className="rounded-xl border border-border bg-surface px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-text-primary">
                      {role}
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.14em] text-accent">
                      {prettifyStatus(subagent.status || "running")}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-text-secondary line-clamp-3">
                    {description || "Working on a delegated task."}
                  </p>
                </div>
              );
            })}
          </div>
        ) : recentSubagents.length > 0 ? (
          <p className="text-sm text-text-muted">
            No active subagents right now. Recent delegated work is listed below.
          </p>
        ) : (
          <p className="text-sm text-text-muted">No delegated work is visible yet.</p>
        )}

        {recentSubagents.length > 0 ? (
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              Recent Branches
            </div>
            {recentSubagents.map((subagent, index) => {
              const role = prettifyName(String(subagent.toolCall?.args?.subagent_type || "agent"));
              const description = String(subagent.toolCall?.args?.description || "").trim();
              return (
                <div
                  key={subagent.id || `${role}-recent-${index}`}
                  className="rounded-xl border border-border bg-background-secondary px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-text-primary">
                      {role}
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.14em] text-text-muted">
                      {prettifyStatus(subagent.status || "complete")}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-text-secondary line-clamp-2">
                    {subagent.result || description || "Completed delegated work."}
                  </p>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="card p-4">
        <div className="mb-3 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-text-primary">Approvals</h2>
        </div>
        {pendingInterrupts.length > 0 ? (
          <div className="space-y-2">
            {pendingInterrupts.map((interrupt, index) => (
              <div
                key={interrupt.id || `${String(interrupt.value.type || "approval")}-${index}`}
                className="rounded-xl border border-warning/30 bg-warning/5 px-3 py-2.5"
              >
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-warning">
                  {prettifyName(String(interrupt.value.type || "approval"))}
                </div>
                <p className="mt-1 text-sm text-text-secondary">
                  {summarizeApproval(interrupt.value, index)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted">No pending approvals.</p>
        )}
      </section>
    </div>
  ) : null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-border bg-surface/80 px-6 py-3 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="mb-1 text-xs uppercase tracking-[0.18em] text-text-muted">
              Analyst Workspace
            </div>
            <h1 className="text-lg font-semibold text-text-primary">
              {isProjectHome ? "Project Home" : "Interactive Project Thread"}
            </h1>
            <p className="mt-1 text-sm text-text-muted">{contextSummary}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPanel(activePanel === "sources" ? null : "sources")}
              className={`btn btn-secondary text-sm ${
                activePanel === "sources" ? "bg-accent-muted text-accent" : ""
              }`}
            >
              <BookOpen className="h-4 w-4" />
              Sources
            </button>
            <button
              type="button"
              onClick={() => setPanel(activePanel === "canvas" ? null : "canvas")}
              className={`btn btn-secondary text-sm ${
                activePanel === "canvas" ? "bg-accent-muted text-accent" : ""
              }`}
            >
              <PanelRightOpen className="h-4 w-4" />
              Canvas
            </button>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-6">
              {hasRailContent ? <div className="xl:hidden">{rail}</div> : null}

              {renderedMessages.length === 0 && !stream.isLoading && !stream.isThreadLoading ? (
                <div className="card p-8 text-center">
                  <h2 className="mb-2 text-lg font-semibold">
                    {isProjectHome ? "Start a new analyst thread" : "Start an analyst conversation"}
                  </h2>
                  <p className="mx-auto max-w-2xl text-sm text-text-secondary">
                    {isProjectHome
                      ? "You are back at the main project workspace. Start a fresh thread here, open sources from the right panel, or adjust settings and memory from the left panel."
                      : selectedMode === "chat"
                        ? "Use Chat mode for conversation, quick questions, and read-only project context. Switch to Research or Product when you want a structured workflow."
                        : selectedMode === "research"
                          ? "Research mode is for structured retrieval, source review, synthesis, and confidence/gap analysis."
                          : "Product mode is for planning, drafting, packaging, and publishing deliverables from your project research."}
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

              {renderedMessages.map((message) => (
                <React.Fragment key={message.id}>
                  <MessageCard
                    message={message}
                    isStreaming={stream.isLoading && message.id === lastRenderedMessageId}
                  />
                  {message.role === "assistant" ? (
                    <SubagentCards subagents={subagentsByMessageId.get(message.id) || []} />
                  ) : null}
                </React.Fragment>
              ))}

              {pendingInterrupts.map((interrupt, index) => (
                <InterruptCard
                  key={interrupt.id || `${String(interrupt.value.type || "approval")}-${index}`}
                  interrupt={{ id: interrupt.id, value: interrupt.value }}
                  onResume={(resumeValue) => void handleInterruptResume(resumeValue, interrupt.id)}
                  isProcessing={resumingInterruptId !== null}
                />
              ))}
            </div>

            {hasRailContent ? (
              <aside className="hidden xl:block">
                <div className="sticky top-6">{rail}</div>
              </aside>
            ) : null}
          </div>
        </div>
      </div>

      <div className="border-t border-border bg-background px-6 py-4">
        <div className="mx-auto max-w-4xl">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-1 py-1">
              {([
                { id: "chat", label: "Chat", icon: MessageSquare },
                { id: "research", label: "Research", icon: Search },
                { id: "product", label: "Product", icon: PenTool },
              ] as const).map((mode) => {
                const Icon = mode.icon;
                const active = selectedMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setSelectedMode(mode.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      active ? "bg-accent-muted text-accent" : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5" />
                      {mode.label}
                    </span>
                  </button>
                );
              })}
            </div>
            {stream.isLoading ? (
              <button
                type="button"
                className="btn btn-secondary text-sm"
                onClick={() => stream.stop()}
              >
                <Square className="h-4 w-4" />
                Stop
              </button>
            ) : null}
          </div>

          {errorMessage ? (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
              <span className="font-medium">Error:</span>
              <span className="flex-1">{errorMessage}</span>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-error/60 hover:text-error"
              >
                &#x2715;
              </button>
            </div>
          ) : null}

          {stream.error ? (
            <div className="mb-3 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
              <span className="font-medium">Stream error:</span> {String(stream.error)}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="relative">
            <textarea
              ref={textareaRef}
              className="input min-h-[120px] resize-none rounded-2xl py-4 pr-14 text-base"
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
              className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
              aria-label="Send message"
            >
              <PanelRightOpen className="h-5 w-5 rotate-180" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
