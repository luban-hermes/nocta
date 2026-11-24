-- batch-1: cached icons, content pin/sort, lucide category icons

ALTER TABLE "Site" ADD COLUMN "iconFile" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Site" ADD COLUMN "iconCustom" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Site" ADD COLUMN "iconCheckedAt" DATETIME;

ALTER TABLE "Content" ADD COLUMN "iconFile" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Content" ADD COLUMN "iconCustom" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Content" ADD COLUMN "iconCheckedAt" DATETIME;
ALTER TABLE "Content" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Content" ADD COLUMN "sort" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "Content_sort_idx" ON "Content"("sort");

-- keep today's visual order: sites oldest first, contents newest first
UPDATE "Site" SET "sort" = (SELECT COUNT(*) FROM "Site" s2 WHERE s2."createdAt" < "Site"."createdAt" OR (s2."createdAt" = "Site"."createdAt" AND s2."id" < "Site"."id"));
UPDATE "Content" SET "sort" = (SELECT COUNT(*) FROM "Content" c2 WHERE c2."createdAt" > "Content"."createdAt" OR (c2."createdAt" = "Content"."createdAt" AND c2."id" < "Content"."id"));
UPDATE "Category" SET "sort" = (SELECT COUNT(*) FROM "Category" k2 WHERE k2."kind" = "Category"."kind" AND (k2."sort" < "Category"."sort" OR (k2."sort" = "Category"."sort" AND k2."createdAt" < "Category"."createdAt") OR (k2."sort" = "Category"."sort" AND k2."createdAt" = "Category"."createdAt" AND k2."id" < "Category"."id")));

-- category icons are lucide names now (text glyphs rendered as serif / tofu on some systems)
UPDATE "Category" SET "icon" = CASE "icon"
  WHEN '★' THEN 'star' WHEN '⌘' THEN 'code' WHEN '◐' THEN 'palette' WHEN '✦' THEN 'sparkles' WHEN '▶' THEN 'play'
  WHEN '¶' THEN 'file-text' WHEN '⌥' THEN 'git-branch' WHEN '❝' THEN 'message-square-quote' WHEN '◷' THEN 'clock'
  WHEN '' THEN 'folder' ELSE "icon" END;
