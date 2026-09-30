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
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

type DateFilter = {
  where: string;
  params: string[];
  from: string | null;
  to: string | null;
  all: boolean;
};

function parseDateFilter(req: AuthenticatedRequest): DateFilter {
  const all =
    req.query.all === "true" ||
    req.query.all === "1";

  const from =
    typeof req.query.from === "string"
      ? req.query.from
      : null;

  const to =
    typeof req.query.to === "string"
      ? req.query.to
      : null;

  if (from && !DATE_REGEX.test(from)) {
    throw new AuthError(
      "Invalid 'from' date. Use YYYY-MM-DD",
      400,
    );
  }

  if (to && !DATE_REGEX.test(to)) {
    throw new AuthError(
      "Invalid 'to' date. Use YYYY-MM-DD",
      400,
    );
  }

  if (!all && from && to && from > to) {
    throw new AuthError(
      "'from' date cannot be after 'to' date",
      400,
    );
  }

  /*
   * "all=true" means all recorded POS data.
   */
  if (all) {
    return {
      where: "",
      params: [],
      from: null,
      to: null,
      all: true,
    };
  }

  const effectiveFrom =
    from ??
    new Date().toISOString().slice(0, 10);

  const effectiveTo =
    to ??
    effectiveFrom;

  return {
    where: `
      WHERE o.created_at >= $1::date
        AND o.created_at < ($2::date + INTERVAL '1 day')
    `,
    params: [effectiveFrom, effectiveTo],
    from: effectiveFrom,
    to: effectiveTo,
    all: false,
  };
}

/*
 * GET /api/sales/summary
 *
 * Supported:
 *
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   ?all=true
 *
 * ACCOUNTING MODEL
 *
 * The orders table represents the current financial state of an order.
 *
 * For a completely cancelled order:
 *
 *   subtotal      = 75
 *   total         = 0
 *   refund_total  = 75
 *
 * Therefore:
 *
 *   Original Gross = total + refund_total
 *                 = 0 + 75
 *                 = 75
 *
 *   Net Sales      = Gross - Refunds
 *                 = 75 - 75
 *                 = 0
 *
 * This is important because cancelling an order must NOT erase
 * its original sales value from Gross Sales.
 *
 * For an active ₹75 order:
 *
 *   total         = 75
 *   refund_total  = 0
 *
 *   Gross = 75
 *   Refunds = 0
 *   Net = 75
 *
 * For an order reduced from ₹100 to ₹70 with ₹30 refunded:
 *
 *   total         = 70
 *   refund_total  = 30
 *
 *   Gross = 100
 *   Refunds = 30
 *   Net = 70
 *
 * This keeps the sales ledger historically correct.
 */
router.get(
  "/summary",
  requireAuth,
  requirePermission("VIEW_SALES"),
  async (req: AuthenticatedRequest, res) => {
    try {
      getUser(req);

      const filter = parseDateFilter(req);

      /*
       * Order-level sales ledger.
       *
       * IMPORTANT:
       *
       * Gross sales is NOT simply SUM(o.total).
       *
       * A fully cancelled/refunded order may have:
       *
       *   total = 0
       *   refund_total = original value
       *
       * Therefore:
       *
       *   gross = total + refund_total
       */
      const orderResult = await pool.query(
        `
        SELECT
          COUNT(*)::int AS total_orders,

          COUNT(*) FILTER (
            WHERE o.status = 'DELIVERED'
          )::int AS delivered_orders,

          COUNT(*) FILTER (
            WHERE o.status = 'PREPARING'
          )::int AS preparing_orders,

          COUNT(*) FILTER (
            WHERE o.status = 'READY'
          )::int AS ready_orders,

          COUNT(*) FILTER (
            WHERE o.status = 'CANCELLED'
          )::int AS cancelled_orders,

          /*
           * Original gross value before refunds.
           *
           * Example:
           *   total = 0
           *   refund_total = 75
           *   gross = 75
           */
          COALESCE(
            SUM(
              COALESCE(o.total, 0) +
              COALESCE(o.refund_total, 0)
            ),
            0
          ) AS gross_sales,

          /*
           * Total amount refunded.
           */
          COALESCE(
            SUM(COALESCE(o.refund_total, 0)),
            0
          ) AS refunds,

          /*
           * Current net value represented by orders.
           *
           * This is intentionally SUM(o.total), because the order's
           * total already represents the value remaining after refunds.
           */
          COALESCE(
            SUM(COALESCE(o.total, 0)),
            0
          ) AS net_sales

        FROM orders o
        ${filter.where}
        `,
        filter.params,
      );

      /*
       * PAYMENT LEDGER
       *
       * Payments are stored separately because an edited order may have
       * multiple successful payment records.
       *
       * We do NOT use orders.cash_received / orders.online_received here.
       *
       * We use the actual payment records.
       */
      const paymentFilter = filter.all
        ? ""
        : `
          INNER JOIN orders o
            ON o.id = p.order_id
          WHERE o.created_at >= $1::date
            AND o.created_at < ($2::date + INTERVAL '1 day')
        `;

      /*
       * REFUND LEDGER
       *
       * Refunds are filtered by when the refund was actually recorded.
       */
      const refundFilter = filter.all
        ? ""
        : `
          WHERE r.created_at >= $1::date
            AND r.created_at < ($2::date + INTERVAL '1 day')
        `;

      /*
       * Successful payment records.
       *
       * For cash:
       *
       *   cash retained = cash amount - change
       *
       * For online:
       *
       *   online retained = online amount
       */
      const paymentResult = await pool.query(
        `
        SELECT
          COALESCE(
            SUM(
              GREATEST(
                COALESCE(p.cash_amount, 0) -
                COALESCE(p.change_amount, 0),
                0
              ) +
              COALESCE(p.online_amount, 0)
            ),
            0
          ) AS retained_collection,

          COALESCE(
            SUM(
              GREATEST(
                COALESCE(p.cash_amount, 0) -
                COALESCE(p.change_amount, 0),
                0
              )
            ),
            0
          ) AS retained_cash,

          COALESCE(
            SUM(
              COALESCE(p.online_amount, 0)
            ),
            0
          ) AS retained_online

        FROM payments p
        ${paymentFilter}
        `,
        filter.params,
      );

      /*
       * REFUND LEDGER BY METHOD
       *
       * Cash refunds reduce cash collection.
       *
       * Online refunds reduce online collection.
       */
      const refundResult = await pool.query(
        `
        SELECT
          COALESCE(
            SUM(COALESCE(r.amount, 0)),
            0
          ) AS refund_total,

          COALESCE(
            SUM(
              CASE
                WHEN r.method = 'CASH'
                THEN COALESCE(r.amount, 0)
                ELSE 0
              END
            ),
            0
          ) AS cash_refunds,

          COALESCE(
            SUM(
              CASE
                WHEN r.method = 'ONLINE'
                THEN COALESCE(r.amount, 0)
                ELSE 0
              END
            ),
            0
          ) AS online_refunds

        FROM refunds r
        ${refundFilter}
        `,
        filter.params,
      );

      const orderSummary = orderResult.rows[0];
      const paymentSummary = paymentResult.rows[0];
      const refundSummary = refundResult.rows[0];

      /*
       * Convert PostgreSQL numeric values into JavaScript numbers.
       */
      const grossSales =
        Number(orderSummary.gross_sales);

      const refunds =
        Number(orderSummary.refunds);

      /*
       * The order ledger already knows the current net value.
       *
       * Using:
       *
       *   gross - refunds
       *
       * makes the accounting relationship explicit and ensures:
       *
       *   Gross = 75
       *   Refund = 75
       *   Net = 0
       */
      const netSales =
        grossSales - refunds;

      /*
       * Collections are actual money retained.
       *
       * Example:
       *
       *   Customer paid cash ₹75
       *   Refund cash ₹75
       *
       *   Cash collection = ₹75 - ₹75 = ₹0
       */
      const cashCollection =
        Number(paymentSummary.retained_cash) -
        Number(refundSummary.cash_refunds);

      const onlineCollection =
        Number(paymentSummary.retained_online) -
        Number(refundSummary.online_refunds);

      /*
       * Avoid tiny floating-point negative zero values.
       *
       * Example:
       *   -0.0000000001 -> 0
       */
      const cleanMoney = (value: number): number => {
        if (Math.abs(value) < 0.005) {
          return 0;
        }

        return Number(value.toFixed(2));
      };

      return res.json({
        success: true,

        period: {
          from: filter.from,
          to: filter.to,
          all: filter.all,
        },

        summary: {
          totalOrders: Number(
            orderSummary.total_orders,
          ),

          deliveredOrders: Number(
            orderSummary.delivered_orders,
          ),

          preparingOrders: Number(
            orderSummary.preparing_orders,
          ),

          readyOrders: Number(
            orderSummary.ready_orders,
          ),

          cancelledOrders: Number(
            orderSummary.cancelled_orders,
          ),

          grossSales: cleanMoney(grossSales),

          refunds: cleanMoney(refunds),

          netSales: cleanMoney(netSales),

          cashCollection: cleanMoney(
            cashCollection,
          ),

          onlineCollection: cleanMoney(
            onlineCollection,
          ),
        },
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
        });
      }

      console.error(
        "Sales summary error:",
        error,
      );

      return res.status(500).json({
        success: false,
        error: "Failed to load sales summary",
      });
    }
  },
);

/*
 * GET /api/sales/item-wise
 *
 * Item-wise reporting.
 *
 * ACTIVE item lines:
 *   quantitySold
 *   itemRevenue
 *
 * CANCELLED item lines:
 *   quantityCancelled
 *   cancelledValue
 */
router.get(
  "/item-wise",
  requireAuth,
  requirePermission("VIEW_REPORTS"),
  async (req: AuthenticatedRequest, res) => {
    try {
      getUser(req);

      const filter = parseDateFilter(req);

      const result = await pool.query(
        `
        SELECT
          oi.item_id,
          oi.item_name_snapshot AS item_name,

          COALESCE(
            SUM(
              CASE
                WHEN oi.status = 'ACTIVE'
                THEN oi.quantity
                ELSE 0
              END
            ),
            0
          )::int AS quantity_sold,

          COALESCE(
            SUM(
              CASE
                WHEN oi.status = 'ACTIVE'
                THEN oi.item_total
                ELSE 0
              END
            ),
            0
          ) AS item_revenue,

          COALESCE(
            SUM(
              CASE
                WHEN oi.status = 'CANCELLED'
                THEN oi.quantity
                ELSE 0
              END
            ),
            0
          )::int AS quantity_cancelled,

          COALESCE(
            SUM(
              CASE
                WHEN oi.status = 'CANCELLED'
                THEN oi.item_total
                ELSE 0
              END
            ),
            0
          ) AS cancelled_value

        FROM order_items oi

        INNER JOIN orders o
          ON o.id = oi.order_id

        ${
          filter.all
            ? ""
            : `
        WHERE o.created_at >= $1::date
          AND o.created_at < ($2::date + INTERVAL '1 day')
        `
        }

        GROUP BY
          oi.item_id,
          oi.item_name_snapshot

        ORDER BY
          item_revenue DESC,
          item_name ASC
        `,
        filter.params,
      );

      return res.json({
        success: true,

        period: {
          from: filter.from,
          to: filter.to,
          all: filter.all,
        },

        items: result.rows.map((row) => ({
          itemId: row.item_id,

          itemName: row.item_name,

          quantitySold: Number(
            row.quantity_sold,
          ),

          itemRevenue: Number(
            row.item_revenue,
          ),

          quantityCancelled: Number(
            row.quantity_cancelled,
          ),

          cancelledValue: Number(
            row.cancelled_value,
          ),
        })),
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
        });
      }

      console.error(
        "Item-wise sales error:",
        error,
      );

      return res.status(500).json({
        success: false,
        error: "Failed to load item-wise sales",
      });
    }
  },
);

/*
 * GET /api/sales/addon-wise
 *
 * Add-on reporting.
 */
router.get(
  "/addon-wise",
  requireAuth,
  requirePermission("VIEW_REPORTS"),
  async (req: AuthenticatedRequest, res) => {
    try {
      getUser(req);

      const filter = parseDateFilter(req);

      const result = await pool.query(
        `
        SELECT
          oia.addon_id,
          oia.addon_name_snapshot AS addon_name,

          COALESCE(
            SUM(
              CASE
                WHEN oi.status = 'ACTIVE'
                THEN oia.quantity
                ELSE 0
              END
            ),
            0
          )::int AS quantity_selected,

          COALESCE(
            SUM(
              CASE
                WHEN oi.status = 'ACTIVE'
                THEN oia.addon_total
                ELSE 0
              END
            ),
            0
          ) AS addon_revenue,

          COALESCE(
            SUM(
              CASE
                WHEN oi.status = 'CANCELLED'
                THEN oia.quantity
                ELSE 0
              END
            ),
            0
          )::int AS quantity_cancelled,

          COALESCE(
            SUM(
              CASE
                WHEN oi.status = 'CANCELLED'
                THEN oia.addon_total
                ELSE 0
              END
            ),
            0
          ) AS cancelled_value

        FROM order_item_addons oia

        INNER JOIN order_items oi
          ON oi.id = oia.order_item_id

        INNER JOIN orders o
          ON o.id = oi.order_id

        ${
          filter.all
            ? ""
            : `
        WHERE o.created_at >= $1::date
          AND o.created_at < ($2::date + INTERVAL '1 day')
        `
        }

        GROUP BY
          oia.addon_id,
          oia.addon_name_snapshot

        ORDER BY
          addon_revenue DESC,
          addon_name ASC
        `,
        filter.params,
      );

      return res.json({
        success: true,

        period: {
          from: filter.from,
          to: filter.to,
          all: filter.all,
        },

        addons: result.rows.map((row) => ({
          addonId: row.addon_id,

          addonName: row.addon_name,

          quantitySelected: Number(
            row.quantity_selected,
          ),

          addonRevenue: Number(
            row.addon_revenue,
          ),

          quantityCancelled: Number(
            row.quantity_cancelled,
          ),

          cancelledValue: Number(
            row.cancelled_value,
          ),
        })),
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
        });
      }

      console.error(
        "Add-on-wise sales error:",
        error,
      );

      return res.status(500).json({
        success: false,
        error: "Failed to load add-on sales",
      });
    }
  },
);

export default router;