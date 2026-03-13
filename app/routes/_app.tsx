import { useEffect, useRef, useCallback, useState } from 'react';
import { Outlet, useLoaderData, useLocation, useRevalidator } from 'react-router';
import { useAppStore } from '~/lib/store';
import { applyTheme, setTheme, getTheme } from '~/lib/theme';
import { Sidebar } from '~/components/Sidebar';
import { PermissionDialog } from '~/components/PermissionDialog';
import { ConfigModal } from '~/components/ConfigModal';
import { TopNav } from '~/components/TopNav';
import { SandboxSyncToast } from '~/components/SandboxSyncToast';
import { FileViewerPanel } from '~/components/FileViewerPanel';
import type { AppConfig } from '~/lib/types';
import { getBrowserConfig, saveBrowserConfig } from '~/lib/browser-config';
import { headlessSaveConfig } from '~/lib/headless-api';

export { loader } from './_app.loader.server';

export default function AppLayout() {
  const {
    pendingPermission,
    settings,
    showConfigModal,
    isConfigured,
    appConfig,
    sandboxSyncStatus,
    updateSettings,
    setShowConfigModal,
    setIsConfigured,
    setAppConfig,
    setWorkingDir,
    setProjects,
    setActiveProjectId,
  } = useAppStore();
  const initialized = useRef(false);
  const loaderData = useLoaderData<typeof import('./_app.loader.server').loader>();
  const { revalidate } = useRevalidator();
  const location = useLocation();

  // Bridge: sync loader data into Zustand
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (loaderData) {
      setProjects(loaderData.projects);
      setActiveProjectId(loaderData.activeProjectId);
      setWorkingDir(loaderData.workingDir);
      setIsConfigured(loaderData.isConfigured);
      // Keep appConfig.model in sync with the server-resolved model
      if (loaderData.model) {
        const current = useAppStore.getState().appConfig;
        if (current && current.model !== loaderData.model) {
          setAppConfig({ ...current, model: loaderData.model });
        }
      }
      setHydrated(true);
    }
  }, [loaderData, setProjects, setActiveProjectId, setWorkingDir, setIsConfigured, setAppConfig]);

  // Revalidate loader data on navigation (handles popstate/back-nav)
  useEffect(() => {
    revalidate();
  }, [location.pathname]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Sync persisted theme into Zustand (blocking script already applied it to DOM)
    const persisted = getTheme();
    if (persisted !== settings.theme) {
      updateSettings({ theme: persisted });
    }

    const browserConfig = getBrowserConfig();
    // Loader resolves model against LiteLLM — always use it over browser config
    setAppConfig({
      ...browserConfig,
      model: loaderData?.model || browserConfig.model,
    });
  }, []);

  useEffect(() => {
    const resolved = settings.theme === 'system' ? 'light' : settings.theme;
    applyTheme(resolved);
    setTheme(resolved);
  }, [settings.theme]);

  const handleConfigSave = useCallback(
    async (newConfig: Partial<AppConfig>) => {
      const saved = saveBrowserConfig(newConfig);
      await headlessSaveConfig(newConfig);
      setAppConfig(saved);
      revalidate();
    },
    [setAppConfig, revalidate],
  );

  const handleConfigClose = useCallback(() => {
    setShowConfigModal(false);
  }, [setShowConfigModal]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background" data-hydrated={hydrated || undefined}>
      <TopNav />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          tasks={loaderData?.sidebarTasks ?? []}
          collections={loaderData?.sidebarCollections ?? []}
          documentCounts={loaderData?.sidebarDocumentCounts ?? {}}
        />

        <main className="flex-1 flex flex-col overflow-hidden bg-background">
          <Outlet />
        </main>

        <FileViewerPanel />
      </div>

      {pendingPermission && <PermissionDialog permission={pendingPermission} />}

      <ConfigModal
        isOpen={showConfigModal}
        onClose={handleConfigClose}
        onSave={handleConfigSave}
        initialConfig={appConfig}
        isFirstRun={!isConfigured}
      />

      <SandboxSyncToast status={sandboxSyncStatus} />
    </div>
  );
}
