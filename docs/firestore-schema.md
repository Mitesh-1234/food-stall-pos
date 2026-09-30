# Firestore Schema

## users/{uid}
```text
name
mobileE164
isActive
permissionCodes[]
activeSessionId
createdAt
updatedAt
```

Permission codes:
`CREATE_ORDER`, `VIEW_ORDERS`, `EDIT_ORDER`, `CANCEL_ORDER`,
`MARK_READY`, `MARK_DELIVERED`, `VIEW_SALES`, `VIEW_REPORTS`,
`MANAGE_ITEMS`, `MANAGE_ADDONS`, `MANAGE_USERS`,
`VIEW_ACTIVITY_LOGS`, `DAY_CLOSING`

## sessions/{sessionId}
```text
uid
deviceLabel
active
createdAt
lastSeenAt
invalidatedAt
invalidatedReason
```

## items/{itemId}
```text
name
categoryId
price
isActive
allowedAddonIds[]
createdAt
updatedAt
```

## addons/{addonId}
```text
name
price
isActive
createdAt
updatedAt
```

## orders/{orderId}
```text
tokenNumber
customerName
customerPhone
status: PREPARING | READY | DELIVERED | CANCELLED
paymentStatus
subtotal
totalAmount
refundTotal
paymentSummary
createdBy
createdAt
updatedAt
deliveredAt
version
```

## orders/{orderId}/items/{orderItemId}

Each order item stores immutable historical snapshots:
```text
itemId
itemName
unitPrice
quantity
addons[]:
  addonId
  name
  unitPrice
  quantity
  lineTotal
specialNote
status: ACTIVE | CANCELLED
lineTotal
cancellation
```

This means changing today's menu price does not rewrite yesterday's bill.

## payments / cancellations / refunds

Keep financial events append-oriented. Do not delete history.

## dailySummaries/{YYYY-MM-DD}

Server-maintained reporting projection:
```text
totalOrders
delivered
preparing
ready
cancelled
grossSales
refunds
netSales
cashCollection
onlineCollection
```

## dayClosings/{YYYY-MM-DD}
```text
expectedCash
actualCash
difference
closedBy
closedAt
```

## activityLogs/{logId}
```text
uid
action
entityType
entityId
details
createdAt
```

## config/tokenCounter
```text
nextToken
updatedAt
```
