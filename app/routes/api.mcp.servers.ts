import { listMcpServers, saveMcpServer } from "~/lib/mcp.server";
import type { Route } from "./+types/api.mcp.servers";

export async function loader() {
  return Response.json({ servers: listMcpServers() });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = await request.json();
  const server = saveMcpServer(body);
  return Response.json({ server });
}
