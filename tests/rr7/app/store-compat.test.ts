import { describe, it, expect } from 'vitest';
import { useAppStore } from '~/lib/store';

describe('store compatibility', () => {
  it('has the expected state keys with correct defaults', () => {
    const state = useAppStore.getState();

    // Config state
    expect(state).toHaveProperty('isConfigured');
    expect(state).toHaveProperty('appConfig');
    expect(state).toHaveProperty('showConfigModal');

    // Project state
    expect(state).toHaveProperty('projects');
    expect(state).toHaveProperty('activeProjectId');

    // Settings
    expect(state).toHaveProperty('settings');

    // UI state
    expect(state).toHaveProperty('isLoading');
    expect(state).toHaveProperty('sidebarCollapsed');

    // File viewer state
    expect(state).toHaveProperty('fileViewerArtifact');
    expect(state.fileViewerArtifact).toBeNull();

    // Actions
    expect(typeof state.setIsConfigured).toBe('function');
    expect(typeof state.setAppConfig).toBe('function');
    expect(typeof state.setProjects).toBe('function');
    expect(typeof state.setActiveProjectId).toBe('function');
    expect(typeof state.setShowConfigModal).toBe('function');
    expect(typeof state.setLoading).toBe('function');
    expect(typeof state.openFileViewer).toBe('function');
    expect(typeof state.closeFileViewer).toBe('function');
  });
});
