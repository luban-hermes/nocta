import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

/** serves agent/nocta-agent.sh so servers can `curl … | bash` it */
export async function GET() {
  const file = path.join(process.cwd(), "agent", "nocta-agent.sh");
  try {
    const sh = await readFile(file, "utf8");
    return new Response(sh, { headers: { "content-type": "text/x-shellscript; charset=utf-8", "cache-control": "no-store" } });
  } catch {
    return new Response("# nocta-agent.sh not found in this build\nexit 1\n", { status: 404, headers: { "content-type": "text/plain" } });
  }
}
