import { describe, it, expect } from 'vitest';
import { splitTextByFileMentions, getFileLinkButtonClassName, splitChildrenByFileMentions } from '../src/renderer/utils/file-link';

describe('splitTextByFileMentions', () => {
  it('detects bare filenames with extension', () => {
    const input = 'Open sample-report.txt to review';
    const parts = splitTextByFileMentions(input);
    expect(parts).toEqual([
      { type: 'text', value: 'Open ' },
      { type: 'file', value: 'sample-report.txt' },
      { type: 'text', value: ' to review' },
    ]);
  });

  it('detects unicode filenames at the start of a line', () => {
    const input = 'simple-sales-report.xlsx - generated Excel file';
    const parts = splitTextByFileMentions(input);
    expect(parts).toEqual([
      { type: 'file', value: 'simple-sales-report.xlsx' },
      { type: 'text', value: ' - generated Excel file' },
    ]);
  });

  it('detects absolute paths', () => {
    const input = 'Path /Users/analyst/test/report.docx generated';
    const parts = splitTextByFileMentions(input);
    expect(parts).toEqual([
      { type: 'text', value: 'Path ' },
      { type: 'file', value: '/Users/analyst/test/report.docx' },
      { type: 'text', value: ' generated' },
    ]);
  });

  it('detects absolute paths with spaces', () => {
    const input = 'Document saved to: /Users/analyst/Library/Application Support/open-analyst/default_working_dir/word-document/sample-report.docx';
    const parts = splitTextByFileMentions(input);
    expect(parts).toEqual([
      { type: 'text', value: 'Document saved to: ' },
      { type: 'file', value: '/Users/analyst/Library/Application Support/open-analyst/default_working_dir/word-document/sample-report.docx' },
    ]);
  });

  it('ignores urls', () => {
    const input = '查看 https://example.com/demo.txt';
    const parts = splitTextByFileMentions(input);
    expect(parts).toEqual([{ type: 'text', value: input }]);
  });

  it('does not treat numeric dimensions as filenames', () => {
    const input = 'HTML尺寸应该是10.0" × 5.6" (16:9比例)。';
    const parts = splitTextByFileMentions(input);
    expect(parts).toEqual([{ type: 'text', value: input }]);
  });

  it('ignores filenames embedded in sentences without boundaries', () => {
    const input = 'I see there is already a slide1.html file. Let me create another slide file first: slide2.html:';
    const parts = splitTextByFileMentions(input);
    expect(parts).toEqual([{ type: 'text', value: input }]);
  });

  it('provides a left-aligned file link button class', () => {
    const className = getFileLinkButtonClassName();
    expect(className).toContain('text-left');
    expect(className).toContain('break-all');
  });

  it('splits string children into file and text parts', () => {
    const parts = splitChildrenByFileMentions(['simple.md - 描述']);
    expect(parts).toEqual([
      { type: 'file', value: 'simple.md' },
      { type: 'text', value: ' - 描述' },
    ]);
  });
});
