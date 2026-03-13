import { setSkillEnabled } from "~/lib/skills.server";
import type { Route } from "./+types/api.skills.$id.enabled";

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = await request.json();
  const enabled = body.enabled !== false;
  const skill = setSkillEnabled(params.id, enabled);
  if (!skill) {
    return Response.json(
      { error: `Skill not found: ${params.id}` },
      { status: 404 }
    );
  }
  return Response.json({ success: true, skill });
}
