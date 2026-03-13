import { listSkills } from "~/lib/skills.server";

export async function loader() {
  return Response.json({ skills: listSkills() });
}
