import { deleteSkill } from "~/lib/skills.server";
import type { Route } from "./+types/api.skills.$id";

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  deleteSkill(params.id);
  return Response.json({ success: true });
}
