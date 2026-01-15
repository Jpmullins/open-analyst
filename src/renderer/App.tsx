import { useEffect, useRef } from 'react';
import { useAppStore } from './store';
import { useIPC } from './hooks/useIPC';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { WelcomeView } from './components/WelcomeView';
import { PermissionDialog } from './components/PermissionDialog';
import { ContextPanel } from './components/ContextPanel';

function App() {
  const { activeSessionId, pendingPermission, settings } = useAppStore();
  const { listSessions, isElectron } = useIPC();
  const initialized = useRef(false);

  useEffect(() => {
    // Only run once on mount
    if (initialized.current) return;
    initialized.current = true;

    if (isElectron) {
      listSessions();
    }
  }, []); // Empty deps - run once

  // Apply theme to document root
  useEffect(() => {
    if (settings.theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  }, [settings.theme]);

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-background">
        {activeSessionId ? <ChatView /> : <WelcomeView />}
      </main>

      {/* Context Panel - only show when in session */}
      {activeSessionId && <ContextPanel />}
      
      {/* Permission Dialog */}
      {pendingPermission && <PermissionDialog permission={pendingPermission} />}
      
      {/* AskUserQuestion is now rendered inline in MessageCard */}
    </div>
  );
}

export default App;
