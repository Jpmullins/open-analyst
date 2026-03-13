import { getMcpPresets } from "~/lib/mcp.server";

export async function loader() {
  return Response.json({ presets: getMcpPresets() });
}
