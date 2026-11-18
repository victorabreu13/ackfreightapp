import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { canReadGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { guiaTemplates } from "@/lib/guias/templates";

export default async function GuiaTemplatesPage() {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canReadGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20open%20templates");
  const templates = guiaTemplates();

  return (
    <div className="space-y-6">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">Templates</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every document Guías can generate. Previews use made-up sample data and are not saved or uploaded to Drive.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Template</th>
              <th className="px-3 py-2">What it is</th>
              <th className="px-3 py-2">Format</th>
              <th className="px-3 py-2">Needs</th>
              <th className="px-3 py-2">File name</th>
              <th className="px-3 py-2">Preview</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.kind} className="border-b border-border align-top last:border-0">
                <td className="px-3 py-2 font-medium">{template.name}</td>
                <td className="px-3 py-2">{template.purpose}</td>
                <td className="px-3 py-2">{template.format}</td>
                <td className="px-3 py-2">{template.needs}</td>
                <td className="px-3 py-2 font-mono text-xs">{template.fileName}</td>
                <td className="px-3 py-2">
                  <a className="underline-offset-2 hover:underline" href={`/api/guias/templates/${template.kind}`} target="_blank" rel="noreferrer">
                    Open
                  </a>
                  <span className="text-muted-foreground"> · </span>
                  <a className="underline-offset-2 hover:underline" href={`/api/guias/templates/${template.kind}?download=1`}>
                    Download
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
