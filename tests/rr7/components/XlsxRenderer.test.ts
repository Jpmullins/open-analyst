/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockReadXlsxFile = vi.fn();
const mockReadSheetNames = vi.fn();

vi.mock('read-excel-file/browser', () => ({
  default: (...args: any[]) => mockReadXlsxFile(...args),
  readSheetNames: (...args: any[]) => mockReadSheetNames(...args),
}));

async function waitFor(
  fn: () => void,
  { timeout = 2000, interval = 10 } = {}
) {
  const start = Date.now();
  while (true) {
    try {
      fn();
      return;
    } catch (err) {
      if (Date.now() - start > timeout) throw err;
      await new Promise((r) => setTimeout(r, interval));
    }
  }
}

describe('XlsxRenderer', () => {
  beforeEach(() => {
    mockReadXlsxFile.mockReset();
    mockReadSheetNames.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  async function renderComponent(url: string) {
    vi.resetModules();

    vi.doMock('read-excel-file/browser', () => ({
      default: (...args: any[]) => mockReadXlsxFile(...args),
      readSheetNames: (...args: any[]) => mockReadSheetNames(...args),
    }));

    const { XlsxRenderer } = await import('~/components/file-renderers/XlsxRenderer');
    const React = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { act } = await import('react');

    const container = document.createElement('div');
    document.body.appendChild(container);

    await act(async () => {
      const root = createRoot(container);
      root.render(React.createElement(XlsxRenderer, { url }));
    });

    return container;
  }

  it('shows loading state initially', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const container = await renderComponent('/api/test.xlsx');
    expect(container.textContent).toContain('Loading');
  });

  it('fetches URL, parses with ExcelJS, renders table rows', async () => {
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

    mockReadSheetNames.mockResolvedValue(['Sheet1']);
    mockReadXlsxFile.mockResolvedValue([
      ['Name', 'Age'],
      ['Alice', 30],
    ]);

    const container = await renderComponent('/api/test.xlsx');
    await waitFor(() => {
      expect(container.querySelector('table')).not.toBeNull();
      expect(container.textContent).toContain('Alice');
    });
  });

  it('shows sheet tabs when workbook has multiple sheets', async () => {
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

    mockReadSheetNames.mockResolvedValue(['Sheet1', 'Sheet2']);
    mockReadXlsxFile
      .mockResolvedValueOnce([['A', 'B']])
      .mockResolvedValueOnce([['C', 'D']]);

    const container = await renderComponent('/api/test.xlsx');
    await waitFor(() => {
      // Should render tab buttons for sheet names
      expect(container.textContent).toContain('Sheet1');
      expect(container.textContent).toContain('Sheet2');
    });
  });
});
