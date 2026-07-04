import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import { db } from "../config/db";
import { users, organizationMembers, organizations } from "../db/schema";
import { setAuthCookies, clearAuthCookies, verifyRefreshToken, signAccessToken } from "../services/tokens";
import { requireAuth } from "../middleware/auth";
import { env } from "../config/env";

const router = Router();
const googleClient = new OAuth2Client(env.googleOAuthClientId);

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

router.post("/register", async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const existing = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const [user] = await db
      .insert(users)
      .values({ email: body.email, passwordHash, name: body.name })
      .returning();

    setAuthCookies(res, { userId: user.id, email: user.email });
    res.status(201).json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    next(err);
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    setAuthCookies(res, { userId: user.id, email: user.email });
    res.json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    next(err);
  }
});

router.post("/google", async (req, res, next) => {
  try {
    const { idToken } = z.object({ idToken: z.string() }).parse(req.body);
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: env.googleOAuthClientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      return res.status(401).json({ error: "Invalid Google token" });
    }

    let [user] = await db.select().from(users).where(eq(users.googleId, payload.sub)).limit(1);

    if (!user) {
      const [byEmail] = await db.select().from(users).where(eq(users.email, payload.email)).limit(1);
      if (byEmail) {
        [user] = await db
          .update(users)
          .set({ googleId: payload.sub, avatarUrl: payload.picture ?? byEmail.avatarUrl })
          .where(eq(users.id, byEmail.id))
          .returning();
      } else {
        [user] = await db
          .insert(users)
          .values({
            email: payload.email,
            name: payload.name ?? payload.email,
            googleId: payload.sub,
            avatarUrl: payload.picture,
          })
          .returning();
      }
    }

    setAuthCookies(res, { userId: user.id, email: user.email });
    res.json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    next(err);
  }
});

router.post("/refresh", async (req, res, next) => {
  try {
    const token = req.cookies?.refresh_token;
    if (!token) return res.status(401).json({ error: "No refresh token" });
    const payload = verifyRefreshToken(token);
    const accessToken = signAccessToken({ userId: payload.userId, email: payload.email });
    res.cookie("access_token", accessToken, {
      httpOnly: true,
      secure: env.nodeEnv === "production",
      sameSite: "lax",
      maxAge: 15 * 60 * 1000,
    });
    res.json({ ok: true });
  } catch (err) {
    return res.status(401).json({ error: "Invalid refresh token" });
  }
});

router.post("/logout", (_req, res) => {
  clearAuthCookies(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.auth!.userId)).limit(1);
    if (!user) return res.status(404).json({ error: "User not found" });

    const memberships = await db
      .select({
        organizationId: organizations.id,
        organizationName: organizations.name,
        organizationSlug: organizations.slug,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(and(eq(organizationMembers.userId, user.id), eq(organizationMembers.status, "active")));

    res.json({
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
      organizations: memberships,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
