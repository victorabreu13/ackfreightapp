import { createSign, randomBytes } from "node:crypto";
import { GoogleAuth } from "google-auth-library";

export type DriveFetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Test seam for Application Default Credentials. Production uses the Cloud Run service account. */
export type DriveTokenSource = () => Promise<string>;

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

type ServiceAccount = { client_email: string; private_key: string };

export function signDriveJwt(account: ServiceAccount, now = Date.now()): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claim = Buffer.from(
    JSON.stringify({
      iss: account.client_email,
      scope: DRIVE_SCOPE,
      aud: "https://oauth2.googleapis.com/token",
      iat: Math.floor(now / 1000),
      exp: Math.floor(now / 1000) + 3600,
    }),
  ).toString("base64url");
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  return `${unsigned}.${signer.sign(account.private_key).toString("base64url")}`;
}

export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
    if (!parsed.client_email || !parsed.private_key) return null;
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  } catch {
    return null;
  }
}

async function accessToken(account: ServiceAccount, fetchImpl: DriveFetch): Promise<string> {
  const assertion = signDriveJwt(account);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`Drive token HTTP ${response.status}`);
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Drive token missing");
  return json.access_token;
}

async function applicationDefaultToken(): Promise<string> {
  const auth = new GoogleAuth({ scopes: [DRIVE_SCOPE] });
  const token = await auth.getAccessToken();
  if (!token) throw new Error("Drive token missing");
  return token;
}

async function driveAccessToken(input: {
  serviceAccountJson?: string;
  fetchImpl: DriveFetch;
  tokenSource?: DriveTokenSource;
}): Promise<string> {
  const raw = input.serviceAccountJson !== undefined ? input.serviceAccountJson : process.env.GOOGLE_DRIVE_SA_JSON;
  const account = parseServiceAccount(raw);
  if (account) return accessToken(account, input.fetchImpl);
  if (input.tokenSource) return input.tokenSource();
  return applicationDefaultToken();
}

function folderQuery(parentId: string, name: string): string {
  const safe = name.replace(/'/g, "\\'");
  return `name = '${safe}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
}

function fileQuery(parentId: string, name: string): string {
  const safe = name.replace(/'/g, "\\'");
  return `name = '${safe}' and '${parentId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;
}

function driveFilesUrl(fileId: string | undefined, params: Record<string, string>, list = false): string {
  const query = new URLSearchParams(params);
  query.set("supportsAllDrives", "true");
  if (list) query.set("includeItemsFromAllDrives", "true");
  const path = fileId ? `/${encodeURIComponent(fileId)}` : "";
  return `https://www.googleapis.com/drive/v3/files${path}?${query}`;
}

function driveUploadUrl(fileId: string | undefined, uploadType: "multipart" | "media"): string {
  const query = new URLSearchParams({ uploadType, supportsAllDrives: "true" });
  const path = fileId ? `/${encodeURIComponent(fileId)}` : "";
  return `https://www.googleapis.com/upload/drive/v3/files${path}?${query}`;
}

type DrivePayload = { id?: string; name?: string; files?: Array<{ id: string }>; webViewLink?: string };

async function driveJson(fetchImpl: DriveFetch, url: string, token: string, init?: RequestInit) {
  const response = await fetchImpl(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`Drive HTTP ${response.status}`);
  return response.json() as Promise<DrivePayload>;
}

async function ensureFolder(fetchImpl: DriveFetch, token: string, parentId: string, name: string): Promise<string> {
  const listed = await driveJson(
    fetchImpl,
    driveFilesUrl(undefined, { q: folderQuery(parentId, name), fields: "files(id)" }, true),
    token,
  );
  if (listed.files?.[0]?.id) return listed.files[0].id;
  const created = await driveJson(fetchImpl, driveFilesUrl(undefined, {}), token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });
  if (!created.id) throw new Error("Drive folder was not created");
  return created.id;
}

function multipartUpload(metadata: { name: string; parents: string[] }, mime: string, bytes: Buffer): {
  body: Uint8Array;
  contentType: string;
} {
  const boundary = `ack_${randomBytes(12).toString("hex")}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--`, "utf8");
  return {
    body: Uint8Array.from(Buffer.concat([head, bytes, tail])),
    contentType: `multipart/related; boundary=${boundary}`,
  };
}

export function driveFolderName(value: string): string {
  const cleaned = value.replace(/[\\/]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || "No client";
}

/** Folder under the Drive root. Unset means "ACK Guías". Blank means no extra folder. */
export function resolveDriveLibrary(folder: string | undefined): string {
  if (folder === undefined) return "ACK Guías";
  return folder.trim();
}

export function driveLibraryName(): string {
  return resolveDriveLibrary(process.env.ACK_GUIAS_DRIVE_FOLDER);
}

export function driveRootId(): string {
  return process.env.ACK_GUIAS_DRIVE_ROOT_ID?.trim() ?? "";
}

export async function uploadDrivePdf(input: {
  rootId: string;
  clientName: string;
  awbFolder: string;
  fileName: string;
  bytes: Buffer;
  /** Defaults to application/pdf. Team uploads pass the file's own type. */
  mime?: string;
  /** Defaults to driveLibraryName(). Blank skips the library folder. */
  libraryName?: string;
  serviceAccountJson?: string;
  /** Used when no service account key is configured. Defaults to Application Default Credentials. */
  tokenSource?: DriveTokenSource;
  fetchImpl?: DriveFetch;
}): Promise<{ id: string; url: string }> {
  if (!input.rootId.trim()) throw new Error("Drive is not configured");
  const fetchImpl = input.fetchImpl ?? fetch;
  const token = await driveAccessToken({ ...input, fetchImpl });
  const library = input.libraryName === undefined ? driveLibraryName() : input.libraryName.trim();
  let parentId = input.rootId;
  if (library) {
    const root = await driveJson(fetchImpl, driveFilesUrl(input.rootId, { fields: "id,name" }), token);
    if ((root.name ?? "").trim().toLowerCase() !== library.toLowerCase()) {
      parentId = await ensureFolder(fetchImpl, token, input.rootId, library);
    }
  }
  const clientId = await ensureFolder(fetchImpl, token, parentId, driveFolderName(input.clientName));
  const awbId = await ensureFolder(fetchImpl, token, clientId, driveFolderName(input.awbFolder));
  const existing = await driveJson(
    fetchImpl,
    driveFilesUrl(undefined, { q: fileQuery(awbId, input.fileName), fields: "files(id)" }, true),
    token,
  );
  const mime = input.mime?.split(";")[0]?.trim() || "application/pdf";
  const existingId = existing.files?.[0]?.id;
  let uploaded: DrivePayload;
  if (existingId) {
    uploaded = await driveJson(fetchImpl, driveUploadUrl(existingId, "media"), token, {
      method: "PATCH",
      headers: { "content-type": mime },
        body: Uint8Array.from(input.bytes) as BodyInit,
    });
  } else {
    const part = multipartUpload({ name: input.fileName, parents: [awbId] }, mime, input.bytes);
    uploaded = await driveJson(fetchImpl, driveUploadUrl(undefined, "multipart"), token, {
      method: "POST",
      headers: { "content-type": part.contentType },
      body: part.body as BodyInit,
    });
  }
  const fileId = uploaded.id ?? existingId;
  if (!fileId) throw new Error("Drive upload did not return a file id");
  return { id: fileId, url: `https://drive.google.com/file/d/${fileId}/view` };
}

async function authorized(input: { serviceAccountJson?: string; tokenSource?: DriveTokenSource; fetchImpl?: DriveFetch }) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const token = await driveAccessToken({ ...input, fetchImpl });
  return { fetchImpl, token };
}

export async function downloadDriveFile(input: {
  fileId: string;
  serviceAccountJson?: string;
  tokenSource?: DriveTokenSource;
  fetchImpl?: DriveFetch;
}): Promise<Buffer> {
  const { fetchImpl, token } = await authorized(input);
  const response = await fetchImpl(driveFilesUrl(input.fileId, { alt: "media" }), {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Drive HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function trashDriveFile(input: {
  fileId: string;
  serviceAccountJson?: string;
  tokenSource?: DriveTokenSource;
  fetchImpl?: DriveFetch;
}): Promise<void> {
  const { fetchImpl, token } = await authorized(input);
  const response = await fetchImpl(driveFilesUrl(input.fileId, {}), {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
  if (!response.ok) throw new Error(`Drive HTTP ${response.status}`);
}
