import { Request, Response, NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../config/db";
import { organizationMembers } from "../db/schema";

export type Role = "owner" | "admin" | "manager" | "member";

const ROLE_RANK: Record<Role, number> = {
  member: 0,
  manager: 1,
  admin: 2,
  owner: 3,
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      membership?: { organizationId: string; role: Role };
    }
  }
}

export async function getOrgRole(orgId: string, userId: string): Promise<Role | null> {
  const [membership] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, orgId),
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.status, "active")
      )
    )
    .limit(1);
  return membership?.role ?? null;
}

export function requireOrgRole(...allowed: Role[]) {
  const minRank = Math.min(...allowed.map((r) => ROLE_RANK[r]));

  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: "Not authenticated" });

    const orgId = req.params.orgId;
    if (!orgId) return res.status(400).json({ error: "Missing organization id" });

    const [membership] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.userId, req.auth.userId),
          eq(organizationMembers.status, "active")
        )
      )
      .limit(1);

    if (!membership) {
      return res.status(403).json({ error: "Not a member of this organization" });
    }

    if (ROLE_RANK[membership.role] < minRank) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    req.membership = { organizationId: orgId, role: membership.role };
    next();
  };
}
