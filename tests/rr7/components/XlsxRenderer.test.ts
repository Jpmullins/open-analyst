/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockRead = vi.fn();
const mockUtils = {
  sheet_to_json: vi.fn(),
};

vi.mock('xlsx', () => ({
  default: { read: (...args: any[]) => mockRead(...args), utils: mockUtils },
  read: (...args: any[]) => mockRead(...args),
  utils: mockUtils,
}));

describe('XlsxRenderer', () => {
  beforeEach(() => {
    mockRead.mockReset();
    mockUtils.sheet_to_json.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  async function renderComponent(url: string) {
    vi.resetModules();

    vi.doMock('xlsx', () => ({
      default: { read: (...args: any[]) => mockRead(...args), utils: mockUtils },
      read: (...args: any[]) => mockRead(...args),
      utils: mockUtils,
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

  it('fetches URL, parses with XLSX, renders table rows', async () => {
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

    mockRead.mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    });
    mockUtils.sheet_to_json.mockReturnValue([
      ['Name', 'Age'],
      ['Alice', 30],
    ]);

    const container = await renderComponent('/api/test.xlsx');
    const { act } = await import('react');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const table = container.querySelector('table');
    expect(table).not.toBeNull();
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

    mockRead.mockReturnValue({
      SheetNames: ['Sheet1', 'Sheet2'],
      Sheets: { Sheet1: {}, Sheet2: {} },
    });
    mockUtils.sheet_to_json.mockReturnValue([['A', 'B']]);

    const container = await renderComponent('/api/test.xlsx');
    const { act } = await import('react');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Should render tab buttons for sheet names
    expect(container.textContent).toContain('Sheet1');
    expect(container.textContent).toContain('Sheet2');
  });
});
