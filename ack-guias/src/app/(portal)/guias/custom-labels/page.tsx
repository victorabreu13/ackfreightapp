import PDFDocument from "pdfkit";
import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { Button } from "@/components/ui/button";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { MAX_COPIES, MAX_SIZE, MIN_SIZE, customLabelQuery, layoutCustomLabel, parseCustomLabel } from "@/lib/guias/custom-label";

const SELECT = "block h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const FIELD = "block h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

export default async function CustomLabelsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20open%20the%20custom%20labels");
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first != null) params.set(key, first);
  }
  const spec = parseCustomLabel(params);
  const hasText = spec.text.trim().length > 0;
  const query = customLabelQuery(spec);
  // The same layout as the PDF, so the page can say when the size asked for did not fit.
  const layout = hasText ? layoutCustomLabel(new PDFDocument({ size: "LETTER", margin: 0 }), spec) : null;
  const landscape = spec.orientation === "landscape";

  return (
    <div className="space-y-6">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">Custom Labels</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          A 4 x 6 inch label for the thermal printer, with the text you write. Pick portrait or landscape, the font and the size.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <form action="/guias/custom-labels" className="space-y-4 rounded-lg border border-border bg-card p-4">
          <input type="hidden" name="form" value="1" />
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Text (one line per row)</span>
            <textarea
              name="text"
              rows={6}
              defaultValue={spec.text}
              placeholder={"ACK FREIGHT\nMIA-GUA"}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Orientation</span>
              <select name="orientation" defaultValue={spec.orientation} className={SELECT}>
                <option value="landscape">Landscape (6 x 4)</option>
                <option value="portrait">Portrait (4 x 6)</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Copies</span>
              <input name="copies" type="number" min={1} max={MAX_COPIES} defaultValue={spec.copies} className={FIELD} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Font</span>
              <select name="family" defaultValue={spec.family} className={SELECT}>
                <option value="Helvetica">Helvetica (sans)</option>
                <option value="Times">Times (serif)</option>
                <option value="Courier">Courier (monoespaciada)</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Size (pt, 0 = automatic)</span>
              <input name="size" type="number" min={0} max={MAX_SIZE} step={1} defaultValue={spec.size} className={FIELD} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Alignment</span>
              <select name="align" defaultValue={spec.align} className={SELECT}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Vertical position</span>
              <select name="valign" defaultValue={spec.valign} className={SELECT}>
                <option value="top">Top</option>
                <option value="middle">Centered</option>
                <option value="bottom">Bottom</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Line spacing (1 to 2)</span>
              <input name="spacing" type="number" min={1} max={2} step={0.05} defaultValue={spec.spacing} className={FIELD} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Border</span>
              <select name="border" defaultValue={spec.border} className={SELECT}>
                <option value="none">No border</option>
                <option value="thin">Fino</option>
                <option value="thick">Grueso</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="bold" value="1" defaultChecked={spec.bold} />
              <span className="font-bold">Bold</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="italic" value="1" defaultChecked={spec.italic} />
              <span className="italic">Cursiva</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="underline" value="1" defaultChecked={spec.underline} />
              <span className="underline">Subrayado</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="uppercase" value="1" defaultChecked={spec.uppercase} />
              <span>UPPERCASE</span>
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            With automatic size the font fills the label. With a fixed size ({MIN_SIZE} to {MAX_SIZE} pt), if the text does not fit it is reduced until it does.
          </p>
          <Button type="submit">Preview label</Button>
        </form>

        <section className="space-y-3">
          {hasText && layout ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild>
                  <a href={`/api/guias/custom-labels?${query}`} target="_blank" rel="noreferrer">
                    Open PDF to print
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={`/api/guias/custom-labels?${query}&download=1`}>Download</a>
                </Button>
                <span className="text-sm text-muted-foreground">
                  Font {layout.size} pt{spec.size === 0 ? " (automatic)" : ""} · {spec.copies} {spec.copies === 1 ? "copy" : "copies"} · 4 x 6 {landscape ? "landscape" : "portrait"}
                </span>
              </div>
              {layout.reduced ? (
                <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">The text did not fit at {spec.size} pt and was reduced to {layout.size} pt.</p>
              ) : null}
              <iframe
                title="Label preview"
                src={`/api/guias/custom-labels?${query}#toolbar=0&navpanes=0&view=Fit`}
                className="w-full rounded-md border border-border bg-white"
                style={{ aspectRatio: landscape ? "6 / 4" : "4 / 6", maxHeight: "70vh" }}
              />
            </>
          ) : (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Type the text and press Preview label to see how it looks.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
