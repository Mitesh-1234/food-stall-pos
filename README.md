# Food Stall POS — Firebase Starter

Mobile-first POS foundation using:
- Next.js + TypeScript
- Firebase Authentication (phone OTP)
- Cloud Firestore
- Cloud Functions for trusted mutations
- Firebase Storage
- Firestore realtime listeners

## Core security model

Firebase Auth identifies the user. The application creates one active session per user.

When a new device logs in:
1. A new session is created.
2. The user's previous session is invalidated.
3. The old client receives the invalidation through Firestore realtime.
4. The old client signs out.
5. Backend functions reject the old session even if its client has not yet received the realtime event.

Never perform financial/order mutations directly from the browser. Call the trusted Cloud Functions.

## Firestore collections

users/{uid}
sessions/{sessionId}
categories/{categoryId}
items/{itemId}
addons/{addonId}
orders/{orderId}
  /items/{orderItemId}
  /payments/{paymentId}
  /cancellations/{cancellationId}
  /refunds/{refundId}
dayClosings/{businessDate}
dailySummaries/{businessDate}
activityLogs/{logId}
config/tokenCounter

## Important invariants

- Order tokens are allocated server-side in a Firestore transaction.
- Tokens are never reused.
- Historical item/add-on names and prices are snapshotted into order items.
- Cancelled order items remain in history.
- Delivered orders are not normally editable.
- Financial mutations are audited.
- Permission checks happen server-side.
- Daily summaries are projections, not the financial source of truth.

## Setup

1. Create a Firebase project.
2. Enable Phone Authentication.
3. Create a Firestore database.
4. Create a Storage bucket.
5. Install Firebase CLI.
6. Configure the project ID in `.firebaserc`.
7. Install dependencies in `web/` and `functions/`.
8. Deploy rules/functions.

This starter intentionally leaves Firebase project credentials outside source control.
Copy `.env.example` to `.env.local` and fill the web Firebase config.
