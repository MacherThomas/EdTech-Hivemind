import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

/**
 * Local-disk storage adapter for development. Production storage (location,
 * encryption at rest, data residency) is part of the IE Cloud Services review.
 */
const root = () => path.resolve(process.env.UPLOAD_DIR ?? "./uploads");

export async function putObject(data: Buffer, fileName: string) {
  const ext = path.extname(fileName).toLowerCase().replace(/[^.a-z0-9]/g, "");
  const key = `${new Date().toISOString().slice(0, 7)}/${randomBytes(16).toString("hex")}${ext}`;
  const full = path.join(root(), key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  return key;
}

export async function getObject(key: string) {
  const full = path.join(root(), key);
  if (!full.startsWith(root() + path.sep)) throw new Error("Invalid storage key");
  return readFile(full);
}
