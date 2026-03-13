import fs from "fs";
import path from "path";
import { getSettings, upsertSettings } from "~/lib/db/queries/settings.server";
import type { Route } from "./+types/api.workdir";

export async function loader() {
  const settings = await getSettings();
  return Response.json({
    workingDir: settings.workingDir,
    workingDirType: settings.workingDirType || "local",
    s3Uri: settings.s3Uri || "",
  });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = await request.json();
  const inputPath = String(body.path || "").trim();
  const workingDirType = String(
    body.workingDirType || (inputPath.startsWith("s3://") ? "s3" : "local")
  );
  if (!inputPath) {
    return Response.json(
      { success: false, error: "path is required" },
      { status: 400 }
    );
  }
  let updates: Partial<{ workingDir: string; workingDirType: string; s3Uri: string }>;
  if (workingDirType === "local") {
    const resolved = path.resolve(inputPath);
    if (!fs.existsSync(resolved)) {
      return Response.json(
        { success: false, error: `Path not found: ${resolved}` },
        { status: 400 }
      );
    }
    updates = { workingDir: resolved, workingDirType: "local", s3Uri: "" };
  } else {
    updates = { workingDir: inputPath, workingDirType: "s3", s3Uri: inputPath };
  }
  await upsertSettings(updates);
  return Response.json({
    success: true,
    path: updates.workingDir,
    workingDirType: updates.workingDirType,
  });
}
