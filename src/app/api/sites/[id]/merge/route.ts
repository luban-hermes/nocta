import { requireAdmin } from "@/lib/auth";
import { siteDTO } from "@/lib/data";
import { body, fail, json } from "@/lib/http";
import { mergeInto } from "@/lib/sitelinks";

type Ctx = { params: Promise<{ id: string }> };

/** make this site's links backup links of { into } and delete this site */
export async function POST(req: Request, { params }: Ctx) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { id } = await params;
  const b = await body<{ into?: string }>(req);
  if (!b.into) return fail("缺少目标站点");
  try {
    const s = await mergeInto(id, b.into);
    return json(siteDTO(s!));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "合并失败");
  }
}
