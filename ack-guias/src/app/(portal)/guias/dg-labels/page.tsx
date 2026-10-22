import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { parseUnNumbers } from "@/lib/guias/dg";
import { planDgLabels, type LabelChoice } from "@/lib/guias/dg/un";

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function choice(value: string | undefined): LabelChoice {
  return value === "yes" || value === "no" ? value : "auto";
}

const SELECT = "block h-10 rounded-md border border-input bg-background px-3 text-sm";

export default async function DgLabelsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20open%20the%20DG%20labels");
  const params = await searchParams;
  const unText = one(params, "un") ?? "";
  const copies = Math.max(1, Math.min(50, Number(one(params, "copies")) || 1));
  const cao = choice(one(params, "cao"));
  const arrows = choice(one(params, "arrows"));
  const marks = one(params, "marks") === "1";
  const guia = one(params, "guia") ?? "";
  const numbers = parseUnNumbers(unText);
  const plan = numbers.length ? planDgLabels({ un: numbers.join(" "), copies, cargoAircraftOnly: cao, arrows, marks }) : null;
  const query = new URLSearchParams({ un: numbers.join(" "), copies: String(copies), cao, arrows });
  if (marks) query.set("marks", "1");
  if (guia) query.set("guia", guia);

  return (
    <div className="space-y-6">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">Labels DG</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Escribe los números UN y la cantidad de bultos. La tabla dice qué etiquetas de peligro lleva cada UN, si necesita la etiqueta Cargo Aircraft Only, y se genera la hoja lista para imprimir.
        </p>
      </div>

      <form action="/guias/dg-labels" className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-2 lg:grid-cols-4">
        {guia ? <input type="hidden" name="guia" value={guia} /> : null}
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-muted-foreground">UN (varios separados por coma)</span>
          <Input name="un" required defaultValue={numbers.map((number) => `UN${number}`).join(", ")} placeholder="UN3481, UN1950" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Bultos (copias de cada juego)</span>
          <Input name="copies" type="number" min={1} max={50} defaultValue={copies} />
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
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" name="marks" value="1" defaultChecked={marks} />
          Incluir la marca del bulto (UN y nombre)
        </label>
        <div className="flex items-end">
          <Button type="submit">Ver etiquetas requeridas</Button>
        </div>
      </form>

      {plan ? (
        <section className="space-y-4">
          {plan.warnings.length ? (
            <ul className="space-y-1 rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">
              {plan.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">UN</th>
                  <th className="px-3 py-2">Proper shipping name</th>
                  <th className="px-3 py-2">Clase</th>
                  <th className="px-3 py-2">PG</th>
                  <th className="px-3 py-2">Etiquetas de peligro</th>
                  <th className="px-3 py-2">Pasajeros</th>
                  <th className="px-3 py-2">Solo carga</th>
                  <th className="px-3 py-2">CAO</th>
                </tr>
              </thead>
              <tbody>
                {plan.units.map((unit) => (
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
                    <td className="px-3 py-2">{unit.pg || "—"}</td>
                    <td className="px-3 py-2">{unit.labels.length ? unit.labels.join(" + ") : "Ninguna"}</td>
                    <td className="px-3 py-2">{unit.pax || "—"}</td>
                    <td className="px-3 py-2">{unit.cargo || "—"}</td>
                    <td className="px-3 py-2">{unit.found ? (unit.cargoOnly ? "Sí" : "No") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild>
              <a href={`/api/guias/dg-labels?${query.toString()}`} target="_blank" rel="noreferrer">
                Generar etiquetas (PDF, {plan.items.length} {plan.items.length === 1 ? "etiqueta" : "etiquetas"})
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={`/api/guias/dg-labels?${query.toString()}&download=1`}>Descargar</a>
            </Button>
          </div>
        </section>
      ) : null}

      <section className="max-w-3xl space-y-2 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <h2 className="font-display text-2xl text-foreground">Antes de usar las etiquetas</h2>
        <p>
          Los datos salen de la tabla de materiales peligrosos de 49 CFR 172.101 (documento público de EE. UU.), más algunas reglas aéreas conocidas como el hielo seco, el material magnetizado y las baterías de litio. No son el texto del IATA DGR, que es de pago.
        </p>
        <p>
          Los tamaños siguen las reglas generales de ICAO e IATA: rombo de 100 mm por lado con la línea a 5 mm del borde, y etiqueta Cargo Aircraft Only de 120 x 110 mm. Los símbolos son dibujos vectoriales sencillos. Confirma cada etiqueta con el DGR vigente antes de embarcar. El embarcador sigue siendo responsable de la clasificación, el marcado y el etiquetado.
        </p>
        <p>Las etiquetas de la Clase 7 (radiactivos) llevan categoría, contenido, actividad e índice de transporte, por eso no se generan aquí. Las baterías de litio de la Sección II usan la marca de baterías de litio, que tampoco se genera aquí.</p>
      </section>
    </div>
  );
}
