import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { __noctaPrisma?: PrismaClient };

export const prisma = g.__noctaPrisma ?? new PrismaClient({ log: ["error"] });
if (process.env.NODE_ENV !== "production") g.__noctaPrisma = prisma;
