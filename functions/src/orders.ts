import {
  getFirestore,
  FieldValue,
} from "firebase-admin/firestore";

import {
  onCall,
  HttpsError,
} from "firebase-functions/v2/https";

import {
  requireActiveSession,
} from "./sessions.js";

const db = getFirestore();

type AddonInput = {
  addonId: string;
  quantity?: number;
};

type ItemInput = {
  itemId: string;
  quantity: number;
  addonIds?: AddonInput[];
  specialNote?: string;
};

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/* =========================================================
   CREATE ORDER
   ========================================================= */

export const createOrder = onCall(async (request) => {
  /*
   * Firebase authentication check
   */
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Login required."
    );
  }

  /*
   * Store UID in a local constant.
   * This avoids TypeScript's "possibly undefined"
   * error inside the transaction.
   */
  const uid = request.auth.uid;

  const {
    sessionId,
    customerName,
    customerPhone,
    items,
    payment,
  } = request.data ?? {};

  /*
   * Verify:
   * - user exists
   * - user is active
   * - this is the user's currently active device/session
   * - user has CREATE_ORDER permission
   */
  const user = await requireActiveSession(
    uid,
    sessionId,
    "CREATE_ORDER"
  );

  /*
   * Basic order validation
   */
  if (
    !customerName ||
    !customerPhone ||
    !Array.isArray(items) ||
    items.length === 0
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Customer and at least one item are required."
    );
  }

  /*
   * Create the order document ID now.
   * The actual order is written inside the transaction.
   */
  const orderRef =
    db.collection("orders").doc();

  /*
   * Global sequential token counter.
   */
  const tokenCounterRef =
    db.doc("config/tokenCounter");

  /*
   * Everything inside this transaction either
   * succeeds together or fails together.
   */
  const result = await db.runTransaction(
    async (tx) => {
      /*
       * Get current token number.
       */
      const counterSnap =
        await tx.get(tokenCounterRef);

      const nextToken = counterSnap.exists
        ? Number(
            counterSnap.data()?.nextToken ?? 1
          )
        : 1;

      let subtotal = 0;

      const resolvedItems: any[] = [];

      /*
       * Resolve every food item and add-on from
       * the current menu.
       *
       * The price/name is copied into the order as
       * a historical snapshot.
       */
      for (
        const input of items as ItemInput[]
      ) {
        /*
         * Validate quantity.
         */
        if (
          !input.itemId ||
          !Number.isInteger(
            input.quantity
          ) ||
          input.quantity <= 0
        ) {
          throw new HttpsError(
            "invalid-argument",
            "Invalid order item."
          );
        }

        /*
         * Get food item.
         */
        const itemSnap = await tx.get(
          db.doc(`items/${input.itemId}`)
        );

        if (
          !itemSnap.exists ||
          itemSnap.data()?.isActive !== true
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Selected item is unavailable."
          );
        }

        const item =
          itemSnap.data()!;

        const addonSnapshots: any[] = [];

        let addonTotal = 0;

        /*
         * Resolve selected add-ons.
         */
        for (
          const addonInput of
            input.addonIds ?? []
        ) {
          /*
           * Validate add-on quantity.
           */
          const addonQuantity =
            addonInput.quantity ?? 1;

          if (
            !Number.isInteger(
              addonQuantity
            ) ||
            addonQuantity <= 0
          ) {
            throw new HttpsError(
              "invalid-argument",
              "Invalid add-on quantity."
            );
          }

          /*
           * Get add-on.
           */
          const addonSnap =
            await tx.get(
              db.doc(
                `addons/${addonInput.addonId}`
              )
            );

          if (
            !addonSnap.exists ||
            addonSnap.data()?.isActive !== true
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Invalid add-on."
            );
          }

          const addon =
            addonSnap.data()!;

          /*
           * Make sure this add-on is actually
           * associated with the selected food item.
           */
          const allowed =
            Array.isArray(
              item.allowedAddonIds
            ) &&
            item.allowedAddonIds.includes(
              addonInput.addonId
            );

          if (!allowed) {
            throw new HttpsError(
              "failed-precondition",
              "Add-on is not allowed for this item."
            );
          }

          const addonUnitPrice =
            Number(addon.price ?? 0);

          const addonLineTotal =
            money(
              addonUnitPrice *
                addonQuantity
            );

          addonTotal +=
            addonLineTotal;

          /*
           * Historical add-on snapshot.
           */
          addonSnapshots.push({
            addonId:
              addonInput.addonId,

            name:
              String(addon.name ?? ""),

            unitPrice:
              addonUnitPrice,

            quantity:
              addonQuantity,

            lineTotal:
              addonLineTotal,
          });
        }

        /*
         * Food item price snapshot.
         */
        const itemUnitPrice =
          Number(item.price ?? 0);

        const itemLineTotal =
          money(
            itemUnitPrice *
              input.quantity +
              addonTotal
          );

        subtotal +=
          itemLineTotal;

        /*
         * Historical order-item snapshot.
         */
        resolvedItems.push({
          itemId:
            input.itemId,

          itemName:
            String(item.name ?? ""),

          unitPrice:
            itemUnitPrice,

          quantity:
            input.quantity,

          addons:
            addonSnapshots,

          specialNote:
            String(
              input.specialNote ?? ""
            ),

          status:
            "ACTIVE",

          lineTotal:
            itemLineTotal,
        });
      }

      subtotal = money(subtotal);

      /*
       * =====================================================
       * PAYMENT
       * =====================================================
       */

      const paymentMode =
        String(payment?.mode ?? "");

      if (
        ![
          "CASH",
          "ONLINE",
          "BOTH",
        ].includes(paymentMode)
      ) {
        throw new HttpsError(
          "invalid-argument",
          "Invalid payment mode."
        );
      }

      let cashReceived =
        money(
          Number(
            payment?.cashReceived ?? 0
          )
        );

      let onlineAmount =
        money(
          Number(
            payment?.onlineAmount ?? 0
          )
        );

      /*
       * Payment mode consistency.
       */
      if (paymentMode === "CASH") {
        onlineAmount = 0;
      }

      if (paymentMode === "ONLINE") {
        cashReceived = 0;
      }

      /*
       * Prevent negative payment values.
       */
      if (
        cashReceived < 0 ||
        onlineAmount < 0
      ) {
        throw new HttpsError(
          "invalid-argument",
          "Payment amounts cannot be negative."
        );
      }

      /*
       * Total money received.
       */
      const totalReceived =
        money(
          cashReceived +
            onlineAmount
        );

      /*
       * Customer must pay the full bill.
       */
      if (
        totalReceived < subtotal
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Insufficient payment."
        );
      }

      /*
       * Change/refund due to customer.
       */
      const changeAmount =
        money(
          totalReceived -
            subtotal
        );

      /*
       * =====================================================
       * CREATE ORDER
       * =====================================================
       */

      tx.set(orderRef, {
        /*
         * Sequential token.
         */
        tokenNumber:
          nextToken,

        /*
         * Customer information.
         */
        customerName:
          String(customerName),

        customerPhone:
          String(customerPhone),

        /*
         * New successful orders automatically
         * enter the kitchen in PREPARING state.
         */
        status:
          "PREPARING",

        /*
         * Payment has been successfully
         * confirmed by the backend.
         */
        paymentStatus:
          "PAID",

        /*
         * Financial values.
         */
        subtotal,

        totalAmount:
          subtotal,

        refundTotal:
          0,

        /*
         * Fast payment summary used by
         * dashboard/report screens.
         */
        paymentSummary: {
          mode:
            paymentMode,

          cashAmount:
            cashReceived,

          onlineAmount,

          totalReceived,

          changeAmount,
        },

        /*
         * Creator information.
         */
        createdBy:
          uid,

        createdByName:
          user.name ?? "",

        /*
         * Timestamps.
         */
        createdAt:
          FieldValue.serverTimestamp(),

        updatedAt:
          FieldValue.serverTimestamp(),

        /*
         * Optimistic concurrency version.
         */
        version:
          1,
      });

      /*
       * =====================================================
       * ORDER ITEMS
       * =====================================================
       */

      for (
        const item of resolvedItems
      ) {
        const orderItemRef =
          orderRef
            .collection("items")
            .doc();

        tx.set(
          orderItemRef,
          item
        );
      }

      /*
       * =====================================================
       * PAYMENT RECORD
       * =====================================================
       */

      const paymentRef =
        orderRef
          .collection("payments")
          .doc();

      tx.set(
        paymentRef,
        {
          mode:
            paymentMode,

          cashReceived,

          onlineAmount,

          totalReceived,

          changeAmount,

          /*
           * Payment proof path.
           *
           * The actual uploaded image should be
           * stored in Firebase Storage.
           */
          proofPath:
            payment?.proofPath ??
            null,

          status:
            "CONFIRMED",

          createdBy:
            uid,

          createdAt:
            FieldValue.serverTimestamp(),
        }
      );

      /*
       * =====================================================
       * TOKEN COUNTER
       * =====================================================
       *
       * If token 25 is created, nextToken becomes 26.
       *
       * If order 25 is later cancelled, token 25
       * remains permanently used.
       */

      tx.set(
        tokenCounterRef,
        {
          nextToken:
            nextToken + 1,

          updatedAt:
            FieldValue.serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      /*
       * =====================================================
       * AUDIT LOG
       * =====================================================
       */

      tx.create(
        db.collection(
          "activityLogs"
        ).doc(),
        {
          uid,

          action:
            "ORDER_CREATED",

          entityType:
            "ORDER",

          entityId:
            orderRef.id,

          details: {
            tokenNumber:
              nextToken,

            totalAmount:
              subtotal,

            paymentMode,
          },

          createdAt:
            FieldValue.serverTimestamp(),
        }
      );

      /*
       * Return useful information to the POS UI.
       */
      return {
        orderId:
          orderRef.id,

        tokenNumber:
          nextToken,

        totalAmount:
          subtotal,

        changeAmount,
      };
    }
  );

  return result;
});

/* =========================================================
   UPDATE ORDER STATUS
   ========================================================= */

export const updateOrderStatus = onCall(
  async (request) => {
    /*
     * Authentication check.
     */
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Login required."
      );
    }

    const uid =
      request.auth.uid;

    const {
      sessionId,
      orderId,
      nextStatus,
    } = request.data ?? {};

    /*
     * Determine required permission.
     */
    const permission =
      nextStatus === "READY"
        ? "MARK_READY"
        : nextStatus === "DELIVERED"
          ? "MARK_DELIVERED"
          : undefined;

    if (!permission) {
      throw new HttpsError(
        "invalid-argument",
        "Invalid status."
      );
    }

    /*
     * Verify active session + permission.
     */
    await requireActiveSession(
      uid,
      sessionId,
      permission
    );

    const orderRef =
      db.doc(`orders/${orderId}`);

    await db.runTransaction(
      async (tx) => {
        const snap =
          await tx.get(orderRef);

        if (!snap.exists) {
          throw new HttpsError(
            "not-found",
            "Order not found."
          );
        }

        const order =
          snap.data()!;

        /*
         * Status flow:
         *
         * PREPARING -> READY
         * READY -> DELIVERED
         */
        const expected =
          nextStatus === "READY"
            ? "PREPARING"
            : "READY";

        if (
          order.status !== expected
        ) {
          throw new HttpsError(
            "failed-precondition",
            `Order must be ${expected}.`
          );
        }

        const patch: any = {
          status:
            nextStatus,

          updatedAt:
            FieldValue.serverTimestamp(),

          version:
            Number(
              order.version ?? 1
            ) + 1,
        };

        /*
         * Store delivery timestamp.
         */
        if (
          nextStatus ===
          "DELIVERED"
        ) {
          patch.deliveredAt =
            FieldValue.serverTimestamp();
        }

        tx.update(
          orderRef,
          patch
        );

        /*
         * Audit log.
         */
        tx.create(
          db.collection(
            "activityLogs"
          ).doc(),
          {
            uid,

            action:
              `ORDER_${nextStatus}`,

            entityType:
              "ORDER",

            entityId:
              orderId,

            details: {
              previousStatus:
                order.status,

              newStatus:
                nextStatus,
            },

            createdAt:
              FieldValue.serverTimestamp(),
          }
        );
      }
    );

    return {
      ok: true,
    };
  }
);

/* =========================================================
   CANCEL ORDER ITEM
   ========================================================= */

export const cancelOrderItem =
  onCall(async (request) => {
    /*
     * Authentication check.
     */
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Login required."
      );
    }

    const uid =
      request.auth.uid;

    const {
      sessionId,
      orderId,
      orderItemId,
      reason,
      note = "",
    } = request.data ?? {};

    /*
     * Verify active session + permission.
     */
    await requireActiveSession(
      uid,
      sessionId,
      "CANCEL_ORDER"
    );

    /*
     * Cancellation reason is mandatory.
     */
    if (!reason) {
      throw new HttpsError(
        "invalid-argument",
        "Cancellation reason is required."
      );
    }

    const orderRef =
      db.doc(`orders/${orderId}`);

    const itemRef =
      orderRef
        .collection("items")
        .doc(orderItemId);

    await db.runTransaction(
      async (tx) => {
        const orderSnap =
          await tx.get(orderRef);

        const itemSnap =
          await tx.get(itemRef);

        if (
          !orderSnap.exists ||
          !itemSnap.exists
        ) {
          throw new HttpsError(
            "not-found",
            "Order or item not found."
          );
        }

        const order =
          orderSnap.data()!;

        const item =
          itemSnap.data()!;

        /*
         * Delivered orders require a separate
         * audited correction/refund process.
         */
        if (
          order.status ===
          "DELIVERED"
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Delivered orders require an explicit correction/refund flow."
          );
        }

        /*
         * Don't cancel an already cancelled item.
         */
        if (
          item.status ===
          "CANCELLED"
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Item is already cancelled."
          );
        }

        const cancellationAmount =
          Number(
            item.lineTotal ?? 0
          );

        /*
         * Mark the order item as cancelled.
         *
         * We DO NOT delete it.
         */
        tx.update(
          itemRef,
          {
            status:
              "CANCELLED",

            cancellation: {
              reason,

              note:
                String(note),

              cancelledBy:
                uid,

              cancelledAt:
                FieldValue.serverTimestamp(),
            },
          }
        );

        /*
         * Permanent cancellation history.
         */
        tx.create(
          orderRef
            .collection(
              "cancellations"
            )
            .doc(),
          {
            orderItemId,

            reason,

            note:
              String(note),

            amount:
              cancellationAmount,

            cancelledBy:
              uid,

            createdAt:
              FieldValue.serverTimestamp(),
          }
        );

        /*
         * Global audit log.
         */
        tx.create(
          db.collection(
            "activityLogs"
          ).doc(),
          {
            uid,

            action:
              "ORDER_ITEM_CANCELLED",

            entityType:
              "ORDER_ITEM",

            entityId:
              orderItemId,

            details: {
              orderId,

              reason,

              amount:
                cancellationAmount,
            },

            createdAt:
              FieldValue.serverTimestamp(),
          }
        );
      }
    );

    return {
      ok: true,
    };
  });