import { Router } from "express";
import { pool } from "../db.js";
import {
  requireAuth,
  requirePermission,
  type AuthenticatedRequest,
} from "../middleware.js";

const router = Router();

/**
 * GET /api/categories
 * List all categories.
 */
router.get(
  "/",
  requireAuth,
  async (_req: AuthenticatedRequest, res) => {
    try {
      const result = await pool.query(
        `
        SELECT
          id,
          name,
          created_at,
          updated_at
        FROM categories
        ORDER BY name ASC
        `,
      );

      return res.json({
        success: true,
        categories: result.rows,
      });
    } catch (error) {
      console.error(
        "Failed to load categories:",
        error,
      );

      return res.status(500).json({
        success: false,
        error: "Failed to load categories",
      });
    }
  },
);

/**
 * POST /api/categories
 * Create category.
 */
router.post(
  "/",
  requireAuth,
  requirePermission("MANAGE_ITEMS"),
  async (
    req: AuthenticatedRequest,
    res,
  ) => {
    const client =
      await pool.connect();

    try {
      const { name } =
        req.body;

      if (
        typeof name !==
          "string" ||
        !name.trim()
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Category name is required",
        });
      }

      const categoryName =
        name.trim();

      await client.query(
        "BEGIN",
      );

      const duplicate =
        await client.query(
          `
          SELECT id
          FROM categories
          WHERE LOWER(name) = LOWER($1)
          LIMIT 1
          `,
          [categoryName],
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
            "A category with this name already exists",
        });
      }

      const result =
        await client.query(
          `
          INSERT INTO categories (
            name
          )
          VALUES ($1)
          RETURNING
            id,
            name,
            created_at,
            updated_at
          `,
          [categoryName],
        );

      const category =
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
          'CATEGORY_CREATED',
          'CATEGORY',
          $2,
          $3::jsonb
        )
        `,
        [
          req.user!.id,
          category.id,
          JSON.stringify({
            name:
              category.name,
          }),
        ],
      );

      await client.query(
        "COMMIT",
      );

      return res.status(201).json({
        success: true,
        category,
      });
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      console.error(
        "Failed to create category:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to create category",
      });
    } finally {
      client.release();
    }
  },
);

/**
 * PATCH /api/categories/:id
 * Update category.
 */
router.patch(
  "/:id",
  requireAuth,
  requirePermission("MANAGE_ITEMS"),
  async (
    req: AuthenticatedRequest,
    res,
  ) => {
    const client =
      await pool.connect();

    try {
      const { id } =
        req.params;

      const { name } =
        req.body;

      if (
        typeof name !==
          "string" ||
        !name.trim()
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Category name is required",
        });
      }

      const categoryName =
        name.trim();

      await client.query(
        "BEGIN",
      );

      const existing =
        await client.query(
          `
          SELECT
            id,
            name
          FROM categories
          WHERE id = $1
          FOR UPDATE
          `,
          [id],
        );

      if (
        existing.rowCount === 0
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res.status(404).json({
          success: false,
          error:
            "Category not found",
        });
      }

      const duplicate =
        await client.query(
          `
          SELECT id
          FROM categories
          WHERE LOWER(name) = LOWER($1)
            AND id <> $2
          LIMIT 1
          `,
          [
            categoryName,
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
            "A category with this name already exists",
        });
      }

      const result =
        await client.query(
          `
          UPDATE categories
          SET
            name = $1,
            updated_at = now()
          WHERE id = $2
          RETURNING
            id,
            name,
            created_at,
            updated_at
          `,
          [
            categoryName,
            id,
          ],
        );

      const category =
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
          'CATEGORY_UPDATED',
          'CATEGORY',
          $2,
          $3::jsonb
        )
        `,
        [
          req.user!.id,
          category.id,
          JSON.stringify({
            name:
              category.name,
          }),
        ],
      );

      await client.query(
        "COMMIT",
      );

      return res.json({
        success: true,
        category,
      });
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      console.error(
        "Failed to update category:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to update category",
      });
    } finally {
      client.release();
    }
  },
);

/**
 * DELETE /api/categories/:id
 *
 * We intentionally prevent deletion when
 * food items still use the category.
 */
router.delete(
  "/:id",
  requireAuth,
  requirePermission("MANAGE_ITEMS"),
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

      const categoryResult =
        await client.query(
          `
          SELECT
            id,
            name
          FROM categories
          WHERE id = $1
          FOR UPDATE
          `,
          [id],
        );

      if (
        categoryResult.rowCount ===
        0
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res.status(404).json({
          success: false,
          error:
            "Category not found",
        });
      }

      const itemResult =
        await client.query(
          `
          SELECT COUNT(*)::int AS count
          FROM items
          WHERE category_id = $1
          `,
          [id],
        );

      const itemCount =
        Number(
          itemResult.rows[0]
            ?.count ?? 0,
        );

      if (itemCount > 0) {
        await client.query(
          "ROLLBACK",
        );

        return res.status(409).json({
          success: false,
          error:
            `Cannot delete category because ${itemCount} item${
              itemCount === 1
                ? ""
                : "s"
            } still use it`,
        });
      }

      const category =
        categoryResult
          .rows[0];

      await client.query(
        `
        DELETE FROM categories
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
          'CATEGORY_DELETED',
          'CATEGORY',
          $2,
          $3::jsonb
        )
        `,
        [
          req.user!.id,
          category.id,
          JSON.stringify({
            name:
              category.name,
          }),
        ],
      );

      await client.query(
        "COMMIT",
      );

      return res.json({
        success: true,
        message:
          "Category deleted",
      });
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      console.error(
        "Failed to delete category:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to delete category",
      });
    } finally {
      client.release();
    }
  },
);

export default router;