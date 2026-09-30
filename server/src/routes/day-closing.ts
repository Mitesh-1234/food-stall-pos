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

function getUser(
  req: AuthenticatedRequest,
): AuthenticatedUser {
  if (!req.user) {
    throw new AuthError(
      "Authentication required",
      401,
    );
  }

  return req.user;
}

function isValidDate(
  value: string,
) {
  return /^\d{4}-\d{2}-\d{2}$/.test(
    value,
  );
}

/**
 * GET /api/day-closing/summary?date=YYYY-MM-DD
 *
 * Returns the same accounting model used by
 * Sales/Reports:
 *
 * Gross Sales
 * = Net order value + refunds
 *
 * Refunds
 * = refund_total
 *
 * Net Sales
 * = order.total
 *
 * Cash Collection
 * = gross cash received - cash refunds
 *
 * Online Collection
 * = gross online received - online refunds
 *
 * Expected Cash
 * = cash after customer change - cash refunds
 */
router.get(
  "/summary",
  requireAuth,
  requirePermission("DAY_CLOSING"),
  async (
    req: AuthenticatedRequest,
    res,
  ) => {
    try {
      getUser(req);

      const date =
        typeof req.query.date ===
        "string"
          ? req.query.date
          : new Date()
              .toISOString()
              .slice(0, 10);

      if (!isValidDate(date)) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid date. Use YYYY-MM-DD",
        });
      }

      /*
       * Check whether this date has already
       * been closed.
       */
      const closingResult =
        await pool.query(
          `
          SELECT
            id,
            closing_date,
            total_orders,
            delivered_orders,
            cancelled_orders,
            gross_sales,
            refunds,
            net_sales,
            cash_collection,
            online_collection,
            expected_cash,
            actual_cash,
            difference,
            closed_by,
            closed_at
          FROM day_closings
          WHERE closing_date = $1
          LIMIT 1
          `,
          [date],
        );

      const existingClosing =
        closingResult.rows[0] ??
        null;

      /*
       * IMPORTANT:
       *
       * orders.total is the current/net
       * order value after refunds.
       *
       * Therefore:
       *
       * Gross = total + refund_total
       * Refund = refund_total
       * Net   = total
       */
      const orderResult =
        await pool.query(
          `
          SELECT
            COUNT(*)::int AS total_orders,

            COUNT(*) FILTER (
              WHERE status = 'DELIVERED'
            )::int AS delivered_orders,

            COUNT(*) FILTER (
              WHERE status = 'CANCELLED'
            )::int AS cancelled_orders,

            COALESCE(
              SUM(
                COALESCE(total, 0) +
                COALESCE(refund_total, 0)
              ),
              0
            ) AS gross_sales,

            COALESCE(
              SUM(
                COALESCE(refund_total, 0)
              ),
              0
            ) AS refunds,

            COALESCE(
              SUM(
                COALESCE(total, 0)
              ),
              0
            ) AS net_sales,

            COALESCE(
              SUM(
                COALESCE(cash_received, 0)
              ),
              0
            ) AS gross_cash_received,

            COALESCE(
              SUM(
                COALESCE(online_received, 0)
              ),
              0
            ) AS gross_online_received,

            COALESCE(
              SUM(
                COALESCE(cash_received, 0) -
                COALESCE(change_amount, 0)
              ),
              0
            ) AS cash_after_change

          FROM orders

          WHERE created_at >= $1::date
            AND created_at <
              ($1::date + INTERVAL '1 day')
          `,
          [date],
        );

      const orderRow =
        orderResult.rows[0];

      /*
       * Refunds split by actual refund method.
       *
       * CASH refunds reduce physical cash.
       *
       * ONLINE refunds reduce online collection.
       */
      const refundResult =
        await pool.query(
          `
          SELECT
            COALESCE(
              SUM(
                CASE
                  WHEN UPPER(method::text) = 'CASH'
                  THEN amount
                  ELSE 0
                END
              ),
              0
            ) AS cash_refunds,

            COALESCE(
              SUM(
                CASE
                  WHEN UPPER(method::text) = 'ONLINE'
                  THEN amount
                  ELSE 0
                END
              ),
              0
            ) AS online_refunds

          FROM refunds

          WHERE created_at >= $1::date
            AND created_at <
              ($1::date + INTERVAL '1 day')
          `,
          [date],
        );

      const cashRefunds =
        Number(
          refundResult.rows[0]
            .cash_refunds,
        );

      const onlineRefunds =
        Number(
          refundResult.rows[0]
            .online_refunds,
        );

      const grossCashReceived =
        Number(
          orderRow.gross_cash_received,
        );

      const grossOnlineReceived =
        Number(
          orderRow.gross_online_received,
        );

      const cashAfterChange =
        Number(
          orderRow.cash_after_change,
        );

      /*
       * Final payment collections.
       */
      const cashCollection =
        grossCashReceived -
        cashRefunds;

      const onlineCollection =
        grossOnlineReceived -
        onlineRefunds;

      /*
       * Physical cash expected in drawer.
       */
      const expectedCash =
        cashAfterChange -
        cashRefunds;

      return res.json({
        success: true,

        closingDate: date,

        alreadyClosed:
          Boolean(existingClosing),

        closing:
          existingClosing,

        summary: {
          totalOrders:
            Number(
              orderRow.total_orders,
            ),

          deliveredOrders:
            Number(
              orderRow.delivered_orders,
            ),

          cancelledOrders:
            Number(
              orderRow.cancelled_orders,
            ),

          grossSales:
            Number(
              orderRow.gross_sales,
            ),

          refunds:
            Number(
              orderRow.refunds,
            ),

          netSales:
            Number(
              orderRow.net_sales,
            ),

          cashCollection,

          onlineCollection,

          grossCashReceived,

          grossOnlineReceived,

          cashAfterChange,

          cashRefunds,

          onlineRefunds,

          expectedCash,
        },
      });
    } catch (error) {
      if (
        error instanceof AuthError
      ) {
        return res.status(
          error.statusCode,
        ).json({
          success: false,
          error: error.message,
        });
      }

      console.error(
        "Day closing summary error:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to load day closing summary",
      });
    }
  },
);

/**
 * POST /api/day-closing
 *
 * Finalizes the day with the actual
 * physical cash counted.
 */
router.post(
  "/",
  requireAuth,
  requirePermission("DAY_CLOSING"),
  async (
    req: AuthenticatedRequest,
    res,
  ) => {
    const client =
      await pool.connect();

    try {
      const user =
        getUser(req);

      const {
        closingDate,
        actualCash,
      } = req.body as {
        closingDate?:
          | string;
        actualCash?:
          | number
          | string;
      };

      const date =
        closingDate ??
        new Date()
          .toISOString()
          .slice(0, 10);

      if (!isValidDate(date)) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid closingDate. Use YYYY-MM-DD",
        });
      }

      if (
        actualCash ===
          undefined ||
        actualCash === null ||
        Number.isNaN(
          Number(actualCash),
        ) ||
        Number(actualCash) < 0
      ) {
        return res.status(400).json({
          success: false,
          error:
            "actualCash must be a non-negative number",
        });
      }

      const actualCashAmount =
        Number(actualCash);

      await client.query(
        "BEGIN",
      );

      /*
       * Only one closing is allowed
       * for a date.
       */
      const existing =
        await client.query(
          `
          SELECT
            id,
            closing_date,
            closed_at
          FROM day_closings
          WHERE closing_date = $1
          FOR UPDATE
          `,
          [date],
        );

      if (existing.rowCount) {
        await client.query(
          "ROLLBACK",
        );

        return res.status(409).json({
          success: false,
          error:
            "Day is already closed",
          closing:
            existing.rows[0],
        });
      }

      /*
       * Calculate the exact same
       * accounting values used by
       * the summary endpoint.
       */
      const orderResult =
        await client.query(
          `
          SELECT
            COUNT(*)::int AS total_orders,

            COUNT(*) FILTER (
              WHERE status = 'DELIVERED'
            )::int AS delivered_orders,

            COUNT(*) FILTER (
              WHERE status = 'CANCELLED'
            )::int AS cancelled_orders,

            COALESCE(
              SUM(
                COALESCE(total, 0) +
                COALESCE(refund_total, 0)
              ),
              0
            ) AS gross_sales,

            COALESCE(
              SUM(
                COALESCE(refund_total, 0)
              ),
              0
            ) AS refunds,

            COALESCE(
              SUM(
                COALESCE(total, 0)
              ),
              0
            ) AS net_sales,

            COALESCE(
              SUM(
                COALESCE(cash_received, 0)
              ),
              0
            ) AS gross_cash_received,

            COALESCE(
              SUM(
                COALESCE(online_received, 0)
              ),
              0
            ) AS gross_online_received,

            COALESCE(
              SUM(
                COALESCE(cash_received, 0) -
                COALESCE(change_amount, 0)
              ),
              0
            ) AS cash_after_change

          FROM orders

          WHERE created_at >= $1::date
            AND created_at <
              ($1::date + INTERVAL '1 day')
          `,
          [date],
        );

      const orderRow =
        orderResult.rows[0];

      /*
       * Refunds by payment method.
       */
      const refundResult =
        await client.query(
          `
          SELECT
            COALESCE(
              SUM(
                CASE
                  WHEN UPPER(method::text) = 'CASH'
                  THEN amount
                  ELSE 0
                END
              ),
              0
            ) AS cash_refunds,

            COALESCE(
              SUM(
                CASE
                  WHEN UPPER(method::text) = 'ONLINE'
                  THEN amount
                  ELSE 0
                END
              ),
              0
            ) AS online_refunds

          FROM refunds

          WHERE created_at >= $1::date
            AND created_at <
              ($1::date + INTERVAL '1 day')
          `,
          [date],
        );

      const cashRefunds =
        Number(
          refundResult.rows[0]
            .cash_refunds,
        );

      const onlineRefunds =
        Number(
          refundResult.rows[0]
            .online_refunds,
        );

      const grossCashReceived =
        Number(
          orderRow.gross_cash_received,
        );

      const grossOnlineReceived =
        Number(
          orderRow.gross_online_received,
        );

      const cashAfterChange =
        Number(
          orderRow.cash_after_change,
        );

      const cashCollection =
        grossCashReceived -
        cashRefunds;

      const onlineCollection =
        grossOnlineReceived -
        onlineRefunds;

      const expectedCash =
        cashAfterChange -
        cashRefunds;

      const difference =
        actualCashAmount -
        expectedCash;

      /*
       * Save the closing.
       */
      const insertResult =
        await client.query(
          `
          INSERT INTO day_closings (
            closing_date,
            total_orders,
            delivered_orders,
            cancelled_orders,
            gross_sales,
            refunds,
            net_sales,
            cash_collection,
            online_collection,
            expected_cash,
            actual_cash,
            difference,
            closed_by,
            closed_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            NOW()
          )
          RETURNING
            id,
            closing_date,
            total_orders,
            delivered_orders,
            cancelled_orders,
            gross_sales,
            refunds,
            net_sales,
            cash_collection,
            online_collection,
            expected_cash,
            actual_cash,
            difference,
            closed_by,
            closed_at
          `,
          [
            date,

            Number(
              orderRow.total_orders,
            ),

            Number(
              orderRow.delivered_orders,
            ),

            Number(
              orderRow.cancelled_orders,
            ),

            Number(
              orderRow.gross_sales,
            ),

            Number(
              orderRow.refunds,
            ),

            Number(
              orderRow.net_sales,
            ),

            cashCollection,

            onlineCollection,

            expectedCash,

            actualCashAmount,

            difference,

            user.id,
          ],
        );

      const closing =
        insertResult.rows[0];

      /*
       * Audit log.
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
          'DAY_CLOSING',
          'DAY_CLOSING',
          $2,
          $3::jsonb
        )
        `,
        [
          user.id,

          closing.id,

          JSON.stringify({
            closingDate: date,

            expectedCash,

            actualCash:
              actualCashAmount,

            difference,

            grossSales:
              Number(
                orderRow.gross_sales,
              ),

            refunds:
              Number(
                orderRow.refunds,
              ),

            netSales:
              Number(
                orderRow.net_sales,
              ),

            cashCollection,

            onlineCollection,

            cashRefunds,

            onlineRefunds,
          }),
        ],
      );

      await client.query(
        "COMMIT",
      );

      return res.status(201).json({
        success: true,
        closing,
      });
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      if (
        error instanceof AuthError
      ) {
        return res.status(
          error.statusCode,
        ).json({
          success: false,
          error: error.message,
        });
      }

      /*
       * Protect against a duplicate closing
       * if the database has a unique constraint.
       */
      if (
        typeof error ===
          "object" &&
        error !== null &&
        "code" in error &&
        (error as {
          code?: string;
        }).code === "23505"
      ) {
        return res.status(409).json({
          success: false,
          error:
            "Day is already closed",
        });
      }

      console.error(
        "Day closing error:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to close day",
      });
    } finally {
      client.release();
    }
  },
);

export default router;