import { readFileSync } from "node:fs";
import { join } from "node:path";

const ACK_LOGO = readFileSync(join(process.cwd(), "src/lib/guias/assets/ack-logo.png"));

export function GET() {
  return new Response(new Uint8Array(ACK_LOGO), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
  });
}
