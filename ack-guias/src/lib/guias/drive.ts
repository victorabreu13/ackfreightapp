import { createSign } from "node:crypto";

export type DriveFetch = (input: string, init?: RequestInit) => Promise<Response>;

type ServiceAccount = { client_email: string; private_key: string };

export function signDriveJwt(account: ServiceAccount, now = Date.now()): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claim = Buffer.from(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/drive",
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

function folderQuery(parentId: string, name: string): string {
  const safe = name.replace(/'/g, "\\'");
  return `name = '${safe}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
}

function fileQuery(parentId: string, name: string): string {
  const safe = name.replace(/'/g, "\\'");
  return `name = '${safe}' and '${parentId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;
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
    `https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&includeItemsFromAllDrives=true&q=${encodeURIComponent(folderQuery(parentId, name))}&fields=files(id)`,
    token,
  );
  if (listed.files?.[0]?.id) return listed.files[0].id;
  const created = await driveJson(fetchImpl, "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", token, {
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
  fetchImpl?: DriveFetch;
}): Promise<{ id: string; url: string }> {
  const account = parseServiceAccount(input.serviceAccountJson ?? process.env.GOOGLE_DRIVE_SA_JSON);
  if (!account) throw new Error("Drive is not configured");
  if (!input.rootId.trim()) throw new Error("Drive is not configured");
  const fetchImpl = input.fetchImpl ?? fetch;
  const token = await accessToken(account, fetchImpl);
  const library = input.libraryName === undefined ? driveLibraryName() : input.libraryName.trim();
  let parentId = input.rootId;
  if (library) {
    const root = await driveJson(
      fetchImpl,
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.rootId)}?supportsAllDrives=true&fields=id,name`,
      token,
    );
    if ((root.name ?? "").trim().toLowerCase() !== library.toLowerCase()) {
      parentId = await ensureFolder(fetchImpl, token, input.rootId, library);
    }
  }
  const clientId = await ensureFolder(fetchImpl, token, parentId, driveFolderName(input.clientName));
  const awbId = await ensureFolder(fetchImpl, token, clientId, driveFolderName(input.awbFolder));
  const existing = await driveJson(
    fetchImpl,
    `https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&includeItemsFromAllDrives=true&q=${encodeURIComponent(fileQuery(awbId, input.fileName))}&fields=files(id)`,
    token,
  );
  const media = `https://www.googleapis.com/upload/drive/v3/files${existing.files?.[0]?.id ? `/${existing.files[0].id}` : ""}?uploadType=media&supportsAllDrives=true`;
  const method = existing.files?.[0]?.id ? "PATCH" : "POST";
  const mime = input.mime?.split(";")[0]?.trim() || "application/pdf";
  const uploaded = await driveJson(fetchImpl, media, token, {
    method,
    headers: { "content-type": mime },
    body: new Uint8Array(input.bytes),
  });
  const fileId = uploaded.id ?? existing.files?.[0]?.id;
  if (!fileId) throw new Error("Drive upload did not return a file id");
  if (!existing.files?.[0]?.id) {
    await driveJson(fetchImpl, `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${awbId}&supportsAllDrives=true`, token, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: input.fileName }),
    });
  }
  return { id: fileId, url: `https://drive.google.com/file/d/${fileId}/view` };
}

async function authorized(input: { serviceAccountJson?: string; fetchImpl?: DriveFetch }) {
  const account = parseServiceAccount(input.serviceAccountJson ?? process.env.GOOGLE_DRIVE_SA_JSON);
  if (!account) throw new Error("Drive is not configured");
  const fetchImpl = input.fetchImpl ?? fetch;
  const token = await accessToken(account, fetchImpl);
  return { fetchImpl, token };
}

export async function downloadDriveFile(input: {
  fileId: string;
  serviceAccountJson?: string;
  fetchImpl?: DriveFetch;
}): Promise<Buffer> {
  const { fetchImpl, token } = await authorized(input);
  const response = await fetchImpl(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.fileId)}?alt=media&supportsAllDrives=true`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error(`Drive HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function trashDriveFile(input: {
  fileId: string;
  serviceAccountJson?: string;
  fetchImpl?: DriveFetch;
}): Promise<void> {
  const { fetchImpl, token } = await authorized(input);
  const response = await fetchImpl(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.fileId)}?supportsAllDrives=true`,
    {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    },
  );
  if (!response.ok) throw new Error(`Drive HTTP ${response.status}`);
}
