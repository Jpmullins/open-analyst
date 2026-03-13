import { listLogs } from "~/lib/logs.server";

export async function loader() {
  const result = listLogs();
  return Response.json(result);
}
