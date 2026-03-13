import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface TextRendererProps {
  url: string;
}

export function TextRenderer({ url }: TextRendererProps) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        const content = await res.text();
        if (!cancelled) setText(content);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load file');
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [url]);

  if (error) {
    return <div className="p-4 text-sm text-error">{error}</div>;
  }

  if (text === null) {
    return (
      <div className="flex items-center justify-center p-8 text-text-muted">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  return (
    <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-words overflow-auto">
      {text}
    </pre>
  );
}
