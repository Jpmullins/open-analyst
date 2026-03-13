import type {
  ArtifactMeta,
  ContentBlock,
  StatusContent,
  TextContent,
  ToolResultContent,
  ToolUseContent,
} from '~/lib/types';

export interface ChatStreamEvent {
  type: 'status' | 'text_delta' | 'tool_call_start' | 'tool_call_end' | 'agent_end' | 'error';
  text?: string;
  phase?: string;
  status?: 'running' | 'completed' | 'error';
  toolName?: string;
  toolUseId?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  toolResultData?: unknown;
  toolStatus?: 'running' | 'completed' | 'error';
  error?: string;
  timestamp?: number;
}

function appendText(blocks: ContentBlock[], text: string): ContentBlock[] {
  if (!text) return blocks;

  const next = [...blocks];
  const last = next[next.length - 1];
  if (last?.type === 'text') {
    next[next.length - 1] = {
      ...last,
      text: `${(last as TextContent).text}${text}`,
    };
    return next;
  }

  next.push({ type: 'text', text });
  return next;
}

function appendStatus(blocks: ContentBlock[], event: ChatStreamEvent): ContentBlock[] {
  const text = String(event.text || event.error || '').trim();
  if (!text) return blocks;

  const block: StatusContent = {
    type: 'status',
    status: event.status || (event.error ? 'error' : 'running'),
    text,
    phase: event.phase,
  };

  const last = blocks[blocks.length - 1];
  if (
    last?.type === 'status' &&
    (last as StatusContent).status === block.status &&
    (last as StatusContent).phase === block.phase
  ) {
    return [...blocks.slice(0, -1), block];
  }

  return [...blocks, block];
}

function appendToolStart(blocks: ContentBlock[], event: ChatStreamEvent): ContentBlock[] {
  if (!event.toolUseId || !event.toolName) return blocks;
  const exists = blocks.some(
    (block) => block.type === 'tool_use' && (block as ToolUseContent).id === event.toolUseId
  );
  if (exists) return blocks;

  return [
    ...blocks,
    {
      type: 'tool_use',
      id: event.toolUseId,
      name: event.toolName,
      input: event.toolInput || {},
    },
  ];
}

const ARTIFACT_META_RE = /<!-- ARTIFACT_META (.*?) -->/g;

export function extractArtifactMeta(output: string): {
  cleanOutput: string;
  artifacts: ArtifactMeta[];
} {
  const artifacts: ArtifactMeta[] = [];
  const cleanOutput = output.replace(ARTIFACT_META_RE, (_match, json) => {
    try {
      artifacts.push(JSON.parse(json) as ArtifactMeta);
    } catch {
      // Ignore malformed sentinels
    }
    return '';
  }).trim();
  return { cleanOutput, artifacts };
}

function appendToolResult(blocks: ContentBlock[], event: ChatStreamEvent): ContentBlock[] {
  if (!event.toolUseId) return blocks;

  const rawOutput = String(event.toolOutput || event.error || '').trim();
  const { cleanOutput, artifacts } = extractArtifactMeta(rawOutput);

  const result: ToolResultContent = {
    type: 'tool_result',
    toolUseId: event.toolUseId,
    content: cleanOutput,
    isError: (event.toolStatus || event.status) === 'error' || Boolean(event.error),
    ...(artifacts.length > 0 ? { artifacts } : {}),
  };

  const exists = blocks.some(
    (block) =>
      block.type === 'tool_result' && (block as ToolResultContent).toolUseId === event.toolUseId
  );
  if (exists) {
    return blocks.map((block) =>
      block.type === 'tool_result' && (block as ToolResultContent).toolUseId === event.toolUseId
        ? result
        : block
    );
  }

  return [...blocks, result];
}

export function applyChatStreamEvent(
  blocks: ContentBlock[],
  event: ChatStreamEvent
): ContentBlock[] {
  switch (event.type) {
    case 'status':
      return appendStatus(blocks, event);
    case 'text_delta':
      return appendText(blocks, String(event.text || ''));
    case 'tool_call_start':
      return appendToolStart(blocks, event);
    case 'tool_call_end':
      return appendToolResult(blocks, event);
    case 'error':
      return appendStatus(blocks, {
        ...event,
        type: 'status',
        status: 'error',
        text: event.error || event.text || 'Run failed',
      });
    default:
      return blocks;
  }
}

export function extractFinalAssistantText(blocks: ContentBlock[]): string {
  return blocks
    .filter((block): block is TextContent => block.type === 'text')
    .map((block) => block.text)
    .join('');
}
