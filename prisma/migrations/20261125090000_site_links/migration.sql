-- batch-2 #13: multi-link sites (primary link stays in Site.url, backup links in SiteLink).
-- Additive only: existing rows keep working, nothing is rewritten.
ALTER TABLE "Site" ADD COLUMN "urlNote" TEXT NOT NULL DEFAULT '';

CREATE TABLE "SiteLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SiteLink_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SiteLink_siteId_sort_idx" ON "SiteLink"("siteId", "sort");
