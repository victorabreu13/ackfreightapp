import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canManageGuias, guiaWhere } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseUnNumbers } from "@/lib/guias/dg";
import { dgParty } from "@/lib/guias/dg/party-text";
import { planDgLabels, type LabelChoice } from "@/lib/guias/dg/un";
import { hazardLabelName } from "@/lib/guias/dg/labels-pdf";

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function choice(value: string | undefined): LabelChoice {
  return value === "yes" || value === "no" ? value : "auto";
}

const SELECT = "block h-10 rounded-md border border-input bg-background px-3 text-sm";
const AREA = "block w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export default async function DgLabelsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20open%20the%20DG%20labels");
  const params = await searchParams;
  const numbers = parseUnNumbers(one(params, "un"));
  const copies = Math.max(1, Math.min(50, Number(one(params, "copies")) || 1));
  const cao = choice(one(params, "cao"));
  const arrows = choice(one(params, "arrows"));
  const marks = one(params, "marks") === "1";
  const guiaId = (one(params, "guia") ?? "").trim();

  // The parties come from the guía when the page is opened from one, and can be changed here.
  const guia = guiaId
    ? await prisma.airWaybillDocument.findFirst({
        where: { id: guiaId, ...guiaWhere(user) },
        select: { awb: true, shipperName: true, shipperAddress: true, consigneeName: true, consigneeAddress: true },
      })
    : null;
  const shipper = dgParty(one(params, "shipperName") ?? guia?.shipperName, one(params, "shipperAddress") ?? guia?.shipperAddress);
  const consignee = dgParty(one(params, "consigneeName") ?? guia?.consigneeName, one(params, "consigneeAddress") ?? guia?.consigneeAddress);

  const plan = numbers.length ? planDgLabels({ un: numbers.join(" "), copies, cargoAircraftOnly: cao, arrows, marks }) : null;
  const checklist = new URLSearchParams({ kind: "checklist", un: numbers.join(" "), copies: String(copies), cao, arrows });
  if (marks) checklist.set("marks", "1");
  if (guiaId) checklist.set("guia", guiaId);
  const parties = new URLSearchParams({
    kind: "parties",
    shipperName: shipper.name,
    shipperAddress: shipper.address,
    consigneeName: consignee.name,
    consigneeAddress: consignee.address,
  });

  return (
    <div className="space-y-6">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">Labels DG</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Dos documentos: el label del Shipper y el Consignee como van en el DGD (con la dirección completa y nada más), y el checklist de los labels que lleva cada UN, con su dibujo, su nombre y una casilla para marcar.
        </p>
      </div>

      <form action="/guias/dg-labels" className="space-y-4 rounded-lg border border-border bg-card p-4">
        {guiaId ? <input type="hidden" name="guia" value={guiaId} /> : null}
        {guia ? <p className="text-sm text-muted-foreground">Guía {guia.awb || "en borrador"}: el Shipper y el Consignee vienen de la guía y se pueden cambiar aquí.</p> : null}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="text-muted-foreground">UN (varios separados por coma)</span>
            <Input name="un" defaultValue={numbers.map((number) => `UN${number}`).join(", ")} placeholder="UN3481, UN1950" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Bultos</span>
            <Input name="copies" type="number" min={1} max={50} defaultValue={copies} />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" name="marks" value="1" defaultChecked={marks} />
            Incluir la marca del bulto en el checklist
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Cargo Aircraft Only</span>
            <select name="cao" defaultValue={cao} className={SELECT}>
              <option value="auto">Automático (según la tabla)</option>
              <option value="yes">Siempre</option>
              <option value="no">Nunca</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Flechas de orientación</span>
            <select name="arrows" defaultValue={arrows} className={SELECT}>
              <option value="auto">Automático (si lleva líquidos)</option>
              <option value="yes">Siempre</option>
              <option value="no">Nunca</option>
            </select>
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <h2 className="font-display text-2xl">Shipper</h2>
            <Input name="shipperName" defaultValue={shipper.name} placeholder="Nombre" />
            <textarea name="shipperAddress" rows={4} defaultValue={shipper.address} placeholder="Dirección completa" className={AREA} />
          </div>
          <div className="space-y-2">
            <h2 className="font-display text-2xl">Consignee</h2>
            <Input name="consigneeName" defaultValue={consignee.name} placeholder="Nombre" />
            <textarea name="consigneeAddress" rows={4} defaultValue={consignee.address} placeholder="Dirección completa" className={AREA} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          En el DGD solo van el nombre y la dirección completa. Los teléfonos, correos y contactos que estén en la dirección de la guía no se incluyen.
        </p>
        <Button type="submit">Actualizar</Button>
      </form>

      {plan ? (
        <section className="space-y-3">
          {plan.warnings.length ? (
            <ul className="space-y-1 rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">
              {plan.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">UN</th>
                  <th className="px-3 py-2">Proper shipping name</th>
                  <th className="px-3 py-2">Clase</th>
                  <th className="px-3 py-2">Labels requeridos</th>
                </tr>
              </thead>
              <tbody>
                {plan.units.map((unit) => {
                  const items = plan.items.filter((item) => item.un === unit.un && item.copy === 1);
                  return (
                    <tr key={unit.un} className="border-b border-border align-top last:border-0">
                      <td className="px-3 py-2 font-medium">UN{unit.un}</td>
                      <td className="px-3 py-2">
                        {unit.found ? unit.name : "No está en la tabla"}
                        {unit.notes.map((note) => (
                          <span key={note} className="mt-1 block text-xs text-muted-foreground">
                            {note}
                          </span>
                        ))}
                      </td>
                      <td className="px-3 py-2">{unit.cls || "—"}</td>
                      <td className="px-3 py-2">
                        {items.length
                          ? items
                              .map((item) =>
                                item.kind === "hazard" ? hazardLabelName(item.code) : item.kind === "cao" ? "Cargo Aircraft Only" : item.kind === "arrows" ? "Orientation arrows" : `Package marking UN${item.un}`,
                              )
                              .join(" · ")
                          : "Ninguno"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button asChild>
          <a href={`/api/guias/dg-labels?${parties.toString()}`} target="_blank" rel="noreferrer">
            Label de Shipper y Consignee (PDF)
          </a>
        </Button>
        {plan ? (
          <Button asChild>
            <a href={`/api/guias/dg-labels?${checklist.toString()}`} target="_blank" rel="noreferrer">
              Checklist de labels (PDF)
            </a>
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground">Escribe un UN y pulsa Actualizar para generar el checklist.</span>
        )}
      </div>

      <section className="max-w-3xl space-y-2 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <h2 className="font-display text-2xl text-foreground">Antes de usar el checklist</h2>
        <p>
          Los datos salen de la tabla de materiales peligrosos de 49 CFR 172.101 (documento público de EE. UU.), más algunas reglas aéreas conocidas como el hielo seco, el material magnetizado y las baterías de litio. No son el texto del IATA DGR, que es de pago. Confirma cada etiqueta con el DGR vigente antes de embarcar. El embarcador sigue siendo responsable de la clasificación, el marcado y el etiquetado.
        </p>
        <p>Las etiquetas de la Clase 7 (radiactivos) llevan categoría, contenido, actividad e índice de transporte, por eso aparecen sin dibujo. Las baterías de litio de la Sección II usan la marca de baterías de litio en lugar de la etiqueta.</p>
      </section>
    </div>
  );
}
