import { env } from "~/lib/env.server";

export interface RuntimeProjectContext {
  project_id: string;
  project_name: string;
  brief: string;
  retrieval_policy: Record<string, unknown>;
  memory_profile: Record<string, unknown>;
  templates: Array<Record<string, unknown>>;
  agent_policies: Record<string, unknown>;
  connector_ids: string[];
  active_connector_ids: string[];
  available_tools: Array<{
    name: string;
    description: string;
    source: string;
    server_id?: string;
    server_name?: string;
    active: boolean;
  }>;
  available_skills?: Array<{
    id: string;
    name: string;
    description?: string;
    enabled: boolean;
    pinned: boolean;
    tools: string[];
    source_kind?: string;
  }>;
  pinned_skill_ids?: string[];
  matched_skill_ids?: string[];
  api_base_url?: string;
  collection_id?: string;
}

export interface RuntimeMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface RuntimeInvokePayload {
  run_id: string;
  thread_id?: string | null;
  mode: string;
  prompt: string;
  messages: RuntimeMessage[];
  project: RuntimeProjectContext;
  stream?: boolean;
}

export interface RuntimeInvokeResult {
  status: string;
  final_text: string;
  active_plan?: Array<Record<string, unknown>>;
  evidence_bundle?: Array<Record<string, unknown>>;
  approvals?: Array<Record<string, unknown>>;
}

export async function invokeRuntime(payload: RuntimeInvokePayload): Promise<RuntimeInvokeResult> {
  const res = await fetch(`${env.LANGGRAPH_RUNTIME_URL}/invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, stream: false }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Runtime invoke failed: ${res.status} ${body}`);
  }

  return (await res.json()) as RuntimeInvokeResult;
}

export async function streamRuntime(payload: RuntimeInvokePayload): Promise<Response> {
  const res = await fetch(`${env.LANGGRAPH_RUNTIME_URL}/invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, stream: true }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Runtime stream failed: ${res.status} ${body}`);
  }

  return res;
}
