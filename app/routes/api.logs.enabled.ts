import { isLogsEnabled, setLogsEnabled } from "~/lib/logs.server";
import type { Route } from "./+types/api.logs.enabled";

export async function loader() {
  return Response.json({ enabled: await isLogsEnabled() });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = await request.json();
  const result = await setLogsEnabled(body.enabled !== false);
  return Response.json(result);
}
