// Joins a request's documents (PDFs and photos) into one PDF so it can be
// printed in a single job. Pure (no Firebase) so it can be unit tested.
const { PDFDocument } = require("pdf-lib");

const PAGE_W = 612; // US Letter, in points
const PAGE_H = 792;
const MARGIN = 24;

function sniff(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf.slice(0, 4).toString("latin1") === "%PDF") return "pdf";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  return null;
}

/** buffers -> { bytes, pages, skipped }. Files that aren't PDF/PNG/JPG (or are damaged) are skipped. */
async function mergeToPdf(buffers) {
  const out = await PDFDocument.create();
  let skipped = 0;
  for (const buf of buffers) {
    const kind = sniff(buf);
    try {
      if (kind === "pdf") {
        const src = await PDFDocument.load(buf, { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
      } else if (kind === "png" || kind === "jpg") {
        const img = kind === "png" ? await out.embedPng(buf) : await out.embedJpg(buf);
        const scale = Math.min((PAGE_W - 2 * MARGIN) / img.width, (PAGE_H - 2 * MARGIN) / img.height);
        const width = img.width * scale;
        const height = img.height * scale;
        const page = out.addPage([PAGE_W, PAGE_H]);
        page.drawImage(img, { x: (PAGE_W - width) / 2, y: (PAGE_H - height) / 2, width, height });
      } else {
        skipped++;
      }
    } catch (err) {
      skipped++;
    }
  }
  return { bytes: await out.save(), pages: out.getPageCount(), skipped };
}

module.exports = { mergeToPdf, sniff };
