import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface DocxRendererProps {
  url: string;
}

export function DocxRenderer({ url }: DocxRendererProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        const mammoth = await import('mammoth');
        const result = await mammoth.default.convertToHtml({ arrayBuffer });
        if (!cancelled) setHtml(result.value);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load document');
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [url]);

  if (error) {
    return <div className="p-4 text-sm text-error">{error}</div>;
  }

  if (html === null) {
    return (
      <div className="flex items-center justify-center p-8 text-text-muted">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  return (
    <div
      className="prose prose-sm max-w-none p-4 overflow-auto"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
