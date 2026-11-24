import { requireAdmin } from "@/lib/auth";
import { addByUrl } from "@/lib/bookmarks";
import { contentDTO, siteDTO } from "@/lib/data";
import { body, fail, json } from "@/lib/http";

/** add by URL: bare domain → 站点, URL with a path → 内容 (force with `as`) */
export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const b = await body<{ url?: string; as?: "site" | "content" }>(req);
  try {
    const r = await addByUrl(b.url ?? "", b.as === "site" || b.as === "content" ? b.as : undefined);
    return json(
      r.kind === "site"
        ? { kind: "site", site: siteDTO(r.site), usedAi: r.usedAi, fetched: r.fetched }
        : { kind: "content", content: contentDTO(r.content), usedAi: r.usedAi, fetched: r.fetched },
      201,
    );
  } catch (e) {
    return fail(e instanceof Error ? e.message : "添加失败");
  }
}
