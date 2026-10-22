import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { devLoginEnabled, getSessionUser, googleLoginEnabled } from "@/lib/auth";
import { signInDev, signInGoogle } from "@/server/session-actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/guias");
  const params = await searchParams;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const google = googleLoginEnabled();
  const dev = devLoginEnabled();

  return (
    <div className="grid min-h-full lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative hidden overflow-hidden bg-[#3f2a12] text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div>
          <img src="/brand-icon" alt="" className="h-12 w-auto rounded-md bg-white object-contain px-2" />
          <p className="mt-8 text-xs uppercase tracking-[0.28em] text-white/60">ACK TEAM LLC</p>
          <h1 className="mt-4 max-w-md font-display text-6xl leading-[0.95]">ACK Guías</h1>
        </div>
        <p className="max-w-sm text-sm leading-6 text-white/75">
          Issue a master or house air waybill from airline stock, print the document set, and send a QuickBooks draft invoice.
        </p>
      </section>
      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md space-y-8">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">ACK TEAM LLC</p>
            <h1 className="font-display text-4xl">Sign in</h1>
            <p className="mt-2 text-sm text-muted-foreground">Google accounts on ackfreight.com.</p>
          </div>
          {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">Sign-in did not complete.</p> : null}
          {google ? (
            <form action={signInGoogle}>
              <Button type="submit" className="w-full">
                Continue with Google
              </Button>
            </form>
          ) : (
            <p className="rounded-md border border-dashed border-input bg-card px-3 py-2 text-sm text-muted-foreground">
              Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
            </p>
          )}
          {dev ? (
            <form action={signInDev} className="space-y-3 rounded-lg border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Development sign-in</p>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required placeholder="name@ackfreight.com" />
              <Button type="submit" variant="outline" className="w-full">
                Sign in
              </Button>
            </form>
          ) : null}
        </div>
      </section>
    </div>
  );
}
