import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '~/lib/store';
import type { ArtifactMeta } from '~/lib/types';

const sampleArtifact: ArtifactMeta = {
  documentId: 'doc-1',
  filename: 'report.pdf',
  mimeType: 'application/pdf',
  size: 12345,
  artifactUrl: '/api/projects/p1/documents/doc-1/artifact',
  downloadUrl: '/api/projects/p1/documents/doc-1/artifact?download=1',
  title: 'Quarterly Report',
};

describe('file viewer store', () => {
  beforeEach(() => {
    useAppStore.setState({ fileViewerArtifact: null });
  });

  it('fileViewerArtifact defaults to null', () => {
    const state = useAppStore.getState();
    expect(state.fileViewerArtifact).toBeNull();
  });

  it('openFileViewer sets the artifact', () => {
    useAppStore.getState().openFileViewer(sampleArtifact);
    expect(useAppStore.getState().fileViewerArtifact).toEqual(sampleArtifact);
  });

  it('closeFileViewer resets to null', () => {
    useAppStore.getState().openFileViewer(sampleArtifact);
    useAppStore.getState().closeFileViewer();
    expect(useAppStore.getState().fileViewerArtifact).toBeNull();
  });

  it('openFileViewer and closeFileViewer are functions', () => {
    const state = useAppStore.getState();
    expect(typeof state.openFileViewer).toBe('function');
    expect(typeof state.closeFileViewer).toBe('function');
  });
});
