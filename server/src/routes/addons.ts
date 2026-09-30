import { Router } from "express";
import { pool } from "../db.js";
import {
  requireAuth,
  requirePermission,
  type AuthenticatedRequest,
} from "../middleware.js";

const router = Router();

/**
 * GET /api/addons
 */
router.get(
  "/",
  requireAuth,
  async (_req: AuthenticatedRequest, res) => {
    try {
      const result =
        await pool.query(
          `
          SELECT
            id,
            name,
            price,
            created_at,
            updated_at
          FROM addons
          ORDER BY name ASC
          `,
        );

      return res.json({
        success: true,
        addons: result.rows,
      });
    } catch (error) {
      console.error(
        "Failed to load add-ons:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to load add-ons",
      });
    }
  },
);

/**
 * POST /api/addons
 */
router.post(
  "/",
  requireAuth,
  requirePermission("MANAGE_ADDONS"),
  async (
    req: AuthenticatedRequest,
    res,
  ) => {
    const client =
      await pool.connect();

    try {
      const {
        name,
        price,
      } = req.body;

      if (
        typeof name !==
          "string" ||
        !name.trim()
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Add-on name is required",
        });
      }

      if (
        typeof price !==
          "number" ||
        !Number.isFinite(
          price,
        ) ||
        price < 0
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Price must be a valid non-negative number",
        });
      }

      const addonName =
        name.trim();

      await client.query(
        "BEGIN",
      );

      const duplicate =
        await client.query(
          `
          SELECT id
          FROM addons
          WHERE LOWER(name) = LOWER($1)
          LIMIT 1
          `,
          [addonName],
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
            "An add-on with this name already exists",
        });
      }

      const result =
        await client.query(
          `
          INSERT INTO addons (
            name,
            price
          )
          VALUES ($1, $2)
          RETURNING
            id,
            name,
            price,
            created_at,
            updated_at
          `,
          [
            addonName,
            price,
          ],
        );

      const addon =
        result.rows[0];

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
          'ADDON_CREATED',
          'ADDON',
          $2,
          $3::jsonb
        )
        `,
        [
          req.user!.id,
          addon.id,
          JSON.stringify({
            name:
              addon.name,
            price:
              addon.price,
          }),
        ],
      );

      await client.query(
        "COMMIT",
      );

      return res.status(201).json({
        success: true,
        addon,
      });
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      console.error(
        "Failed to create add-on:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to create add-on",
      });
    } finally {
      client.release();
    }
  },
);

/**
 * PATCH /api/addons/:id
 */
router.patch(
  "/:id",
  requireAuth,
  requirePermission("MANAGE_ADDONS"),
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
        price,
      } = req.body;

      if (
        typeof name !==
          "string" ||
        !name.trim()
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Add-on name is required",
        });
      }

      if (
        typeof price !==
          "number" ||
        !Number.isFinite(
          price,
        ) ||
        price < 0
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Price must be a valid non-negative number",
        });
      }

      await client.query(
        "BEGIN",
      );

      const duplicate =
        await client.query(
          `
          SELECT id
          FROM addons
          WHERE LOWER(name) = LOWER($1)
            AND id <> $2
          LIMIT 1
          `,
          [
            name.trim(),
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
            "An add-on with this name already exists",
        });
      }

      const result =
        await client.query(
          `
          UPDATE addons
          SET
            name = $1,
            price = $2,
            updated_at = now()
          WHERE id = $3
          RETURNING
            id,
            name,
            price,
            created_at,
            updated_at
          `,
          [
            name.trim(),
            price,
            id,
          ],
        );

      if (
        result.rowCount ===
        0
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res.status(404).json({
          success: false,
          error:
            "Add-on not found",
        });
      }

      const addon =
        result.rows[0];

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
          'ADDON_UPDATED',
          'ADDON',
          $2,
          $3::jsonb
        )
        `,
        [
          req.user!.id,
          addon.id,
          JSON.stringify({
            name:
              addon.name,
            price:
              addon.price,
          }),
        ],
      );

      await client.query(
        "COMMIT",
      );

      return res.json({
        success: true,
        addon,
      });
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      console.error(
        "Failed to update add-on:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to update add-on",
      });
    } finally {
      client.release();
    }
  },
);

/**
 * DELETE /api/addons/:id
 */
router.delete(
  "/:id",
  requireAuth,
  requirePermission("MANAGE_ADDONS"),
  async (
    req: AuthenticatedRequest,
    res,
  ) => {
    const client =
      await pool.connect();

    try {
      const { id } =
        req.params;

      await client.query(
        "BEGIN",
      );

      const existing =
        await client.query(
          `
          SELECT
            id,
            name,
            price
          FROM addons
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
            "Add-on not found",
        });
      }

      const addon =
        existing.rows[0];

      /*
       * Remove only current menu
       * associations.
       *
       * Historical order add-ons
       * remain untouched.
       */
      await client.query(
        `
        DELETE FROM item_addons
        WHERE addon_id = $1
        `,
        [id],
      );

      await client.query(
        `
        DELETE FROM addons
        WHERE id = $1
        `,
        [id],
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
          'ADDON_DELETED',
          'ADDON',
          $2,
          $3::jsonb
        )
        `,
        [
          req.user!.id,
          addon.id,
          JSON.stringify({
            name:
              addon.name,
            price:
              addon.price,
          }),
        ],
      );

      await client.query(
        "COMMIT",
      );

      return res.json({
        success: true,
        message:
          "Add-on deleted",
      });
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      console.error(
        "Failed to delete add-on:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to delete add-on",
      });
    } finally {
      client.release();
    }
  },
);

export default router;