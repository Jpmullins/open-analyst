<p align="center">
  <img src="resources/logo.png" alt="Open Analyst Logo" width="280" />
</p>

<h1 align="center">🚀 Open Analyst: Your Personal AI Agent Desktop App</h1>

<p align="center">
  • Analyst Assistant Desktop Platform • UI-First Workflow
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#demo">Demo</a> •
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#skills">Skills Library</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue" alt="Platform" />
  <img src="https://img.shields.io/badge/License-Proprietary-red" alt="License" />
  <img src="https://img.shields.io/badge/Node.js-18+-brightgreen" alt="Node.js" />
</p>

---

## 📖 Introduction

**Open Analyst** is an analyst-assistant desktop platform for internal, UI-first analysis workflows.

It provides a sandboxed workspace where AI can manage files, generate professional outputs (PPTX, DOCX, XLSX, etc.) through our built-in **Skills** system, and **connect to desktop apps via MCP** (browser, Notion, etc.) for better collaboration.

> [!WARNING]
> **Disclaimer**: Open Analyst is an AI collaboration tool. Please exercise caution with its operations, especially when authorizing file modifications or deletions. We support VM-based sandbox isolation, but some operations may still carry risks.

---

<a id="features"></a>
## ✨ Key Features

|               | MCP & Skills | Remote Control | GUI Operation |
| ------------- | ------------ | -------------- | ------------- |
| Claude Cowork | ✓            | ✗              | ✗             |
| OpenClaw      | ✓            | ✓              | ✗             |
| Open Analyst | ✓            | ✗ (disabled)   | ✓             |

- **UI-First, Internal Use**: Operates primarily through the desktop UI and local workspace for internal analyst workflows.
- **Flexible Model Support**: Supports **Claude**, **OpenAI-compatible APIs**, and other compatible providers through custom endpoint configuration.
- **UI-First Workflow**: Primary operation is through the desktop UI. Remote control features are currently disabled during refactor.
- **GUI Operation**: Control and interact with various desktop GUI applications on your computer. **Recommended model: Gemini-3-Pro** for optimal GUI understanding and control.
- **Smart File Management**: Read, write, and organize files within your workspace.
- **Skills System**: Built-in workflows for PPTX, DOCX, PDF, XLSX generation and processing. **Supports custom skill creation and deletion.**
- **MCP External Service Support**: Integrate browser, Notion, custom apps and more through **MCP Connectors** to extend AI capabilities.
- **Multimodal Input**: Drag & drop files and images directly into the chat input for seamless multimodal interaction.
- **Real-time Trace**: Watch AI reasoning and tool execution in the Trace Panel.
- **Secure Workspace**: All operations confined to your chosen workspace folder.
- **VM-Level Isolation**: WSL2 (Windows) and Lima (macOS) VM isolation—all commands execute in an isolated VM to protect your host system.
- **UI Enhancements**: Beautiful and flexible UI design, comprehensive MCP/Skills/Tools call display.

<a id="demo"></a>



## 🎬 Demo

See Open Analyst in action:

### 1. Folder Organization & Cleanup 📂
https://github.com/user-attachments/assets/dbeb0337-2d19-4b5d-a438-5220f2a87ca7

### 2. Generate PPT from Files 📊
https://github.com/user-attachments/assets/30299ded-0260-468f-b11d-d282bb9c97f2

### 3. Generate XLSX Spreadsheets 📉
https://github.com/user-attachments/assets/f57b9106-4b2c-4747-aecd-a07f78af5dfc

---

<a id="installation"></a>
## 📦 Installation

### Build from Source

For developers who want to contribute or modify the codebase:

```bash
git clone https://github.com/ARLIS/open-analyst.git
cd open-analyst
npm install
npm run rebuild
npm run dev
```

To create a production app build (without installers): `npm run build`

### Security Configuration: 🔒 Sandbox Support

Open Analyst provides **multi-level sandbox protection** to keep your system safe:

| Level | Platform | Technology | Description |
|-------|----------|------------|-------------|
| **Basic** | All | Path Guard | File operations restricted to workspace folder |
| **Enhanced** | Windows | WSL2 | Commands execute in isolated Linux VM |
| **Enhanced** | macOS | Lima | Commands execute in isolated Linux VM |

- **Windows (WSL2)**: When WSL2 is detected, all Bash commands are automatically routed to a Linux VM. The workspace is synced bidirectionally.
- **macOS (Lima)**: When [Lima](https://lima-vm.io/) is installed (`brew install lima`), commands run in an Ubuntu VM with `/Users` mounted.
- **Fallback**: If no VM is available, commands run natively with path-based restrictions.

**Setup (Optional, Recommended)**

- **Windows**: WSL2 is auto-detected if installed. [Install WSL2](https://docs.microsoft.com/en-us/windows/wsl/install)

- **macOS**:
Lima is auto-detected if installed. Install command:
```bash
brew install lima
# Open Analyst will automatically create and manage a 'claude-sandbox' VM
```

---

<a id="quick-start"></a>
## 🚀 Quick Start Guide

### 1. Get an API Key
You need an API key to power the agent. We support **OpenRouter**, **Anthropic**, **OpenAI**, and compatible custom endpoints.

| Provider | Get Key / Coding Plan | Base URL (Required) | Recommended Model |
|----------|-----------------------|---------------------|-------------------|
| **OpenRouter** | [OpenRouter](https://openrouter.ai/) | `https://openrouter.ai/api` | `claude-4-5-sonnet` |
| **Anthropic** | [Anthropic Console](https://console.anthropic.com/) | (Default) | `claude-4-5-sonnet` |
| **OpenAI** | [OpenAI Platform](https://platform.openai.com/) | `https://api.openai.com/v1` | `gpt-4o` |
| **Custom** | Your internal provider | Required | Your configured model |

### 2. Configure
1. Open the app and click the ⚙️ **Settings** icon in the bottom left.
2. Paste your **API Key**.
3. **Crucial**: Set the **Base URL** according to the table above.
4. Enter the **Model** name you want to use.

### 3. Start Coworking
1. **Select a Workspace**: Choose a folder where Claude is allowed to work.
2. **Enter a Prompt**:
   > "Read the financial_report.csv in this folder and create a PowerPoint summary with 5 slides."

### 📝 Important Notes

1.  **macOS Installation**: If you see a security warning when opening the app, go to **System Settings > Privacy & Security** and click **Open Anyway**. If it is still blocked, run:

```bash
sudo xattr -rd com.apple.quarantine "/Applications/Open Analyst.app"
```
2.  **Network Access**: For tools like `WebSearch`, you may need to enable "Virtual Network Interface" (TUN Mode) in your proxy settings to ensure connectivity.
3. **Notion Connector**: Besides setting the integration token, you also need to add connections in a root page. See https://www.notion.com/help/add-and-manage-connections-with-the-api for more details.
---

<a id="skills"></a>
## 🧰 Skills Library

Open Analyst ships with built-in skills under `.claude/skills/`, and supports user-added or custom skills, including:
- `pptx` for PowerPoint generation
- `docx` for Word document processing
- `pdf` for PDF handling and forms
- `xlsx` for Excel spreadsheet support
- `skill-creator` for creating custom skills

---

## 🏗️ Architecture

```
open-analyst/
├── src/
│   ├── main/                    # Electron Main Process (Node.js)
│   │   ├── index.ts             # Main entry point
│   │   ├── claude/              # Agent SDK & Runner
│   │   │   └── agent-runner.ts  # AI agent execution logic
│   │   ├── config/              # Configuration management
│   │   │   └── config-store.ts  # Persistent settings storage
│   │   ├── db/                  # Database layer
│   │   │   └── database.ts      # SQLite/data persistence
│   │   ├── ipc/                 # IPC handlers
│   │   ├── memory/              # Memory management
│   │   │   └── memory-manager.ts
│   │   ├── sandbox/             # Security & Path Resolution
│   │   │   └── path-resolver.ts # Sandboxed file access
│   │   ├── session/             # Session management
│   │   │   └── session-manager.ts
│   │   ├── skills/              # Skill Loader & Manager
│   │   │   └── skills-manager.ts
│   │   └── tools/               # Tool execution
│   │       └── tool-executor.ts # Tool call handling
│   ├── preload/                 # Electron preload scripts
│   │   └── index.ts             # Context bridge setup
│   └── renderer/                # Frontend UI (React + Tailwind)
│       ├── App.tsx              # Root component
│       ├── main.tsx             # React entry point
│       ├── components/          # UI Components
│       │   ├── ChatView.tsx     # Main chat interface
│       │   ├── ConfigModal.tsx  # Settings dialog
│       │   ├── ContextPanel.tsx # File context display
│       │   ├── MessageCard.tsx  # Chat message component
│       │   ├── PermissionDialog.tsx
│       │   ├── Sidebar.tsx      # Navigation sidebar
│       │   ├── Titlebar.tsx     # Custom window titlebar
│       │   ├── TracePanel.tsx   # AI reasoning trace
│       │   └── WelcomeView.tsx  # Onboarding screen
│       ├── hooks/               # Custom React hooks
│       │   └── useIPC.ts        # IPC communication hook
│       ├── store/               # State management
│       │   └── index.ts
│       ├── styles/              # CSS styles
│       │   └── globals.css
│       ├── types/               # TypeScript types
│       │   └── index.ts
│       └── utils/               # Utility functions
├── .claude/
│   └── skills/                  # Default Skill Definitions
│       ├── pptx/                # PowerPoint generation
│       ├── docx/                # Word document processing
│       ├── pdf/                 # PDF handling & forms
│       ├── xlsx/                # Excel spreadsheet support
│       └── skill-creator/       # Skill development toolkit
├── resources/                   # Static Assets (icons, images)
├── vite.config.ts               # Vite bundler config
└── package.json                 # Dependencies & scripts
```

---

## 🗺️ Roadmap

- [x] **Core**: Stable desktop app workflow
- [x] **Security**: Full Filesystem Sandboxing
- [x] **Skills**: PPTX, DOCX, PDF, XLSX Support + Custom Skill Management
- [x] **VM Sandbox**: WSL2 (Windows) and Lima (macOS) isolation support
- [x] **MCP Connectors**: Custom connector support for external service integration
- [x] **Rich Input**: File upload and image input in chat
- [x] **Multi-Model**: OpenAI-compatible API support (iterating)
- [x] **UI/UX**: Enhanced English-only interface for internal use
- [ ] **Memory Optimization**: Improved context management for longer sessions and cross-session memory.
- [ ] **New Features**: Stay tuned!

---

## 🛠️ Contributing

We welcome contributions! Whether it's a new Skill, a UI fix, or a security improvement:

1. Fork the repo.
2. Create a branch (`git checkout -b feature/NewSkill`).
3. Submit a PR.

---

## 📄 License

Proprietary © 2026 Justin Mullins, ARLIS (Applied Research Laboratory for Intelligence and Security)

---

<p align="center">
  Made with ❤️ by the Justin Mullins and ARLIS with the help of opus4.5
</p>
