import {
  updateCredential,
  deleteCredential,
} from "~/lib/credentials.server";
import type { Route } from "./+types/api.credentials.$id";

export async function action({ request, params }: Route.ActionArgs) {
  const id = params.id;

  if (request.method === "PATCH") {
    const body = await request.json();
    const credential = updateCredential(id, body);
    if (!credential) {
      return Response.json(
        { error: `Credential not found: ${id}` },
        { status: 404 }
      );
    }
    return Response.json({ credential });
  }

  if (request.method === "DELETE") {
    deleteCredential(id);
    return Response.json({ success: true });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
