import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import { ServerRouter, UNSAFE_withComponentProps, Outlet, Meta, Links, ScrollRestoration, Scripts, useNavigate, useParams, useLocation, useSearchParams, useFetcher, useLoaderData, useRevalidator, redirect, useMatches } from "react-router";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";
import { useEffect, useCallback, useState, useRef, useId, startTransition, isValidElement, cloneElement, useMemo } from "react";
import { create } from "zustand";
import { Plus, Trash2, Settings, AlertTriangle, Shield, X, Check, Key, Cpu, AlertCircle, CheckCircle, Loader2, Menu, FolderKanban, ChevronDown, PackageOpen, Sun, Moon, ArrowRight, FlaskConical, FolderOpen, BookOpen, Clock, XCircle, Copy, Sparkles, FileText, CheckCircle2, ChevronRight, Plug, Terminal, ExternalLink, Download, HelpCircle, Send, ListTodo, FileSpreadsheet, Image as Image$1, Square, CheckSquare, Link2, GripVertical, Database, Upload, Search, Package, Save } from "lucide-react";
import { eq, desc, asc, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { pgTable, timestamp, text, varchar, jsonb, uuid, index, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import path from "path";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import fs from "fs";
import os from "os";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mkdir } from "node:fs/promises";
import fs$1 from "fs/promises";
import { PutObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { basename as basename$1 } from "node:path";
const streamTimeout = 5e3;
function handleRequest(request, responseStatusCode, responseHeaders, routerContext, loadContext) {
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders
    });
  }
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    let userAgent = request.headers.get("user-agent");
    let readyOption = userAgent && isbot(userAgent) || routerContext.isSpaMode ? "onAllReady" : "onShellReady";
    let timeoutId = setTimeout(
      () => abort(),
      streamTimeout + 1e3
    );
    const { pipe, abort } = renderToPipeableStream(
      /* @__PURE__ */ jsx(ServerRouter, { context: routerContext, url: request.url }),
      {
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough({
            final(callback) {
              clearTimeout(timeoutId);
              timeoutId = void 0;
              callback();
            }
          });
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set("Content-Type", "text/html");
          pipe(body);
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode
            })
          );
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          if (shellRendered) {
            console.error(error);
          }
        }
      }
    );
  });
}
const entryServer = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: handleRequest,
  streamTimeout
}, Symbol.toStringTag, { value: "Module" }));
function Layout({
  children
}) {
  return /* @__PURE__ */ jsxs("html", {
    lang: "en",
    style: {
      colorScheme: "dark"
    },
    children: [/* @__PURE__ */ jsxs("head", {
      children: [/* @__PURE__ */ jsx("meta", {
        charSet: "UTF-8"
      }), /* @__PURE__ */ jsx("meta", {
        name: "viewport",
        content: "width=device-width, initial-scale=1.0"
      }), /* @__PURE__ */ jsx("meta", {
        name: "theme-color",
        content: "#0a0a0a"
      }), /* @__PURE__ */ jsx("link", {
        rel: "icon",
        type: "image/svg+xml",
        href: "/favicon.svg"
      }), /* @__PURE__ */ jsx(Meta, {}), /* @__PURE__ */ jsx(Links, {})]
    }), /* @__PURE__ */ jsxs("body", {
      className: "bg-background text-text-primary antialiased",
      children: [children, /* @__PURE__ */ jsx(ScrollRestoration, {}), /* @__PURE__ */ jsx(Scripts, {})]
    })]
  });
}
const root = UNSAFE_withComponentProps(function Root() {
  return /* @__PURE__ */ jsx(Outlet, {});
});
const route0 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  Layout,
  default: root
}, Symbol.toStringTag, { value: "Module" }));
const defaultSettings = {
  theme: "light",
  defaultTools: [
    "askuserquestion",
    "todowrite",
    "todoread",
    "webfetch",
    "websearch",
    "read",
    "write",
    "edit",
    "list_directory",
    "glob",
    "grep"
  ],
  permissionRules: [
    { tool: "read", action: "allow" },
    { tool: "glob", action: "allow" },
    { tool: "grep", action: "allow" },
    { tool: "write", action: "ask" },
    { tool: "edit", action: "ask" },
    { tool: "bash", action: "ask" }
  ],
  globalSkillsPath: "",
  memoryStrategy: "auto",
  maxContextTokens: 18e4
};
const useAppStore = create((set) => ({
  // Initial state — always empty for SSR compatibility.
  isLoading: false,
  sidebarCollapsed: false,
  contextPanelCollapsed: false,
  pendingPermission: null,
  pendingQuestion: null,
  settings: defaultSettings,
  appConfig: null,
  isConfigured: true,
  showConfigModal: false,
  workingDir: null,
  projects: [],
  activeProjectId: null,
  activeCollectionByProject: {},
  sandboxSetupProgress: null,
  isSandboxSetupComplete: false,
  sandboxSyncStatus: null,
  fileViewerArtifact: null,
  // UI actions
  setLoading: (loading) => set({ isLoading: loading }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  toggleContextPanel: () => set((state) => ({ contextPanelCollapsed: !state.contextPanelCollapsed })),
  // Permission actions
  setPendingPermission: (permission) => set({ pendingPermission: permission }),
  // Question actions (AskUserQuestion)
  setPendingQuestion: (question) => set({ pendingQuestion: question }),
  // Settings actions
  updateSettings: (updates) => set((state) => ({
    settings: { ...state.settings, ...updates }
  })),
  // Config actions
  setAppConfig: (config) => set({ appConfig: config }),
  setIsConfigured: (configured) => set({ isConfigured: configured }),
  setShowConfigModal: (show) => set({ showConfigModal: show }),
  // Working directory actions
  setWorkingDir: (path2) => set({ workingDir: path2 }),
  // Project actions
  setProjects: (projects2) => set((state) => {
    const nextActive = state.activeProjectId && projects2.some((project) => project.id === state.activeProjectId) ? state.activeProjectId : projects2[0]?.id || null;
    return { projects: projects2, activeProjectId: nextActive };
  }),
  upsertProject: (project) => set((state) => {
    const exists = state.projects.some((item) => item.id === project.id);
    const projects2 = exists ? state.projects.map((item) => item.id === project.id ? { ...item, ...project } : item) : [project, ...state.projects];
    const activeProjectId = state.activeProjectId || project.id;
    return { projects: projects2, activeProjectId };
  }),
  removeProject: (projectId) => set((state) => {
    const projects2 = state.projects.filter((project) => project.id !== projectId);
    const activeProjectId = state.activeProjectId === projectId ? projects2[0]?.id || null : state.activeProjectId;
    return { projects: projects2, activeProjectId };
  }),
  setActiveProjectId: (projectId) => set({ activeProjectId: projectId }),
  setProjectActiveCollection: (projectId, collectionId) => set((state) => ({
    activeCollectionByProject: { ...state.activeCollectionByProject, [projectId]: collectionId }
  })),
  // Sandbox setup actions
  setSandboxSetupProgress: (progress) => set({ sandboxSetupProgress: progress }),
  setSandboxSetupComplete: (complete) => set({ isSandboxSetupComplete: complete }),
  // Sandbox sync actions
  setSandboxSyncStatus: (status) => set({ sandboxSyncStatus: status }),
  // File viewer actions
  openFileViewer: (artifact) => set({ fileViewerArtifact: artifact }),
  closeFileViewer: () => set({ fileViewerArtifact: null })
}));
function Sidebar() {
  const { sidebarCollapsed, isConfigured } = useAppStore();
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const taskFetcher = useFetcher();
  const taskListFetcher = useFetcher();
  const collectionsFetcher = useFetcher();
  const activeProjectId = params.projectId || null;
  const isKnowledgeRoute = location.pathname.endsWith("/knowledge");
  useEffect(() => {
    if (activeProjectId && !isKnowledgeRoute) {
      taskListFetcher.load(`/api/projects/${activeProjectId}/tasks`);
    }
  }, [activeProjectId, location.pathname, taskFetcher.data]);
  useEffect(() => {
    if (activeProjectId && isKnowledgeRoute) {
      collectionsFetcher.load(`/api/projects/${activeProjectId}/knowledge`);
    }
  }, [activeProjectId, isKnowledgeRoute]);
  const tasks2 = taskListFetcher.data?.tasks ?? [];
  const collections2 = collectionsFetcher.data?.collections ?? [];
  const documentCounts = collectionsFetcher.data?.documentCounts ?? {};
  const activeTaskId = params.taskId || null;
  const activeCollectionId = searchParams.get("collection") || null;
  const handleDeleteTask = (taskId) => {
    if (!activeProjectId) return;
    taskFetcher.submit(
      {},
      {
        method: "DELETE",
        action: `/api/projects/${activeProjectId}/tasks/${taskId}`
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
  const handleCollectionClick = (collectionId) => {
    if (activeProjectId) {
      navigate(`/projects/${activeProjectId}/knowledge?collection=${collectionId}`);
    }
  };
  const handleNewCollection = () => {
    if (activeProjectId) {
      navigate(`/projects/${activeProjectId}/knowledge`);
    }
  };
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: `bg-surface border-r border-border flex flex-col overflow-hidden transition-all duration-200 ${sidebarCollapsed ? "w-12" : "w-64"}`,
      children: [
        /* @__PURE__ */ jsxs(
          "div",
          {
            className: `flex-1 overflow-y-auto ${sidebarCollapsed ? "px-1 py-2" : "p-3"}`,
            children: [
              !sidebarCollapsed && activeProjectId && isKnowledgeRoute && /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
                /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-2", children: [
                  /* @__PURE__ */ jsx("div", { className: "text-xs uppercase tracking-wide text-text-muted px-1", children: "Collections" }),
                  /* @__PURE__ */ jsxs(
                    "button",
                    {
                      onClick: handleNewCollection,
                      className: "btn btn-primary text-xs px-2.5 py-1",
                      "aria-label": "New collection",
                      children: [
                        /* @__PURE__ */ jsx(Plus, { className: "w-3 h-3" }),
                        "New"
                      ]
                    }
                  )
                ] }),
                collections2.length === 0 ? /* @__PURE__ */ jsx("div", { className: "text-sm text-text-muted px-1 py-2", children: "No collections yet." }) : collections2.map((col) => /* @__PURE__ */ jsxs(
                  "button",
                  {
                    onClick: () => handleCollectionClick(col.id),
                    className: `w-full text-left px-2 py-2 rounded-lg border transition-colors cursor-pointer ${activeCollectionId === col.id ? "border-accent/40 bg-accent-muted" : "border-transparent hover:border-accent/30 hover:bg-surface-hover"}`,
                    children: [
                      /* @__PURE__ */ jsx("div", { className: "text-sm truncate", children: col.name }),
                      /* @__PURE__ */ jsxs("div", { className: "text-xs text-text-muted", children: [
                        documentCounts[col.id] || 0,
                        " sources"
                      ] })
                    ]
                  },
                  col.id
                ))
              ] }),
              sidebarCollapsed && activeProjectId && isKnowledgeRoute && /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-1", children: [
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: handleNewCollection,
                    className: "w-8 h-8 rounded-lg flex items-center justify-center bg-accent text-white hover:bg-accent-hover",
                    "aria-label": "New collection",
                    children: /* @__PURE__ */ jsx(Plus, { className: "w-4 h-4" })
                  }
                ),
                collections2.slice(0, 8).map((col) => /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: () => handleCollectionClick(col.id),
                    className: `w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium ${activeCollectionId === col.id ? "bg-accent-muted text-accent" : "hover:bg-surface-hover text-text-muted"}`,
                    title: col.name,
                    "aria-label": col.name,
                    children: col.name.charAt(0).toUpperCase()
                  },
                  col.id
                ))
              ] }),
              !sidebarCollapsed && activeProjectId && !isKnowledgeRoute && /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
                /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-2", children: [
                  /* @__PURE__ */ jsx("div", { className: "text-xs uppercase tracking-wide text-text-muted px-1", children: "Tasks" }),
                  /* @__PURE__ */ jsxs(
                    "button",
                    {
                      onClick: handleNewTask,
                      className: "btn btn-primary text-xs px-2.5 py-1",
                      "aria-label": "New task",
                      children: [
                        /* @__PURE__ */ jsx(Plus, { className: "w-3 h-3" }),
                        "New"
                      ]
                    }
                  )
                ] }),
                tasks2.length === 0 ? /* @__PURE__ */ jsx("div", { className: "text-sm text-text-muted px-1 py-2", children: "No tasks yet." }) : tasks2.map((task) => /* @__PURE__ */ jsxs(
                  "div",
                  {
                    className: `group flex items-center gap-2 px-2 py-2 rounded-lg border transition-colors cursor-pointer ${activeTaskId === task.id ? "border-accent/40 bg-accent-muted" : "border-transparent hover:border-accent/30 hover:bg-surface-hover"}`,
                    children: [
                      /* @__PURE__ */ jsxs(
                        "button",
                        {
                          className: "flex-1 text-left min-w-0",
                          onClick: () => navigate(
                            `/projects/${activeProjectId}/tasks/${task.id}`
                          ),
                          children: [
                            /* @__PURE__ */ jsx("div", { className: "text-sm truncate", children: task.title }),
                            /* @__PURE__ */ jsx("div", { className: "text-xs text-text-muted", children: task.status })
                          ]
                        }
                      ),
                      /* @__PURE__ */ jsx(
                        "button",
                        {
                          className: "w-6 h-6 rounded hover:bg-surface-active text-error opacity-0 group-hover:opacity-100",
                          onClick: () => handleDeleteTask(task.id),
                          "aria-label": `Delete task ${task.title}`,
                          children: /* @__PURE__ */ jsx(Trash2, { className: "w-3.5 h-3.5" })
                        }
                      )
                    ]
                  },
                  task.id
                ))
              ] }),
              !sidebarCollapsed && !activeProjectId && /* @__PURE__ */ jsx("div", { className: "text-sm text-text-muted px-1 py-4 text-center", children: "Select a project to see tasks." }),
              sidebarCollapsed && activeProjectId && !isKnowledgeRoute && /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-1", children: [
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: handleNewTask,
                    className: "w-8 h-8 rounded-lg flex items-center justify-center bg-accent text-white hover:bg-accent-hover",
                    "aria-label": "New task",
                    children: /* @__PURE__ */ jsx(Plus, { className: "w-4 h-4" })
                  }
                ),
                tasks2.slice(0, 8).map((task) => /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: () => navigate(
                      `/projects/${activeProjectId}/tasks/${task.id}`
                    ),
                    className: `w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium ${activeTaskId === task.id ? "bg-accent-muted text-accent" : "hover:bg-surface-hover text-text-muted"}`,
                    title: task.title,
                    "aria-label": task.title,
                    children: task.title.charAt(0).toUpperCase()
                  },
                  task.id
                ))
              ] })
            ]
          }
        ),
        /* @__PURE__ */ jsx("div", { className: "p-2 border-t border-border", children: /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => navigate("/settings"),
            className: `w-full flex items-center ${sidebarCollapsed ? "justify-center" : "gap-3"} px-2 py-2 rounded-lg hover:bg-surface-hover transition-colors group`,
            children: sidebarCollapsed ? /* @__PURE__ */ jsx(Settings, { className: "w-4 h-4 text-text-muted" }) : /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("div", { className: "w-7 h-7 rounded-full bg-accent flex items-center justify-center text-white text-xs font-medium", children: "U" }),
              /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0 text-left", children: [
                /* @__PURE__ */ jsx("span", { className: "text-sm font-medium text-text-primary", children: "User" }),
                /* @__PURE__ */ jsx("p", { className: "text-xs text-text-muted", children: isConfigured ? "Configured" : "Setup needed" })
              ] }),
              /* @__PURE__ */ jsx(Settings, { className: "w-4 h-4 text-text-muted group-hover:text-text-primary transition-colors" })
            ] })
          }
        ) })
      ]
    }
  );
}
function PermissionDialog({ permission }) {
  const setPendingPermission = useAppStore((s) => s.setPendingPermission);
  const respondToPermission = useCallback(
    (_toolUseId, _result) => {
      setPendingPermission(null);
    },
    [setPendingPermission]
  );
  const getToolDescription = (toolName) => {
    return `Use ${toolName}`;
  };
  const isHighRisk = [
    "bash",
    "write",
    "edit",
    "execute_command",
    "write_file",
    "edit_file"
  ].includes(permission.toolName);
  return /* @__PURE__ */ jsx("div", { className: "fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in", children: /* @__PURE__ */ jsxs("div", { className: "card w-full max-w-md p-6 m-4 shadow-elevated animate-slide-up", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-4", children: [
      /* @__PURE__ */ jsx("div", { className: `w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${isHighRisk ? "bg-warning/10" : "bg-accent-muted"}`, children: isHighRisk ? /* @__PURE__ */ jsx(AlertTriangle, { className: "w-6 h-6 text-warning" }) : /* @__PURE__ */ jsx(Shield, { className: "w-6 h-6 text-accent" }) }),
      /* @__PURE__ */ jsxs("div", { className: "flex-1", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-lg font-semibold text-text-primary", children: "Permission Required" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-text-secondary mt-1", children: getToolDescription(permission.toolName) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mt-4 p-4 bg-surface-muted rounded-xl", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mb-2", children: [
        /* @__PURE__ */ jsx("span", { className: "text-sm font-medium text-text-primary", children: "Tool" }),
        /* @__PURE__ */ jsx("span", { className: "font-mono text-accent text-sm", children: permission.toolName })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "text-sm text-text-secondary", children: [
        /* @__PURE__ */ jsx("span", { className: "font-medium text-text-primary", children: "Input" }),
        /* @__PURE__ */ jsx("pre", { className: "mt-1 text-xs code-block max-h-32 overflow-auto", children: JSON.stringify(permission.input, null, 2) })
      ] })
    ] }),
    isHighRisk && /* @__PURE__ */ jsx("div", { className: "mt-4 p-3 bg-warning/10 border border-warning/20 rounded-xl", children: /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-2", children: [
      /* @__PURE__ */ jsx(AlertTriangle, { className: "w-4 h-4 text-warning mt-0.5 flex-shrink-0" }),
      /* @__PURE__ */ jsx("p", { className: "text-sm text-warning", children: "This action requires your approval" })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "mt-6 flex items-center gap-3", children: [
      /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: () => respondToPermission(permission.toolUseId, "deny"),
          className: "flex-1 btn btn-secondary",
          children: [
            /* @__PURE__ */ jsx(X, { className: "w-4 h-4" }),
            "Deny"
          ]
        }
      ),
      /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: () => respondToPermission(permission.toolUseId, "allow"),
          className: "flex-1 btn btn-primary",
          children: [
            /* @__PURE__ */ jsx(Check, { className: "w-4 h-4" }),
            "Allow"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsx(
      "button",
      {
        onClick: () => respondToPermission(permission.toolUseId, "allow_always"),
        className: "w-full mt-2 btn btn-ghost text-sm",
        children: "Always Allow"
      }
    )
  ] }) });
}
function getHeadlessApiBase() {
  return "";
}
async function requestJson(path2, init) {
  const res = await fetch(`${getHeadlessApiBase()}/api${path2}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers || {}
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body && (body.error || body.message) || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return body;
}
async function headlessGetModels() {
  const result = await requestJson("/models");
  return Array.isArray(result.models) ? result.models : [];
}
async function headlessSaveConfig(config) {
  await requestJson("/config", {
    method: "POST",
    body: JSON.stringify(config)
  });
}
async function headlessGetCollections(projectId) {
  const response = await requestJson(
    `/projects/${encodeURIComponent(projectId)}/collections`
  );
  return Array.isArray(response.collections) ? response.collections : [];
}
async function headlessCreateCollection(projectId, name, description = "") {
  const response = await requestJson(
    `/projects/${encodeURIComponent(projectId)}/collections`,
    {
      method: "POST",
      body: JSON.stringify({ name, description })
    }
  );
  return response.collection;
}
async function headlessImportUrl(projectId, url, collectionId) {
  const response = await requestJson(
    `/projects/${encodeURIComponent(projectId)}/import/url`,
    {
      method: "POST",
      body: JSON.stringify({ url, collectionId })
    }
  );
  return response.document;
}
async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 32768;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
async function headlessImportFile(projectId, file, collectionId) {
  const contentBase64 = await fileToBase64(file);
  const response = await requestJson(
    `/projects/${encodeURIComponent(projectId)}/import/file`,
    {
      method: "POST",
      body: JSON.stringify({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        contentBase64,
        collectionId
      })
    }
  );
  return response.document;
}
async function headlessRagQuery(projectId, query, collectionId, limit = 8) {
  const response = await requestJson(`/projects/${encodeURIComponent(projectId)}/rag/query`, {
    method: "POST",
    body: JSON.stringify({ query, collectionId, limit })
  });
  return {
    query: response.query || query,
    totalCandidates: Number(response.totalCandidates || 0),
    results: Array.isArray(response.results) ? response.results : []
  };
}
async function headlessGetCredentials() {
  const response = await requestJson("/credentials");
  return Array.isArray(response.credentials) ? response.credentials : [];
}
async function headlessSaveCredential(input) {
  const response = await requestJson("/credentials", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return response.credential;
}
async function headlessUpdateCredential(credentialId, input) {
  const response = await requestJson(
    `/credentials/${encodeURIComponent(credentialId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input)
    }
  );
  return response.credential;
}
async function headlessDeleteCredential(credentialId) {
  await requestJson(`/credentials/${encodeURIComponent(credentialId)}`, {
    method: "DELETE"
  });
}
async function headlessGetMcpPresets() {
  const response = await requestJson("/mcp/presets");
  return response.presets && typeof response.presets === "object" ? response.presets : {};
}
async function headlessGetMcpServers() {
  const response = await requestJson("/mcp/servers");
  return Array.isArray(response.servers) ? response.servers : [];
}
async function headlessSaveMcpServer(server) {
  const response = await requestJson("/mcp/servers", {
    method: "POST",
    body: JSON.stringify(server)
  });
  return response.server;
}
async function headlessDeleteMcpServer(serverId) {
  await requestJson(`/mcp/servers/${encodeURIComponent(serverId)}`, {
    method: "DELETE"
  });
}
async function headlessGetMcpServerStatus() {
  const response = await requestJson("/mcp/status");
  return Array.isArray(response.statuses) ? response.statuses : [];
}
async function headlessGetMcpTools() {
  const response = await requestJson("/mcp/tools");
  return Array.isArray(response.tools) ? response.tools : [];
}
async function headlessGetSkills() {
  const response = await requestJson("/skills");
  return Array.isArray(response.skills) ? response.skills : [];
}
async function headlessValidateSkillPath(folderPath) {
  return requestJson("/skills/validate", {
    method: "POST",
    body: JSON.stringify({ folderPath })
  });
}
async function headlessInstallSkill(folderPath) {
  return requestJson("/skills/install", {
    method: "POST",
    body: JSON.stringify({ folderPath })
  });
}
async function headlessDeleteSkill(skillId) {
  await requestJson(`/skills/${encodeURIComponent(skillId)}`, {
    method: "DELETE"
  });
}
async function headlessSetSkillEnabled(skillId, enabled) {
  await requestJson(`/skills/${encodeURIComponent(skillId)}/enabled`, {
    method: "POST",
    body: JSON.stringify({ enabled })
  });
}
async function headlessGetLogs() {
  const response = await requestJson("/logs");
  return {
    files: Array.isArray(response.files) ? response.files : [],
    directory: String(response.directory || "")
  };
}
async function headlessLogsIsEnabled() {
  const response = await requestJson("/logs/enabled");
  return Boolean(response.enabled);
}
async function headlessLogsSetEnabled(enabled) {
  await requestJson("/logs/enabled", {
    method: "POST",
    body: JSON.stringify({ enabled })
  });
}
async function headlessLogsExport() {
  return requestJson("/logs/export", { method: "POST" });
}
async function headlessLogsClear() {
  return requestJson("/logs/clear", { method: "POST" });
}
function supportsToolCalling(modelId) {
  const value = modelId.trim().toLowerCase();
  if (!value) return false;
  if (value.includes("embed") || value.includes("embedding") || value.startsWith("bedrock-titan-embed") || value.startsWith("bedrock-llama")) {
    return false;
  }
  if (value.includes("claude") || value.includes("gpt") || value.includes("gemini") || value.includes("command-r") || value.includes("mistral-large")) {
    return true;
  }
  return true;
}
function ConfigModal({ isOpen, onClose, onSave, initialConfig, isFirstRun }) {
  const [model, setModel] = useState(initialConfig?.model || "");
  const [customModel, setCustomModel] = useState("");
  const [useCustomModel, setUseCustomModel] = useState(false);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    headlessGetModels().then((list) => {
      setModels(list);
      if (list.length > 0 && !model) {
        setModel((list.find((item) => item.supportsTools) || list[0]).id);
      }
    }).catch((e) => setError(`Failed to load models: ${e instanceof Error ? e.message : String(e)}`)).finally(() => setLoading(false));
  }, [isOpen]);
  useEffect(() => {
    if (initialConfig?.model) {
      setModel(initialConfig.model);
    }
  }, [initialConfig]);
  async function handleSave() {
    const finalModel = useCustomModel ? customModel.trim() : model;
    if (!finalModel) {
      setError("Select or enter a model name");
      return;
    }
    if (!supportsToolCalling(finalModel)) {
      setError("This model does not appear to support tool calling. Choose a tool-capable model such as Claude Sonnet or Opus.");
      return;
    }
    setError("");
    setIsSaving(true);
    try {
      await onSave({ model: finalModel });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1e3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }
  if (!isOpen) return null;
  return /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm", children: /* @__PURE__ */ jsxs("div", { className: "bg-surface rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-border", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsx("div", { className: "w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center", children: /* @__PURE__ */ jsx(Key, { className: "w-5 h-5 text-white" }) }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h2", { className: "text-lg font-semibold text-text-primary", children: isFirstRun ? "Welcome to Open Analyst" : "Model Configuration" }),
          /* @__PURE__ */ jsx("p", { className: "text-sm text-text-secondary", children: isFirstRun ? "Select a model to get started" : "Choose your preferred model" })
        ] })
      ] }),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: onClose,
          className: "p-2 rounded-lg hover:bg-surface-hover transition-colors",
          children: /* @__PURE__ */ jsx(X, { className: "w-5 h-5 text-text-secondary" })
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "p-6 space-y-5 max-h-[60vh] overflow-y-auto", children: [
      /* @__PURE__ */ jsx("p", { className: "text-sm text-text-secondary", children: "Models are served through the LiteLLM gateway. Open Analyst requires a model that supports tool calling." }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 text-sm font-medium text-text-primary", children: [
          /* @__PURE__ */ jsx(Cpu, { className: "w-4 h-4" }),
          "Model"
        ] }),
        useCustomModel ? /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            value: customModel,
            onChange: (e) => setCustomModel(e.target.value),
            placeholder: "Enter custom model ID",
            className: "w-full px-4 py-3 rounded-xl bg-background border border-border text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
          }
        ) : /* @__PURE__ */ jsxs(
          "select",
          {
            value: model,
            onChange: (e) => setModel(e.target.value),
            disabled: loading,
            className: "w-full px-4 py-3 rounded-xl bg-background border border-border text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all appearance-none cursor-pointer",
            children: [
              loading && /* @__PURE__ */ jsx("option", { children: "Loading models..." }),
              models.map((m) => /* @__PURE__ */ jsx("option", { value: m.id, children: m.supportsTools ? m.name : `${m.name} (no tool support)` }, m.id))
            ]
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => setUseCustomModel(!useCustomModel),
            className: "text-xs text-accent hover:text-accent-hover",
            children: useCustomModel ? "Use preset model" : "Enter custom model ID"
          }
        )
      ] }),
      error && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 px-4 py-3 rounded-xl bg-error/10 text-error text-sm", children: [
        /* @__PURE__ */ jsx(AlertCircle, { className: "w-4 h-4 flex-shrink-0" }),
        error
      ] }),
      success && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 px-4 py-3 rounded-xl bg-success/10 text-success text-sm", children: [
        /* @__PURE__ */ jsx(CheckCircle, { className: "w-4 h-4 flex-shrink-0" }),
        "Saved successfully!"
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "px-6 py-4 bg-surface-hover border-t border-border", children: /* @__PURE__ */ jsx(
      "button",
      {
        onClick: handleSave,
        disabled: isSaving,
        className: "w-full py-3 px-4 rounded-xl bg-accent text-white font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2",
        children: isSaving ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Loader2, { className: "w-4 h-4 animate-spin" }),
          "Saving..."
        ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(CheckCircle, { className: "w-4 h-4" }),
          isFirstRun ? "Get Started" : "Save Configuration"
        ] })
      }
    ) })
  ] }) });
}
function AlertDialog({
  open,
  title,
  message,
  inputLabel,
  inputDefaultValue = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel
}) {
  const [inputValue, setInputValue] = useState(inputDefaultValue);
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const inputId = useId();
  useEffect(() => {
    setInputValue(inputDefaultValue);
  }, [inputDefaultValue, open]);
  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      });
    } else {
      dialogRef.current?.close();
    }
  }, [open]);
  if (!open) return null;
  const handleConfirm = () => {
    onConfirm(inputLabel ? inputValue : void 0);
  };
  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };
  return /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-[60] flex items-center justify-center bg-black/60", onClick: onCancel, onKeyDown: handleKeyDown, children: /* @__PURE__ */ jsx(
    "dialog",
    {
      ref: dialogRef,
      className: "bg-surface rounded-xl border border-border shadow-2xl p-0 w-full max-w-md mx-4 backdrop:bg-transparent",
      onClose: onCancel,
      children: /* @__PURE__ */ jsxs("div", { className: "p-5 space-y-4", onClick: (e) => e.stopPropagation(), children: [
        /* @__PURE__ */ jsx("h3", { className: "text-base font-semibold text-text-primary", children: title }),
        message && /* @__PURE__ */ jsx("p", { className: "text-sm text-text-secondary", children: message }),
        inputLabel && /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
          /* @__PURE__ */ jsx("label", { htmlFor: inputId, className: "text-sm text-text-secondary", children: inputLabel }),
          /* @__PURE__ */ jsx(
            "input",
            {
              id: inputId,
              ref: inputRef,
              type: "text",
              className: "input w-full",
              value: inputValue,
              onChange: (e) => setInputValue(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleConfirm();
                }
              }
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-2 pt-1", children: [
          /* @__PURE__ */ jsx("button", { className: "btn btn-secondary", onClick: onCancel, children: cancelLabel }),
          /* @__PURE__ */ jsx(
            "button",
            {
              className: `btn ${variant === "danger" ? "btn-primary bg-error hover:bg-error/90" : "btn-primary"}`,
              onClick: handleConfirm,
              children: confirmLabel
            }
          )
        ] })
      ] })
    }
  ) });
}
function toInitialState(project) {
  return {
    workspaceLocalRoot: project?.workspaceLocalRoot || "",
    artifactBackend: project?.artifactBackend || "env",
    artifactLocalRoot: project?.artifactLocalRoot || "",
    artifactS3Bucket: project?.artifactS3Bucket || "",
    artifactS3Region: project?.artifactS3Region || "",
    artifactS3Endpoint: project?.artifactS3Endpoint || "",
    artifactS3Prefix: project?.artifactS3Prefix || ""
  };
}
function ProjectSettingsDialog({
  open,
  project,
  isSaving = false,
  onCancel,
  onSave
}) {
  const dialogRef = useRef(null);
  const [form, setForm] = useState(() => toInitialState(project));
  const workspaceRootId = useId();
  const localArtifactRootId = useId();
  const s3BucketId = useId();
  const s3RegionId = useId();
  const s3EndpointId = useId();
  const s3PrefixId = useId();
  useEffect(() => {
    setForm(toInitialState(project));
  }, [project, open]);
  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [open]);
  if (!open || !project) return null;
  const isS3 = form.artifactBackend === "s3";
  const isLocal = form.artifactBackend === "local";
  const handleSubmit = () => {
    onSave(form);
  };
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: "fixed inset-0 z-[60] flex items-center justify-center bg-black/60",
      onClick: onCancel,
      children: /* @__PURE__ */ jsx(
        "dialog",
        {
          ref: dialogRef,
          className: "bg-surface rounded-xl border border-border shadow-2xl p-0 w-full max-w-2xl mx-4 backdrop:bg-transparent",
          onClose: onCancel,
          children: /* @__PURE__ */ jsxs("div", { className: "p-5 space-y-5", onClick: (event) => event.stopPropagation(), children: [
            /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
              /* @__PURE__ */ jsx("h3", { className: "text-base font-semibold text-text-primary", children: "Project Storage" }),
              /* @__PURE__ */ jsx("p", { className: "text-sm text-text-secondary", children: "Configure where this project keeps its workspace and artifacts." })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
              /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
                /* @__PURE__ */ jsx("label", { htmlFor: workspaceRootId, className: "text-sm text-text-secondary", children: "Workspace root override" }),
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    id: workspaceRootId,
                    type: "text",
                    className: "input w-full",
                    value: form.workspaceLocalRoot,
                    onChange: (event) => setForm((current) => ({
                      ...current,
                      workspaceLocalRoot: event.target.value
                    })),
                    placeholder: "Use .env default when blank"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
                /* @__PURE__ */ jsx("span", { className: "text-sm text-text-secondary", children: "Workspace slug" }),
                /* @__PURE__ */ jsx("div", { className: "input w-full flex items-center bg-background-secondary text-text-secondary", children: project.workspaceSlug || project.id })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx("span", { className: "text-sm text-text-secondary", children: "Artifact backend" }),
              /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: [
                { value: "env", label: "Use .env defaults" },
                { value: "local", label: "Local override" },
                { value: "s3", label: "S3 override" }
              ].map((option) => /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  className: `px-3 py-1.5 text-sm rounded-lg border transition-colors ${form.artifactBackend === option.value ? "border-accent bg-accent-muted text-accent" : "border-border text-text-secondary hover:bg-surface-hover"}`,
                  onClick: () => setForm((current) => ({
                    ...current,
                    artifactBackend: option.value
                  })),
                  children: option.label
                },
                option.value
              )) })
            ] }),
            (form.artifactBackend === "env" || isLocal) && /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
              /* @__PURE__ */ jsx("label", { htmlFor: localArtifactRootId, className: "text-sm text-text-secondary", children: "Local artifact root override" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  id: localArtifactRootId,
                  type: "text",
                  className: "input w-full",
                  value: form.artifactLocalRoot,
                  onChange: (event) => setForm((current) => ({
                    ...current,
                    artifactLocalRoot: event.target.value
                  })),
                  placeholder: isLocal ? "Absolute path for project artifacts" : "Optional override"
                }
              )
            ] }),
            (form.artifactBackend === "env" || isS3) && /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
              /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
                /* @__PURE__ */ jsx("label", { htmlFor: s3BucketId, className: "text-sm text-text-secondary", children: "S3 bucket override" }),
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    id: s3BucketId,
                    type: "text",
                    className: "input w-full",
                    value: form.artifactS3Bucket,
                    onChange: (event) => setForm((current) => ({
                      ...current,
                      artifactS3Bucket: event.target.value
                    }))
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
                /* @__PURE__ */ jsx("label", { htmlFor: s3RegionId, className: "text-sm text-text-secondary", children: "S3 region override" }),
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    id: s3RegionId,
                    type: "text",
                    className: "input w-full",
                    value: form.artifactS3Region,
                    onChange: (event) => setForm((current) => ({
                      ...current,
                      artifactS3Region: event.target.value
                    }))
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
                /* @__PURE__ */ jsx("label", { htmlFor: s3EndpointId, className: "text-sm text-text-secondary", children: "S3 endpoint override" }),
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    id: s3EndpointId,
                    type: "text",
                    className: "input w-full",
                    value: form.artifactS3Endpoint,
                    onChange: (event) => setForm((current) => ({
                      ...current,
                      artifactS3Endpoint: event.target.value
                    }))
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
                /* @__PURE__ */ jsx("label", { htmlFor: s3PrefixId, className: "text-sm text-text-secondary", children: "S3 prefix override" }),
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    id: s3PrefixId,
                    type: "text",
                    className: "input w-full",
                    value: form.artifactS3Prefix,
                    onChange: (event) => setForm((current) => ({
                      ...current,
                      artifactS3Prefix: event.target.value
                    }))
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "rounded-lg border border-border bg-background-secondary px-3 py-2 text-sm text-text-secondary", children: "Files are stored under the project workspace slug, and artifact metadata keeps both the raw storage URI and the stable app link." }),
            /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-2", children: [
              /* @__PURE__ */ jsx("button", { className: "btn btn-secondary", onClick: onCancel, disabled: isSaving, children: "Cancel" }),
              /* @__PURE__ */ jsx("button", { className: "btn btn-primary", onClick: handleSubmit, disabled: isSaving, children: isSaving ? "Saving..." : "Save" })
            ] })
          ] })
        }
      )
    }
  );
}
function TopNav() {
  const {
    settings: settings2,
    updateSettings,
    projects: projects2,
    sidebarCollapsed,
    toggleSidebar,
    upsertProject,
    removeProject,
    isConfigured
  } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const createFetcher = useFetcher();
  const projectMutationFetcher = useFetcher();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [renameDialog, setRenameDialog] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const activeProjectId = params.projectId || null;
  const activeProject = projects2.find((p) => p.id === activeProjectId);
  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);
  useEffect(() => {
    if (createFetcher.state === "idle" && createFetcher.data) {
      const data = createFetcher.data;
      if (data?.project?.id) {
        navigate(`/projects/${data.project.id}`);
        setDropdownOpen(false);
        setNewProjectName("");
      }
    }
  }, [createFetcher.state, createFetcher.data, navigate]);
  useEffect(() => {
    if (projectMutationFetcher.state !== "idle" || !projectMutationFetcher.data) {
      return;
    }
    const data = projectMutationFetcher.data;
    if (data?.project?.id) {
      upsertProject(data.project);
      setProjectSettingsOpen(false);
    }
  }, [projectMutationFetcher.state, projectMutationFetcher.data, upsertProject]);
  const toggleTheme = () => {
    updateSettings({ theme: settings2.theme === "dark" ? "light" : "dark" });
  };
  const handleCreateProject = () => {
    const name = newProjectName.trim();
    if (!name) return;
    createFetcher.submit(
      { name },
      { method: "POST", action: "/api/projects", encType: "application/json" }
    );
  };
  const confirmRename = (nextName) => {
    if (!renameDialog || !nextName?.trim() || nextName.trim() === renameDialog.currentName) {
      setRenameDialog(null);
      return;
    }
    upsertProject({ id: renameDialog.projectId, name: nextName.trim() });
    projectMutationFetcher.submit(
      { name: nextName.trim() },
      {
        method: "PATCH",
        action: `/api/projects/${renameDialog.projectId}`,
        encType: "application/json"
      }
    );
    setRenameDialog(null);
  };
  const confirmDelete = () => {
    if (!deleteDialog) return;
    removeProject(deleteDialog.projectId);
    projectMutationFetcher.submit(
      {},
      {
        method: "DELETE",
        action: `/api/projects/${deleteDialog.projectId}`,
        encType: "application/json"
      }
    );
    if (deleteDialog.projectId === activeProjectId) {
      navigate("/");
    }
    setDeleteDialog(null);
  };
  const saveProjectSettings = (values) => {
    if (!activeProject) return;
    projectMutationFetcher.submit(values, {
      method: "PATCH",
      action: `/api/projects/${activeProject.id}`,
      encType: "application/json"
    });
  };
  const isKnowledge = location.pathname.endsWith("/knowledge");
  const isDashboard = activeProjectId && !isKnowledge;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("nav", { className: "h-12 bg-background-secondary border-b border-border shrink-0 flex items-center px-3 gap-2", children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: toggleSidebar,
          className: "w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-hover text-text-secondary",
          "aria-label": sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar",
          children: /* @__PURE__ */ jsx(Menu, { className: "w-4 h-4" })
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mr-2", children: [
        /* @__PURE__ */ jsx("div", { className: "w-6 h-6 rounded-md bg-accent-muted flex items-center justify-center", children: /* @__PURE__ */ jsx(FolderKanban, { className: "w-3.5 h-3.5 text-accent" }) }),
        /* @__PURE__ */ jsx("span", { className: "text-sm font-semibold text-text-primary hidden sm:inline", children: "Open Analyst" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "w-px h-5 bg-border" }),
      /* @__PURE__ */ jsxs("div", { className: "relative", ref: dropdownRef, children: [
        /* @__PURE__ */ jsxs(
          "button",
          {
            onClick: () => setDropdownOpen(!dropdownOpen),
            className: "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-surface-hover text-sm transition-colors",
            "aria-label": "Switch project",
            children: [
              /* @__PURE__ */ jsx("span", { className: "truncate max-w-[180px] font-medium", children: activeProject?.name || "Select project" }),
              /* @__PURE__ */ jsx(ChevronDown, { className: "w-3.5 h-3.5 text-text-muted shrink-0" })
            ]
          }
        ),
        dropdownOpen && /* @__PURE__ */ jsxs("div", { className: "absolute top-full left-0 mt-1 w-72 bg-surface border border-border rounded-xl shadow-elevated z-50 overflow-hidden", children: [
          /* @__PURE__ */ jsx("div", { className: "max-h-64 overflow-y-auto p-1", children: projects2.map((project) => /* @__PURE__ */ jsxs(
            "div",
            {
              className: `group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${project.id === activeProjectId ? "bg-accent-muted text-accent" : "hover:bg-surface-hover"}`,
              children: [
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    className: "flex-1 text-left min-w-0",
                    onClick: () => {
                      navigate(`/projects/${project.id}`);
                      setDropdownOpen(false);
                    },
                    children: /* @__PURE__ */ jsx("div", { className: "text-sm font-medium truncate", children: project.name })
                  }
                ),
                /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity", children: [
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      className: "w-6 h-6 rounded hover:bg-surface-active text-text-muted text-xs",
                      onClick: (e) => {
                        e.stopPropagation();
                        setRenameDialog({
                          projectId: project.id,
                          currentName: project.name
                        });
                      },
                      "aria-label": `Rename project ${project.name}`,
                      children: "✎"
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      className: "w-6 h-6 rounded hover:bg-surface-active text-error text-xs",
                      onClick: (e) => {
                        e.stopPropagation();
                        setDeleteDialog({
                          projectId: project.id,
                          projectName: project.name
                        });
                      },
                      "aria-label": `Delete project ${project.name}`,
                      children: "✕"
                    }
                  )
                ] })
              ]
            },
            project.id
          )) }),
          /* @__PURE__ */ jsx("div", { className: "border-t border-border p-2", children: /* @__PURE__ */ jsxs("div", { className: "flex gap-1.5", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                className: "input text-sm py-1.5 px-2.5",
                placeholder: "New project…",
                value: newProjectName,
                onChange: (e) => setNewProjectName(e.target.value),
                onKeyDown: (e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreateProject();
                  }
                }
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                className: "btn btn-secondary px-2 py-1.5",
                onClick: handleCreateProject,
                "aria-label": "Create project",
                children: /* @__PURE__ */ jsx(Plus, { className: "w-3.5 h-3.5" })
              }
            )
          ] }) })
        ] })
      ] }),
      activeProjectId && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("div", { className: "w-px h-5 bg-border" }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-0.5", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => navigate(`/projects/${activeProjectId}`),
              className: `px-3 py-1.5 text-sm rounded-lg transition-colors ${isDashboard ? "text-accent font-medium bg-accent-muted" : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"}`,
              children: "Dashboard"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => navigate(`/projects/${activeProjectId}/knowledge`),
              className: `px-3 py-1.5 text-sm rounded-lg transition-colors ${isKnowledge ? "text-accent font-medium bg-accent-muted" : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"}`,
              children: "Knowledge"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "flex-1" }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1", children: [
        activeProject && /* @__PURE__ */ jsxs(
          "button",
          {
            onClick: () => setProjectSettingsOpen(true),
            className: "h-8 px-2 rounded-lg flex items-center gap-1.5 hover:bg-surface-hover text-text-secondary text-sm",
            "aria-label": "Project storage settings",
            children: [
              /* @__PURE__ */ jsx(PackageOpen, { className: "w-4 h-4" }),
              /* @__PURE__ */ jsx("span", { className: "hidden md:inline", children: "Project" })
            ]
          }
        ),
        /* @__PURE__ */ jsx(
          "span",
          {
            className: `w-2 h-2 rounded-full ${isConfigured ? "bg-success" : "bg-amber-500"}`,
            title: isConfigured ? "API configured" : "API not configured"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: toggleTheme,
            className: "w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-hover text-text-secondary",
            "aria-label": settings2.theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
            children: settings2.theme === "dark" ? /* @__PURE__ */ jsx(Sun, { className: "w-4 h-4" }) : /* @__PURE__ */ jsx(Moon, { className: "w-4 h-4" })
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => navigate("/settings"),
            className: "w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-hover text-text-secondary",
            "aria-label": "Settings",
            children: /* @__PURE__ */ jsx(Settings, { className: "w-4 h-4" })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsx(
      AlertDialog,
      {
        open: !!renameDialog,
        title: "Rename project",
        inputLabel: "Project name",
        inputDefaultValue: renameDialog?.currentName || "",
        confirmLabel: "Rename",
        onConfirm: confirmRename,
        onCancel: () => setRenameDialog(null)
      }
    ),
    /* @__PURE__ */ jsx(
      AlertDialog,
      {
        open: !!deleteDialog,
        title: "Delete project",
        message: `Are you sure you want to delete "${deleteDialog?.projectName}"? This action cannot be undone.`,
        confirmLabel: "Delete",
        variant: "danger",
        onConfirm: confirmDelete,
        onCancel: () => setDeleteDialog(null)
      }
    ),
    /* @__PURE__ */ jsx(
      ProjectSettingsDialog,
      {
        open: projectSettingsOpen,
        project: activeProject || null,
        isSaving: projectMutationFetcher.state !== "idle",
        onCancel: () => setProjectSettingsOpen(false),
        onSave: saveProjectSettings
      }
    )
  ] });
}
const phaseConfig = {
  starting_agent: { icon: "🚀" },
  syncing_files: { icon: "📂" },
  syncing_skills: { icon: "🔧" },
  ready: { icon: "✅" },
  error: { icon: "❌" }
};
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function SandboxSyncToast({ status }) {
  const [isVisible, setIsVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  useEffect(() => {
    if (status && status.phase !== "ready") {
      setIsVisible(true);
      setFadeOut(false);
    } else if (status?.phase === "ready") {
      const timer = setTimeout(() => {
        setFadeOut(true);
        setTimeout(() => {
          setIsVisible(false);
        }, 300);
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [status]);
  if (!status || !isVisible) {
    return null;
  }
  const config = phaseConfig[status.phase];
  const isComplete = status.phase === "ready";
  const isError = status.phase === "error";
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: `fixed bottom-4 right-4 z-40 transition-all duration-300 ${fadeOut ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"}`,
      children: /* @__PURE__ */ jsxs("div", { className: "bg-surface/95 backdrop-blur-sm border border-border rounded-2xl shadow-xl max-w-sm overflow-hidden", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 px-4 py-3", children: [
          /* @__PURE__ */ jsx("div", { className: `text-xl ${isComplete ? "" : "animate-pulse"}`, children: config.icon }),
          /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
            /* @__PURE__ */ jsx("p", { className: `font-medium text-sm ${isComplete ? "text-green-500" : isError ? "text-red-500" : "text-accent"}`, children: status.message }),
            status.detail && /* @__PURE__ */ jsx("p", { className: "text-xs text-text-muted mt-0.5 truncate", children: status.detail })
          ] }),
          !isComplete && !isError && /* @__PURE__ */ jsx("div", { className: "flex-shrink-0", children: /* @__PURE__ */ jsx("div", { className: "w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" }) })
        ] }),
        status.fileCount !== void 0 && status.totalSize !== void 0 && /* @__PURE__ */ jsxs("div", { className: "px-4 py-2 bg-surface-muted border-t border-border flex items-center justify-between text-xs text-text-muted", children: [
          /* @__PURE__ */ jsxs("span", { children: [
            status.fileCount,
            " files"
          ] }),
          /* @__PURE__ */ jsx("span", { children: formatSize(status.totalSize) })
        ] }),
        status.phase === "syncing_files" && /* @__PURE__ */ jsx("div", { className: "px-4 py-2.5 bg-accent-muted/50 border-t border-border", children: /* @__PURE__ */ jsxs("p", { className: "text-xs text-text-secondary leading-relaxed", children: [
          "Syncing project files to isolated sandbox for secure code execution.",
          /* @__PURE__ */ jsx("span", { className: "text-accent font-medium", children: " First sync is slower" }),
          ", incremental syncs will be faster."
        ] }) })
      ] })
    }
  );
}
const STORAGE_KEY = "open-analyst.browser.config.v1";
const defaultBrowserConfig = {
  provider: "openrouter",
  apiKey: "",
  baseUrl: "",
  model: "",
  isConfigured: false
};
function getBrowserConfig() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultBrowserConfig;
    }
    const parsed = JSON.parse(raw);
    return {
      ...defaultBrowserConfig,
      ...parsed,
      model: parsed.model || defaultBrowserConfig.model,
      isConfigured: Boolean(parsed.isConfigured)
    };
  } catch {
    return defaultBrowserConfig;
  }
}
function saveBrowserConfig(updates) {
  const current = getBrowserConfig();
  const merged = {
    ...current,
    ...updates,
    isConfigured: updates.isConfigured ?? current.isConfigured
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return merged;
}
const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description").default(""),
    datastores: jsonb("datastores").default([]),
    workspaceSlug: varchar("workspace_slug", { length: 255 }).notNull().default(""),
    workspaceLocalRoot: text("workspace_local_root"),
    artifactBackend: varchar("artifact_backend", { length: 16 }).notNull().default("env"),
    artifactLocalRoot: text("artifact_local_root"),
    artifactS3Bucket: text("artifact_s3_bucket"),
    artifactS3Region: varchar("artifact_s3_region", { length: 255 }),
    artifactS3Endpoint: text("artifact_s3_endpoint"),
    artifactS3Prefix: text("artifact_s3_prefix"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
  },
  (table) => [index("projects_user_id_idx").on(table.userId)]
);
const collections = pgTable(
  "collections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description").default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
  },
  (table) => [
    index("collections_project_id_idx").on(table.projectId),
    uniqueIndex("collections_project_name_idx").on(
      table.projectId,
      table.name
    )
  ]
);
const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    collectionId: uuid("collection_id").references(() => collections.id, {
      onDelete: "set null"
    }),
    title: varchar("title", { length: 500 }).default("Untitled"),
    sourceType: varchar("source_type", { length: 50 }).default("manual"),
    sourceUri: text("source_uri"),
    storageUri: text("storage_uri"),
    content: text("content"),
    metadata: jsonb("metadata").default({}),
    embedding: jsonb("embedding").$type(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
  },
  (table) => [
    index("documents_project_id_idx").on(table.projectId),
    index("documents_collection_id_idx").on(table.collectionId)
  ]
);
const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).default("New Task"),
    type: varchar("type", { length: 50 }).default("chat"),
    status: varchar("status", { length: 50 }).default("idle"),
    cwd: text("cwd"),
    planSnapshot: jsonb("plan_snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
  },
  (table) => [
    index("tasks_project_updated_idx").on(table.projectId, table.updatedAt),
    index("tasks_status_idx").on(table.status)
  ]
);
const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(),
    content: jsonb("content").notNull(),
    tokenUsage: jsonb("token_usage"),
    timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow()
  },
  (table) => [
    index("messages_task_timestamp_idx").on(table.taskId, table.timestamp)
  ]
);
const taskEvents = pgTable(
  "task_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 100 }).notNull(),
    payload: jsonb("payload").default({}),
    timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow()
  },
  (table) => [index("task_events_task_id_idx").on(table.taskId)]
);
const settings = pgTable(
  "settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    activeProjectId: uuid("active_project_id"),
    model: varchar("model", { length: 255 }).default(""),
    workingDir: text("working_dir"),
    workingDirType: varchar("working_dir_type", { length: 20 }).default(
      "local"
    ),
    s3Uri: text("s3_uri"),
    agentBackend: varchar("agent_backend", { length: 50 }).default("strands"),
    devLogsEnabled: boolean("dev_logs_enabled").default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
  },
  (table) => [uniqueIndex("settings_user_id_idx").on(table.userId)]
);
const schema = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  collections,
  documents,
  messages,
  projects,
  settings,
  taskEvents,
  tasks
}, Symbol.toStringTag, { value: "Module" }));
const { Pool } = pg;
const DEV_USER_ID = "dev-user";
let pool = null;
function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    pool = new Pool({ connectionString: url });
  }
  return pool;
}
const db = drizzle(getPool(), { schema });
const env = createEnv({
  server: {
    LITELLM_BASE_URL: z.string().url().default("http://localhost:4000"),
    LITELLM_API_KEY: z.string().default(""),
    LITELLM_EMBEDDING_MODEL: z.string().default(""),
    STRANDS_URL: z.string().url().default("http://localhost:8080"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    PROJECT_WORKSPACES_ROOT: z.string().default(""),
    ARTIFACT_STORAGE_BACKEND: z.enum(["local", "s3"]).default("local"),
    ARTIFACT_LOCAL_DIR: z.string().default(""),
    ARTIFACT_S3_BUCKET: z.string().default(""),
    ARTIFACT_S3_REGION: z.string().default("us-east-1"),
    ARTIFACT_S3_PREFIX: z.string().default("open-analyst-artifacts"),
    ARTIFACT_S3_ENDPOINT: z.string().default("")
  },
  runtimeEnv: process.env
});
function getConfigDir() {
  const envDir = process.env.OPEN_ANALYST_DATA_DIR;
  if (envDir) return envDir;
  return path.join(os.homedir(), ".config", "open-analyst");
}
function ensureConfigDir(configDir) {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
function loadJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed;
  } catch {
    return fallback;
  }
}
function saveJsonFile(filePath, value) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}
function loadJsonArray(filePath) {
  const result = loadJsonFile(filePath, []);
  return Array.isArray(result) ? result : [];
}
function saveJsonArray(filePath, value) {
  saveJsonFile(filePath, Array.isArray(value) ? value : []);
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function trimOrNull(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}
function slugifyProjectName(value) {
  return String(value || "project").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "project";
}
function buildProjectWorkspaceSlug(name, projectId) {
  const base = slugifyProjectName(name);
  const suffix = String(projectId || "").replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase();
  return suffix ? `${base}-${suffix}` : base;
}
function getDefaultWorkspaceRoot() {
  return trimOrNull(env.PROJECT_WORKSPACES_ROOT) || path.join(getConfigDir(), "workspaces");
}
function getDefaultArtifactLocalRoot() {
  return trimOrNull(env.ARTIFACT_LOCAL_DIR) || path.join(getConfigDir(), "captures");
}
function resolveProjectWorkspace(project) {
  const root2 = trimOrNull(project.workspaceLocalRoot) || getDefaultWorkspaceRoot();
  const slug = trimOrNull(project.workspaceSlug) || buildProjectWorkspaceSlug(project.name, project.id);
  return path.join(root2, slug);
}
function joinS3Key(...parts) {
  return parts.map((part) => String(part || "").trim().replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/");
}
function resolveProjectArtifactConfig(project) {
  const workspaceSlug = trimOrNull(project.workspaceSlug) || buildProjectWorkspaceSlug(project.name, project.id);
  const workspacePath = resolveProjectWorkspace(project);
  const setting = trimOrNull(project.artifactBackend) || "env";
  const resolvedBackend = setting === "env" ? env.ARTIFACT_STORAGE_BACKEND : setting;
  if (resolvedBackend === "s3") {
    const bucket = trimOrNull(project.artifactS3Bucket) || trimOrNull(env.ARTIFACT_S3_BUCKET);
    const region = trimOrNull(project.artifactS3Region) || trimOrNull(env.ARTIFACT_S3_REGION) || "us-east-1";
    const endpoint = trimOrNull(project.artifactS3Endpoint) || trimOrNull(env.ARTIFACT_S3_ENDPOINT);
    const basePrefix = trimOrNull(project.artifactS3Prefix) || trimOrNull(env.ARTIFACT_S3_PREFIX) || "open-analyst-artifacts";
    return {
      backend: "s3",
      workspaceSlug,
      workspacePath,
      bucket: bucket || "",
      region,
      endpoint: endpoint || void 0,
      keyPrefix: joinS3Key(basePrefix, workspaceSlug, "artifacts")
    };
  }
  const localRoot = trimOrNull(project.artifactLocalRoot) || getDefaultArtifactLocalRoot();
  return {
    backend: "local",
    workspaceSlug,
    workspacePath,
    localRoot,
    localArtifactDir: path.join(localRoot, workspaceSlug, "artifacts")
  };
}
function buildProjectArtifactUrls(projectId, documentId, apiBaseUrl = "") {
  const base = apiBaseUrl.trim().replace(/\/+$/g, "");
  const relative = `/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/artifact`;
  const artifactUrl = base ? `${base}${relative}` : relative;
  return {
    artifactUrl,
    downloadUrl: `${artifactUrl}?download=1`
  };
}
async function createProject(input) {
  const id = randomUUID();
  const trimmedName = String(input.name || "Untitled Project").trim();
  const [project] = await db.insert(projects).values({
    id,
    userId: DEV_USER_ID,
    name: trimmedName,
    description: String(input.description || "").trim(),
    datastores: Array.isArray(input.datastores) ? input.datastores : [],
    workspaceSlug: buildProjectWorkspaceSlug(trimmedName, id),
    workspaceLocalRoot: typeof input.workspaceLocalRoot === "string" && input.workspaceLocalRoot.trim() ? input.workspaceLocalRoot.trim() : null,
    artifactBackend: input.artifactBackend === "local" || input.artifactBackend === "s3" ? input.artifactBackend : "env",
    artifactLocalRoot: typeof input.artifactLocalRoot === "string" && input.artifactLocalRoot.trim() ? input.artifactLocalRoot.trim() : null,
    artifactS3Bucket: typeof input.artifactS3Bucket === "string" && input.artifactS3Bucket.trim() ? input.artifactS3Bucket.trim() : null,
    artifactS3Region: typeof input.artifactS3Region === "string" && input.artifactS3Region.trim() ? input.artifactS3Region.trim() : null,
    artifactS3Endpoint: typeof input.artifactS3Endpoint === "string" && input.artifactS3Endpoint.trim() ? input.artifactS3Endpoint.trim() : null,
    artifactS3Prefix: typeof input.artifactS3Prefix === "string" && input.artifactS3Prefix.trim() ? input.artifactS3Prefix.trim() : null
  }).returning();
  return project;
}
async function listProjects() {
  return db.select().from(projects).where(eq(projects.userId, DEV_USER_ID)).orderBy(desc(projects.updatedAt));
}
async function getProject(projectId) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  return project;
}
async function updateProject(projectId, updates) {
  const values = { updatedAt: /* @__PURE__ */ new Date() };
  if (typeof updates.name === "string") {
    values.name = updates.name.trim() || void 0;
  }
  if (typeof updates.description === "string") {
    values.description = updates.description.trim();
  }
  if (Array.isArray(updates.datastores)) {
    values.datastores = updates.datastores;
  }
  if (updates.workspaceLocalRoot !== void 0) {
    values.workspaceLocalRoot = typeof updates.workspaceLocalRoot === "string" && updates.workspaceLocalRoot.trim() ? updates.workspaceLocalRoot.trim() : null;
  }
  if (updates.artifactBackend !== void 0) {
    values.artifactBackend = updates.artifactBackend === "local" || updates.artifactBackend === "s3" ? updates.artifactBackend : "env";
  }
  if (updates.artifactLocalRoot !== void 0) {
    values.artifactLocalRoot = typeof updates.artifactLocalRoot === "string" && updates.artifactLocalRoot.trim() ? updates.artifactLocalRoot.trim() : null;
  }
  if (updates.artifactS3Bucket !== void 0) {
    values.artifactS3Bucket = typeof updates.artifactS3Bucket === "string" && updates.artifactS3Bucket.trim() ? updates.artifactS3Bucket.trim() : null;
  }
  if (updates.artifactS3Region !== void 0) {
    values.artifactS3Region = typeof updates.artifactS3Region === "string" && updates.artifactS3Region.trim() ? updates.artifactS3Region.trim() : null;
  }
  if (updates.artifactS3Endpoint !== void 0) {
    values.artifactS3Endpoint = typeof updates.artifactS3Endpoint === "string" && updates.artifactS3Endpoint.trim() ? updates.artifactS3Endpoint.trim() : null;
  }
  if (updates.artifactS3Prefix !== void 0) {
    values.artifactS3Prefix = typeof updates.artifactS3Prefix === "string" && updates.artifactS3Prefix.trim() ? updates.artifactS3Prefix.trim() : null;
  }
  for (const key of Object.keys(values)) {
    if (values[key] === void 0) delete values[key];
  }
  const [project] = await db.update(projects).set(values).where(eq(projects.id, projectId)).returning();
  if (!project) throw new Error(`Project not found: ${projectId}`);
  return project;
}
async function deleteProject(projectId) {
  const deleted = await db.delete(projects).where(eq(projects.id, projectId)).returning({ id: projects.id });
  if (!deleted.length) throw new Error(`Project not found: ${projectId}`);
  return { success: true };
}
const DEFAULTS = {
  activeProjectId: null,
  model: "",
  workingDir: null,
  workingDirType: "local",
  s3Uri: null,
  agentBackend: "strands",
  devLogsEnabled: false
};
function toSettingsData(row) {
  return {
    activeProjectId: row.activeProjectId ?? null,
    model: row.model ?? DEFAULTS.model,
    workingDir: row.workingDir ?? null,
    workingDirType: row.workingDirType ?? DEFAULTS.workingDirType,
    s3Uri: row.s3Uri ?? null,
    agentBackend: row.agentBackend ?? DEFAULTS.agentBackend,
    devLogsEnabled: row.devLogsEnabled ?? DEFAULTS.devLogsEnabled
  };
}
async function getSettings(userId = DEV_USER_ID) {
  const [row] = await db.select().from(settings).where(eq(settings.userId, userId)).limit(1);
  if (!row) return { ...DEFAULTS };
  return toSettingsData(row);
}
async function upsertSettings(updates, userId = DEV_USER_ID) {
  const values = { updatedAt: /* @__PURE__ */ new Date() };
  if (updates.activeProjectId !== void 0)
    values.activeProjectId = updates.activeProjectId;
  if (typeof updates.model === "string") values.model = updates.model;
  if (updates.workingDir !== void 0) values.workingDir = updates.workingDir;
  if (typeof updates.workingDirType === "string")
    values.workingDirType = updates.workingDirType;
  if (updates.s3Uri !== void 0) values.s3Uri = updates.s3Uri;
  if (typeof updates.agentBackend === "string")
    values.agentBackend = updates.agentBackend;
  if (typeof updates.devLogsEnabled === "boolean")
    values.devLogsEnabled = updates.devLogsEnabled;
  const [row] = await db.insert(settings).values({ userId, ...values }).onConflictDoUpdate({
    target: settings.userId,
    set: values
  }).returning();
  return toSettingsData(row);
}
let cachedModels = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1e3;
async function fetchModels() {
  if (cachedModels && Date.now() - cacheTime < CACHE_TTL) {
    return cachedModels;
  }
  const res = await fetch(`${env.LITELLM_BASE_URL}/v1/models`, {
    headers: { Authorization: `Bearer ${env.LITELLM_API_KEY}` }
  });
  if (!res.ok) {
    if (cachedModels) return cachedModels;
    const body = await res.text().catch(() => "");
    throw new Error(`LiteLLM gateway error: ${res.status} ${body}`);
  }
  const data = await res.json();
  cachedModels = (data.data || []).map((m) => ({
    id: m.id,
    name: m.id,
    supportsTools: supportsToolCalling(m.id)
  }));
  cacheTime = Date.now();
  return cachedModels;
}
async function resolveModel(currentModel, options) {
  const requireToolSupport = options?.requireToolSupport === true;
  let models;
  try {
    models = await fetchModels();
  } catch {
    return currentModel;
  }
  if (models.length === 0) return currentModel;
  const current = currentModel ? models.find((m) => m.id === currentModel) : void 0;
  if (current && (!requireToolSupport || current.supportsTools)) {
    return current.id;
  }
  const supported = models.find((model) => model.supportsTools);
  if (requireToolSupport && supported) {
    return supported.id;
  }
  if (current) {
    return current.id;
  }
  return models[0].id;
}
async function loader$t() {
  const [projects2, settings2] = await Promise.all([
    listProjects(),
    getSettings()
  ]);
  const resolvedModel = await resolveModel(settings2.model, { requireToolSupport: true });
  if (resolvedModel !== settings2.model) {
    await upsertSettings({ model: resolvedModel });
  }
  let activeProjectId = settings2.activeProjectId ?? null;
  if (activeProjectId && !projects2.some((p) => p.id === activeProjectId)) {
    activeProjectId = null;
    await upsertSettings({ activeProjectId: null });
  }
  return {
    projects: projects2,
    activeProjectId,
    workingDir: settings2.workingDir || "",
    model: resolvedModel,
    isConfigured: true
  };
}
const _app = UNSAFE_withComponentProps(function AppLayout() {
  const {
    pendingPermission,
    settings: settings2,
    showConfigModal,
    isConfigured,
    appConfig,
    sandboxSyncStatus,
    setShowConfigModal,
    setIsConfigured,
    setAppConfig,
    setWorkingDir,
    setProjects,
    setActiveProjectId
  } = useAppStore();
  const initialized = useRef(false);
  const loaderData = useLoaderData();
  const {
    revalidate
  } = useRevalidator();
  const location = useLocation();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (loaderData) {
      setProjects(loaderData.projects);
      setActiveProjectId(loaderData.activeProjectId);
      setWorkingDir(loaderData.workingDir);
      setIsConfigured(loaderData.isConfigured);
      if (loaderData.model) {
        const current = useAppStore.getState().appConfig;
        if (current && current.model !== loaderData.model) {
          setAppConfig({
            ...current,
            model: loaderData.model
          });
        }
      }
      setHydrated(true);
    }
  }, [loaderData, setProjects, setActiveProjectId, setWorkingDir, setIsConfigured, setAppConfig]);
  useEffect(() => {
    revalidate();
  }, [location.pathname]);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const browserConfig = getBrowserConfig();
    setAppConfig({
      ...browserConfig,
      model: loaderData?.model || browserConfig.model
    });
  }, []);
  useEffect(() => {
    if (settings2.theme === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
  }, [settings2.theme]);
  const handleConfigSave = useCallback(async (newConfig) => {
    const saved = saveBrowserConfig(newConfig);
    await headlessSaveConfig(newConfig);
    setAppConfig(saved);
    revalidate();
  }, [setAppConfig, revalidate]);
  const handleConfigClose = useCallback(() => {
    setShowConfigModal(false);
  }, [setShowConfigModal]);
  return /* @__PURE__ */ jsxs("div", {
    className: "h-screen w-screen flex flex-col overflow-hidden bg-background",
    "data-hydrated": hydrated || void 0,
    children: [/* @__PURE__ */ jsx(TopNav, {}), /* @__PURE__ */ jsxs("div", {
      className: "flex-1 flex overflow-hidden",
      children: [/* @__PURE__ */ jsx(Sidebar, {}), /* @__PURE__ */ jsx("main", {
        className: "flex-1 flex flex-col overflow-hidden bg-background",
        children: /* @__PURE__ */ jsx(Outlet, {})
      })]
    }), pendingPermission && /* @__PURE__ */ jsx(PermissionDialog, {
      permission: pendingPermission
    }), /* @__PURE__ */ jsx(ConfigModal, {
      isOpen: showConfigModal,
      onClose: handleConfigClose,
      onSave: handleConfigSave,
      initialConfig: appConfig,
      isFirstRun: !isConfigured
    }), /* @__PURE__ */ jsx(SandboxSyncToast, {
      status: sandboxSyncStatus
    })]
  });
});
const route1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: _app,
  loader: loader$t
}, Symbol.toStringTag, { value: "Module" }));
async function loader$s() {
  const settings2 = await getSettings();
  if (settings2.activeProjectId) {
    const project = await getProject(settings2.activeProjectId);
    if (project) {
      throw redirect(`/projects/${project.id}`);
    }
  }
  return { noProjects: true };
}
const _app__index = UNSAFE_withComponentProps(function AppIndex() {
  return /* @__PURE__ */ jsx("div", {
    className: "flex-1 flex items-center justify-center",
    children: /* @__PURE__ */ jsxs("div", {
      className: "text-center max-w-sm",
      children: [/* @__PURE__ */ jsx("h1", {
        className: "text-xl font-semibold mb-2",
        children: "Welcome to Open Analyst"
      }), /* @__PURE__ */ jsx("p", {
        className: "text-text-secondary text-sm mb-4",
        children: "Create your first project using the project switcher above to get started."
      })]
    })
  });
});
const route2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: _app__index,
  loader: loader$s
}, Symbol.toStringTag, { value: "Module" }));
function formatRelativeTime(ts) {
  const time = typeof ts === "number" ? ts : new Date(ts).getTime();
  const diff = Date.now() - time;
  if (diff < 6e4) return "just now";
  if (diff < 36e5) return `${Math.floor(diff / 6e4)}m ago`;
  if (diff < 864e5) return `${Math.floor(diff / 36e5)}h ago`;
  return new Date(time).toLocaleDateString();
}
function QuickStartDashboard() {
  const navigate = useNavigate();
  const params = useParams();
  const matches = useMatches();
  const [searchParams, setSearchParams] = useSearchParams();
  const { workingDir, setWorkingDir } = useAppStore();
  const fetcher = useFetcher();
  const taskFetcher = useFetcher();
  const projectId = params.projectId;
  const projectMatch = matches.find(
    (m) => m.id && m.pathname.includes("/projects/")
  );
  const tasks2 = projectMatch?.data?.tasks || [];
  const [prompt, setPrompt] = useState("");
  const [showWorkdirDialog, setShowWorkdirDialog] = useState(false);
  const deepResearch = searchParams.get("deepResearch") === "true";
  const isSubmitting = taskFetcher.state !== "idle";
  useEffect(() => {
    if (taskFetcher.data?.taskId) {
      navigate(`/projects/${projectId}/tasks/${taskFetcher.data.taskId}`);
    }
  }, [taskFetcher.data, navigate, projectId]);
  const handleStartTask = () => {
    const text2 = prompt.trim();
    if (!text2 || isSubmitting) return;
    taskFetcher.submit(
      { projectId, prompt: text2, deepResearch },
      { method: "POST", action: "/api/tasks/create", encType: "application/json" }
    );
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
  const confirmWorkdir = (path2) => {
    if (!path2?.trim()) {
      setShowWorkdirDialog(false);
      return;
    }
    setWorkingDir(path2.trim());
    fetcher.submit(
      { path: path2.trim() },
      { method: "POST", action: "/api/workdir", encType: "application/json" }
    );
    setShowWorkdirDialog(false);
  };
  return /* @__PURE__ */ jsxs("div", { className: "flex-1 overflow-y-auto", children: [
    /* @__PURE__ */ jsxs("div", { className: "max-w-3xl mx-auto px-6 py-12", children: [
      /* @__PURE__ */ jsxs("div", { className: "mb-10", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-xl font-semibold mb-4 text-center", children: "What do you want to work on?" }),
        /* @__PURE__ */ jsxs("div", { className: "relative", children: [
          /* @__PURE__ */ jsx(
            "textarea",
            {
              className: "input text-base py-4 pr-14 min-h-[120px] resize-none rounded-2xl",
              placeholder: "Describe your task…",
              value: prompt,
              onChange: (e) => setPrompt(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleStartTask();
                }
              },
              disabled: isSubmitting
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: handleStartTask,
              disabled: !prompt.trim() || isSubmitting,
              className: "absolute bottom-3 right-3 w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center hover:bg-accent-hover disabled:opacity-40 transition-colors",
              "aria-label": "Start task",
              children: /* @__PURE__ */ jsx(ArrowRight, { className: "w-5 h-5" })
            }
          )
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex items-center gap-3 mt-3", children: /* @__PURE__ */ jsxs(
          "button",
          {
            onClick: toggleDeepResearch,
            className: `tag text-xs ${deepResearch ? "tag-active" : ""}`,
            children: [
              /* @__PURE__ */ jsx(FlaskConical, { className: "w-3.5 h-3.5" }),
              "Deep Research"
            ]
          }
        ) })
      ] }),
      tasks2.length > 0 && /* @__PURE__ */ jsxs("div", { className: "mb-10", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-sm font-medium text-text-muted uppercase tracking-wide mb-3", children: "Recent Tasks" }),
        /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3", children: tasks2.slice(0, 6).map((task) => /* @__PURE__ */ jsxs(
          "button",
          {
            onClick: () => navigate(`/projects/${projectId}/tasks/${task.id}`),
            className: "card card-hover p-4 text-left",
            children: [
              /* @__PURE__ */ jsx("div", { className: "text-sm font-medium truncate mb-1", children: task.title }),
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsx(
                  "span",
                  {
                    className: `badge ${task.status === "running" ? "badge-running" : task.status === "completed" ? "badge-completed" : task.status === "error" ? "badge-error" : "badge-idle"}`,
                    children: task.status
                  }
                ),
                /* @__PURE__ */ jsx("span", { className: "text-xs text-text-muted", children: formatRelativeTime(task.updatedAt) })
              ] })
            ]
          },
          task.id
        )) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-4 text-sm text-text-secondary", children: [
        /* @__PURE__ */ jsxs(
          "button",
          {
            onClick: () => setShowWorkdirDialog(true),
            className: "flex items-center gap-1.5 hover:text-text-primary transition-colors",
            children: [
              /* @__PURE__ */ jsx(FolderOpen, { className: "w-4 h-4" }),
              workingDir || "Set working directory"
            ]
          }
        ),
        /* @__PURE__ */ jsxs(
          "button",
          {
            onClick: () => navigate(`/projects/${projectId}/knowledge`),
            className: "flex items-center gap-1.5 hover:text-text-primary transition-colors",
            children: [
              /* @__PURE__ */ jsx(BookOpen, { className: "w-4 h-4" }),
              "Manage knowledge"
            ]
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsx(
      AlertDialog,
      {
        open: showWorkdirDialog,
        title: "Set working directory",
        inputLabel: "Directory path",
        inputDefaultValue: workingDir || "",
        confirmLabel: "Set",
        onConfirm: confirmWorkdir,
        onCancel: () => setShowWorkdirDialog(false)
      }
    )
  ] });
}
async function createTask(projectId, input = {}) {
  const [task] = await db.insert(tasks).values({
    projectId,
    title: String(input.title || "New Task").trim(),
    type: String(input.type || "chat"),
    status: String(input.status || "idle"),
    cwd: input.cwd || null
  }).returning();
  return task;
}
async function listTasks(projectId) {
  return db.select().from(tasks).where(eq(tasks.projectId, projectId)).orderBy(desc(tasks.updatedAt));
}
async function getTask(taskId) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  return task;
}
async function updateTask(taskId, updates) {
  const values = { updatedAt: /* @__PURE__ */ new Date() };
  if (typeof updates.title === "string") values.title = updates.title.trim();
  if (typeof updates.status === "string") values.status = updates.status;
  if (typeof updates.cwd === "string") values.cwd = updates.cwd;
  if (updates.planSnapshot !== void 0)
    values.planSnapshot = updates.planSnapshot;
  const [task] = await db.update(tasks).set(values).where(eq(tasks.id, taskId)).returning();
  if (!task) throw new Error(`Task not found: ${taskId}`);
  return task;
}
async function deleteTask(taskId) {
  const deleted = await db.delete(tasks).where(eq(tasks.id, taskId)).returning({ id: tasks.id });
  if (!deleted.length) throw new Error(`Task not found: ${taskId}`);
  return { success: true };
}
async function createMessage(taskId, input) {
  const values = {
    taskId,
    role: input.role,
    content: input.content,
    tokenUsage: input.tokenUsage || null
  };
  if (input.id) values.id = input.id;
  const [message] = await db.insert(messages).values(values).returning();
  return message;
}
async function listMessages(taskId) {
  return db.select().from(messages).where(eq(messages.taskId, taskId)).orderBy(asc(messages.timestamp));
}
async function appendTaskEvent(taskId, type, payload = {}) {
  const [event] = await db.insert(taskEvents).values({
    taskId,
    type: String(type || "event"),
    payload
  }).returning();
  return event;
}
const MAX_EMBEDDING_INPUT_CHARS = 12e3;
function cleanText(value) {
  return String(value || "").replace(/\0/g, " ").replace(/\s+/g, " ").trim();
}
function isPlaceholderContent(value) {
  return /^\[(?:Binary file|Generated artifact) stored at .+\]$/.test(value);
}
function isKnowledgeEmbeddingConfigured() {
  return Boolean(env.LITELLM_BASE_URL && env.LITELLM_EMBEDDING_MODEL);
}
function buildKnowledgeEmbeddingText(input) {
  const title = cleanText(input.title || "");
  const content = cleanText(input.content || "");
  const usefulContent = isPlaceholderContent(content) ? "" : content;
  return [title, usefulContent].filter(Boolean).join("\n\n").slice(0, MAX_EMBEDDING_INPUT_CHARS);
}
async function embedKnowledgeTexts(texts) {
  const prepared = texts.map((text2) => cleanText(text2).slice(0, MAX_EMBEDDING_INPUT_CHARS)).filter(Boolean);
  if (!prepared.length) {
    return [];
  }
  if (!isKnowledgeEmbeddingConfigured()) {
    throw new Error(
      "Open Analyst knowledge embeddings require LITELLM_BASE_URL and LITELLM_EMBEDDING_MODEL."
    );
  }
  const res = await fetch(`${env.LITELLM_BASE_URL}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.LITELLM_API_KEY}`
    },
    body: JSON.stringify({
      model: env.LITELLM_EMBEDDING_MODEL,
      input: prepared
    })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Knowledge embedding request failed: ${res.status} ${body}`);
  }
  const payload = await res.json();
  const embeddings = (payload.data || []).map((item) => Array.isArray(item?.embedding) ? item.embedding : null).filter((item) => Array.isArray(item));
  if (embeddings.length !== prepared.length) {
    throw new Error("Knowledge embedding response size mismatch.");
  }
  return embeddings;
}
function cosineSimilarity(a, b) {
  const length = Math.min(a.length, b.length);
  if (!length) return 0;
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let i = 0; i < length; i += 1) {
    const av = Number(a[i] || 0);
    const bv = Number(b[i] || 0);
    dot += av * bv;
    aNorm += av * av;
    bNorm += bv * bv;
  }
  if (!aNorm || !bNorm) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}
async function listCollections(projectId) {
  return db.select().from(collections).where(eq(collections.projectId, projectId)).orderBy(desc(collections.updatedAt));
}
async function createCollection(projectId, input) {
  const [collection] = await db.insert(collections).values({
    projectId,
    name: String(input.name || "Untitled Collection").trim(),
    description: String(input.description || "").trim()
  }).returning();
  return collection;
}
async function getCollection(projectId, collectionId) {
  const [collection] = await db.select().from(collections).where(
    and(
      eq(collections.projectId, projectId),
      eq(collections.id, collectionId)
    )
  ).limit(1);
  return collection;
}
async function ensureCollection(projectId, name, description = "") {
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("Collection name is required");
  const [existing] = await db.select().from(collections).where(
    and(
      eq(collections.projectId, projectId),
      sql`lower(${collections.name}) = lower(${trimmed})`
    )
  ).limit(1);
  if (existing) return existing;
  const [collection] = await db.insert(collections).values({
    projectId,
    name: trimmed,
    description: String(description || "").trim()
  }).returning();
  return collection;
}
async function getCollectionDocumentCounts(projectId) {
  const rows = await db.select({
    collectionId: documents.collectionId,
    count: sql`count(*)::int`
  }).from(documents).where(eq(documents.projectId, projectId)).groupBy(documents.collectionId);
  const counts = {};
  for (const row of rows) {
    if (row.collectionId) {
      counts[row.collectionId] = row.count;
    }
  }
  return counts;
}
async function listDocuments(projectId, collectionId) {
  if (collectionId) {
    return db.select().from(documents).where(
      and(
        eq(documents.projectId, projectId),
        eq(documents.collectionId, collectionId)
      )
    ).orderBy(desc(documents.updatedAt));
  }
  return db.select().from(documents).where(eq(documents.projectId, projectId)).orderBy(desc(documents.updatedAt));
}
async function getDocument(projectId, documentId) {
  const [doc] = await db.select().from(documents).where(
    and(eq(documents.projectId, projectId), eq(documents.id, documentId))
  ).limit(1);
  return doc;
}
async function getDocumentBySourceUri(projectId, sourceUri) {
  const trimmed = String(sourceUri || "").trim();
  if (!trimmed) return void 0;
  const [doc] = await db.select().from(documents).where(
    and(eq(documents.projectId, projectId), eq(documents.sourceUri, trimmed))
  ).limit(1);
  return doc;
}
async function createDocument(projectId, input) {
  const [doc] = await db.insert(documents).values({
    projectId,
    collectionId: input.collectionId || null,
    title: String(input.title || "Untitled Source").trim(),
    sourceType: String(input.sourceType || "manual"),
    sourceUri: String(input.sourceUri || ""),
    storageUri: input.storageUri || null,
    content: String(input.content || ""),
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {}
  }).returning();
  return doc;
}
async function updateDocument(projectId, documentId, input) {
  const [doc] = await db.update(documents).set({
    collectionId: input.collectionId !== void 0 ? input.collectionId || null : void 0,
    title: input.title !== void 0 ? String(input.title || "Untitled Source").trim() : void 0,
    sourceType: String(input.sourceType),
    sourceUri: input.sourceUri !== void 0 ? String(input.sourceUri || "") : void 0,
    storageUri: input.storageUri !== void 0 ? input.storageUri || null : void 0,
    content: input.content !== void 0 ? String(input.content || "") : void 0,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : input.metadata === void 0 ? void 0 : {},
    updatedAt: /* @__PURE__ */ new Date()
  }).where(
    and(eq(documents.projectId, projectId), eq(documents.id, documentId))
  ).returning();
  if (!doc) throw new Error(`Document not found: ${documentId}`);
  return doc;
}
async function updateDocumentMetadata(projectId, documentId, metadata) {
  const [doc] = await db.update(documents).set({
    metadata,
    updatedAt: /* @__PURE__ */ new Date()
  }).where(
    and(eq(documents.projectId, projectId), eq(documents.id, documentId))
  ).returning();
  if (!doc) throw new Error(`Document not found: ${documentId}`);
  return doc;
}
async function updateDocumentEmbedding(projectId, documentId, embedding) {
  const [doc] = await db.update(documents).set({
    embedding,
    updatedAt: /* @__PURE__ */ new Date()
  }).where(
    and(eq(documents.projectId, projectId), eq(documents.id, documentId))
  ).returning();
  if (!doc) throw new Error(`Document not found: ${documentId}`);
  return doc;
}
const STOPWORDS = /* @__PURE__ */ new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "for",
  "to",
  "of",
  "in",
  "on",
  "at",
  "by",
  "with",
  "from",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "that",
  "this",
  "it",
  "as",
  "about",
  "what",
  "which",
  "who",
  "when",
  "where",
  "why",
  "how"
]);
function tokenize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}
function normalizeToken(token) {
  let t = String(token || "").trim().toLowerCase();
  if (t.length > 4 && t.endsWith("ing")) t = t.slice(0, -3);
  if (t.length > 3 && t.endsWith("ed")) t = t.slice(0, -2);
  if (t.length > 3 && t.endsWith("es")) t = t.slice(0, -2);
  if (t.length > 2 && t.endsWith("s")) t = t.slice(0, -1);
  return t;
}
function buildQueryVariants(query) {
  const raw = String(query || "").trim();
  if (!raw) return [];
  const variants = /* @__PURE__ */ new Set([raw]);
  const splitters = /\b(?:and|or|then|vs|versus)\b|[,;]+/gi;
  const parts = raw.split(splitters).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) variants.add(part);
  if (parts.length > 1) variants.add(parts.join(" "));
  return Array.from(variants).slice(0, 6);
}
function tokenizeQuery(query) {
  const base = tokenize(query).map(normalizeToken).filter((t) => t && !STOPWORDS.has(t));
  return Array.from(new Set(base)).slice(0, 32);
}
function extractSnippet(content, queryTokens) {
  const text2 = String(content || "");
  if (!text2) return "";
  const lower = text2.toLowerCase();
  for (const token of queryTokens) {
    const idx = lower.indexOf(token);
    if (idx >= 0) {
      const start = Math.max(0, idx - 120);
      const end = Math.min(text2.length, idx + 280);
      return text2.slice(start, end);
    }
  }
  return text2.slice(0, 280);
}
async function queryDocuments(projectId, query, options = {}) {
  const limit = Math.min(20, Math.max(1, Number(options.limit || 8)));
  const docs = await listDocuments(projectId, options.collectionId);
  const variants = buildQueryVariants(query);
  const semanticQueryText = buildKnowledgeEmbeddingText({
    title: query,
    content: query
  });
  let queryEmbedding = null;
  if (semanticQueryText && isKnowledgeEmbeddingConfigured()) {
    try {
      const [embedding] = await embedKnowledgeTexts([semanticQueryText]);
      queryEmbedding = embedding || null;
    } catch {
      queryEmbedding = null;
    }
  }
  const df = /* @__PURE__ */ new Map();
  const tokenizedDocs = docs.map((doc) => {
    const tokens = tokenize(`${doc.title || ""} ${doc.content || ""}`).map(normalizeToken).filter(Boolean);
    const unique = new Set(tokens);
    for (const token of unique) {
      df.set(token, (df.get(token) || 0) + 1);
    }
    return { doc, tokens, text: `${doc.title || ""} ${doc.content || ""}`.toLowerCase() };
  });
  const aggregated = /* @__PURE__ */ new Map();
  for (const variant of variants) {
    const queryTokens = tokenizeQuery(variant);
    for (const entry2 of tokenizedDocs) {
      const tf = /* @__PURE__ */ new Map();
      for (const token of entry2.tokens) {
        tf.set(token, (tf.get(token) || 0) + 1);
      }
      let score = 0;
      for (const token of queryTokens) {
        const termFreq = tf.get(token) || 0;
        if (!termFreq) continue;
        const docFreq = df.get(token) || 1;
        const idf = Math.log(1 + docs.length / docFreq);
        score += termFreq * idf;
      }
      const loweredQuery = variant.toLowerCase();
      if (loweredQuery && entry2.text.includes(loweredQuery)) score += 3;
      if (score <= 0) continue;
      const existing = aggregated.get(entry2.doc.id) || {
        doc: entry2.doc,
        score: 0,
        snippetTokens: []
      };
      existing.score = Math.max(existing.score, score);
      existing.snippetTokens = queryTokens;
      aggregated.set(entry2.doc.id, existing);
    }
  }
  if (queryEmbedding) {
    for (const doc of docs) {
      const embedding = Array.isArray(doc.embedding) ? doc.embedding : null;
      if (!embedding?.length) continue;
      const semanticScore = cosineSimilarity(queryEmbedding, embedding);
      if (semanticScore <= 0) continue;
      const existing = aggregated.get(doc.id) || {
        doc,
        score: 0,
        snippetTokens: tokenizeQuery(query)
      };
      existing.score = Math.max(existing.score, semanticScore * 8);
      aggregated.set(doc.id, existing);
    }
  }
  const scored = Array.from(aggregated.values()).sort((a, b) => b.score - a.score).slice(0, limit).map(({ doc, score, snippetTokens }) => ({
    id: doc.id,
    title: doc.title,
    sourceUri: doc.sourceUri,
    score: Number(score.toFixed(3)),
    snippet: extractSnippet(doc.content || "", snippetTokens),
    metadata: doc.metadata || {}
  }));
  return {
    query,
    queryVariants: variants,
    totalCandidates: docs.length,
    results: scored
  };
}
async function loader$r({ params }) {
  const project = await getProject(params.projectId);
  if (!project) {
    throw redirect("/");
  }
  await upsertSettings({ activeProjectId: params.projectId });
  const [tasks2, collections2] = await Promise.all([
    listTasks(params.projectId),
    listCollections(params.projectId)
  ]);
  return { projectId: params.projectId, tasks: tasks2, collections: collections2 };
}
const _app_projects_$projectId = UNSAFE_withComponentProps(function ProjectRoute() {
  const {
    projectId
  } = useLoaderData();
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
  useEffect(() => {
    setActiveProjectId(projectId);
  }, [projectId, setActiveProjectId]);
  return /* @__PURE__ */ jsx(QuickStartDashboard, {});
});
const route3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: _app_projects_$projectId,
  loader: loader$r
}, Symbol.toStringTag, { value: "Module" }));
function appendText(blocks, text2) {
  if (!text2) return blocks;
  const next = [...blocks];
  const last = next[next.length - 1];
  if (last?.type === "text") {
    next[next.length - 1] = {
      ...last,
      text: `${last.text}${text2}`
    };
    return next;
  }
  next.push({ type: "text", text: text2 });
  return next;
}
function appendStatus(blocks, event) {
  const text2 = String(event.text || event.error || "").trim();
  if (!text2) return blocks;
  const block = {
    type: "status",
    status: event.status || (event.error ? "error" : "running"),
    text: text2,
    phase: event.phase
  };
  const last = blocks[blocks.length - 1];
  if (last?.type === "status" && last.status === block.status && last.phase === block.phase) {
    return [...blocks.slice(0, -1), block];
  }
  return [...blocks, block];
}
function appendToolStart(blocks, event) {
  if (!event.toolUseId || !event.toolName) return blocks;
  const exists = blocks.some(
    (block) => block.type === "tool_use" && block.id === event.toolUseId
  );
  if (exists) return blocks;
  return [
    ...blocks,
    {
      type: "tool_use",
      id: event.toolUseId,
      name: event.toolName,
      input: event.toolInput || {}
    }
  ];
}
const ARTIFACT_META_RE = /<!-- ARTIFACT_META (.*?) -->/g;
function extractArtifactMeta(output) {
  const artifacts = [];
  const cleanOutput = output.replace(ARTIFACT_META_RE, (_match, json) => {
    try {
      artifacts.push(JSON.parse(json));
    } catch {
    }
    return "";
  }).trim();
  return { cleanOutput, artifacts };
}
function appendToolResult(blocks, event) {
  if (!event.toolUseId) return blocks;
  const rawOutput = String(event.toolOutput || event.error || "").trim();
  const { cleanOutput, artifacts } = extractArtifactMeta(rawOutput);
  const result = {
    type: "tool_result",
    toolUseId: event.toolUseId,
    content: cleanOutput,
    isError: (event.toolStatus || event.status) === "error" || Boolean(event.error),
    ...artifacts.length > 0 ? { artifacts } : {}
  };
  const exists = blocks.some(
    (block) => block.type === "tool_result" && block.toolUseId === event.toolUseId
  );
  if (exists) {
    return blocks.map(
      (block) => block.type === "tool_result" && block.toolUseId === event.toolUseId ? result : block
    );
  }
  return [...blocks, result];
}
function applyChatStreamEvent(blocks, event) {
  switch (event.type) {
    case "status":
      return appendStatus(blocks, event);
    case "text_delta":
      return appendText(blocks, String(event.text || ""));
    case "tool_call_start":
      return appendToolStart(blocks, event);
    case "tool_call_end":
      return appendToolResult(blocks, event);
    case "error":
      return appendStatus(blocks, {
        ...event,
        status: "error",
        text: event.error || event.text || "Run failed"
      });
    default:
      return blocks;
  }
}
function extractFinalAssistantText(blocks) {
  return blocks.filter((block) => block.type === "text").map((block) => block.text).join("");
}
function useChatStream() {
  const [streamingMessage, setStreamingMessage] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef(null);
  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);
  const sendMessage = useCallback(async (opts) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStreamingMessage(null);
    setIsStreaming(true);
    let taskId = opts.taskId || "";
    try {
      const res = await fetch(`${getHeadlessApiBase()}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: opts.prompt,
          projectId: opts.projectId,
          taskId: opts.taskId,
          messages: opts.messages || [],
          collectionId: opts.collectionId,
          deepResearch: Boolean(opts.deepResearch),
          pinnedMcpServerIds: opts.pinnedMcpServerIds || [],
          skipUserMessage: Boolean(opts.skipUserMessage)
        }),
        signal: controller.signal
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === "task_created" && data.taskId) {
                taskId = data.taskId;
              } else if (currentEvent === "status" || currentEvent === "text_delta" || currentEvent === "tool_call_start" || currentEvent === "tool_call_end" || currentEvent === "error") {
                const event = {
                  ...data,
                  type: currentEvent
                };
                startTransition(() => {
                  setStreamingMessage((previous) => ({
                    id: `partial-${taskId || opts.taskId || "new"}`,
                    sessionId: taskId || opts.taskId || "",
                    role: "assistant",
                    content: applyChatStreamEvent(previous?.content || [], event),
                    timestamp: Date.now()
                  }));
                });
              } else if (currentEvent === "done") {
                if (data.taskId) taskId = data.taskId;
              } else if (currentEvent === "error") {
                throw new Error(data.error || "Stream error");
              }
            } catch (e) {
              if (e instanceof Error && e.message !== "Stream error") {
              } else {
                throw e;
              }
            }
            currentEvent = "";
          }
        }
      }
    } catch (err) {
      if (err.name === "AbortError") ;
      else {
        throw err;
      }
    } finally {
      setStreamingMessage(null);
      setIsStreaming(false);
      abortRef.current = null;
    }
    return { taskId };
  }, []);
  return { streamingMessage, isStreaming, sendMessage, stop };
}
const fileLinkButtonClassName = "text-accent hover:text-accent-hover underline underline-offset-2 text-left break-all inline-block";
function getFileLinkButtonClassName() {
  return fileLinkButtonClassName;
}
const boundaryPattern = /[\s\]\[\(\)\{\}<>"'“”‘’。.,，、:;!?：；]/;
const asciiFilenamePattern = /[A-Za-z0-9][A-Za-z0-9._-]*\.[A-Za-z0-9]{1,8}/gi;
const cjkFilenamePattern = new RegExp(
  `(?:^|${boundaryPattern.source})([\\p{Script=Han}0-9_-]+\\.[A-Za-z0-9]{1,8})`,
  "gu"
);
const pathPattern = /(?:[A-Za-z]:\\|\/)[^\n]+?\.[a-z0-9]{1,8}/gi;
function isBoundaryChar(ch) {
  if (!ch) return true;
  return boundaryPattern.test(ch);
}
function tokenHasUrlPrefix(text2, index2) {
  const tokenStart = text2.lastIndexOf(" ", index2) + 1;
  const token = text2.slice(tokenStart, index2);
  return /https?:\/\//i.test(token);
}
function trimTrailingPunctuation(value) {
  return value.replace(/[\]\[\(\)\{\}<>"'“”‘’。.,，、:;!?：；]+$/g, "");
}
function extensionHasLetter(value) {
  const lastDot = value.lastIndexOf(".");
  if (lastDot === -1 || lastDot === value.length - 1) {
    return false;
  }
  const ext = value.slice(lastDot + 1);
  return /[a-z]/i.test(ext);
}
function splitTextByFileMentions(text2) {
  if (!text2) {
    return [{ type: "text", value: "" }];
  }
  const parts = [];
  let cursor = 0;
  const matches = [];
  for (const match of text2.matchAll(pathPattern)) {
    if (match.index === void 0) continue;
    matches.push({ index: match.index, value: match[0], source: "path" });
  }
  for (const match of text2.matchAll(asciiFilenamePattern)) {
    if (match.index === void 0) continue;
    matches.push({ index: match.index, value: match[0], source: "ascii" });
  }
  for (const match of text2.matchAll(cjkFilenamePattern)) {
    if (match.index === void 0 || !match[1]) continue;
    const valueStart = match.index + match[0].length - match[1].length;
    matches.push({ index: valueStart, value: match[1], source: "cjk" });
  }
  matches.sort((a, b) => a.index - b.index);
  for (const match of matches) {
    let value = match.value;
    const index2 = match.index;
    value = trimTrailingPunctuation(value);
    const prev = text2[index2 - 1];
    const next = text2[index2 + value.length];
    if (!isBoundaryChar(prev) || !isBoundaryChar(next)) {
      continue;
    }
    if (tokenHasUrlPrefix(text2, index2)) {
      continue;
    }
    if (!extensionHasLetter(value)) {
      continue;
    }
    if (index2 > cursor) {
      parts.push({ type: "text", value: text2.slice(cursor, index2) });
    }
    parts.push({ type: "file", value });
    cursor = index2 + value.length;
  }
  if (cursor < text2.length) {
    parts.push({ type: "text", value: text2.slice(cursor) });
  }
  if (parts.length === 0) {
    parts.push({ type: "text", value: text2 });
  }
  return parts;
}
function splitChildrenByFileMentions(children) {
  const parts = [];
  for (const child of children) {
    if (typeof child === "string") {
      const childParts = splitTextByFileMentions(child);
      parts.push(...childParts);
      continue;
    }
    if (child === null || child === void 0 || child === false) {
      continue;
    }
    parts.push({ type: "node", value: child });
  }
  if (parts.length === 0) {
    parts.push({ type: "text", value: "" });
  }
  return parts;
}
function normalizeContentBlocks(rawContent) {
  if (!Array.isArray(rawContent)) {
    return [{ type: "text", text: String(rawContent ?? "") }];
  }
  return rawContent.flatMap((block) => {
    if (!block || typeof block !== "object") {
      return [{ type: "text", text: String(block ?? "") }];
    }
    if (typeof block.type !== "string") {
      return [{ type: "text", text: JSON.stringify(block) }];
    }
    return [block];
  });
}
function escapeCurrencyMarkdown(text2) {
  return text2.replace(/\$(?=\d)/g, "\\$");
}
function MessageCard({ message, isStreaming }) {
  const isUser = message.role === "user";
  const isQueued = message.localStatus === "queued";
  const isCancelled = message.localStatus === "cancelled";
  const contentBlocks = normalizeContentBlocks(message.content);
  const [copied, setCopied] = useState(false);
  const getTextContent = () => {
    return contentBlocks.filter((block) => block.type === "text").map((block) => block.text).join("\n");
  };
  const handleCopy = async () => {
    const text2 = getTextContent();
    if (text2) {
      await navigator.clipboard.writeText(text2);
      setCopied(true);
      setTimeout(() => setCopied(false), 2e3);
    }
  };
  return /* @__PURE__ */ jsx("div", { className: "animate-fade-in", children: isUser ? (
    // User message
    /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
      /* @__PURE__ */ jsx("div", { className: "text-[11px] text-text-muted text-right pr-1", children: "You" }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-2 justify-end group", children: [
        /* @__PURE__ */ jsxs(
          "div",
          {
            className: `message-user px-4 py-2.5 max-w-[80%] break-words ${isQueued ? "opacity-70 border-dashed" : ""} ${isCancelled ? "opacity-60" : ""}`,
            children: [
              isQueued && /* @__PURE__ */ jsxs("div", { className: "mb-1 flex items-center gap-1 text-[11px] text-text-muted", children: [
                /* @__PURE__ */ jsx(Clock, { className: "w-3 h-3" }),
                /* @__PURE__ */ jsx("span", { children: "Queued" })
              ] }),
              isCancelled && /* @__PURE__ */ jsxs("div", { className: "mb-1 flex items-center gap-1 text-[11px] text-text-muted", children: [
                /* @__PURE__ */ jsx(XCircle, { className: "w-3 h-3" }),
                /* @__PURE__ */ jsx("span", { children: "Canceled" })
              ] }),
              contentBlocks.length === 0 ? /* @__PURE__ */ jsx("span", { className: "text-text-muted italic", children: "Empty message" }) : contentBlocks.map((block, index2) => /* @__PURE__ */ jsx(
                ContentBlockView,
                {
                  block,
                  isUser,
                  isStreaming
                },
                index2
              ))
            ]
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: handleCopy,
            className: "mt-1 w-6 h-6 flex items-center justify-center rounded-md bg-surface-muted hover:bg-surface-active transition-all opacity-0 group-hover:opacity-100 flex-shrink-0",
            title: "Copy message",
            children: copied ? /* @__PURE__ */ jsx(Check, { className: "w-3 h-3 text-success" }) : /* @__PURE__ */ jsx(Copy, { className: "w-3 h-3 text-text-muted" })
          }
        )
      ] }),
      message.timestamp && /* @__PURE__ */ jsx("div", { className: "text-[11px] text-text-muted text-right pr-1", children: /* @__PURE__ */ jsx("span", { suppressHydrationWarning: true, children: formatRelativeTime(message.timestamp) }) })
    ] })
  ) : (
    // Assistant message — skip empty text blocks
    /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 text-[11px] text-text-muted", children: [
        /* @__PURE__ */ jsx(Sparkles, { className: "w-3 h-3" }),
        /* @__PURE__ */ jsx("span", { children: "Assistant" }),
        message.timestamp && /* @__PURE__ */ jsxs("span", { suppressHydrationWarning: true, children: [
          "· ",
          formatRelativeTime(message.timestamp)
        ] })
      ] }),
      contentBlocks.filter((block) => block.type !== "text" || block.text).map((block, index2) => /* @__PURE__ */ jsx(
        ContentBlockView,
        {
          block,
          isUser,
          isStreaming,
          allBlocks: contentBlocks,
          message
        },
        index2
      )),
      contentBlocks.length === 0 && /* @__PURE__ */ jsx("div", { className: "text-sm text-text-muted italic", children: "Empty message" })
    ] })
  ) });
}
function ContentBlockView({
  block,
  isUser,
  isStreaming,
  allBlocks,
  message
}) {
  const { workingDir } = useAppStore();
  const currentWorkingDir = workingDir;
  const resolveFilePath = (value) => {
    if (/^(?:[A-Za-z]:\\|\\\\|\/)/.test(value)) {
      return value;
    }
    if (!currentWorkingDir) {
      return value;
    }
    return `${currentWorkingDir.replace(/[\\/]+$/, "")}/${value}`;
  };
  const renderFileButton = (value, key) => /* @__PURE__ */ jsx(
    "button",
    {
      type: "button",
      onClick: () => {
        const resolved = resolveFilePath(value);
        if (navigator?.clipboard?.writeText) {
          void navigator.clipboard.writeText(resolved);
        }
      },
      className: getFileLinkButtonClassName(),
      title: "Copy file path",
      children: value
    },
    key
  );
  const renderFileMentionParts = (parts, keyPrefix) => parts.map((part, partIndex) => {
    const key = `${keyPrefix}-${partIndex}`;
    if (part.type === "file") {
      return renderFileButton(part.value, key);
    }
    if (part.type === "text") {
      return /* @__PURE__ */ jsx("span", { children: part.value }, key);
    }
    if (isValidElement(part.value)) {
      return part.value.key ? part.value : cloneElement(part.value, { key });
    }
    return /* @__PURE__ */ jsx("span", { children: String(part.value) }, key);
  });
  const renderChildrenWithFileLinks = (children, keyPrefix) => {
    const normalized = Array.isArray(children) ? children : [children];
    const parts = splitChildrenByFileMentions(normalized);
    return renderFileMentionParts(parts, keyPrefix);
  };
  switch (block.type) {
    case "text": {
      const textBlock = block;
      const text2 = textBlock.text || "";
      if (!text2) {
        return null;
      }
      if (isUser) {
        return /* @__PURE__ */ jsxs("p", { className: "text-text-primary whitespace-pre-wrap break-words text-left", children: [
          text2,
          isStreaming && /* @__PURE__ */ jsx("span", { className: "inline-block w-2 h-4 bg-accent ml-1 animate-pulse" })
        ] });
      }
      return /* @__PURE__ */ jsxs("div", { className: "prose-chat max-w-none text-text-primary", children: [
        /* @__PURE__ */ jsx(
          ReactMarkdown,
          {
            remarkPlugins: [remarkMath, remarkGfm],
            rehypePlugins: [rehypeKatex],
            components: {
              a({ children, href }) {
                return /* @__PURE__ */ jsx(
                  "a",
                  {
                    href,
                    target: "_blank",
                    rel: "noreferrer",
                    onClick: (event) => {
                      if (!href) {
                        return;
                      }
                      event.preventDefault();
                      window.open(href, "_blank", "noopener,noreferrer");
                    },
                    className: "text-accent hover:text-accent-hover",
                    children
                  }
                );
              },
              blockquote({ children }) {
                return /* @__PURE__ */ jsx("blockquote", { className: "border-l-2 border-accent/40 pl-4 text-text-muted", children });
              },
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || "");
                const isInline = !match;
                if (isInline) {
                  const raw = String(children);
                  const parts = splitTextByFileMentions(raw);
                  if (parts.length === 1 && parts[0].type === "file") {
                    return renderFileButton(parts[0].value);
                  }
                  return /* @__PURE__ */ jsx(
                    "code",
                    {
                      className: "px-1.5 py-0.5 rounded bg-surface-muted text-accent font-mono text-sm",
                      ...props,
                      children
                    }
                  );
                }
                return /* @__PURE__ */ jsx(CodeBlock, { language: match[1], children: String(children).replace(/\n$/, "") });
              },
              p({ children }) {
                return /* @__PURE__ */ jsx("p", { className: "text-left", children: renderChildrenWithFileLinks(children, "p") });
              },
              li({ children }) {
                return /* @__PURE__ */ jsx("li", { className: "text-left", children: renderChildrenWithFileLinks(children, "li") });
              },
              table({ children }) {
                return /* @__PURE__ */ jsx("div", { className: "overflow-x-auto my-3", children: /* @__PURE__ */ jsx("table", { className: "min-w-full border-collapse", children }) });
              },
              th({ children }) {
                return /* @__PURE__ */ jsx("th", { className: "border border-border px-3 py-2 text-left text-sm font-semibold text-text-primary bg-surface-muted", children });
              },
              td({ children }) {
                return /* @__PURE__ */ jsx("td", { className: "border border-border px-3 py-2 text-sm text-text-primary", children });
              },
              input({ checked, ...props }) {
                return /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "checkbox",
                    checked,
                    readOnly: true,
                    className: "mr-2 accent-accent",
                    ...props
                  }
                );
              },
              strong({ children }) {
                return /* @__PURE__ */ jsx("strong", { children: renderChildrenWithFileLinks(children, "strong") });
              },
              em({ children }) {
                return /* @__PURE__ */ jsx("em", { children: renderChildrenWithFileLinks(children, "em") });
              }
            },
            children: escapeCurrencyMarkdown(text2)
          }
        ),
        isStreaming && /* @__PURE__ */ jsx("span", { className: "inline-block w-2 h-4 bg-accent ml-1 animate-pulse" })
      ] });
    }
    case "image": {
      const imageBlock = block;
      const { source } = imageBlock;
      const imageSrc = `data:${source.media_type};base64,${source.data}`;
      return /* @__PURE__ */ jsx("div", { className: `${isUser ? "inline-block" : ""}`, children: /* @__PURE__ */ jsx(
        "img",
        {
          src: imageSrc,
          alt: "Pasted content",
          className: "w-full max-w-full rounded-lg border border-border",
          style: { maxHeight: "600px", objectFit: "contain" }
        }
      ) });
    }
    case "file_attachment": {
      const fileBlock = block;
      return /* @__PURE__ */ jsxs("div", { className: "inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-muted border border-border", children: [
        /* @__PURE__ */ jsx(FileText, { className: "w-4 h-4 text-accent flex-shrink-0" }),
        /* @__PURE__ */ jsx("div", { className: "flex-1 min-w-0", children: /* @__PURE__ */ jsx("p", { className: "text-sm text-text-primary truncate", children: fileBlock.filename }) })
      ] });
    }
    case "tool_use":
      return /* @__PURE__ */ jsx(ToolUseBlock, { block });
    case "tool_result":
      return /* @__PURE__ */ jsx(ToolResultBlock, { block, allBlocks, message });
    case "status":
      return /* @__PURE__ */ jsx(StatusBlock, { block });
    case "thinking":
      return /* @__PURE__ */ jsx("div", { className: "text-sm text-text-muted italic", children: block.thinking });
    default:
      return null;
  }
}
function StatusBlock({ block }) {
  const tone = block.status === "error" ? "border-error/30 bg-error/5 text-error" : block.status === "completed" ? "border-success/30 bg-success/5 text-success" : "border-accent/30 bg-accent/5 text-accent";
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${tone}`,
      children: [
        block.status === "running" ? /* @__PURE__ */ jsx(Loader2, { className: "w-3.5 h-3.5 animate-spin" }) : null,
        /* @__PURE__ */ jsx("span", { children: block.text })
      ]
    }
  );
}
function ToolUseBlock({ block }) {
  const [expanded, setExpanded] = useState(false);
  if (block.name === "AskUserQuestion") {
    return /* @__PURE__ */ jsx(AskUserQuestionBlock, { block });
  }
  if (block.name === "TodoWrite") {
    return /* @__PURE__ */ jsx(TodoWriteBlock, { block });
  }
  const getToolTitle = (name) => {
    if (name.startsWith("mcp__")) {
      const match = name.match(/^mcp__(.+?)__(.+)$/);
      if (match) {
        const toolName = match[2];
        return `Using ${toolName}`;
      }
      return `Using MCP tool`;
    }
    const titles = {
      Bash: "Running command",
      Read: "Reading file",
      Write: "Writing file",
      Edit: "Editing file",
      Glob: "Searching files",
      Grep: "Searching content",
      WebFetch: "Fetching URL",
      WebSearch: "Searching web",
      TodoRead: "Reading todo list",
      TodoWrite: "Updating todo list",
      read_file: "Reading file",
      write_file: "Writing file",
      edit_file: "Editing file",
      list_directory: "Listing directory",
      glob: "Searching files",
      grep: "Searching content",
      execute_command: "Running command",
      generate_file: "Generating file"
    };
    return titles[name] || `Using ${name}`;
  };
  const isMCPTool = block.name.startsWith("mcp__");
  const mcpServerName = isMCPTool ? block.name.match(/^mcp__(.+?)__/)?.[1] : null;
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: `rounded-xl border overflow-hidden bg-surface ${isMCPTool ? "border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-transparent" : "border-border"}`,
      children: [
        /* @__PURE__ */ jsxs(
          "button",
          {
            onClick: () => setExpanded(!expanded),
            className: `w-full px-4 py-3 flex items-center gap-3 transition-colors ${isMCPTool ? "bg-purple-500/10 hover:bg-purple-500/20" : "bg-surface-muted hover:bg-surface-active"}`,
            children: [
              /* @__PURE__ */ jsx(
                "div",
                {
                  className: `w-6 h-6 rounded-lg flex items-center justify-center ${isMCPTool ? "bg-purple-500/20" : "bg-accent-muted"}`,
                  children: isMCPTool ? /* @__PURE__ */ jsx(Plug, { className: "w-3.5 h-3.5 text-purple-500" }) : /* @__PURE__ */ jsx(Terminal, { className: "w-3.5 h-3.5 text-accent" })
                }
              ),
              /* @__PURE__ */ jsxs("div", { className: "flex-1 text-left", children: [
                /* @__PURE__ */ jsx("span", { className: "font-medium text-sm text-text-primary", children: getToolTitle(block.name) }),
                isMCPTool && mcpServerName && /* @__PURE__ */ jsx("span", { className: "ml-2 px-1.5 py-0.5 text-xs rounded bg-purple-500/20 text-purple-500", children: mcpServerName })
              ] }),
              expanded ? /* @__PURE__ */ jsx(ChevronDown, { className: "w-4 h-4 text-text-muted" }) : /* @__PURE__ */ jsx(ChevronRight, { className: "w-4 h-4 text-text-muted" })
            ]
          }
        ),
        expanded && /* @__PURE__ */ jsx("div", { className: "p-4 space-y-4 bg-surface", children: /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("p", { className: "text-xs font-medium text-text-muted mb-2", children: "Request" }),
          /* @__PURE__ */ jsx("pre", { className: "code-block text-xs", children: JSON.stringify(block.input, null, 2) })
        ] }) })
      ]
    }
  );
}
function TodoWriteBlock({ block }) {
  const [expanded, setExpanded] = useState(true);
  const todos = block.input?.todos || [];
  const completedCount = todos.filter((t) => t.status === "completed").length;
  const totalCount = todos.length;
  const progress = totalCount > 0 ? completedCount / totalCount * 100 : 0;
  const inProgressItem = todos.find((t) => t.status === "in_progress");
  const getStatusIcon = (status) => {
    switch (status) {
      case "completed":
        return /* @__PURE__ */ jsx(CheckSquare, { className: "w-4 h-4 text-success" });
      case "in_progress":
        return /* @__PURE__ */ jsx(Loader2, { className: "w-4 h-4 text-accent animate-spin" });
      case "cancelled":
        return /* @__PURE__ */ jsx(XCircle, { className: "w-4 h-4 text-text-muted" });
      default:
        return /* @__PURE__ */ jsx(Square, { className: "w-4 h-4 text-text-muted" });
    }
  };
  const getStatusStyle = (status) => {
    switch (status) {
      case "completed":
        return "text-text-muted line-through";
      case "in_progress":
        return "text-accent font-medium";
      case "cancelled":
        return "text-text-muted line-through opacity-60";
      default:
        return "text-text-primary";
    }
  };
  if (todos.length === 0) {
    return null;
  }
  return /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-border overflow-hidden bg-surface", children: [
    /* @__PURE__ */ jsxs(
      "button",
      {
        onClick: () => setExpanded(!expanded),
        className: "w-full px-4 py-3 flex items-center gap-3 bg-surface-muted hover:bg-surface-active transition-colors",
        children: [
          /* @__PURE__ */ jsx("div", { className: "w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center", children: /* @__PURE__ */ jsx(ListTodo, { className: "w-3.5 h-3.5 text-blue-500" }) }),
          /* @__PURE__ */ jsxs("div", { className: "flex-1 text-left", children: [
            /* @__PURE__ */ jsx("span", { className: "font-medium text-sm text-text-primary", children: "Task Progress" }),
            inProgressItem && /* @__PURE__ */ jsxs("span", { className: "text-xs text-text-muted ml-2", children: [
              "— ",
              inProgressItem.activeForm || inProgressItem.content
            ] })
          ] }),
          /* @__PURE__ */ jsxs("span", { className: "text-xs font-medium text-text-muted mr-2", children: [
            completedCount,
            "/",
            totalCount
          ] }),
          expanded ? /* @__PURE__ */ jsx(ChevronDown, { className: "w-4 h-4 text-text-muted" }) : /* @__PURE__ */ jsx(ChevronRight, { className: "w-4 h-4 text-text-muted" })
        ]
      }
    ),
    /* @__PURE__ */ jsx("div", { className: "h-0.5 bg-surface-muted", children: /* @__PURE__ */ jsx(
      "div",
      {
        className: "h-full bg-gradient-to-r from-blue-500 to-accent transition-all duration-500",
        style: { width: `${progress}%` }
      }
    ) }),
    expanded && /* @__PURE__ */ jsx("div", { className: "p-3 space-y-1", children: todos.map((todo, index2) => /* @__PURE__ */ jsxs(
      "div",
      {
        className: `flex items-start gap-2.5 px-2 py-1.5 rounded-lg transition-colors ${todo.status === "in_progress" ? "bg-accent/5" : ""}`,
        children: [
          /* @__PURE__ */ jsx("div", { className: "mt-0.5 flex-shrink-0", children: getStatusIcon(todo.status) }),
          /* @__PURE__ */ jsx("span", { className: `text-sm leading-relaxed ${getStatusStyle(todo.status)}`, children: todo.content })
        ]
      },
      todo.id || index2
    )) })
  ] });
}
function AskUserQuestionBlock({ block }) {
  const { pendingQuestion, setPendingQuestion } = useAppStore();
  const respondToQuestion = useCallback(
    (_questionId, _answer) => {
      setPendingQuestion(null);
    },
    [setPendingQuestion]
  );
  const [selections, setSelections] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const questions = block.input?.questions || [];
  const isPending = pendingQuestion?.toolUseId === block.id;
  const isAnswered = submitted || !isPending;
  const handleOptionToggle = (questionIdx, label, multiSelect) => {
    if (isAnswered) return;
    setSelections((prev) => {
      const current = prev[questionIdx] || [];
      if (multiSelect) {
        if (current.includes(label)) {
          return { ...prev, [questionIdx]: current.filter((l) => l !== label) };
        } else {
          return { ...prev, [questionIdx]: [...current, label] };
        }
      } else {
        return { ...prev, [questionIdx]: [label] };
      }
    });
  };
  const handleSubmit = () => {
    if (!pendingQuestion || submitted) return;
    const answersJson = JSON.stringify(selections);
    console.log("[AskUserQuestionBlock] Submitting answer:", answersJson);
    respondToQuestion(pendingQuestion.questionId, answersJson);
    setSubmitted(true);
  };
  const canSubmit = isPending && !submitted && questions.every((q, idx) => {
    if (q.options && q.options.length > 0) {
      return (selections[idx] || []).length > 0;
    }
    return true;
  });
  const getOptionLetter = (index2) => String.fromCharCode(65 + index2);
  if (questions.length === 0) {
    return /* @__PURE__ */ jsx("div", { className: "rounded-xl border border-border bg-surface p-4", children: /* @__PURE__ */ jsx("span", { className: "text-text-muted", children: "No questions" }) });
  }
  return /* @__PURE__ */ jsxs("div", { className: "rounded-xl border-2 border-accent/30 bg-gradient-to-br from-accent/5 to-transparent overflow-hidden", children: [
    /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 bg-accent/10 border-b border-accent/20 flex items-center gap-3", children: [
      /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center", children: /* @__PURE__ */ jsx(HelpCircle, { className: "w-4 h-4 text-accent" }) }),
      /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("span", { className: "font-medium text-sm text-text-primary", children: isAnswered ? "Questions answered" : "Please answer to continue" }) }),
      isAnswered && /* @__PURE__ */ jsx(CheckCircle2, { className: "w-5 h-5 text-success ml-auto" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "p-4 space-y-5", children: questions.map((q, qIdx) => /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
      q.header && /* @__PURE__ */ jsx("span", { className: "inline-block px-2 py-0.5 bg-accent/10 text-accent text-xs font-semibold rounded uppercase tracking-wide", children: q.header }),
      /* @__PURE__ */ jsx("p", { className: "text-text-primary font-medium text-sm", children: q.question }),
      q.options && q.options.length > 0 && /* @__PURE__ */ jsx("div", { className: "space-y-1.5 mt-2", children: q.options.map((option, optIdx) => {
        const isSelected = (selections[qIdx] || []).includes(option.label);
        const letter = getOptionLetter(optIdx);
        return /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => handleOptionToggle(qIdx, option.label, q.multiSelect || false),
            disabled: isAnswered,
            className: `w-full p-3 rounded-lg border text-left transition-all ${isAnswered ? isSelected ? "border-accent/50 bg-accent/10 cursor-default" : "border-border-subtle bg-surface-muted cursor-default opacity-60" : isSelected ? "border-accent bg-accent/10 hover:bg-accent/15" : "border-border-subtle bg-surface hover:border-border-default hover:bg-surface-muted"}`,
            children: /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-2.5", children: [
              /* @__PURE__ */ jsx(
                "div",
                {
                  className: `w-6 h-6 rounded flex items-center justify-center flex-shrink-0 text-xs font-semibold ${isSelected ? "bg-accent text-white" : "bg-border-subtle text-text-secondary"}`,
                  children: isSelected ? /* @__PURE__ */ jsx(Check, { className: "w-3.5 h-3.5" }) : letter
                }
              ),
              /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
                /* @__PURE__ */ jsx(
                  "span",
                  {
                    className: `text-sm ${isSelected ? "text-accent font-medium" : "text-text-primary"}`,
                    children: option.label
                  }
                ),
                option.description && /* @__PURE__ */ jsx("p", { className: "text-xs text-text-muted mt-0.5", children: option.description })
              ] })
            ] })
          },
          optIdx
        );
      }) })
    ] }, qIdx)) }),
    isPending && !submitted && /* @__PURE__ */ jsx("div", { className: "px-4 pb-4", children: /* @__PURE__ */ jsxs(
      "button",
      {
        onClick: handleSubmit,
        disabled: !canSubmit,
        className: `w-full py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all ${canSubmit ? "bg-accent text-white hover:bg-accent-hover" : "bg-surface-muted text-text-muted cursor-not-allowed"}`,
        children: [
          /* @__PURE__ */ jsx(Send, { className: "w-4 h-4" }),
          "Submit Answers"
        ]
      }
    ) })
  ] });
}
function getArtifactIconColor$1(mimeType) {
  if (mimeType.includes("pdf")) return { icon: FileText, color: "text-red-500" };
  if (mimeType.includes("spreadsheet") || mimeType.includes("csv") || mimeType.includes("excel"))
    return { icon: FileSpreadsheet, color: "text-green-500" };
  if (mimeType.startsWith("image/")) return { icon: Image$1, color: "text-purple-500" };
  return { icon: FileText, color: "text-blue-500" };
}
function formatFileSize$1(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function ArtifactCard({ artifact }) {
  const { icon: Icon, color } = getArtifactIconColor$1(artifact.mimeType);
  const handleCardClick = () => {
    useAppStore.getState().openFileViewer(artifact);
  };
  return /* @__PURE__ */ jsxs(
    "div",
    {
      "data-testid": "artifact-card",
      onClick: handleCardClick,
      className: "flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 hover:bg-surface-hover cursor-pointer transition-colors",
      children: [
        /* @__PURE__ */ jsx("div", { className: `w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center ${color}`, children: /* @__PURE__ */ jsx(Icon, { className: "w-4 h-4" }) }),
        /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
          /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-text-primary truncate", children: artifact.title || artifact.filename }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-text-muted", children: formatFileSize$1(artifact.size) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5", children: [
          /* @__PURE__ */ jsx(
            "a",
            {
              href: artifact.artifactUrl,
              target: "_blank",
              rel: "noreferrer",
              onClick: (e) => e.stopPropagation(),
              className: "w-7 h-7 rounded-md flex items-center justify-center hover:bg-surface-muted transition-colors text-text-muted hover:text-accent",
              title: "Preview",
              children: /* @__PURE__ */ jsx(ExternalLink, { className: "w-3.5 h-3.5" })
            }
          ),
          /* @__PURE__ */ jsx(
            "a",
            {
              href: artifact.downloadUrl,
              onClick: (e) => e.stopPropagation(),
              className: "w-7 h-7 rounded-md flex items-center justify-center hover:bg-surface-muted transition-colors text-text-muted hover:text-accent",
              title: "Download",
              children: /* @__PURE__ */ jsx(Download, { className: "w-3.5 h-3.5" })
            }
          )
        ] })
      ]
    }
  );
}
function ToolResultBlock({
  block,
  allBlocks
}) {
  const [expanded, setExpanded] = useState(false);
  const toolUseBlock = allBlocks?.find(
    (b) => b.type === "tool_use" && b.id === block.toolUseId
  );
  const toolName = toolUseBlock?.name;
  toolName?.startsWith("mcp__") || false;
  const generateSummary = (content, isError) => {
    if (isError) {
      if (content.includes("Could not connect to Chrome")) {
        return "✗ Chrome not connected";
      }
      if (content.includes("ECONNREFUSED")) {
        return "✗ Connection refused";
      }
      if (content.includes("timeout")) {
        return "✗ Operation timed out";
      }
      const firstLine2 = content.split("\n")[0];
      return `✗ ${firstLine2.substring(0, 60)}${firstLine2.length > 60 ? "…" : ""}`;
    }
    if (content.includes("Successfully navigated to")) {
      const urlMatch = content.match(/Successfully navigated to (.+)/);
      if (urlMatch) {
        const url = urlMatch[1].trim();
        return `✓ Navigated to ${url.length > 50 ? url.substring(0, 50) + "…" : url}`;
      }
      return "✓ Navigation successful";
    }
    if (content.includes("Page created")) {
      return "✓ New page created";
    }
    if (content.includes("Screenshot saved") || content.includes("screenshot")) {
      return "✓ Screenshot captured";
    }
    if (content.includes("Successfully clicked")) {
      return "✓ Element clicked";
    }
    if (content.includes("Successfully typed")) {
      const textMatch = content.match(/Successfully typed "(.+?)"/);
      if (textMatch) {
        const text2 = textMatch[1];
        return `✓ Typed: ${text2.length > 30 ? text2.substring(0, 30) + "…" : text2}`;
      }
      return "✓ Text entered";
    }
    if (content.includes('"title"') && content.includes('"url"')) {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          return `✓ Found ${parsed.length} open page${parsed.length !== 1 ? "s" : ""}`;
        }
      } catch (e) {
      }
    }
    if (content.trim().startsWith("{") || content.trim().startsWith("[")) {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          return `✓ Returned ${parsed.length} item${parsed.length !== 1 ? "s" : ""}`;
        }
        if (typeof parsed === "object") {
          const keys = Object.keys(parsed);
          if (keys.length <= 3) {
            return `✓ Success (${keys.join(", ")})`;
          }
          return `✓ Success (${keys.length} fields)`;
        }
      } catch (e) {
      }
    }
    const lines = content.trim().split("\n");
    if (lines.length === 1 && lines[0].length < 80) {
      return `✓ ${lines[0]}`;
    }
    if (content.length < 100) {
      return `✓ ${content.trim()}`;
    }
    const firstLine = lines[0].trim();
    if (firstLine.length > 0 && firstLine.length < 60) {
      return `✓ ${firstLine}`;
    }
    return `✓ Success (${content.length} chars, ${lines.length} lines)`;
  };
  const summary = generateSummary(block.content, block.isError || false);
  const hasImages = block.images && block.images.length > 0;
  const hasArtifacts = block.artifacts && block.artifacts.length > 0;
  return /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
    /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-border overflow-hidden bg-surface", children: [
      /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: () => setExpanded(!expanded),
          className: `w-full px-4 py-3 flex items-center gap-3 transition-colors ${block.isError ? "bg-error/10 hover:bg-error/20" : "bg-success/10 hover:bg-success/20"}`,
          children: [
            block.isError ? /* @__PURE__ */ jsx(AlertCircle, { className: "w-5 h-5 text-error" }) : /* @__PURE__ */ jsx(CheckCircle2, { className: "w-5 h-5 text-success" }),
            /* @__PURE__ */ jsxs(
              "span",
              {
                className: `font-medium text-sm flex-1 text-left ${block.isError ? "text-error" : "text-success"}`,
                children: [
                  summary,
                  hasImages && block.images && /* @__PURE__ */ jsxs("span", { className: "ml-2 text-xs text-text-muted", children: [
                    "📸 ",
                    block.images.length,
                    " image",
                    block.images.length > 1 ? "s" : ""
                  ] })
                ]
              }
            ),
            expanded ? /* @__PURE__ */ jsx(ChevronDown, { className: "w-4 h-4 text-text-muted" }) : /* @__PURE__ */ jsx(ChevronRight, { className: "w-4 h-4 text-text-muted" })
          ]
        }
      ),
      expanded && /* @__PURE__ */ jsxs("div", { className: "p-4 bg-surface space-y-4", children: [
        /* @__PURE__ */ jsx("pre", { className: "code-block text-xs whitespace-pre-wrap font-mono", children: block.content }),
        block.images && block.images.length > 0 && /* @__PURE__ */ jsx("div", { className: "space-y-3", children: block.images.map((image, index2) => /* @__PURE__ */ jsx("div", { className: "border border-border rounded-lg overflow-hidden", children: /* @__PURE__ */ jsx(
          "img",
          {
            src: `data:${image.mimeType};base64,${image.data}`,
            alt: `Screenshot ${index2 + 1}`,
            className: "w-full h-auto",
            style: { maxHeight: "600px", objectFit: "contain" }
          }
        ) }, index2)) })
      ] })
    ] }),
    hasArtifacts && block.artifacts.map((artifact) => /* @__PURE__ */ jsx(ArtifactCard, { artifact }, artifact.documentId))
  ] });
}
function CodeBlock({ language, children }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2e3);
  };
  return /* @__PURE__ */ jsxs("div", { className: "relative group my-3", children: [
    /* @__PURE__ */ jsxs("div", { className: "absolute top-2 right-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity", children: [
      /* @__PURE__ */ jsx("span", { className: "text-xs text-text-muted px-2 py-1 rounded bg-surface", children: language }),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: handleCopy,
          className: "w-7 h-7 flex items-center justify-center rounded bg-surface hover:bg-surface-hover transition-colors",
          children: copied ? /* @__PURE__ */ jsx(Check, { className: "w-3.5 h-3.5 text-success" }) : /* @__PURE__ */ jsx(Copy, { className: "w-3.5 h-3.5 text-text-muted" })
        }
      )
    ] }),
    /* @__PURE__ */ jsx("pre", { className: "code-block", children: /* @__PURE__ */ jsx("code", { children }) })
  ] });
}
function getMetadataString(metadata, key) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "";
}
function DocumentPreview({
  projectId,
  document: document2,
  maxTextLength,
  className = ""
}) {
  const mimeType = getMetadataString(document2.metadata, "mimeType");
  const isPdf = mimeType.toLowerCase().includes("pdf") || document2.title.toLowerCase().endsWith(".pdf");
  const metadata = document2.metadata && typeof document2.metadata === "object" ? document2.metadata : {};
  const artifactUrl = getMetadataString(metadata, "artifactUrl") || `/api/projects/${encodeURIComponent(
    projectId
  )}/documents/${encodeURIComponent(document2.id)}/artifact`;
  const downloadUrl = getMetadataString(metadata, "downloadUrl") || `${artifactUrl}?download=1`;
  const previewText = typeof maxTextLength === "number" && maxTextLength > 0 ? (document2.content || "").slice(0, maxTextLength) : document2.content || "";
  const hasArtifact = Boolean(artifactUrl);
  return /* @__PURE__ */ jsxs("div", { className: `space-y-3 ${className}`.trim(), children: [
    isPdf && hasArtifact && /* @__PURE__ */ jsx("div", { className: "rounded-lg border border-border overflow-hidden bg-background-secondary", children: /* @__PURE__ */ jsx(
      "object",
      {
        data: artifactUrl,
        type: "application/pdf",
        className: "w-full h-[480px]",
        children: /* @__PURE__ */ jsxs("div", { className: "p-4 text-sm text-text-secondary", children: [
          "PDF preview unavailable.",
          " ",
          /* @__PURE__ */ jsx(
            "a",
            {
              href: downloadUrl,
              className: "text-accent underline",
              target: "_blank",
              rel: "noreferrer",
              children: "Open or download the file"
            }
          ),
          "."
        ] })
      }
    ) }),
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("div", { className: "text-xs text-text-muted mb-1", children: "Extracted text" }),
      /* @__PURE__ */ jsx("pre", { className: "text-xs text-text-secondary whitespace-pre-wrap max-h-64 overflow-y-auto", children: previewText || "No extracted text available." })
    ] })
  ] });
}
function KnowledgePanel({ projectId, onClose }) {
  const { activeCollectionByProject, setProjectActiveCollection, openFileViewer } = useAppStore();
  const [sourceUrl, setSourceUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);
  const fetcher = useFetcher();
  const collections2 = fetcher.data?.collections ?? [];
  const documents2 = fetcher.data?.documents ?? [];
  const activeCollectionId = activeCollectionByProject[projectId] || collections2[0]?.id || null;
  useEffect(() => {
    const colId = activeCollectionId || "";
    fetcher.load(
      `/api/projects/${projectId}/knowledge${colId ? `?collectionId=${colId}` : ""}`
    );
  }, [projectId, activeCollectionId]);
  const handleCollectionChange = (id) => {
    setProjectActiveCollection(projectId, id);
  };
  const handleImportUrl = async () => {
    const url = sourceUrl.trim();
    if (!url || !activeCollectionId) return;
    setImporting(true);
    try {
      await headlessImportUrl(projectId, url, activeCollectionId);
      setSourceUrl("");
      fetcher.load(
        `/api/projects/${projectId}/knowledge?collectionId=${activeCollectionId}`
      );
    } catch {
    } finally {
      setImporting(false);
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "w-72 border-l border-border bg-surface flex flex-col overflow-hidden shrink-0", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between px-3 h-14 border-b border-border", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsx(BookOpen, { className: "w-4 h-4 text-accent" }),
        /* @__PURE__ */ jsx("span", { className: "text-sm font-medium", children: "Knowledge" })
      ] }),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: onClose,
          className: "w-6 h-6 rounded flex items-center justify-center hover:bg-surface-hover text-text-muted",
          "aria-label": "Close knowledge panel",
          children: /* @__PURE__ */ jsx(X, { className: "w-3.5 h-3.5" })
        }
      )
    ] }),
    /* @__PURE__ */ jsx("div", { className: "px-3 py-2 border-b border-border", children: /* @__PURE__ */ jsxs(
      "select",
      {
        className: "input text-xs py-1.5",
        value: activeCollectionId || "",
        onChange: (e) => handleCollectionChange(e.target.value),
        children: [
          collections2.map((col) => /* @__PURE__ */ jsx("option", { value: col.id, children: col.name }, col.id)),
          collections2.length === 0 && /* @__PURE__ */ jsx("option", { value: "", children: "No collections" })
        ]
      }
    ) }),
    /* @__PURE__ */ jsxs("div", { className: "flex-1 overflow-y-auto px-2 py-2 space-y-0.5", children: [
      documents2.map((doc) => /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: () => {
            const metadata = doc.metadata && typeof doc.metadata === "object" ? doc.metadata : {};
            const artifactUrl = typeof metadata.artifactUrl === "string" && metadata.artifactUrl ? metadata.artifactUrl : doc.storageUri ? `/api/projects/${projectId}/documents/${doc.id}/artifact` : "";
            if (artifactUrl) {
              const downloadUrl = typeof metadata.downloadUrl === "string" && metadata.downloadUrl ? metadata.downloadUrl : `${artifactUrl}?download=1`;
              const docArtifact = {
                documentId: doc.id,
                filename: metadata.filename || doc.title,
                mimeType: metadata.mimeType || "application/octet-stream",
                size: metadata.bytes || 0,
                artifactUrl,
                downloadUrl,
                title: doc.title
              };
              openFileViewer(docArtifact);
              return;
            }
            setPreviewDoc(previewDoc?.id === doc.id ? null : doc);
          },
          className: `w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center gap-2 transition-colors ${previewDoc?.id === doc.id ? "bg-accent-muted" : "hover:bg-surface-hover"}`,
          children: [
            /* @__PURE__ */ jsx(FileText, { className: "w-3.5 h-3.5 text-text-muted shrink-0" }),
            /* @__PURE__ */ jsx("span", { className: "truncate", children: doc.title || "Untitled" })
          ]
        },
        doc.id
      )),
      documents2.length === 0 && /* @__PURE__ */ jsx("p", { className: "text-xs text-text-muted px-2 py-2", children: "No sources yet." })
    ] }),
    previewDoc && /* @__PURE__ */ jsxs("div", { className: "border-t border-border px-3 py-2 max-h-[32rem] overflow-y-auto", children: [
      /* @__PURE__ */ jsx("div", { className: "text-xs font-medium mb-1", children: previewDoc.title }),
      /* @__PURE__ */ jsx(
        DocumentPreview,
        {
          projectId,
          document: previewDoc,
          maxTextLength: 500
        }
      )
    ] }),
    /* @__PURE__ */ jsx("div", { className: "border-t border-border px-3 py-2", children: /* @__PURE__ */ jsxs("div", { className: "flex gap-1.5", children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "url",
          className: "input text-xs py-1.5 px-2",
          placeholder: "Add URL…",
          value: sourceUrl,
          onChange: (e) => setSourceUrl(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleImportUrl();
            }
          }
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          className: "btn btn-secondary px-2 py-1",
          onClick: handleImportUrl,
          disabled: importing,
          "aria-label": "Import URL",
          children: /* @__PURE__ */ jsx(Link2, { className: "w-3.5 h-3.5" })
        }
      )
    ] }) })
  ] });
}
function DocxRenderer({ url }) {
  const [html, setHtml] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        const mammoth = await import("mammoth");
        const result = await mammoth.default.convertToHtml({ arrayBuffer });
        if (!cancelled) setHtml(result.value);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load document");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (error) {
    return /* @__PURE__ */ jsx("div", { className: "p-4 text-sm text-error", children: error });
  }
  if (html === null) {
    return /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-center p-8 text-text-muted", children: [
      /* @__PURE__ */ jsx(Loader2, { className: "w-5 h-5 animate-spin mr-2" }),
      "Loading..."
    ] });
  }
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: "prose prose-sm max-w-none p-4 overflow-auto",
      dangerouslySetInnerHTML: { __html: html }
    }
  );
}
const MAX_ROWS = 1e3;
function normalizeRowValues(values) {
  if (!Array.isArray(values)) return [];
  return values;
}
function XlsxRenderer({ url }) {
  const [sheets, setSheets] = useState(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        const blob = new Blob([arrayBuffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });
        const { default: readXlsxFile, readSheetNames } = await import("read-excel-file/browser");
        const sheetNames = await readSheetNames(blob);
        const parsed = await Promise.all(
          sheetNames.map(async (sheetName) => ({
            name: sheetName,
            rows: (await readXlsxFile(blob, { sheet: sheetName })).map((row) => normalizeRowValues(row))
          }))
        );
        if (!cancelled) setSheets(parsed);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load spreadsheet");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (error) {
    return /* @__PURE__ */ jsx("div", { className: "p-4 text-sm text-error", children: error });
  }
  if (sheets === null) {
    return /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-center p-8 text-text-muted", children: [
      /* @__PURE__ */ jsx(Loader2, { className: "w-5 h-5 animate-spin mr-2" }),
      "Loading..."
    ] });
  }
  const current = sheets[activeSheet];
  if (!current) return null;
  const displayRows = current.rows.slice(0, MAX_ROWS);
  const truncated = current.rows.length > MAX_ROWS;
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col h-full", children: [
    sheets.length > 1 && /* @__PURE__ */ jsx("div", { className: "flex gap-1 px-2 py-1.5 border-b border-border bg-surface-muted overflow-x-auto", children: sheets.map((sheet, i) => /* @__PURE__ */ jsx(
      "button",
      {
        onClick: () => setActiveSheet(i),
        className: `px-2 py-1 rounded text-xs whitespace-nowrap transition-colors ${i === activeSheet ? "bg-accent text-white" : "hover:bg-surface-hover text-text-secondary"}`,
        children: sheet.name
      },
      sheet.name
    )) }),
    /* @__PURE__ */ jsxs("div", { className: "flex-1 overflow-auto p-2", children: [
      /* @__PURE__ */ jsx("table", { className: "w-full text-xs border-collapse", children: /* @__PURE__ */ jsx("tbody", { children: displayRows.map((row, ri) => /* @__PURE__ */ jsx("tr", { className: ri === 0 ? "font-semibold bg-surface-muted" : "border-t border-border", children: row.map((cell, ci) => /* @__PURE__ */ jsx("td", { className: "px-2 py-1 whitespace-nowrap", children: cell != null ? String(cell) : "" }, ci)) }, ri)) }) }),
      truncated && /* @__PURE__ */ jsxs("p", { className: "text-xs text-text-muted text-center py-2", children: [
        "Showing first ",
        MAX_ROWS,
        " of ",
        current.rows.length,
        " rows"
      ] })
    ] })
  ] });
}
function TextRenderer({ url }) {
  const [text2, setText] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        const content = await res.text();
        if (!cancelled) setText(content);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load file");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (error) {
    return /* @__PURE__ */ jsx("div", { className: "p-4 text-sm text-error", children: error });
  }
  if (text2 === null) {
    return /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-center p-8 text-text-muted", children: [
      /* @__PURE__ */ jsx(Loader2, { className: "w-5 h-5 animate-spin mr-2" }),
      "Loading..."
    ] });
  }
  return /* @__PURE__ */ jsx("pre", { className: "p-4 text-xs font-mono whitespace-pre-wrap break-words overflow-auto", children: text2 });
}
function getArtifactIconColor(mimeType) {
  if (mimeType.includes("pdf")) return { icon: FileText, color: "text-red-500" };
  if (mimeType.includes("spreadsheet") || mimeType.includes("csv") || mimeType.includes("excel"))
    return { icon: FileSpreadsheet, color: "text-green-500" };
  if (mimeType.startsWith("image/")) return { icon: Image$1, color: "text-purple-500" };
  return { icon: FileText, color: "text-blue-500" };
}
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function isDocxMime(artifact) {
  return artifact.mimeType.includes("wordprocessingml") || artifact.mimeType === "application/msword" || artifact.filename.endsWith(".docx") || artifact.filename.endsWith(".doc");
}
function isXlsxMime(artifact) {
  return artifact.mimeType.includes("spreadsheetml") || artifact.mimeType.includes("excel") || artifact.mimeType === "text/csv" || artifact.filename.endsWith(".xlsx") || artifact.filename.endsWith(".xls") || artifact.filename.endsWith(".csv");
}
function isTextMime(mimeType) {
  return mimeType.startsWith("text/") || mimeType === "application/json" || mimeType === "application/xml" || mimeType.includes("+xml") || mimeType.includes("+json");
}
function FileContent({ artifact }) {
  if (artifact.mimeType === "application/pdf") {
    return /* @__PURE__ */ jsx(
      "iframe",
      {
        src: artifact.artifactUrl,
        className: "w-full h-full border-0",
        title: artifact.filename
      }
    );
  }
  if (artifact.mimeType.startsWith("image/")) {
    return /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center p-4 overflow-auto h-full", children: /* @__PURE__ */ jsx(
      "img",
      {
        src: artifact.artifactUrl,
        alt: artifact.filename,
        className: "max-w-full max-h-full object-contain"
      }
    ) });
  }
  if (isDocxMime(artifact)) {
    return /* @__PURE__ */ jsx(DocxRenderer, { url: artifact.artifactUrl });
  }
  if (isXlsxMime(artifact)) {
    return /* @__PURE__ */ jsx(XlsxRenderer, { url: artifact.artifactUrl });
  }
  if (isTextMime(artifact.mimeType)) {
    return /* @__PURE__ */ jsx(TextRenderer, { url: artifact.artifactUrl });
  }
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center justify-center h-full gap-4 p-8 text-text-muted", children: [
    /* @__PURE__ */ jsx(FileText, { className: "w-12 h-12" }),
    /* @__PURE__ */ jsx("p", { className: "text-sm", children: "Preview not available for this file type" }),
    /* @__PURE__ */ jsx("p", { className: "text-xs", children: artifact.mimeType }),
    /* @__PURE__ */ jsx(
      "a",
      {
        href: artifact.downloadUrl,
        download: true,
        className: "px-4 py-2 rounded-lg bg-accent text-white text-sm hover:bg-accent-hover transition-colors",
        children: "Download File"
      }
    )
  ] });
}
const MIN_WIDTH = 320;
const MAX_WIDTH = 1200;
const DEFAULT_WIDTH = 480;
function FileViewerPanel({ onOpenKnowledge }) {
  const artifact = useAppStore((s) => s.fileViewerArtifact);
  const closeFileViewer = useAppStore((s) => s.closeFileViewer);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [width]);
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current) return;
      const delta = startX.current - e.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
      setWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);
  if (!artifact) return null;
  const { icon: Icon, color } = getArtifactIconColor(artifact.mimeType);
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: "border-l border-border bg-surface flex flex-col overflow-hidden shrink-0 relative",
      style: { width },
      children: [
        /* @__PURE__ */ jsxs(
          "div",
          {
            onMouseDown: handleMouseDown,
            className: "absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 group flex items-center",
            children: [
              /* @__PURE__ */ jsx("div", { className: "absolute inset-0 hover:bg-accent/20 transition-colors" }),
              /* @__PURE__ */ jsx("div", { className: "absolute left-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-text-muted", children: /* @__PURE__ */ jsx(GripVertical, { className: "w-3 h-3" }) })
            ]
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 px-3 py-2 border-b border-border shrink-0", children: [
          /* @__PURE__ */ jsx("div", { className: `w-7 h-7 rounded-lg bg-surface-muted flex items-center justify-center ${color}`, children: /* @__PURE__ */ jsx(Icon, { className: "w-3.5 h-3.5" }) }),
          /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
            /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-text-primary truncate", children: artifact.title || artifact.filename }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-text-muted", children: formatFileSize(artifact.size) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1", children: [
            onOpenKnowledge && /* @__PURE__ */ jsx(
              "button",
              {
                onClick: onOpenKnowledge,
                className: "w-7 h-7 rounded-md flex items-center justify-center hover:bg-surface-muted transition-colors text-text-muted hover:text-accent",
                title: "Back to Knowledge",
                "aria-label": "Back to Knowledge",
                children: /* @__PURE__ */ jsx(BookOpen, { className: "w-3.5 h-3.5" })
              }
            ),
            /* @__PURE__ */ jsx(
              "a",
              {
                href: artifact.downloadUrl,
                download: true,
                className: "w-7 h-7 rounded-md flex items-center justify-center hover:bg-surface-muted transition-colors text-text-muted hover:text-accent",
                title: "Download",
                children: /* @__PURE__ */ jsx(Download, { className: "w-3.5 h-3.5" })
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: closeFileViewer,
                className: "w-7 h-7 rounded-md flex items-center justify-center hover:bg-surface-hover transition-colors text-text-muted",
                "aria-label": "Close file viewer",
                children: /* @__PURE__ */ jsx(X, { className: "w-3.5 h-3.5" })
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex-1 overflow-y-auto", children: /* @__PURE__ */ jsx(FileContent, { artifact }) })
      ]
    }
  );
}
function ChatView({ taskId, taskTitle, projectId, initialMessages }) {
  const { appConfig, activeCollectionByProject, setProjectActiveCollection, fileViewerArtifact, closeFileViewer } = useAppStore();
  const { streamingMessage, isStreaming, sendMessage, stop } = useChatStream();
  const { revalidate } = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeConnectors, setActiveConnectors] = useState([]);
  const [showConnectorLabel, setShowConnectorLabel] = useState(true);
  const [projectCollections, setProjectCollections] = useState([]);
  const [knowledgePanelOpen, setKnowledgePanelOpen] = useState(
    searchParams.get("panel") === "knowledge"
  );
  const deepResearch = searchParams.get("deepResearch") === "true";
  const collectionParam = searchParams.get("collection");
  const pinnedConnectorIds = (searchParams.get("mcp") || "").split(",").map((item) => item.trim()).filter(Boolean);
  const headerRef = useRef(null);
  const titleRef = useRef(null);
  const connectorMeasureRef = useRef(null);
  const [pastedImages, setPastedImages] = useState([]);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const isUserAtBottomRef = useRef(true);
  const isComposingRef = useRef(false);
  const textareaRef = useRef(null);
  const prevMessageCountRef = useRef(0);
  const prevPartialLengthRef = useRef(0);
  const scrollTimeoutRef = useRef(null);
  const scrollRequestRef = useRef(null);
  const isScrollingRef = useRef(false);
  const messages2 = useMemo(() => {
    return initialMessages.map((m) => ({
      id: m.id,
      sessionId: taskId,
      role: m.role,
      content: Array.isArray(m.content) ? m.content : [{ type: "text", text: String(m.content) }],
      timestamp: typeof m.timestamp === "string" ? new Date(m.timestamp).getTime() : m.timestamp instanceof Date ? m.timestamp.getTime() : Date.now()
    }));
  }, [initialMessages, taskId]);
  const displayedMessages = useMemo(() => {
    if (!streamingMessage) return messages2;
    return [...messages2, streamingMessage];
  }, [messages2, streamingMessage]);
  const scrollToBottom = useRef((behavior = "auto", immediate = false) => {
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
        behavior === "smooth" ? 300 : 50
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
      const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      isUserAtBottomRef.current = distanceToBottom <= 80;
    };
    updateScrollState();
    const onScroll = () => updateScrollState();
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
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
    const messageCount = messages2.length;
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
        const behavior = hasNewMessage ? "smooth" : "auto";
        scrollToBottom(behavior, false);
      } else {
        scrollToBottom("auto", false);
      }
    }
    prevMessageCountRef.current = messageCount;
    prevPartialLengthRef.current = partialLength;
  }, [messages2.length, streamingMessage]);
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const messagesContainer = container.querySelector(".max-w-3xl");
    if (!messagesContainer) return;
    const resizeObserver = new ResizeObserver(() => {
      if (!isScrollingRef.current && isUserAtBottomRef.current) {
        scrollToBottom("auto", false);
      }
    });
    resizeObserver.observe(messagesContainer);
    return () => resizeObserver.disconnect();
  }, [displayedMessages]);
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (scrollRequestRef.current) cancelAnimationFrame(scrollRequestRef.current);
    };
  }, []);
  useEffect(() => {
    textareaRef.current?.focus();
  }, [taskId]);
  const autoStreamedRef = useRef(false);
  useEffect(() => {
    if (autoStreamedRef.current || isStreaming || isSubmitting) return;
    const hasOnlyUserMessage = initialMessages.length === 1 && initialMessages[0].role === "user";
    if (!hasOnlyUserMessage) return;
    autoStreamedRef.current = true;
    const collectionId = collectionParam || "";
    sendMessage({
      prompt: "",
      projectId,
      taskId,
      collectionId,
      pinnedMcpServerIds: pinnedConnectorIds,
      skipUserMessage: true
    }).then(() => revalidate());
  }, [taskId, initialMessages]);
  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageItems = Array.from(items).filter((item) => item.type.startsWith("image/"));
    if (imageItems.length === 0) return;
    e.preventDefault();
    const newImages = [];
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
          mediaType: resizedBlob.type
        });
      } catch (err) {
        console.error("Failed to process pasted image:", err);
      }
    }
    setPastedImages((prev) => [...prev, ...newImages]);
  };
  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };
  const resizeImageIfNeeded = async (blob) => {
    const MAX_BLOB_SIZE = 3.75 * 1024 * 1024;
    if (blob.size <= MAX_BLOB_SIZE) {
      return blob;
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }
        let scale = Math.sqrt(MAX_BLOB_SIZE / blob.size);
        let quality = 0.9;
        const attemptCompress = (currentScale, currentQuality) => {
          canvas.width = Math.floor(img.width * currentScale);
          canvas.height = Math.floor(img.height * currentScale);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          return new Promise((resolveBlob) => {
            canvas.toBlob(
              (compressedBlob) => {
                if (!compressedBlob) {
                  reject(new Error("Failed to compress image"));
                  return;
                }
                if (compressedBlob.size > MAX_BLOB_SIZE && (currentQuality > 0.5 || currentScale > 0.3)) {
                  const newQuality = Math.max(0.5, currentQuality - 0.1);
                  const newScale = currentQuality <= 0.5 ? currentScale * 0.9 : currentScale;
                  attemptCompress(newScale, newQuality).then(resolveBlob);
                } else {
                  resolveBlob(compressedBlob);
                }
              },
              blob.type || "image/jpeg",
              currentQuality
            );
          });
        };
        attemptCompress(scale, quality).then(resolve).catch(reject);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load image"));
      };
      img.src = url;
    });
  };
  const removeImage = (index2) => {
    setPastedImages((prev) => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index2].url);
      updated.splice(index2, 1);
      return updated;
    });
  };
  const removeFile = (index2) => {
    setAttachedFiles((prev) => {
      const updated = [...prev];
      updated.splice(index2, 1);
      return updated;
    });
  };
  const handleFileSelect = async () => {
    try {
      const picker = document.createElement("input");
      picker.type = "file";
      picker.multiple = true;
      picker.onchange = () => {
        const files = Array.from(picker.files || []);
        if (!files.length) return;
        const newFiles = files.map((file) => ({
          name: file.name || "unknown",
          path: "",
          size: file.size || 0,
          type: file.type || "application/octet-stream"
        }));
        setAttachedFiles((prev) => [...prev, ...newFiles]);
      };
      picker.click();
    } catch (error) {
      console.error("[ChatView] Error selecting files:", error);
    }
  };
  useEffect(() => {
    let disposed = false;
    const loadConnectors = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const statuses = await headlessGetMcpServerStatus();
        if (disposed) return;
        const active = statuses?.filter((s) => s.connected && s.toolCount > 0) || [];
        setActiveConnectors(active);
      } catch (err) {
        console.error("Failed to load MCP connectors:", err);
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadConnectors();
      }
    };
    void loadConnectors();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const interval = setInterval(() => {
      void loadConnectors();
    }, 3e4);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(interval);
    };
  }, []);
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    const otherFiles = files.filter((file) => !file.type.startsWith("image/"));
    if (imageFiles.length > 0) {
      const newImages = [];
      for (const file of imageFiles) {
        try {
          const resizedBlob = await resizeImageIfNeeded(file);
          const base64 = await blobToBase64(resizedBlob);
          const url = URL.createObjectURL(resizedBlob);
          newImages.push({ url, base64, mediaType: resizedBlob.type });
        } catch (err) {
          console.error("Failed to process dropped image:", err);
        }
      }
      setPastedImages((prev) => [...prev, ...newImages]);
    }
    if (otherFiles.length > 0) {
      const newFiles = otherFiles.map((file) => ({
        name: file.name,
        path: "",
        size: file.size,
        type: file.type || "application/octet-stream"
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
  const handleSubmit = async (e) => {
    e?.preventDefault();
    const currentPrompt = textareaRef.current?.value || prompt;
    if (!currentPrompt.trim() && pastedImages.length === 0 && attachedFiles.length === 0 || isSubmitting)
      return;
    setIsSubmitting(true);
    try {
      const collectionId = collectionParam || "";
      await sendMessage({
        prompt: currentPrompt.trim(),
        projectId,
        taskId,
        collectionId,
        deepResearch,
        pinnedMcpServerIds: pinnedConnectorIds
      });
      revalidate();
      setPrompt("");
      if (textareaRef.current) {
        textareaRef.current.value = "";
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
  const togglePinnedConnector = (connectorId) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const current = new Set(
          (next.get("mcp") || "").split(",").map((item) => item.trim()).filter(Boolean)
        );
        if (current.has(connectorId)) {
          current.delete(connectorId);
        } else {
          current.add(connectorId);
        }
        if (current.size > 0) {
          next.set("mcp", Array.from(current).join(","));
        } else {
          next.delete("mcp");
        }
        return next;
      },
      { replace: true }
    );
  };
  useEffect(() => {
    if (fileViewerArtifact) {
      setKnowledgePanelOpen(false);
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.delete("panel");
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
        if (next) p.set("panel", "knowledge");
        else p.delete("panel");
        return p;
      },
      { replace: true }
    );
  };
  return /* @__PURE__ */ jsxs("div", { className: "flex-1 flex overflow-hidden", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex-1 flex flex-col overflow-hidden", children: [
      /* @__PURE__ */ jsxs(
        "div",
        {
          ref: headerRef,
          className: "relative border-b border-border bg-surface/80 backdrop-blur-sm",
          children: [
            /* @__PURE__ */ jsxs("div", { className: "grid h-14 grid-cols-[1fr_auto_1fr] items-center px-6", children: [
              /* @__PURE__ */ jsx("div", {}),
              /* @__PURE__ */ jsx(
                "h2",
                {
                  ref: titleRef,
                  className: "font-medium text-text-primary text-center truncate max-w-lg",
                  children: taskTitle
                }
              ),
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 justify-self-end", children: [
                activeConnectors.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
                  /* @__PURE__ */ jsx(
                    "div",
                    {
                      ref: connectorMeasureRef,
                      "aria-hidden": "true",
                      className: "absolute left-0 top-0 -z-10 opacity-0 pointer-events-none",
                      children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 px-2 py-1 rounded-lg border border-amber-500/20", children: [
                        /* @__PURE__ */ jsx(Plug, { className: "w-3.5 h-3.5" }),
                        /* @__PURE__ */ jsx("span", { className: "text-xs font-medium whitespace-nowrap", children: `${activeConnectors.length} connector${activeConnectors.length === 1 ? "" : "s"}` })
                      ] })
                    }
                  ),
                  /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20", children: [
                    /* @__PURE__ */ jsx(Plug, { className: "w-3.5 h-3.5 text-amber-600" }),
                    /* @__PURE__ */ jsx("span", { className: "text-xs text-amber-700 font-medium", children: showConnectorLabel ? `${activeConnectors.length} connector${activeConnectors.length === 1 ? "" : "s"}` : activeConnectors.length })
                  ] })
                ] }),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: toggleKnowledgePanel,
                    className: `w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${knowledgePanelOpen ? "bg-accent-muted text-accent" : "hover:bg-surface-hover text-text-secondary"}`,
                    "aria-label": knowledgePanelOpen ? "Close knowledge panel" : "Open knowledge panel",
                    children: /* @__PURE__ */ jsx(BookOpen, { className: "w-4 h-4" })
                  }
                )
              ] })
            ] }),
            activeConnectors.length > 0 && /* @__PURE__ */ jsx("div", { className: "px-6 pb-3 flex flex-wrap gap-2", children: activeConnectors.map((connector) => {
              const isPinned = pinnedConnectorIds.includes(connector.id);
              return /* @__PURE__ */ jsxs(
                "button",
                {
                  type: "button",
                  onClick: () => togglePinnedConnector(connector.id),
                  className: `inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors ${isPinned ? "border-amber-500/40 bg-amber-500/15 text-amber-800" : "border-border bg-surface text-text-secondary hover:bg-surface-hover"}`,
                  children: [
                    /* @__PURE__ */ jsx(Plug, { className: "w-3.5 h-3.5" }),
                    /* @__PURE__ */ jsx("span", { children: connector.alias || connector.name }),
                    /* @__PURE__ */ jsxs("span", { className: "text-[11px] opacity-70", children: [
                      connector.toolCount,
                      " tools"
                    ] })
                  ]
                },
                connector.id
              );
            }) })
          ]
        }
      ),
      /* @__PURE__ */ jsx("div", { ref: scrollContainerRef, className: "flex-1 overflow-y-auto", children: /* @__PURE__ */ jsxs("div", { className: "max-w-3xl mx-auto py-6 px-4 space-y-4", children: [
        displayedMessages.length === 0 ? /* @__PURE__ */ jsx("div", { className: "text-center py-12 text-text-muted", children: /* @__PURE__ */ jsx("p", { children: "Start a conversation" }) }) : displayedMessages.map((message) => {
          const isStreamingMsg = typeof message.id === "string" && message.id.startsWith("partial-");
          return /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx(MessageCard, { message, isStreaming: isStreamingMsg }) }, message.id);
        }),
        isStreaming && !streamingMessage && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 px-4 py-3 rounded-2xl bg-surface border border-border max-w-fit", children: [
          /* @__PURE__ */ jsx(Loader2, { className: "w-4 h-4 text-accent animate-spin" }),
          /* @__PURE__ */ jsx("span", { className: "text-sm text-text-secondary", children: "Processing..." })
        ] }),
        /* @__PURE__ */ jsx("div", { ref: messagesEndRef })
      ] }) }),
      /* @__PURE__ */ jsx("div", { className: "border-t border-border bg-surface/80 backdrop-blur-sm", children: /* @__PURE__ */ jsx("div", { className: "px-4 py-4", children: /* @__PURE__ */ jsxs(
        "form",
        {
          onSubmit: handleSubmit,
          onDragOver: handleDragOver,
          onDragLeave: handleDragLeave,
          onDrop: handleDrop,
          className: "relative w-full",
          children: [
            pastedImages.length > 0 && /* @__PURE__ */ jsx("div", { className: "grid grid-cols-5 gap-2 mb-3", children: pastedImages.map((img, index2) => /* @__PURE__ */ jsxs("div", { className: "relative group", children: [
              /* @__PURE__ */ jsx(
                "img",
                {
                  src: img.url,
                  alt: `Pasted ${index2 + 1}`,
                  className: "w-full aspect-square object-cover rounded-lg border border-border block"
                }
              ),
              /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  onClick: () => removeImage(index2),
                  className: "absolute -top-1 -right-1 w-5 h-5 rounded-full bg-error text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity",
                  "aria-label": `Remove image ${index2 + 1}`,
                  children: /* @__PURE__ */ jsx(X, { className: "w-3 h-3" })
                }
              )
            ] }, index2)) }),
            attachedFiles.length > 0 && /* @__PURE__ */ jsx("div", { className: "space-y-2 mb-3", children: attachedFiles.map((file, index2) => /* @__PURE__ */ jsxs(
              "div",
              {
                className: "flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-muted border border-border group",
                children: [
                  /* @__PURE__ */ jsx("div", { className: "flex-1 min-w-0", children: /* @__PURE__ */ jsx("p", { className: "text-sm text-text-primary truncate", children: file.name }) }),
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      onClick: () => removeFile(index2),
                      className: "w-6 h-6 rounded-full bg-error/10 hover:bg-error/20 text-error flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity",
                      "aria-label": `Remove file ${file.name}`,
                      children: /* @__PURE__ */ jsx(X, { className: "w-3.5 h-3.5" })
                    }
                  )
                ]
              },
              index2
            )) }),
            /* @__PURE__ */ jsxs(
              "div",
              {
                className: `flex items-end gap-2 p-3 rounded-3xl bg-surface transition-colors ${isDragging ? "ring-2 ring-accent bg-accent/5" : ""}`,
                style: { border: "1px solid rgba(255, 255, 255, 0.1)" },
                children: [
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      onClick: handleFileSelect,
                      className: "w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors",
                      title: "Attach files",
                      "aria-label": "Attach files",
                      children: /* @__PURE__ */ jsx(Plus, { className: "w-5 h-5" })
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    "textarea",
                    {
                      ref: textareaRef,
                      value: prompt,
                      onChange: (e) => setPrompt(e.target.value),
                      onCompositionStart: () => {
                        isComposingRef.current = true;
                      },
                      onCompositionEnd: () => {
                        isComposingRef.current = false;
                      },
                      onPaste: handlePaste,
                      onKeyDown: (e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          if (e.nativeEvent.isComposing || isComposingRef.current || e.keyCode === 229) {
                            return;
                          }
                          e.preventDefault();
                          handleSubmit();
                        }
                      },
                      placeholder: "Type a message...",
                      disabled: isSubmitting,
                      rows: 1,
                      className: "flex-1 resize-none bg-transparent border-none outline-none focus-visible:ring-2 focus-visible:ring-accent rounded text-text-primary placeholder:text-text-muted text-sm py-1.5"
                    }
                  ),
                  /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                    /* @__PURE__ */ jsx("span", { className: "px-2 py-1 text-xs text-text-muted", children: appConfig?.model || "No model" }),
                    isStreaming && /* @__PURE__ */ jsx(
                      "button",
                      {
                        type: "button",
                        onClick: handleStop,
                        className: "w-8 h-8 rounded-lg flex items-center justify-center bg-error/10 text-error hover:bg-error/20 transition-colors",
                        "aria-label": "Stop generation",
                        children: /* @__PURE__ */ jsx(Square, { className: "w-4 h-4" })
                      }
                    ),
                    /* @__PURE__ */ jsx(
                      "button",
                      {
                        type: "submit",
                        disabled: !prompt.trim() && !textareaRef.current?.value.trim() && pastedImages.length === 0 && attachedFiles.length === 0 || isSubmitting,
                        className: "w-8 h-8 rounded-lg flex items-center justify-center bg-accent text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent-hover transition-colors",
                        "aria-label": "Send message",
                        children: /* @__PURE__ */ jsx(Send, { className: "w-4 h-4" })
                      }
                    )
                  ] })
                ]
              }
            ),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-text-muted text-center mt-2", children: "Open Analyst is AI-powered and may make mistakes. Please double-check responses." })
          ]
        }
      ) }) })
    ] }),
    knowledgePanelOpen && /* @__PURE__ */ jsx(KnowledgePanel, { projectId, onClose: toggleKnowledgePanel }),
    fileViewerArtifact && !knowledgePanelOpen && /* @__PURE__ */ jsx(FileViewerPanel, { onOpenKnowledge: () => {
      closeFileViewer();
      toggleKnowledgePanel();
    } })
  ] });
}
async function loader$q({
  params
}) {
  const task = await getTask(params.taskId);
  if (!task || task.projectId !== params.projectId) {
    throw redirect(`/projects/${params.projectId}`);
  }
  const messages2 = await listMessages(params.taskId);
  return { task, messages: messages2 };
}
const _app_projects_$projectId_tasks_$taskId = UNSAFE_withComponentProps(function TaskRoute() {
  const {
    task,
    messages: messages2
  } = useLoaderData();
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
  useEffect(() => {
    setActiveProjectId(task.projectId);
  }, [task.projectId, setActiveProjectId]);
  return /* @__PURE__ */ jsx(ChatView, {
    taskId: task.id,
    taskTitle: task.title ?? "New Task",
    projectId: task.projectId,
    initialMessages: messages2.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp ?? /* @__PURE__ */ new Date()
    }))
  });
});
const route4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: _app_projects_$projectId_tasks_$taskId,
  loader: loader$q
}, Symbol.toStringTag, { value: "Module" }));
function KnowledgeWorkspace() {
  const params = useParams();
  const projectId = params.projectId;
  const { openFileViewer, fileViewerArtifact, closeFileViewer } = useAppStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCollectionId = searchParams.get("collection") || null;
  const setActiveCollectionId = (id) => {
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
  const fetcher = useFetcher();
  const collections2 = fetcher.data?.collections ?? [];
  const documents2 = fetcher.data?.documents ?? [];
  const documentCounts = fetcher.data?.documentCounts ?? {};
  const loading = fetcher.state === "loading" && !fetcher.data;
  useEffect(() => {
    const colId = activeCollectionId || "";
    fetcher.load(
      `/api/projects/${projectId}/knowledge${colId ? `?collectionId=${colId}` : ""}`
    );
  }, [projectId, activeCollectionId]);
  const [showAllCollections, setShowAllCollections] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [ragQuery, setRagQuery] = useState("");
  const [ragResults, setRagResults] = useState([]);
  const [error, setError] = useState(null);
  const reloadKnowledge = useCallback(() => {
    const colId = activeCollectionId || "";
    fetcher.load(
      `/api/projects/${projectId}/knowledge${colId ? `?collectionId=${colId}` : ""}`
    );
  }, [projectId, activeCollectionId]);
  const handleCreateCollection = async (name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) {
      setShowCreateDialog(false);
      return;
    }
    try {
      const col = await headlessCreateCollection(projectId, trimmed);
      setShowCreateDialog(false);
      setActiveCollectionId(col.id);
      reloadKnowledge();
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
      reloadKnowledge();
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
        reloadKnowledge();
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
      const response = await headlessRagQuery(
        projectId,
        q,
        activeCollectionId || void 0
      );
      setRagResults(response.results);
    } catch (err) {
      setError(String(err));
    }
  };
  const collectionNameMap = {};
  for (const col of collections2) {
    collectionNameMap[col.id] = col.name;
  }
  const filteredDocuments = documents2.filter((doc) => {
    if (!sourceFilter) return true;
    const lower = sourceFilter.toLowerCase();
    const title = (doc.title || "").toLowerCase();
    const sourceType = (doc.sourceType || "").toLowerCase();
    const colName = (doc.collectionId ? collectionNameMap[doc.collectionId] || "" : "").toLowerCase();
    return title.includes(lower) || sourceType.includes(lower) || colName.includes(lower);
  });
  const selectedDocument = documents2.find((d) => d.id === selectedDocumentId);
  const buildArtifactMeta = (doc) => {
    const metadata = doc.metadata && typeof doc.metadata === "object" ? doc.metadata : {};
    const artifactUrl = typeof metadata.artifactUrl === "string" && metadata.artifactUrl ? metadata.artifactUrl : `/api/projects/${projectId}/documents/${doc.id}/artifact`;
    const downloadUrl = typeof metadata.downloadUrl === "string" && metadata.downloadUrl ? metadata.downloadUrl : `${artifactUrl}?download=1`;
    return {
      documentId: doc.id,
      filename: metadata.filename || doc.title,
      mimeType: metadata.mimeType || "application/octet-stream",
      size: metadata.bytes || 0,
      artifactUrl,
      downloadUrl,
      title: doc.title
    };
  };
  const COLLECTION_LIMIT = 10;
  const visibleCollections = showAllCollections ? collections2 : collections2.slice(0, COLLECTION_LIMIT);
  const hiddenCount = collections2.length - COLLECTION_LIMIT;
  if (loading) {
    return /* @__PURE__ */ jsxs("div", { className: "flex-1 overflow-y-auto p-6 space-y-4", children: [
      /* @__PURE__ */ jsx("div", { className: "skeleton h-8 w-48" }),
      /* @__PURE__ */ jsx("div", { className: "skeleton h-32 w-full" }),
      /* @__PURE__ */ jsx("div", { className: "skeleton h-32 w-full" })
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { className: "flex-1 flex min-h-0", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex-1 overflow-y-auto p-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "max-w-5xl mx-auto space-y-8", children: [
        error && /* @__PURE__ */ jsxs("div", { className: "text-sm text-error bg-error/10 rounded-lg px-4 py-2", children: [
          error,
          /* @__PURE__ */ jsx("button", { className: "ml-2 underline", onClick: () => setError(null), children: "dismiss" })
        ] }),
        /* @__PURE__ */ jsxs("section", { children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-4", children: [
            /* @__PURE__ */ jsxs("h2", { className: "text-lg font-semibold flex items-center gap-2", children: [
              /* @__PURE__ */ jsx(Database, { className: "w-5 h-5 text-accent" }),
              "Collections"
            ] }),
            /* @__PURE__ */ jsxs(
              "button",
              {
                className: "btn btn-primary text-sm",
                onClick: () => setShowCreateDialog(true),
                children: [
                  /* @__PURE__ */ jsx(Plus, { className: "w-4 h-4" }),
                  "Add Collection"
                ]
              }
            )
          ] }),
          collections2.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "card p-8 text-center", children: [
            /* @__PURE__ */ jsx(Database, { className: "w-8 h-8 text-text-muted mx-auto mb-2" }),
            /* @__PURE__ */ jsx("p", { className: "text-sm text-text-muted", children: "No collections yet. Create one to start organizing your sources." })
          ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3", children: visibleCollections.map((col) => /* @__PURE__ */ jsxs(
              "button",
              {
                onClick: () => setActiveCollectionId(col.id),
                className: `card card-hover p-4 text-left ${activeCollectionId === col.id ? "ring-2 ring-accent" : ""}`,
                children: [
                  /* @__PURE__ */ jsx("div", { className: "text-sm font-medium truncate mb-1", children: col.name }),
                  col.description && /* @__PURE__ */ jsx("p", { className: "text-xs text-text-muted line-clamp-2 mb-2", children: col.description }),
                  /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                    /* @__PURE__ */ jsxs("span", { className: "badge badge-idle", children: [
                      documentCounts[col.id] || 0,
                      " sources"
                    ] }),
                    col.updatedAt && /* @__PURE__ */ jsx("span", { className: "text-xs text-text-muted", suppressHydrationWarning: true, children: formatRelativeTime(col.updatedAt) })
                  ] })
                ]
              },
              col.id
            )) }),
            !showAllCollections && hiddenCount > 0 && /* @__PURE__ */ jsx("div", { className: "mt-3 text-center", children: /* @__PURE__ */ jsxs(
              "button",
              {
                className: "btn btn-secondary text-sm",
                onClick: () => setShowAllCollections(true),
                children: [
                  "Show ",
                  hiddenCount,
                  " more collections"
                ]
              }
            ) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("section", { children: [
          /* @__PURE__ */ jsxs("h2", { className: "text-lg font-semibold mb-4 flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(FileText, { className: "w-5 h-5 text-accent" }),
            "All Sources"
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mb-4", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                className: "input text-sm py-2 flex-1",
                placeholder: "Filter sources…",
                value: sourceFilter,
                onChange: (e) => setSourceFilter(e.target.value)
              }
            ),
            activeCollectionId && /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "url",
                  className: "input text-sm py-2 w-48",
                  placeholder: "Import URL…",
                  value: sourceUrl,
                  onChange: (e) => setSourceUrl(e.target.value),
                  onKeyDown: (e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleImportUrl();
                    }
                  }
                }
              ),
              /* @__PURE__ */ jsx(
                "button",
                {
                  className: "btn btn-secondary px-3",
                  onClick: handleImportUrl,
                  disabled: uploading,
                  "aria-label": "Import URL",
                  children: /* @__PURE__ */ jsx(Link2, { className: "w-4 h-4" })
                }
              ),
              /* @__PURE__ */ jsx(
                "button",
                {
                  className: "btn btn-secondary px-3",
                  onClick: handleImportFiles,
                  disabled: uploading,
                  "aria-label": "Upload files",
                  children: /* @__PURE__ */ jsx(Upload, { className: "w-4 h-4" })
                }
              )
            ] }) })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "card overflow-hidden", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-sm", children: [
            /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { className: "border-b border-border bg-surface-muted", children: [
              /* @__PURE__ */ jsx("th", { className: "text-left px-4 py-2.5 font-medium text-text-muted", children: "Title" }),
              /* @__PURE__ */ jsx("th", { className: "text-left px-4 py-2.5 font-medium text-text-muted", children: "Collection" }),
              /* @__PURE__ */ jsx("th", { className: "text-left px-4 py-2.5 font-medium text-text-muted", children: "Type" }),
              /* @__PURE__ */ jsx("th", { className: "text-left px-4 py-2.5 font-medium text-text-muted", children: "Date Added" })
            ] }) }),
            /* @__PURE__ */ jsx("tbody", { children: filteredDocuments.length === 0 ? /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 4, className: "px-4 py-6 text-center text-text-muted", children: documents2.length === 0 ? "No sources yet. Select a collection and import sources." : "No sources match your filter." }) }) : filteredDocuments.map((doc) => /* @__PURE__ */ jsxs(
              "tr",
              {
                onClick: () => {
                  const metadata = doc.metadata && typeof doc.metadata === "object" ? doc.metadata : {};
                  const hasArtifact = typeof metadata.artifactUrl === "string" && metadata.artifactUrl.length > 0 || Boolean(doc.storageUri);
                  if (hasArtifact) {
                    setSelectedDocumentId(null);
                    openFileViewer(buildArtifactMeta(doc));
                    return;
                  }
                  closeFileViewer();
                  setSelectedDocumentId(
                    selectedDocumentId === doc.id ? null : doc.id
                  );
                },
                className: `border-b border-border last:border-b-0 cursor-pointer transition-colors ${selectedDocumentId === doc.id ? "bg-accent-muted" : "hover:bg-surface-hover"}`,
                children: [
                  /* @__PURE__ */ jsx("td", { className: "px-4 py-2.5", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                    /* @__PURE__ */ jsx(FileText, { className: "w-4 h-4 text-text-muted shrink-0" }),
                    /* @__PURE__ */ jsx("span", { className: "truncate max-w-[200px]", children: doc.title || "Untitled" })
                  ] }) }),
                  /* @__PURE__ */ jsx("td", { className: "px-4 py-2.5", children: doc.collectionId && collectionNameMap[doc.collectionId] ? /* @__PURE__ */ jsx("span", { className: "badge badge-idle text-xs", children: collectionNameMap[doc.collectionId] }) : /* @__PURE__ */ jsx("span", { className: "text-text-muted", children: "—" }) }),
                  /* @__PURE__ */ jsx("td", { className: "px-4 py-2.5 text-text-muted", children: doc.sourceType || "manual" }),
                  /* @__PURE__ */ jsx("td", { className: "px-4 py-2.5 text-text-muted", suppressHydrationWarning: true, children: doc.createdAt ? new Date(doc.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric"
                  }) : "—" })
                ]
              },
              doc.id
            )) })
          ] }) }),
          selectedDocument && /* @__PURE__ */ jsxs("div", { className: "card p-4 mt-4", children: [
            /* @__PURE__ */ jsx("h3", { className: "text-sm font-semibold mb-2", children: selectedDocument.title }),
            /* @__PURE__ */ jsx(
              DocumentPreview,
              {
                projectId,
                document: selectedDocument
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs("section", { children: [
          /* @__PURE__ */ jsxs("h2", { className: "text-lg font-semibold mb-4 flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(Search, { className: "w-5 h-5 text-accent" }),
            "Search Sources"
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex gap-2 mb-4", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                className: "input text-sm py-2",
                placeholder: "Query your knowledge base…",
                value: ragQuery,
                onChange: (e) => setRagQuery(e.target.value),
                onKeyDown: (e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleRagSearch();
                  }
                }
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                className: "btn btn-secondary px-3",
                onClick: handleRagSearch,
                "aria-label": "Search",
                children: /* @__PURE__ */ jsx(Search, { className: "w-4 h-4" })
              }
            )
          ] }),
          ragResults.length > 0 && /* @__PURE__ */ jsx("div", { className: "space-y-2", children: ragResults.map((result, i) => /* @__PURE__ */ jsxs("div", { className: "card p-3", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mb-1", children: [
              /* @__PURE__ */ jsx("span", { className: "text-sm font-medium", children: result.title || "Untitled" }),
              /* @__PURE__ */ jsx("span", { className: "badge badge-idle", children: result.score?.toFixed(2) })
            ] }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-text-secondary line-clamp-3", children: result.snippet })
          ] }, i)) })
        ] })
      ] }),
      /* @__PURE__ */ jsx(
        AlertDialog,
        {
          open: showCreateDialog,
          title: "Add Collection",
          inputLabel: "Collection name",
          confirmLabel: "Create",
          onConfirm: handleCreateCollection,
          onCancel: () => setShowCreateDialog(false)
        }
      )
    ] }),
    fileViewerArtifact && /* @__PURE__ */ jsx(FileViewerPanel, {})
  ] });
}
async function loader$p({ params }) {
  const project = await getProject(params.projectId);
  if (!project) {
    throw redirect("/");
  }
  const collections2 = await listCollections(params.projectId);
  return { projectId: params.projectId, project, collections: collections2 };
}
const _app_projects_$projectId_knowledge = UNSAFE_withComponentProps(function KnowledgeRoute() {
  const {
    projectId
  } = useLoaderData();
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
  useEffect(() => {
    setActiveProjectId(projectId);
  }, [projectId, setActiveProjectId]);
  return /* @__PURE__ */ jsx(KnowledgeWorkspace, {});
});
const route5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: _app_projects_$projectId_knowledge,
  loader: loader$p
}, Symbol.toStringTag, { value: "Module" }));
const TABS = [
  { id: "api", label: "API", description: "Provider, model, and key setup", icon: Settings },
  { id: "sandbox", label: "Sandbox", description: "Runtime isolation guidance", icon: Shield },
  { id: "credentials", label: "Credentials", description: "Project/service secrets", icon: Key },
  { id: "connectors", label: "MCP", description: "Connector servers and tools", icon: Plug },
  { id: "skills", label: "Skills", description: "Install and enable capabilities", icon: Package },
  { id: "logs", label: "Logs", description: "Service diagnostics and export", icon: Database }
];
function SettingsPanel({
  isOpen,
  onClose,
  activeTab = "api",
  onTabChange,
  initialData
}) {
  if (!isOpen) return null;
  const content = /* @__PURE__ */ jsxs("div", { className: "bg-surface rounded-2xl shadow-2xl w-full max-w-5xl mx-auto my-4 max-h-[88vh] overflow-hidden border border-border flex", children: [
    /* @__PURE__ */ jsx("div", { className: "w-72 border-r border-border p-3 space-y-1", children: TABS.map((tab) => /* @__PURE__ */ jsxs(
      "button",
      {
        onClick: () => onTabChange?.(tab.id),
        "data-testid": `settings-tab-${tab.id}`,
        className: `w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left ${activeTab === tab.id ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-surface-hover"}`,
        children: [
          /* @__PURE__ */ jsx(tab.icon, { className: "w-4 h-4" }),
          /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsx("p", { className: "text-sm font-medium truncate", children: tab.label }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-text-muted truncate", children: tab.description })
          ] })
        ]
      },
      tab.id
    )) }),
    /* @__PURE__ */ jsxs("div", { className: "flex-1 overflow-y-auto p-5", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-4", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-lg font-semibold", children: TABS.find((tab) => tab.id === activeTab)?.label }),
        /* @__PURE__ */ jsx("button", { onClick: onClose, className: "p-2 rounded hover:bg-surface-hover", "aria-label": "Close settings", children: /* @__PURE__ */ jsx(X, { className: "w-4 h-4" }) })
      ] }),
      activeTab === "api" && /* @__PURE__ */ jsx(APISettingsTab, { currentModel: initialData?.currentModel }),
      activeTab === "sandbox" && /* @__PURE__ */ jsx(SandboxTab, {}),
      activeTab === "credentials" && /* @__PURE__ */ jsx(CredentialsTab, { initialItems: initialData?.credentials }),
      activeTab === "connectors" && /* @__PURE__ */ jsx(ConnectorsTab, { initialServers: initialData?.mcpServers, initialPresets: initialData?.mcpPresets }),
      activeTab === "skills" && /* @__PURE__ */ jsx(SkillsTab, { initialSkills: initialData?.skills }),
      activeTab === "logs" && /* @__PURE__ */ jsx(LogsTab, { initialEnabled: initialData?.logsEnabled })
    ] })
  ] });
  return content;
}
function APISettingsTab({ currentModel }) {
  const setAppConfig = useAppStore((state) => state.setAppConfig);
  const setIsConfigured = useAppStore((state) => state.setIsConfigured);
  const [config, setConfig] = useState(() => getBrowserConfig());
  const [model, setModel] = useState(currentModel || config.model || "");
  const [customModel, setCustomModel] = useState("");
  const [useCustomModel, setUseCustomModel] = useState(false);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => {
    headlessGetModels().then((list) => {
      setModels(list);
      if (list.length > 0) {
        const currentValid = model && list.some((m) => m.id === model && m.supportsTools);
        if (!currentValid) {
          setModel((list.find((m) => m.supportsTools) || list[0]).id);
        }
      }
    }).catch((e) => setError(`Failed to load models: ${e instanceof Error ? e.message : String(e)}`)).finally(() => setLoading(false));
  }, []);
  const saveConfig = async () => {
    const resolvedModel = (useCustomModel ? customModel : model).trim();
    if (!resolvedModel) {
      setError("Model is required.");
      return;
    }
    if (!supportsToolCalling(resolvedModel)) {
      setError("This model does not appear to support tool calling. Choose a tool-capable model such as Claude Sonnet or Opus.");
      return;
    }
    const next = {
      ...config,
      model: resolvedModel
    };
    setError("");
    await headlessSaveConfig({ model: resolvedModel });
    saveBrowserConfig(next);
    setConfig(next);
    setAppConfig(next);
    setIsConfigured(true);
    setSuccess("Saved.");
    setTimeout(() => setSuccess(""), 2e3);
  };
  return /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
    error && /* @__PURE__ */ jsx(Banner, { tone: "error", text: error }),
    success && /* @__PURE__ */ jsx(Banner, { tone: "success", text: success }),
    /* @__PURE__ */ jsx("p", { className: "text-sm text-text-secondary", children: "Models are served through the LiteLLM gateway. Open Analyst requires a model that supports tool calling." }),
    /* @__PURE__ */ jsxs("label", { className: "text-sm", children: [
      "Model",
      /* @__PURE__ */ jsxs(
        "select",
        {
          className: "input mt-1",
          value: model,
          onChange: (e) => {
            setModel(e.target.value);
            setUseCustomModel(false);
          },
          disabled: loading,
          children: [
            loading && /* @__PURE__ */ jsx("option", { children: "Loading models..." }),
            models.map((m) => /* @__PURE__ */ jsx("option", { value: m.id, children: m.supportsTools ? m.name : `${m.name} (no tool support)` }, m.id))
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("label", { className: "text-sm", children: [
      "Custom Model (optional)",
      /* @__PURE__ */ jsx(
        "input",
        {
          className: "input mt-1",
          value: useCustomModel ? customModel : "",
          placeholder: "Enter custom model ID",
          onChange: (e) => {
            const next = e.target.value;
            setCustomModel(next);
            setUseCustomModel(Boolean(next.trim()));
          }
        }
      )
    ] }),
    /* @__PURE__ */ jsx("div", { className: "flex gap-2", children: /* @__PURE__ */ jsxs("button", { className: "btn btn-primary", onClick: () => void saveConfig(), children: [
      /* @__PURE__ */ jsx(Save, { className: "w-4 h-4" }),
      /* @__PURE__ */ jsx("span", { children: "Save" })
    ] }) })
  ] });
}
function SandboxTab() {
  return /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsx(Banner, { tone: "info", text: "Sandbox controls are removed in headless mode. Isolation is handled by your container/VM runtime." }),
    /* @__PURE__ */ jsx("p", { className: "text-sm text-text-secondary", children: "Configure host-level security (container user, seccomp/apparmor, IAM, network policy) outside this app." })
  ] });
}
function CredentialsTab({ initialItems }) {
  const [items, setItems] = useState(initialItems || []);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({ type: "api" });
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const load = async () => {
    try {
      setItems(await headlessGetCredentials());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    if (!initialItems) void load();
  }, []);
  const save = async () => {
    if (!draft.name?.trim() || !draft.username?.trim()) return;
    setIsSaving(true);
    setError("");
    try {
      if (editingId) {
        await headlessUpdateCredential(editingId, {
          name: draft.name.trim(),
          type: draft.type || "other",
          username: draft.username.trim(),
          password: draft.password ?? "",
          service: draft.service ?? "",
          url: draft.url ?? "",
          notes: draft.notes ?? ""
        });
      } else {
        await headlessSaveCredential({
          name: draft.name.trim(),
          type: draft.type || "other",
          username: draft.username.trim(),
          password: draft.password ?? "",
          service: draft.service ?? "",
          url: draft.url ?? "",
          notes: draft.notes ?? ""
        });
      }
      await load();
      setDraft({ type: "api" });
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSaving(false);
    }
  };
  const handleDelete = async (id) => {
    try {
      await headlessDeleteCredential(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
    error && /* @__PURE__ */ jsx(Banner, { tone: "error", text: error }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-2", children: [
      /* @__PURE__ */ jsxs("label", { className: "text-sm", children: [
        /* @__PURE__ */ jsx("span", { className: "sr-only", children: "Credential name" }),
        /* @__PURE__ */ jsx("input", { className: "input", placeholder: "Name", value: draft.name || "", onChange: (e) => setDraft((d) => ({ ...d, name: e.target.value })) })
      ] }),
      /* @__PURE__ */ jsxs("label", { className: "text-sm", children: [
        /* @__PURE__ */ jsx("span", { className: "sr-only", children: "Username" }),
        /* @__PURE__ */ jsx("input", { className: "input", placeholder: "Username", value: draft.username || "", onChange: (e) => setDraft((d) => ({ ...d, username: e.target.value })) })
      ] }),
      /* @__PURE__ */ jsxs("label", { className: "text-sm", children: [
        /* @__PURE__ */ jsx("span", { className: "sr-only", children: "Secret or password" }),
        /* @__PURE__ */ jsx("input", { className: "input", placeholder: "Secret/Password", type: "password", value: draft.password || "", autoComplete: "new-password", onChange: (e) => setDraft((d) => ({ ...d, password: e.target.value })) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("button", { className: "btn btn-primary", onClick: () => void save(), disabled: isSaving, children: [
      editingId ? "Update" : "Save",
      " Credential"
    ] }),
    /* @__PURE__ */ jsx("div", { className: "space-y-2", children: items.map((item) => /* @__PURE__ */ jsxs(
      "div",
      {
        "data-testid": `credential-row-${item.id}`,
        className: "p-3 rounded border border-border bg-surface-muted flex items-center justify-between gap-2",
        children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("div", { className: "text-sm font-medium", children: item.name }),
            /* @__PURE__ */ jsx("div", { className: "text-xs text-text-muted", children: item.username })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsx("button", { className: "btn btn-secondary", onClick: () => {
              setEditingId(item.id);
              setDraft(item);
            }, children: "Edit" }),
            /* @__PURE__ */ jsx(
              "button",
              {
                className: "btn btn-ghost text-error",
                onClick: () => handleDelete(item.id),
                "aria-label": `Delete credential ${item.name}`,
                children: /* @__PURE__ */ jsx(Trash2, { className: "w-4 h-4" })
              }
            )
          ] })
        ]
      },
      item.id
    )) })
  ] });
}
function ConnectorsTab({ initialServers, initialPresets }) {
  const [servers, setServers] = useState(initialServers || []);
  const [statuses, setStatuses] = useState([]);
  const [tools, setTools] = useState([]);
  const [presets, setPresets] = useState(initialPresets || {});
  const [error, setError] = useState("");
  const loadAll = async () => {
    try {
      const [s, st, t, p] = await Promise.all([
        headlessGetMcpServers(),
        headlessGetMcpServerStatus(),
        headlessGetMcpTools(),
        headlessGetMcpPresets()
      ]);
      setServers(s);
      setStatuses(st);
      setTools(t);
      setPresets(p);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const refreshStatus = async () => {
    try {
      const [st, t] = await Promise.all([
        headlessGetMcpServerStatus(),
        headlessGetMcpTools()
      ]);
      setStatuses(st);
      setTools(t);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    void loadAll();
    const timer = setInterval(() => void refreshStatus(), 15e3);
    return () => clearInterval(timer);
  }, []);
  const addPreset = async (key) => {
    const preset = presets[key];
    if (!preset) return;
    try {
      await headlessSaveMcpServer({
        id: `mcp-${key}-${Date.now()}`,
        name: preset.name || key,
        alias: preset.alias,
        type: preset.type || "stdio",
        command: preset.command,
        args: Array.isArray(preset.args) ? preset.args : [],
        env: preset.env || {},
        url: preset.url,
        headers: preset.headers || {},
        enabled: true
      });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const toggleServer = async (server) => {
    try {
      await headlessSaveMcpServer({ ...server, enabled: !server.enabled });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const deleteServer = async (id) => {
    try {
      await headlessDeleteMcpServer(id);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
    error && /* @__PURE__ */ jsx(Banner, { tone: "error", text: error }),
    /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-2", children: Object.keys(presets).map((key) => /* @__PURE__ */ jsxs("button", { className: "btn btn-secondary", onClick: () => addPreset(key), children: [
      "Add Preset: ",
      presets[key].name || key
    ] }, key)) }),
    /* @__PURE__ */ jsx("div", { className: "space-y-2", children: servers.map((server) => {
      const status = statuses.find((s) => s.id === server.id);
      const count = tools.filter((t) => t.serverId === server.id).length || status?.toolCount || 0;
      return /* @__PURE__ */ jsxs(
        "div",
        {
          "data-testid": `mcp-server-row-${server.id}`,
          className: "p-3 rounded border border-border bg-surface-muted flex items-center justify-between gap-3",
          children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("div", { className: "text-sm font-medium", children: server.name }),
              /* @__PURE__ */ jsxs("div", { className: "text-xs text-text-muted", children: [
                server.alias ? `${server.alias} • ` : "",
                server.type,
                " • ",
                status?.connected ? "connected" : server.enabled ? "error" : "disabled",
                " • ",
                count,
                " tools"
              ] }),
              status?.error && /* @__PURE__ */ jsx("div", { className: "text-xs text-error mt-1", children: status.error })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
              /* @__PURE__ */ jsx("button", { className: "btn btn-secondary", onClick: () => toggleServer(server), children: server.enabled ? "Disable" : "Enable" }),
              /* @__PURE__ */ jsx(
                "button",
                {
                  className: "btn btn-ghost text-error",
                  onClick: () => deleteServer(server.id),
                  "aria-label": `Delete MCP server ${server.name}`,
                  children: /* @__PURE__ */ jsx(Trash2, { className: "w-4 h-4" })
                }
              )
            ] })
          ]
        },
        server.id
      );
    }) })
  ] });
}
function SkillsTab({ initialSkills }) {
  const [skills, setSkills] = useState(initialSkills || []);
  const [error, setError] = useState("");
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const load = async () => {
    try {
      setSkills(await headlessGetSkills());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    if (!initialSkills) void load();
  }, []);
  const install = async (folderPath) => {
    setShowInstallDialog(false);
    if (!folderPath?.trim()) return;
    const validation = await headlessValidateSkillPath(folderPath.trim());
    if (!validation.valid) {
      setError(validation.errors.join(", "));
      return;
    }
    try {
      await headlessInstallSkill(folderPath.trim());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const toggleEnabled = async (skill) => {
    try {
      await headlessSetSkillEnabled(skill.id, !skill.enabled);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const deleteSkill2 = async (id) => {
    try {
      await headlessDeleteSkill(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
    error && /* @__PURE__ */ jsx(Banner, { tone: "error", text: error }),
    /* @__PURE__ */ jsx("button", { className: "btn btn-primary", onClick: () => setShowInstallDialog(true), children: "Install Skill From Path" }),
    showInstallDialog && /* @__PURE__ */ jsx(
      AlertDialog,
      {
        open: showInstallDialog,
        title: "Install skill",
        inputLabel: "Skill folder path (must contain SKILL.md)",
        confirmLabel: "Install",
        onConfirm: (val) => void install(val),
        onCancel: () => setShowInstallDialog(false)
      }
    ),
    /* @__PURE__ */ jsx("div", { className: "space-y-2", children: skills.map((skill) => /* @__PURE__ */ jsxs(
      "div",
      {
        "data-testid": `skill-row-${skill.id}`,
        className: "p-3 rounded border border-border bg-surface-muted flex items-center justify-between gap-2",
        children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("div", { className: "text-sm font-medium", children: skill.name }),
            /* @__PURE__ */ jsx("div", { className: "text-xs text-text-muted", children: skill.type })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsx("button", { className: "btn btn-secondary", onClick: () => void toggleEnabled(skill), children: skill.enabled ? "Disable" : "Enable" }),
            skill.type !== "builtin" && /* @__PURE__ */ jsx(
              "button",
              {
                className: "btn btn-ghost text-error",
                onClick: () => void deleteSkill2(skill.id),
                "aria-label": `Delete skill ${skill.name}`,
                children: /* @__PURE__ */ jsx(Trash2, { className: "w-4 h-4" })
              }
            )
          ] })
        ]
      },
      skill.id
    )) })
  ] });
}
function LogsTab({ initialEnabled }) {
  const [files, setFiles] = useState([]);
  const [dir, setDir] = useState("");
  const [enabled, setEnabled] = useState(initialEnabled ?? true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const load = async () => {
    try {
      const [logs, isEnabled] = await Promise.all([headlessGetLogs(), headlessLogsIsEnabled()]);
      setFiles(logs.files);
      setDir(logs.directory);
      setEnabled(isEnabled);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 3e3);
    return () => clearInterval(timer);
  }, []);
  const toggleEnabled = async () => {
    const next = !enabled;
    setEnabled(next);
    await headlessLogsSetEnabled(next);
  };
  const exportLogs2 = async () => {
    try {
      const data = await headlessLogsExport();
      setSuccess(`Exported: ${data.path}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const clearLogs2 = async () => {
    try {
      await headlessLogsClear();
      setSuccess("Logs cleared.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
    error && /* @__PURE__ */ jsx(Banner, { tone: "error", text: error }),
    success && /* @__PURE__ */ jsx(Banner, { tone: "success", text: success }),
    /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
      /* @__PURE__ */ jsx("button", { className: "btn btn-secondary", onClick: () => void toggleEnabled(), children: enabled ? "Disable Dev Logs" : "Enable Dev Logs" }),
      /* @__PURE__ */ jsx("button", { className: "btn btn-secondary", onClick: () => void exportLogs2(), children: "Export" }),
      /* @__PURE__ */ jsx("button", { className: "btn btn-ghost text-error", onClick: () => void clearLogs2(), children: "Clear" })
    ] }),
    dir && /* @__PURE__ */ jsxs("div", { className: "text-xs text-text-muted", children: [
      "Directory: ",
      /* @__PURE__ */ jsx("span", { className: "font-mono", children: dir })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "space-y-1 max-h-[380px] overflow-y-auto", children: files.map((file) => /* @__PURE__ */ jsxs("div", { className: "p-2 rounded border border-border bg-surface-muted text-sm flex justify-between", children: [
      /* @__PURE__ */ jsx("span", { className: "font-mono truncate max-w-[60%]", children: file.name }),
      /* @__PURE__ */ jsxs("span", { className: "text-text-muted text-xs", children: [
        (file.size / 1024).toFixed(1),
        " KB"
      ] })
    ] }, file.path)) })
  ] });
}
function Banner({ tone, text: text2 }) {
  const style = tone === "error" ? "bg-error/10 text-error" : tone === "success" ? "bg-success/10 text-success" : "bg-blue-500/10 text-blue-600";
  return /* @__PURE__ */ jsxs("div", { className: `px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${style}`, children: [
    tone === "error" && /* @__PURE__ */ jsx(AlertCircle, { className: "w-4 h-4" }),
    tone === "success" && /* @__PURE__ */ jsx(CheckCircle, { className: "w-4 h-4" }),
    tone === "info" && /* @__PURE__ */ jsx(Shield, { className: "w-4 h-4" }),
    /* @__PURE__ */ jsx("span", { children: text2 })
  ] });
}
const CREDENTIALS_FILENAME = "credentials.json";
function getCredentialsPath(configDir) {
  return path.join(getConfigDir(), CREDENTIALS_FILENAME);
}
function listCredentials(configDir) {
  ensureConfigDir();
  return loadJsonArray(getCredentialsPath());
}
function createCredential(input, configDir) {
  const credentials = listCredentials();
  const now = nowIso();
  const credential = {
    id: randomUUID(),
    name: String(input.name || "").trim(),
    type: ["email", "website", "api", "other"].includes(input.type || "") ? input.type : "other",
    service: String(input.service || "").trim() || void 0,
    username: String(input.username || "").trim(),
    password: typeof input.password === "string" ? input.password : void 0,
    url: String(input.url || "").trim() || void 0,
    notes: String(input.notes || "").trim() || void 0,
    createdAt: now,
    updatedAt: now
  };
  credentials.unshift(credential);
  saveJsonArray(getCredentialsPath(), credentials);
  return credential;
}
function updateCredential(id, updates, configDir) {
  const credentials = listCredentials();
  const idx = credentials.findIndex((item) => item.id === id);
  if (idx === -1) return null;
  const previous = credentials[idx];
  credentials[idx] = {
    ...previous,
    ...updates,
    id: previous.id,
    createdAt: previous.createdAt,
    updatedAt: nowIso()
  };
  saveJsonArray(getCredentialsPath(), credentials);
  return credentials[idx];
}
function deleteCredential(id, configDir) {
  const credentials = listCredentials();
  const next = credentials.filter((item) => item.id !== id);
  saveJsonArray(getCredentialsPath(), next);
  return { success: true };
}
function buildTransport(server) {
  if (server.type === "stdio") {
    if (!server.command) {
      throw new Error("stdio MCP servers require a command");
    }
    return new StdioClientTransport({
      command: server.command,
      args: server.args || [],
      env: server.env || {}
    });
  }
  if (!server.url) {
    throw new Error("network MCP servers require a url");
  }
  if (server.type === "sse") {
    return new SSEClientTransport(new URL(server.url), {
      requestInit: {
        headers: server.headers || {}
      }
    });
  }
  return new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: {
      headers: server.headers || {}
    }
  });
}
async function inspectMcpServer(server) {
  const client = new Client({
    name: "open-analyst",
    version: "2.0.0"
  });
  const transport = buildTransport(server);
  try {
    await client.connect(transport);
    const result = await client.listTools();
    return {
      tools: (result.tools || []).map((tool) => ({
        name: tool.name,
        description: tool.description || "",
        inputSchema: tool.inputSchema && typeof tool.inputSchema === "object" ? tool.inputSchema : void 0
      })),
      instructions: client.getInstructions(),
      serverVersion: client.getServerVersion()?.version
    };
  } finally {
    await transport.close?.();
  }
}
const MCP_SERVERS_FILENAME = "mcp-servers.json";
const MCP_CACHE_TTL_MS = 3e4;
const ANALYST_MCP_DEFAULT_HOST = "localhost";
const ANALYST_MCP_DEFAULT_PORT = "8000";
const ANALYST_MCP_DEFAULT_API_KEY = "change-me";
const ANALYST_MCP_DEFAULT_PATH = "/mcp/";
const inspectionCache = /* @__PURE__ */ new Map();
function getServersPath(configDir) {
  return path.join(getConfigDir(), MCP_SERVERS_FILENAME);
}
function getCacheKey(server) {
  return JSON.stringify({
    id: server.id,
    type: server.type,
    command: server.command,
    args: server.args || [],
    env: server.env || {},
    url: server.url || "",
    headers: server.headers || {},
    alias: server.alias || "",
    enabled: server.enabled
  });
}
function defaultMcpServers() {
  const analystDefaults = getAnalystMcpDefaults();
  return [
    {
      id: "mcp-analystMcp-default",
      name: "Analyst MCP",
      alias: "analyst",
      type: "http",
      url: analystDefaults.url,
      headers: {
        "x-api-key": analystDefaults.apiKey
      },
      enabled: true
    },
    {
      id: "mcp-example-filesystem",
      name: "Filesystem (Example)",
      alias: "filesystem",
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
      env: {},
      enabled: false
    }
  ];
}
function getAnalystMcpDefaults() {
  const host = String(process.env.ANALYST_MCP_HOST || ANALYST_MCP_DEFAULT_HOST).trim() || ANALYST_MCP_DEFAULT_HOST;
  const port = String(process.env.ANALYST_MCP_PORT || ANALYST_MCP_DEFAULT_PORT).trim() || ANALYST_MCP_DEFAULT_PORT;
  const apiKey = String(process.env.ANALYST_MCP_API_KEY || "").trim() || ANALYST_MCP_DEFAULT_API_KEY;
  return {
    url: `http://${host}:${port}${ANALYST_MCP_DEFAULT_PATH}`,
    apiKey
  };
}
const LOCAL_RESEARCH_TOOL_NAMES = /* @__PURE__ */ new Set([
  "web_search",
  "web_fetch",
  "deep_research",
  "hf_daily_papers",
  "hf_paper"
]);
function isAnalystMcpServer(server) {
  const name = String(server.name || "").trim().toLowerCase();
  const alias = String(server.alias || "").trim().toLowerCase();
  const id = String(server.id || "").trim().toLowerCase();
  const url = String(server.url || "").trim().toLowerCase();
  return name === "analyst mcp" || alias === "analyst" || id.includes("analystmcp") || url === "http://localhost:8000/mcp" || url === "http://localhost:8000/mcp/";
}
function getAnalystMcpServer(configDir) {
  const servers = listMcpServers();
  return servers.find((server) => isAnalystMcpServer(server)) || null;
}
function buildProjectMcpHeaders(project, apiBaseUrl) {
  const artifact = resolveProjectArtifactConfig(project);
  const headers = {
    "x-open-analyst-project-id": project.id,
    "x-open-analyst-project-name": project.name,
    "x-open-analyst-workspace-slug": project.workspaceSlug,
    "x-open-analyst-api-base-url": apiBaseUrl.replace(/\/+$/g, ""),
    "x-open-analyst-artifact-backend": artifact.backend
  };
  if (artifact.localRoot) {
    headers["x-open-analyst-local-artifact-root"] = artifact.localRoot;
  }
  if (artifact.bucket) {
    headers["x-open-analyst-s3-bucket"] = artifact.bucket;
  }
  if (artifact.region) {
    headers["x-open-analyst-s3-region"] = artifact.region;
  }
  if (artifact.endpoint) {
    headers["x-open-analyst-s3-endpoint"] = artifact.endpoint;
  }
  if (artifact.keyPrefix) {
    headers["x-open-analyst-s3-prefix"] = artifact.keyPrefix.replace(/\/artifacts$/g, "");
  }
  return headers;
}
function normalizeMcpServer(server) {
  if (!isAnalystMcpServer(server)) return server;
  const analystDefaults = getAnalystMcpDefaults();
  const nextHeaders = {
    ...server.headers || {}
  };
  if (!nextHeaders["x-api-key"] || nextHeaders["x-api-key"] === ANALYST_MCP_DEFAULT_API_KEY) {
    nextHeaders["x-api-key"] = analystDefaults.apiKey;
  }
  return {
    ...server,
    alias: server.alias || "analyst",
    url: !server.url || server.url === "http://localhost:8000/mcp" || server.url === "http://localhost:8000/mcp/" ? analystDefaults.url : server.url,
    headers: nextHeaders
  };
}
function isToolCatalogPrompt(text2) {
  const lowered = text2.toLowerCase();
  return lowered.includes("what tools") || lowered.includes("which tools") || lowered.includes("available tools") || (lowered.includes("tool") || lowered.includes("connector") || lowered.includes("mcp")) && (lowered.includes("available") || lowered.includes("have") || lowered.includes("can use") || lowered.includes("list"));
}
function isResearchAcquisitionPrompt(text2) {
  const keywords = [
    "paper",
    "papers",
    "article",
    "articles",
    "literature",
    "research",
    "study",
    "studies",
    "citation",
    "citations",
    "journal",
    "journals",
    "arxiv",
    "openalex",
    "semantic scholar",
    "collection",
    "collections",
    "review",
    "collect",
    "download",
    "index",
    "ingest"
  ];
  return keywords.some((keyword) => text2.includes(keyword));
}
function getResearchPromptBias(server, fullText) {
  const aliasText = [server.name, server.alias].filter(Boolean).join(" ").toLowerCase();
  const looksLikeAnalystServer = aliasText.includes("analyst") || aliasText.includes("literature") || aliasText.includes("research");
  if (!looksLikeAnalystServer) return 0;
  const keywords = [
    "paper",
    "papers",
    "article",
    "articles",
    "literature",
    "research",
    "study",
    "studies",
    "citation",
    "citations",
    "arxiv",
    "openalex",
    "semantic scholar",
    "collection",
    "collections",
    "review",
    "rag",
    "grounded",
    "collect",
    "download",
    "index",
    "ingest",
    "journal",
    "scholar"
  ];
  let score = 0;
  for (const keyword of keywords) {
    if (fullText.includes(keyword)) {
      score += keyword.length >= 8 ? 8 : 6;
    }
  }
  if (score > 0 && fullText.includes("search")) {
    score += 8;
  }
  if (score > 0 && fullText.includes("collect")) {
    score += 10;
  }
  if (score > 0 && fullText.includes("download")) {
    score += 8;
  }
  if (score > 0 && fullText.includes("index")) {
    score += 8;
  }
  if (score > 0 && (fullText.includes("find") || fullText.includes("look up"))) {
    score += 4;
  }
  return score;
}
function getMcpPresets() {
  const analystDefaults = getAnalystMcpDefaults();
  return {
    analystMcp: {
      name: "Analyst MCP",
      alias: "analyst",
      type: "http",
      url: analystDefaults.url,
      requiresEnv: [],
      env: {},
      headers: {
        "x-api-key": analystDefaults.apiKey
      }
    },
    filesystem: {
      name: "Filesystem",
      alias: "filesystem",
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
      requiresEnv: [],
      env: {},
      headers: {}
    },
    fetch: {
      name: "Fetch",
      alias: "fetch",
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-fetch"],
      requiresEnv: [],
      env: {},
      headers: {}
    },
    github: {
      name: "GitHub",
      alias: "github",
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      requiresEnv: ["GITHUB_TOKEN"],
      env: {},
      headers: {}
    }
  };
}
function listMcpServers(configDir) {
  ensureConfigDir();
  const existing = loadJsonArray(getServersPath());
  if (existing.length) {
    const normalized = existing.map((server) => normalizeMcpServer(server));
    const changed = JSON.stringify(existing) !== JSON.stringify(normalized);
    if (changed) {
      saveJsonArray(getServersPath(), normalized);
    }
    return normalized;
  }
  const defaults = defaultMcpServers();
  saveJsonArray(getServersPath(), defaults);
  return defaults;
}
function saveMcpServer(input, configDir) {
  const servers = listMcpServers();
  const normalizedType = input.type === "sse" ? "sse" : input.type === "http" ? "http" : "stdio";
  const serverConfig = {
    id: String(input.id || "").trim() || `mcp-${Date.now()}`,
    name: String(input.name || "").trim() || "MCP Server",
    alias: String(input.alias || "").trim() || void 0,
    type: normalizedType,
    command: typeof input.command === "string" ? input.command : void 0,
    args: Array.isArray(input.args) ? input.args.map((item) => String(item)) : void 0,
    env: input.env && typeof input.env === "object" ? input.env : void 0,
    url: typeof input.url === "string" ? input.url : void 0,
    headers: input.headers && typeof input.headers === "object" ? input.headers : void 0,
    enabled: input.enabled !== false
  };
  const normalizedServerConfig = normalizeMcpServer(serverConfig);
  const idx = servers.findIndex((item) => item.id === normalizedServerConfig.id);
  if (idx === -1) {
    servers.unshift(normalizedServerConfig);
  } else {
    servers[idx] = normalizedServerConfig;
  }
  saveJsonArray(getServersPath(), servers);
  inspectionCache.delete(getCacheKey(normalizedServerConfig));
  return normalizedServerConfig;
}
function deleteMcpServer(id, configDir) {
  const servers = listMcpServers();
  const next = servers.filter((item) => item.id !== id);
  saveJsonArray(getServersPath(), next);
  return { success: true };
}
async function inspectServerHealth(server) {
  if (!server.url) return void 0;
  try {
    const url = new URL(server.url);
    const healthUrl = new URL("/api/health/details", `${url.origin}/`);
    const response = await fetch(healthUrl, {
      headers: server.headers || {}
    });
    if (!response.ok) return void 0;
    const payload = await response.json();
    return payload;
  } catch {
    return void 0;
  }
}
async function inspectServerCached(server) {
  const cacheKey = getCacheKey(server);
  const cached = inspectionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }
  try {
    const [inspection, health] = await Promise.all([
      inspectMcpServer(server),
      inspectServerHealth(server)
    ]);
    const next = {
      expiresAt: Date.now() + MCP_CACHE_TTL_MS,
      inspection,
      health
    };
    inspectionCache.set(cacheKey, next);
    return next;
  } catch (error) {
    const next = {
      expiresAt: Date.now() + MCP_CACHE_TTL_MS,
      error: error instanceof Error ? error.message : String(error)
    };
    inspectionCache.set(cacheKey, next);
    return next;
  }
}
async function getMcpStatus(configDir) {
  const servers = listMcpServers();
  const inspections = await Promise.all(
    servers.map(async (server) => {
      if (!server.enabled) {
        return {
          id: server.id,
          name: server.name,
          alias: server.alias,
          connected: false,
          enabled: false,
          toolCount: 0
        };
      }
      const result = await inspectServerCached(server);
      return {
        id: server.id,
        name: server.name,
        alias: server.alias,
        connected: !result.error,
        enabled: true,
        toolCount: result.inspection?.tools.length || 0,
        error: result.error,
        health: result.health
      };
    })
  );
  return inspections;
}
async function getMcpTools(configDir) {
  const servers = listMcpServers().filter((server) => server.enabled);
  const inspections = await Promise.all(
    servers.map(async (server) => ({
      server,
      result: await inspectServerCached(server)
    }))
  );
  return inspections.flatMap(
    ({ server, result }) => (result.inspection?.tools || []).map((tool) => ({
      serverId: server.id,
      serverName: server.name,
      serverAlias: server.alias,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  );
}
async function getSelectedMcpServers(input, configDir) {
  const enabledServers = listMcpServers().filter((server) => server.enabled);
  if (enabledServers.length === 0) return [];
  const pinned = new Set((input.pinnedServerIds || []).map((id) => String(id)));
  const prompt = String(input.prompt || "").toLowerCase();
  const userText = Array.isArray(input.messages) ? input.messages.filter((message) => message?.role === "user").map((message) => String(message?.content || "").toLowerCase()).join("\n") : "";
  const fullText = [prompt, userText].filter(Boolean).join("\n");
  const inspected = await Promise.all(
    enabledServers.map(async (server) => ({
      server,
      result: await inspectServerCached(server)
    }))
  );
  const maxServers = input.maxServers ?? 2;
  const pinnedServers = inspected.filter(({ server }) => pinned.has(server.id)).map(({ server }) => server);
  if (isToolCatalogPrompt(fullText)) {
    const available = inspected.filter(({ server }) => !pinned.has(server.id)).map(({ server }) => server).sort((a, b) => a.name.localeCompare(b.name));
    return [...pinnedServers, ...available].slice(0, maxServers);
  }
  const scored = inspected.filter(({ server }) => !pinned.has(server.id)).map(({ server, result }) => {
    let score = 0;
    const aliases = [server.name, server.alias].filter(Boolean).map((value) => String(value).toLowerCase());
    for (const alias of aliases) {
      if (alias && fullText.includes(alias)) score += 20;
    }
    if (isAnalystMcpServer(server) && isResearchAcquisitionPrompt(fullText)) {
      score += 100;
    }
    score += getResearchPromptBias(server, fullText);
    for (const tool of result.inspection?.tools || []) {
      const name = tool.name.toLowerCase();
      if (name && fullText.includes(name.replace(/[_-]+/g, " "))) score += 12;
      if (name && fullText.includes(name)) score += 10;
      for (const token of String(tool.description || "").toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length >= 6)) {
        if (fullText.includes(token)) score += 1;
      }
    }
    return { server, score };
  }).filter((entry2) => entry2.score > 0).sort((a, b) => b.score - a.score || a.server.name.localeCompare(b.server.name)).map((entry2) => entry2.server);
  return [...pinnedServers, ...scored].slice(0, maxServers);
}
function applyProjectMcpContext(servers, project, apiBaseUrl) {
  return servers.map((server) => {
    if (!isAnalystMcpServer(server)) return server;
    return {
      ...server,
      headers: {
        ...server.headers || {},
        ...buildProjectMcpHeaders(project, apiBaseUrl)
      }
    };
  });
}
function filterLocalToolsForSelectedMcpServers(toolNames, servers) {
  if (!servers.some((server) => isAnalystMcpServer(server))) {
    return toolNames;
  }
  return toolNames.filter((toolName) => !LOCAL_RESEARCH_TOOL_NAMES.has(String(toolName).trim()));
}
function parseFrontmatter(content) {
  const trimmed = String(content || "");
  if (!trimmed.startsWith("---\n")) {
    return { attributes: {}, body: trimmed.trim() };
  }
  const end = trimmed.indexOf("\n---\n", 4);
  if (end === -1) {
    return { attributes: {}, body: trimmed.trim() };
  }
  const rawFrontmatter = trimmed.slice(4, end).trim();
  const body = trimmed.slice(end + 5).trim();
  const attributes = {};
  let currentArrayKey = null;
  for (const rawLine of rawFrontmatter.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    if (currentArrayKey && /^\s*-\s+/.test(rawLine)) {
      const value2 = rawLine.replace(/^\s*-\s+/, "").trim();
      const arr = attributes[currentArrayKey];
      if (Array.isArray(arr)) arr.push(value2);
      continue;
    }
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!value) {
      currentArrayKey = key;
      attributes[key] = [];
      continue;
    }
    currentArrayKey = null;
    if (value.startsWith("[") && value.endsWith("]")) {
      attributes[key] = value.slice(1, -1).split(",").map((item) => item.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
      continue;
    }
    attributes[key] = value.replace(/^['"]|['"]$/g, "");
  }
  return { attributes, body };
}
function listChildFiles(dirPath) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) return [];
  return fs.readdirSync(dirPath).sort();
}
function readStringArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}
function parseSkillManifest(folderPath, base = {}) {
  const skillPath = path.resolve(folderPath);
  const skillFile = path.join(skillPath, "SKILL.md");
  const raw = fs.readFileSync(skillFile, "utf8");
  const stats = fs.statSync(skillFile);
  const { attributes, body } = parseFrontmatter(raw);
  const name = String(attributes.name || base.name || path.basename(skillPath)).trim() || path.basename(skillPath);
  const description = String(attributes.description || base.description || "").trim();
  const frontmatterTools = Array.isArray(attributes.tools) ? attributes.tools.map((item) => String(item).trim()).filter(Boolean) : [];
  const references = listChildFiles(path.join(skillPath, "references")).map(
    (item) => path.join("references", item)
  );
  const scripts = listChildFiles(path.join(skillPath, "scripts")).map(
    (item) => path.join("scripts", item)
  );
  return {
    id: base.id || `skill-${path.basename(skillPath)}`,
    name,
    description,
    type: base.type || "custom",
    enabled: Boolean(base.enabled),
    createdAt: base.createdAt || stats.mtimeMs,
    config: {
      ...base.config || {},
      folderPath: skillPath,
      license: typeof attributes.license === "string" ? attributes.license : void 0,
      matchPhrases: readStringArray(attributes.matchPhrases),
      denyPhrases: readStringArray(attributes.denyPhrases),
      fileExtensions: readStringArray(attributes.fileExtensions)
    },
    instructions: body,
    tools: Array.isArray(base.tools) && base.tools.length ? base.tools : frontmatterTools,
    references,
    scripts,
    source: base.source || {
      kind: "custom",
      path: skillPath
    }
  };
}
function validateParsedSkill(skill) {
  const errors = [];
  const folderPath = String(skill.config?.folderPath || "").trim();
  if (!skill.name.trim()) errors.push("Missing skill name");
  if (!skill.instructions?.trim()) errors.push("SKILL.md must include instruction body");
  if (!folderPath) errors.push("Missing folderPath");
  for (const relPath of skill.references || []) {
    if (!fs.existsSync(path.join(folderPath, relPath))) {
      errors.push(`Missing reference: ${relPath}`);
    }
  }
  for (const relPath of skill.scripts || []) {
    if (!fs.existsSync(path.join(folderPath, relPath))) {
      errors.push(`Missing script: ${relPath}`);
    }
  }
  return { valid: errors.length === 0, errors };
}
const SKILLS_FILENAME = "skills.json";
const REPO_SKILLS_DIR = path.resolve(process.cwd(), "skills");
function getSkillsPath(configDir) {
  return path.join(getConfigDir(), SKILLS_FILENAME);
}
function defaultSkillRecords() {
  const ts = Date.now();
  return [
    {
      id: "builtin-web-research",
      name: "Web Research",
      description: "Web search/fetch and HF capture workflow",
      type: "builtin",
      enabled: true,
      config: {
        tools: [
          "deep_research",
          "web_search",
          "web_fetch",
          "hf_daily_papers",
          "hf_paper"
        ]
      },
      createdAt: ts
    },
    {
      id: "builtin-code-ops",
      name: "Code Operations",
      description: "Read/write/edit/grep/glob/execute workflow",
      type: "builtin",
      enabled: true,
      config: {
        tools: [
          "list_directory",
          "read_file",
          "write_file",
          "edit_file",
          "glob",
          "grep",
          "execute_command",
          "generate_file"
        ]
      },
      createdAt: ts
    }
  ];
}
function getStoredSkills(configDir) {
  ensureConfigDir();
  const existing = loadJsonArray(getSkillsPath());
  if (existing.length) return existing;
  const defaults = defaultSkillRecords();
  saveJsonArray(getSkillsPath(), defaults);
  return defaults;
}
function saveStoredSkills(skills, configDir) {
  saveJsonArray(getSkillsPath(), skills);
}
function builtinRuntimeSkills() {
  const ts = Date.now();
  return [
    {
      id: "builtin-web-research",
      name: "Web Research",
      description: "Web search, fetch, and deep research workflow",
      type: "builtin",
      enabled: true,
      createdAt: ts,
      tools: [
        "deep_research",
        "web_search",
        "web_fetch",
        "hf_daily_papers",
        "hf_paper"
      ],
      instructions: "Use this skill when the task requires external research, source discovery, web retrieval, or Hugging Face paper capture. Prefer cited, source-grounded answers.",
      source: { kind: "builtin" },
      config: {}
    },
    {
      id: "builtin-code-ops",
      name: "Code Operations",
      description: "Workspace file editing and shell workflow",
      type: "builtin",
      enabled: true,
      createdAt: ts,
      tools: [
        "list_directory",
        "read_file",
        "write_file",
        "edit_file",
        "glob",
        "grep",
        "execute_command",
        "generate_file"
      ],
      instructions: "Use this skill when the task requires inspecting, editing, or executing code and workspace files. Use generate_file (not execute_command) to create binary files like DOCX, PDF, XLSX, or images. Stay within the project workspace and prefer direct file inspection before editing.",
      source: { kind: "builtin" },
      config: {}
    }
  ];
}
function serializeSkill(skill) {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description || "",
    type: skill.type === "custom" ? "custom" : "builtin",
    enabled: skill.enabled,
    createdAt: skill.createdAt,
    config: {
      ...skill.config || {},
      tools: skill.tools || [],
      instructions: skill.instructions || "",
      sourceKind: skill.source?.kind
    }
  };
}
function mergeWithStored(skill, storedById) {
  const stored = storedById.get(skill.id);
  if (!stored) return skill;
  return {
    ...skill,
    name: stored.name || skill.name,
    description: stored.description || skill.description,
    enabled: stored.enabled,
    config: { ...skill.config || {}, ...stored.config || {} },
    tools: Array.isArray(stored.config?.tools) && stored.config.tools.length ? stored.config.tools.map((item) => String(item)) : skill.tools,
    instructions: typeof stored.config?.instructions === "string" && stored.config.instructions.trim() ? stored.config.instructions : skill.instructions
  };
}
function discoverRepositorySkills(storedById) {
  if (!fs.existsSync(REPO_SKILLS_DIR) || !fs.statSync(REPO_SKILLS_DIR).isDirectory()) {
    return [];
  }
  return fs.readdirSync(REPO_SKILLS_DIR, { withFileTypes: true }).filter((entry2) => entry2.isDirectory()).map((entry2) => path.join(REPO_SKILLS_DIR, entry2.name)).filter((folderPath) => fs.existsSync(path.join(folderPath, "SKILL.md"))).map((folderPath) => {
    const id = `repo-skill-${path.basename(folderPath)}`;
    const base = {
      id,
      type: "builtin",
      enabled: false,
      source: { kind: "repository", path: folderPath }
    };
    try {
      return mergeWithStored(parseSkillManifest(folderPath, base), storedById);
    } catch {
      return mergeWithStored(
        {
          id,
          name: path.basename(folderPath),
          description: `Failed to parse ${folderPath}/SKILL.md`,
          type: "builtin",
          enabled: false,
          createdAt: Date.now(),
          config: { folderPath },
          instructions: "",
          tools: [],
          source: { kind: "repository", path: folderPath }
        },
        storedById
      );
    }
  });
}
function resolveCustomSkill(record) {
  const folderPath = String(record.config?.folderPath || "").trim();
  if (!folderPath) {
    return {
      id: record.id,
      name: record.name,
      description: record.description,
      type: "custom",
      enabled: record.enabled,
      createdAt: record.createdAt,
      config: record.config,
      instructions: "",
      tools: [],
      source: { kind: "custom" }
    };
  }
  try {
    return parseSkillManifest(folderPath, {
      id: record.id,
      name: record.name,
      description: record.description,
      type: "custom",
      enabled: record.enabled,
      createdAt: record.createdAt,
      source: { kind: "custom", path: folderPath },
      config: record.config
    });
  } catch {
    return {
      id: record.id,
      name: record.name,
      description: `${record.description || "Installed skill"} (folder unavailable)`,
      type: "custom",
      enabled: false,
      createdAt: record.createdAt,
      config: record.config,
      instructions: "",
      tools: [],
      source: { kind: "custom", path: folderPath }
    };
  }
}
function listSkills(configDir) {
  const stored = getStoredSkills();
  const storedById = new Map(stored.map((skill) => [skill.id, skill]));
  const builtins = builtinRuntimeSkills().map((skill) => mergeWithStored(skill, storedById));
  const repoSkills = discoverRepositorySkills(storedById);
  const customSkills = stored.filter((skill) => skill.type === "custom").map((skill) => resolveCustomSkill(skill));
  return [...customSkills, ...repoSkills, ...builtins].sort((a, b) => a.name.localeCompare(b.name));
}
function listActiveSkills(configDir) {
  return listSkills().filter((skill) => skill.enabled);
}
function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9.]+/g, " ").replace(/\s+/g, " ").trim();
}
function getConfigStringList(skill, key) {
  const value = skill.config?.[key];
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}
function getSkillAliases(skill) {
  const aliases = /* @__PURE__ */ new Set();
  const add = (value) => {
    const normalized = normalizeText(value);
    if (normalized.length >= 4) aliases.add(normalized);
  };
  add(skill.name);
  add(skill.id.replace(/^repo-skill-/, "").replace(/^builtin-/, "").replace(/[-_]+/g, " "));
  add(skill.source?.path ? path.basename(skill.source.path).replace(/\.[^.]+$/, "") : "");
  return Array.from(aliases);
}
function getSkillMatchTerms(skill) {
  const terms = /* @__PURE__ */ new Set();
  const addTokens = (value) => {
    String(value || "").toLowerCase().split(/[^a-z0-9.]+/).map((token) => token.trim()).filter((token) => token.length >= 3).forEach((token) => terms.add(token));
  };
  addTokens(skill.name);
  addTokens(skill.description);
  addTokens(skill.source?.path ? path.basename(skill.source.path) : "");
  if (terms.has("pdf")) terms.add(".pdf");
  if (terms.has("docx")) terms.add(".docx");
  if (terms.has("pptx")) terms.add(".pptx");
  if (terms.has("xlsx")) terms.add(".xlsx");
  return Array.from(terms);
}
function getSkillCatalog(skills) {
  return skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description || "",
    tools: skill.tools || []
  }));
}
function getActiveSkillToolNames(skills) {
  return Array.from(
    new Set(
      skills.flatMap(
        (skill) => Array.isArray(skill.tools) ? skill.tools.map((tool) => String(tool)) : []
      )
    )
  );
}
function selectMatchedSkills(skills, input) {
  const prompt = String(input.prompt || "").trim().toLowerCase();
  const userTexts = Array.isArray(input.messages) ? input.messages.filter((message) => message?.role === "user").map(
    (message) => String(message?.content || "").trim().toLowerCase()
  ).filter(Boolean) : [];
  const fullText = [prompt, ...userTexts].filter(Boolean).join("\n");
  const normalizedPrompt = normalizeText(prompt);
  const normalizedFullText = normalizeText(fullText);
  if (!fullText) return [];
  const scored = skills.map((skill) => {
    const matchPhrases = getConfigStringList(skill, "matchPhrases").map(normalizeText);
    const denyPhrases = getConfigStringList(skill, "denyPhrases").map(normalizeText);
    const fileExtensions = getConfigStringList(skill, "fileExtensions").map(
      (item) => item.startsWith(".") ? item.toLowerCase() : `.${item.toLowerCase()}`
    );
    const aliases = getSkillAliases(skill);
    if (denyPhrases.some((phrase) => phrase && normalizedFullText.includes(phrase))) {
      return { skill, score: -1 };
    }
    const terms = getSkillMatchTerms(skill);
    let score = 0;
    let explicitMatch = false;
    for (const phrase of matchPhrases) {
      if (phrase && normalizedFullText.includes(phrase)) {
        score += normalizedPrompt.includes(phrase) ? 18 : 12;
        explicitMatch = true;
      }
    }
    for (const alias of aliases) {
      if (alias && normalizedFullText.includes(alias)) {
        score += normalizedPrompt.includes(alias) ? 14 : 10;
        explicitMatch = true;
      }
    }
    for (const extension of fileExtensions) {
      if (extension && fullText.includes(extension)) {
        score += prompt.includes(extension) ? 12 : 8;
        explicitMatch = true;
      }
    }
    const allowGenericTermScoring = matchPhrases.length === 0 || explicitMatch;
    if (allowGenericTermScoring) {
      for (const term of terms) {
        if (prompt.includes(term)) {
          score += term.startsWith(".") ? 8 : 6;
        } else if (fullText.includes(term)) {
          score += term.startsWith(".") ? 4 : 2;
        }
      }
    }
    const sourcePath = String(skill.source?.path || "").toLowerCase();
    if (sourcePath && /\.(pdf|docx|pptx|xlsx)\b/.test(fullText)) {
      if (sourcePath.includes("pdf") && fullText.includes(".pdf")) score += 10;
      if (sourcePath.includes("docx") && fullText.includes(".docx")) score += 10;
      if (sourcePath.includes("pptx") && fullText.includes(".pptx")) score += 10;
      if (sourcePath.includes("xlsx") && fullText.includes(".xlsx")) score += 10;
    }
    for (const tool of skill.tools || []) {
      const toolName = String(tool).toLowerCase();
      if (toolName && fullText.includes(toolName.replace(/_/g, " "))) {
        score += 3;
      }
    }
    return { skill, score };
  }).filter((entry2) => entry2.score > 0).sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name));
  return scored.slice(0, 4).map((entry2) => entry2.skill);
}
function validateSkillPath(folderPath) {
  const errors = [];
  if (!folderPath) {
    errors.push("folderPath is required");
  } else {
    if (!fs.existsSync(folderPath)) errors.push("Folder does not exist");
    if (fs.existsSync(folderPath) && !fs.statSync(folderPath).isDirectory())
      errors.push("Path is not a directory");
    if (fs.existsSync(folderPath) && !fs.existsSync(path.join(folderPath, "SKILL.md")))
      errors.push("Missing SKILL.md");
  }
  if (errors.length > 0) return { valid: false, errors };
  try {
    const parsed = parseSkillManifest(folderPath, {
      id: `skill-${path.basename(path.resolve(folderPath))}`,
      type: "custom",
      enabled: true,
      source: { kind: "custom", path: path.resolve(folderPath) }
    });
    return validateParsedSkill(parsed);
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}
function installSkill(folderPath, configDir) {
  const skillPath = path.resolve(folderPath);
  const skill = parseSkillManifest(skillPath, {
    id: `skill-${randomUUID()}`,
    type: "custom",
    enabled: true,
    createdAt: Date.now(),
    source: { kind: "custom", path: skillPath },
    config: { folderPath: skillPath }
  });
  const stored = getStoredSkills();
  stored.unshift(serializeSkill(skill));
  saveStoredSkills(stored);
  return skill;
}
function deleteSkill(id, configDir) {
  const skills = getStoredSkills();
  saveStoredSkills(
    skills.filter((item) => item.id !== id)
  );
  return { success: true };
}
function setSkillEnabled(id, enabled, configDir) {
  const stored = getStoredSkills();
  const idx = stored.findIndex((item) => item.id === id);
  if (idx !== -1) {
    stored[idx] = { ...stored[idx], enabled };
    saveStoredSkills(stored);
    return listSkills().find((item) => item.id === id) || null;
  }
  const discovered = listSkills().find((item) => item.id === id);
  if (!discovered) return null;
  const next = { ...discovered, enabled };
  stored.unshift(serializeSkill(next));
  saveStoredSkills(stored);
  return next;
}
const LOGS_DIRNAME = "logs";
function getLogsDir(configDir) {
  return path.join(getConfigDir(), LOGS_DIRNAME);
}
function ensureLogsDir(configDir) {
  const dir = getLogsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
function listLogs(configDir) {
  const dir = ensureLogsDir();
  const files = fs.readdirSync(dir).map((name) => path.join(dir, name)).filter((item) => fs.statSync(item).isFile()).map((item) => {
    const stat = fs.statSync(item);
    return {
      name: path.basename(item),
      path: item,
      size: stat.size,
      mtime: stat.mtime.toISOString()
    };
  }).sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)));
  return { files, directory: dir };
}
async function isLogsEnabled() {
  const settings2 = await getSettings();
  return settings2.devLogsEnabled !== false;
}
async function setLogsEnabled(enabled) {
  await upsertSettings({ devLogsEnabled: enabled });
  return { success: true, enabled };
}
function exportLogs(configDir) {
  const dir = ensureLogsDir();
  const exportPath = path.join(dir, `open-analyst-logs-${Date.now()}.txt`);
  const files = fs.readdirSync(dir).map((name) => path.join(dir, name)).filter((item) => fs.statSync(item).isFile() && item !== exportPath);
  const bodyText = files.map((filePath) => {
    const name = path.basename(filePath);
    const text2 = fs.readFileSync(filePath, "utf8");
    return `
===== ${name} =====
${text2}`;
  }).join("\n");
  fs.writeFileSync(exportPath, bodyText || "No logs available.", "utf8");
  return { success: true, path: exportPath };
}
function clearLogs(configDir) {
  const dir = ensureLogsDir();
  const files = fs.readdirSync(dir).map((name) => path.join(dir, name)).filter((item) => fs.statSync(item).isFile());
  let deletedCount = 0;
  for (const filePath of files) {
    fs.unlinkSync(filePath);
    deletedCount += 1;
  }
  return { success: true, deletedCount };
}
async function loader$o() {
  const settings2 = await getSettings();
  return {
    credentials: listCredentials(),
    mcpServers: listMcpServers(),
    mcpPresets: getMcpPresets(),
    skills: listSkills(),
    logsEnabled: await isLogsEnabled(),
    currentModel: settings2.model
  };
}
const _app_settings = UNSAFE_withComponentProps(function SettingsRoute() {
  const data = useLoaderData();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "api";
  return /* @__PURE__ */ jsx(SettingsPanel, {
    isOpen: true,
    onClose: () => navigate(-1),
    activeTab,
    onTabChange: (tab) => setSearchParams({
      tab
    }, {
      replace: true
    }),
    initialData: data
  });
});
const route6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: _app_settings,
  loader: loader$o
}, Symbol.toStringTag, { value: "Module" }));
async function loader$n() {
  return Response.json({
    ok: true,
    service: "open-analyst-headless"
  });
}
const route7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$n
}, Symbol.toStringTag, { value: "Module" }));
async function loader$m() {
  const settings2 = await getSettings();
  return Response.json(settings2);
}
async function action$q({
  request
}) {
  if (request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const body = await request.json();
  const settings2 = await upsertSettings(body);
  return Response.json({
    success: true,
    config: settings2
  });
}
const route8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$q,
  loader: loader$m
}, Symbol.toStringTag, { value: "Module" }));
async function loader$l() {
  const settings2 = await getSettings();
  return Response.json({
    workingDir: settings2.workingDir,
    workingDirType: settings2.workingDirType || "local",
    s3Uri: settings2.s3Uri || ""
  });
}
async function action$p({
  request
}) {
  if (request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const body = await request.json();
  const inputPath = String(body.path || "").trim();
  const workingDirType = String(body.workingDirType || (inputPath.startsWith("s3://") ? "s3" : "local"));
  if (!inputPath) {
    return Response.json({
      success: false,
      error: "path is required"
    }, {
      status: 400
    });
  }
  let updates;
  if (workingDirType === "local") {
    const resolved = path.resolve(inputPath);
    if (!fs.existsSync(resolved)) {
      return Response.json({
        success: false,
        error: `Path not found: ${resolved}`
      }, {
        status: 400
      });
    }
    updates = {
      workingDir: resolved,
      workingDirType: "local",
      s3Uri: ""
    };
  } else {
    updates = {
      workingDir: inputPath,
      workingDirType: "s3",
      s3Uri: inputPath
    };
  }
  await upsertSettings(updates);
  return Response.json({
    success: true,
    path: updates.workingDir,
    workingDirType: updates.workingDirType
  });
}
const route9 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$p,
  loader: loader$l
}, Symbol.toStringTag, { value: "Module" }));
const TOOL_DEFS = [
  {
    type: "function",
    function: {
      name: "list_directory",
      description: "List directory contents",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a UTF-8 text file",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write a UTF-8 text file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" }
        },
        required: ["path", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Replace first occurrence of old_string with new_string in a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          old_string: { type: "string" },
          new_string: { type: "string" }
        },
        required: ["path", "old_string", "new_string"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "glob",
      description: "Find files with a glob pattern",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string" },
          path: { type: "string" }
        },
        required: ["pattern", "path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "grep",
      description: "Search file contents by regex",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string" },
          path: { type: "string" }
        },
        required: ["pattern", "path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "web_fetch",
      description: "Fetch URL content from the web with binary-safe handling and automatic source capture",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string" },
          collectionName: { type: "string" }
        },
        required: ["url"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for a query and return summary results",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "hf_daily_papers",
      description: "Fetch Hugging Face daily papers for a date (YYYY-MM-DD) and capture them",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string" },
          collectionName: { type: "string" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "hf_paper",
      description: "Fetch a Hugging Face paper by arXiv id and capture it",
      parameters: {
        type: "object",
        properties: {
          arxiv_id: { type: "string" },
          collectionName: { type: "string" }
        },
        required: ["arxiv_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "deep_research",
      description: "Perform multi-step deep research: decompose query, search/fetch multiple sources, synthesize cited report, and store it.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string" },
          breadth: { type: "number" },
          fetch_limit: { type: "number" },
          collectionName: { type: "string" }
        },
        required: ["question"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "collection_overview",
      description: "List what is in the active collection (or project) and summarize source contents.",
      parameters: {
        type: "object",
        properties: {
          collectionId: { type: "string" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "collection_artifact_metadata",
      description: "List stored artifact metadata for the active collection or project, including storage URIs and artifact links.",
      parameters: {
        type: "object",
        properties: {
          collectionId: { type: "string" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "capture_artifact",
      description: "Capture a generated workspace file into the project store and artifact backend.",
      parameters: {
        type: "object",
        properties: {
          relativePath: { type: "string" },
          title: { type: "string" },
          collectionId: { type: "string" },
          collectionName: { type: "string" }
        },
        required: ["relativePath"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_file",
      description: "Generate a binary or structured file by running Python code with an OUTPUT_PATH target",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          python_code: { type: "string" }
        },
        required: ["path", "python_code"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_command",
      description: "Run a shell command in the working directory",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
          cwd: { type: "string" }
        },
        required: ["command", "cwd"]
      }
    }
  }
];
function listAvailableTools() {
  return TOOL_DEFS.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description
  }));
}
async function loader$k() {
  return Response.json({
    tools: listAvailableTools()
  });
}
const route10 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$k
}, Symbol.toStringTag, { value: "Module" }));
async function loader$j() {
  return Response.json({
    credentials: listCredentials()
  });
}
async function action$o({
  request
}) {
  if (request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const body = await request.json();
  if (!String(body.name || "").trim() || !String(body.username || "").trim()) {
    return Response.json({
      error: "name and username are required"
    }, {
      status: 400
    });
  }
  const credential = createCredential(body);
  return Response.json({
    credential
  }, {
    status: 201
  });
}
const route11 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$o,
  loader: loader$j
}, Symbol.toStringTag, { value: "Module" }));
async function action$n({
  request,
  params
}) {
  const id = params.id;
  if (request.method === "PATCH") {
    const body = await request.json();
    const credential = updateCredential(id, body);
    if (!credential) {
      return Response.json({
        error: `Credential not found: ${id}`
      }, {
        status: 404
      });
    }
    return Response.json({
      credential
    });
  }
  if (request.method === "DELETE") {
    deleteCredential(id);
    return Response.json({
      success: true
    });
  }
  return Response.json({
    error: "Method not allowed"
  }, {
    status: 405
  });
}
const route12 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$n
}, Symbol.toStringTag, { value: "Module" }));
async function loader$i() {
  return Response.json({
    presets: getMcpPresets()
  });
}
const route13 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$i
}, Symbol.toStringTag, { value: "Module" }));
async function loader$h() {
  return Response.json({
    servers: listMcpServers()
  });
}
async function action$m({
  request
}) {
  if (request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const body = await request.json();
  const server = saveMcpServer(body);
  return Response.json({
    server
  });
}
const route14 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$m,
  loader: loader$h
}, Symbol.toStringTag, { value: "Module" }));
async function action$l({
  request,
  params
}) {
  if (request.method !== "DELETE") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  deleteMcpServer(params.id);
  return Response.json({
    success: true
  });
}
const route15 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$l
}, Symbol.toStringTag, { value: "Module" }));
async function loader$g() {
  return Response.json({
    statuses: await getMcpStatus()
  });
}
const route16 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$g
}, Symbol.toStringTag, { value: "Module" }));
async function loader$f() {
  return Response.json({
    tools: await getMcpTools()
  });
}
const route17 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$f
}, Symbol.toStringTag, { value: "Module" }));
async function loader$e() {
  return Response.json({
    skills: listSkills()
  });
}
const route18 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$e
}, Symbol.toStringTag, { value: "Module" }));
async function action$k({
  request
}) {
  if (request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const body = await request.json();
  const folderPath = String(body.folderPath || "").trim();
  const result = validateSkillPath(folderPath);
  return Response.json(result);
}
const route19 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$k
}, Symbol.toStringTag, { value: "Module" }));
async function action$j({
  request
}) {
  if (request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const body = await request.json();
  const folderPath = String(body.folderPath || "").trim();
  if (!folderPath) {
    return Response.json({
      error: "folderPath is required"
    }, {
      status: 400
    });
  }
  const skillPath = path.resolve(folderPath);
  if (!fs.existsSync(skillPath) || !fs.statSync(skillPath).isDirectory()) {
    return Response.json({
      error: "folderPath must be an existing directory"
    }, {
      status: 400
    });
  }
  if (!fs.existsSync(path.join(skillPath, "SKILL.md"))) {
    return Response.json({
      error: "SKILL.md not found in folderPath"
    }, {
      status: 400
    });
  }
  const skill = installSkill(folderPath);
  return Response.json({
    success: true,
    skill
  });
}
const route20 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$j
}, Symbol.toStringTag, { value: "Module" }));
async function action$i({
  request,
  params
}) {
  if (request.method !== "DELETE") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  deleteSkill(params.id);
  return Response.json({
    success: true
  });
}
const route21 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$i
}, Symbol.toStringTag, { value: "Module" }));
async function action$h({
  request,
  params
}) {
  if (request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const body = await request.json();
  const enabled = body.enabled !== false;
  const skill = setSkillEnabled(params.id, enabled);
  if (!skill) {
    return Response.json({
      error: `Skill not found: ${params.id}`
    }, {
      status: 404
    });
  }
  return Response.json({
    success: true,
    skill
  });
}
const route22 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$h
}, Symbol.toStringTag, { value: "Module" }));
async function loader$d() {
  const result = listLogs();
  return Response.json(result);
}
const route23 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$d
}, Symbol.toStringTag, { value: "Module" }));
async function loader$c() {
  return Response.json({
    enabled: await isLogsEnabled()
  });
}
async function action$g({
  request
}) {
  if (request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const body = await request.json();
  const result = await setLogsEnabled(body.enabled !== false);
  return Response.json(result);
}
const route24 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$g,
  loader: loader$c
}, Symbol.toStringTag, { value: "Module" }));
async function action$f({
  request
}) {
  if (request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const result = exportLogs();
  return Response.json(result);
}
const route25 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$f
}, Symbol.toStringTag, { value: "Module" }));
async function action$e({
  request
}) {
  if (request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const result = clearLogs();
  return Response.json(result);
}
const route26 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$e
}, Symbol.toStringTag, { value: "Module" }));
async function loader$b() {
  const projects2 = await listProjects();
  return Response.json({
    projects: projects2
  });
}
async function action$d({
  request
}) {
  if (request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const body = await request.json();
  const project = await createProject({
    name: body.name,
    description: body.description,
    datastores: body.datastores,
    workspaceLocalRoot: body.workspaceLocalRoot,
    artifactBackend: body.artifactBackend,
    artifactLocalRoot: body.artifactLocalRoot,
    artifactS3Bucket: body.artifactS3Bucket,
    artifactS3Region: body.artifactS3Region,
    artifactS3Endpoint: body.artifactS3Endpoint,
    artifactS3Prefix: body.artifactS3Prefix
  });
  await mkdir(resolveProjectWorkspace(project), {
    recursive: true
  });
  await upsertSettings({
    activeProjectId: project.id
  });
  return Response.json({
    project,
    activeProjectId: project.id
  }, {
    status: 201
  });
}
const route27 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$d,
  loader: loader$b
}, Symbol.toStringTag, { value: "Module" }));
async function action$c({
  request
}) {
  if (request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const body = await request.json();
  const projectId = String(body.projectId || "").trim();
  if (!projectId) {
    return Response.json({
      error: "projectId is required"
    }, {
      status: 400
    });
  }
  const project = await getProject(projectId);
  if (!project) {
    return Response.json({
      error: `Project not found: ${projectId}`
    }, {
      status: 404
    });
  }
  await upsertSettings({
    activeProjectId: projectId
  });
  return Response.json({
    success: true,
    activeProjectId: projectId
  });
}
const route28 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$c
}, Symbol.toStringTag, { value: "Module" }));
async function loader$a({
  params
}) {
  const project = await getProject(params.projectId);
  if (!project) {
    return Response.json({
      error: `Project not found: ${params.projectId}`
    }, {
      status: 404
    });
  }
  return Response.json({
    project
  });
}
async function action$b({
  request,
  params
}) {
  const projectId = params.projectId;
  if (request.method === "PATCH") {
    const body = await request.json();
    try {
      const project = await updateProject(projectId, body);
      await mkdir(resolveProjectWorkspace(project), {
        recursive: true
      });
      return Response.json({
        project
      });
    } catch (err) {
      return Response.json({
        error: err instanceof Error ? err.message : String(err)
      }, {
        status: 404
      });
    }
  }
  if (request.method === "DELETE") {
    try {
      const deleted = await deleteProject(projectId);
      const projects2 = await listProjects();
      const newActiveId = projects2[0]?.id || null;
      await upsertSettings({
        activeProjectId: newActiveId
      });
      return Response.json({
        ...deleted,
        activeProjectId: newActiveId ?? ""
      });
    } catch (err) {
      return Response.json({
        error: err instanceof Error ? err.message : String(err)
      }, {
        status: 404
      });
    }
  }
  return Response.json({
    error: "Method not allowed"
  }, {
    status: 405
  });
}
const route29 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$b,
  loader: loader$a
}, Symbol.toStringTag, { value: "Module" }));
async function loader$9({
  params,
  request
}) {
  const url = new URL(request.url);
  const collectionId = url.searchParams.get("collectionId") || void 0;
  const [collections2, documents2, documentCounts] = await Promise.all([listCollections(params.projectId), listDocuments(params.projectId, collectionId), getCollectionDocumentCounts(params.projectId)]);
  return {
    collections: collections2,
    documents: documents2,
    documentCounts
  };
}
const route30 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$9
}, Symbol.toStringTag, { value: "Module" }));
async function loader$8({
  params
}) {
  const collections2 = await listCollections(params.projectId);
  return Response.json({
    collections: collections2
  });
}
async function action$a({
  request,
  params
}) {
  if (request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const body = await request.json();
  const collection = await createCollection(params.projectId, {
    name: body.name,
    description: body.description
  });
  return Response.json({
    collection
  }, {
    status: 201
  });
}
const route31 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$a,
  loader: loader$8
}, Symbol.toStringTag, { value: "Module" }));
async function action$9({
  request,
  params
}) {
  if (request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const body = await request.json();
  const name = String(body.name || "").trim();
  if (!name) {
    return Response.json({
      error: "Collection name is required"
    }, {
      status: 400
    });
  }
  const collection = await ensureCollection(params.projectId, name, String(body.description || ""));
  return Response.json({
    collection
  });
}
const route32 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$9
}, Symbol.toStringTag, { value: "Module" }));
async function refreshDocumentKnowledgeIndex(projectId, documentId) {
  const document2 = await getDocument(projectId, documentId);
  if (!document2) {
    return null;
  }
  const metadata = document2.metadata && typeof document2.metadata === "object" ? { ...document2.metadata } : {};
  const input = buildKnowledgeEmbeddingText({
    title: document2.title,
    content: document2.content
  });
  if (!input) {
    const updated = await updateDocumentMetadata(projectId, documentId, {
      ...metadata,
      knowledgeIndexStatus: "skipped",
      knowledgeIndexError: "No indexable text was available for this document."
    });
    await updateDocumentEmbedding(projectId, documentId, null);
    return updated;
  }
  if (!isKnowledgeEmbeddingConfigured()) {
    const updated = await updateDocumentMetadata(projectId, documentId, {
      ...metadata,
      knowledgeIndexStatus: "skipped",
      knowledgeIndexError: "LITELLM_EMBEDDING_MODEL is not configured for Open Analyst knowledge."
    });
    await updateDocumentEmbedding(projectId, documentId, null);
    return updated;
  }
  try {
    const [embedding] = await embedKnowledgeTexts([input]);
    await updateDocumentEmbedding(projectId, documentId, embedding || null);
    return await updateDocumentMetadata(projectId, documentId, {
      ...metadata,
      knowledgeIndexStatus: "indexed",
      knowledgeIndexError: null,
      knowledgeIndexedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (error) {
    await updateDocumentEmbedding(projectId, documentId, null);
    return await updateDocumentMetadata(projectId, documentId, {
      ...metadata,
      knowledgeIndexStatus: "error",
      knowledgeIndexError: error instanceof Error ? error.message : String(error)
    });
  }
}
async function loader$7({
  request,
  params
}) {
  const url = new URL(request.url);
  const collectionId = url.searchParams.get("collectionId") || "";
  const documents2 = await listDocuments(params.projectId, collectionId || void 0);
  return Response.json({
    documents: documents2
  });
}
async function action$8({
  request,
  params
}) {
  if (request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const body = await request.json();
  const document2 = await createDocument(params.projectId, {
    collectionId: body.collectionId,
    title: body.title,
    sourceType: body.sourceType,
    sourceUri: body.sourceUri,
    content: body.content,
    metadata: body.metadata
  });
  const indexed = await refreshDocumentKnowledgeIndex(params.projectId, document2.id);
  return Response.json({
    document: indexed || document2
  }, {
    status: 201
  });
}
const route33 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$8,
  loader: loader$7
}, Symbol.toStringTag, { value: "Module" }));
const DEFAULT_ARTIFACT_PREFIX = "open-analyst-artifacts";
function sanitizeFilename$2(value) {
  return String(value || "artifact").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 120) || "artifact";
}
function getS3Client(input) {
  return new S3Client({
    region: input.region || env.ARTIFACT_S3_REGION,
    endpoint: input.endpoint || env.ARTIFACT_S3_ENDPOINT || void 0
  });
}
function parseS3Uri(uri) {
  const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!match) throw new Error(`Invalid S3 URI: ${uri}`);
  return { bucket: match[1], key: match[2] };
}
function inferMimeType$1(filename, fallback = "application/octet-stream") {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html; charset=utf-8";
  return fallback;
}
async function streamToBuffer(value) {
  if (!value) return Buffer.alloc(0);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (Buffer.isBuffer(value)) return value;
  if (typeof value.transformToByteArray === "function") {
    return Buffer.from(await value.transformToByteArray());
  }
  const chunks = [];
  for await (const chunk of value) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
async function storeArtifact(input) {
  const backend = resolveProjectArtifactConfig(input.project);
  const filename = sanitizeFilename$2(input.filename);
  if (backend.backend === "s3") {
    if (!backend.bucket) {
      throw new Error("Artifact S3 bucket is required for this project");
    }
    const key = `${backend.keyPrefix || DEFAULT_ARTIFACT_PREFIX}/${Date.now()}-${filename}`.replace(/^\/+|\/+$/g, "");
    const client = getS3Client({
      region: backend.region,
      endpoint: backend.endpoint
    });
    await client.send(
      new PutObjectCommand({
        Bucket: backend.bucket,
        Key: key,
        Body: input.buffer,
        ContentType: input.mimeType || inferMimeType$1(filename)
      })
    );
    return {
      backend: "s3",
      storageUri: `s3://${backend.bucket}/${key}`,
      filename,
      mimeType: input.mimeType || inferMimeType$1(filename),
      size: input.buffer.length
    };
  }
  const dir = backend.localArtifactDir || path.join(getConfigDir(), "captures", input.project.id);
  await fs$1.mkdir(dir, { recursive: true });
  const fullPath = path.join(dir, `${Date.now()}-${filename}`);
  await fs$1.writeFile(fullPath, input.buffer);
  return {
    backend: "local",
    storageUri: fullPath,
    filename,
    mimeType: input.mimeType || inferMimeType$1(filename),
    size: input.buffer.length
  };
}
async function readArtifact(input) {
  const storageUri = String(input.storageUri || "").trim();
  if (!storageUri) throw new Error("storageUri is required");
  if (storageUri.startsWith("s3://")) {
    const { bucket, key } = parseS3Uri(storageUri);
    const client = getS3Client({ region: env.ARTIFACT_S3_REGION, endpoint: env.ARTIFACT_S3_ENDPOINT });
    const result = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key
      })
    );
    const body2 = await streamToBuffer(result.Body);
    const filename2 = input.filename || path.basename(key);
    const mimeType2 = result.ContentType || input.mimeType || inferMimeType$1(filename2);
    return { body: body2, filename: filename2, mimeType: mimeType2, size: body2.length };
  }
  const normalized = storageUri.startsWith("file://") ? storageUri.slice("file://".length) : storageUri;
  const body = await fs$1.readFile(normalized);
  const filename = input.filename || path.basename(normalized);
  const mimeType = input.mimeType || inferMimeType$1(filename);
  return { body, filename, mimeType, size: body.length };
}
function getMetadataValue(metadata, key) {
  if (!metadata || typeof metadata !== "object") return void 0;
  const value = metadata[key];
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  return trimmed || void 0;
}
function encodeDispositionFilename(filename) {
  return filename.replace(/["\\]/g, "_");
}
async function loader$6({
  params,
  request
}) {
  const document2 = await getDocument(params.projectId, params.documentId);
  if (!document2) {
    return Response.json({
      error: "Document not found"
    }, {
      status: 404
    });
  }
  if (!document2.storageUri) {
    return Response.json({
      error: "Document has no artifact"
    }, {
      status: 404
    });
  }
  const filename = getMetadataValue(document2.metadata, "filename") || document2.title || "artifact";
  const mimeType = getMetadataValue(document2.metadata, "mimeType") || "application/octet-stream";
  try {
    const artifact = await readArtifact({
      storageUri: document2.storageUri,
      filename,
      mimeType
    });
    const url = new URL(request.url);
    const disposition = url.searchParams.get("download") === "1" ? "attachment" : "inline";
    return new Response(artifact.body, {
      headers: {
        "Content-Type": artifact.mimeType,
        "Content-Length": String(artifact.size),
        "Cache-Control": "private, max-age=60",
        "Content-Disposition": `${disposition}; filename="${encodeDispositionFilename(artifact.filename)}"`
      }
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : String(error)
    }, {
      status: 502
    });
  }
}
const route34 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$6
}, Symbol.toStringTag, { value: "Module" }));
function copyContentHeaders(source, target) {
  for (const key of ["content-type", "content-length", "content-disposition", "cache-control", "etag", "last-modified"]) {
    const value = source.get(key);
    if (value) target.set(key, value);
  }
}
async function loader$5({
  params,
  request
}) {
  const project = await getProject(params.projectId);
  if (!project) {
    return Response.json({
      error: "Project not found"
    }, {
      status: 404
    });
  }
  const server = getAnalystMcpServer();
  if (!server?.url) {
    return Response.json({
      error: "Analyst MCP is not configured"
    }, {
      status: 503
    });
  }
  const apiKey = String(server.headers?.["x-api-key"] || "").trim();
  if (!apiKey) {
    return Response.json({
      error: "Analyst MCP API key is missing"
    }, {
      status: 503
    });
  }
  let targetUrl;
  try {
    const mcpUrl = new URL(server.url);
    targetUrl = new URL(`/api/papers/${encodeURIComponent(params.identifier)}/artifact`, `${mcpUrl.protocol}//${mcpUrl.host}`);
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : String(error)
    }, {
      status: 500
    });
  }
  const incoming = new URL(request.url);
  for (const [key, value] of incoming.searchParams.entries()) {
    targetUrl.searchParams.set(key, value);
  }
  const response = await fetch(targetUrl, {
    headers: {
      "x-api-key": apiKey,
      ...buildProjectMcpHeaders(project, incoming.origin)
    }
  });
  if (!response.ok) {
    const body = await response.text();
    return Response.json({
      error: body || `Analyst MCP artifact request failed with HTTP ${response.status}`
    }, {
      status: response.status
    });
  }
  const headers = new Headers();
  copyContentHeaders(response.headers, headers);
  return new Response(response.body, {
    status: response.status,
    headers
  });
}
const route35 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$5
}, Symbol.toStringTag, { value: "Module" }));
function getLegacyProjectWorkspace(projectId) {
  return path.join(getDefaultWorkspaceRoot(), projectId);
}
function validateProjectId(projectId) {
  const trimmed = String(projectId || "").trim();
  if (!trimmed) throw new Error("Project ID is required");
  if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\") || trimmed.startsWith(".")) {
    throw new Error("Invalid project ID: must not contain path separators or traversal sequences");
  }
}
async function getProjectWorkspace(projectId) {
  validateProjectId(projectId);
  const project = await getProject(projectId);
  const workspaceDir = project ? resolveProjectWorkspace(project) : getLegacyProjectWorkspace(projectId);
  if (!fs.existsSync(workspaceDir)) {
    fs.mkdirSync(workspaceDir, { recursive: true });
  }
  return workspaceDir;
}
async function resolveInWorkspace(projectId, relativePath) {
  validateProjectId(projectId);
  const workspaceDir = await getProjectWorkspace(projectId);
  const input = String(relativePath || ".").trim();
  if (path.isAbsolute(input)) {
    const resolved2 = path.resolve(input);
    const normalizedWorkspace2 = path.resolve(workspaceDir);
    if (!resolved2.startsWith(normalizedWorkspace2)) {
      throw new Error("Path is outside workspace directory");
    }
    return resolved2;
  }
  const candidate = path.join(workspaceDir, input);
  const resolved = path.resolve(candidate);
  const normalizedWorkspace = path.resolve(workspaceDir);
  if (!resolved.startsWith(normalizedWorkspace)) {
    throw new Error("Path is outside workspace directory");
  }
  return resolved;
}
function inferExtension$1(contentType) {
  const value = String(contentType || "").toLowerCase();
  if (value.includes("pdf")) return ".pdf";
  if (value.includes("json")) return ".json";
  if (value.includes("html")) return ".html";
  if (value.includes("xml")) return ".xml";
  if (value.includes("markdown")) return ".md";
  if (value.includes("plain")) return ".txt";
  if (value.includes("wordprocessingml")) return ".docx";
  return ".bin";
}
function inferMimeType(filename, fallback = "application/octet-stream") {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html; charset=utf-8";
  return fallback;
}
function sanitizeFilename$1(value) {
  return String(value || "artifact").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "artifact";
}
function inferTextFromBuffer$1(buffer, mimeType, filename) {
  const type = String(mimeType || "").toLowerCase();
  const lowerName = String(filename || "").toLowerCase();
  const isOfficeArchive = type.includes("openxmlformats") || lowerName.endsWith(".docx") || lowerName.endsWith(".pptx") || lowerName.endsWith(".xlsx");
  if (isOfficeArchive) {
    return "";
  }
  if (type.includes("text/") || type.includes("json") || type.includes("xml") || type.includes("yaml") || type.includes("csv") || lowerName.endsWith(".txt") || lowerName.endsWith(".md") || lowerName.endsWith(".json") || lowerName.endsWith(".csv") || lowerName.endsWith(".xml") || lowerName.endsWith(".yml") || lowerName.endsWith(".yaml") || lowerName.endsWith(".html") || lowerName.endsWith(".htm")) {
    return buffer.toString("utf8");
  }
  return "";
}
async function action$7({
  request,
  params
}) {
  if (request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const body = await request.json();
  const projectId = params.projectId;
  const project = await getProject(projectId);
  if (!project) {
    return Response.json({
      error: "Project not found"
    }, {
      status: 404
    });
  }
  const relativePath = String(body.relativePath || body.path || "").trim();
  if (!relativePath) {
    return Response.json({
      error: "relativePath is required"
    }, {
      status: 400
    });
  }
  const workspacePath = await resolveInWorkspace(projectId, relativePath);
  const stat = await fs$1.stat(workspacePath).catch(() => null);
  if (!stat || !stat.isFile()) {
    return Response.json({
      error: "Artifact file not found in project workspace"
    }, {
      status: 404
    });
  }
  const requestedFilename = String(body.filename || "").trim();
  const extension = path.extname(requestedFilename || workspacePath) || inferExtension$1(String(body.mimeType || ""));
  const storedName = `${sanitizeFilename$1(path.basename(requestedFilename || workspacePath, path.extname(requestedFilename || workspacePath)))}${extension}`;
  const mimeType = inferMimeType(requestedFilename || workspacePath, String(body.mimeType || "application/octet-stream"));
  const buffer = await fs$1.readFile(workspacePath);
  const artifact = await storeArtifact({
    project,
    filename: storedName,
    mimeType,
    buffer
  });
  const collectionName = String(body.collectionName || "Artifacts").trim();
  const collectionId = String(body.collectionId || "").trim();
  const collection = collectionId ? {
    id: collectionId
  } : await ensureCollection(projectId, collectionName, "Generated artifacts");
  const title = String(body.title || "").trim() || path.basename(requestedFilename || workspacePath);
  const content = inferTextFromBuffer$1(buffer, mimeType, storedName);
  const document2 = await createDocument(projectId, {
    collectionId: collection.id,
    title,
    sourceType: String(body.sourceType || "generated"),
    sourceUri: artifact.storageUri.startsWith("s3://") ? artifact.storageUri : `file://${artifact.storageUri}`,
    storageUri: artifact.storageUri,
    content: content || `[Generated artifact stored at ${artifact.storageUri}]`,
    metadata: {
      filename: artifact.filename,
      mimeType: artifact.mimeType,
      bytes: artifact.size,
      storageBackend: artifact.backend,
      workspacePath,
      relativePath,
      extractedTextLength: content.length,
      ...body.metadata && typeof body.metadata === "object" ? body.metadata : {}
    }
  });
  const links = buildProjectArtifactUrls(projectId, document2.id);
  const updated = await updateDocumentMetadata(projectId, document2.id, {
    ...document2.metadata && typeof document2.metadata === "object" ? document2.metadata : {},
    artifactUrl: links.artifactUrl,
    downloadUrl: links.downloadUrl,
    workspaceSlug: project.workspaceSlug
  });
  const indexed = await refreshDocumentKnowledgeIndex(projectId, document2.id);
  return Response.json({
    document: indexed || updated
  }, {
    status: 201
  });
}
const route36 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$7
}, Symbol.toStringTag, { value: "Module" }));
function validateHttpUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) throw new Error("url is required");
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Invalid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https URLs are supported");
  }
  return parsed.toString();
}
async function action$6({
  request,
  params
}) {
  if (request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const body = await request.json();
  const url = validateHttpUrl(body.url);
  const fetchRes = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "open-analyst-headless"
    }
  });
  const contentType = fetchRes.headers.get("content-type") || "unknown";
  const content = await fetchRes.text();
  const title = String(body.title || url);
  const document2 = await createDocument(params.projectId, {
    collectionId: body.collectionId,
    title,
    sourceType: "url",
    sourceUri: url,
    content,
    metadata: {
      contentType,
      status: fetchRes.status
    }
  });
  const indexed = await refreshDocumentKnowledgeIndex(params.projectId, document2.id);
  return Response.json({
    document: indexed || document2
  }, {
    status: 201
  });
}
const route37 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$6
}, Symbol.toStringTag, { value: "Module" }));
function inferExtension(contentType) {
  const value = String(contentType || "").toLowerCase();
  if (value.includes("pdf")) return ".pdf";
  if (value.includes("json")) return ".json";
  if (value.includes("html")) return ".html";
  if (value.includes("xml")) return ".xml";
  if (value.includes("markdown")) return ".md";
  if (value.includes("plain")) return ".txt";
  return ".bin";
}
function sanitizeFilename(value) {
  return String(value || "source").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "source";
}
function inferTextFromBuffer(buffer, mimeType, filename) {
  const type = String(mimeType || "").toLowerCase();
  const lowerName = String(filename || "").toLowerCase();
  const isOfficeArchive = type.includes("openxmlformats") || lowerName.endsWith(".docx") || lowerName.endsWith(".pptx") || lowerName.endsWith(".xlsx");
  if (isOfficeArchive) {
    return "";
  }
  if (type.includes("text/") || type.includes("json") || type.includes("xml") || type.includes("yaml") || type.includes("csv") || lowerName.endsWith(".txt") || lowerName.endsWith(".md") || lowerName.endsWith(".json") || lowerName.endsWith(".csv") || lowerName.endsWith(".xml") || lowerName.endsWith(".yml") || lowerName.endsWith(".yaml") || lowerName.endsWith(".html") || lowerName.endsWith(".htm")) {
    return buffer.toString("utf8");
  }
  return "";
}
async function action$5({
  request,
  params
}) {
  if (request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const body = await request.json();
  const projectId = params.projectId;
  const project = await getProject(projectId);
  if (!project) {
    return Response.json({
      error: "Project not found"
    }, {
      status: 404
    });
  }
  const filename = String(body.filename || "uploaded-file").trim();
  const mimeType = String(body.mimeType || "application/octet-stream").trim();
  const base64 = String(body.contentBase64 || "").trim();
  if (!base64) {
    return Response.json({
      error: "contentBase64 is required"
    }, {
      status: 400
    });
  }
  const buffer = Buffer.from(base64, "base64");
  const extension = path.extname(filename) || inferExtension(mimeType);
  const storedName = `${sanitizeFilename(path.basename(filename, path.extname(filename)))}${extension}`;
  const artifact = await storeArtifact({
    project,
    filename: storedName,
    mimeType,
    buffer
  });
  let content = inferTextFromBuffer(buffer, mimeType, filename);
  if (!content && (mimeType.includes("pdf") || filename.toLowerCase().endsWith(".pdf"))) {
    try {
      const pdfParseModule = await import("pdf-parse");
      const pdfParse = pdfParseModule.default ?? pdfParseModule;
      const parsed = await pdfParse(buffer);
      content = String(parsed.text || "").replace(/\s+/g, " ").trim();
    } catch {
      content = "";
    }
  }
  const document2 = await createDocument(projectId, {
    collectionId: body.collectionId,
    title: body.title || filename,
    sourceType: "file",
    sourceUri: artifact.storageUri.startsWith("s3://") ? artifact.storageUri : `file://${artifact.storageUri}`,
    storageUri: artifact.storageUri,
    content: content || `[Binary file stored at ${artifact.storageUri}]`,
    metadata: {
      filename: artifact.filename,
      mimeType: artifact.mimeType,
      bytes: artifact.size,
      storageBackend: artifact.backend,
      extractedTextLength: content.length
    }
  });
  const links = buildProjectArtifactUrls(projectId, document2.id);
  const updated = await updateDocumentMetadata(projectId, document2.id, {
    ...document2.metadata && typeof document2.metadata === "object" ? document2.metadata : {},
    artifactUrl: links.artifactUrl,
    downloadUrl: links.downloadUrl,
    workspaceSlug: project.workspaceSlug
  });
  const indexed = await refreshDocumentKnowledgeIndex(projectId, document2.id);
  return Response.json({
    document: indexed || updated
  }, {
    status: 201
  });
}
const route38 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$5
}, Symbol.toStringTag, { value: "Module" }));
async function action$4({
  request,
  params
}) {
  if (request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const body = await request.json();
  const query = String(body.query || "").trim();
  if (!query) {
    return Response.json({
      error: "query is required"
    }, {
      status: 400
    });
  }
  const result = await queryDocuments(params.projectId, query, {
    limit: body.limit,
    collectionId: body.collectionId
  });
  return Response.json(result);
}
const route39 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$4
}, Symbol.toStringTag, { value: "Module" }));
async function loader$4({
  params
}) {
  const tasks2 = await listTasks(params.projectId);
  return Response.json({
    tasks: tasks2
  });
}
const route40 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$4
}, Symbol.toStringTag, { value: "Module" }));
async function action$3({
  request,
  params
}) {
  if (request.method !== "DELETE") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  await deleteTask(params.taskId);
  return Response.json({
    success: true
  });
}
const route41 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$3
}, Symbol.toStringTag, { value: "Module" }));
async function loader$3({
  params
}) {
  const tasks2 = await listTasks(params.projectId);
  return Response.json({
    runs: tasks2
  });
}
const route42 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$3
}, Symbol.toStringTag, { value: "Module" }));
async function loader$2({
  params
}) {
  const task = await getTask(params.runId);
  if (!task) {
    return Response.json({
      error: `Run not found: ${params.runId}`
    }, {
      status: 404
    });
  }
  return Response.json({
    run: task
  });
}
const route43 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$2
}, Symbol.toStringTag, { value: "Module" }));
async function loader$1() {
  try {
    const models = await fetchModels();
    return Response.json({
      models
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({
      error: msg
    }, {
      status: 502
    });
  }
}
const route44 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$1
}, Symbol.toStringTag, { value: "Module" }));
function readTaskCollection(task) {
  const snapshot = task.planSnapshot;
  if (!snapshot || typeof snapshot !== "object") return null;
  const collection = snapshot.taskCollection;
  if (!collection || typeof collection !== "object") return null;
  const id = String(collection.id || "").trim();
  const name = String(collection.name || "").trim();
  if (!id || !name) return null;
  return { id, name };
}
function buildTaskCollectionName(task) {
  const base = String(task.title || "Task Sources").trim() || "Task Sources";
  const trimmed = base.replace(/\s+/g, " ").slice(0, 96).trim();
  return `Task Sources · ${trimmed} · ${task.id.slice(0, 8)}`;
}
async function persistTaskCollection$1(task, collection) {
  const snapshot = task.planSnapshot && typeof task.planSnapshot === "object" ? { ...task.planSnapshot } : {};
  snapshot.taskCollection = {
    id: collection.id,
    name: collection.name
  };
  await updateTask(task.id, { planSnapshot: snapshot });
  task.planSnapshot = snapshot;
}
async function ensureTaskCollection(task, projectId, requestedCollectionId, requestedCollectionName) {
  const explicitCollectionId = String(requestedCollectionId || "").trim();
  if (explicitCollectionId) {
    const collection2 = await getCollection(projectId, explicitCollectionId);
    if (!collection2) {
      throw new Error(`Collection not found: ${explicitCollectionId}`);
    }
    await persistTaskCollection$1(task, collection2);
    return { id: collection2.id, name: collection2.name };
  }
  const existing = readTaskCollection(task);
  if (existing) {
    const collection2 = await getCollection(projectId, existing.id);
    if (collection2) {
      return { id: collection2.id, name: collection2.name };
    }
  }
  const fallbackName = String(requestedCollectionName || "").trim() || buildTaskCollectionName(task);
  const collection = await ensureCollection(
    projectId,
    fallbackName,
    `Task-scoped source collection for ${task.title || "this task"}`
  );
  await persistTaskCollection$1(task, collection);
  return { id: collection.id, name: collection.name };
}
const CORE_TOOL_NAMES = ["collection_overview", "collection_artifact_metadata", "capture_artifact"];
function isToolCatalogQuestion(input) {
  const prompt = String(input.prompt || "").toLowerCase();
  const userText = Array.isArray(input.messages) ? input.messages.filter((message) => message?.role === "user").map((message) => String(message?.content || "").toLowerCase()).join("\n") : "";
  const fullText = [prompt, userText].filter(Boolean).join("\n");
  return fullText.includes("what tools") || fullText.includes("which tools") || fullText.includes("available tools") || (fullText.includes("tool") || fullText.includes("connector") || fullText.includes("mcp")) && (fullText.includes("available") || fullText.includes("have") || fullText.includes("can use") || fullText.includes("list"));
}
async function buildToolCatalogText(input) {
  const activeToolNames = /* @__PURE__ */ new Set(
    [...CORE_TOOL_NAMES, ...(input.activeToolNames || []).map((name) => String(name).trim()).filter(Boolean)]
  );
  const localTools = listAvailableTools().filter((tool) => activeToolNames.has(tool.name)).sort((a, b) => a.name.localeCompare(b.name));
  const selectedServers = input.mcpServers || [];
  const selectedServerIds = new Set(selectedServers.map((server) => server.id));
  const allMcpTools = await getMcpTools();
  const mcpTools = selectedServerIds.size > 0 ? allMcpTools.filter((tool) => selectedServerIds.has(tool.serverId)) : allMcpTools;
  const sections = [];
  if (localTools.length) {
    sections.push(
      ["Local tools:", ...localTools.map((tool) => `- ${tool.name}: ${tool.description}`)].join("\n")
    );
  }
  if (mcpTools.length) {
    sections.push(buildMcpSection(mcpTools));
  } else if (selectedServers.length > 0) {
    sections.push(
      [
        "MCP tools:",
        ...selectedServers.map((server) => `- ${server.name}: connected, but no tools were discovered for this turn`)
      ].join("\n")
    );
  }
  if (!sections.length) {
    return "No tools are available for this turn.";
  }
  return `${sections.join("\n\n")}

Use the exact tool names above when referring to them.`;
}
function buildMcpSection(tools) {
  const groups = /* @__PURE__ */ new Map();
  for (const tool of tools) {
    const key = tool.serverId;
    const existing = groups.get(key);
    if (existing) {
      existing.tools.push(tool);
      continue;
    }
    groups.set(key, {
      label: tool.serverAlias ? `${tool.serverName} (${tool.serverAlias})` : tool.serverName,
      tools: [tool]
    });
  }
  const lines = ["MCP tools:"];
  for (const group of [...groups.values()].sort((a, b) => a.label.localeCompare(b.label))) {
    lines.push(`- ${group.label}`);
    for (const tool of group.tools.sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(`  - ${toInvocableMcpToolName(tool)}: ${tool.description}`);
    }
  }
  return lines.join("\n");
}
function toInvocableMcpToolName(tool) {
  const rawPrefix = tool.serverAlias || tool.serverName || tool.serverId || "server";
  const slug = rawPrefix.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "server";
  return `mcp__${slug}__${tool.name}`;
}
function getJsonRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function firstString(value) {
  return String(value || "").trim();
}
function findAnalystCollectionName(toolResultData) {
  const data = getJsonRecord(toolResultData);
  return firstString(data?.collection_name);
}
function parseJsonText(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function resolveToolResultData(toolResultData, toolOutput) {
  const direct = getJsonRecord(toolResultData);
  if (direct) return direct;
  return parseJsonText(firstString(toolOutput));
}
function findSuccessfulCanonicalIds(toolResultData) {
  const data = getJsonRecord(toolResultData);
  const downloaded = Array.isArray(data?.downloaded) ? data?.downloaded : [];
  return new Set(
    downloaded.map((item) => firstString(getJsonRecord(item)?.canonical_id)).filter(Boolean)
  );
}
function findDownloadedArtifactMap(toolResultData) {
  const data = getJsonRecord(toolResultData);
  const downloaded = Array.isArray(data?.downloaded) ? data?.downloaded : [];
  return new Map(
    downloaded.map((item) => getJsonRecord(item)).filter(Boolean).map((item) => [firstString(item?.canonical_id), item]).filter(([canonicalId]) => Boolean(canonicalId))
  );
}
function matchesAnalystTool(toolName) {
  return /analyst/i.test(toolName) && /(collect_articles|collect_collection_artifacts|index_collection)$/.test(toolName);
}
async function persistTaskCollection(task, collection) {
  const snapshot = task.planSnapshot && typeof task.planSnapshot === "object" ? { ...task.planSnapshot } : {};
  snapshot.taskCollection = {
    id: collection.id,
    name: collection.name
  };
  await updateTask(task.id, { planSnapshot: snapshot });
  task.planSnapshot = snapshot;
}
function findAnalystServer(mcpServers, toolName) {
  if (!matchesAnalystTool(toolName)) return null;
  return mcpServers.find((server) => /analyst/i.test(`${server.alias || ""} ${server.name}`)) || mcpServers.find((server) => /localhost:8000|analyst-mcp/i.test(server.url || "")) || null;
}
async function fetchAnalystJson(server, path2) {
  const rawUrl = firstString(server.url);
  if (!rawUrl) {
    throw new Error("Analyst MCP server URL is missing");
  }
  const url = new URL(rawUrl);
  const target = new URL(path2, `${url.origin}/`);
  const res = await fetch(target, {
    headers: server.headers || {}
  });
  if (!res.ok) {
    throw new Error(`Analyst MCP sync failed: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}
function preferredArtifact(artifacts) {
  return artifacts.find((artifact) => artifact.kind === "pdf") || artifacts.find((artifact) => artifact.kind === "text") || artifacts[0] || null;
}
function buildDocumentContent(paper) {
  const lines = [paper.title];
  if (paper.abstract) {
    lines.push("");
    lines.push(paper.abstract);
  }
  return lines.filter(Boolean).join("\n");
}
async function syncAnalystCollectionToTaskCollection(args) {
  const server = findAnalystServer(args.mcpServers, args.toolName);
  const resolvedResultData = resolveToolResultData(args.toolResultData, args.toolOutput);
  const analystCollectionName = findAnalystCollectionName(resolvedResultData);
  if (!server || !analystCollectionName) {
    return null;
  }
  const successfulIds = findSuccessfulCanonicalIds(resolvedResultData);
  const downloadedArtifactById = findDownloadedArtifactMap(resolvedResultData);
  const targetCollection = analystCollectionName ? await ensureCollection(
    args.projectId,
    analystCollectionName,
    `Mirrored analyst MCP collection for ${args.task.id}`
  ) : { id: args.collectionId, name: args.collectionName };
  if (targetCollection.id !== args.collectionId || targetCollection.name !== args.collectionName) {
    await persistTaskCollection(args.task, targetCollection);
  }
  if (successfulIds.size === 0) {
    return {
      mirrored: 0,
      skipped: [],
      collectionId: targetCollection.id,
      collectionName: targetCollection.name
    };
  }
  const [detailRaw, artifactsRaw] = await Promise.all([
    fetchAnalystJson(server, `/api/collections/${encodeURIComponent(analystCollectionName)}?limit=200`),
    fetchAnalystJson(server, `/api/collections/${encodeURIComponent(analystCollectionName)}/artifacts?limit=200`)
  ]);
  const detail = getJsonRecord(detailRaw);
  const artifacts = getJsonRecord(artifactsRaw);
  const paperById = new Map(
    (Array.isArray(detail?.papers) ? detail.papers : []).map((paper) => [paper.canonical_id, paper])
  );
  const artifactsById = new Map(
    (Array.isArray(artifacts?.items) ? artifacts.items : []).map((item) => [
      item.paper.canonical_id,
      item.artifacts || []
    ])
  );
  let mirrored = 0;
  const skipped = [];
  for (const canonicalId of successfulIds) {
    const paper = paperById.get(canonicalId);
    if (!paper) {
      skipped.push(`${canonicalId}: missing paper metadata`);
      continue;
    }
    const artifact = preferredArtifact(artifactsById.get(canonicalId) || []);
    const downloadedArtifact = downloadedArtifactById.get(canonicalId);
    const storageUri = firstString(artifact?.path) || firstString(downloadedArtifact?.path) || null;
    const mimeType = firstString(artifact?.mime_type) || firstString(downloadedArtifact?.mime_type) || "application/octet-stream";
    const sourceUri = `analyst://${canonicalId}`;
    const metadata = {
      provider: paper.provider,
      sourceId: paper.source_id,
      canonicalId,
      paperUrl: firstString(paper.url),
      pdfUrl: firstString(paper.pdf_url),
      artifactUrl: firstString(artifact?.artifact_url),
      downloadUrl: firstString(artifact?.download_url),
      mimeType,
      bytes: Number(downloadedArtifact?.bytes_written || 0),
      filename: basename$1(firstString(artifact?.path || "")) || basename$1(firstString(downloadedArtifact?.path || "")) || `${paper.source_id}${firstString(artifact?.suffix) || ".bin"}`,
      analystCollectionName,
      taskId: args.task.id,
      taskCollectionName: targetCollection.name,
      mirroredFrom: "analyst_mcp"
    };
    const existing = await getDocumentBySourceUri(args.projectId, sourceUri);
    if (existing) {
      const updated = await updateDocument(args.projectId, existing.id, {
        collectionId: targetCollection.id,
        title: paper.title,
        sourceType: "analyst_mcp",
        sourceUri,
        storageUri: storageUri || existing.storageUri,
        content: buildDocumentContent(paper),
        metadata
      });
      await refreshDocumentKnowledgeIndex(args.projectId, updated.id);
    } else {
      const created = await createDocument(args.projectId, {
        collectionId: targetCollection.id,
        title: paper.title,
        sourceType: "analyst_mcp",
        sourceUri,
        storageUri,
        content: buildDocumentContent(paper),
        metadata
      });
      await refreshDocumentKnowledgeIndex(args.projectId, created.id);
    }
    mirrored += 1;
  }
  return {
    mirrored,
    skipped,
    collectionId: targetCollection.id,
    collectionName: targetCollection.name
  };
}
async function action$2({
  request
}) {
  if (request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const body = await request.json();
  const settings2 = await getSettings();
  const model = await resolveModel(settings2.model, {
    requireToolSupport: true
  });
  const messages2 = Array.isArray(body.messages) ? body.messages : [];
  const prompt = String(body.prompt || "").trim();
  const projectId = String(body.projectId || settings2.activeProjectId || "").trim();
  const collectionId = String(body.collectionId || "").trim();
  const collectionName = String(body.collectionName || "").trim();
  const deepResearch = body.deepResearch === true;
  const pinnedMcpServerIds = Array.isArray(body.pinnedMcpServerIds) ? body.pinnedMcpServerIds.map((item) => String(item)).filter(Boolean) : [];
  const activeSkills = listActiveSkills();
  const matchedSkills = selectMatchedSkills(activeSkills, {
    prompt,
    messages: messages2
  });
  const selectedMcpServers = await getSelectedMcpServers({
    prompt,
    messages: messages2,
    pinnedServerIds: pinnedMcpServerIds
  });
  const matchedToolNames = getActiveSkillToolNames(matchedSkills);
  const fallbackToolNames = getActiveSkillToolNames(activeSkills);
  const activeToolNames = filterLocalToolsForSelectedMcpServers(matchedToolNames.length > 0 ? matchedToolNames : fallbackToolNames, selectedMcpServers);
  if (!projectId) {
    return Response.json({
      error: "No active project configured. Create/select a project first."
    }, {
      status: 400
    });
  }
  await getProjectWorkspace(projectId);
  const project = await getProject(projectId);
  if (!project) {
    return Response.json({
      error: `Project not found: ${projectId}`
    }, {
      status: 404
    });
  }
  const apiBaseUrl = new URL(request.url).origin;
  const runtimeMcpServers = applyProjectMcpContext(selectedMcpServers, project, apiBaseUrl);
  const cfg = {
    provider: "openai",
    apiKey: "",
    baseUrl: "",
    bedrockRegion: "us-east-1",
    model,
    openaiMode: "chat",
    workingDir: settings2.workingDir || process.cwd(),
    workingDirType: settings2.workingDirType,
    s3Uri: settings2.s3Uri || "",
    activeProjectId: projectId,
    agentBackend: settings2.agentBackend
  };
  const chatMessages = messages2.length ? messages2 : [{
    role: "user",
    content: prompt
  }];
  const task = await createTask(projectId, {
    title: prompt.slice(0, 500) || "New Task",
    type: "chat",
    status: "running"
  });
  let taskCollection = await ensureTaskCollection(task, projectId, collectionId || void 0, collectionName || void 0);
  await appendTaskEvent(task.id, "chat_requested", {
    messageCount: chatMessages.length
  });
  try {
    if (isToolCatalogQuestion({
      prompt,
      messages: chatMessages
    })) {
      const text2 = await buildToolCatalogText({
        activeToolNames,
        mcpServers: runtimeMcpServers
      });
      await appendTaskEvent(task.id, "chat_completed", {
        traceCount: 0,
        directResponse: true
      });
      await updateTask(task.id, {
        status: "completed",
        planSnapshot: {
          ...task.planSnapshot && typeof task.planSnapshot === "object" ? task.planSnapshot : {},
          summary: [`Task: ${task.title || "Untitled task"}`, prompt ? `Latest user request: ${prompt}` : "", `Task collection: ${taskCollection.name}`, `Latest answer: ${text2.slice(0, 1200)}`].filter(Boolean).join("\n")
        }
      });
      return Response.json({
        ok: true,
        text: text2,
        traces: [],
        runId: task.id,
        projectId
      });
    }
    const {
      runAgentChat
    } = await import("./chat.server-D__u83Mi.js");
    const result = await runAgentChat(cfg, chatMessages, {
      projectId,
      sessionId: task.id,
      taskSummary: task.planSnapshot && typeof task.planSnapshot === "object" && typeof task.planSnapshot.summary === "string" ? String(task.planSnapshot.summary) : "",
      collectionId: taskCollection.id,
      collectionName: taskCollection.name,
      deepResearch,
      skills: matchedSkills,
      skillCatalog: getSkillCatalog(activeSkills),
      activeToolNames,
      mcpServers: runtimeMcpServers,
      onRunEvent: async (eventType, payload) => {
        await appendTaskEvent(task.id, eventType, payload);
        if (eventType === "tool_call_end" && payload.toolStatus !== "error" && typeof payload.toolName === "string") {
          const syncResult = await syncAnalystCollectionToTaskCollection({
            projectId,
            task,
            collectionId: taskCollection.id,
            collectionName: taskCollection.name,
            toolName: payload.toolName,
            toolResultData: payload.toolResultData,
            toolOutput: typeof payload.toolOutput === "string" ? payload.toolOutput : void 0,
            mcpServers: runtimeMcpServers
          });
          if (syncResult) {
            taskCollection = {
              id: syncResult.collectionId,
              name: syncResult.collectionName
            };
          }
        }
      }
    });
    await updateTask(task.id, {
      status: "completed",
      planSnapshot: {
        ...task.planSnapshot && typeof task.planSnapshot === "object" ? task.planSnapshot : {},
        summary: [`Task: ${task.title || "Untitled task"}`, prompt ? `Latest user request: ${prompt}` : "", `Task collection: ${taskCollection.name}`, result.text ? `Latest answer: ${result.text.slice(0, 1200)}` : ""].filter(Boolean).join("\n")
      }
    });
    await appendTaskEvent(task.id, "chat_completed", {
      traceCount: Array.isArray(result.traces) ? result.traces.length : 0
    });
    return Response.json({
      ok: true,
      text: result.text,
      traces: result.traces || [],
      runId: task.id,
      projectId
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await appendTaskEvent(task.id, "chat_failed", {
      error: msg
    });
    await updateTask(task.id, {
      status: "failed"
    });
    return Response.json({
      error: msg
    }, {
      status: 500
    });
  }
}
const route45 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$2
}, Symbol.toStringTag, { value: "Module" }));
class StrandsProvider {
  name = "strands";
  config;
  constructor(config) {
    this.config = config;
  }
  buildPayload(messages2, options, extra) {
    return {
      messages: messages2,
      project_id: options.projectId,
      session_id: options.sessionId || "",
      task_summary: options.taskSummary || "",
      working_dir: options.workingDir,
      collection_id: options.collectionId || "",
      collection_name: options.collectionName || "Task Sources",
      deep_research: options.deepResearch || false,
      skills: (options.skills || []).map((skill) => ({
        folder_path: typeof skill.config?.folderPath === "string" ? skill.config.folderPath : skill.source?.path || "",
        source_path: skill.source?.path || "",
        id: skill.id,
        name: skill.name,
        description: skill.description || "",
        instructions: skill.instructions || "",
        tools: skill.tools || [],
        references: skill.references || [],
        reference_paths: (skill.references || []).map((item) => {
          const folderPath = typeof skill.config?.folderPath === "string" ? skill.config.folderPath : skill.source?.path || "";
          return folderPath ? path.join(folderPath, item) : item;
        }),
        scripts: skill.scripts || [],
        script_paths: (skill.scripts || []).map((item) => {
          const folderPath = typeof skill.config?.folderPath === "string" ? skill.config.folderPath : skill.source?.path || "";
          return folderPath ? path.join(folderPath, item) : item;
        })
      })),
      skill_catalog: (options.skillCatalog || []).map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description || "",
        tools: skill.tools || []
      })),
      active_tool_names: options.activeToolNames || [],
      mcp_servers: (options.mcpServers || []).map((server) => ({
        id: server.id,
        name: server.name,
        alias: server.alias || "",
        type: server.type,
        command: server.command || "",
        args: server.args || [],
        env: server.env || {},
        url: server.url || "",
        headers: server.headers || {}
      })),
      model_id: this.config.model,
      litellm_base_url: env.LITELLM_BASE_URL,
      litellm_api_key: env.LITELLM_API_KEY,
      api_base_url: `http://localhost:${process.env.PORT || 5173}`,
      ...extra
    };
  }
  async chat(messages2, options) {
    const res = await fetch(`${env.STRANDS_URL}/invocations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.buildPayload(messages2, options))
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Agent backend error: ${res.status} ${body}`);
    }
    const data = await res.json();
    return {
      text: String(data.text || ""),
      traces: Array.isArray(data.traces) ? data.traces : []
    };
  }
  async *stream(messages2, options) {
    const res = await fetch(`${env.STRANDS_URL}/invocations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.buildPayload(messages2, options, { stream: true }))
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      yield {
        type: "error",
        error: `Agent backend error: ${res.status} ${body}`,
        timestamp: Date.now()
      };
      return;
    }
    const reader = res.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "No response body", timestamp: Date.now() };
      return;
    }
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";
      for (const eventBlock of events) {
        const line = eventBlock.trim();
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          const now = Date.now();
          const eventType = data.type;
          if (eventType === "status") {
            yield {
              type: "status",
              text: data.text || "",
              phase: data.phase || "",
              status: data.status || "running",
              timestamp: now
            };
          } else if (eventType === "text_delta") {
            yield { type: "text_delta", text: data.text || "", timestamp: now };
          } else if (eventType === "tool_call_start") {
            yield {
              type: "tool_call_start",
              toolName: data.toolName,
              toolUseId: data.toolUseId,
              toolInput: data.toolInput || {},
              toolStatus: "running",
              timestamp: now
            };
          } else if (eventType === "tool_call_end") {
            yield {
              type: "tool_call_end",
              toolName: data.toolName,
              toolUseId: data.toolUseId,
              toolOutput: data.toolOutput || "",
              toolResultData: data.toolResultData,
              toolStatus: data.toolStatus || "completed",
              timestamp: now
            };
          } else if (eventType === "agent_end") {
            yield { type: "agent_end", timestamp: now };
          } else if (data.error) {
            yield { type: "error", error: data.error, timestamp: now };
          }
        } catch {
        }
      }
    }
  }
}
function createAgentProvider(config) {
  const backend = config.agentBackend || "strands";
  switch (backend) {
    case "strands":
      return new StrandsProvider(config);
    default:
      throw new Error(`Unknown agent backend: ${backend}`);
  }
}
async function action$1({
  request
}) {
  if (request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const body = await request.json();
  const settings2 = await getSettings();
  const requestMessages = Array.isArray(body.messages) ? body.messages : [];
  const projectId = String(body.projectId || settings2.activeProjectId || "").trim();
  if (!projectId) {
    return Response.json({
      error: "No active project configured. Create/select a project first."
    }, {
      status: 400
    });
  }
  const model = await resolveModel(settings2.model, {
    requireToolSupport: true
  });
  const cfg = {
    provider: "openai",
    apiKey: "",
    baseUrl: "",
    bedrockRegion: "us-east-1",
    model,
    openaiMode: "chat",
    workingDir: settings2.workingDir || process.cwd(),
    workingDirType: settings2.workingDirType,
    s3Uri: settings2.s3Uri || "",
    activeProjectId: projectId,
    agentBackend: settings2.agentBackend
  };
  const provider = createAgentProvider(cfg);
  const workingDir = await getProjectWorkspace(projectId);
  const activeSkills = listActiveSkills();
  const prompt = String(body.prompt || "").trim();
  const pinnedMcpServerIds = Array.isArray(body.pinnedMcpServerIds) ? body.pinnedMcpServerIds.map((item) => String(item)).filter(Boolean) : [];
  const requestedChatMessages = requestMessages.length ? requestMessages : prompt ? [{
    role: "user",
    content: prompt
  }] : [];
  const matchedSkills = selectMatchedSkills(activeSkills, {
    prompt,
    messages: requestedChatMessages
  });
  const selectedMcpServers = await getSelectedMcpServers({
    prompt,
    messages: requestedChatMessages,
    pinnedServerIds: pinnedMcpServerIds
  });
  const matchedToolNames = getActiveSkillToolNames(matchedSkills);
  const fallbackToolNames = getActiveSkillToolNames(activeSkills);
  const activeToolNames = filterLocalToolsForSelectedMcpServers(matchedToolNames.length > 0 ? matchedToolNames : fallbackToolNames, selectedMcpServers);
  const project = await getProject(projectId);
  if (!project) {
    return Response.json({
      error: `Project not found: ${projectId}`
    }, {
      status: 404
    });
  }
  const apiBaseUrl = new URL(request.url).origin;
  const runtimeMcpServers = applyProjectMcpContext(selectedMcpServers, project, apiBaseUrl);
  let task;
  if (body.taskId) {
    const existing = await getTask(body.taskId);
    if (!existing || existing.projectId !== projectId) {
      return Response.json({
        error: "Task not found"
      }, {
        status: 404
      });
    }
    task = await updateTask(existing.id, {
      status: "running"
    });
  } else {
    task = await createTask(projectId, {
      title: prompt.slice(0, 500) || "New Task",
      type: "chat",
      status: "running"
    });
  }
  let taskCollection = await ensureTaskCollection(task, projectId, String(body.collectionId || "").trim() || void 0, String(body.collectionName || "").trim() || void 0);
  const persistedMessages = requestedChatMessages.length === 0 ? await listMessages(task.id) : [];
  const chatMessages = requestedChatMessages.length ? requestedChatMessages : persistedMessages.map((message) => {
    const content = Array.isArray(message.content) ? message.content : [];
    const text2 = content.filter((block) => Boolean(block) && typeof block === "object" && block.type === "text" && typeof block.text === "string").map((block) => block.text).join("\n");
    return {
      role: message.role,
      content: text2
    };
  });
  const previousSummary = task.planSnapshot && typeof task.planSnapshot === "object" && typeof task.planSnapshot.summary === "string" ? String(task.planSnapshot.summary) : "";
  if (!body.skipUserMessage && prompt) {
    await createMessage(task.id, {
      role: "user",
      content: [{
        type: "text",
        text: prompt
      }]
    });
  }
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event, data) => {
        controller.enqueue(encoder.encode(`event: ${event}
data: ${JSON.stringify(data)}

`));
      };
      send("task_created", {
        taskId: task.id
      });
      try {
        if (isToolCatalogQuestion({
          prompt,
          messages: chatMessages
        })) {
          const text2 = await buildToolCatalogText({
            activeToolNames,
            mcpServers: runtimeMcpServers
          });
          send("text_delta", {
            text: text2
          });
          send("agent_end", {});
          send("done", {
            taskId: task.id
          });
          await appendTaskEvent(task.id, "text_delta", {
            text: text2,
            directResponse: true
          });
          await appendTaskEvent(task.id, "agent_end", {
            directResponse: true
          });
          await createMessage(task.id, {
            role: "assistant",
            content: [{
              type: "text",
              text: text2
            }]
          });
          await updateTask(task.id, {
            status: "completed",
            planSnapshot: {
              ...task.planSnapshot && typeof task.planSnapshot === "object" ? task.planSnapshot : {},
              summary: [`Task: ${task.title || "Untitled task"}`, prompt ? `Latest user request: ${prompt}` : "", matchedSkills.length ? `Skills used: ${matchedSkills.map((skill) => skill.name).join(", ")}` : "", `Latest answer: ${text2.slice(0, 1200)}`].filter(Boolean).join("\n")
            }
          });
          return;
        }
        let contentBlocks = [];
        for await (const event of provider.stream(chatMessages, {
          projectId,
          workingDir,
          sessionId: task.id,
          taskSummary: previousSummary,
          collectionId: taskCollection.id,
          collectionName: taskCollection.name,
          deepResearch: body.deepResearch === true,
          skills: matchedSkills,
          skillCatalog: getSkillCatalog(activeSkills),
          activeToolNames,
          mcpServers: runtimeMcpServers
        })) {
          send(event.type, event);
          contentBlocks = applyChatStreamEvent(contentBlocks, event);
          await appendTaskEvent(task.id, event.type, {
            text: event.text,
            phase: event.phase,
            status: event.status,
            toolName: event.toolName,
            toolUseId: event.toolUseId,
            toolInput: event.toolInput,
            toolOutput: event.toolOutput,
            toolResultData: event.toolResultData,
            toolStatus: event.toolStatus,
            error: event.error
          });
          if (event.type === "tool_call_end" && event.toolStatus !== "error" && event.toolName) {
            const syncResult = await syncAnalystCollectionToTaskCollection({
              projectId,
              task,
              collectionId: taskCollection.id,
              collectionName: taskCollection.name,
              toolName: event.toolName,
              toolResultData: event.toolResultData,
              toolOutput: event.toolOutput,
              mcpServers: runtimeMcpServers
            });
            if (syncResult) {
              taskCollection = {
                id: syncResult.collectionId,
                name: syncResult.collectionName
              };
              const syncText = syncResult.mirrored > 0 ? `Added ${syncResult.mirrored} collected article${syncResult.mirrored === 1 ? "" : "s"} to ${syncResult.collectionName}.` : `No collected articles were added to ${syncResult.collectionName}.`;
              const syncEvent = {
                type: "status",
                status: "running",
                phase: "collection_sync",
                text: syncResult.skipped.length > 0 ? `${syncText} Skipped: ${syncResult.skipped.join("; ")}` : syncText
              };
              send(syncEvent.type, syncEvent);
              contentBlocks = applyChatStreamEvent(contentBlocks, syncEvent);
              await appendTaskEvent(task.id, syncEvent.type, syncEvent);
            }
          }
        }
        const fullText = extractFinalAssistantText(contentBlocks);
        await createMessage(task.id, {
          role: "assistant",
          content: contentBlocks.length > 0 ? contentBlocks : [{
            type: "text",
            text: fullText
          }]
        });
        send("done", {
          taskId: task.id
        });
        await updateTask(task.id, {
          status: "completed",
          planSnapshot: {
            ...task.planSnapshot && typeof task.planSnapshot === "object" ? task.planSnapshot : {},
            summary: [`Task: ${task.title || "Untitled task"}`, prompt ? `Latest user request: ${prompt}` : "", matchedSkills.length ? `Skills used: ${matchedSkills.map((skill) => skill.name).join(", ")}` : "", `Task collection: ${taskCollection.name}`, fullText ? `Latest answer: ${fullText.slice(0, 1200)}` : ""].filter(Boolean).join("\n")
          }
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send("error", {
          error: msg
        });
        await updateTask(task.id, {
          status: "failed"
        });
      } finally {
        await provider.dispose?.();
        controller.close();
      }
    }
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}
const route46 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$1
}, Symbol.toStringTag, { value: "Module" }));
async function action({
  request
}) {
  if (request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const body = await request.json();
  const settings2 = await getSettings();
  const projectId = String(body.projectId || settings2.activeProjectId || "").trim();
  if (!projectId) {
    return Response.json({
      error: "No active project configured. Create/select a project first."
    }, {
      status: 400
    });
  }
  const prompt = String(body.prompt || "").trim();
  if (!prompt) {
    return Response.json({
      error: "Prompt is required"
    }, {
      status: 400
    });
  }
  const task = await createTask(projectId, {
    title: prompt.slice(0, 500),
    type: "chat",
    status: "pending"
  });
  await createMessage(task.id, {
    role: "user",
    content: [{
      type: "text",
      text: prompt
    }]
  });
  return Response.json({
    taskId: task.id
  });
}
const route47 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action
}, Symbol.toStringTag, { value: "Module" }));
async function loader() {
  const [projects2, settings2] = await Promise.all([listProjects(), getSettings()]);
  const debug = {
    projects: projects2,
    settings: settings2
  };
  return new Response(JSON.stringify(debug, null, 2), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8"
    }
  });
}
const route48 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader
}, Symbol.toStringTag, { value: "Module" }));
const _catchall = UNSAFE_withComponentProps(function CatchAllRoute() {
  const location = useLocation();
  return /* @__PURE__ */ jsx("div", {
    className: "min-h-screen bg-background text-text-primary flex items-center justify-center px-6",
    children: /* @__PURE__ */ jsxs("div", {
      className: "max-w-md w-full rounded-2xl border border-border bg-surface p-8 shadow-elevated space-y-3",
      children: [/* @__PURE__ */ jsx("p", {
        className: "text-xs font-semibold uppercase tracking-[0.2em] text-text-muted",
        children: "404"
      }), /* @__PURE__ */ jsx("h1", {
        className: "text-2xl font-semibold",
        children: "Page not found"
      }), /* @__PURE__ */ jsxs("p", {
        className: "text-sm text-text-secondary",
        children: ["No route exists for", " ", /* @__PURE__ */ jsx("code", {
          className: "text-text-primary",
          children: location.pathname
        }), "."]
      })]
    })
  });
});
const route49 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: _catchall
}, Symbol.toStringTag, { value: "Module" }));
const serverManifest = { "entry": { "module": "/assets/entry.client-9-U8PgYP.js", "imports": ["/assets/chunk-LFPYN7LY-CfGVtWrQ.js"], "css": [] }, "routes": { "root": { "id": "root", "parentId": void 0, "path": "", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/root-BUNpyJKa.js", "imports": ["/assets/chunk-LFPYN7LY-CfGVtWrQ.js"], "css": ["/assets/root-DuQA2udE.css"], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/_app": { "id": "routes/_app", "parentId": "root", "path": void 0, "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/_app-CcvUl1Su.js", "imports": ["/assets/chunk-LFPYN7LY-CfGVtWrQ.js", "/assets/createLucideIcon-CWH7lh78.js", "/assets/plus-dGSLKxjn.js", "/assets/browser-config-DmvUPL0h.js", "/assets/headless-api-anzMXmSp.js", "/assets/chevron-down-Bhm2RAsd.js", "/assets/circle-alert-CCop9Cez.js", "/assets/AlertDialog-Bxr0_W-L.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/_app._index": { "id": "routes/_app._index", "parentId": "routes/_app", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/_app._index-BEUxR8oP.js", "imports": ["/assets/chunk-LFPYN7LY-CfGVtWrQ.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/_app.projects.$projectId": { "id": "routes/_app.projects.$projectId", "parentId": "routes/_app", "path": "projects/:projectId", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/_app.projects._projectId-CSk6FmWR.js", "imports": ["/assets/chunk-LFPYN7LY-CfGVtWrQ.js", "/assets/createLucideIcon-CWH7lh78.js", "/assets/AlertDialog-Bxr0_W-L.js", "/assets/format-DkFrkGEa.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/_app.projects.$projectId.tasks.$taskId": { "id": "routes/_app.projects.$projectId.tasks.$taskId", "parentId": "routes/_app", "path": "projects/:projectId/tasks/:taskId", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/_app.projects._projectId.tasks._taskId-OUuatNKO.js", "imports": ["/assets/chunk-LFPYN7LY-CfGVtWrQ.js", "/assets/createLucideIcon-CWH7lh78.js", "/assets/headless-api-anzMXmSp.js", "/assets/format-DkFrkGEa.js", "/assets/chevron-down-Bhm2RAsd.js", "/assets/FileViewerPanel-CnSVuqBA.js", "/assets/plus-dGSLKxjn.js", "/assets/circle-alert-CCop9Cez.js", "/assets/plug-wfHAiUxy.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/_app.projects.$projectId.knowledge": { "id": "routes/_app.projects.$projectId.knowledge", "parentId": "routes/_app", "path": "projects/:projectId/knowledge", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/_app.projects._projectId.knowledge-CfGP_3zo.js", "imports": ["/assets/chunk-LFPYN7LY-CfGVtWrQ.js", "/assets/createLucideIcon-CWH7lh78.js", "/assets/headless-api-anzMXmSp.js", "/assets/FileViewerPanel-CnSVuqBA.js", "/assets/AlertDialog-Bxr0_W-L.js", "/assets/format-DkFrkGEa.js", "/assets/database-D50TSUkr.js", "/assets/plus-dGSLKxjn.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/_app.settings": { "id": "routes/_app.settings", "parentId": "routes/_app", "path": "settings", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/_app.settings-DRVUXHVc.js", "imports": ["/assets/chunk-LFPYN7LY-CfGVtWrQ.js", "/assets/createLucideIcon-CWH7lh78.js", "/assets/AlertDialog-Bxr0_W-L.js", "/assets/browser-config-DmvUPL0h.js", "/assets/headless-api-anzMXmSp.js", "/assets/plug-wfHAiUxy.js", "/assets/database-D50TSUkr.js", "/assets/circle-alert-CCop9Cez.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.health": { "id": "routes/api.health", "parentId": "root", "path": "api/health", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.health-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.config": { "id": "routes/api.config", "parentId": "root", "path": "api/config", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.config-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.workdir": { "id": "routes/api.workdir", "parentId": "root", "path": "api/workdir", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.workdir-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.tools": { "id": "routes/api.tools", "parentId": "root", "path": "api/tools", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.tools-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.credentials": { "id": "routes/api.credentials", "parentId": "root", "path": "api/credentials", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.credentials-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.credentials.$id": { "id": "routes/api.credentials.$id", "parentId": "root", "path": "api/credentials/:id", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.credentials._id-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.mcp.presets": { "id": "routes/api.mcp.presets", "parentId": "root", "path": "api/mcp/presets", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.mcp.presets-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.mcp.servers": { "id": "routes/api.mcp.servers", "parentId": "root", "path": "api/mcp/servers", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.mcp.servers-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.mcp.servers.$id": { "id": "routes/api.mcp.servers.$id", "parentId": "root", "path": "api/mcp/servers/:id", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.mcp.servers._id-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.mcp.status": { "id": "routes/api.mcp.status", "parentId": "root", "path": "api/mcp/status", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.mcp.status-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.mcp.tools": { "id": "routes/api.mcp.tools", "parentId": "root", "path": "api/mcp/tools", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.mcp.tools-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.skills": { "id": "routes/api.skills", "parentId": "root", "path": "api/skills", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.skills-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.skills.validate": { "id": "routes/api.skills.validate", "parentId": "root", "path": "api/skills/validate", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.skills.validate-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.skills.install": { "id": "routes/api.skills.install", "parentId": "root", "path": "api/skills/install", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.skills.install-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.skills.$id": { "id": "routes/api.skills.$id", "parentId": "root", "path": "api/skills/:id", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.skills._id-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.skills.$id.enabled": { "id": "routes/api.skills.$id.enabled", "parentId": "root", "path": "api/skills/:id/enabled", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.skills._id.enabled-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.logs": { "id": "routes/api.logs", "parentId": "root", "path": "api/logs", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.logs-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.logs.enabled": { "id": "routes/api.logs.enabled", "parentId": "root", "path": "api/logs/enabled", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.logs.enabled-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.logs.export": { "id": "routes/api.logs.export", "parentId": "root", "path": "api/logs/export", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.logs.export-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.logs.clear": { "id": "routes/api.logs.clear", "parentId": "root", "path": "api/logs/clear", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.logs.clear-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.projects": { "id": "routes/api.projects", "parentId": "root", "path": "api/projects", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.projects-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.projects.active": { "id": "routes/api.projects.active", "parentId": "root", "path": "api/projects/active", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.projects.active-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.projects.$projectId": { "id": "routes/api.projects.$projectId", "parentId": "root", "path": "api/projects/:projectId", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.projects._projectId-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.projects.$projectId.knowledge": { "id": "routes/api.projects.$projectId.knowledge", "parentId": "root", "path": "api/projects/:projectId/knowledge", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.projects._projectId.knowledge-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.projects.$projectId.collections": { "id": "routes/api.projects.$projectId.collections", "parentId": "root", "path": "api/projects/:projectId/collections", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.projects._projectId.collections-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.projects.$projectId.collections.ensure": { "id": "routes/api.projects.$projectId.collections.ensure", "parentId": "root", "path": "api/projects/:projectId/collections/ensure", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.projects._projectId.collections.ensure-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.projects.$projectId.documents": { "id": "routes/api.projects.$projectId.documents", "parentId": "root", "path": "api/projects/:projectId/documents", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.projects._projectId.documents-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.projects.$projectId.documents.$documentId.artifact": { "id": "routes/api.projects.$projectId.documents.$documentId.artifact", "parentId": "root", "path": "api/projects/:projectId/documents/:documentId/artifact", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.projects._projectId.documents._documentId.artifact-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.projects.$projectId.analyst-mcp.papers.$identifier.artifact": { "id": "routes/api.projects.$projectId.analyst-mcp.papers.$identifier.artifact", "parentId": "root", "path": "api/projects/:projectId/analyst-mcp/papers/:identifier/artifact", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.projects._projectId.analyst-mcp.papers._identifier.artifact-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.projects.$projectId.artifacts.capture": { "id": "routes/api.projects.$projectId.artifacts.capture", "parentId": "root", "path": "api/projects/:projectId/artifacts/capture", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.projects._projectId.artifacts.capture-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.projects.$projectId.import.url": { "id": "routes/api.projects.$projectId.import.url", "parentId": "root", "path": "api/projects/:projectId/import/url", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.projects._projectId.import.url-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.projects.$projectId.import.file": { "id": "routes/api.projects.$projectId.import.file", "parentId": "root", "path": "api/projects/:projectId/import/file", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.projects._projectId.import.file-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.projects.$projectId.rag.query": { "id": "routes/api.projects.$projectId.rag.query", "parentId": "root", "path": "api/projects/:projectId/rag/query", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.projects._projectId.rag.query-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.projects.$projectId.tasks": { "id": "routes/api.projects.$projectId.tasks", "parentId": "root", "path": "api/projects/:projectId/tasks", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.projects._projectId.tasks-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.projects.$projectId.tasks.$taskId": { "id": "routes/api.projects.$projectId.tasks.$taskId", "parentId": "root", "path": "api/projects/:projectId/tasks/:taskId", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.projects._projectId.tasks._taskId-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.projects.$projectId.runs": { "id": "routes/api.projects.$projectId.runs", "parentId": "root", "path": "api/projects/:projectId/runs", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.projects._projectId.runs-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.projects.$projectId.runs.$runId": { "id": "routes/api.projects.$projectId.runs.$runId", "parentId": "root", "path": "api/projects/:projectId/runs/:runId", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.projects._projectId.runs._runId-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.models": { "id": "routes/api.models", "parentId": "root", "path": "api/models", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.models-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.chat": { "id": "routes/api.chat", "parentId": "root", "path": "api/chat", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.chat-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.chat.stream": { "id": "routes/api.chat.stream", "parentId": "root", "path": "api/chat/stream", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.chat.stream-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.tasks.create": { "id": "routes/api.tasks.create", "parentId": "root", "path": "api/tasks/create", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.tasks.create-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.debug.store": { "id": "routes/api.debug.store", "parentId": "root", "path": "api/debug/store", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.debug.store-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/_catchall": { "id": "routes/_catchall", "parentId": "root", "path": "*", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/_catchall-BqlTO8u_.js", "imports": ["/assets/chunk-LFPYN7LY-CfGVtWrQ.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 } }, "url": "/assets/manifest-fa332dc2.js", "version": "fa332dc2", "sri": void 0 };
const assetsBuildDirectory = "build/client";
const basename = "/";
const future = { "unstable_optimizeDeps": false, "unstable_subResourceIntegrity": false, "unstable_trailingSlashAwareDataRequests": false, "unstable_previewServerPrerendering": false, "v8_middleware": false, "v8_splitRouteModules": false, "v8_viteEnvironmentApi": false };
const ssr = true;
const isSpaMode = false;
const prerender = [];
const routeDiscovery = { "mode": "lazy", "manifestPath": "/__manifest" };
const publicPath = "/";
const entry = { module: entryServer };
const routes = {
  "root": {
    id: "root",
    parentId: void 0,
    path: "",
    index: void 0,
    caseSensitive: void 0,
    module: route0
  },
  "routes/_app": {
    id: "routes/_app",
    parentId: "root",
    path: void 0,
    index: void 0,
    caseSensitive: void 0,
    module: route1
  },
  "routes/_app._index": {
    id: "routes/_app._index",
    parentId: "routes/_app",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route2
  },
  "routes/_app.projects.$projectId": {
    id: "routes/_app.projects.$projectId",
    parentId: "routes/_app",
    path: "projects/:projectId",
    index: void 0,
    caseSensitive: void 0,
    module: route3
  },
  "routes/_app.projects.$projectId.tasks.$taskId": {
    id: "routes/_app.projects.$projectId.tasks.$taskId",
    parentId: "routes/_app",
    path: "projects/:projectId/tasks/:taskId",
    index: void 0,
    caseSensitive: void 0,
    module: route4
  },
  "routes/_app.projects.$projectId.knowledge": {
    id: "routes/_app.projects.$projectId.knowledge",
    parentId: "routes/_app",
    path: "projects/:projectId/knowledge",
    index: void 0,
    caseSensitive: void 0,
    module: route5
  },
  "routes/_app.settings": {
    id: "routes/_app.settings",
    parentId: "routes/_app",
    path: "settings",
    index: void 0,
    caseSensitive: void 0,
    module: route6
  },
  "routes/api.health": {
    id: "routes/api.health",
    parentId: "root",
    path: "api/health",
    index: void 0,
    caseSensitive: void 0,
    module: route7
  },
  "routes/api.config": {
    id: "routes/api.config",
    parentId: "root",
    path: "api/config",
    index: void 0,
    caseSensitive: void 0,
    module: route8
  },
  "routes/api.workdir": {
    id: "routes/api.workdir",
    parentId: "root",
    path: "api/workdir",
    index: void 0,
    caseSensitive: void 0,
    module: route9
  },
  "routes/api.tools": {
    id: "routes/api.tools",
    parentId: "root",
    path: "api/tools",
    index: void 0,
    caseSensitive: void 0,
    module: route10
  },
  "routes/api.credentials": {
    id: "routes/api.credentials",
    parentId: "root",
    path: "api/credentials",
    index: void 0,
    caseSensitive: void 0,
    module: route11
  },
  "routes/api.credentials.$id": {
    id: "routes/api.credentials.$id",
    parentId: "root",
    path: "api/credentials/:id",
    index: void 0,
    caseSensitive: void 0,
    module: route12
  },
  "routes/api.mcp.presets": {
    id: "routes/api.mcp.presets",
    parentId: "root",
    path: "api/mcp/presets",
    index: void 0,
    caseSensitive: void 0,
    module: route13
  },
  "routes/api.mcp.servers": {
    id: "routes/api.mcp.servers",
    parentId: "root",
    path: "api/mcp/servers",
    index: void 0,
    caseSensitive: void 0,
    module: route14
  },
  "routes/api.mcp.servers.$id": {
    id: "routes/api.mcp.servers.$id",
    parentId: "root",
    path: "api/mcp/servers/:id",
    index: void 0,
    caseSensitive: void 0,
    module: route15
  },
  "routes/api.mcp.status": {
    id: "routes/api.mcp.status",
    parentId: "root",
    path: "api/mcp/status",
    index: void 0,
    caseSensitive: void 0,
    module: route16
  },
  "routes/api.mcp.tools": {
    id: "routes/api.mcp.tools",
    parentId: "root",
    path: "api/mcp/tools",
    index: void 0,
    caseSensitive: void 0,
    module: route17
  },
  "routes/api.skills": {
    id: "routes/api.skills",
    parentId: "root",
    path: "api/skills",
    index: void 0,
    caseSensitive: void 0,
    module: route18
  },
  "routes/api.skills.validate": {
    id: "routes/api.skills.validate",
    parentId: "root",
    path: "api/skills/validate",
    index: void 0,
    caseSensitive: void 0,
    module: route19
  },
  "routes/api.skills.install": {
    id: "routes/api.skills.install",
    parentId: "root",
    path: "api/skills/install",
    index: void 0,
    caseSensitive: void 0,
    module: route20
  },
  "routes/api.skills.$id": {
    id: "routes/api.skills.$id",
    parentId: "root",
    path: "api/skills/:id",
    index: void 0,
    caseSensitive: void 0,
    module: route21
  },
  "routes/api.skills.$id.enabled": {
    id: "routes/api.skills.$id.enabled",
    parentId: "root",
    path: "api/skills/:id/enabled",
    index: void 0,
    caseSensitive: void 0,
    module: route22
  },
  "routes/api.logs": {
    id: "routes/api.logs",
    parentId: "root",
    path: "api/logs",
    index: void 0,
    caseSensitive: void 0,
    module: route23
  },
  "routes/api.logs.enabled": {
    id: "routes/api.logs.enabled",
    parentId: "root",
    path: "api/logs/enabled",
    index: void 0,
    caseSensitive: void 0,
    module: route24
  },
  "routes/api.logs.export": {
    id: "routes/api.logs.export",
    parentId: "root",
    path: "api/logs/export",
    index: void 0,
    caseSensitive: void 0,
    module: route25
  },
  "routes/api.logs.clear": {
    id: "routes/api.logs.clear",
    parentId: "root",
    path: "api/logs/clear",
    index: void 0,
    caseSensitive: void 0,
    module: route26
  },
  "routes/api.projects": {
    id: "routes/api.projects",
    parentId: "root",
    path: "api/projects",
    index: void 0,
    caseSensitive: void 0,
    module: route27
  },
  "routes/api.projects.active": {
    id: "routes/api.projects.active",
    parentId: "root",
    path: "api/projects/active",
    index: void 0,
    caseSensitive: void 0,
    module: route28
  },
  "routes/api.projects.$projectId": {
    id: "routes/api.projects.$projectId",
    parentId: "root",
    path: "api/projects/:projectId",
    index: void 0,
    caseSensitive: void 0,
    module: route29
  },
  "routes/api.projects.$projectId.knowledge": {
    id: "routes/api.projects.$projectId.knowledge",
    parentId: "root",
    path: "api/projects/:projectId/knowledge",
    index: void 0,
    caseSensitive: void 0,
    module: route30
  },
  "routes/api.projects.$projectId.collections": {
    id: "routes/api.projects.$projectId.collections",
    parentId: "root",
    path: "api/projects/:projectId/collections",
    index: void 0,
    caseSensitive: void 0,
    module: route31
  },
  "routes/api.projects.$projectId.collections.ensure": {
    id: "routes/api.projects.$projectId.collections.ensure",
    parentId: "root",
    path: "api/projects/:projectId/collections/ensure",
    index: void 0,
    caseSensitive: void 0,
    module: route32
  },
  "routes/api.projects.$projectId.documents": {
    id: "routes/api.projects.$projectId.documents",
    parentId: "root",
    path: "api/projects/:projectId/documents",
    index: void 0,
    caseSensitive: void 0,
    module: route33
  },
  "routes/api.projects.$projectId.documents.$documentId.artifact": {
    id: "routes/api.projects.$projectId.documents.$documentId.artifact",
    parentId: "root",
    path: "api/projects/:projectId/documents/:documentId/artifact",
    index: void 0,
    caseSensitive: void 0,
    module: route34
  },
  "routes/api.projects.$projectId.analyst-mcp.papers.$identifier.artifact": {
    id: "routes/api.projects.$projectId.analyst-mcp.papers.$identifier.artifact",
    parentId: "root",
    path: "api/projects/:projectId/analyst-mcp/papers/:identifier/artifact",
    index: void 0,
    caseSensitive: void 0,
    module: route35
  },
  "routes/api.projects.$projectId.artifacts.capture": {
    id: "routes/api.projects.$projectId.artifacts.capture",
    parentId: "root",
    path: "api/projects/:projectId/artifacts/capture",
    index: void 0,
    caseSensitive: void 0,
    module: route36
  },
  "routes/api.projects.$projectId.import.url": {
    id: "routes/api.projects.$projectId.import.url",
    parentId: "root",
    path: "api/projects/:projectId/import/url",
    index: void 0,
    caseSensitive: void 0,
    module: route37
  },
  "routes/api.projects.$projectId.import.file": {
    id: "routes/api.projects.$projectId.import.file",
    parentId: "root",
    path: "api/projects/:projectId/import/file",
    index: void 0,
    caseSensitive: void 0,
    module: route38
  },
  "routes/api.projects.$projectId.rag.query": {
    id: "routes/api.projects.$projectId.rag.query",
    parentId: "root",
    path: "api/projects/:projectId/rag/query",
    index: void 0,
    caseSensitive: void 0,
    module: route39
  },
  "routes/api.projects.$projectId.tasks": {
    id: "routes/api.projects.$projectId.tasks",
    parentId: "root",
    path: "api/projects/:projectId/tasks",
    index: void 0,
    caseSensitive: void 0,
    module: route40
  },
  "routes/api.projects.$projectId.tasks.$taskId": {
    id: "routes/api.projects.$projectId.tasks.$taskId",
    parentId: "root",
    path: "api/projects/:projectId/tasks/:taskId",
    index: void 0,
    caseSensitive: void 0,
    module: route41
  },
  "routes/api.projects.$projectId.runs": {
    id: "routes/api.projects.$projectId.runs",
    parentId: "root",
    path: "api/projects/:projectId/runs",
    index: void 0,
    caseSensitive: void 0,
    module: route42
  },
  "routes/api.projects.$projectId.runs.$runId": {
    id: "routes/api.projects.$projectId.runs.$runId",
    parentId: "root",
    path: "api/projects/:projectId/runs/:runId",
    index: void 0,
    caseSensitive: void 0,
    module: route43
  },
  "routes/api.models": {
    id: "routes/api.models",
    parentId: "root",
    path: "api/models",
    index: void 0,
    caseSensitive: void 0,
    module: route44
  },
  "routes/api.chat": {
    id: "routes/api.chat",
    parentId: "root",
    path: "api/chat",
    index: void 0,
    caseSensitive: void 0,
    module: route45
  },
  "routes/api.chat.stream": {
    id: "routes/api.chat.stream",
    parentId: "root",
    path: "api/chat/stream",
    index: void 0,
    caseSensitive: void 0,
    module: route46
  },
  "routes/api.tasks.create": {
    id: "routes/api.tasks.create",
    parentId: "root",
    path: "api/tasks/create",
    index: void 0,
    caseSensitive: void 0,
    module: route47
  },
  "routes/api.debug.store": {
    id: "routes/api.debug.store",
    parentId: "root",
    path: "api/debug/store",
    index: void 0,
    caseSensitive: void 0,
    module: route48
  },
  "routes/_catchall": {
    id: "routes/_catchall",
    parentId: "root",
    path: "*",
    index: void 0,
    caseSensitive: void 0,
    module: route49
  }
};
const allowedActionOrigins = false;
export {
  applyChatStreamEvent as a,
  allowedActionOrigins as b,
  createAgentProvider as c,
  assetsBuildDirectory as d,
  extractFinalAssistantText as e,
  basename as f,
  getProjectWorkspace as g,
  entry as h,
  future as i,
  isSpaMode as j,
  publicPath as k,
  routes as l,
  ssr as m,
  prerender as p,
  routeDiscovery as r,
  serverManifest as s
};
