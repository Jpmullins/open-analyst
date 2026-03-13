import { getMcpStatus } from '~/lib/mcp.server';

export async function loader() {
  return Response.json({ statuses: await getMcpStatus() });
}
