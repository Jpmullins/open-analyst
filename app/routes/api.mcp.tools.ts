import { getMcpTools } from '~/lib/mcp.server';

export async function loader() {
  return Response.json({ tools: await getMcpTools() });
}
