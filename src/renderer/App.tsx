import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from './store';
import { useIPC } from './hooks/useIPC';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { WelcomeView } from './components/WelcomeView';
import { PermissionDialog } from './components/PermissionDialog';
import { ContextPanel } from './components/ContextPanel';
import { ConfigModal } from './components/ConfigModal';
import { Titlebar } from './components/Titlebar';
import { SandboxSyncToast } from './components/SandboxSyncToast';
import type { AppConfig } from './types';
import { getBrowserConfig, saveBrowserConfig } from './utils/browser-config';
import { headlessGetProjects, headlessGetWorkingDir, headlessSaveConfig } from './utils/headless-api';

function App() {
  const { 
    activeSessionId, 
    pendingPermission,
    settings,
    showConfigModal,
    isConfigured,
    appConfig,
    sandboxSyncStatus,
    setShowConfigModal,
    setIsConfigured,
    setAppConfig,
    setWorkingDir,
    setProjects,
    setActiveProjectId,
  } = useAppStore();
  const { listSessions } = useIPC();
  const initialized = useRef(false);

  useEffect(() => {
    // Only run once on mount
    if (initialized.current) return;
    initialized.current = true;

    listSessions();

    const browserConfig = getBrowserConfig();
    setIsConfigured(Boolean(browserConfig.apiKey));
    setAppConfig(browserConfig);
    headlessGetWorkingDir()
      .then((result) => {
        if (result?.workingDir) {
          setWorkingDir(result.workingDir);
        }
      })
      .catch(() => {});
    headlessGetProjects()
      .then((payload) => {
        setProjects(payload.projects);
        setActiveProjectId(payload.activeProject?.id || null);
      })
      .catch(() => {});
  }, []); // Empty deps - run once

  // Apply theme to document root
  useEffect(() => {
    if (settings.theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  }, [settings.theme]);

  // Handle config save
  const handleConfigSave = useCallback(async (newConfig: Partial<AppConfig>) => {
    const saved = saveBrowserConfig(newConfig);
    headlessSaveConfig(saved).catch(() => {});
    setIsConfigured(Boolean(saved.apiKey));
    setAppConfig(saved);
  }, [setIsConfigured, setAppConfig]);

  // Handle config modal close
  const handleConfigClose = useCallback(() => {
    setShowConfigModal(false);
  }, [setShowConfigModal]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
      {/* Titlebar - draggable region */}
      <Titlebar />
      
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar />
        
        {/* Main Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden bg-background">
          {activeSessionId ? <ChatView /> : <WelcomeView />}
        </main>

        {/* Context Panel - only show when in session */}
        {activeSessionId && <ContextPanel />}
      </div>
      
      {/* Permission Dialog */}
      {pendingPermission && <PermissionDialog permission={pendingPermission} />}
      
      {/* Config Modal */}
      <ConfigModal
        isOpen={showConfigModal}
        onClose={handleConfigClose}
        onSave={handleConfigSave}
        initialConfig={appConfig}
        isFirstRun={!isConfigured}
      />
      
      {/* Sandbox Sync Toast */}
      <SandboxSyncToast status={sandboxSyncStatus} />
      
      {/* AskUserQuestion is now rendered inline in MessageCard */}
    </div>
  );
}

export default App;
