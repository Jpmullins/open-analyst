import { useEffect, useId, useRef, useState } from 'react';

interface AlertDialogProps {
  open: boolean;
  title: string;
  message?: string;
  /** When provided, renders an input field and passes the value on confirm */
  inputLabel?: string;
  inputDefaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  onConfirm: (value?: string) => void;
  onCancel: () => void;
}

export function AlertDialog({
  open,
  title,
  message,
  inputLabel,
  inputDefaultValue = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: AlertDialogProps) {
  const [inputValue, setInputValue] = useState(inputDefaultValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  useEffect(() => {
    setInputValue(inputDefaultValue);
  }, [inputDefaultValue, open]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [open]);

  if (!open) return null;

  const handleConfirm = () => {
    onConfirm(inputLabel ? inputValue : undefined);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={onCancel} onKeyDown={handleKeyDown}>
      <div
        className="bg-surface rounded-xl border border-border shadow-2xl p-0 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="p-5 space-y-4">
          <h3 className="text-base font-semibold text-text-primary">{title}</h3>
          {message && <p className="text-sm text-text-secondary">{message}</p>}

          {inputLabel && (
            <div className="space-y-1">
              <label htmlFor={inputId} className="text-sm text-text-secondary">{inputLabel}</label>
              <input
                id={inputId}
                ref={inputRef}
                type="text"
                className="input w-full"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirm();
                  }
                }}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button className="btn btn-secondary" onClick={onCancel}>
              {cancelLabel}
            </button>
            <button
              className={`btn ${variant === 'danger' ? 'btn-primary bg-error hover:bg-error/90' : 'btn-primary'}`}
              onClick={handleConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
