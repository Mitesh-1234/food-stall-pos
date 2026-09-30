# Architecture

Browser
  -> Firebase Auth (phone OTP)
  -> Firestore realtime listeners (read/synchronization)
  -> Cloud Functions (trusted mutations)
  -> Firestore transaction
  -> Storage (payment proof)

### Why this split?

Realtime listeners make the UI responsive, but realtime is not the authority for financial operations.

Cloud Functions are the authority for:
- token allocation
- payment confirmation
- order creation
- status transitions
- cancellations
- refunds
- permission checks
- active-session checks
- audit logging

### One active device

User A logs in on Phone 1:
`users/A.activeSessionId = S1`

User A logs in on Phone 2:
- create S2
- invalidate S1
- set activeSessionId = S2
- Phone 1's session listener signs it out
- any old Phone 1 mutation using S1 is rejected by the backend

Other users are unaffected.

### Offline behavior

The UI may display cached/read data, but financial confirmation must only be shown after the trusted backend succeeds.
