import { requireAdmin } from "@/lib/auth";
import { siteDTO } from "@/lib/data";
import { body, fail, json } from "@/lib/http";
import { addLink } from "@/lib/sitelinks";

type Ctx = { params: Promise<{ id: string }> };

/** append a backup link: { url, note? } */
export async function POST(req: Request, { params }: Ctx) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { id } = await params;
  const b = await body<{ url?: string; note?: string }>(req);
  try {
    const s = await addLink(id, b.url ?? "", b.note ?? "");
    return json(siteDTO(s!), 201);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "添加失败");
  }
}
