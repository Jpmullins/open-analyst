/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockConvertToHtml = vi.fn();
vi.mock('mammoth', () => ({
  default: { convertToHtml: (...args: any[]) => mockConvertToHtml(...args) },
  convertToHtml: (...args: any[]) => mockConvertToHtml(...args),
}));

describe('DocxRenderer', () => {
  beforeEach(() => {
    mockConvertToHtml.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  async function renderComponent(url: string) {
    // Clear module cache so fresh mocks apply
    vi.resetModules();

    // Re-mock after reset
    vi.doMock('mammoth', () => ({
      default: { convertToHtml: (...args: any[]) => mockConvertToHtml(...args) },
      convertToHtml: (...args: any[]) => mockConvertToHtml(...args),
    }));

    const { DocxRenderer } = await import('~/components/file-renderers/DocxRenderer');
    const React = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { act } = await import('react');

    const container = document.createElement('div');
    document.body.appendChild(container);

    await act(async () => {
      const root = createRoot(container);
      root.render(React.createElement(DocxRenderer, { url }));
    });

    return container;
  }

  it('shows loading state initially', async () => {
    // fetch never resolves
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const container = await renderComponent('/api/test.docx');
    expect(container.textContent).toContain('Loading');
  });

  it('fetches the URL and renders HTML from mammoth', async () => {
    const arrayBuffer = new ArrayBuffer(8);
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(arrayBuffer),
        })
      )
    );
    mockConvertToHtml.mockResolvedValue({ value: '<p>Hello World</p>' });

    const container = await renderComponent('/api/test.docx');
    // Wait for async effect
    await new Promise((r) => setTimeout(r, 50));
    const { act } = await import('react');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(container.textContent).toContain('Hello World');
  });

  it('shows error state on fetch failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 500 }))
    );

    const container = await renderComponent('/api/test.docx');
    await new Promise((r) => setTimeout(r, 50));
    const { act } = await import('react');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(container.textContent).toMatch(/error|failed|Error|Failed/i);
  });
});
