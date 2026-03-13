import { clearLogs } from "~/lib/logs.server";
import type { Route } from "./+types/api.logs.clear";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const result = clearLogs();
  return Response.json(result);
}
