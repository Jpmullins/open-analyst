import { validateSkillPath } from "~/lib/skills.server";
import { parseJsonBody } from "~/lib/request-utils";
import type { Route } from "./+types/api.skills.validate";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = await parseJsonBody(request);
  if (body instanceof Response) return body;
  const folderPath = String(body.folderPath || "").trim();
  const result = validateSkillPath(folderPath);
  return Response.json(result);
}
