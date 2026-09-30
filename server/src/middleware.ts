import type { NextFunction, Request, Response } from "express";
import {
  authenticateSession,
  AuthError,
  type AuthenticatedUser,
} from "./auth.js";

export type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser & {
    sessionId: string;
  };
};

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const authorization = req.headers.authorization;

    const token =
      authorization?.startsWith("Bearer ")
        ? authorization.slice(7)
        : "";

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    req.user = await authenticateSession(token);

    next();
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
    }

    console.error("Authentication middleware error:", error);

    return res.status(500).json({
      success: false,
      error: "Authentication failed",
    });
  }
}

export function requirePermission(
  permission: string,
) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    if (!req.user.permissions.includes(permission)) {
      return res.status(403).json({
        success: false,
        error: "Permission denied",
      });
    }

    next();
  };
}