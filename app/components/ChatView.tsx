import { useState, useRef, useEffect, useMemo } from 'react';
import { useRevalidator, useSearchParams } from 'react-router';
import { useAppStore } from '~/lib/store';
import { useChatStream } from '~/hooks/useChatStream';
import { MessageCard } from './MessageCard';
import type { Message } from '~/lib/types';
import {
  headlessGetCollections,
  headlessGetMcpServerStatus,
  type HeadlessCollection,
} from '~/lib/headless-api';
import { KnowledgePanel } from './KnowledgePanel';
import { Send, Square, Plus, Loader2, Plug, X, BookOpen } from 'lucide-react';

interface ChatViewProps {
  taskId: string;
  taskTitle: string;
  projectId: string;
  initialMessages: Array<{
    id: string;
    role: string;
    content: unknown;
    timestamp: string | Date;
  }>;
}

export function ChatView({ taskId, taskTitle, projectId, initialMessages }: ChatViewProps) {
  const { appConfig, activeCollectionByProject, setProjectActiveCollection, fileViewerArtifact, closeFileViewer } = useAppStore();
  const { streamingMessage, isStreaming, sendMessage, stop } = useChatStream();
  const { revalidate } = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();
  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeConnectors, setActiveConnectors] = useState<any[]>([]);
  const [showConnectorLabel, setShowConnectorLabel] = useState(true);
  const [projectCollections, setProjectCollections] = useState<HeadlessCollection[]>([]);
  const [knowledgePanelOpen, setKnowledgePanelOpen] = useState(
    searchParams.get('panel') === 'knowledge'
  );

  // URL-persisted state
  const deepResearch = searchParams.get('deepResearch') === 'true';
  const collectionParam = searchParams.get('collection');
  const pinnedConnectorIds = (searchParams.get('mcp') || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const headerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const connectorMeasureRef = useRef<HTMLDivElement>(null);
  const [pastedImages, setPastedImages] = useState<
    Array<{ url: string; base64: string; mediaType: string }>
  >([]);
  const [attachedFiles, setAttachedFiles] = useState<
    Array<{ name: string; path: string; size: number; type: string }>
  >([]);
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isUserAtBottomRef = useRef(true);
  const isComposingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevMessageCountRef = useRef(0);
  const prevPartialLengthRef = useRef(0);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRequestRef = useRef<number | null>(null);
  const isScrollingRef = useRef(false);

  // Convert DB messages to display format
  const messages: Message[] = useMemo(() => {
    return initialMessages.map((m) => ({
      id: m.id,
      sessionId: taskId,
      role: m.role as Message['role'],
      content: Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content) }],
      timestamp:
        typeof m.timestamp === 'string'
          ? new Date(m.timestamp).getTime()
          : m.timestamp instanceof Date
            ? m.timestamp.getTime()
            : Date.now(),
    }));
  }, [initialMessages, taskId]);

  const displayedMessages = useMemo(() => {
    if (!streamingMessage) return messages;
    return [...messages, streamingMessage];
  }, [messages, streamingMessage]);

  // Debounced scroll function to prevent scroll conflicts
  const scrollToBottom = useRef((behavior: ScrollBehavior = 'auto', immediate: boolean = false) => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }
    if (scrollRequestRef.current) {
      cancelAnimationFrame(scrollRequestRef.current);
      scrollRequestRef.current = null;
    }

    const performScroll = () => {
      if (!isUserAtBottomRef.current) return;
      isScrollingRef.current = true;
      messagesEndRef.current?.scrollIntoView({ behavior });
      setTimeout(
        () => {
          isScrollingRef.current = false;
        },
        behavior === 'smooth' ? 300 : 50
      );
    };

    if (immediate) {
      performScroll();
    } else {
      scrollRequestRef.current = requestAnimationFrame(() => {
        scrollTimeoutRef.current = setTimeout(performScroll, 16);
      });
    }
  }).current;

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const updateScrollState = () => {
      const distanceToBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      isUserAtBottomRef.current = distanceToBottom <= 80;
    };
    updateScrollState();
    const onScroll = () => updateScrollState();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const loadCollections = async () => {
      if (!projectId) {
        setProjectCollections([]);
        return;
      }
      try {
        const next = await headlessGetCollections(projectId);
        setProjectCollections(next);
        if (!activeCollectionByProject[projectId] && next[0]) {
          setProjectActiveCollection(projectId, next[0].id);
        }
      } catch {
        setProjectCollections([]);
      }
    };
    void loadCollections();
  }, [projectId, activeCollectionByProject, setProjectActiveCollection]);

  useEffect(() => {
    const messageCount = messages.length;
    const partialLength = JSON.stringify(streamingMessage?.content || []).length;
    const hasNewMessage = messageCount !== prevMessageCountRef.current;
    const isStreamingTick = partialLength !== prevPartialLengthRef.current && !hasNewMessage;

    if (isScrollingRef.current) {
      prevMessageCountRef.current = messageCount;
      prevPartialLengthRef.current = partialLength;
      return;
    }

    if (isUserAtBottomRef.current) {
      if (!isStreamingTick) {
        const behavior: ScrollBehavior = hasNewMessage ? 'smooth' : 'auto';
        scrollToBottom(behavior, false);
      } else {
        scrollToBottom('auto', false);
      }
    }

    prevMessageCountRef.current = messageCount;
    prevPartialLengthRef.current = partialLength;
  }, [messages.length, streamingMessage]);

  // Resize observer for content height changes
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const messagesContainer = container.querySelector('.max-w-3xl');
    if (!messagesContainer) return;

    const resizeObserver = new ResizeObserver(() => {
      if (!isScrollingRef.current && isUserAtBottomRef.current) {
        scrollToBottom('auto', false);
      }
    });
    resizeObserver.observe(messagesContainer);
    return () => resizeObserver.disconnect();
  }, [displayedMessages]);

  // Cleanup scroll timeouts on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (scrollRequestRef.current) cancelAnimationFrame(scrollRequestRef.current);
    };
  }, []);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [taskId]);

  // Auto-trigger streaming for pending tasks (navigated from dashboard)
  const autoStreamedRef = useRef(false);
  useEffect(() => {
    if (autoStreamedRef.current || isStreaming || isSubmitting) return;
    // If there's exactly one user message and no assistant messages, auto-stream
    const hasOnlyUserMessage = initialMessages.length === 1 && initialMessages[0].role === 'user';
    if (!hasOnlyUserMessage) return;

    autoStreamedRef.current = true;
    const collectionId = collectionParam || '';

    sendMessage({
      prompt: '',
      projectId,
      taskId,
      collectionId,
      pinnedMcpServerIds: pinnedConnectorIds,
      skipUserMessage: true,
    }).then(() => revalidate());
  }, [taskId, initialMessages]);

  // Handle paste event for images
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems = Array.from(items).filter((item) => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;

    e.preventDefault();

    const newImages: Array<{ url: string; base64: string; mediaType: string }> = [];

    for (const item of imageItems) {
      const blob = item.getAsFile();
      if (!blob) continue;

      try {
        const resizedBlob = await resizeImageIfNeeded(blob);
        const base64 = await blobToBase64(resizedBlob);
        const url = URL.createObjectURL(resizedBlob);
        newImages.push({
          url,
          base64,
          mediaType: resizedBlob.type as any,
        });
      } catch (err) {
        console.error('Failed to process pasted image:', err);
      }
    }

    setPastedImages((prev) => [...prev, ...newImages]);
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const resizeImageIfNeeded = async (blob: Blob): Promise<Blob> => {
    const MAX_BLOB_SIZE = 3.75 * 1024 * 1024;

    if (blob.size <= MAX_BLOB_SIZE) {
      return blob;
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);

      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        let scale = Math.sqrt(MAX_BLOB_SIZE / blob.size);
        let quality = 0.9;

        const attemptCompress = (currentScale: number, currentQuality: number): Promise<Blob> => {
          canvas.width = Math.floor(img.width * currentScale);
          canvas.height = Math.floor(img.height * currentScale);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          return new Promise((resolveBlob) => {
            canvas.toBlob(
              (compressedBlob) => {
                if (!compressedBlob) {
                  reject(new Error('Failed to compress image'));
                  return;
                }
                if (
                  compressedBlob.size > MAX_BLOB_SIZE &&
                  (currentQuality > 0.5 || currentScale > 0.3)
                ) {
                  const newQuality = Math.max(0.5, currentQuality - 0.1);
                  const newScale = currentQuality <= 0.5 ? currentScale * 0.9 : currentScale;
                  attemptCompress(newScale, newQuality).then(resolveBlob);
                } else {
                  resolveBlob(compressedBlob);
                }
              },
              blob.type || 'image/jpeg',
              currentQuality
            );
          });
        };

        attemptCompress(scale, quality).then(resolve).catch(reject);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };

      img.src = url;
    });
  };

  const removeImage = (index: number) => {
    setPastedImages((prev) => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].url);
      updated.splice(index, 1);
      return updated;
    });
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => {
      const updated = [...prev];
      updated.splice(index, 1);
      return updated;
    });
  };

  const handleFileSelect = async () => {
    try {
      const picker = document.createElement('input');
      picker.type = 'file';
      picker.multiple = true;
      picker.onchange = () => {
        const files = Array.from(picker.files || []);
        if (!files.length) return;
        const newFiles = files.map((file) => ({
          name: file.name || 'unknown',
          path: '',
          size: file.size || 0,
          type: file.type || 'application/octet-stream',
        }));
        setAttachedFiles((prev) => [...prev, ...newFiles]);
      };
      picker.click();
    } catch (error) {
      console.error('[ChatView] Error selecting files:', error);
    }
  };

  // Load active MCP connectors
  useEffect(() => {
    const loadConnectors = async () => {
      try {
        const statuses = await headlessGetMcpServerStatus();
        const active = statuses?.filter((s: any) => s.connected && s.toolCount > 0) || [];
        setActiveConnectors(active);
      } catch (err) {
        console.error('Failed to load MCP connectors:', err);
      }
    };
    void loadConnectors();
    const interval = setInterval(() => {
      void loadConnectors();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Handle drag and drop for images
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    const otherFiles = files.filter((file) => !file.type.startsWith('image/'));

    if (imageFiles.length > 0) {
      const newImages: Array<{ url: string; base64: string; mediaType: string }> = [];
      for (const file of imageFiles) {
        try {
          const resizedBlob = await resizeImageIfNeeded(file);
          const base64 = await blobToBase64(resizedBlob);
          const url = URL.createObjectURL(resizedBlob);
          newImages.push({ url, base64, mediaType: resizedBlob.type });
        } catch (err) {
          console.error('Failed to process dropped image:', err);
        }
      }
      setPastedImages((prev) => [...prev, ...newImages]);
    }

    if (otherFiles.length > 0) {
      const newFiles = otherFiles.map((file) => ({
        name: file.name,
        path: '',
        size: file.size,
        type: file.type || 'application/octet-stream',
      }));
      setAttachedFiles((prev) => [...prev, ...newFiles]);
    }
  };

  useEffect(() => {
    const titleEl = titleRef.current;
    const headerEl = headerRef.current;
    const measureEl = connectorMeasureRef.current;
    if (!titleEl || !headerEl || !measureEl) {
      setShowConnectorLabel(true);
      return;
    }
    const updateLabelVisibility = () => {
      const isTruncated = titleEl.scrollWidth > titleEl.clientWidth;
      const headerStyle = window.getComputedStyle(headerEl);
      const paddingLeft = Number.parseFloat(headerStyle.paddingLeft) || 0;
      const paddingRight = Number.parseFloat(headerStyle.paddingRight) || 0;
      const contentWidth = headerEl.clientWidth - paddingLeft - paddingRight;
      const titleWidth = titleEl.getBoundingClientRect().width;
      const rightColumnWidth = Math.max(0, (contentWidth - titleWidth) / 2);
      const connectorFullWidth = measureEl.getBoundingClientRect().width;
      setShowConnectorLabel(!isTruncated && rightColumnWidth >= connectorFullWidth);
    };
    updateLabelVisibility();
    const observer = new ResizeObserver(() => updateLabelVisibility());
    observer.observe(titleEl);
    observer.observe(headerEl);
    return () => observer.disconnect();
  }, [taskTitle, activeConnectors.length]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    const currentPrompt = textareaRef.current?.value || prompt;

    if (
      (!currentPrompt.trim() && pastedImages.length === 0 && attachedFiles.length === 0) ||
      isSubmitting
    )
      return;

    setIsSubmitting(true);
    try {
      const collectionId = collectionParam || '';

      await sendMessage({
        prompt: currentPrompt.trim(),
        projectId,
        taskId,
        collectionId,
        deepResearch: deepResearch,
        pinnedMcpServerIds: pinnedConnectorIds,
      });

      // Revalidate route data to pick up new messages from DB
      revalidate();

      setPrompt('');
      if (textareaRef.current) {
        textareaRef.current.value = '';
      }
      pastedImages.forEach((img) => URL.revokeObjectURL(img.url));
      setPastedImages([]);
      setAttachedFiles([]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStop = () => {
    stop();
  };

  const togglePinnedConnector = (connectorId: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const current = new Set(
          (next.get('mcp') || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        );
        if (current.has(connectorId)) {
          current.delete(connectorId);
        } else {
          current.add(connectorId);
        }
        if (current.size > 0) {
          next.set('mcp', Array.from(current).join(','));
        } else {
          next.delete('mcp');
        }
        return next;
      },
      { replace: true }
    );
  };

  // Mutual exclusion: file viewer open -> close knowledge panel
  useEffect(() => {
    if (fileViewerArtifact) {
      setKnowledgePanelOpen(false);
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.delete('panel');
          return p;
        },
        { replace: true }
      );
    }
  }, [fileViewerArtifact, setSearchParams]);

  const toggleKnowledgePanel = () => {
    const next = !knowledgePanelOpen;
    if (next) closeFileViewer();
    setKnowledgePanelOpen(next);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next) p.set('panel', 'knowledge');
        else p.delete('panel');
        return p;
      },
      { replace: true }
    );
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div
          ref={headerRef}
          className="relative border-b border-border bg-surface/80 backdrop-blur-sm"
        >
          <div className="grid h-14 grid-cols-[1fr_auto_1fr] items-center px-6">
            <div />
            <h2
              ref={titleRef}
              className="font-medium text-text-primary text-center truncate max-w-lg"
            >
              {taskTitle}
            </h2>
            <div className="flex items-center gap-2 justify-self-end">
              {activeConnectors.length > 0 && (
                <>
                  <div
                    ref={connectorMeasureRef}
                    aria-hidden="true"
                    className="absolute left-0 top-0 -z-10 opacity-0 pointer-events-none"
                  >
                    <div className="flex items-center gap-2 px-2 py-1 rounded-lg border border-amber-500/20">
                      <Plug className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium whitespace-nowrap">
                        {`${activeConnectors.length} connector${activeConnectors.length === 1 ? '' : 's'}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <Plug className="w-3.5 h-3.5 text-amber-600" />
                    <span className="text-xs text-amber-700 font-medium">
                      {showConnectorLabel
                        ? `${activeConnectors.length} connector${activeConnectors.length === 1 ? '' : 's'}`
                        : activeConnectors.length}
                    </span>
                  </div>
                </>
              )}
              <button
                onClick={toggleKnowledgePanel}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  knowledgePanelOpen
                    ? 'bg-accent-muted text-accent'
                    : 'hover:bg-surface-hover text-text-secondary'
                }`}
                aria-label={knowledgePanelOpen ? 'Close knowledge panel' : 'Open knowledge panel'}
              >
                <BookOpen className="w-4 h-4" />
              </button>
            </div>
          </div>
          {activeConnectors.length > 0 && (
            <div className="px-6 pb-3 flex flex-wrap gap-2">
              {activeConnectors.map((connector) => {
                const isPinned = pinnedConnectorIds.includes(connector.id);
                return (
                  <button
                    key={connector.id}
                    type="button"
                    onClick={() => togglePinnedConnector(connector.id)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors ${
                      isPinned
                        ? 'border-amber-500/40 bg-amber-500/15 text-amber-800'
                        : 'border-border bg-surface text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    <Plug className="w-3.5 h-3.5" />
                    <span>{connector.alias || connector.name}</span>
                    <span className="text-[11px] opacity-70">{connector.toolCount} tools</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto py-6 px-4 space-y-4">
            {displayedMessages.length === 0 ? (
              <div className="text-center py-12 text-text-muted">
                <p>Start a conversation</p>
              </div>
            ) : (
              displayedMessages.map((message) => {
                const isStreamingMsg =
                  typeof message.id === 'string' && message.id.startsWith('partial-');
                return (
                  <div key={message.id}>
                    <MessageCard message={message} isStreaming={isStreamingMsg} />
                  </div>
                );
              })
            )}

            {/* Processing indicator */}
            {isStreaming && !streamingMessage && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-surface border border-border max-w-fit">
                <Loader2 className="w-4 h-4 text-accent animate-spin" />
                <span className="text-sm text-text-secondary">Processing...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-border bg-surface/80 backdrop-blur-sm">
          <div className="px-4 py-4">
            <form
              onSubmit={handleSubmit}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className="relative w-full"
            >
              {/* Image previews */}
              {pastedImages.length > 0 && (
                <div className="grid grid-cols-5 gap-2 mb-3">
                  {pastedImages.map((img, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={img.url}
                        alt={`Pasted ${index + 1}`}
                        className="w-full aspect-square object-cover rounded-lg border border-border block"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-error text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label={`Remove image ${index + 1}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* File attachments */}
              {attachedFiles.length > 0 && (
                <div className="space-y-2 mb-3">
                  {attachedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-muted border border-border group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary truncate">{file.name}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="w-6 h-6 rounded-full bg-error/10 hover:bg-error/20 text-error flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label={`Remove file ${file.name}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div
                className={`flex items-end gap-2 p-3 rounded-3xl bg-surface transition-all duration-150 chat-input-container ${
                  isDragging ? 'ring-2 ring-accent bg-accent/5' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={handleFileSelect}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                  title="Attach files"
                  aria-label="Attach files"
                >
                  <Plus className="w-5 h-5" />
                </button>

                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onCompositionStart={() => {
                    isComposingRef.current = true;
                  }}
                  onCompositionEnd={() => {
                    isComposingRef.current = false;
                  }}
                  onPaste={handlePaste}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      if (
                        e.nativeEvent.isComposing ||
                        isComposingRef.current ||
                        e.keyCode === 229
                      ) {
                        return;
                      }
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder="Type a message..."
                  disabled={isSubmitting}
                  rows={1}
                  className="flex-1 resize-none bg-transparent border-none outline-none text-text-primary placeholder:text-text-muted text-sm py-1.5"
                />

                <div className="flex items-center gap-2">
                  {/* Model display */}
                  <span className="px-2 py-1 text-xs text-text-muted">
                    {appConfig?.model || 'No model'}
                  </span>

                  {isStreaming && (
                    <button
                      type="button"
                      onClick={handleStop}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-error/10 text-error hover:bg-error/20 transition-colors"
                      aria-label="Stop generation"
                    >
                      <Square className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={
                      (!prompt.trim() &&
                        !textareaRef.current?.value.trim() &&
                        pastedImages.length === 0 &&
                        attachedFiles.length === 0) ||
                      isSubmitting
                    }
                    className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent-hover transition-colors"
                    aria-label="Send message"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <p className="text-xs text-text-muted text-center mt-2">
                Open Analyst is AI-powered and may make mistakes. Please double-check responses.
              </p>
            </form>
          </div>
        </div>
      </div>
      {knowledgePanelOpen && (
        <KnowledgePanel projectId={projectId} onClose={toggleKnowledgePanel} />
      )}
    </div>
  );
}
