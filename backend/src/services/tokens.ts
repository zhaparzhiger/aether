import jwt from "jsonwebtoken";
import { Response } from "express";
import { env } from "../config/env";

export interface TokenPayload {
  userId: string;
  email: string;
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: env.jwtAccessExpires as any });
}

export function signRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.jwtRefreshSecret, { expiresIn: env.jwtRefreshExpires as any });
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, env.jwtRefreshSecret) as TokenPayload;
}

const isProd = env.isProd;

// In production the frontend and backend live on different domains (e.g. Render),
// so auth cookies must be SameSite=None + Secure to be sent cross-site.
// Locally we keep Lax over http so the cookie still works without HTTPS.
const cookieSameSite: "none" | "lax" = isProd ? "none" : "lax";

export function setAuthCookies(res: Response, payload: TokenPayload) {
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  res.cookie("access_token", accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: cookieSameSite,
    maxAge: 15 * 60 * 1000,
  });
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: cookieSameSite,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/auth/refresh",
  });
}

export function clearAuthCookies(res: Response) {
  const opts = { httpOnly: true, secure: isProd, sameSite: cookieSameSite } as const;
  res.clearCookie("access_token", opts);
  res.clearCookie("refresh_token", { ...opts, path: "/auth/refresh" });
}
