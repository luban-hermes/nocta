import { requireAdmin } from "@/lib/auth";
import { createContentFromUrl } from "@/lib/bookmarks";
import { contentDTO } from "@/lib/data";
import { body, fail, json } from "@/lib/http";
import { normalizeUrl } from "@/lib/utils";

export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const b = await body<{ url?: string; categoryId?: string }>(req);
  const u = normalizeUrl(b.url ?? "");
  if (!u) return fail("请输入有效的网址");
  const { content } = await createContentFromUrl(u, { categoryId: b.categoryId });
  return json(contentDTO(content), 201);
}
