import fs from "fs";
import os from "os";
import path from "path";

let originalDataDir: string | undefined;

export function createTempDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oa-rr7-test-"));
  originalDataDir = process.env.OPEN_ANALYST_DATA_DIR;
  process.env.OPEN_ANALYST_DATA_DIR = dir;
  return dir;
}

export function cleanupTempDataDir(dir: string): void {
  process.env.OPEN_ANALYST_DATA_DIR = originalDataDir;
  fs.rmSync(dir, { recursive: true, force: true });
}
