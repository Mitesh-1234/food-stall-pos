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
 * CORS — allow all origins.
 * Security is enforced by JWT token on every
 * protected route, not by origin restriction.
 */
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: [
      "GET",
      "POST",
      "PATCH",
      "PUT",
      "DELETE",
      "OPTIONS",
    ],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  }),
);

/*
 * Handle OPTIONS preflight requests cleanly for Express 5
 */
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Origin", (req.headers.origin as string) || "*");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.sendStatus(204);
    return;
  }
  next();
});



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
  "/api/health",
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
        error:
          error instanceof Error
            ? error.message
            : String(error),
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

/*
 * In local development, start the HTTP server
 * directly. On Vercel (serverless), the platform
 * invokes the exported `app` handler — no listen
 * needed there.
 */
if (!process.env.VERCEL) {
  app.listen(
    PORT,
    () => {
      console.log(
        `Food Stall POS API running on http://localhost:${PORT}`,
      );
    },
  );
}

export default app;