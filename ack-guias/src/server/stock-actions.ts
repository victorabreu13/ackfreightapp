"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import ExcelJS from "exceljs";
import { expandCount, parseAwb, parseStockText, type StockDraft } from "@/lib/awb/number";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const ACK = "ack";

function awbPrefix(value: string): string {
  return parseAwb(value)?.prefix ?? value.replace(/\D/g, "").slice(0, 3);
}

export async function uploadAwbStock(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20change%20stock");
  const agent = await prisma.issuingAgent.findUnique({ where: { key: ACK } });
  if (!agent) redirect("/awb/stock?error=ACK%20TEAM%20LLC%20is%20not%20set%20up");
  const fallbackPrefix = String(formData.get("prefix") ?? "").replace(/\D/g, "");
  const collected: StockDraft[] = [];
  const rejected: string[] = [];
  const pasted = String(formData.get("pasted") ?? "");
  if (pasted.trim()) {
    const parsed = parseStockText(pasted, fallbackPrefix);
    collected.push(...parsed.ok);
    rejected.push(...parsed.rejected);
  }
  const start = String(formData.get("start") ?? "").trim();
  const count = Number(formData.get("count") ?? "");
  if (start && count) {
    if (start.includes("-") && parseAwb(start)) {
      const fromAwb = expandCount(parseAwb(start)?.prefix ?? fallbackPrefix, parseAwb(start)?.serial ?? "", count);
      collected.push(...fromAwb.ok);
      rejected.push(...fromAwb.rejected);
    } else {
      const parsed = expandCount(fallbackPrefix || awbPrefix(start), start, count);
      collected.push(...parsed.ok);
      rejected.push(...parsed.rejected);
    }
  }
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const name = file.name.toLowerCase();
    let sheetText = "";
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as Parameters<ExcelJS.Xlsx["load"]>[0]);
      const sheet = workbook.worksheets[0];
      const rows: string[] = [];
      sheet?.eachRow((row) => {
        const values = (row.values as unknown[]).slice(1).map((value) => String(value ?? "").trim());
        rows.push(values.join(","));
      });
      sheetText = rows.join("\n");
    } else {
      sheetText = buffer.toString("utf8");
    }
    const parsed = parseStockText(sheetText, fallbackPrefix);
    collected.push(...parsed.ok);
    rejected.push(...parsed.rejected);
  }
  const unique = new Map(collected.map((row) => [row.awb, row]));
  let added = 0;
  let duplicates = 0;
  for (const row of unique.values()) {
    try {
      await prisma.awbStockNumber.create({
        data: { prefix: row.prefix, serial: row.serial, awb: row.awb, agentKey: ACK, status: "available" },
      });
      added += 1;
    } catch {
      duplicates += 1;
    }
  }
  revalidatePath("/awb/stock");
  const rejectNote = rejected.slice(0, 8).join(" | ");
  redirect(`/awb/stock?added=${added}&duplicates=${duplicates}&rejected=${rejected.length}&note=${encodeURIComponent(rejectNote)}`);
}
