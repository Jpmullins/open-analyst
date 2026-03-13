import { deleteMcpServer } from "~/lib/mcp.server";
import type { Route } from "./+types/api.mcp.servers.$id";

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  deleteMcpServer(params.id);
  return Response.json({ success: true });
}
