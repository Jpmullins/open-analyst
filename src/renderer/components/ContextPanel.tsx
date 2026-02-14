import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { resolveArtifactPath } from '../utils/artifact-path';
import { extractFilePathFromToolOutput } from '../utils/tool-output-path';
import { getArtifactLabel, getArtifactIconComponent, getArtifactSteps } from '../utils/artifact-steps';
import { headlessGetRun, type HeadlessRun, type HeadlessRunEvent } from '../utils/headless-api';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  Wrench,
  Sparkles,
  Database,
  Link2,
  File,
  FolderOpen,
  Activity,
  ExternalLink,
} from 'lucide-react';
import type { TraceStep } from '../types';

interface PhaseStep {
  key: 'plan' | 'retrieve' | 'execute' | 'synthesize' | 'validate';
  label: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  detail?: string;
}

function extractUrls(value: unknown): string[] {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '');
  const matches = text.match(/https?:\/\/[^\s)"]+/g) || [];
  return Array.from(new Set(matches)).slice(0, 20);
}

function hostFromUrl(raw: string): string {
  try {
    return new URL(raw).host;
  } catch {
    return raw;
  }
}

function buildPhasePlan(run: HeadlessRun | null, traces: TraceStep[]): PhaseStep[] {
  const events = Array.isArray(run?.events) ? run!.events : [];
  const eventTypes = new Set(events.map((event) => event.type));

  const startedTools = events.filter((event) => event.type === 'tool_call_started');
  const finishedTools = events.filter((event) => event.type === 'tool_call_finished');

  const toolNames = startedTools
    .map((event) => String((event.payload || {}).toolName || '').toLowerCase())
    .filter(Boolean);

  const retrieveToolPattern = /(web_search|web_fetch|read|grep|glob|search|query|rag)/i;
  const retrieveStarted = toolNames.some((name) => retrieveToolPattern.test(name));
  const retrieveFinished = finishedTools.some((event) => {
    const name = String((event.payload || {}).toolName || '').toLowerCase();
    return retrieveToolPattern.test(name);
  });

  const executeStarted = startedTools.length > 0 || traces.some((trace) => trace.type === 'tool_call');
  const executeFinished = finishedTools.length > 0 || traces.some((trace) => trace.type === 'tool_result');
  const executeErrored = finishedTools.some((event) => !Boolean((event.payload || {}).ok));

  const runFailed = run?.status === 'failed';
  const runCompleted = run?.status === 'completed';

  const phases: PhaseStep[] = [
    {
      key: 'plan',
      label: 'Plan',
      status: eventTypes.has('chat_requested') || eventTypes.has('model_turn_started') || traces.length > 0
        ? runFailed && !eventTypes.has('model_turn_started')
          ? 'error'
          : 'completed'
        : 'pending',
      detail: eventTypes.has('chat_requested') ? 'Task accepted by orchestrator' : 'Awaiting orchestration',
    },
    {
      key: 'retrieve',
      label: 'Retrieve',
      status: retrieveFinished ? 'completed' : retrieveStarted ? 'running' : runFailed && retrieveStarted ? 'error' : 'pending',
      detail: retrieveFinished
        ? 'Sources collected and scanned'
        : retrieveStarted
          ? 'Searching and gathering evidence'
          : 'No retrieval activity yet',
    },
    {
      key: 'execute',
      label: 'Execute',
      status: executeErrored ? 'error' : executeFinished ? 'completed' : executeStarted ? 'running' : 'pending',
      detail: executeFinished
        ? `${finishedTools.length || traces.filter((trace) => trace.type === 'tool_result').length} tool steps finished`
        : executeStarted
          ? 'Tool execution in progress'
          : 'Execution not started',
    },
    {
      key: 'synthesize',
      label: 'Synthesize',
      status: eventTypes.has('assistant_response') || runCompleted
        ? 'completed'
        : runFailed
          ? 'error'
          : run
            ? 'running'
            : 'pending',
      detail: eventTypes.has('assistant_response') || runCompleted
        ? 'Response generated'
        : runFailed
          ? 'Failed before response synthesis'
          : 'Preparing response',
    },
    {
      key: 'validate',
      label: 'Validate',
      status: runCompleted && eventTypes.has('chat_completed')
        ? 'completed'
        : runFailed
          ? 'error'
          : (eventTypes.has('assistant_response') || runCompleted)
            ? 'running'
            : 'pending',
      detail: runCompleted && eventTypes.has('chat_completed')
        ? 'Final response committed'
        : runFailed
          ? 'Validation failed'
          : 'Final checks pending',
    },
  ];

  return phases;
}

export function ContextPanel() {
  const {
    activeSessionId,
    sessions,
    traceStepsBySession,
    contextPanelCollapsed,
    toggleContextPanel,
    workingDir,
    sessionProjectMap,
    sessionRunMap,
    setSessionPlanSnapshot,
  } = useAppStore();

  const [run, setRun] = useState<HeadlessRun | null>(null);

  const activeSession = activeSessionId ? sessions.find((session) => session.id === activeSessionId) || null : null;
  const steps = activeSessionId ? traceStepsBySession[activeSessionId] || [] : [];
  const currentWorkingDir = activeSession?.cwd || workingDir;
  const { artifactSteps, displayArtifactSteps } = getArtifactSteps(steps);

  const activeProjectId = activeSessionId ? sessionProjectMap[activeSessionId] : undefined;
  const activeRunId = activeSessionId ? sessionRunMap[activeSessionId] : undefined;

  useEffect(() => {
    let mounted = true;

    const loadRun = async () => {
      if (!activeProjectId || !activeRunId) {
        if (mounted) setRun(null);
        return;
      }
      const found = await headlessGetRun(activeProjectId, activeRunId);
      if (mounted) setRun(found);
    };

    void loadRun();
    const interval = setInterval(loadRun, 4000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [activeProjectId, activeRunId]);

  const phaseSteps = useMemo(() => buildPhasePlan(run, steps), [run, steps]);

  useEffect(() => {
    if (!activeSessionId) return;
    setSessionPlanSnapshot(activeSessionId, {
      sessionId: activeSessionId,
      runId: activeRunId,
      projectId: activeProjectId,
      phases: phaseSteps.map((phase) => ({
        key: phase.key,
        label: phase.label,
        status: phase.status,
      })),
      updatedAt: Date.now(),
    });
  }, [activeSessionId, activeRunId, activeProjectId, phaseSteps, setSessionPlanSnapshot]);

  const progress = useMemo(() => {
    const total = phaseSteps.length;
    if (!total) return 0;
    const completed = phaseSteps.filter((step) => step.status === 'completed').length;
    return Math.round((completed / total) * 100);
  }, [phaseSteps]);

  const runEvents: HeadlessRunEvent[] = Array.isArray(run?.events) ? run!.events : [];

  const resources = useMemo(() => {
    const tools = new Set<string>();
    const skills = new Set<string>();
    const sources = new Set<string>();
    const collections = new Set<string>();

    for (const step of steps) {
      if (step.toolName) {
        tools.add(step.toolName);
        if (step.toolName.startsWith('mcp__')) {
          skills.add(step.toolName.replace('mcp__', '').replace(/__/g, ': '));
        }
      }
      extractUrls(step.toolInput).forEach((url) => sources.add(url));
      extractUrls(step.toolOutput).forEach((url) => sources.add(url));

      const inputText = JSON.stringify(step.toolInput || {}).toLowerCase();
      if (inputText.includes('collection')) {
        collections.add('collection referenced in task execution');
      }
    }

    for (const event of runEvents) {
      if (event.type === 'tool_call_started') {
        const toolName = String((event.payload || {}).toolName || 'tool');
        tools.add(toolName);
        if (toolName.startsWith('mcp__')) {
          skills.add(toolName.replace('mcp__', '').replace(/__/g, ': '));
        }
      }
      extractUrls(event.payload).forEach((url) => sources.add(url));
    }

    return {
      tools: Array.from(tools),
      skills: Array.from(skills),
      sources: Array.from(sources),
      collections: Array.from(collections),
    };
  }, [steps, runEvents]);

  if (contextPanelCollapsed) {
    return (
      <div className="w-10 bg-surface border-l border-border flex items-start justify-center py-3">
        <button
          onClick={toggleContextPanel}
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
          title="Expand panel"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-80 bg-surface border-l border-border flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-border flex items-center justify-start">
        <button
          onClick={toggleContextPanel}
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
          title="Collapse panel"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <section className="rounded-xl border border-border bg-surface-muted p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="w-4 h-4 text-accent" />
              <span>Plan</span>
            </div>
            <span className="text-xs text-text-muted">{progress}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-background mb-3 overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="space-y-2">
            {phaseSteps.map((phase) => (
              <div key={phase.key} className="flex items-start gap-2">
                {phase.status === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 mt-0.5 text-success" />
                ) : phase.status === 'running' ? (
                  <Loader2 className="w-4 h-4 mt-0.5 text-accent animate-spin" />
                ) : phase.status === 'error' ? (
                  <AlertCircle className="w-4 h-4 mt-0.5 text-error" />
                ) : (
                  <Circle className="w-4 h-4 mt-0.5 text-text-muted" />
                )}
                <div className="min-w-0">
                  <div className="text-sm text-text-primary leading-tight">{phase.label}</div>
                  {phase.detail && <div className="text-xs text-text-muted truncate">{phase.detail}</div>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface-muted p-3 space-y-3">
          <div className="text-sm font-semibold">Resources Used</div>
          <ResourceList title="Tools" icon={<Wrench className="w-3.5 h-3.5" />} items={resources.tools} empty="No tools used yet" />
          <ResourceList title="Skills" icon={<Sparkles className="w-3.5 h-3.5" />} items={resources.skills} empty="No skills used yet" />
          <ResourceList title="Collections" icon={<Database className="w-3.5 h-3.5" />} items={resources.collections} empty="No collections referenced" />
        </section>

        <section className="rounded-xl border border-border bg-surface-muted p-3">
          <div className="flex items-center gap-2 text-sm font-semibold mb-2">
            <Link2 className="w-4 h-4 text-accent" />
            <span>Source Evidence</span>
          </div>
          <div className="space-y-1">
            {resources.sources.length === 0 ? (
              <div className="text-xs text-text-muted">No source evidence captured.</div>
            ) : (
              resources.sources.slice(0, 10).map((url) => (
                <button
                  key={url}
                  className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg bg-background border border-border hover:bg-surface-hover"
                  onClick={() => {
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                  title={url}
                >
                  <ExternalLink className="w-3.5 h-3.5 text-text-muted" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{hostFromUrl(url)}</div>
                    <div className="text-[10px] text-text-muted truncate">{url}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface-muted p-3">
          <div className="text-sm font-semibold mb-2">Artifacts</div>
          <div className="space-y-1">
            {displayArtifactSteps.length === 0 ? (
              <div className="text-xs text-text-muted">No artifacts yet.</div>
            ) : (
              displayArtifactSteps.map((step, index) => {
                const fallbackPath = extractFilePathFromToolOutput(step.toolOutput);
                const label = artifactSteps.length > 0
                  ? getArtifactLabel(step.toolOutput || '', undefined)
                  : (fallbackPath ? getArtifactLabel(fallbackPath) : 'Artifact');
                const iconComponent = getArtifactIconComponent(label);
                const Icon = iconComponent === 'document' ? File : File;
                const path = fallbackPath ? resolveArtifactPath(fallbackPath, currentWorkingDir) : '';
                return (
                  <div key={`${step.id}-${index}`} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-background border border-border">
                    <Icon className="w-3.5 h-3.5 text-text-muted" />
                    <span className="text-sm flex-1 truncate">{label}</span>
                    {path ? <span className="text-[10px] text-text-muted truncate max-w-[90px]">{path.split(/[/\\]/).pop()}</span> : null}
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface-muted p-3">
          <div className="flex items-center gap-2 text-sm font-semibold mb-2">
            <Activity className="w-4 h-4 text-accent" />
            <span>Plan Progress Events</span>
          </div>
          <div className="space-y-1 max-h-[220px] overflow-y-auto">
            {runEvents.length === 0 ? (
              <div className="text-xs text-text-muted">No run events yet for this task.</div>
            ) : (
              [...runEvents].reverse().slice(0, 24).map((event) => (
                <div key={event.id} className="px-2 py-1.5 rounded-lg bg-background border border-border">
                  <div className="text-xs font-medium text-text-primary">{event.type}</div>
                  <div className="text-[10px] text-text-muted truncate">{new Date(event.timestamp).toLocaleTimeString()}</div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface-muted p-3">
          <div className="flex items-center gap-2 text-sm font-semibold mb-2">
            <FolderOpen className="w-4 h-4 text-accent" />
            <span>Workspace</span>
          </div>
          <div className="text-xs text-text-muted break-all">{currentWorkingDir || 'No working directory selected.'}</div>
          {activeRunId && <div className="text-xs text-text-muted mt-2">run: {activeRunId}</div>}
        </section>
      </div>
    </div>
  );
}

function ResourceList({
  title,
  icon,
  items,
  empty,
}: {
  title: string;
  icon: JSX.Element;
  items: string[];
  empty: string;
}) {
  return (
    <div>
      <div className="text-xs text-text-muted mb-1 flex items-center gap-1">{icon}<span>{title}</span></div>
      {items.length === 0 ? (
        <div className="text-xs text-text-muted">{empty}</div>
      ) : (
        <div className="space-y-1">
          {items.slice(0, 6).map((item) => (
            <div key={`${title}-${item}`} className="text-xs px-2 py-1 rounded bg-background border border-border truncate" title={item}>
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
