import "dotenv/config";
import express from "express";
import cors from "cors";
import { pool } from "./db.js";
import {
  loginWithPin,
  logout,
  AuthError,
} from "./auth.js";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "./middleware.js";

import categoriesRouter from "./routes/categories.js";
import itemsRouter from "./routes/items.js";
import addonsRouter from "./routes/addons.js";
import itemAddonsRouter from "./routes/item-addons.js";
import ordersRouter from "./routes/orders.js";
import orderEditRouter from "./routes/order-edit.js";
import salesRouter from "./routes/sales.js";
import dayClosingRouter from "./routes/day-closing.js";
import activityLogsRouter from "./routes/activity-logs.js";
import realtimeRouter from "./routes/realtime.js";
import usersRouter from "./routes/users.js";

const app = express();

const PORT = Number(
  process.env.PORT ?? 4000,
);

/*
 * In production the ALLOWED_ORIGIN environment
 * variable should be set to the Vercel frontend
 * URL (e.g. https://your-app.vercel.app).
 *
 * In development all origins are allowed so that
 * localhost:3000 can reach localhost:4000.
 */
const allowedOrigin =
  process.env.ALLOWED_ORIGIN;

app.use(
  cors({
    origin:
      process.env.NODE_ENV ===
      "production"
        ? allowedOrigin ?? true
        : true,
    credentials: true,
  }),
);

app.use(
  express.json({
    limit: "2mb",
  }),
);

app.get(
  "/health",
  (_req, res) => {
    res.json({
      success: true,
      service:
        "food-stall-pos-api",
      status: "healthy",
    });
  },
);

app.get(
  "/health/db",
  async (_req, res) => {
    try {
      const result =
        await pool.query(
          "select now() as server_time",
        );

      res.json({
        success: true,
        database: "connected",
        serverTime:
          result.rows[0]
            .server_time,
      });
    } catch (error) {
      console.error(
        "Database health check failed:",
        error,
      );

      res.status(500).json({
        success: false,
        database:
          "disconnected",
      });
    }
  },
);

app.post(
  "/api/auth/login",
  async (req, res) => {
    try {
      const { pin } =
        req.body;

      if (
        typeof pin !==
        "string"
      ) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "PIN is required",
          });
      }

      const result =
        await loginWithPin(
          pin,
        );

      return res.json({
        success: true,
        token:
          result.token,
        expiresAt:
          result.expiresAt,
        user:
          result.user,
      });
    } catch (error) {
      if (
        error instanceof
        AuthError
      ) {
        return res
          .status(
            error.statusCode,
          )
          .json({
            success: false,
            error:
              error.message,
          });
      }

      console.error(
        "Login error:",
        error,
      );

      return res
        .status(500)
        .json({
          success: false,
          error:
            "Authentication failed",
        });
    }
  },
);

app.post(
  "/api/auth/logout",
  async (req, res) => {
    try {
      const authorization =
        req.headers
          .authorization;

      const token =
        authorization?.startsWith(
          "Bearer ",
        )
          ? authorization.slice(
              7,
            )
          : "";

      if (!token) {
        return res
          .status(401)
          .json({
            success: false,
            error:
              "Authentication required",
          });
      }

      await logout(token);

      return res.json({
        success: true,
      });
    } catch (error) {
      console.error(
        "Logout error:",
        error,
      );

      return res
        .status(500)
        .json({
          success: false,
          error:
            "Logout failed",
        });
    }
  },
);

app.get(
  "/api/auth/me",
  requireAuth,
  (
    req: AuthenticatedRequest,
    res,
  ) => {
    res.json({
      success: true,
      user: req.user,
    });
  },
);

app.use(
  "/api/categories",
  categoriesRouter,
);

app.use(
  "/api/items",
  itemsRouter,
);

app.use(
  "/api/addons",
  addonsRouter,
);

app.use(
  "/api/items",
  itemAddonsRouter,
);

app.use(
  "/api/orders",
  ordersRouter,
);

/*
 * New Edit Items API.
 *
 * GET:
 *   /api/order-edit/catalog
 *
 * PATCH:
 *   /api/order-edit/:orderId
 */
app.use(
  "/api/order-edit",
  orderEditRouter,
);

app.use(
  "/api/sales",
  salesRouter,
);

app.use(
  "/api/day-closing",
  dayClosingRouter,
);

app.use(
  "/api/activity-logs",
  activityLogsRouter,
);

app.use(
  "/api/realtime",
  realtimeRouter,
);

app.use("/api/item-addons", itemAddonsRouter);

app.use(
  "/api/users",
  usersRouter,
);

app.listen(
  PORT,
  () => {
    console.log(
      `Food Stall POS API running on http://localhost:${PORT}`,
    );
  },
);