import { requireAdmin } from "@/lib/auth";
import { testS3 } from "@/lib/backup";
import { body, fail, json } from "@/lib/http";
import { getSettings } from "@/lib/settings";

/** test the S3 connection — with the values in the form (unsaved) or the saved ones; a blank secret means "the saved one" */
export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const s = await getSettings();
  const b = await body<Record<string, unknown>>(req);
  const str = (k: string, d: string) => (typeof b[k] === "string" ? (b[k] as string).trim() : d);
  const conf = {
    s3Endpoint: str("s3Endpoint", s.s3Endpoint),
    s3Region: str("s3Region", s.s3Region),
    s3Bucket: str("s3Bucket", s.s3Bucket),
    s3AccessKey: str("s3AccessKey", s.s3AccessKey),
    s3SecretKey: str("s3SecretKey", "") || s.s3SecretKey,
    s3Prefix: str("s3Prefix", s.s3Prefix),
    s3PathStyle: typeof b.s3PathStyle === "boolean" ? b.s3PathStyle : s.s3PathStyle,
  };
  if (conf.s3Endpoint && !/^https?:\/\//i.test(conf.s3Endpoint)) return fail("Endpoint 需以 http(s):// 开头");
  try {
    return json({ ok: true, ...(await testS3(conf)) });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "连接失败", 502);
  }
}
