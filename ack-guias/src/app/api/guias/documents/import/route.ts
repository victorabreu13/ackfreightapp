import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { importGuiaPdf, parseImport } from "@/lib/guias/document-log";

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Admins only." }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Upload a PDF." }, { status: 400 });
  const parsed = parseImport({
    client: text(form.get("client")),
    awb: text(form.get("awb")),
    kind: text(form.get("kind")),
    company: text(form.get("company")),
    fileName: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const saved = await importGuiaPdf({ ...parsed.value, generatedBy: user.email });
  return NextResponse.json({
    id: saved.id,
    guiaId: saved.guiaId,
    status: saved.status,
    driveUrl: saved.driveUrl,
    error: saved.error,
    fileName: parsed.value.fileName,
  });
}
