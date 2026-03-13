import { startTransition, useState, useRef, useCallback } from 'react';
import { getHeadlessApiBase } from '~/lib/headless-api';
import { applyChatStreamEvent, type ChatStreamEvent } from '~/lib/chat-stream';
import type { Message } from '~/lib/types';

interface SendMessageOpts {
  prompt: string;
  projectId: string;
  taskId?: string;
  messages?: Array<{ role: string; content: string }>;
  collectionId?: string;
  deepResearch?: boolean;
  pinnedMcpServerIds?: string[];
  skipUserMessage?: boolean;
}

export interface UseChatStreamReturn {
  streamingMessage: Message | null;
  isStreaming: boolean;
  sendMessage: (opts: SendMessageOpts) => Promise<{ taskId: string }>;
  stop: () => void;
}

export function useChatStream(): UseChatStreamReturn {
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const sendMessage = useCallback(async (opts: SendMessageOpts): Promise<{ taskId: string }> => {
    // Abort any in-flight request
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    setStreamingMessage(null);
    setIsStreaming(true);

    let taskId = opts.taskId || '';

    try {
      const res = await fetch(`${getHeadlessApiBase()}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: opts.prompt,
          projectId: opts.projectId,
          taskId: opts.taskId,
          messages: opts.messages || [],
          collectionId: opts.collectionId,
          deepResearch: Boolean(opts.deepResearch),
          pinnedMcpServerIds: opts.pinnedMcpServerIds || [],
          skipUserMessage: Boolean(opts.skipUserMessage),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6)) as ChatStreamEvent & {
                taskId?: string;
              };

              if (currentEvent === 'task_created' && data.taskId) {
                taskId = data.taskId;
              } else if (
                currentEvent === 'status' ||
                currentEvent === 'text_delta' ||
                currentEvent === 'tool_call_start' ||
                currentEvent === 'tool_call_end' ||
                currentEvent === 'error'
              ) {
                const event = {
                  ...data,
                  type: currentEvent,
                } as ChatStreamEvent;
                startTransition(() => {
                  setStreamingMessage((previous) => ({
                    id: `partial-${taskId || opts.taskId || 'new'}`,
                    sessionId: taskId || opts.taskId || '',
                    role: 'assistant',
                    content: applyChatStreamEvent(previous?.content || [], event),
                    timestamp: Date.now(),
                  }));
                });
              } else if (currentEvent === 'done') {
                if (data.taskId) taskId = data.taskId;
              } else if (currentEvent === 'error') {
                throw new Error(data.error || 'Stream error');
              }
            } catch (e) {
              if (e instanceof Error && e.message !== 'Stream error') {
                // skip malformed JSON
              } else {
                throw e;
              }
            }
            currentEvent = '';
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // User stopped — not an error
      } else {
        throw err;
      }
    } finally {
      setStreamingMessage(null);
      setIsStreaming(false);
      abortRef.current = null;
    }

    return { taskId };
  }, []);

  return { streamingMessage, isStreaming, sendMessage, stop };
}
