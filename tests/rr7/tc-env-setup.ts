/**
 * Vitest setupFile — runs in each worker before tests.
 * Reads the container URL written by global-setup.ts and sets DATABASE_URL.
 */
import fs from "node:fs";
import path from "node:path";

const TMP_URL_FILE = path.join("/tmp", "oa-test-db-url");
const WAIT_TIMEOUT_MS = 30_000;
const WAIT_INTERVAL_MS = 100;

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function waitForUrlFile(filePath: string): string {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (!fs.existsSync(filePath) && Date.now() < deadline) {
    sleepSync(WAIT_INTERVAL_MS);
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`Timed out waiting for test database URL at ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf-8").trim();
}

const url = waitForUrlFile(TMP_URL_FILE);
process.env.DATABASE_URL = url;
