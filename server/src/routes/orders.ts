import { Router } from "express";
import { pool } from "../db.js";
import {
  requireAuth,
  requirePermission,
  type AuthenticatedRequest,
} from "../middleware.js";
import { broadcastRealtime } from "../realtime.js";

const router = Router();

type OrderInputItem = {
  itemId: string;
  quantity: number;
  addonIds: string[];
};

type PaymentInput = {
  mode: "CASH" | "ONLINE" | "BOTH";
  cashReceived?: number;
  onlineReceived?: number;
  transactionReference?: string;
  paymentProofPath?: string;
};

type RefundMethod = "CASH" | "ONLINE";

function isValidUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function isValidMoney(value: unknown): value is number {
  if (typeof value !== "number") {
    return false;
  }

  if (!Number.isFinite(value) || value < 0) {
    return false;
  }

  const cents = Math.round(value * 100);

  return Math.abs(value * 100 - cents) < 0.000001;
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

function fromCents(value: number): string {
  return (value / 100).toFixed(2);
}

/**
 * GET /api/orders
 *
 * Lists orders with search, filters and pagination.
 */

router.get(
  "/",
  requireAuth,
  requirePermission("VIEW_ORDERS"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const search =
        typeof req.query.search === "string"
          ? req.query.search.trim()
          : "";

      const status =
        typeof req.query.status === "string"
          ? req.query.status.trim()
          : "";

      const paymentMode =
        typeof req.query.paymentMode === "string"
          ? req.query.paymentMode.trim()
          : "";

      const page = Math.max(
        Number.parseInt(String(req.query.page ?? "1"), 10) || 1,
        1,
      );

      const limit = Math.min(
        Math.max(
          Number.parseInt(String(req.query.limit ?? "20"), 10) || 20,
          1,
        ),
        100,
      );

      const offset = (page - 1) * limit;

      const conditions: string[] = [];
      const values: unknown[] = [];

      if (search) {
        values.push(`%${search}%`);
        const param = `$${values.length}`;

        conditions.push(`
          (
            customer_name ILIKE ${param}
            OR customer_phone ILIKE ${param}
            OR token_number::text ILIKE ${param}
          )
        `);
      }

      if (status) {
        values.push(status);
        conditions.push(`status = $${values.length}`);
      }

      if (paymentMode) {
        values.push(paymentMode);
        conditions.push(`payment_mode = $${values.length}`);
      }

      const whereClause =
        conditions.length > 0
          ? `WHERE ${conditions.join(" AND ")}`
          : "";

      const countResult = await pool.query(
        `
          SELECT COUNT(*)::int AS total
          FROM orders
          ${whereClause}
        `,
        values,
      );

      const total = countResult.rows[0].total;

      const dataValues = [...values];

      dataValues.push(limit);
      const limitParam = `$${dataValues.length}`;

      dataValues.push(offset);
      const offsetParam = `$${dataValues.length}`;

      const ordersResult = await pool.query(
        `
          SELECT
            id,
            token_number,
            customer_name,
            customer_phone,
            status,
            subtotal,
            total,
            refund_total,
            payment_mode,
            payment_status,
            cash_received,
            online_received,
            change_amount,
            special_note,
            created_by,
            delivered_at,
            created_at,
            updated_at,
            version
          FROM orders
          ${whereClause}
          ORDER BY token_number DESC
          LIMIT ${limitParam}
          OFFSET ${offsetParam}
        `,
        dataValues,
      );

      return res.json({
        success: true,
        orders: ordersResult.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Failed to load orders:", error);

      return res.status(500).json({
        success: false,
        error: "Failed to load orders",
      });
    }
  },
);

/**
 * PATCH /api/orders/:id/status
 *
 * Valid transitions:
 * PREPARING -> READY
 * READY -> DELIVERED
 */

router.patch(
  "/:id/status",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: "Authentication required",
        });
      }

      const { id } = req.params;
      const { status } = req.body;

      const allowedStatuses = [
        "PREPARING",
        "READY",
        "DELIVERED",
      ];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: "Invalid order status",
        });
      }

      const permissionMap: Record<string, string> = {
        PREPARING: "CREATE_ORDER",
        READY: "MARK_READY",
        DELIVERED: "MARK_DELIVERED",
      };

      const requiredPermission = permissionMap[status];

      if (!req.user.permissions.includes(requiredPermission)) {
        return res.status(403).json({
          success: false,
          error: "Permission denied",
        });
      }

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const orderResult = await client.query(
          `
            SELECT
              id,
              token_number,
              status,
              version
            FROM orders
            WHERE id = $1
            FOR UPDATE
          `,
          [id],
        );

        if (orderResult.rowCount === 0) {
          await client.query("ROLLBACK");

          return res.status(404).json({
            success: false,
            error: "Order not found",
          });
        }

        const order = orderResult.rows[0];

        const validTransitions: Record<string, string[]> = {
          PREPARING: ["READY"],
          READY: ["DELIVERED"],
          DELIVERED: [],
          CANCELLED: [],
        };

        if (!validTransitions[order.status]?.includes(status)) {
          await client.query("ROLLBACK");

          return res.status(409).json({
            success: false,
            error: `Cannot change order from ${order.status} to ${status}`,
          });
        }

        const deliveredAt =
          status === "DELIVERED"
            ? "NOW()"
            : "delivered_at";

        const updatedResult = await client.query(
          `
            UPDATE orders
            SET
              status = $1,
              delivered_at = ${deliveredAt},
              version = version + 1,
              updated_at = NOW()
            WHERE id = $2
            RETURNING
              id,
              token_number,
              status,
              delivered_at,
              version,
              updated_at
          `,
          [status, id],
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
              'ORDER',
              $3,
              $4::jsonb
            )
          `,
          [
            req.user.id,
            `ORDER_${status}`,
            id,
            JSON.stringify({
              tokenNumber: order.token_number,
              previousStatus: order.status,
              newStatus: status,
            }),
          ],
        );

        await client.query("COMMIT");

broadcastRealtime("order-updated", {
  orderId: order.id,
  tokenNumber: order.token_number,
  status: updatedResult.rows[0].status,
});

return res.json({
  success: true,
  order: updatedResult.rows[0],
});
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Failed to update order status:", error);

      return res.status(500).json({
        success: false,
        error: "Failed to update order status",
      });
    }
  },
);

/**
 * PATCH /api/orders/:orderId/items/:orderItemId/cancel
 *
 * Cancels one complete order item.
 *
 * The original order total is NEVER reduced.
 * Instead:
 *
 * original total = historical gross
 * refund_total   = cumulative refunds
 * net sales      = total - refund_total
 *
 * Refund method:
 * CASH:
 *   Only allowed when original payment mode is CASH.
 *
 * ONLINE:
 *   Only allowed when original payment mode is ONLINE.
 *
 * BOTH:
 *   Staff must explicitly choose CASH or ONLINE.
 */

router.patch(
  "/:orderId/items/:orderItemId/cancel",
  requireAuth,
  requirePermission("EDIT_ORDER"),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: "Authentication required",
        });
      }

      const userId = req.user.id;

      const { orderId, orderItemId } = req.params;

      const {
        reason,
        note,
        refundMethod,
      } = req.body as {
        reason?: unknown;
        note?: unknown;
        refundMethod?: unknown;
      };

      const allowedReasons = [
        "CUSTOMER_CHANGED_MIND",
        "ITEM_NOT_REQUIRED",
        "WRONG_ITEM_SELECTED",
        "OTHER",
      ];

      if (
        typeof reason !== "string" ||
        !allowedReasons.includes(reason)
      ) {
        return res.status(400).json({
          success: false,
          error: "Invalid cancellation reason",
        });
      }

      if (
        note !== undefined &&
        note !== null &&
        typeof note !== "string"
      ) {
        return res.status(400).json({
          success: false,
          error: "Cancellation note must be text",
        });
      }

      if (
        refundMethod !== undefined &&
        refundMethod !== null &&
        refundMethod !== "CASH" &&
        refundMethod !== "ONLINE"
      ) {
        return res.status(400).json({
          success: false,
          error: "Invalid refund method",
        });
      }

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        // ----------------------------------------------------------
        // Lock the order
        // ----------------------------------------------------------

        const orderResult = await client.query(
          `
            SELECT
              id,
              token_number,
              status,
              total,
              refund_total,
              payment_mode,
              payment_status,
              version
            FROM orders
            WHERE id = $1
            FOR UPDATE
          `,
          [orderId],
        );

        if (orderResult.rowCount === 0) {
          await client.query("ROLLBACK");

          return res.status(404).json({
            success: false,
            error: "Order not found",
          });
        }

        const order = orderResult.rows[0];

        // ----------------------------------------------------------
        // Delivered orders are still protected from ordinary
        // editing. This endpoint is an explicit audited correction
        // flow, so cancellation can proceed.
        // ----------------------------------------------------------

        if (order.status === "CANCELLED") {
          await client.query("ROLLBACK");

          return res.status(409).json({
            success: false,
            error: "Order is already cancelled",
          });
        }

        // ----------------------------------------------------------
        // Validate refund method against original payment mode
        // ----------------------------------------------------------

        let finalRefundMethod: RefundMethod;

        if (order.payment_mode === "CASH") {
          if (
            refundMethod !== undefined &&
            refundMethod !== "CASH"
          ) {
            await client.query("ROLLBACK");

            return res.status(400).json({
              success: false,
              error:
                "A cash order can only be refunded in cash",
            });
          }

          finalRefundMethod = "CASH";
        } else if (order.payment_mode === "ONLINE") {
          if (
            refundMethod !== undefined &&
            refundMethod !== "ONLINE"
          ) {
            await client.query("ROLLBACK");

            return res.status(400).json({
              success: false,
              error:
                "An online order can only be refunded online",
            });
          }

          finalRefundMethod = "ONLINE";
        } else {
          // BOTH
          if (
            refundMethod !== "CASH" &&
            refundMethod !== "ONLINE"
          ) {
            await client.query("ROLLBACK");

            return res.status(400).json({
              success: false,
              error:
                "For BOTH payment mode, refundMethod must be CASH or ONLINE",
            });
          }

          finalRefundMethod = refundMethod;
        }

        // ----------------------------------------------------------
        // Lock the order item
        // ----------------------------------------------------------

        const itemResult = await client.query(
          `
            SELECT
              id,
              order_id,
              item_id,
              item_name_snapshot,
              unit_price_snapshot,
              quantity,
              item_total,
              status,
              cancellation_reason,
              cancellation_note
            FROM order_items
            WHERE id = $1
              AND order_id = $2
            FOR UPDATE
          `,
          [orderItemId, orderId],
        );

        if (itemResult.rowCount === 0) {
          await client.query("ROLLBACK");

          return res.status(404).json({
            success: false,
            error: "Order item not found",
          });
        }

        const orderItem = itemResult.rows[0];

        if (orderItem.status === "CANCELLED") {
          await client.query("ROLLBACK");

          return res.status(409).json({
            success: false,
            error: "Order item is already cancelled",
          });
        }

        // ----------------------------------------------------------
        // Calculate the exact refundable amount from historical
        // snapshots.
        // ----------------------------------------------------------

        const addonResult = await client.query(
          `
            SELECT
              COALESCE(SUM(addon_total), 0) AS addon_total
            FROM order_item_addons
            WHERE order_item_id = $1
          `,
          [orderItemId],
        );

        const itemBaseTotal = Number(
          orderItem.item_total,
        );

        const addonTotal = Number(
          addonResult.rows[0].addon_total,
        );

        const cancellationAmount =
          itemBaseTotal + addonTotal;

        const currentRefundTotal = Number(
          order.refund_total,
        );

        const originalOrderTotal = Number(
          order.total,
        );

        const remainingRefundableAmount =
          originalOrderTotal - currentRefundTotal;

        if (
          cancellationAmount <= 0 ||
          !Number.isFinite(cancellationAmount)
        ) {
          await client.query("ROLLBACK");

          return res.status(409).json({
            success: false,
            error:
              "Calculated cancellation amount is invalid",
          });
        }

        if (
          cancellationAmount >
          remainingRefundableAmount
        ) {
          await client.query("ROLLBACK");

          return res.status(409).json({
            success: false,
            error:
              "Cancellation amount exceeds the remaining refundable amount",
          });
        }

        const newRefundTotal =
          currentRefundTotal +
          cancellationAmount;

        // ----------------------------------------------------------
        // Cancel item.
        // Original item remains in the database.
        // ----------------------------------------------------------

        const updatedItemResult = await client.query(
          `
            UPDATE order_items
            SET
              status = 'CANCELLED',
              cancellation_reason = $1,
              cancellation_note = $2,
              cancelled_by = $3,
              cancelled_at = NOW(),
              updated_at = NOW()
            WHERE id = $4
            RETURNING
              id,
              order_id,
              item_id,
              item_name_snapshot,
              unit_price_snapshot,
              quantity,
              item_total,
              status,
              cancellation_reason,
              cancellation_note,
              cancelled_by,
              cancelled_at,
              updated_at
          `,
          [
            reason,
            typeof note === "string"
              ? note.trim() || null
              : null,
            userId,
            orderItemId,
          ],
        );

        // ----------------------------------------------------------
        // Update refund accounting.
        //
        // IMPORTANT:
        // total stays unchanged because it represents the original
        // gross sale.
        // ----------------------------------------------------------

        const updatedOrderResult = await client.query(
          `
            UPDATE orders
            SET
              refund_total = $1,
              payment_status =
                CASE
                  WHEN $1 >= total
                    THEN 'REFUNDED'::payment_status
                  WHEN $1 > 0
                    THEN 'PARTIAL_REFUND'::payment_status
                  ELSE payment_status
                END,
              version = version + 1,
              updated_at = NOW()
            WHERE id = $2
            RETURNING
              id,
              token_number,
              status,
              subtotal,
              total,
              refund_total,
              payment_mode,
              payment_status,
              version,
              updated_at
          `,
          [
            fromCents(
              toCents(newRefundTotal),
            ),
            orderId,
          ],
        );

        // ----------------------------------------------------------
        // Create refund record.
        // ----------------------------------------------------------

                const refundResult = await client.query(
        `
            INSERT INTO refunds (
            order_id,
            order_item_id,
            amount,
            method,
            reason,
            processed_by
            )
            VALUES (
            $1,
            $2,
            $3,
            $4::refund_method,
            $5,
            $6
            )
            RETURNING
            id,
            order_id,
            order_item_id,
            amount,
            method,
            reason,
            processed_by,
            created_at
        `,
        [
            orderId,
            orderItemId,
            fromCents(
            toCents(cancellationAmount),
            ),
            finalRefundMethod,
            `ITEM_CANCELLATION: ${reason}`,
            userId,
        ],
        );

        // ----------------------------------------------------------
        // Audit log
        // ----------------------------------------------------------

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
              'ORDER_ITEM_CANCELLED',
              'ORDER_ITEM',
              $2,
              $3::jsonb
            )
          `,
          [
            userId,
            orderItemId,
            JSON.stringify({
              orderId,
              tokenNumber: order.token_number,
              itemName:
                orderItem.item_name_snapshot,
              quantity: orderItem.quantity,
              amount: cancellationAmount,
              reason,
              note:
                typeof note === "string"
                  ? note.trim() || null
                  : null,
              refundMethod: finalRefundMethod,
              previousRefundTotal:
                currentRefundTotal,
              newRefundTotal,
            }),
          ],
        );

        await client.query("COMMIT");

broadcastRealtime("order-updated", {
  orderId: order.id,
  tokenNumber: order.token_number,
  status: updatedOrderResult.rows[0].status,
});

return res.json({
  success: true,
  order: updatedOrderResult.rows[0],
          item: updatedItemResult.rows[0],
          refund: refundResult.rows[0],
          cancellation: {
            amount: cancellationAmount,
            reason,
            note:
              typeof note === "string"
                ? note.trim() || null
                : null,
            refundMethod: finalRefundMethod,
          },
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(
        "Failed to cancel order item:",
        error,
      );

      return res.status(500).json({
        success: false,
        error: "Failed to cancel order item",
      });
    }
  },
);

/**
 * GET /api/orders/:id
 *
 * Gets one complete order including:
 * - order
 * - items
 * - add-ons
 * - payments
 */

router.get(
  "/:id",
  requireAuth,
  requirePermission("VIEW_ORDERS"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;

      const orderResult = await pool.query(
        `SELECT
           id,
           token_number,
           customer_name,
           customer_phone,
           status,
           subtotal,
           total,
           refund_total,
           payment_mode,
           payment_status,
           cash_received,
           online_received,
           change_amount,
           special_note,
           created_by,
           delivered_at,
           created_at,
           updated_at,
           version
         FROM orders
         WHERE id = $1
         LIMIT 1`,
        [id],
      );

      if (orderResult.rowCount === 0) {
        return res.status(404).json({
          success: false,
          error: "Order not found",
        });
      }

      const order = orderResult.rows[0];

      const itemsResult = await pool.query(
        `SELECT
           id,
           order_id,
           item_id,
           item_name_snapshot,
           unit_price_snapshot,
           quantity,
           item_total,
           status,
           cancellation_reason,
           cancellation_note,
           cancelled_by,
           cancelled_at,
           created_at,
           updated_at
         FROM order_items
         WHERE order_id = $1
         ORDER BY created_at ASC`,
        [id],
      );

      const items = [];

      for (const item of itemsResult.rows) {
        const addonsResult = await pool.query(
          `SELECT
             id,
             order_item_id,
             addon_id,
             addon_name_snapshot,
             unit_price_snapshot,
             quantity,
             addon_total,
             created_at
           FROM order_item_addons
           WHERE order_item_id = $1
           ORDER BY created_at ASC`,
          [item.id],
        );

        items.push({
          ...item,
          addons: addonsResult.rows,
        });
      }

      const paymentsResult = await pool.query(
        `SELECT
           id,
           order_id,
           mode,
           cash_amount,
           online_amount,
           change_amount,
           transaction_reference,
           payment_proof_path,
           created_by,
           created_at
         FROM payments
         WHERE order_id = $1
         ORDER BY created_at ASC`,
        [id],
      );

      return res.json({
        success: true,
        order,
        items,
        payments: paymentsResult.rows,
      });
    } catch (error) {
      console.error(
        "Failed to load order:",
        error,
      );

      return res.status(500).json({
        success: false,
        error: "Failed to load order",
      });
    }
  },
);

/**
 * POST /api/orders
 *
 * Creates a fully paid order atomically.
 */

router.post(
  "/",
  requireAuth,
  requirePermission("CREATE_ORDER"),
  async (req: AuthenticatedRequest, res) => {
    const client = await pool.connect();

    try {
      const {
        customerName,
        customerPhone,
        specialNote,
        items,
        payment: paymentBody,
      } = req.body as {
        customerName?: unknown;
        customerPhone?: unknown;
        specialNote?: unknown;
        items?: unknown;
        payment?: unknown;
      };

      // ------------------------------------------------------------
      // Basic request validation
      // ------------------------------------------------------------

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          error: "At least one order item is required",
        });
      }

      if (
        !paymentBody ||
        typeof paymentBody !== "object"
      ) {
        return res.status(400).json({
          success: false,
          error: "Payment information is required",
        });
      }

      const paymentInput =
        paymentBody as PaymentInput;

      if (
        paymentInput.mode !== "CASH" &&
        paymentInput.mode !== "ONLINE" &&
        paymentInput.mode !== "BOTH"
      ) {
        return res.status(400).json({
          success: false,
          error: "Invalid payment mode",
        });
      }

      if (
        customerName !== undefined &&
        customerName !== null &&
        typeof customerName !== "string"
      ) {
        return res.status(400).json({
          success: false,
          error: "Customer name must be text",
        });
      }

      if (
        customerPhone !== undefined &&
        customerPhone !== null &&
        typeof customerPhone !== "string"
      ) {
        return res.status(400).json({
          success: false,
          error: "Customer phone must be text",
        });
      }

      if (
        specialNote !== undefined &&
        specialNote !== null &&
        typeof specialNote !== "string"
      ) {
        return res.status(400).json({
          success: false,
          error: "Special note must be text",
        });
      }

      // ------------------------------------------------------------
      // Validate item request shape
      // ------------------------------------------------------------

      const normalizedItems: OrderInputItem[] = [];

      const seenItemIds = new Set<string>();

      for (const rawItem of items) {
        if (
          !rawItem ||
          typeof rawItem !== "object"
        ) {
          return res.status(400).json({
            success: false,
            error: "Invalid order item",
          });
        }

        const orderItem =
          rawItem as OrderInputItem;

        if (!isValidUuid(orderItem.itemId)) {
          return res.status(400).json({
            success: false,
            error: "Invalid item ID",
          });
        }

        if (
          !Number.isInteger(
            orderItem.quantity,
          ) ||
          orderItem.quantity <= 0
        ) {
          return res.status(400).json({
            success: false,
            error:
              "Item quantity must be a positive integer",
          });
        }

        if (orderItem.quantity > 999) {
          return res.status(400).json({
            success: false,
            error:
              "Item quantity is too large",
          });
        }

        if (
          seenItemIds.has(
            orderItem.itemId,
          )
        ) {
          return res.status(400).json({
            success: false,
            error:
              "The same food item cannot appear more than once in an order",
          });
        }

        seenItemIds.add(
          orderItem.itemId,
        );

        const addonIds =
          orderItem.addonIds ?? [];

        if (!Array.isArray(addonIds)) {
          return res.status(400).json({
            success: false,
            error:
              "addonIds must be an array",
          });
        }

        const seenAddonIds =
          new Set<string>();

        for (const addonId of addonIds) {
          if (!isValidUuid(addonId)) {
            return res.status(400).json({
              success: false,
              error:
                "Invalid add-on ID",
            });
          }

          if (
            seenAddonIds.has(addonId)
          ) {
            return res.status(400).json({
              success: false,
              error:
                "The same add-on cannot be selected twice",
            });
          }

          seenAddonIds.add(addonId);
        }

        normalizedItems.push({
          itemId: orderItem.itemId,
          quantity: orderItem.quantity,
          addonIds,
        });
      }

      // ------------------------------------------------------------
      // Validate payment amounts
      // ------------------------------------------------------------

      const cashReceived =
        paymentInput.cashReceived ===
        undefined
          ? 0
          : paymentInput.cashReceived;

      const onlineReceived =
        paymentInput.onlineReceived ===
        undefined
          ? 0
          : paymentInput.onlineReceived;

      if (!isValidMoney(cashReceived)) {
        return res.status(400).json({
          success: false,
          error: "Invalid cash amount",
        });
      }

      if (
        !isValidMoney(onlineReceived)
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid online amount",
        });
      }

      if (
        paymentInput.transactionReference !==
          undefined &&
        paymentInput.transactionReference !==
          null &&
        typeof paymentInput.transactionReference !==
          "string"
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Transaction reference must be text",
        });
      }

      if (
        paymentInput.paymentProofPath !==
          undefined &&
        paymentInput.paymentProofPath !==
          null &&
        typeof paymentInput.paymentProofPath !==
          "string"
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Payment proof path must be text",
        });
      }

      // ------------------------------------------------------------
      // Payment mode rules
      // ------------------------------------------------------------

      if (
        paymentInput.mode === "CASH"
      ) {
        if (
          cashReceived <= 0 ||
          onlineReceived !== 0
        ) {
          return res.status(400).json({
            success: false,
            error:
              "Cash payment requires cash received and no online amount",
          });
        }
      }

      if (
        paymentInput.mode === "ONLINE"
      ) {
        if (
          onlineReceived <= 0 ||
          cashReceived !== 0
        ) {
          return res.status(400).json({
            success: false,
            error:
              "Online payment requires online amount and no cash amount",
          });
        }

        if (
          !paymentInput.transactionReference?.trim() &&
          !paymentInput.paymentProofPath?.trim()
        ) {
          return res.status(400).json({
            success: false,
            error:
              "Online payment requires a transaction reference or payment proof",
          });
        }
      }

      if (
        paymentInput.mode === "BOTH"
      ) {
        if (
          cashReceived <= 0 ||
          onlineReceived <= 0
        ) {
          return res.status(400).json({
            success: false,
            error:
              "Both payment mode requires both cash and online amounts",
          });
        }

        if (
          !paymentInput.transactionReference?.trim() &&
          !paymentInput.paymentProofPath?.trim()
        ) {
          return res.status(400).json({
            success: false,
            error:
              "Online portion requires a transaction reference or payment proof",
          });
        }
      }

      // ------------------------------------------------------------
      // Start transaction
      // ------------------------------------------------------------

      await client.query("BEGIN");

      // ------------------------------------------------------------
      // Read current item prices
      // ------------------------------------------------------------

      const preparedItems: Array<{
        itemId: string;
        itemName: string;
        unitPriceCents: number;
        quantity: number;
        addonIds: string[];
        addons: Array<{
          addonId: string;
          addonName: string;
          unitPriceCents: number;
        }>;
        itemTotalCents: number;
        addonTotalCents: number;
      }> = [];

      let subtotalCents = 0;

      for (
        const requestedItem of normalizedItems
      ) {
        const itemResult =
          await client.query(
            `SELECT
               id,
               name,
               price
             FROM items
             WHERE id = $1
             LIMIT 1`,
            [requestedItem.itemId],
          );

        if (
          itemResult.rowCount === 0
        ) {
          throw new OrderValidationError(
            `Food item not found: ${requestedItem.itemId}`,
            400,
          );
        }

        const item =
          itemResult.rows[0];

        const unitPriceCents =
          toCents(Number(item.price));

        const itemTotalCents =
          unitPriceCents *
          requestedItem.quantity;

        const addons: Array<{
          addonId: string;
          addonName: string;
          unitPriceCents: number;
        }> = [];

        for (
          const addonId of
            requestedItem.addonIds
        ) {
          const addonResult =
            await client.query(
              `SELECT
                 a.id,
                 a.name,
                 a.price
               FROM item_addons ia
               INNER JOIN addons a
                 ON a.id = ia.addon_id
               WHERE ia.item_id = $1
                 AND ia.addon_id = $2
               LIMIT 1`,
              [
                requestedItem.itemId,
                addonId,
              ],
            );

          if (
            addonResult.rowCount ===
            0
          ) {
            throw new OrderValidationError(
              `Add-on is not available for item: ${addonId}`,
              400,
            );
          }

          const addon =
            addonResult.rows[0];

          addons.push({
            addonId: addon.id,
            addonName: addon.name,
            unitPriceCents:
              toCents(
                Number(addon.price),
              ),
          });
        }

        const addonTotalCents =
          addons.reduce(
            (total, addon) =>
              total +
              addon.unitPriceCents *
                requestedItem.quantity,
            0,
          );

        const lineTotalCents =
          itemTotalCents +
          addonTotalCents;

        subtotalCents +=
          lineTotalCents;

        preparedItems.push({
          itemId: item.id,
          itemName: item.name,
          unitPriceCents,
          quantity:
            requestedItem.quantity,
          addonIds:
            requestedItem.addonIds,
          addons,
          itemTotalCents,
          addonTotalCents,
        });
      }

      const totalCents =
        subtotalCents;

      // ------------------------------------------------------------
      // Validate payment against calculated total
      // ------------------------------------------------------------

      const cashCents =
        toCents(cashReceived);

      const onlineCents =
        toCents(onlineReceived);

      const receivedCents =
        cashCents + onlineCents;

      if (
        receivedCents <
        totalCents
      ) {
        throw new OrderValidationError(
          `Insufficient payment. Required ₹${fromCents(
            totalCents,
          )}, received ₹${fromCents(
            receivedCents,
          )}`,
          400,
        );
      }

      if (
        paymentInput.mode ===
          "ONLINE" &&
        onlineCents !==
          totalCents
      ) {
        throw new OrderValidationError(
          "Online payment must equal the order total",
          400,
        );
      }

      if (
        paymentInput.mode ===
          "CASH" &&
        cashCents <
          totalCents
      ) {
        throw new OrderValidationError(
          "Insufficient cash payment",
          400,
        );
      }

      const changeCents =
        receivedCents -
        totalCents;

      // ------------------------------------------------------------
      // Atomically reserve next token
      // ------------------------------------------------------------

      const tokenResult =
        await client.query(
          `SELECT last_token
           FROM token_counter
           WHERE id = true
           FOR UPDATE`,
        );

      if (
        tokenResult.rowCount ===
        0
      ) {
        throw new Error(
          "Token counter is not initialized",
        );
      }

      const nextToken =
        Number(
          tokenResult.rows[0]
            .last_token,
        ) + 1;

      await client.query(
        `UPDATE token_counter
         SET last_token = $1
         WHERE id = true`,
        [nextToken],
      );

      // ------------------------------------------------------------
      // Create order
      // ------------------------------------------------------------

      const orderResult =
        await client.query(
          `INSERT INTO orders (
             token_number,
             customer_name,
             customer_phone,
             status,
             subtotal,
             total,
             refund_total,
             payment_mode,
             payment_status,
             cash_received,
             online_received,
             change_amount,
             special_note,
             created_by
           )
           VALUES (
             $1,
             $2,
             $3,
             'PREPARING',
             $4,
             $4,
             0,
             $5,
             'PAID',
             $6,
             $7,
             $8,
             $9,
             $10
           )
           RETURNING
             id,
             token_number,
             customer_name,
             customer_phone,
             status,
             subtotal,
             total,
             refund_total,
             payment_mode,
             payment_status,
             cash_received,
             online_received,
             change_amount,
             special_note,
             created_by,
             delivered_at,
             created_at,
             updated_at,
             version`,
          [
            nextToken,
            typeof customerName ===
            "string"
              ? customerName.trim() ||
                null
              : null,
            typeof customerPhone ===
            "string"
              ? customerPhone.trim() ||
                null
              : null,
            fromCents(
              totalCents,
            ),
            paymentInput.mode,
            fromCents(
              cashCents,
            ),
            fromCents(
              onlineCents,
            ),
            fromCents(
              changeCents,
            ),
            typeof specialNote ===
            "string"
              ? specialNote.trim() ||
                null
              : null,
            req.user!.id,
          ],
        );

      const order =
        orderResult.rows[0];

      // ------------------------------------------------------------
      // Create order items and snapshots
      // ------------------------------------------------------------

      const createdItems = [];

      for (
        const preparedItem of
          preparedItems
      ) {
        const orderItemResult =
          await client.query(
            `INSERT INTO order_items (
               order_id,
               item_id,
               item_name_snapshot,
               unit_price_snapshot,
               quantity,
               item_total,
               status
             )
             VALUES (
               $1,
               $2,
               $3,
               $4,
               $5,
               $6,
               'ACTIVE'
             )
             RETURNING
               id,
               order_id,
               item_id,
               item_name_snapshot,
               unit_price_snapshot,
               quantity,
               item_total,
               status,
               created_at,
               updated_at`,
            [
              order.id,
              preparedItem.itemId,
              preparedItem.itemName,
              fromCents(
                preparedItem.unitPriceCents,
              ),
              preparedItem.quantity,
              fromCents(
                preparedItem.itemTotalCents,
              ),
            ],
          );

        const orderItem =
          orderItemResult.rows[0];

        const createdAddons = [];

        for (
          const addon of
            preparedItem.addons
        ) {
          const addonTotalCents =
            addon.unitPriceCents *
            preparedItem.quantity;

          const addonResult =
            await client.query(
              `INSERT INTO order_item_addons (
                 order_item_id,
                 addon_id,
                 addon_name_snapshot,
                 unit_price_snapshot,
                 quantity,
                 addon_total
               )
               VALUES (
                 $1,
                 $2,
                 $3,
                 $4,
                 $5,
                 $6
               )
               RETURNING
                 id,
                 order_item_id,
                 addon_id,
                 addon_name_snapshot,
                 unit_price_snapshot,
                 quantity,
                 addon_total,
                 created_at`,
              [
                orderItem.id,
                addon.addonId,
                addon.addonName,
                fromCents(
                  addon.unitPriceCents,
                ),
                preparedItem.quantity,
                fromCents(
                  addonTotalCents,
                ),
              ],
            );

          createdAddons.push(
            addonResult.rows[0],
          );
        }

        createdItems.push({
          ...orderItem,
          addons:
            createdAddons,
        });
      }

      // ------------------------------------------------------------
      // Create payment record
      // ------------------------------------------------------------

      const paymentResult =
        await client.query(
          `INSERT INTO payments (
             order_id,
             mode,
             cash_amount,
             online_amount,
             change_amount,
             transaction_reference,
             payment_proof_path,
             created_by
           )
           VALUES (
             $1,
             $2,
             $3,
             $4,
             $5,
             $6,
             $7,
             $8
           )
           RETURNING
             id,
             order_id,
             mode,
             cash_amount,
             online_amount,
             change_amount,
             transaction_reference,
             payment_proof_path,
             created_by,
             created_at`,
          [
            order.id,
            paymentInput.mode,
            fromCents(
              cashCents,
            ),
            fromCents(
              onlineCents,
            ),
            fromCents(
              changeCents,
            ),
            paymentInput.transactionReference?.trim() ||
              null,
            paymentInput.paymentProofPath?.trim() ||
              null,
            req.user!.id,
          ],
        );

      const payment =
        paymentResult.rows[0];

      // ------------------------------------------------------------
      // Audit log
      // ------------------------------------------------------------

      await client.query(
        `INSERT INTO activity_logs (
           user_id,
           action,
           entity_type,
           entity_id,
           details
         )
         VALUES (
           $1,
           'ORDER_CREATED',
           'ORDER',
           $2,
           $3::jsonb
         )`,
        [
          req.user!.id,
          order.id,
          JSON.stringify({
            token_number:
              order.token_number,
            total: order.total,
            payment_mode:
              paymentInput.mode,
            item_count:
              createdItems.length,
          }),
        ],
      );

     await client.query(
  "COMMIT",
);

broadcastRealtime("order-created", {
  orderId: order.id,
  tokenNumber: order.token_number,
});

return res.status(201).json({
        success: true,
        order,
        items: createdItems,
        payment,
      });
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      if (
        error instanceof
        OrderValidationError
      ) {
        return res
          .status(error.statusCode)
          .json({
            success: false,
            error: error.message,
          });
      }

      console.error(
        "Order creation failed:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to create order",
      });
    } finally {
      client.release();
    }
  },
);

class OrderValidationError extends Error {
  statusCode: number;

  constructor(
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.name =
      "OrderValidationError";
    this.statusCode =
      statusCode;
  }
}

export default router;