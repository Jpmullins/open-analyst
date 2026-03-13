import {
  getSettings,
  upsertSettings,
} from "~/lib/db/queries/settings.server";
import type { Route } from "./+types/api.config";

export async function loader() {
  const settings = await getSettings();
  return Response.json(settings);
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = await request.json();
  const settings = await upsertSettings(body);
  return Response.json({ success: true, config: settings });
}
