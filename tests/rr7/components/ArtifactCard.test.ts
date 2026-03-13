/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockOpenFileViewer = vi.fn();

vi.mock('~/lib/store', () => ({
  useAppStore: Object.assign(
    (selector: (s: any) => any) => {
      const state = {
        openFileViewer: mockOpenFileViewer,
        pendingPermission: null,
        pendingQuestion: null,
        settings: { theme: 'light' },
      };
      return selector ? selector(state) : state;
    },
    {
      getState: () => ({
        openFileViewer: mockOpenFileViewer,
        pendingPermission: null,
        pendingQuestion: null,
        settings: { theme: 'light' },
      }),
      setState: vi.fn(),
      subscribe: vi.fn(),
      destroy: vi.fn(),
    }
  ),
}));

// Minimal mocks for heavy deps used by MessageCard
vi.mock('react-markdown', () => ({ default: (props: any) => props.children }));
vi.mock('remark-math', () => ({ default: () => {} }));
vi.mock('remark-gfm', () => ({ default: () => {} }));
vi.mock('rehype-katex', () => ({ default: () => {} }));
vi.mock('~/lib/file-link', () => ({
  splitTextByFileMentions: (text: string) => [text],
  splitChildrenByFileMentions: (children: any) => children,
  getFileLinkButtonClassName: () => '',
}));

describe('ArtifactCard click behavior', () => {
  beforeEach(() => {
    mockOpenFileViewer.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  const artifact = {
    documentId: 'doc-1',
    filename: 'report.pdf',
    mimeType: 'application/pdf',
    size: 12345,
    artifactUrl: '/api/test',
    downloadUrl: '/api/test?download=1',
  };

  async function renderArtifactCard() {
    vi.resetModules();

    // Re-apply mocks after module reset
    vi.doMock('~/lib/store', () => ({
      useAppStore: Object.assign(
        (selector: (s: any) => any) => {
          const state = {
            openFileViewer: mockOpenFileViewer,
            pendingPermission: null,
            pendingQuestion: null,
            settings: { theme: 'light' },
          };
          return selector ? selector(state) : state;
        },
        {
          getState: () => ({
            openFileViewer: mockOpenFileViewer,
          }),
          setState: vi.fn(),
          subscribe: vi.fn(),
          destroy: vi.fn(),
        }
      ),
    }));
    vi.doMock('react-markdown', () => ({ default: (props: any) => props.children }));
    vi.doMock('remark-math', () => ({ default: () => {} }));
    vi.doMock('remark-gfm', () => ({ default: () => {} }));
    vi.doMock('rehype-katex', () => ({ default: () => {} }));
    vi.doMock('~/lib/file-link', () => ({
      splitTextByFileMentions: (text: string) => [text],
      splitChildrenByFileMentions: (children: any) => children,
      getFileLinkButtonClassName: () => '',
    }));

    const { ArtifactCard } = await import('~/components/MessageCard');
    const React = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { act } = await import('react');

    const container = document.createElement('div');
    document.body.appendChild(container);

    await act(async () => {
      const root = createRoot(container);
      root.render(React.createElement(ArtifactCard, { artifact }));
    });

    return container;
  }

  it('clicking the card body calls openFileViewer with the artifact', async () => {
    const container = await renderArtifactCard();
    const card = container.querySelector('[data-testid="artifact-card"]') as HTMLElement;
    expect(card).not.toBeNull();
    card?.click();
    expect(mockOpenFileViewer).toHaveBeenCalledWith(artifact);
  });

  it('clicking "open in new tab" link does NOT call openFileViewer', async () => {
    const container = await renderArtifactCard();
    const externalLink = container.querySelector('a[title="Preview"]') as HTMLElement;
    expect(externalLink).not.toBeNull();
    externalLink?.click();
    expect(mockOpenFileViewer).not.toHaveBeenCalled();
  });

  it('clicking "download" link does NOT call openFileViewer', async () => {
    const container = await renderArtifactCard();
    const downloadLink = container.querySelector('a[title="Download"]') as HTMLElement;
    expect(downloadLink).not.toBeNull();
    downloadLink?.click();
    expect(mockOpenFileViewer).not.toHaveBeenCalled();
  });
});
