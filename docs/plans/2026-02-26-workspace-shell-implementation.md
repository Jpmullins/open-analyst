# Workspace Shell Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the Open Analyst frontend from a knowledge-management-centric layout to a task-first workspace with top nav for project sections, a task-scoped sidebar, and a dedicated knowledge route.

**Architecture:** Replace the current Titlebar + Sidebar (projects+tasks) + WelcomeView layout with TopNav (project switcher + section tabs) + Sidebar (task rail only) + route-based pages (QuickStartDashboard, ChatView+KnowledgePanel, KnowledgeWorkspace). Projects move from sidebar to top nav dropdown. Knowledge management gets its own `/knowledge` route plus a lightweight side panel in ChatView.

**Tech Stack:** React Router v7, Zustand, Tailwind CSS, Lucide icons, Postgres (Drizzle ORM), Vitest

---

## Task 1: Add Knowledge Route and Update Route Config

**Files:**
- Modify: `app/routes.ts:3-10`
- Create: `app/routes/_app.projects.$projectId.knowledge.tsx`
- Create: `app/routes/_app.projects.$projectId.knowledge.loader.server.ts`
- Test: `tests/rr7/routes/_app.projects.knowledge.test.ts`

**Step 1: Write the failing test**

Create `tests/rr7/routes/_app.projects.knowledge.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { createProject } from "~/lib/db/queries/projects.server";
import { createCollection } from "~/lib/db/queries/documents.server";
import { createMockLoaderArgs } from "./helpers";

let testProject: { id: string };
let testCollection: { id: string; name: string };

beforeAll(async () => {
  testProject = await createProject({ name: "Knowledge Route Test" });
  testCollection = await createCollection(testProject.id, { name: "Test Collection" });
});

describe("Knowledge route loader", () => {
  it("returns collections for valid project", async () => {
    const { loader } = await import(
      "~/routes/_app.projects.$projectId.knowledge.loader.server"
    );
    const args = createMockLoaderArgs(
      `/projects/${testProject.id}/knowledge`,
      { projectId: testProject.id }
    );
    const result = await loader(args);
    expect(result).toHaveProperty("projectId", testProject.id);
    expect(result).toHaveProperty("collections");
    expect(Array.isArray(result.collections)).toBe(true);
    expect(result.collections.length).toBeGreaterThanOrEqual(1);
  });

  it("redirects for invalid projectId", async () => {
    const { loader } = await import(
      "~/routes/_app.projects.$projectId.knowledge.loader.server"
    );
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const args = createMockLoaderArgs(`/projects/${fakeId}/knowledge`, {
      projectId: fakeId,
    });
    try {
      await loader(args);
      expect.fail("Expected redirect");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      const response = e as Response;
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/");
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/rr7/routes/_app.projects.knowledge.test.ts`
Expected: FAIL — module not found

**Step 3: Write the knowledge loader**

Create `app/routes/_app.projects.$projectId.knowledge.loader.server.ts`:

```typescript
import { redirect } from "react-router";
import { getProject } from "~/lib/db/queries/projects.server";
import { listCollections } from "~/lib/db/queries/documents.server";

export async function loader({ params }: { params: { projectId: string } }) {
  const project = await getProject(params.projectId);
  if (!project) {
    throw redirect("/");
  }
  const collections = await listCollections(params.projectId);
  return { projectId: params.projectId, project, collections };
}
```

**Step 4: Create the knowledge route component (placeholder)**

Create `app/routes/_app.projects.$projectId.knowledge.tsx`:

```tsx
import { useLoaderData } from "react-router";

export { loader } from "./_app.projects.$projectId.knowledge.loader.server";

export default function KnowledgeRoute() {
  const { projectId, collections } = useLoaderData<{
    projectId: string;
    collections: Array<{ id: string; name: string }>;
  }>();

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="text-lg font-semibold mb-4">Knowledge</h1>
      <p className="text-text-secondary text-sm">
        {collections.length} collection{collections.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
```

**Step 5: Register the route**

Modify `app/routes.ts`. Change lines 4-10 from:

```typescript
layout("routes/_app.tsx", [
  index("routes/_app._index.tsx"),
  route("projects/:projectId", "routes/_app.projects.$projectId.tsx"),
  route("projects/:projectId/tasks/:taskId", "routes/_app.projects.$projectId.tasks.$taskId.tsx"),
  route("projects/:projectId/sessions/:sessionId", "routes/_app.projects.$projectId.sessions.$sessionId.tsx"),
  route("settings", "routes/_app.settings.tsx"),
]),
```

To:

```typescript
layout("routes/_app.tsx", [
  index("routes/_app._index.tsx"),
  route("projects/:projectId", "routes/_app.projects.$projectId.tsx"),
  route("projects/:projectId/tasks/:taskId", "routes/_app.projects.$projectId.tasks.$taskId.tsx"),
  route("projects/:projectId/knowledge", "routes/_app.projects.$projectId.knowledge.tsx"),
  route("settings", "routes/_app.settings.tsx"),
]),
```

(Remove the sessions route — it only redirects and is dead code.)

**Step 6: Run test to verify it passes**

Run: `npx vitest run tests/rr7/routes/_app.projects.knowledge.test.ts`
Expected: PASS

**Step 7: Run all tests**

Run: `npx vitest run tests/rr7/`
Expected: All pass

**Step 8: Commit**

```bash
git add app/routes.ts \
  app/routes/_app.projects.\$projectId.knowledge.tsx \
  app/routes/_app.projects.\$projectId.knowledge.loader.server.ts \
  tests/rr7/routes/_app.projects.knowledge.test.ts
git commit -m "feat: add /projects/:id/knowledge route with loader"
```

---

## Task 2: Build TopNav Component (Replace Titlebar)

**Files:**
- Create: `app/components/TopNav.tsx`
- Modify: `app/routes/_app.tsx:1-104`
- Modify: `app/components/Sidebar.tsx:1-273`

**Step 1: Create TopNav component**

Create `app/components/TopNav.tsx`:

```tsx
import { useState, useRef, useEffect } from "react";
import { useFetcher, useLocation, useNavigate, useParams } from "react-router";
import { useAppStore } from "~/lib/store";
import {
  ChevronDown,
  FolderKanban,
  Moon,
  Plus,
  Settings,
  Sun,
  Menu,
  X,
} from "lucide-react";
import { AlertDialog } from "./AlertDialog";

export function TopNav() {
  const {
    settings,
    updateSettings,
    projects,
    sidebarCollapsed,
    toggleSidebar,
    upsertProject,
    removeProject,
    isConfigured,
  } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const fetcher = useFetcher();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [renameDialog, setRenameDialog] = useState<{
    projectId: string;
    currentName: string;
  } | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{
    projectId: string;
    projectName: string;
  } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeProjectId = params.projectId || null;
  const activeProject = projects.find((p) => p.id === activeProjectId);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  // Navigate to new project after creation
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      const data = fetcher.data as any;
      if (data?.project?.id) {
        navigate(`/projects/${data.project.id}`);
        setDropdownOpen(false);
        setNewProjectName("");
      }
    }
  }, [fetcher.state, fetcher.data, navigate]);

  const toggleTheme = () => {
    updateSettings({ theme: settings.theme === "dark" ? "light" : "dark" });
  };

  const handleCreateProject = () => {
    const name = newProjectName.trim();
    if (!name) return;
    fetcher.submit(
      { name },
      { method: "POST", action: "/api/projects", encType: "application/json" }
    );
  };

  const confirmRename = (nextName?: string) => {
    if (
      !renameDialog ||
      !nextName?.trim() ||
      nextName.trim() === renameDialog.currentName
    ) {
      setRenameDialog(null);
      return;
    }
    upsertProject({ id: renameDialog.projectId, name: nextName.trim() });
    fetcher.submit(
      { name: nextName.trim() },
      {
        method: "PATCH",
        action: `/api/projects/${renameDialog.projectId}`,
        encType: "application/json",
      }
    );
    setRenameDialog(null);
  };

  const confirmDelete = () => {
    if (!deleteDialog) return;
    removeProject(deleteDialog.projectId);
    fetcher.submit(
      {},
      {
        method: "DELETE",
        action: `/api/projects/${deleteDialog.projectId}`,
        encType: "application/json",
      }
    );
    if (deleteDialog.projectId === activeProjectId) {
      navigate("/");
    }
    setDeleteDialog(null);
  };

  // Determine which section tab is active
  const isKnowledge = location.pathname.endsWith("/knowledge");
  const isDashboard = activeProjectId && !isKnowledge;

  return (
    <>
      <nav className="h-12 bg-background-secondary border-b border-border shrink-0 flex items-center px-3 gap-2">
        {/* Sidebar toggle */}
        <button
          onClick={toggleSidebar}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-hover text-text-secondary"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2 mr-2">
          <div className="w-6 h-6 rounded-md bg-accent-muted flex items-center justify-center">
            <FolderKanban className="w-3.5 h-3.5 text-accent" />
          </div>
          <span className="text-sm font-semibold text-text-primary hidden sm:inline">
            Open Analyst
          </span>
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-border" />

        {/* Project switcher */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-surface-hover text-sm transition-colors"
            aria-label="Switch project"
          >
            <span className="truncate max-w-[180px] font-medium">
              {activeProject?.name || "Select project"}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
          </button>

          {dropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-surface border border-border rounded-xl shadow-elevated z-50 overflow-hidden">
              <div className="max-h-64 overflow-y-auto p-1">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      project.id === activeProjectId
                        ? "bg-accent-muted text-accent"
                        : "hover:bg-surface-hover"
                    }`}
                  >
                    <button
                      className="flex-1 text-left min-w-0"
                      onClick={() => {
                        navigate(`/projects/${project.id}`);
                        setDropdownOpen(false);
                      }}
                    >
                      <div className="text-sm font-medium truncate">
                        {project.name}
                      </div>
                    </button>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="w-6 h-6 rounded hover:bg-surface-active text-text-muted text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameDialog({
                            projectId: project.id,
                            currentName: project.name,
                          });
                        }}
                        aria-label="Rename project"
                      >
                        ✎
                      </button>
                      <button
                        className="w-6 h-6 rounded hover:bg-surface-active text-error text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteDialog({
                            projectId: project.id,
                            projectName: project.name,
                          });
                        }}
                        aria-label="Delete project"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-border p-2">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    className="input text-sm py-1.5 px-2.5"
                    placeholder="New project\u2026"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCreateProject();
                      }
                    }}
                  />
                  <button
                    className="btn btn-secondary px-2 py-1.5"
                    onClick={handleCreateProject}
                    aria-label="Create project"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section tabs */}
        {activeProjectId && (
          <>
            <div className="w-px h-5 bg-border" />
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => navigate(`/projects/${activeProjectId}`)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  isDashboard
                    ? "text-accent font-medium bg-accent-muted"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() =>
                  navigate(`/projects/${activeProjectId}/knowledge`)
                }
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  isKnowledge
                    ? "text-accent font-medium bg-accent-muted"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                }`}
              >
                Knowledge
              </button>
            </div>
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right actions */}
        <div className="flex items-center gap-1">
          <span
            className={`w-2 h-2 rounded-full ${
              isConfigured ? "bg-success" : "bg-amber-500"
            }`}
            title={isConfigured ? "API configured" : "API not configured"}
          />
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-hover text-text-secondary"
            aria-label={
              settings.theme === "dark"
                ? "Switch to light mode"
                : "Switch to dark mode"
            }
          >
            {settings.theme === "dark" ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={() => navigate("/settings")}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-hover text-text-secondary"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* Dialogs */}
      <AlertDialog
        open={!!renameDialog}
        title="Rename project"
        inputLabel="Project name"
        inputDefaultValue={renameDialog?.currentName || ""}
        confirmLabel="Rename"
        onConfirm={confirmRename}
        onCancel={() => setRenameDialog(null)}
      />
      <AlertDialog
        open={!!deleteDialog}
        title="Delete project"
        message={`Are you sure you want to delete "${deleteDialog?.projectName}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteDialog(null)}
      />
    </>
  );
}
```

**Step 2: Replace Titlebar with TopNav in the app layout**

Modify `app/routes/_app.tsx`. Replace lines 7 and 82:

- Line 7: Change `import { Titlebar } from '~/components/Titlebar';` to `import { TopNav } from '~/components/TopNav';`
- Line 82: Change `<Titlebar />` to `<TopNav />`

**Step 3: Strip project management from Sidebar — make it a task-only rail**

Rewrite `app/components/Sidebar.tsx`. Remove: project list, create project input, rename/delete project dialogs, theme toggle. Keep: task list, "+ New Task" button, settings/user footer, sidebar collapse. The full replacement:

```tsx
import { useEffect } from "react";
import { useFetcher, useMatches, useNavigate, useParams } from "react-router";
import { useAppStore } from "~/lib/store";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, isConfigured } = useAppStore();
  const navigate = useNavigate();
  const params = useParams();
  const matches = useMatches();
  const taskFetcher = useFetcher();

  const activeProjectId = params.projectId || null;

  // Extract tasks from project route loader data
  const projectMatch = matches.find(
    (m) => m.id && m.pathname.includes("/projects/")
  );
  const tasks: Array<{
    id: string;
    title: string;
    status: string;
    updatedAt: string | Date;
  }> = (projectMatch?.data as any)?.tasks || [];

  // Determine active taskId from URL
  const activeTaskId = params.taskId || null;

  const handleDeleteTask = (taskId: string) => {
    if (!activeProjectId) return;
    taskFetcher.submit(
      {},
      {
        method: "DELETE",
        action: `/api/projects/${activeProjectId}/tasks/${taskId}`,
      }
    );
    if (activeTaskId === taskId) {
      navigate(`/projects/${activeProjectId}`);
    }
  };

  const handleNewTask = () => {
    if (activeProjectId) {
      navigate(`/projects/${activeProjectId}`);
    }
  };

  return (
    <div
      className={`bg-surface border-r border-border flex flex-col overflow-hidden transition-all duration-200 ${
        sidebarCollapsed ? "w-12" : "w-64"
      }`}
    >
      {/* Task list */}
      <div
        className={`flex-1 overflow-y-auto ${
          sidebarCollapsed ? "px-1 py-2" : "p-3"
        }`}
      >
        {!sidebarCollapsed && activeProjectId && (
          <div className="space-y-1">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase tracking-wide text-text-muted px-1">
                Tasks
              </div>
              <button
                onClick={handleNewTask}
                className="btn btn-primary text-xs px-2.5 py-1"
                aria-label="New task"
              >
                <Plus className="w-3 h-3" />
                New
              </button>
            </div>
            {tasks.length === 0 ? (
              <div className="text-sm text-text-muted px-1 py-2">
                No tasks yet.
              </div>
            ) : (
              tasks.map((task) => (
                <div
                  key={task.id}
                  className={`group flex items-center gap-2 px-2 py-2 rounded-lg border transition-colors cursor-pointer ${
                    activeTaskId === task.id
                      ? "border-accent/40 bg-accent-muted"
                      : "border-transparent hover:border-accent/30 hover:bg-surface-hover"
                  }`}
                >
                  <button
                    className="flex-1 text-left min-w-0"
                    onClick={() =>
                      navigate(
                        `/projects/${activeProjectId}/tasks/${task.id}`
                      )
                    }
                  >
                    <div className="text-sm truncate">{task.title}</div>
                    <div className="text-xs text-text-muted">{task.status}</div>
                  </button>
                  <button
                    className="w-6 h-6 rounded hover:bg-surface-active text-error opacity-0 group-hover:opacity-100"
                    onClick={() => handleDeleteTask(task.id)}
                    aria-label="Delete task"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {!sidebarCollapsed && !activeProjectId && (
          <div className="text-sm text-text-muted px-1 py-4 text-center">
            Select a project to see tasks.
          </div>
        )}

        {sidebarCollapsed && activeProjectId && (
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={handleNewTask}
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent text-white hover:bg-accent-hover"
              aria-label="New task"
            >
              <Plus className="w-4 h-4" />
            </button>
            {tasks.slice(0, 8).map((task) => (
              <button
                key={task.id}
                onClick={() =>
                  navigate(
                    `/projects/${activeProjectId}/tasks/${task.id}`
                  )
                }
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium ${
                  activeTaskId === task.id
                    ? "bg-accent-muted text-accent"
                    : "hover:bg-surface-hover text-text-muted"
                }`}
                title={task.title}
                aria-label={task.title}
              >
                {task.title.charAt(0).toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-border">
        <button
          onClick={() => navigate("/settings")}
          className={`w-full flex items-center ${
            sidebarCollapsed ? "justify-center" : "gap-3"
          } px-2 py-2 rounded-lg hover:bg-surface-hover transition-colors group`}
        >
          {sidebarCollapsed ? (
            <Settings className="w-4 h-4 text-text-muted" />
          ) : (
            <>
              <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-white text-xs font-medium">
                U
              </div>
              <div className="flex-1 min-w-0 text-left">
                <span className="text-sm font-medium text-text-primary">
                  User
                </span>
                <p className="text-xs text-text-muted">
                  {isConfigured ? "Configured" : "Setup needed"}
                </p>
              </div>
              <Settings className="w-4 h-4 text-text-muted group-hover:text-text-primary transition-colors" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
```

**Step 4: Run all tests**

Run: `npx vitest run tests/rr7/`
Expected: All pass

**Step 5: Commit**

```bash
git add app/components/TopNav.tsx app/components/Sidebar.tsx app/routes/_app.tsx
git commit -m "feat: replace Titlebar with TopNav, convert Sidebar to task-only rail"
```

---

## Task 3: Build QuickStartDashboard (Replace WelcomeView)

**Files:**
- Create: `app/components/QuickStartDashboard.tsx`
- Modify: `app/routes/_app.projects.$projectId.tsx:1-17`
- Modify: `app/routes/_app._index.tsx:1-7`
- Modify: `app/components/index.ts`

**Step 1: Create QuickStartDashboard component**

Create `app/components/QuickStartDashboard.tsx`:

```tsx
import { useMemo, useState } from "react";
import {
  useFetcher,
  useLoaderData,
  useMatches,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { useAppStore } from "~/lib/store";
import { useChatStream } from "~/hooks/useChatStream";
import { ArrowRight, FolderOpen, FlaskConical, BookOpen } from "lucide-react";
import { AlertDialog } from "./AlertDialog";

export function QuickStartDashboard() {
  const navigate = useNavigate();
  const params = useParams();
  const matches = useMatches();
  const [searchParams, setSearchParams] = useSearchParams();
  const { workingDir, setWorkingDir, activeCollectionByProject, setProjectActiveCollection } =
    useAppStore();
  const { sendMessage } = useChatStream();
  const fetcher = useFetcher();

  const projectId = params.projectId!;

  // Get tasks from loader data
  const projectMatch = matches.find(
    (m) => m.id && m.pathname.includes("/projects/")
  );
  const tasks: Array<{
    id: string;
    title: string;
    status: string;
    updatedAt: string | Date;
  }> = (projectMatch?.data as any)?.tasks || [];

  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showWorkdirDialog, setShowWorkdirDialog] = useState(false);

  const deepResearch = searchParams.get("deepResearch") === "true";

  const handleStartTask = async () => {
    const text = prompt.trim();
    if (!text || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = await sendMessage(text, {
        projectId,
        deepResearch,
      });
      if (result?.taskId) {
        navigate(`/projects/${projectId}/tasks/${result.taskId}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleDeepResearch = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (deepResearch) next.delete("deepResearch");
        else next.set("deepResearch", "true");
        return next;
      },
      { replace: true }
    );
  };

  const confirmWorkdir = (path?: string) => {
    if (!path?.trim()) {
      setShowWorkdirDialog(false);
      return;
    }
    setWorkingDir(path.trim());
    fetcher.submit(
      { path: path.trim() },
      { method: "POST", action: "/api/workdir", encType: "application/json" }
    );
    setShowWorkdirDialog(false);
  };

  const formatRelativeTime = (ts: string | Date) => {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Task input */}
        <div className="mb-10">
          <h2 className="text-xl font-semibold mb-4 text-center">
            What do you want to work on?
          </h2>
          <div className="relative">
            <textarea
              className="input text-base py-4 pr-14 min-h-[120px] resize-none rounded-2xl"
              placeholder="Describe your task\u2026"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleStartTask();
                }
              }}
              disabled={isSubmitting}
            />
            <button
              onClick={handleStartTask}
              disabled={!prompt.trim() || isSubmitting}
              className="absolute bottom-3 right-3 w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center hover:bg-accent-hover disabled:opacity-40 transition-colors"
              aria-label="Start task"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={toggleDeepResearch}
              className={`tag text-xs ${deepResearch ? "tag-active" : ""}`}
            >
              <FlaskConical className="w-3.5 h-3.5" />
              Deep Research
            </button>
          </div>
        </div>

        {/* Recent tasks */}
        {tasks.length > 0 && (
          <div className="mb-10">
            <h3 className="text-sm font-medium text-text-muted uppercase tracking-wide mb-3">
              Recent Tasks
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {tasks.slice(0, 6).map((task) => (
                <button
                  key={task.id}
                  onClick={() =>
                    navigate(`/projects/${projectId}/tasks/${task.id}`)
                  }
                  className="card card-hover p-4 text-left"
                >
                  <div className="text-sm font-medium truncate mb-1">
                    {task.title}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`badge ${
                        task.status === "running"
                          ? "badge-running"
                          : task.status === "completed"
                          ? "badge-completed"
                          : task.status === "error"
                          ? "badge-error"
                          : "badge-idle"
                      }`}
                    >
                      {task.status}
                    </span>
                    <span className="text-xs text-text-muted">
                      {formatRelativeTime(task.updatedAt)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Project info bar */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-text-secondary">
          <button
            onClick={() => setShowWorkdirDialog(true)}
            className="flex items-center gap-1.5 hover:text-text-primary transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            {workingDir || "Set working directory"}
          </button>
          <button
            onClick={() =>
              navigate(`/projects/${projectId}/knowledge`)
            }
            className="flex items-center gap-1.5 hover:text-text-primary transition-colors"
          >
            <BookOpen className="w-4 h-4" />
            Manage knowledge
          </button>
        </div>
      </div>

      <AlertDialog
        open={showWorkdirDialog}
        title="Set working directory"
        inputLabel="Directory path"
        inputDefaultValue={workingDir || ""}
        confirmLabel="Set"
        onConfirm={confirmWorkdir}
        onCancel={() => setShowWorkdirDialog(false)}
      />
    </div>
  );
}
```

**Step 2: Wire up the project route to use QuickStartDashboard**

Modify `app/routes/_app.projects.$projectId.tsx`:

```tsx
import { useEffect } from "react";
import { useLoaderData } from "react-router";
import { useAppStore } from "~/lib/store";
import { QuickStartDashboard } from "~/components/QuickStartDashboard";

export { loader } from "./_app.projects.$projectId.loader.server";

export default function ProjectRoute() {
  const { projectId } = useLoaderData<{ projectId: string }>();
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);

  useEffect(() => {
    setActiveProjectId(projectId);
  }, [projectId, setActiveProjectId]);

  return <QuickStartDashboard />;
}
```

**Step 3: Update the index route for when no projects exist**

Modify `app/routes/_app._index.tsx`:

```tsx
export { loader } from "./_app._index.loader.server";

export default function AppIndex() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-sm">
        <h1 className="text-xl font-semibold mb-2">Welcome to Open Analyst</h1>
        <p className="text-text-secondary text-sm mb-4">
          Create your first project using the project switcher above to get started.
        </p>
      </div>
    </div>
  );
}
```

**Step 4: Update component index**

Modify `app/components/index.ts` — replace `WelcomeView` export with `QuickStartDashboard`:

```typescript
export { Sidebar } from './Sidebar';
export { QuickStartDashboard } from './QuickStartDashboard';
export { ChatView } from './ChatView';
export { MessageCard } from './MessageCard';
export { PermissionDialog } from './PermissionDialog';
// Note: UserQuestionDialog removed — AskUserQuestion now rendered inline in MessageCard
```

**Step 5: Run all tests**

Run: `npx vitest run tests/rr7/`
Expected: All pass

**Step 6: Commit**

```bash
git add app/components/QuickStartDashboard.tsx \
  app/routes/_app.projects.\$projectId.tsx \
  app/routes/_app._index.tsx \
  app/components/index.ts
git commit -m "feat: add QuickStartDashboard, replace WelcomeView on project route"
```

---

## Task 4: Build KnowledgeWorkspace (Refactor from ProjectWorkspace)

**Files:**
- Create: `app/components/KnowledgeWorkspace.tsx`
- Modify: `app/routes/_app.projects.$projectId.knowledge.tsx`

**Step 1: Create KnowledgeWorkspace component**

Create `app/components/KnowledgeWorkspace.tsx`. This is a refactored version of ProjectWorkspace — single-page knowledge management without the project column or run logs:

```tsx
import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import {
  headlessCreateCollection,
  headlessCreateDocument,
  headlessGetCollections,
  headlessGetDocuments,
  headlessImportUrl,
  headlessImportFile,
  headlessRagQuery,
} from "~/lib/headless-api";
import type {
  HeadlessCollection,
  HeadlessDocument,
  HeadlessRagResult,
} from "~/lib/headless-api";
import {
  Database,
  Plus,
  Search,
  FileText,
  Link2,
  Upload,
  RefreshCw,
  Trash2,
} from "lucide-react";

export function KnowledgeWorkspace() {
  const params = useParams();
  const projectId = params.projectId!;
  const [searchParams, setSearchParams] = useSearchParams();

  // Collections
  const [collections, setCollections] = useState<HeadlessCollection[]>([]);
  const [collectionName, setCollectionName] = useState("");

  // Active collection from URL
  const activeCollectionId = searchParams.get("collection") || null;
  const setActiveCollectionId = (id: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("collection", id);
        else next.delete("collection");
        return next;
      },
      { replace: true }
    );
  };

  // Documents
  const [documents, setDocuments] = useState<HeadlessDocument[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);

  // Source form
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceContent, setSourceContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  // RAG
  const [ragQuery, setRagQuery] = useState("");
  const [ragResults, setRagResults] = useState<HeadlessRagResult[]>([]);

  // Loading
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshData = useCallback(async () => {
    try {
      const cols = await headlessGetCollections(projectId);
      setCollections(cols);
      const colId = activeCollectionId || cols[0]?.id || null;
      if (colId) {
        const docs = await headlessGetDocuments(projectId, colId);
        setDocuments(docs);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId, activeCollectionId]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const handleCreateCollection = async () => {
    const name = collectionName.trim();
    if (!name) return;
    try {
      const col = await headlessCreateCollection(projectId, name);
      setCollectionName("");
      setActiveCollectionId(col.id);
      await refreshData();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleCreateManualSource = async () => {
    const title = sourceTitle.trim();
    const content = sourceContent.trim();
    if (!title || !content || !activeCollectionId) return;
    try {
      await headlessCreateDocument(projectId, {
        collectionId: activeCollectionId,
        title,
        content,
        sourceType: "manual",
      });
      setSourceTitle("");
      setSourceContent("");
      await refreshData();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleImportUrl = async () => {
    const url = sourceUrl.trim();
    if (!url || !activeCollectionId) return;
    setUploading(true);
    try {
      await headlessImportUrl(projectId, url, activeCollectionId);
      setSourceUrl("");
      await refreshData();
    } catch (err) {
      setError(String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleImportFiles = async () => {
    if (!activeCollectionId) return;
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = async () => {
      if (!input.files?.length) return;
      setUploading(true);
      try {
        for (const file of Array.from(input.files)) {
          await headlessImportFile(projectId, file, activeCollectionId);
        }
        await refreshData();
      } catch (err) {
        setError(String(err));
      } finally {
        setUploading(false);
      }
    };
    input.click();
  };

  const handleRagSearch = async () => {
    const q = ragQuery.trim();
    if (!q) return;
    try {
      const results = await headlessRagQuery(projectId, q, activeCollectionId || undefined);
      setRagResults(results);
    } catch (err) {
      setError(String(err));
    }
  };

  const selectedDocument = documents.find((d) => d.id === selectedDocumentId);

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-32 w-full" />
        <div className="skeleton h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-8">
        {error && (
          <div className="text-sm text-error bg-error/10 rounded-lg px-4 py-2">
            {error}
            <button className="ml-2 underline" onClick={() => setError(null)}>
              dismiss
            </button>
          </div>
        )}

        {/* Collections */}
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-accent" />
            Collections
          </h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {collections.map((col) => (
              <button
                key={col.id}
                onClick={() => setActiveCollectionId(col.id)}
                className={`tag ${
                  activeCollectionId === col.id ? "tag-active" : ""
                }`}
              >
                {col.name}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              className="input text-sm py-2 max-w-xs"
              placeholder="New collection name\u2026"
              value={collectionName}
              onChange={(e) => setCollectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateCollection();
                }
              }}
            />
            <button
              className="btn btn-secondary px-3"
              onClick={handleCreateCollection}
              aria-label="Create collection"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </section>

        {/* Sources */}
        {activeCollectionId && (
          <section>
            <h2 className="text-lg font-semibold mb-4">Sources</h2>

            {/* Add source actions */}
            <div className="card p-4 mb-4 space-y-3">
              <div className="flex gap-2">
                <input
                  type="url"
                  className="input text-sm py-2"
                  placeholder="Import from URL\u2026"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleImportUrl();
                    }
                  }}
                />
                <button
                  className="btn btn-secondary px-3"
                  onClick={handleImportUrl}
                  disabled={uploading}
                  aria-label="Import URL"
                >
                  <Link2 className="w-4 h-4" />
                </button>
                <button
                  className="btn btn-secondary px-3"
                  onClick={handleImportFiles}
                  disabled={uploading}
                  aria-label="Upload files"
                >
                  <Upload className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2">
                <input
                  type="text"
                  className="input text-sm py-2"
                  placeholder="Manual source title"
                  value={sourceTitle}
                  onChange={(e) => setSourceTitle(e.target.value)}
                />
                <textarea
                  className="input text-sm py-2 min-h-[80px] resize-y"
                  placeholder="Paste content\u2026"
                  value={sourceContent}
                  onChange={(e) => setSourceContent(e.target.value)}
                />
                <button
                  className="btn btn-secondary text-sm"
                  onClick={handleCreateManualSource}
                >
                  <FileText className="w-4 h-4" />
                  Add manual source
                </button>
              </div>
            </div>

            {/* Document list */}
            <div className="space-y-1">
              {documents.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() =>
                    setSelectedDocumentId(
                      selectedDocumentId === doc.id ? null : doc.id
                    )
                  }
                  className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition-colors ${
                    selectedDocumentId === doc.id
                      ? "bg-accent-muted"
                      : "hover:bg-surface-hover"
                  }`}
                >
                  <FileText className="w-4 h-4 text-text-muted shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{doc.title || "Untitled"}</div>
                    <div className="text-xs text-text-muted">
                      {doc.sourceType || "manual"}
                    </div>
                  </div>
                </button>
              ))}
              {documents.length === 0 && (
                <p className="text-sm text-text-muted py-2">
                  No sources in this collection yet.
                </p>
              )}
            </div>

            {/* Document preview */}
            {selectedDocument && (
              <div className="card p-4 mt-4">
                <h3 className="text-sm font-semibold mb-2">
                  {selectedDocument.title}
                </h3>
                <pre className="text-xs text-text-secondary whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {selectedDocument.content || "No content"}
                </pre>
              </div>
            )}
          </section>
        )}

        {/* RAG Search */}
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Search className="w-5 h-5 text-accent" />
            Search Sources
          </h2>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              className="input text-sm py-2"
              placeholder="Query your knowledge base\u2026"
              value={ragQuery}
              onChange={(e) => setRagQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleRagSearch();
                }
              }}
            />
            <button
              className="btn btn-secondary px-3"
              onClick={handleRagSearch}
              aria-label="Search"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
          {ragResults.length > 0 && (
            <div className="space-y-2">
              {ragResults.map((result, i) => (
                <div key={i} className="card p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{result.title || "Untitled"}</span>
                    <span className="badge badge-idle">{result.score?.toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-text-secondary line-clamp-3">
                    {result.snippet}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
```

**Step 2: Wire up the knowledge route**

Modify `app/routes/_app.projects.$projectId.knowledge.tsx`:

```tsx
import { useEffect } from "react";
import { useLoaderData } from "react-router";
import { useAppStore } from "~/lib/store";
import { KnowledgeWorkspace } from "~/components/KnowledgeWorkspace";

export { loader } from "./_app.projects.$projectId.knowledge.loader.server";

export default function KnowledgeRoute() {
  const { projectId } = useLoaderData<{ projectId: string }>();
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);

  useEffect(() => {
    setActiveProjectId(projectId);
  }, [projectId, setActiveProjectId]);

  return <KnowledgeWorkspace />;
}
```

**Step 3: Run all tests**

Run: `npx vitest run tests/rr7/`
Expected: All pass

**Step 4: Commit**

```bash
git add app/components/KnowledgeWorkspace.tsx \
  app/routes/_app.projects.\$projectId.knowledge.tsx
git commit -m "feat: add KnowledgeWorkspace component for /knowledge route"
```

---

## Task 5: Build KnowledgePanel for ChatView

**Files:**
- Create: `app/components/KnowledgePanel.tsx`
- Modify: `app/components/ChatView.tsx`

**Step 1: Create KnowledgePanel component**

Create `app/components/KnowledgePanel.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import {
  headlessGetCollections,
  headlessGetDocuments,
  headlessImportUrl,
} from "~/lib/headless-api";
import type { HeadlessCollection, HeadlessDocument } from "~/lib/headless-api";
import { useAppStore } from "~/lib/store";
import { BookOpen, FileText, Link2, Plus, X } from "lucide-react";

interface KnowledgePanelProps {
  projectId: string;
  onClose: () => void;
}

export function KnowledgePanel({ projectId, onClose }: KnowledgePanelProps) {
  const { activeCollectionByProject, setProjectActiveCollection } = useAppStore();

  const [collections, setCollections] = useState<HeadlessCollection[]>([]);
  const [documents, setDocuments] = useState<HeadlessDocument[]>([]);
  const [sourceUrl, setSourceUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<HeadlessDocument | null>(null);

  const activeCollectionId =
    activeCollectionByProject[projectId] || collections[0]?.id || null;

  const refresh = useCallback(async () => {
    try {
      const cols = await headlessGetCollections(projectId);
      setCollections(cols);
      const colId =
        activeCollectionByProject[projectId] || cols[0]?.id || null;
      if (colId) {
        const docs = await headlessGetDocuments(projectId, colId);
        setDocuments(docs);
      }
    } catch {
      // Silently fail in panel — not critical
    }
  }, [projectId, activeCollectionByProject]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCollectionChange = (id: string) => {
    setProjectActiveCollection(projectId, id);
  };

  const handleImportUrl = async () => {
    const url = sourceUrl.trim();
    if (!url || !activeCollectionId) return;
    setImporting(true);
    try {
      await headlessImportUrl(projectId, url, activeCollectionId);
      setSourceUrl("");
      await refresh();
    } catch {
      // Fail silently in panel
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="w-72 border-l border-border bg-surface flex flex-col overflow-hidden shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <BookOpen className="w-4 h-4 text-accent" />
          Knowledge
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded flex items-center justify-center hover:bg-surface-hover text-text-muted"
          aria-label="Close knowledge panel"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Collection selector */}
      <div className="px-3 py-2 border-b border-border">
        <select
          className="input text-xs py-1.5"
          value={activeCollectionId || ""}
          onChange={(e) => handleCollectionChange(e.target.value)}
        >
          {collections.map((col) => (
            <option key={col.id} value={col.id}>
              {col.name}
            </option>
          ))}
          {collections.length === 0 && (
            <option value="">No collections</option>
          )}
        </select>
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {documents.map((doc) => (
          <button
            key={doc.id}
            onClick={() =>
              setPreviewDoc(previewDoc?.id === doc.id ? null : doc)
            }
            className={`w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center gap-2 transition-colors ${
              previewDoc?.id === doc.id
                ? "bg-accent-muted"
                : "hover:bg-surface-hover"
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-text-muted shrink-0" />
            <span className="truncate">{doc.title || "Untitled"}</span>
          </button>
        ))}
        {documents.length === 0 && (
          <p className="text-xs text-text-muted px-2 py-2">No sources yet.</p>
        )}
      </div>

      {/* Preview */}
      {previewDoc && (
        <div className="border-t border-border px-3 py-2 max-h-48 overflow-y-auto">
          <div className="text-xs font-medium mb-1">{previewDoc.title}</div>
          <pre className="text-xs text-text-muted whitespace-pre-wrap">
            {(previewDoc.content || "").slice(0, 500)}
          </pre>
        </div>
      )}

      {/* Quick add */}
      <div className="border-t border-border px-3 py-2">
        <div className="flex gap-1.5">
          <input
            type="url"
            className="input text-xs py-1.5 px-2"
            placeholder="Add URL\u2026"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleImportUrl();
              }
            }}
          />
          <button
            className="btn btn-secondary px-2 py-1"
            onClick={handleImportUrl}
            disabled={importing}
            aria-label="Import URL"
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Integrate KnowledgePanel into ChatView**

Modify `app/components/ChatView.tsx`:

Add import at the top (after existing imports):
```typescript
import { KnowledgePanel } from "./KnowledgePanel";
import { BookOpen } from "lucide-react";
```

Add state for the panel (with the other state declarations):
```typescript
const [knowledgePanelOpen, setKnowledgePanelOpen] = useState(
  searchParams.get("panel") === "knowledge"
);
```

Add a toggle handler:
```typescript
const toggleKnowledgePanel = () => {
  const next = !knowledgePanelOpen;
  setKnowledgePanelOpen(next);
  setSearchParams(
    (prev) => {
      const p = new URLSearchParams(prev);
      if (next) p.set("panel", "knowledge");
      else p.delete("panel");
      return p;
    },
    { replace: true }
  );
};
```

In the chat header area, add a knowledge toggle button:
```tsx
<button
  onClick={toggleKnowledgePanel}
  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
    knowledgePanelOpen
      ? "bg-accent-muted text-accent"
      : "hover:bg-surface-hover text-text-secondary"
  }`}
  aria-label={knowledgePanelOpen ? "Close knowledge panel" : "Open knowledge panel"}
>
  <BookOpen className="w-4 h-4" />
</button>
```

Wrap the chat content + panel in a flex container. The outer structure should be:
```tsx
<div className="flex-1 flex overflow-hidden">
  <div className="flex-1 flex flex-col overflow-hidden">
    {/* existing chat header, messages, input */}
  </div>
  {knowledgePanelOpen && (
    <KnowledgePanel
      projectId={projectId}
      onClose={() => toggleKnowledgePanel()}
    />
  )}
</div>
```

Also remove the collection selector and Deep Research toggle from the ChatView input bar — these are now set at task creation time (QuickStartDashboard) or in the KnowledgePanel.

**Step 3: Run all tests**

Run: `npx vitest run tests/rr7/`
Expected: All pass

**Step 4: Commit**

```bash
git add app/components/KnowledgePanel.tsx app/components/ChatView.tsx
git commit -m "feat: add KnowledgePanel side panel in ChatView"
```

---

## Task 6: Delete Dead Code

**Files:**
- Delete: `app/components/WelcomeView.tsx`
- Delete: `app/components/ProjectWorkspace.tsx`
- Delete: `app/components/Titlebar.tsx`
- Delete: `app/routes/_app.projects.$projectId.sessions.$sessionId.tsx` (if still exists)

**Step 1: Verify no remaining imports**

Search for any remaining references to the deleted components:
```bash
npx vitest run tests/rr7/ 2>&1 | head -30
```

If tests fail due to missing imports, fix the imports first.

**Step 2: Delete the files**

```bash
rm app/components/WelcomeView.tsx
rm app/components/ProjectWorkspace.tsx
rm app/components/Titlebar.tsx
rm -f app/routes/_app.projects.\$projectId.sessions.\$sessionId.tsx
```

**Step 3: Clean up any remaining imports**

Grep for any references to `WelcomeView`, `ProjectWorkspace`, `Titlebar` in the codebase and remove them.

**Step 4: Run all tests**

Run: `npx vitest run tests/rr7/`
Expected: All pass

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove WelcomeView, ProjectWorkspace, Titlebar (replaced)"
```

---

## Task 7: Update Loader to Include Collections Summary

**Files:**
- Modify: `app/routes/_app.projects.$projectId.loader.server.ts`
- Modify: `tests/rr7/routes/_app.projects.test.ts`

**Step 1: Update the failing test**

Add a test to `tests/rr7/routes/_app.projects.test.ts`:

```typescript
it("returns collections summary", async () => {
  const { loader } = await import(
    "~/routes/_app.projects.$projectId.loader.server"
  );
  const args = createMockLoaderArgs(`/projects/${testProject.id}`, {
    projectId: testProject.id,
  });
  const result = await loader(args);
  expect(result).toHaveProperty("collections");
  expect(Array.isArray(result.collections)).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/rr7/routes/_app.projects.test.ts`
Expected: FAIL — `collections` not in result

**Step 3: Update the loader**

Modify `app/routes/_app.projects.$projectId.loader.server.ts`:

```typescript
import { redirect } from "react-router";
import { getProject } from "~/lib/db/queries/projects.server";
import { upsertSettings } from "~/lib/db/queries/settings.server";
import { listTasks } from "~/lib/db/queries/tasks.server";
import { listCollections } from "~/lib/db/queries/documents.server";

export async function loader({ params }: { params: { projectId: string } }) {
  const project = await getProject(params.projectId);
  if (!project) {
    throw redirect("/");
  }
  await upsertSettings({ activeProjectId: params.projectId });
  const [tasks, collections] = await Promise.all([
    listTasks(params.projectId),
    listCollections(params.projectId),
  ]);
  return { projectId: params.projectId, tasks, collections };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/rr7/routes/_app.projects.test.ts`
Expected: PASS

**Step 5: Run all tests**

Run: `npx vitest run tests/rr7/`
Expected: All pass

**Step 6: Commit**

```bash
git add app/routes/_app.projects.\$projectId.loader.server.ts \
  tests/rr7/routes/_app.projects.test.ts
git commit -m "feat: include collections summary in project loader"
```

---

## Verification Checklist

After all tasks, verify:

1. **`npx vitest run tests/rr7/`** — all tests pass
2. **Route navigation:**
   - `/` → redirects to last project or shows onboarding
   - `/projects/:id` → QuickStartDashboard with task input and recent tasks
   - `/projects/:id/tasks/:taskId` → ChatView with knowledge panel toggle
   - `/projects/:id/knowledge` → KnowledgeWorkspace with collections/sources/RAG
   - `/settings` → SettingsPanel (unchanged)
3. **TopNav:**
   - Project switcher dropdown with create/rename/delete
   - Dashboard + Knowledge section tabs
   - Theme toggle + settings in right actions
4. **Sidebar:**
   - Task list only (no projects)
   - "+ New" button navigates to dashboard
   - Collapsed state shows task initials
5. **ChatView:**
   - Knowledge panel toggle in header
   - Panel shows collection selector + source list + quick add
   - Collection/Deep Research removed from input bar
6. **Dead code removed:**
   - No references to WelcomeView, ProjectWorkspace, Titlebar
   - Sessions route deleted
