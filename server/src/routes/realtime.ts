import { Router } from "express";
import crypto from "crypto";

import {
  addRealtimeClient,
  removeRealtimeClient,
} from "../realtime.js";

import { authenticateSession } from "../auth.js";

const router = Router();

router.get("/orders", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    const token = authHeader.slice("Bearer ".length).trim();

    const user = await authenticateSession(token);

    res.status(200);

    res.setHeader(
      "Content-Type",
      "text/event-stream",
    );

    res.setHeader(
      "Cache-Control",
      "no-cache, no-transform",
    );

    res.setHeader(
      "Connection",
      "keep-alive",
    );

    res.setHeader(
      "X-Accel-Buffering",
      "no",
    );

    res.flushHeaders?.();

    const clientId = crypto.randomUUID();

    addRealtimeClient(clientId, res);

    const heartbeat = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
      } catch {
        clearInterval(heartbeat);
        removeRealtimeClient(clientId);
      }
    }, 15_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      removeRealtimeClient(clientId);
    });

    return;
  } catch (error) {
    console.error("Realtime authentication error:", error);

    if (!res.headersSent) {
      return res.status(401).json({
        error: "Invalid or expired session",
      });
    }

    res.end();
  }
});

export default router;