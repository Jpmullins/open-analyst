import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '~/lib/store';
import type { ArtifactMeta } from '~/lib/types';
import { X, Download, FileText, FileSpreadsheet, Image, GripVertical, BookOpen } from 'lucide-react';
import { DocxRenderer } from '~/components/file-renderers/DocxRenderer';
import { XlsxRenderer } from '~/components/file-renderers/XlsxRenderer';
import { TextRenderer } from '~/components/file-renderers/TextRenderer';

function getArtifactIconColor(mimeType: string): { icon: typeof FileText; color: string } {
  if (mimeType.includes('pdf')) return { icon: FileText, color: 'text-red-500' };
  if (mimeType.includes('spreadsheet') || mimeType.includes('csv') || mimeType.includes('excel'))
    return { icon: FileSpreadsheet, color: 'text-green-500' };
  if (mimeType.startsWith('image/')) return { icon: Image, color: 'text-purple-500' };
  return { icon: FileText, color: 'text-blue-500' };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isDocxMime(artifact: ArtifactMeta): boolean {
  return (
    artifact.mimeType.includes('wordprocessingml') ||
    artifact.mimeType === 'application/msword' ||
    artifact.filename.endsWith('.docx') ||
    artifact.filename.endsWith('.doc')
  );
}

function isXlsxMime(artifact: ArtifactMeta): boolean {
  return (
    artifact.mimeType.includes('spreadsheetml') ||
    artifact.mimeType.includes('excel') ||
    artifact.mimeType === 'text/csv' ||
    artifact.filename.endsWith('.xlsx') ||
    artifact.filename.endsWith('.xls') ||
    artifact.filename.endsWith('.csv')
  );
}

function isTextMime(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml' ||
    mimeType.includes('+xml') ||
    mimeType.includes('+json')
  );
}

function FileContent({ artifact }: { artifact: ArtifactMeta }) {
  // PDF
  if (artifact.mimeType === 'application/pdf') {
    return (
      <iframe
        src={artifact.artifactUrl}
        className="w-full h-full border-0"
        title={artifact.filename}
      />
    );
  }

  // Image
  if (artifact.mimeType.startsWith('image/')) {
    return (
      <div className="flex items-center justify-center p-4 overflow-auto h-full">
        <img
          src={artifact.artifactUrl}
          alt={artifact.filename}
          className="max-w-full max-h-full object-contain"
        />
      </div>
    );
  }

  // DOCX
  if (isDocxMime(artifact)) {
    return <DocxRenderer url={artifact.artifactUrl} />;
  }

  // XLSX / XLS / CSV
  if (isXlsxMime(artifact)) {
    return <XlsxRenderer url={artifact.artifactUrl} />;
  }

  // Text-based
  if (isTextMime(artifact.mimeType)) {
    return <TextRenderer url={artifact.artifactUrl} />;
  }

  // Fallback: download
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-text-muted">
      <FileText className="w-12 h-12" />
      <p className="text-sm">Preview not available for this file type</p>
      <p className="text-xs">{artifact.mimeType}</p>
      <a
        href={artifact.downloadUrl}
        download
        className="px-4 py-2 rounded-lg bg-accent text-white text-sm hover:bg-accent-hover transition-colors"
      >
        Download File
      </a>
    </div>
  );
}

const MIN_WIDTH = 320;
const MAX_WIDTH = 1200;
const DEFAULT_WIDTH = 480;

interface FileViewerPanelProps {
  onOpenKnowledge?: () => void;
}

export function FileViewerPanel({ onOpenKnowledge }: FileViewerPanelProps) {
  const artifact = useAppStore((s) => s.fileViewerArtifact);
  const closeFileViewer = useAppStore((s) => s.closeFileViewer);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      // Dragging left edge → moving left = wider panel
      const delta = startX.current - e.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  if (!artifact) return null;

  const { icon: Icon, color } = getArtifactIconColor(artifact.mimeType);

  return (
    <div
      className="border-l border-border bg-surface flex flex-col shrink-0 relative"
      style={{ width }}
    >
      {/* Drag handle overlaid on the divider */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute -left-3 top-0 bottom-0 w-6 cursor-col-resize z-20 flex items-center justify-center"
      >
        <div className="w-4 h-8 rounded bg-surface border border-border shadow-sm flex items-center justify-center hover:bg-surface-hover hover:border-accent/40 transition-colors">
          <GripVertical className="w-3 h-3 text-text-muted" />
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <div className={`w-7 h-7 rounded-lg bg-surface-muted flex items-center justify-center ${color}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">
            {artifact.title || artifact.filename}
          </p>
          <p className="text-xs text-text-muted">
            {formatFileSize(artifact.size)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {onOpenKnowledge && (
            <button
              onClick={onOpenKnowledge}
              className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-surface-muted transition-colors text-text-muted hover:text-accent"
              title="Back to Knowledge"
              aria-label="Back to Knowledge"
            >
              <BookOpen className="w-3.5 h-3.5" />
            </button>
          )}
          <a
            href={artifact.downloadUrl}
            download
            className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-surface-muted transition-colors text-text-muted hover:text-accent"
            title="Download"
          >
            <Download className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={closeFileViewer}
            className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-surface-hover transition-colors text-text-muted"
            aria-label="Close file viewer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content — scrollable */}
      <div className="flex-1 overflow-y-auto">
        <FileContent artifact={artifact} />
      </div>
    </div>
  );
}
