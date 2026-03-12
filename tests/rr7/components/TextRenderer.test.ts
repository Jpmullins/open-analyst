/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('TextRenderer', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  async function renderComponent(url: string) {
    vi.resetModules();
    const { TextRenderer } = await import('~/components/file-renderers/TextRenderer');
    const React = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { act } = await import('react');

    const container = document.createElement('div');
    document.body.appendChild(container);

    await act(async () => {
      const root = createRoot(container);
      root.render(React.createElement(TextRenderer, { url }));
    });

    return container;
  }

  it('shows loading state initially', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const container = await renderComponent('/api/test.txt');
    expect(container.textContent).toContain('Loading');
  });

  it('fetches URL as text and renders in <pre>', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve('Hello world\nLine 2'),
        })
      )
    );

    const container = await renderComponent('/api/test.txt');
    const { act } = await import('react');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre?.textContent).toContain('Hello world');
    expect(pre?.textContent).toContain('Line 2');
  });
});
