import { describe, expect, it } from 'vitest';
import { applyChatStreamEvent, extractFinalAssistantText, extractArtifactMeta } from '~/lib/chat-stream';
import type { ContentBlock, ToolResultContent } from '~/lib/types';

describe('chat stream reducer', () => {
  it('builds structured blocks for status, tools, and final text', () => {
    let blocks: ContentBlock[] = [];

    blocks = applyChatStreamEvent(blocks, {
      type: 'status',
      status: 'running',
      phase: 'starting',
      text: 'Starting analysis',
    });
    blocks = applyChatStreamEvent(blocks, {
      type: 'tool_call_start',
      toolUseId: 'tool-1',
      toolName: 'web_fetch',
      toolInput: { url: 'https://example.com' },
    });
    blocks = applyChatStreamEvent(blocks, {
      type: 'tool_call_end',
      toolUseId: 'tool-1',
      toolName: 'web_fetch',
      toolOutput: 'Fetched example.com',
      toolStatus: 'completed',
    });
    blocks = applyChatStreamEvent(blocks, {
      type: 'text_delta',
      text: 'Final answer.',
    });

    expect(blocks).toEqual([
      {
        type: 'status',
        status: 'running',
        phase: 'starting',
        text: 'Starting analysis',
      },
      {
        type: 'tool_use',
        id: 'tool-1',
        name: 'web_fetch',
        input: { url: 'https://example.com' },
      },
      {
        type: 'tool_result',
        toolUseId: 'tool-1',
        content: 'Fetched example.com',
        isError: false,
      },
      {
        type: 'text',
        text: 'Final answer.',
      },
    ]);
    expect(extractFinalAssistantText(blocks)).toBe('Final answer.');
  });

  it('merges consecutive text deltas into one final text block', () => {
    let blocks: ContentBlock[] = [];
    blocks = applyChatStreamEvent(blocks, { type: 'text_delta', text: 'Hello' });
    blocks = applyChatStreamEvent(blocks, { type: 'text_delta', text: ' world' });

    expect(blocks).toEqual([{ type: 'text', text: 'Hello world' }]);
  });

  it('extracts artifact metadata from tool output sentinel', () => {
    const meta = {
      documentId: 'doc-123',
      filename: 'report.pdf',
      mimeType: 'application/pdf',
      size: 2048,
      artifactUrl: '/api/projects/p1/documents/doc-123/artifact',
      downloadUrl: '/api/projects/p1/documents/doc-123/artifact?download=1',
    };
    const raw = `Wrote file: report.pdf\n<!-- ARTIFACT_META ${JSON.stringify(meta)} -->`;

    let blocks: ContentBlock[] = [];
    blocks = applyChatStreamEvent(blocks, {
      type: 'tool_call_start',
      toolUseId: 'tool-2',
      toolName: 'write_file',
      toolInput: { path: 'report.pdf', content: '...' },
    });
    blocks = applyChatStreamEvent(blocks, {
      type: 'tool_call_end',
      toolUseId: 'tool-2',
      toolName: 'write_file',
      toolOutput: raw,
      toolStatus: 'completed',
    });

    const result = blocks.find(
      (b) => b.type === 'tool_result' && (b as ToolResultContent).toolUseId === 'tool-2'
    ) as ToolResultContent;
    expect(result).toBeDefined();
    expect(result.content).toBe('Wrote file: report.pdf');
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts![0].documentId).toBe('doc-123');
    expect(result.artifacts![0].filename).toBe('report.pdf');
  });
});

describe('extractArtifactMeta', () => {
  it('extracts single artifact sentinel', () => {
    const meta = { documentId: 'd1', filename: 'a.csv', mimeType: 'text/csv', size: 100, artifactUrl: '/a', downloadUrl: '/d' };
    const input = `Wrote file: a.csv\n<!-- ARTIFACT_META ${JSON.stringify(meta)} -->`;
    const { cleanOutput, artifacts } = extractArtifactMeta(input);

    expect(cleanOutput).toBe('Wrote file: a.csv');
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].documentId).toBe('d1');
  });

  it('returns empty artifacts for plain output', () => {
    const { cleanOutput, artifacts } = extractArtifactMeta('Wrote file: script.py');
    expect(cleanOutput).toBe('Wrote file: script.py');
    expect(artifacts).toHaveLength(0);
  });

  it('handles malformed sentinel gracefully', () => {
    const { cleanOutput, artifacts } = extractArtifactMeta('text\n<!-- ARTIFACT_META {bad json -->');
    expect(cleanOutput).toBe('text');
    expect(artifacts).toHaveLength(0);
  });
});
