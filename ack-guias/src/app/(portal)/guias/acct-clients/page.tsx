import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { canViewFinance } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BASIS_OPTIONS } from "@/lib/guias/acct-clients";
import { usd } from "@/lib/guias/acct-format";
import { syncAcctClients } from "@/lib/guias/acct-link";
import { addAcctClient, addPerson, deleteAcctClient, deletePerson, saveAcctClient, saveTeam } from "@/server/acct-client-actions";

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

const SELECT = "block h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const num = (value: number | null) => (value == null ? "" : String(value));

/** How many empty rows are offered to add people to a split. */
const SPARE_ROWS = 2;

export default async function AcctClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canViewFinance(user)) redirect("/guias?error=The%20accounting%20is%20only%20for%20the%20accounting");
  const params = await searchParams;
  const notice = one(params, "notice");
  const error = one(params, "error");
  // Every client of the AWBs has its place here. Those that did not are added now, to be configured.
  let added = 0;
  try {
    added = await syncAcctClients();
  } catch (syncError) {
    console.error("sync accounting clients", syncError);
  }
  const [clients, people, stats, books] = await Promise.all([
    prisma.acctClient.findMany({ orderBy: { name: "asc" }, include: { splits: { orderBy: { pct: "desc" } } } }),
    prisma.acctPerson.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.acctShipment.groupBy({ by: ["client"], _count: true, _sum: { profit: true } }),
    prisma.guiaClient.findMany({ where: { agentKey: "ack" }, orderBy: { name: "asc" }, select: { id: true, name: true, agreedRates: { where: { agentKey: "ack" }, select: { ratePerKg: true } } } }),
  ]);
  const statsOf = (name: string) => stats.find((row) => row.client === name);
  const bookOf = new Map(books.map((book) => [book.id, book]));
  const linkedIds = new Set(clients.map((client) => client.guiaClientId).filter(Boolean));
  const freeBooks = books.filter((book) => !linkedIds.has(book.id));
  const toSetUp = clients.filter((client) => client.needsSetup);

  return (
    <div className="space-y-6">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">Clients &amp; team</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          One list for the clients of the AWBs and of the accounting: the rate agreed with each client, how it is charged, how its profit is shared and its invoice data. A new client appears here by itself, to be configured. A new shipment takes these rules when its AWB is issued. Shipments already made keep their own numbers and their own split.
        </p>
      </div>
      {notice ? <p className="rounded-md bg-secondary px-3 py-2 text-sm">{notice}</p> : null}
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}
      {added > 0 ? <p className="rounded-md bg-secondary px-3 py-2 text-sm">{added} clients of the AWBs were added here.</p> : null}
      {toSetUp.length > 0 ? (
        <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">
          {toSetUp.length === 1 ? "1 client has" : `${toSetUp.length} clients have`} to be configured: {toSetUp.map((client) => client.name).join(", ")}. Open each one, set the agreed rate, how it is charged, the split and the invoice data, and save. Until then its shipments use the usual rules and give the whole profit to the house.
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-display text-2xl">Clients</h2>
        {clients.map((client) => {
          const stat = statsOf(client.name);
          const rows = [...client.splits.map((split) => ({ payee: split.payee, pct: String(split.pct) })), ...Array.from({ length: SPARE_ROWS }, () => ({ payee: "", pct: "" }))];
          return (
            <details key={client.id} open={client.needsSetup || undefined} className={`rounded-lg border bg-card p-4 ${client.needsSetup ? "border-stuck" : "border-border"}`}>
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2">
                <span className="font-display text-xl">{client.name}</span>
                {client.needsSetup ? <span className="rounded-full bg-[#fff1e4] px-2 py-0.5 text-xs text-stuck">To configure</span> : null}
                {client.guiaClientId && bookOf.get(client.guiaClientId) && bookOf.get(client.guiaClientId)?.name.toUpperCase() !== client.name ? (
                  <span className="text-sm text-muted-foreground">AWBs: {bookOf.get(client.guiaClientId)?.name}</span>
                ) : null}
                <span className="text-sm text-muted-foreground">
                  {stat?._count ?? 0} AWBs · {usd(stat?._sum.profit ?? 0)} profit
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {client.splits.map((split) => (
                    <span key={split.id} className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                      {split.payee} {split.pct}%
                    </span>
                  ))}
                </span>
                <span className="ml-auto rounded-md border border-border px-3 py-1 text-sm">Settings</span>
              </summary>
              <form action={saveAcctClient} className="mt-4 space-y-4">
                <input type="hidden" name="id" value={client.id} />
                <fieldset className="space-y-3 rounded-md border border-border p-3">
                  <legend className="px-1 text-sm font-semibold">Client of the AWBs</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`book-${client.id}`}>Name on the AWBs</Label>
                      {client.guiaClientId && bookOf.get(client.guiaClientId) ? (
                        <p id={`book-${client.id}`} className="flex h-10 items-center text-sm font-medium">
                          {bookOf.get(client.guiaClientId)?.name}
                        </p>
                      ) : (
                        <select id={`book-${client.id}`} name="guiaClientId" defaultValue="" className={SELECT}>
                          <option value="">Not linked: choose the client of the AWBs</option>
                          {freeBooks.map((book) => (
                            <option key={book.id} value={book.id}>
                              {book.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`agreed-${client.id}`}>Agreed rate (USD per chargeable kg)</Label>
                      <Input
                        id={`agreed-${client.id}`}
                        name="agreedRate"
                        inputMode="decimal"
                        defaultValue={client.guiaClientId ? (bookOf.get(client.guiaClientId)?.agreedRates[0]?.ratePerKg ?? "") : ""}
                        placeholder={client.guiaClientId ? "No agreed rate" : "Link the client first"}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">The agreed rate is the one the AWB of this client is priced with. The name is the one typed on the AWBs.</p>
                </fieldset>
                <fieldset className="space-y-2 rounded-md border border-border p-3">
                  <legend className="px-1 text-sm font-semibold">Split of the profit for new shipments</legend>
                  {rows.map((row, index) => (
                    <div key={index} className="grid grid-cols-[1fr_7rem] gap-2">
                      <select name="payee" defaultValue={row.payee} aria-label="Person" className={SELECT}>
                        <option value="">—</option>
                        {people.map((person) => (
                          <option key={person.id} value={person.name}>
                            {person.name}
                            {person.houseShare ? " (house)" : ""}
                          </option>
                        ))}
                      </select>
                      <Input name="pct" inputMode="decimal" defaultValue={row.pct} aria-label="Percent" placeholder="%" />
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">The percents add up to 100. Leave a row empty to take the person out.</p>
                </fieldset>
                <fieldset className="space-y-3 rounded-md border border-border p-3">
                  <legend className="px-1 text-sm font-semibold">How it is charged</legend>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label htmlFor={`pickup-${client.id}`}>Pickup ($ per kg)</Label>
                      <Input id={`pickup-${client.id}`} name="pickupPerKg" inputMode="decimal" defaultValue={num(client.pickupPerKg)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`handling-${client.id}`}>Handling ($ per kg)</Label>
                      <Input id={`handling-${client.id}`} name="handlingPerKg" inputMode="decimal" defaultValue={num(client.handlingPerKg)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`transfer-${client.id}`}>Transfer ($ per kg)</Label>
                      <Input id={`transfer-${client.id}`} name="transferPerKg" inputMode="decimal" defaultValue={num(client.transferPerKg)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`basis-${client.id}`}>Those three are charged on</Label>
                      <select id={`basis-${client.id}`} name="chargeBasis" defaultValue={client.chargeBasis} className={SELECT}>
                        {BASIS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`awb-${client.id}`}>AWB fee ($)</Label>
                      <Input id={`awb-${client.id}`} name="awbFee" inputMode="decimal" defaultValue={num(client.awbFee)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`flat-${client.id}`}>Flat sell rate ($ per kg)</Label>
                      <Input id={`flat-${client.id}`} name="flatSellPerKg" inputMode="decimal" defaultValue={num(client.flatSellPerKg)} placeholder="Uses the rate table" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`kope-${client.id}`}>Kope handling (% of CHW)</Label>
                      <Input id={`kope-${client.id}`} name="kopeHandlingPct" inputMode="decimal" defaultValue={num(client.kopeHandlingPct)} />
                    </div>
                    <label className="flex items-end gap-2 pb-2 text-sm">
                      <input type="checkbox" name="kopeInCost" value="1" defaultChecked={client.kopeInCost} />
                      Count Kope handling as cost
                    </label>
                    <div className="space-y-1.5">
                      <Label htmlFor={`inscost-${client.id}`}>Insurance cost (% of value)</Label>
                      <Input id={`inscost-${client.id}`} name="insuranceCostPct" inputMode="decimal" defaultValue={num(client.insuranceCostPct)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`inssold-${client.id}`}>Insurance sold (% of value)</Label>
                      <Input id={`inssold-${client.id}`} name="insuranceSoldPct" inputMode="decimal" defaultValue={num(client.insuranceSoldPct)} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">A client with $0 in pickup, handling or transfer is not charged them, and the minimums of Costs do not apply to it.</p>
                </fieldset>
                <fieldset className="space-y-3 rounded-md border border-border p-3">
                  <legend className="px-1 text-sm font-semibold">Invoice</legend>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`billname-${client.id}`}>Billed to (name)</Label>
                      <Input id={`billname-${client.id}`} name="billToName" defaultValue={client.billToName ?? ""} placeholder={client.name} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`billaddr-${client.id}`}>Address</Label>
                      <Textarea id={`billaddr-${client.id}`} name="billToAddress" rows={2} defaultValue={client.billToAddress ?? ""} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`billmail-${client.id}`}>Send invoices to (emails, one per line)</Label>
                      <Textarea id={`billmail-${client.id}`} name="billingEmails" rows={2} defaultValue={client.billingEmails ?? ""} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Printed on the invoice and used to send it. A new invoice takes them when its AWB is issued.</p>
                </fieldset>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button type="submit" formAction={deleteAcctClient} formNoValidate className="text-xs text-stuck underline-offset-2 hover:underline">
                    Remove client
                  </button>
                  <Button type="submit">Save {client.name}</Button>
                </div>
              </form>
            </details>
          );
        })}
        <form action={addAcctClient} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
          <div className="space-y-1.5">
            <Label htmlFor="clientName">New client</Label>
            <Input id="clientName" name="name" required className="uppercase" />
          </div>
          <Button type="submit" variant="outline">
            Add client
          </Button>
        </form>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-2xl">Team</h2>
          <p className="mt-1 text-sm text-muted-foreground">The people who share in the profit. The house share, ACK, is not paid out. The name is the one the splits use.</p>
        </div>
        <form action={saveTeam} className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">House share (no payout)</th>
                  <th className="px-2 py-2">Email</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr key={person.id} className="border-b border-border last:border-0">
                    <td className="px-2 py-1.5 font-medium">
                      {person.name}
                      <input type="hidden" name="personId" value={person.id} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="checkbox" name={`house-${person.id}`} value="1" defaultChecked={person.houseShare} aria-label={`${person.name} house share`} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input name="email" type="email" defaultValue={person.email ?? ""} placeholder="name@company.com" aria-label={`${person.name} email`} className="h-9 w-64" />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button type="submit" formAction={deletePerson} name="id" value={person.id} formNoValidate className="text-xs text-stuck underline-offset-2 hover:underline">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button type="submit">Save team</Button>
        </form>
        <form action={addPerson} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
          <div className="space-y-1.5">
            <Label htmlFor="personName">New person</Label>
            <Input id="personName" name="name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="personEmail">Email</Label>
            <Input id="personEmail" name="email" type="email" className="w-64" />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" name="houseShare" value="1" />
            House share
          </label>
          <Button type="submit" variant="outline">
            Add person
          </Button>
        </form>
      </section>
    </div>
  );
}
