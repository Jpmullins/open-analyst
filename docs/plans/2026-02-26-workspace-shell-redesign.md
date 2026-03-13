# Workspace Shell Redesign

## Problem

The current UI puts knowledge management (ProjectWorkspace) front-and-center on the project landing page while the primary user action — starting a task — is a secondary textarea. The information hierarchy is inverted for a task-first workflow. Navigation conflates project switching and task switching in a single sidebar, and knowledge management disappears entirely once you enter a chat.

## Design Decisions

- **Persona:** Task-first. Users jump into tasks and pull in context as needed.
- **Hierarchy:** Projects remain the top-level organizer. Tasks inherit project collections, workdir, and config.
- **Knowledge access:** Dedicated `/knowledge` sub-route for deep curation + lightweight side panel in ChatView for mid-task reference.
- **Landing page:** Quick-start — prominent task input, recent task cards, compact project stats.
- **Navigation:** Top nav for project-level sections (Dashboard, Knowledge) + sidebar as task-scoped rail.

## Route Structure

```
/                                        → Redirect to last active project (or onboarding)
/projects/:id                            → QuickStartDashboard
/projects/:id/tasks/:taskId              → ChatView with optional KnowledgePanel
/projects/:id/knowledge                  → KnowledgeWorkspace (full page)
/settings                                → SettingsPanel (unchanged)
```

### Layout Nesting

```
_app.tsx (root layout)
├── TopNav: logo, project switcher dropdown, section tabs, theme toggle, settings
├── Sidebar: task list rail (scoped to active project)
├── Outlet: route content
│
├── _app._index.tsx → redirect
├── _app.projects.$projectId.tsx (project layout)
│   ├── _app.projects.$projectId._index.tsx → QuickStartDashboard
│   ├── _app.projects.$projectId.tasks.$taskId.tsx → ChatView
│   └── _app.projects.$projectId.knowledge.tsx → KnowledgeWorkspace
└── _app.settings.tsx → SettingsPanel
```

## Layout Wireframe

```
┌─────────────────────────────────────────────────────────────┐
│  [☰]  🔶 Open Analyst   ProjectName ▾   Dashboard  Knowledge│
├────────────┬────────────────────────────────────────────────┤
│  TASKS     │                                                │
│  ────────  │         Main Content                           │
│  [+ New ]  │         (route outlet)                         │
│            │                                                │
│  ● Task A  │                                                │
│    Task B  │                                                │
│    Task C  │                                                │
│            │                                                │
│  ────────  │                                                │
│  ⚙  User  │                                                │
└────────────┴────────────────────────────────────────────────┘
```

## Components

### TopNav (new)

```
┌──────────────────────────────────────────────────────────────┐
│ [☰]  🔶 Open Analyst  │  ProjectName ▾  │  Dashboard  Knowledge  │  [🌙] [⚙] │
└──────────────────────────────────────────────────────────────┘
```

- **Project switcher:** Dropdown listing all projects. Search filter when >5 projects. "Create project" action at bottom. Rename/delete via overflow menu.
- **Section tabs:** Dashboard (active on index + task routes), Knowledge. Accent underline on active tab.
- **Right actions:** Theme toggle, settings gear (navigates to `/settings`).

### Sidebar (changed — task rail only)

```
┌────────────┐
│  TASKS     │
│  ────────  │
│  [+ New  ] │  ← prominent button
│            │
│  ● Task A  │  ← status dot: ● running, ✓ done, ○ idle
│    Task B  │
│    Task C  │
│            │
│  ────────  │
│  [U] User  │
│     ⚙      │
└────────────┘
```

Removed from sidebar: project list, project create input, project rename/delete, theme toggle. Those all move to TopNav.

"+ New Task" behavior: if on dashboard, focuses the task input; if elsewhere, navigates to dashboard.

### QuickStartDashboard (new — replaces WelcomeView)

```
┌────────────────────────────────────────────────┐
│                                                │
│         What do you want to work on?           │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │  Describe your task…                     │  │
│  │                                          │  │
│  │  [Deep Research ⚡]  [Collection ▾]  [→] │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  Recent Tasks                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ Task A   │ │ Task B   │ │ Task C   │      │
│  │ Running  │ │ Done 2h  │ │ Done 1d  │      │
│  │ "Build…" │ │ "Analyz…"│ │ "Fix th…"│      │
│  └──────────┘ └──────────┘ └──────────┘      │
│                                                │
│  📁 ~/projects/my-app  📚 3 collections · 12 sources  🔧 4 tools │
└────────────────────────────────────────────────┘
```

- Large centered textarea as primary CTA.
- Deep Research toggle + collection selector inline below textarea.
- Submit creates task → navigates to ChatView.
- Recent tasks as card grid (title, status badge, relative time, first line of prompt).
- Compact project info bar at bottom: workdir, collection/source count, tool count.

### ChatView (changed)

```
┌────────────────────────────────────────────┬───────────────┐
│  Task Title              [📚] [●]         │  Knowledge    │
│  ──────────────────────────────────────────│               │
│  [Assistant] 2m ago                        │  Collection ▾ │
│  Here's what I found…                      │  ──────────── │
│                                            │  📄 Doc A     │
│                          [You] just now    │  📄 Doc B     │
│                    Check the API docs?      │               │
│                                            │  [+ Add src]  │
│  ──────────────────────────────────────────│               │
│  [Message input…            ] [📎] [→]    │               │
└────────────────────────────────────────────┴───────────────┘
```

- Knowledge side panel toggled via header button (📚). ~280px, hidden by default.
- Collection selector and Deep Research toggle removed from input bar (set at task creation or in panel).
- Chat header shows: task title, knowledge toggle, status badge.

### KnowledgePanel (new — side panel in ChatView)

Lightweight panel showing:
- Active collection dropdown
- Source list for selected collection
- "+ Add source" quick action (URL, file, or text)
- Click source → preview modal

### KnowledgeWorkspace (new — refactored from ProjectWorkspace)

Full-page knowledge management at `/projects/:id/knowledge`:
- Collection cards at top with create action
- Source table for selected collection (name, type, date, delete)
- "Add Source" dropdown consolidating URL import, file upload, manual text
- RAG query section at bottom for testing the knowledge base
- Run Logs removed (belong on task context, not knowledge management)

### Removed Components

- **WelcomeView.tsx** — replaced by QuickStartDashboard + redirect on `/`
- **ProjectWorkspace.tsx** — split into KnowledgeWorkspace + KnowledgePanel

## State Changes

### URL State
- `/projects/:id/knowledge?collection=X` — active collection on knowledge page
- `/projects/:id/tasks/:taskId?panel=knowledge` — knowledge panel visibility
- `/settings?tab=credentials` — already implemented

### Zustand Store
- Remove `activeProjectId` (derive from URL `params.projectId`)
- Keep: `settings`, `sidebarCollapsed`, `isConfigured`, `projects` (for TopNav dropdown)

### Loader Data
- `_app.tsx`: projects list, settings, isConfigured
- `_app.projects.$projectId.tsx`: project metadata, tasks, collections summary
- `_app.projects.$projectId._index.tsx`: recent tasks with detail (first message, timestamps)
- `_app.projects.$projectId.tasks.$taskId.tsx`: task + messages (unchanged)
- `_app.projects.$projectId.knowledge.tsx`: collections with source lists

## Migration Path

Each phase is independently deployable:

1. **Phase 1 — Routes & TopNav:** Add TopNav component, restructure route files, keep existing components rendering in new locations.
2. **Phase 2 — QuickStartDashboard:** Build new dashboard, swap it in for project index route.
3. **Phase 3 — KnowledgeWorkspace:** Extract from ProjectWorkspace, wire up `/knowledge` route.
4. **Phase 4 — ChatView + KnowledgePanel:** Build side panel, strip collection/deepResearch from input bar, update sidebar to task-only rail.
5. **Phase 5 — Cleanup:** Delete WelcomeView, ProjectWorkspace, dead routes and imports.
