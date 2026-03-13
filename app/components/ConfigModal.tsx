import { useState, useEffect } from 'react';
import { X, Key, Cpu, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import type { AppConfig } from '~/lib/types';
import { headlessGetModels } from '~/lib/headless-api';
import { supportsToolCalling } from '~/lib/model-capabilities';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: Partial<AppConfig>) => Promise<void>;
  initialConfig?: AppConfig | null;
  isFirstRun?: boolean;
}

export function ConfigModal({ isOpen, onClose, onSave, initialConfig, isFirstRun }: ConfigModalProps) {
  const [model, setModel] = useState(initialConfig?.model || '');
  const [customModel, setCustomModel] = useState('');
  const [useCustomModel, setUseCustomModel] = useState(false);
  const [models, setModels] = useState<Array<{ id: string; name: string; supportsTools: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    headlessGetModels()
      .then((list) => {
        setModels(list);
        // Auto-select first available model only if we have no model set
        if (list.length > 0 && !model) {
          setModel((list.find((item) => item.supportsTools) || list[0]).id);
        }
      })
      .catch((e) => setError(`Failed to load models: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setLoading(false));
  }, [isOpen]);

  useEffect(() => {
    if (initialConfig?.model) {
      setModel(initialConfig.model);
    }
  }, [initialConfig]);

  async function handleSave() {
    const finalModel = useCustomModel ? customModel.trim() : model;
    if (!finalModel) {
      setError('Select or enter a model name');
      return;
    }
    if (!supportsToolCalling(finalModel)) {
      setError('This model does not appear to support tool calling. Choose a tool-capable model such as Claude Sonnet or Opus.');
      return;
    }

    setError('');
    setIsSaving(true);

    try {
      await onSave({ model: finalModel });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-border">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center">
              <Key className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                {isFirstRun ? 'Welcome to Open Analyst' : 'Model Configuration'}
              </h2>
              <p className="text-sm text-text-secondary">
                {isFirstRun ? 'Select a model to get started' : 'Choose your preferred model'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
          >
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
          <p className="text-sm text-text-secondary">
            Models are served through the LiteLLM gateway. Open Analyst requires a model that supports tool calling.
          </p>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
              <Cpu className="w-4 h-4" />
              Model
            </label>
            {useCustomModel ? (
              <input
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="Enter custom model ID"
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
              />
            ) : (
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all appearance-none cursor-pointer"
              >
                {loading && <option>Loading models...</option>}
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.supportsTools ? m.name : `${m.name} (no tool support)`}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => setUseCustomModel(!useCustomModel)}
              className="text-xs text-accent hover:text-accent-hover"
            >
              {useCustomModel ? 'Use preset model' : 'Enter custom model ID'}
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-error/10 text-error text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-success/10 text-success text-sm">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              Saved successfully!
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-surface-hover border-t border-border">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-3 px-4 rounded-xl bg-accent text-white font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                {isFirstRun ? 'Get Started' : 'Save Configuration'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
