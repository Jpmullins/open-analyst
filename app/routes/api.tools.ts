import { listAvailableTools } from "~/lib/tools.server";

export async function loader() {
  return Response.json({ tools: listAvailableTools() });
}
