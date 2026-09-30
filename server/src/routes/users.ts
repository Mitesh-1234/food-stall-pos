import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { pool } from "../db.js";
import {
  requireAuth,
  requirePermission,
  type AuthenticatedRequest,
} from "../middleware.js";
import { broadcastRealtime } from "../realtime.js";

const router = Router();

const PERMISSIONS = [
  "CREATE_ORDER",
  "VIEW_ORDERS",
  "EDIT_ORDER",
  "CANCEL_ORDER",
  "MARK_READY",
  "MARK_DELIVERED",
  "VIEW_SALES",
  "VIEW_REPORTS",
  "MANAGE_ITEMS",
  "MANAGE_ADDONS",
  "MANAGE_USERS",
  "VIEW_ACTIVITY_LOGS",
  "DAY_CLOSING",
] as const;

type PermissionCode =
  (typeof PERMISSIONS)[number];

function isValidPermission(
  value: unknown,
): value is PermissionCode {
  return (
    typeof value === "string" &&
    (PERMISSIONS as readonly string[]).includes(
      value,
    )
  );
}

function validatePermissions(
  permissions: unknown,
): string[] | null {
  if (!Array.isArray(permissions)) {
    return null;
  }

  const unique = [
    ...new Set(
      permissions.filter(
        isValidPermission,
      ),
    ),
  ];

  if (
    unique.length !==
    permissions.length
  ) {
    return null;
  }

  return unique;
}

function validatePin(
  pin: unknown,
): string | null {
  if (
    typeof pin !== "string" ||
    !/^\d{6}$/.test(pin)
  ) {
    return null;
  }

  return pin;
}

function createPinLookup(
  pin: string,
): string {
  const secret =
    process.env.PIN_LOOKUP_SECRET;

  if (!secret) {
    throw new Error(
      "PIN_LOOKUP_SECRET is not configured",
    );
  }

  return crypto
    .createHmac(
      "sha256",
      secret,
    )
    .update(pin)
    .digest("hex");
}

function sanitizeUser(
  row: any,
) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    createdAt:
      row.created_at,
    updatedAt:
      row.updated_at,
    permissions:
      row.permissions ?? [],
  };
}

/**
 * GET /api/users
 *
 * List staff users.
 */
router.get(
  "/",
  requireAuth,
  requirePermission("MANAGE_USERS"),
  async (
    _req: AuthenticatedRequest,
    res,
  ) => {
    try {
      const result =
        await pool.query(
          `
          SELECT
            u.id,
            u.name,
            u.status,
            u.created_at,
            u.updated_at,
            COALESCE(
              ARRAY_AGG(
                up.permission
                ORDER BY up.permission
              )
              FILTER (
                WHERE up.permission IS NOT NULL
              ),
              ARRAY[]::permission_code[]
            ) AS permissions
          FROM users u
          LEFT JOIN user_permissions up
            ON up.user_id = u.id
          GROUP BY
            u.id,
            u.name,
            u.status,
            u.created_at,
            u.updated_at
          ORDER BY
            CASE
              WHEN u.status = 'ACTIVE'
              THEN 0
              ELSE 1
            END,
            u.name ASC
          `,
        );

      return res.json({
        success: true,
        users:
          result.rows.map(
            sanitizeUser,
          ),
        availablePermissions:
          PERMISSIONS,
      });
    } catch (error) {
      console.error(
        "Failed to load users:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to load users",
      });
    }
  },
);

/**
 * GET /api/users/permissions
 *
 * Available permission codes.
 */
router.get(
  "/permissions",
  requireAuth,
  requirePermission("MANAGE_USERS"),
  async (
    _req: AuthenticatedRequest,
    res,
  ) => {
    return res.json({
      success: true,
      permissions:
        PERMISSIONS,
    });
  },
);

/**
 * POST /api/users
 *
 * Create staff user.
 */
router.post(
  "/",
  requireAuth,
  requirePermission("MANAGE_USERS"),
  async (
    req: AuthenticatedRequest,
    res,
  ) => {
    const client =
      await pool.connect();

    try {
      const {
        name,
        pin,
        permissions,
      } = req.body;

      if (
        typeof name !==
          "string" ||
        !name.trim()
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Staff name is required",
        });
      }

      const validPin =
        validatePin(pin);

      if (!validPin) {
        return res.status(400).json({
          success: false,
          error:
            "PIN must contain exactly 6 digits",
        });
      }

      const validPermissions =
        validatePermissions(
          permissions,
        );

      if (
        validPermissions ===
        null
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid permissions",
        });
      }

      const staffName =
        name.trim();

      const pinLookup =
        createPinLookup(
          validPin,
        );

      await client.query(
        "BEGIN",
      );

      /*
       * PIN lookup is unique.
       * Locking isn't possible before the
       * row exists, so the database unique
       * constraint remains the final guard.
       */
      const existing =
        await client.query(
          `
          SELECT id
          FROM users
          WHERE pin_lookup = $1
          LIMIT 1
          `,
          [pinLookup],
        );

      if (
        existing.rowCount &&
        existing.rowCount > 0
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res.status(409).json({
          success: false,
          error:
            "This PIN is already assigned to another staff member",
        });
      }

      const pinHash =
        await bcrypt.hash(
          validPin,
          12,
        );

      const userResult =
        await client.query(
          `
          INSERT INTO users (
            name,
            pin_lookup,
            pin_hash,
            status
          )
          VALUES (
            $1,
            $2,
            $3,
            'ACTIVE'
          )
          RETURNING
            id,
            name,
            status,
            created_at,
            updated_at
          `,
          [
            staffName,
            pinLookup,
            pinHash,
          ],
        );

      const user =
        userResult.rows[0];

      for (const permission of validPermissions) {
        await client.query(
          `
          INSERT INTO user_permissions (
            user_id,
            permission
          )
          VALUES (
            $1,
            $2::permission_code
          )
          `,
          [
            user.id,
            permission,
          ],
        );
      }

      await client.query(
        `
        INSERT INTO activity_logs (
          user_id,
          action,
          entity_type,
          entity_id,
          details
        )
        VALUES (
          $1,
          'STAFF_CREATED',
          'USER',
          $2,
          $3::jsonb
        )
        `,
        [
          req.user!.id,
          user.id,
          JSON.stringify({
            name:
              user.name,
            permissions:
              validPermissions,
          }),
        ],
      );

      await client.query(
        "COMMIT",
      );

      return res.status(201).json({
        success: true,
        user: {
          ...sanitizeUser(
            user,
          ),
          permissions:
            validPermissions,
        },
      });
    } catch (error: any) {
      await client.query(
        "ROLLBACK",
      );

      if (
        error?.code ===
        "23505"
      ) {
        return res.status(409).json({
          success: false,
          error:
            "This PIN is already assigned to another staff member",
        });
      }

      console.error(
        "Failed to create user:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to create user",
      });
    } finally {
      client.release();
    }
  },
);

/**
 * PATCH /api/users/:id
 *
 * Update staff name and permissions.
 */
router.patch(
  "/:id",
  requireAuth,
  requirePermission("MANAGE_USERS"),
  async (
    req: AuthenticatedRequest,
    res,
  ) => {
    const client =
      await pool.connect();

    try {
      const { id } =
        req.params;

      const {
        name,
        permissions,
      } = req.body;

      if (
        typeof name !==
          "string" ||
        !name.trim()
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Staff name is required",
        });
      }

      const validPermissions =
        validatePermissions(
          permissions,
        );

      if (
        validPermissions ===
        null
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid permissions",
        });
      }

      await client.query(
        "BEGIN",
      );

      const existing =
        await client.query(
          `
          SELECT
            id,
            name,
            status
          FROM users
          WHERE id = $1
          FOR UPDATE
          `,
          [id],
        );

      if (
        existing.rowCount ===
        0
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res.status(404).json({
          success: false,
          error:
            "User not found",
        });
      }

      await client.query(
        `
        UPDATE users
        SET
          name = $1,
          updated_at = now()
        WHERE id = $2
        `,
        [
          name.trim(),
          id,
        ],
      );

      await client.query(
        `
        DELETE FROM user_permissions
        WHERE user_id = $1
        `,
        [id],
      );

      for (const permission of validPermissions) {
        await client.query(
          `
          INSERT INTO user_permissions (
            user_id,
            permission
          )
          VALUES (
            $1,
            $2::permission_code
          )
          `,
          [
            id,
            permission,
          ],
        );
      }

      await client.query(
        `
        INSERT INTO activity_logs (
          user_id,
          action,
          entity_type,
          entity_id,
          details
        )
        VALUES (
          $1,
          'STAFF_UPDATED',
          'USER',
          $2,
          $3::jsonb
        )
        `,
        [
          req.user!.id,
          id,
          JSON.stringify({
            name:
              name.trim(),
            permissions:
              validPermissions,
          }),
        ],
      );

      await client.query(
        "COMMIT",
      );

      return res.json({
        success: true,
        message:
          "Staff user updated",
      });
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      console.error(
        "Failed to update user:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to update user",
      });
    } finally {
      client.release();
    }
  },
);

/**
 * PATCH /api/users/:id/pin
 *
 * Change staff PIN.
 *
 * Changing a PIN invalidates the
 * current session for security.
 */
router.patch(
  "/:id/pin",
  requireAuth,
  requirePermission("MANAGE_USERS"),
  async (
    req: AuthenticatedRequest,
    res,
  ) => {
    const client =
      await pool.connect();

    try {
      const { id } =
        req.params;

      const { pin } =
        req.body;

      const validPin =
        validatePin(pin);

      if (!validPin) {
        return res.status(400).json({
          success: false,
          error:
            "PIN must contain exactly 6 digits",
        });
      }

      const pinLookup =
        createPinLookup(
          validPin,
        );

      await client.query(
        "BEGIN",
      );

      const existing =
        await client.query(
          `
          SELECT
            id,
            name,
            active_session_id
          FROM users
          WHERE id = $1
          FOR UPDATE
          `,
          [id],
        );

      if (
        existing.rowCount ===
        0
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res.status(404).json({
          success: false,
          error:
            "User not found",
        });
      }

      const duplicate =
        await client.query(
          `
          SELECT id
          FROM users
          WHERE pin_lookup = $1
            AND id <> $2
          LIMIT 1
          `,
          [
            pinLookup,
            id,
          ],
        );

      if (
        duplicate.rowCount &&
        duplicate.rowCount > 0
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res.status(409).json({
          success: false,
          error:
            "This PIN is already assigned to another staff member",
        });
      }

      const pinHash =
        await bcrypt.hash(
          validPin,
          12,
        );

      const oldSessionId =
        existing.rows[0]
          .active_session_id;

      await client.query(
        `
        UPDATE users
        SET
          pin_lookup = $1,
          pin_hash = $2,
          active_session_id = NULL,
          updated_at = now()
        WHERE id = $3
        `,
        [
          pinLookup,
          pinHash,
          id,
        ],
      );

      if (oldSessionId) {
        await client.query(
          `
          UPDATE sessions
          SET
            is_active = false,
            invalidated_at = now(),
            invalidation_reason = 'PIN_CHANGED'
          WHERE id = $1
            AND is_active = true
          `,
          [oldSessionId],
        );
      }

      await client.query(
        `
        INSERT INTO activity_logs (
          user_id,
          action,
          entity_type,
          entity_id,
          details
        )
        VALUES (
          $1,
          'STAFF_PIN_CHANGED',
          'USER',
          $2,
          $3::jsonb
        )
        `,
        [
          req.user!.id,
          id,
          JSON.stringify({
            session_invalidated:
              Boolean(
                oldSessionId,
              ),
          }),
        ],
      );

      await client.query(
        "COMMIT",
      );

      if (oldSessionId) {
        broadcastRealtime(
          "user-session-invalidated",
          {
            userId: id,
            sessionId:
              oldSessionId,
            reason:
              "PIN_CHANGED",
          },
        );
      }

      return res.json({
        success: true,
        message:
          "PIN changed and previous session invalidated",
      });
    } catch (error: any) {
      await client.query(
        "ROLLBACK",
      );

      if (
        error?.code ===
        "23505"
      ) {
        return res.status(409).json({
          success: false,
          error:
            "This PIN is already assigned to another staff member",
        });
      }

      console.error(
        "Failed to change PIN:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to change PIN",
      });
    } finally {
      client.release();
    }
  },
);

/**
 * PATCH /api/users/:id/status
 *
 * Activate/deactivate staff.
 */
router.patch(
  "/:id/status",
  requireAuth,
  requirePermission("MANAGE_USERS"),
  async (
    req: AuthenticatedRequest,
    res,
  ) => {
    const client =
      await pool.connect();

    try {
      const { id } =
        req.params;

      const { status } =
        req.body;

      if (
        status !== "ACTIVE" &&
        status !== "INACTIVE"
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Status must be ACTIVE or INACTIVE",
        });
      }

      /*
       * Do not allow an administrator to
       * accidentally deactivate their own
       * currently authenticated account.
       */
      if (
        id === req.user!.id &&
        status === "INACTIVE"
      ) {
        return res.status(400).json({
          success: false,
          error:
            "You cannot deactivate your own active account",
        });
      }

      await client.query(
        "BEGIN",
      );

      const existing =
        await client.query(
          `
          SELECT
            id,
            name,
            status,
            active_session_id
          FROM users
          WHERE id = $1
          FOR UPDATE
          `,
          [id],
        );

      if (
        existing.rowCount ===
        0
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res.status(404).json({
          success: false,
          error:
            "User not found",
        });
      }

      const user =
        existing.rows[0];

      const oldSessionId =
        user.active_session_id;

      if (
        status === "INACTIVE" &&
        oldSessionId
      ) {
        await client.query(
          `
          UPDATE sessions
          SET
            is_active = false,
            invalidated_at = now(),
            invalidation_reason = 'USER_DEACTIVATED'
          WHERE id = $1
            AND is_active = true
          `,
          [oldSessionId],
        );
      }

      await client.query(
        `
        UPDATE users
        SET
          status = $1::user_status,
          active_session_id =
            CASE
              WHEN $1::user_status = 'INACTIVE'
              THEN NULL
              ELSE active_session_id
            END,
          updated_at = now()
        WHERE id = $2
        `,
        [
          status,
          id,
        ],
      );

      await client.query(
        `
        INSERT INTO activity_logs (
          user_id,
          action,
          entity_type,
          entity_id,
          details
        )
        VALUES (
          $1,
          $2,
          'USER',
          $3,
          $4::jsonb
        )
        `,
        [
          req.user!.id,
          status ===
          "INACTIVE"
            ? "STAFF_DEACTIVATED"
            : "STAFF_ACTIVATED",
          id,
          JSON.stringify({
            previous_status:
              user.status,
            new_status:
              status,
            session_invalidated:
              Boolean(
                oldSessionId &&
                  status ===
                    "INACTIVE",
              ),
          }),
        ],
      );

      await client.query(
        "COMMIT",
      );

      if (
        oldSessionId &&
        status === "INACTIVE"
      ) {
        broadcastRealtime(
          "user-session-invalidated",
          {
            userId: id,
            sessionId:
              oldSessionId,
            reason:
              "USER_DEACTIVATED",
          },
        );
      }

      return res.json({
        success: true,
        status,
        sessionInvalidated:
          Boolean(
            oldSessionId &&
              status ===
                "INACTIVE",
          ),
      });
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      console.error(
        "Failed to update user status:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to update user status",
      });
    } finally {
      client.release();
    }
  },
);

export default router;