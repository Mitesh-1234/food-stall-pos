import { Router } from "express";
import { pool } from "../db.js";
import {
  requireAuth,
  requirePermission,
  type AuthenticatedRequest,
} from "../middleware.js";

const router = Router();

/**
 * GET /api/items
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
            i.id,
            i.name,
            i.category_id,
            c.name AS category_name,
            i.price,
            i.created_at,
            i.updated_at
          FROM items i
          LEFT JOIN categories c
            ON c.id = i.category_id
          ORDER BY
            COALESCE(c.name, ''),
            i.name
          `,
        );

      return res.json({
        success: true,
        items: result.rows,
      });
    } catch (error) {
      console.error(
        "Failed to load items:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to load items",
      });
    }
  },
);

/**
 * POST /api/items
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
      const {
        name,
        categoryId,
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
            "Item name is required",
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

      const normalizedCategoryId =
        typeof categoryId ===
          "string" &&
        categoryId.trim()
          ? categoryId.trim()
          : null;

      if (
        normalizedCategoryId
      ) {
        const category =
          await client.query(
            `
            SELECT id
            FROM categories
            WHERE id = $1
            `,
            [
              normalizedCategoryId,
            ],
          );

        if (
          category.rowCount ===
          0
        ) {
          return res.status(400).json({
            success: false,
            error:
              "Category not found",
          });
        }
      }

      await client.query(
        "BEGIN",
      );

      const result =
        await client.query(
          `
          INSERT INTO items (
            name,
            category_id,
            price
          )
          VALUES ($1, $2, $3)
          RETURNING
            id,
            name,
            category_id,
            price,
            created_at,
            updated_at
          `,
          [
            name.trim(),
            normalizedCategoryId,
            price,
          ],
        );

      const item =
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
          'ITEM_CREATED',
          'ITEM',
          $2,
          $3::jsonb
        )
        `,
        [
          req.user!.id,
          item.id,
          JSON.stringify({
            name:
              item.name,
            category_id:
              item.category_id,
            price:
              item.price,
          }),
        ],
      );

      await client.query(
        "COMMIT",
      );

      return res.status(201).json({
        success: true,
        item,
      });
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      console.error(
        "Failed to create item:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to create item",
      });
    } finally {
      client.release();
    }
  },
);

/**
 * PATCH /api/items/:id
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

      const {
        name,
        categoryId,
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
            "Item name is required",
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

      const normalizedCategoryId =
        typeof categoryId ===
          "string" &&
        categoryId.trim()
          ? categoryId.trim()
          : null;

      if (
        normalizedCategoryId
      ) {
        const category =
          await client.query(
            `
            SELECT id
            FROM categories
            WHERE id = $1
            `,
            [
              normalizedCategoryId,
            ],
          );

        if (
          category.rowCount ===
          0
        ) {
          return res.status(400).json({
            success: false,
            error:
              "Category not found",
          });
        }
      }

      await client.query(
        "BEGIN",
      );

      const result =
        await client.query(
          `
          UPDATE items
          SET
            name = $1,
            category_id = $2,
            price = $3,
            updated_at = now()
          WHERE id = $4
          RETURNING
            id,
            name,
            category_id,
            price,
            created_at,
            updated_at
          `,
          [
            name.trim(),
            normalizedCategoryId,
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
            "Item not found",
        });
      }

      const item =
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
          'ITEM_UPDATED',
          'ITEM',
          $2,
          $3::jsonb
        )
        `,
        [
          req.user!.id,
          item.id,
          JSON.stringify({
            name:
              item.name,
            category_id:
              item.category_id,
            price:
              item.price,
          }),
        ],
      );

      await client.query(
        "COMMIT",
      );

      return res.json({
        success: true,
        item,
      });
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      console.error(
        "Failed to update item:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to update item",
      });
    } finally {
      client.release();
    }
  },
);

/**
 * DELETE /api/items/:id
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

      const existing =
        await client.query(
          `
          SELECT
            id,
            name,
            category_id,
            price
          FROM items
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
            "Item not found",
        });
      }

      const item =
        existing.rows[0];

      /*
       * Remove menu association rows first.
       *
       * Historical order_item_addons are
       * intentionally NOT removed.
       */
      await client.query(
        `
        DELETE FROM item_addons
        WHERE item_id = $1
        `,
        [id],
      );

      await client.query(
        `
        DELETE FROM items
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
          'ITEM_DELETED',
          'ITEM',
          $2,
          $3::jsonb
        )
        `,
        [
          req.user!.id,
          item.id,
          JSON.stringify({
            name:
              item.name,
            category_id:
              item.category_id,
            price:
              item.price,
          }),
        ],
      );

      await client.query(
        "COMMIT",
      );

      return res.json({
        success: true,
        message:
          "Item deleted",
      });
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      console.error(
        "Failed to delete item:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to delete item",
      });
    } finally {
      client.release();
    }
  },
);

export default router;