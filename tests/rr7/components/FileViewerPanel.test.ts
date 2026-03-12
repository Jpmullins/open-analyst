/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock zustand store before importing component
const mockCloseFileViewer = vi.fn();
let mockArtifact: any = null;

vi.mock('~/lib/store', () => ({
  useAppStore: Object.assign(
    (selector: (s: any) => any) => {
      const state = {
        fileViewerArtifact: mockArtifact,
        closeFileViewer: mockCloseFileViewer,
      };
      return selector(state);
    },
    {
      getState: () => ({
        fileViewerArtifact: mockArtifact,
        closeFileViewer: mockCloseFileViewer,
      }),
    }
  ),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const icon = (props: any) => null;
  return {
    X: icon,
    Download: icon,
    BookOpen: icon,
    FileText: icon,
    FileSpreadsheet: icon,
    Image: icon,
    GripVertical: icon,
    Loader2: icon,
  };
});

// Mock the renderers
vi.mock('~/components/file-renderers/DocxRenderer', () => ({
  DocxRenderer: (props: any) => null,
}));
vi.mock('~/components/file-renderers/XlsxRenderer', () => ({
  XlsxRenderer: (props: any) => null,
}));
vi.mock('~/components/file-renderers/TextRenderer', () => ({
  TextRenderer: (props: any) => null,
}));

describe('FileViewerPanel', () => {
  beforeEach(() => {
    mockArtifact = null;
    mockCloseFileViewer.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  async function renderPanel() {
    const { FileViewerPanel } = await import('~/components/FileViewerPanel');
    const React = await import('react');
    const { createRoot } = await import('react-dom/client');

    const container = document.createElement('div');
    document.body.appendChild(container);

    const root = createRoot(container);
    root.render(React.createElement(FileViewerPanel));

    // Flush microtasks
    await new Promise((r) => setTimeout(r, 0));
    return container;
  }

  it('renders nothing when fileViewerArtifact is null', async () => {
    mockArtifact = null;
    const container = await renderPanel();
    expect(container.innerHTML).toBe('');
  });

  it('renders panel with filename and close button when artifact is set', async () => {
    mockArtifact = {
      documentId: 'doc-1',
      filename: 'report.pdf',
      mimeType: 'application/pdf',
      size: 12345,
      artifactUrl: '/api/test',
      downloadUrl: '/api/test?download=1',
    };
    const container = await renderPanel();
    expect(container.textContent).toContain('report.pdf');
    // close button exists
    const closeBtn = container.querySelector('[aria-label="Close file viewer"]');
    expect(closeBtn).not.toBeNull();
  });

  it('close button calls closeFileViewer', async () => {
    mockArtifact = {
      documentId: 'doc-1',
      filename: 'report.pdf',
      mimeType: 'application/pdf',
      size: 12345,
      artifactUrl: '/api/test',
      downloadUrl: '/api/test?download=1',
    };
    const container = await renderPanel();
    const closeBtn = container.querySelector('[aria-label="Close file viewer"]') as HTMLElement;
    closeBtn?.click();
    expect(mockCloseFileViewer).toHaveBeenCalled();
  });

  it('PDF artifact renders an iframe with the artifactUrl', async () => {
    mockArtifact = {
      documentId: 'doc-1',
      filename: 'report.pdf',
      mimeType: 'application/pdf',
      size: 12345,
      artifactUrl: '/api/test/pdf',
      downloadUrl: '/api/test/pdf?download=1',
    };
    const container = await renderPanel();
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('src')).toBe('/api/test/pdf');
  });

  it('image artifact renders an img with the artifactUrl', async () => {
    mockArtifact = {
      documentId: 'doc-1',
      filename: 'photo.png',
      mimeType: 'image/png',
      size: 5000,
      artifactUrl: '/api/test/img',
      downloadUrl: '/api/test/img?download=1',
    };
    const container = await renderPanel();
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('/api/test/img');
  });

  it('DOCX artifact renders DocxRenderer', async () => {
    mockArtifact = {
      documentId: 'doc-1',
      filename: 'doc.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 5000,
      artifactUrl: '/api/test/docx',
      downloadUrl: '/api/test/docx?download=1',
    };
    // The component will render DocxRenderer — since it's mocked, we just ensure no crash
    const container = await renderPanel();
    expect(container.textContent).toContain('doc.docx');
  });

  it('XLSX artifact renders XlsxRenderer', async () => {
    mockArtifact = {
      documentId: 'doc-1',
      filename: 'data.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 5000,
      artifactUrl: '/api/test/xlsx',
      downloadUrl: '/api/test/xlsx?download=1',
    };
    const container = await renderPanel();
    expect(container.textContent).toContain('data.xlsx');
  });

  it('text artifact renders TextRenderer', async () => {
    mockArtifact = {
      documentId: 'doc-1',
      filename: 'readme.txt',
      mimeType: 'text/plain',
      size: 200,
      artifactUrl: '/api/test/txt',
      downloadUrl: '/api/test/txt?download=1',
    };
    const container = await renderPanel();
    expect(container.textContent).toContain('readme.txt');
  });

  it('unknown mime type renders download fallback', async () => {
    mockArtifact = {
      documentId: 'doc-1',
      filename: 'archive.7z',
      mimeType: 'application/x-7z-compressed',
      size: 50000,
      artifactUrl: '/api/test/7z',
      downloadUrl: '/api/test/7z?download=1',
    };
    const container = await renderPanel();
    const downloadLink = container.querySelector('a[download]');
    expect(downloadLink).not.toBeNull();
  });
});
