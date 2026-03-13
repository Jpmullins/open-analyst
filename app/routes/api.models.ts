import { fetchModels } from "~/lib/litellm.server";

export async function loader() {
  try {
    const models = await fetchModels();
    return Response.json({ models });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 502 });
  }
}
