import fs from "fs";
import path from "path";
import { installSkill } from "~/lib/skills.server";
import { parseJsonBody } from "~/lib/request-utils";
import type { Route } from "./+types/api.skills.install";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = await parseJsonBody(request);
  if (body instanceof Response) return body;
  const folderPath = String(body.folderPath || "").trim();
  if (!folderPath) {
    return Response.json(
      { error: "folderPath is required" },
      { status: 400 }
    );
  }
  const skillPath = path.resolve(folderPath);
  if (!fs.existsSync(skillPath) || !fs.statSync(skillPath).isDirectory()) {
    return Response.json(
      { error: "folderPath must be an existing directory" },
      { status: 400 }
    );
  }
  if (!fs.existsSync(path.join(skillPath, "SKILL.md"))) {
    return Response.json(
      { error: "SKILL.md not found in folderPath" },
      { status: 400 }
    );
  }
  const skill = installSkill(folderPath);
  return Response.json({ success: true, skill });
}
