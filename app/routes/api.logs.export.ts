import { exportLogs } from "~/lib/logs.server";
import type { Route } from "./+types/api.logs.export";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const result = exportLogs();
  return Response.json(result);
}
