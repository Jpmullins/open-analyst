import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function loadProjectStore(tempHome: string) {
  process.env.HOME = tempHome;
  vi.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../scripts/headless/project-store.js');
}

describe('project-store', () => {
  let originalHome: string | undefined;
  let tempHome: string;

  beforeEach(() => {
    originalHome = process.env.HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'oa-project-store-'));
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('creates default project and supports CRUD', () => {
    const store = loadProjectStore(tempHome);

    const initial = store.listProjects();
    expect(initial.length).toBe(1);
    expect(initial[0].name).toBe('Default Project');

    const project = store.createProject({ name: 'Intel Ops', description: 'Primary workspace' });
    expect(project.name).toBe('Intel Ops');

    const loaded = store.getProject(project.id);
    expect(loaded).not.toBeNull();
    expect(loaded.name).toBe('Intel Ops');

    const updated = store.updateProject(project.id, { description: 'Updated' });
    expect(updated.description).toBe('Updated');

    const deleted = store.deleteProject(project.id);
    expect(deleted.success).toBe(true);
    expect(store.getProject(project.id)).toBeNull();
  });

  it('stores collections/documents and returns ranked retrieval results', () => {
    const store = loadProjectStore(tempHome);
    const project = store.createProject({ name: 'RAG Project' });
    const collection = store.createCollection(project.id, { name: 'Web Sources' });

    store.createDocument(project.id, {
      collectionId: collection.id,
      title: 'Kubernetes Security Baselines',
      sourceType: 'url',
      sourceUri: 'https://example.com/k8s',
      content: 'Kubernetes pod security standards and network policies are critical controls.',
    });

    store.createDocument(project.id, {
      collectionId: collection.id,
      title: 'General Notes',
      sourceType: 'manual',
      sourceUri: 'notes://1',
      content: 'Random planning text unrelated to container security.',
    });

    const result = store.queryDocuments(project.id, 'kubernetes security policies', { limit: 2 });
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].title).toContain('Kubernetes');
    expect(result.results[0].score).toBeGreaterThan(0);
    expect(result.results[0].snippet.length).toBeGreaterThan(0);
  });

  it('tracks run lifecycle and events', () => {
    const store = loadProjectStore(tempHome);
    const project = store.createProject({ name: 'Run Project' });

    const run = store.createRun(project.id, {
      type: 'chat',
      status: 'running',
      prompt: 'Summarize sources',
    });

    const event = store.appendRunEvent(project.id, run.id, 'tool_call_started', {
      toolName: 'web_search',
    });

    expect(event.type).toBe('tool_call_started');

    const completed = store.updateRun(project.id, run.id, {
      status: 'completed',
      output: 'Done',
    });

    expect(completed.status).toBe('completed');

    const loaded = store.getRun(project.id, run.id);
    expect(loaded).not.toBeNull();
    expect(loaded.events.length).toBe(1);
    expect(loaded.output).toBe('Done');
  });
});
