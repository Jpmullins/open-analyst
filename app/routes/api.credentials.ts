import {
  listCredentials,
  createCredential,
} from "~/lib/credentials.server";
import type { Route } from "./+types/api.credentials";

export async function loader() {
  return Response.json({ credentials: listCredentials() });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = await request.json();
  if (!String(body.name || "").trim() || !String(body.username || "").trim()) {
    return Response.json(
      { error: "name and username are required" },
      { status: 400 }
    );
  }
  const credential = createCredential(body);
  return Response.json({ credential }, { status: 201 });
}
