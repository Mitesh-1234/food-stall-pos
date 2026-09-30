import { Router } from "express";
import { pool } from "../db.js";
import {
  AuthError,
  type AuthenticatedUser,
} from "../auth.js";
import {
  requireAuth,
  requirePermission,
  type AuthenticatedRequest,
} from "../middleware.js";

const router = Router();

function getUser(req: AuthenticatedRequest): AuthenticatedUser {
  if (!req.user) {
    throw new AuthError("Authentication required", 401);
  }

  return req.user;
};

router.get(
  "/",
  requireAuth,
  requirePermission("VIEW_ACTIVITY_LOGS"),
  async (req: AuthenticatedRequest, res) => {
    try {
      getUser(req);

      const page = Math.max(
        1,
        Number(req.query.page ?? 1),
      );

      const limit = Math.min(
        100,
        Math.max(
          1,
          Number(req.query.limit ?? 50),
        ),
      );

      const offset = (page - 1) * limit;

      const userId =
        typeof req.query.userId === "string"
          ? req.query.userId
          : null;

      const action =
        typeof req.query.action === "string"
          ? req.query.action
          : null;

      const entityType =
        typeof req.query.entityType === "string"
          ? req.query.entityType
          : null;

      const entityId =
        typeof req.query.entityId === "string"
          ? req.query.entityId
          : null;

      const from =
        typeof req.query.from === "string"
          ? req.query.from
          : null;

      const to =
        typeof req.query.to === "string"
          ? req.query.to
          : null;

      const conditions: string[] = [];
      const values: unknown[] = [];

      const addCondition = (
        sql: string,
        value: unknown,
      ) => {
        values.push(value);
        conditions.push(
          sql.replace(
            "?",
            `$${values.length}`,
          ),
        );
      };

      if (userId) {
        addCondition("al.user_id = ?", userId);
      }

      if (action) {
        addCondition("al.action = ?", action);
      }

      if (entityType) {
        addCondition(
          "al.entity_type = ?",
          entityType,
        );
      }

      if (entityId) {
        addCondition(
          "al.entity_id = ?",
          entityId,
        );
      }

      if (from) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
          return res.status(400).json({
            success: false,
            error: "Invalid 'from' date. Use YYYY-MM-DD",
          });
        }

        addCondition(
          "al.created_at >= ?::date",
          from,
        );
      }

      if (to) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) {
          return res.status(400).json({
            success: false,
            error: "Invalid 'to' date. Use YYYY-MM-DD",
          });
        }

        addCondition(
          "al.created_at < (?::date + INTERVAL '1 day')",
          to,
        );
      }

      const whereClause =
        conditions.length > 0
          ? `WHERE ${conditions.join(" AND ")}`
          : "";

      const countResult = await pool.query(
        `
        SELECT COUNT(*)::int AS total
        FROM activity_logs al
        ${whereClause}
        `,
        values,
      );

      const total = Number(
        countResult.rows[0].total,
      );

      const dataValues = [...values, limit, offset];

      const result = await pool.query(
        `
        SELECT
          al.id,
          al.user_id,
          u.name AS user_name,
          al.action,
          al.entity_type,
          al.entity_id,
          al.details,
          al.created_at
        FROM activity_logs al
        LEFT JOIN users u
          ON u.id = al.user_id
        ${whereClause}
        ORDER BY al.created_at DESC
        LIMIT $${values.length + 1}
        OFFSET $${values.length + 2}
        `,
        dataValues,
      );

      return res.json({
        success: true,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(
            total / limit,
          ),
        },
        logs: result.rows,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
        });
      }

      console.error(
        "Activity logs error:",
        error,
      );

      return res.status(500).json({
        success: false,
        error: "Failed to load activity logs",
      });
    }
  },
);

export default router;