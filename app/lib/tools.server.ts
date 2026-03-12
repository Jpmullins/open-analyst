import type { ToolDefinition } from "./types";

const TOOL_DEFS: Array<{
  type: string;
  function: { name: string; description: string; parameters: unknown };
}> = [
  {
    type: "function",
    function: {
      name: "list_directory",
      description: "List directory contents",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a UTF-8 text file",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
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
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "Replace first occurrence of old_string with new_string in a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          old_string: { type: "string" },
          new_string: { type: "string" },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
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
          path: { type: "string" },
        },
        required: ["pattern", "path"],
      },
    },
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
          path: { type: "string" },
        },
        required: ["pattern", "path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_fetch",
      description:
        "Fetch URL content from the web with binary-safe handling and automatic source capture",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string" },
          collectionName: { type: "string" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for a query and return summary results",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "hf_daily_papers",
      description:
        "Fetch Hugging Face daily papers for a date (YYYY-MM-DD) and capture them",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string" },
          collectionName: { type: "string" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "hf_paper",
      description:
        "Fetch a Hugging Face paper by arXiv id and capture it",
      parameters: {
        type: "object",
        properties: {
          arxiv_id: { type: "string" },
          collectionName: { type: "string" },
        },
        required: ["arxiv_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deep_research",
      description:
        "Perform multi-step deep research: decompose query, search/fetch multiple sources, synthesize cited report, and store it.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string" },
          breadth: { type: "number" },
          fetch_limit: { type: "number" },
          collectionName: { type: "string" },
        },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "collection_overview",
      description:
        "List what is in the active collection (or project) and summarize source contents.",
      parameters: {
        type: "object",
        properties: {
          collectionId: { type: "string" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "collection_artifact_metadata",
      description:
        "List stored artifact metadata for the active collection or project, including storage URIs and artifact links.",
      parameters: {
        type: "object",
        properties: {
          collectionId: { type: "string" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "capture_artifact",
      description:
        "Capture a generated workspace file into the project store and artifact backend.",
      parameters: {
        type: "object",
        properties: {
          relativePath: { type: "string" },
          title: { type: "string" },
          collectionId: { type: "string" },
          collectionName: { type: "string" },
        },
        required: ["relativePath"],
      },
    },
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
          cwd: { type: "string" },
        },
        required: ["command", "cwd"],
      },
    },
  },
];

export function listAvailableTools(): ToolDefinition[] {
  return TOOL_DEFS.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
  }));
}

export function getToolDefs() {
  return TOOL_DEFS;
}
