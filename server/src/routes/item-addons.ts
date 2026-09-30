import { Router } from "express";
import { pool } from "../db.js";
import {
  requireAuth,
  requirePermission,
  type AuthenticatedRequest,
} from "../middleware.js";

const router = Router();

/**
 * GET /api/item-addons
 *
 * Returns every item/add-on association.
 *
 * Used by the Menu page.
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
            item_id,
            addon_id
          FROM item_addons
          ORDER BY item_id, addon_id
          `,
        );

      return res.json({
        success: true,
        itemAddons:
          result.rows,
      });
    } catch (error) {
      console.error(
        "Failed to load item/add-on associations:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to load item/add-on associations",
      });
    }
  },
);

/**
 * GET /api/item-addons/:itemId/addons
 *
 * Returns add-ons attached to one item.
 */
router.get(
  "/:itemId/addons",
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res,
  ) => {
    try {
      const {
        itemId,
      } = req.params;

      const item =
        await pool.query(
          `
          SELECT id
          FROM items
          WHERE id = $1
          `,
          [itemId],
        );

      if (
        item.rowCount ===
        0
      ) {
        return res.status(404).json({
          success: false,
          error:
            "Item not found",
        });
      }

      const result =
        await pool.query(
          `
          SELECT
            a.id,
            a.name,
            a.price
          FROM item_addons ia
          INNER JOIN addons a
            ON a.id = ia.addon_id
          WHERE ia.item_id = $1
          ORDER BY a.name ASC
          `,
          [itemId],
        );

      return res.json({
        success: true,
        addons:
          result.rows,
      });
    } catch (error) {
      console.error(
        "Failed to load item add-ons:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to load item add-ons",
      });
    }
  },
);

/**
 * PUT /api/item-addons/:itemId
 *
 * Replace the complete add-on selection
 * for an item.
 *
 * Body:
 * {
 *   addonIds: ["id1", "id2"]
 * }
 */
router.put(
  "/:itemId",
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
        itemId,
      } = req.params;

      const {
        addonIds,
      } = req.body;

      if (
        !Array.isArray(
          addonIds,
        )
      ) {
        return res.status(400).json({
          success: false,
          error:
            "addonIds must be an array",
        });
      }

      const cleanAddonIds =
        [
          ...new Set(
            addonIds
              .filter(
                (
                  id,
                ) =>
                  typeof id ===
                  "string",
              )
              .map(
                (
                  id,
                ) =>
                  id.trim(),
              )
              .filter(
                Boolean,
              ),
          ),
        ];

      await client.query(
        "BEGIN",
      );

      const item =
        await client.query(
          `
          SELECT
            id,
            name
          FROM items
          WHERE id = $1
          FOR UPDATE
          `,
          [itemId],
        );

      if (
        item.rowCount ===
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

      if (
        cleanAddonIds.length >
        0
      ) {
        const addons =
          await client.query(
            `
            SELECT id
            FROM addons
            WHERE id = ANY($1::uuid[])
            `,
            [
              cleanAddonIds,
            ],
          );

        if (
          addons.rowCount !==
          cleanAddonIds.length
        ) {
          await client.query(
            "ROLLBACK",
          );

          return res.status(400).json({
            success: false,
            error:
              "One or more selected add-ons do not exist",
          });
        }
      }

      const oldLinks =
        await client.query(
          `
          SELECT addon_id
          FROM item_addons
          WHERE item_id = $1
          `,
          [itemId],
        );

      const oldIds =
        oldLinks.rows.map(
          (
            row,
          ) =>
            row.addon_id,
        );

      await client.query(
        `
        DELETE FROM item_addons
        WHERE item_id = $1
        `,
        [itemId],
      );

      if (
        cleanAddonIds.length >
        0
      ) {
        await client.query(
          `
          INSERT INTO item_addons (
            item_id,
            addon_id
          )
          SELECT
            $1,
            unnest($2::uuid[])
          ON CONFLICT (
            item_id,
            addon_id
          )
          DO NOTHING
          `,
          [
            itemId,
            cleanAddonIds,
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
          'ITEM_ADDONS_UPDATED',
          'ITEM',
          $2,
          $3::jsonb
        )
        `,
        [
          req.user!.id,
          itemId,
          JSON.stringify({
            item_name:
              item.rows[0]
                .name,
            previous_addon_ids:
              oldIds,
            addon_ids:
              cleanAddonIds,
          }),
        ],
      );

      await client.query(
        "COMMIT",
      );

      return res.json({
        success: true,
        itemId,
        addonIds:
          cleanAddonIds,
      });
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      console.error(
        "Failed to update item add-ons:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to update item add-ons",
      });
    } finally {
      client.release();
    }
  },
);

/**
 * POST /api/item-addons/:itemId/addons/:addonId
 *
 * Keep the original API working.
 */
router.post(
  "/:itemId/addons/:addonId",
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
        itemId,
        addonId,
      } = req.params;

      await client.query(
        "BEGIN",
      );

      const item =
        await client.query(
          `
          SELECT id
          FROM items
          WHERE id = $1
          `,
          [itemId],
        );

      if (
        item.rowCount ===
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

      const addon =
        await client.query(
          `
          SELECT id
          FROM addons
          WHERE id = $1
          `,
          [addonId],
        );

      if (
        addon.rowCount ===
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

      const result =
        await client.query(
          `
          INSERT INTO item_addons (
            item_id,
            addon_id
          )
          VALUES ($1, $2)
          ON CONFLICT (
            item_id,
            addon_id
          )
          DO NOTHING
          RETURNING
            item_id,
            addon_id
          `,
          [
            itemId,
            addonId,
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
          'ITEM_ADDON_ATTACHED',
          'ITEM',
          $2,
          $3::jsonb
        )
        `,
        [
          req.user!.id,
          itemId,
          JSON.stringify({
            addon_id:
              addonId,
          }),
        ],
      );

      await client.query(
        "COMMIT",
      );

      return res.status(201).json({
        success: true,
        attached:
          (result.rowCount ??
            0) > 0,
      });
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      console.error(
        "Failed to attach add-on:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to attach add-on",
      });
    } finally {
      client.release();
    }
  },
);

/**
 * DELETE /api/item-addons/:itemId/addons/:addonId
 */
router.delete(
  "/:itemId/addons/:addonId",
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
        itemId,
        addonId,
      } = req.params;

      await client.query(
        "BEGIN",
      );

      const result =
        await client.query(
          `
          DELETE FROM item_addons
          WHERE item_id = $1
            AND addon_id = $2
          RETURNING
            item_id,
            addon_id
          `,
          [
            itemId,
            addonId,
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
            "Item add-on association not found",
        });
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
          'ITEM_ADDON_DETACHED',
          'ITEM',
          $2,
          $3::jsonb
        )
        `,
        [
          req.user!.id,
          itemId,
          JSON.stringify({
            addon_id:
              addonId,
          }),
        ],
      );

      await client.query(
        "COMMIT",
      );

      return res.json({
        success: true,
        message:
          "Add-on detached from item",
      });
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      console.error(
        "Failed to detach add-on:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to detach add-on",
      });
    } finally {
      client.release();
    }
  },
);

export default router;