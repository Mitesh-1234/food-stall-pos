import { Router } from "express";
import { pool } from "../db.js";
import {
  requireAuth,
  requirePermission,
  type AuthenticatedRequest,
} from "../middleware.js";
import { broadcastRealtime } from "../realtime.js";

const router = Router();

type EditAddon = {
  addonId: string;
  quantity: number;
};

type EditItem = {
  orderItemId?: string | null;
  itemId: string;
  quantity: number;
  addons?: EditAddon[];
};

type EditPayment = {
  mode?: "CASH" | "ONLINE" | "BOTH";
  cashReceived?: number;
  onlineReceived?: number;
  transactionReference?: string | null;
  paymentProofPath?: string | null;
};

class OrderEditError extends Error {
  statusCode: number;

  constructor(
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.name = "OrderEditError";
    this.statusCode = statusCode;
  }
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function cents(value: unknown) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.round(number * 100);
}

function money(value: number) {
  return (value / 100).toFixed(2);
}

function positiveInteger(value: unknown) {
  return (
    Number.isInteger(value) &&
    Number(value) > 0
  );
}

function normalizePayment(
  body: any,
): EditPayment | undefined {
  /*
   * Supports both:
   *
   * payment: {
   *   mode,
   *   cashReceived,
   *   onlineReceived,
   *   transactionReference,
   *   paymentProofPath
   * }
   *
   * and the existing frontend format.
   *
   * Keeping both formats here prevents a stale frontend build
   * from breaking the edit-payment request.
   *
   * paymentMode
   * cashReceived
   * onlineReceived
   * transactionReference
   * paymentProofPath
   */

  if (
    body?.payment &&
    typeof body.payment === "object"
  ) {
    return {
      mode: body.payment.mode,
      cashReceived:
        body.payment.cashReceived,
      onlineReceived:
        body.payment.onlineReceived,
      transactionReference:
        body.payment.transactionReference,
      paymentProofPath:
        body.payment.paymentProofPath,
    };
  }

  if (
    body?.paymentMode !== undefined ||
    body?.cashReceived !== undefined ||
    body?.onlineReceived !== undefined ||
    body?.transactionReference !== undefined ||
    body?.paymentProofPath !== undefined
  ) {
    return {
      mode: body.paymentMode,
      cashReceived:
        body.cashReceived,
      onlineReceived:
        body.onlineReceived,
      transactionReference:
        body.transactionReference,
      paymentProofPath:
        body.paymentProofPath,
    };
  }

  return undefined;
}

/*
 * GET /api/order-edit/catalog
 */
router.get(
  "/catalog",
  requireAuth,
  requirePermission("EDIT_ORDER"),
  async (_req: AuthenticatedRequest, res) => {
    try {
      const result = await pool.query(`
        SELECT
          i.id,
          i.name,
          i.price,
          i.category_id,
          c.name AS category_name,
          COALESCE(
            json_agg(
              json_build_object(
                'id', a.id,
                'name', a.name,
                'price', a.price
              )
              ORDER BY a.name
            )
            FILTER (WHERE a.id IS NOT NULL),
            '[]'::json
          ) AS addons
        FROM items i
        LEFT JOIN categories c
          ON c.id = i.category_id
        LEFT JOIN item_addons ia
          ON ia.item_id = i.id
        LEFT JOIN addons a
          ON a.id = ia.addon_id
        GROUP BY
          i.id,
          i.name,
          i.price,
          i.category_id,
          c.name
        ORDER BY i.name ASC
      `);

      return res.json({
        success: true,
        items: result.rows,
      });
    } catch (error) {
      console.error(
        "Failed to load edit catalog:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to load edit catalog",
      });
    }
  },
);

/*
 * PATCH /api/order-edit/:orderId
 */
router.patch(
  "/:orderId",
  requireAuth,
  requirePermission("EDIT_ORDER"),
  async (
    req: AuthenticatedRequest,
    res,
  ) => {
    const client =
      await pool.connect();

    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error:
            "Authentication required",
        });
      }

      const { orderId } =
        req.params;

      if (!isUuid(orderId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid order ID",
        });
      }

      const {
        version,
        items,
        refundMethod,
        customerName,
        customerPhone,
        specialNote,
      } = req.body as {
        version?: unknown;
        items?: unknown;
        refundMethod?:
          | "CASH"
          | "ONLINE";
        customerName?: unknown;
        customerPhone?: unknown;
        specialNote?: unknown;
      };

      const payment =
        normalizePayment(
          req.body,
        );

      if (
        customerName !== undefined &&
        customerName !== null &&
        typeof customerName !==
          "string"
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Customer name must be text",
        });
      }

      if (
        customerPhone !== undefined &&
        customerPhone !== null &&
        typeof customerPhone !==
          "string"
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Customer phone must be text",
        });
      }

      if (
        specialNote !== undefined &&
        specialNote !== null &&
        typeof specialNote !==
          "string"
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Special note must be text",
        });
      }

      if (
        !Array.isArray(items) ||
        items.length === 0
      ) {
        return res.status(400).json({
          success: false,
          error:
            "At least one item is required. To remove an item completely, use Cancel Item.",
        });
      }

      for (const entry of items) {
        const item =
          entry as EditItem;

        if (
          !isUuid(item.itemId)
        ) {
          return res.status(400).json({
            success: false,
            error:
              "Invalid item ID",
          });
        }

        if (
          !positiveInteger(
            item.quantity,
          )
        ) {
          return res.status(400).json({
            success: false,
            error:
              "Item quantity must be at least 1",
          });
        }

        if (
          item.addons !==
            undefined &&
          !Array.isArray(
            item.addons,
          )
        ) {
          return res.status(400).json({
            success: false,
            error:
              "Invalid add-ons",
          });
        }

        for (const addon of
          item.addons ?? []) {
          if (
            !isUuid(
              addon.addonId,
            ) ||
            !positiveInteger(
              addon.quantity,
            )
          ) {
            return res.status(400).json({
              success: false,
              error:
                "Invalid add-on",
            });
          }
        }
      }

      await client.query(
        "BEGIN",
      );

      /*
       * Lock order.
       */
      const orderResult =
        await client.query(
          `
            SELECT
              id,
              token_number,
              status,
              subtotal,
              total,
              refund_total,
              payment_mode,
              payment_status,
              cash_received,
              online_received,
              change_amount,
              customer_name,
              customer_phone,
              special_note,
              version
            FROM orders
            WHERE id = $1
            FOR UPDATE
          `,
          [orderId],
        );

      if (
        orderResult.rowCount ===
        0
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res.status(404).json({
          success: false,
          error:
            "Order not found",
        });
      }

      const order =
        orderResult.rows[0];

      /*
       * Delivered/cancelled orders
       * cannot be edited.
       */
      if (
        order.status !==
          "PREPARING" &&
        order.status !==
          "READY"
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res.status(409).json({
          success: false,
          error:
            order.status ===
            "DELIVERED"
              ? "Delivered orders cannot be edited"
              : "Cancelled orders cannot be edited",
        });
      }

      /*
       * Optimistic concurrency.
       */
      if (
        version !==
          undefined &&
        Number(version) !==
          Number(order.version)
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res.status(409).json({
          success: false,
          error:
            "This order was changed on another device. Refresh the order and try again.",
        });
      }

      /*
       * Existing order items.
       */
      const existingItemsResult =
        await client.query(
          `
            SELECT
              id,
              order_id,
              item_id,
              item_name_snapshot,
              unit_price_snapshot,
              quantity,
              item_total,
              status
            FROM order_items
            WHERE order_id = $1
            FOR UPDATE
          `,
          [orderId],
        );

      const existingItems =
        existingItemsResult.rows;

      const existingById =
        new Map<string, any>();

      for (const item of
        existingItems) {
        existingById.set(
          String(item.id),
          item,
        );
      }

      /*
       * Existing add-ons.
       */
      const existingAddonsResult =
        await client.query(
          `
            SELECT
              id,
              order_item_id,
              addon_id,
              addon_name_snapshot,
              unit_price_snapshot,
              quantity,
              addon_total
            FROM order_item_addons
            WHERE order_item_id IN (
              SELECT id
              FROM order_items
              WHERE order_id = $1
            )
            FOR UPDATE
          `,
          [orderId],
        );

      const existingAddons =
        existingAddonsResult.rows;

      const addonsByItem =
        new Map<
          string,
          any[]
        >();

      for (const addon of
        existingAddons) {
        const key =
          String(
            addon.order_item_id,
          );

        const list =
          addonsByItem.get(
            key,
          ) ?? [];

        list.push(addon);

        addonsByItem.set(
          key,
          list,
        );
      }

      /*
       * Existing active value.
       */
      let oldCurrentCents = 0;

      for (const item of
        existingItems) {
        if (
          item.status ===
          "CANCELLED"
        ) {
          continue;
        }

        oldCurrentCents +=
          cents(
            item.item_total,
          );

        for (const addon of
          addonsByItem.get(
            String(item.id),
          ) ?? []) {
          if (
            Number(
              addon.quantity,
            ) <= 0
          ) {
            continue;
          }

          oldCurrentCents +=
            cents(
              addon.addon_total,
            );
        }
      }

      /*
       * Build requested final state.
       */
      const requestedItems =
        items as EditItem[];

      const prepared = [];

      let newCurrentCents = 0;

      for (const requested of
        requestedItems) {
        let existing:
          | any
          | undefined;

        if (
          requested.orderItemId &&
          isUuid(
            requested.orderItemId,
          )
        ) {
          existing =
            existingById.get(
              String(
                requested.orderItemId,
              ),
            );

          if (!existing) {
            throw new OrderEditError(
              "The selected order item does not belong to this order.",
              400,
            );
          }

          if (
            existing.status ===
            "CANCELLED"
          ) {
            throw new OrderEditError(
              "A cancelled item cannot be edited.",
              409,
            );
          }
        }

        let itemName: string;
        let unitPriceCents: number;

        if (existing) {
          /*
           * Existing items preserve
           * their historical price.
           */
          itemName =
            existing.item_name_snapshot;

          unitPriceCents =
            cents(
              existing.unit_price_snapshot,
            );
        } else {
          /*
           * New items use current
           * menu price.
           */
          const menuResult =
            await client.query(
              `
                SELECT
                  id,
                  name,
                  price
                FROM items
                WHERE id = $1
                LIMIT 1
              `,
              [requested.itemId],
            );

          if (
            menuResult.rowCount ===
            0
          ) {
            throw new OrderEditError(
              "Food item not found.",
              400,
            );
          }

          itemName =
            menuResult.rows[0]
              .name;

          unitPriceCents =
            cents(
              menuResult.rows[0]
                .price,
            );
        }

        const itemTotalCents =
          unitPriceCents *
          requested.quantity;

        const existingAddonList =
          existing
            ? addonsByItem.get(
                String(
                  existing.id,
                ),
              ) ?? []
            : [];

        const existingAddonMap =
          new Map<
            string,
            any
          >();

        for (const addon of
          existingAddonList) {
          existingAddonMap.set(
            String(
              addon.addon_id,
            ),
            addon,
          );
        }

        const preparedAddons =
          [];

        let addonTotalCents =
          0;

        for (const requestedAddon of
          requested.addons ??
          []) {
          const oldAddon =
            existingAddonMap.get(
              String(
                requestedAddon.addonId,
              ),
            );

          let addonName: string;
          let addonPriceCents: number;

          if (oldAddon) {
            addonName =
              oldAddon.addon_name_snapshot;

            addonPriceCents =
              cents(
                oldAddon.unit_price_snapshot,
              );
          } else {
            const addonResult =
              await client.query(
                `
                  SELECT
                    a.id,
                    a.name,
                    a.price
                  FROM item_addons ia
                  INNER JOIN addons a
                    ON a.id = ia.addon_id
                  WHERE ia.item_id = $1
                    AND ia.addon_id = $2
                  LIMIT 1
                `,
                [
                  requested.itemId,
                  requestedAddon.addonId,
                ],
              );

            if (
              addonResult.rowCount ===
              0
            ) {
              throw new OrderEditError(
                `Add-on is not available for ${itemName}.`,
                400,
              );
            }

            addonName =
              addonResult.rows[0]
                .name;

            addonPriceCents =
              cents(
                addonResult.rows[0]
                  .price,
              );
          }

          /*
           * Add-on quantity is independent from the food-item
           * quantity in the Orders UI.
           *
           * Example:
           * Paneer Roll x2 + Extra Cheese x1
           * = (₹120 x 2) + (₹20 x 1)
           * = ₹260
           *
           * Do NOT multiply the add-on by requested.quantity.
           */
          const total =
            addonPriceCents *
            requestedAddon.quantity;

          addonTotalCents +=
            total;

          preparedAddons.push({
            addonId:
              requestedAddon.addonId,
            addonName,
            unitPriceCents:
              addonPriceCents,
            quantity:
              requestedAddon.quantity,
            addonTotalCents:
              total,
            oldAddon,
          });
        }

        newCurrentCents +=
          itemTotalCents +
          addonTotalCents;

        prepared.push({
          existing,
          requested,
          itemName,
          unitPriceCents,
          itemTotalCents,
          addons:
            preparedAddons,
        });
      }

      /*
       * Financial difference.
       */
      const differenceCents =
        newCurrentCents -
        oldCurrentCents;

      /*
       * ==========================================================
       * ADDITIONAL PAYMENT
       * ==========================================================
       */

      let additionalCashCents = 0;
      let additionalOnlineCents = 0;
      let additionalChangeCents = 0;

      if (
        differenceCents > 0
      ) {
        if (!payment) {
          throw new OrderEditError(
            `Additional payment required: ₹${money(
              differenceCents,
            )}.`,
            400,
          );
        }

        const mode =
          payment.mode;

        if (
          mode !== "CASH" &&
          mode !== "ONLINE" &&
          mode !== "BOTH"
        ) {
          throw new OrderEditError(
            "Select a valid payment mode.",
            400,
          );
        }

        additionalCashCents =
          cents(
            payment.cashReceived ??
              0,
          );

        additionalOnlineCents =
          cents(
            payment.onlineReceived ??
              0,
          );

        const received =
          additionalCashCents +
          additionalOnlineCents;

        /*
         * IMPORTANT:
         * Additional payment MUST be
         * exactly equal to the amount
         * required.
         *
         * No extra cash.
         * No extra online amount.
         * No change.
         */
        if (
          received !==
          differenceCents
        ) {
          throw new OrderEditError(
            `Payment amount must be exactly ₹${money(
              differenceCents,
            )}. Received ₹${money(
              received,
            )}.`,
            400,
          );
        }

        if (
          mode === "CASH"
        ) {
          if (
            additionalCashCents !==
              differenceCents ||
            additionalOnlineCents !==
              0
          ) {
            throw new OrderEditError(
              `Cash payment must be exactly ₹${money(
                differenceCents,
              )}.`,
              400,
            );
          }
        }

        if (
          mode === "ONLINE"
        ) {
          if (
            additionalOnlineCents !==
              differenceCents ||
            additionalCashCents !==
              0
          ) {
            throw new OrderEditError(
              `Online payment must be exactly ₹${money(
                differenceCents,
              )}.`,
              400,
            );
          }
        }

        if (
          mode === "BOTH"
        ) {
          if (
            additionalCashCents <=
              0 ||
            additionalOnlineCents <=
              0
          ) {
            throw new OrderEditError(
              "BOTH payment requires both cash and online amounts.",
              400,
            );
          }

          if (
            received !==
            differenceCents
          ) {
            throw new OrderEditError(
              `Cash + online payment must equal exactly ₹${money(
                differenceCents,
              )}.`,
              400,
            );
          }
        }

        /*
         * Online/BOTH verification:
         *
         * A payment-proof photo OR a transaction reference
         * is sufficient. If either one is supplied, do not
         * reject the payment for the other one being absent.
         *
         * This matches the Orders UI behavior:
         *   photo only              -> allowed
         *   transaction reference   -> allowed
         *   photo + reference       -> allowed
         *   neither                 -> rejected
         */
        if (
          mode === "ONLINE" ||
          mode === "BOTH"
        ) {
          const hasPaymentProof =
            typeof payment.paymentProofPath ===
              "string" &&
            payment.paymentProofPath.trim().length >
              0;

          const hasTransactionReference =
            typeof payment.transactionReference ===
              "string" &&
            payment.transactionReference.trim().length >
              0;

          if (
            !hasPaymentProof &&
            !hasTransactionReference
          ) {
            throw new OrderEditError(
              "Attach the online payment proof photo or enter the transaction reference.",
              400,
            );
          }
        }

        additionalChangeCents = 0;
      }

      /*
       * ==========================================================
       * REFUND
       * ==========================================================
       */

      let finalRefundMethod:
        | "CASH"
        | "ONLINE"
        | null = null;

      if (
        differenceCents < 0
      ) {
        if (
          order.payment_mode ===
          "CASH"
        ) {
          finalRefundMethod =
            "CASH";
        } else if (
          order.payment_mode ===
          "ONLINE"
        ) {
          finalRefundMethod =
            "ONLINE";
        } else {
          if (
            refundMethod !==
              "CASH" &&
            refundMethod !==
              "ONLINE"
          ) {
            throw new OrderEditError(
              "Choose a refund method.",
              400,
            );
          }

          finalRefundMethod =
            refundMethod;
        }
      }

      /*
       * ==========================================================
       * UPDATE ITEMS
       * ==========================================================
       */

      for (const entry of
        prepared) {
        if (entry.existing) {
          const existingId =
            entry.existing.id;

          await client.query(
            `
              UPDATE order_items
              SET
                quantity = $1,
                item_total = $2,
                updated_at = NOW()
              WHERE id = $3
                AND order_id = $4
            `,
            [
              entry.requested
                .quantity,
              money(
                entry.itemTotalCents,
              ),
              existingId,
              orderId,
            ],
          );

          const existingAddonList =
            addonsByItem.get(
              String(existingId),
            ) ?? [];

          const requestedAddonIds =
            new Set(
              entry.addons.map(
                (addon) =>
                  String(
                    addon.addonId,
                  ),
              ),
            );

          /*
           * Keep historical rows,
           * but make removed add-ons
           * zero quantity.
           */
          for (const oldAddon of
            existingAddonList) {
            if (
              !requestedAddonIds.has(
                String(
                  oldAddon.addon_id,
                ),
              )
            ) {
              await client.query(
                `
                  UPDATE order_item_addons
                  SET
                    quantity = 0,
                    addon_total = 0
                  WHERE id = $1
                `,
                [oldAddon.id],
              );
            }
          }

          for (const addon of
            entry.addons) {
            if (
              addon.oldAddon
            ) {
              await client.query(
                `
                  UPDATE order_item_addons
                  SET
                    quantity = $1,
                    addon_total = $2
                  WHERE id = $3
                `,
                [
                  addon.quantity,
                  money(
                    addon.addonTotalCents,
                  ),
                  addon.oldAddon.id,
                ],
              );
            } else {
              await client.query(
                `
                  INSERT INTO order_item_addons (
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
                `,
                [
                  existingId,
                  addon.addonId,
                  addon.addonName,
                  money(
                    addon.unitPriceCents,
                  ),
                  addon.quantity,
                  money(
                    addon.addonTotalCents,
                  ),
                ],
              );
            }
          }
        } else {
          /*
           * New food item.
           */
          const newItemResult =
            await client.query(
              `
                INSERT INTO order_items (
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
                RETURNING id
              `,
              [
                orderId,
                entry.requested
                  .itemId,
                entry.itemName,
                money(
                  entry.unitPriceCents,
                ),
                entry.requested
                  .quantity,
                money(
                  entry.itemTotalCents,
                ),
              ],
            );

          const newItemId =
            newItemResult
              .rows[0].id;

          for (const addon of
            entry.addons) {
            await client.query(
              `
                INSERT INTO order_item_addons (
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
              `,
              [
                newItemId,
                addon.addonId,
                addon.addonName,
                money(
                  addon.unitPriceCents,
                ),
                addon.quantity,
                money(
                  addon.addonTotalCents,
                ),
              ],
            );
          }
        }
      }

      /*
       * ==========================================================
       * UPDATE ORDER CUSTOMER / NOTE
       * ==========================================================
       */

      const newCustomerName =
        customerName !== undefined
          ? String(
              customerName ?? "",
            ).trim() || null
          : order.customer_name;

      const newCustomerPhone =
        customerPhone !== undefined
          ? String(
              customerPhone ?? "",
            ).trim() || null
          : order.customer_phone;

      const newSpecialNote =
        specialNote !== undefined
          ? String(
              specialNote ?? "",
            ).trim() || null
          : order.special_note;

      /*
       * ==========================================================
       * FINANCIAL UPDATE
       * ==========================================================
       */

      const currentTotalCents =
        cents(order.total);

      const currentRefundCents =
        cents(
          order.refund_total,
        );

      let newTotalCents =
        currentTotalCents;

      let newRefundTotalCents =
        currentRefundCents;

      if (
        differenceCents > 0
      ) {
        newTotalCents +=
          differenceCents;
      }

      if (
        differenceCents < 0
      ) {
        newRefundTotalCents +=
          Math.abs(
            differenceCents,
          );
      }

      const newCashReceivedCents =
        cents(
          order.cash_received,
        ) +
        additionalCashCents;

      const newOnlineReceivedCents =
        cents(
          order.online_received,
        ) +
        additionalOnlineCents;

      const newChangeCents =
        cents(
          order.change_amount,
        ) +
        additionalChangeCents;

      let finalPaymentMode =
        order.payment_mode;

      if (
        differenceCents > 0 &&
        payment?.mode
      ) {
        if (
          order.payment_mode !==
          payment.mode
        ) {
          finalPaymentMode =
            "BOTH";
        } else {
          finalPaymentMode =
            payment.mode;
        }
      }

      const updatedOrderResult =
        await client.query(
          `
            UPDATE orders
            SET
              customer_name = $1,
              customer_phone = $2,
              special_note = $3,
              subtotal = $4,
              total = $5,
              refund_total = $6,
              payment_mode = $7,
              payment_status = 'PAID',
              cash_received = $8,
              online_received = $9,
              change_amount = $10,
              version = version + 1,
              updated_at = NOW()
            WHERE id = $11
            RETURNING
              id,
              token_number,
              status,
              customer_name,
              customer_phone,
              special_note,
              subtotal,
              total,
              refund_total,
              payment_mode,
              payment_status,
              cash_received,
              online_received,
              change_amount,
              version,
              updated_at
          `,
          [
            newCustomerName,
            newCustomerPhone,
            newSpecialNote,
            money(
              newCurrentCents,
            ),
            money(
              newTotalCents,
            ),
            money(
              newRefundTotalCents,
            ),
            finalPaymentMode,
            money(
              newCashReceivedCents,
            ),
            money(
              newOnlineReceivedCents,
            ),
            money(
              newChangeCents,
            ),
            orderId,
          ],
        );

      /*
       * ==========================================================
       * NEW PAYMENT RECORD
       * ==========================================================
       *
       * IMPORTANT:
       * Never update the original payment.
       *
       * Every additional payment gets
       * its own row and its own proof.
       */

      let paymentRecord =
        null;

      if (
        differenceCents > 0 &&
        payment
      ) {
        const paymentResult =
          await client.query(
            `
              INSERT INTO payments (
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
                created_at
            `,
            [
              orderId,
              payment.mode,
              money(
                additionalCashCents,
              ),
              money(
                additionalOnlineCents,
              ),
              money(
                additionalChangeCents,
              ),
              payment.transactionReference
                ?.trim() || null,
              payment.paymentProofPath
                ?.trim() || null,
              req.user.id,
            ],
          );

        paymentRecord =
          paymentResult.rows[0];
      }

      /*
       * ==========================================================
       * REFUND RECORD
       * ==========================================================
       */

      let refundRecord =
        null;

      if (
        differenceCents < 0
      ) {
        const refundAmount =
          Math.abs(
            differenceCents,
          );

        const refundResult =
          await client.query(
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
              null,
              money(
                refundAmount,
              ),
              finalRefundMethod,
              "ORDER_EDIT_REDUCTION",
              req.user.id,
            ],
          );

        refundRecord =
          refundResult.rows[0];
      }

      /*
       * ==========================================================
       * AUDIT
       * ==========================================================
       */

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
            'ORDER_ITEMS_EDITED',
            'ORDER',
            $2,
            $3::jsonb
          )
        `,
        [
          req.user.id,
          orderId,
          JSON.stringify({
            tokenNumber:
              order.token_number,

            oldCurrentValue:
              money(
                oldCurrentCents,
              ),

            newCurrentValue:
              money(
                newCurrentCents,
              ),

            difference:
              money(
                Math.abs(
                  differenceCents,
                ),
              ),

            direction:
              differenceCents > 0
                ? "ADDITIONAL_PAYMENT"
                : differenceCents < 0
                  ? "REFUND"
                  : "NO_FINANCIAL_CHANGE",

            additionalPayment:
              payment ?? null,

            refundMethod:
              finalRefundMethod,

            noteUpdated:
              specialNote !==
              undefined,
          }),
        ],
      );

      await client.query(
        "COMMIT",
      );

      /*
       * Broadcast only after successful commit.
       */
      broadcastRealtime(
        "order-updated",
        {
          orderId,
          tokenNumber:
            order.token_number,
          status:
            updatedOrderResult
              .rows[0].status,
        },
      );

      return res.json({
        success: true,

        order:
          updatedOrderResult
            .rows[0],

        financial: {
          oldCurrentValue:
            Number(
              money(
                oldCurrentCents,
              ),
            ),

          newCurrentValue:
            Number(
              money(
                newCurrentCents,
              ),
            ),

          difference:
            Number(
              money(
                Math.abs(
                  differenceCents,
                ),
              ),
            ),

          direction:
            differenceCents > 0
              ? "ADDITIONAL_PAYMENT"
              : differenceCents < 0
                ? "REFUND"
                : "NO_CHANGE",
        },

        payment:
          paymentRecord,

        refund:
          refundRecord,
      });
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      if (
        error instanceof
        OrderEditError
      ) {
        return res.status(
          error.statusCode,
        ).json({
          success: false,
          error:
            error.message,
        });
      }

      console.error(
        "Order edit failed:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to edit order",
      });
    } finally {
      client.release();
    }
  },
);

export default router;