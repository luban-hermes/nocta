import { Readable } from "node:stream";
import { requireAdmin } from "@/lib/auth";
import { backupFileName, backupStream } from "@/lib/backup";

export const dynamic = "force-dynamic";

/** download a backup now (v0.4.1): same .json.gz as the S3 backups, streamed while it is being produced */
export async function GET() {
  const deny = await requireAdmin();
  if (deny) return deny;
  const body = Readable.toWeb(backupStream()) as unknown as ReadableStream<Uint8Array>;
  return new Response(body, {
    headers: {
      "content-type": "application/gzip",
      "content-disposition": `attachment; filename="${backupFileName()}"`,
      "cache-control": "no-store",
    },
  });
}
