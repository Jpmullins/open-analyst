import { useAppStore } from '~/lib/store';
import type { ArtifactMeta } from '~/lib/types';
import { X, Download, FileText, FileSpreadsheet, Image, BookOpen, FileAudio, FileVideo, Loader2 } from 'lucide-react';
import { DocxRenderer } from '~/components/file-renderers/DocxRenderer';
import { XlsxRenderer } from '~/components/file-renderers/XlsxRenderer';
import { TextRenderer } from '~/components/file-renderers/TextRenderer';
import { useArtifactObjectUrl } from '~/components/file-renderers/useArtifactObjectUrl';

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
    mimeType === 'application/javascript' ||
    mimeType === 'application/xml' ||
    mimeType.includes('+xml') ||
    mimeType.includes('+json')
  );
}

function isHtmlMime(mimeType: string, filename: string): boolean {
  return mimeType.includes('html') || filename.endsWith('.html') || filename.endsWith('.htm');
}

function isAudioMime(mimeType: string): boolean {
  return mimeType.startsWith('audio/');
}

function isVideoMime(mimeType: string): boolean {
  return mimeType.startsWith('video/');
}

function MetadataPreview({ artifact }: { artifact: ArtifactMeta }) {
  const metadata = artifact.metadata || {};

  return (
    <div className="p-5 space-y-4">
      <div className="rounded-xl border border-border bg-background px-4 py-3 space-y-2">
        <div className="text-xs uppercase tracking-[0.16em] text-text-muted">Artifact metadata</div>
        <dl className="space-y-2 text-sm">
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <dt className="text-text-muted">Filename</dt>
            <dd className="break-all text-text-primary">{artifact.filename}</dd>
          </div>
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <dt className="text-text-muted">Type</dt>
            <dd className="break-all text-text-primary">{artifact.mimeType}</dd>
          </div>
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <dt className="text-text-muted">Size</dt>
            <dd className="text-text-primary">{formatFileSize(artifact.size)}</dd>
          </div>
          {artifact.storageUri ? (
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <dt className="text-text-muted">Storage</dt>
              <dd className="break-all text-text-primary">{artifact.storageUri}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      {artifact.textPreview ? (
        <div className="rounded-xl border border-border bg-background px-4 py-3">
          <div className="text-xs uppercase tracking-[0.16em] text-text-muted mb-2">Extracted text</div>
          <pre className="text-xs whitespace-pre-wrap break-words text-text-secondary">
            {artifact.textPreview}
          </pre>
        </div>
      ) : null}

      {Object.keys(metadata).length ? (
        <div className="rounded-xl border border-border bg-background px-4 py-3">
          <div className="text-xs uppercase tracking-[0.16em] text-text-muted mb-2">Metadata JSON</div>
          <pre className="text-xs whitespace-pre-wrap break-words text-text-secondary">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function FileContent({ artifact }: { artifact: ArtifactMeta }) {
  const lowerFilename = artifact.filename.toLowerCase();
  const isPdf = artifact.mimeType === 'application/pdf';
  const isImage = artifact.mimeType.startsWith('image/');
  const isDocx = isDocxMime(artifact);
  const isXlsx = isXlsxMime(artifact);
  const isHtml = isHtmlMime(artifact.mimeType, lowerFilename);
  const isAudio = isAudioMime(artifact.mimeType);
  const isVideo = isVideoMime(artifact.mimeType);
  const isText = isTextMime(artifact.mimeType);
  const needsObjectUrl =
    isPdf || isImage || isDocx || isXlsx || isHtml || isAudio || isVideo || isText;
  const objectUrl = useArtifactObjectUrl(artifact.artifactUrl, needsObjectUrl);
  const previewUrl = needsObjectUrl ? objectUrl : artifact.artifactUrl;

  if (needsObjectUrl && !previewUrl) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-text-muted">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading preview...
      </div>
    );
  }

  // PDF
  if (isPdf) {
    return (
      <iframe
        src={previewUrl}
        className="w-full h-full border-0"
        title={artifact.filename}
      />
    );
  }

  // Image
  if (isImage) {
    return (
      <div className="flex items-center justify-center p-4 overflow-auto h-full">
        <img
          src={previewUrl}
          alt={artifact.filename}
          className="max-w-full max-h-full object-contain"
        />
      </div>
    );
  }

  // DOCX
  if (isDocx) {
    return <DocxRenderer url={previewUrl} />;
  }

  // XLSX / XLS / CSV
  if (isXlsx) {
    return <XlsxRenderer url={previewUrl} />;
  }

  if (isHtml) {
    return <iframe src={previewUrl} className="w-full h-full border-0 bg-white" title={artifact.filename} />;
  }

  if (isAudio) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <audio controls src={previewUrl} className="w-full max-w-xl" />
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className="h-full flex items-center justify-center p-4 bg-black/10">
        <video controls src={previewUrl} className="max-w-full max-h-full" />
      </div>
    );
  }

  // Text-based
  if (isText) {
    return <TextRenderer url={previewUrl} />;
  }

  return <MetadataPreview artifact={artifact} />;
}

interface FileViewerPanelProps {
  onOpenKnowledge?: () => void;
}

export function FileViewerPanel({ onOpenKnowledge }: FileViewerPanelProps) {
  const artifact = useAppStore((s) => s.fileViewerArtifact);
  const closeFileViewer = useAppStore((s) => s.closeFileViewer);

  if (!artifact) return null;

  const { icon: Icon, color } = getArtifactIconColor(artifact.mimeType);
  const HeaderIcon =
    isAudioMime(artifact.mimeType) ? FileAudio : isVideoMime(artifact.mimeType) ? FileVideo : Icon;

  return (
    <div className="bg-surface flex flex-col shrink-0 relative min-h-0 h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <div className={`w-7 h-7 rounded-lg bg-surface-muted flex items-center justify-center ${color}`}>
          <HeaderIcon className="w-3.5 h-3.5" />
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
      <div className="flex-1 overflow-y-auto min-h-0">
        <FileContent artifact={artifact} />
      </div>
    </div>
  );
}
