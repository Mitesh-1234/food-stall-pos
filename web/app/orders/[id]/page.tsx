"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  clearAuthSession,
  getAuthToken,
  getUserName,
} from "../../../lib/auth-storage";

type Addon = {
  id: string;
  addon_name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  addon_total: number;
};

type OrderItem = {
  id: string;
  item_name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  item_total: number;
  status: string;
  cancellation_reason?: string | null;
  cancellation_note?: string | null;
  cancelled_at?: string | null;
  addons?: Addon[];
};

type Payment = {
  id: string;
  mode: string;
  cash_amount: number;
  online_amount: number;
  change_amount: number;
  transaction_reference?: string | null;
  payment_proof_path?: string | null;
  created_at: string;
};

type Order = {
  id: string;
  token_number: number;
  customer_name?: string | null;
  customer_phone?: string | null;
  status: string;
  subtotal: number;
  total: number;
  refund_total: number;
  payment_mode: string;
  payment_status: string;
  cash_received: number;
  online_received: number;
  change_amount: number;
  special_note?: string | null;
  created_at: string;
  updated_at: string;
  delivered_at?: string | null;
};

type OrderResponse = {
  success: boolean;
  order: Order;
  items: OrderItem[];
  payments: Payment[];
  error?: string;
};

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

function money(value: unknown) {
  const amount = Number(value ?? 0);

  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusColor(status: string) {
  switch (status.toUpperCase()) {
    case "PREPARING":
      return {
        background: "#fff7ed",
        color: "#c2410c",
      };

    case "READY":
      return {
        background: "#eff6ff",
        color: "#2563eb",
      };

    case "DELIVERED":
      return {
        background: "#ecfdf5",
        color: "#15803d",
      };

    case "CANCELLED":
      return {
        background: "#fef2f2",
        color: "#dc2626",
      };

    default:
      return {
        background: "#f1f5f9",
        color: "#475569",
      };
  }
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f5f7fa",
    padding: "16px",
    fontFamily:
      'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: "#111827",
    boxSizing: "border-box" as const,
  },

  container: {
    width: "100%",
    maxWidth: "1100px",
    margin: "0 auto",
  },

  topbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap" as const,
    background: "#ffffff",
    padding: "14px 16px",
    borderRadius: "14px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
    marginBottom: "16px",
  },

  backButton: {
    border: "1px solid #dbe1e8",
    background: "#ffffff",
    color: "#334155",
    borderRadius: "9px",
    padding: "9px 14px",
    fontSize: "14px",
    fontWeight: 700,
    cursor: "pointer",
  },

  topTitle: {
    fontSize: "18px",
    fontWeight: 800,
    margin: 0,
  },

  card: {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "18px",
    marginBottom: "16px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
  },

  hero: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    flexWrap: "wrap" as const,
  },

  token: {
    fontSize: "32px",
    fontWeight: 900,
    margin: 0,
    color: "#111827",
  },

  tokenLabel: {
    color: "#64748b",
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },

  status: {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 11px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 800,
  },

  infoGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(3, minmax(0, 1fr))",
    gap: "12px",
    marginTop: "18px",
  },

  infoBox: {
    background: "#f8fafc",
    borderRadius: "11px",
    padding: "13px",
  },

  infoLabel: {
    color: "#64748b",
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
  },

  infoValue: {
    marginTop: "5px",
    color: "#111827",
    fontSize: "14px",
    fontWeight: 700,
    wordBreak: "break-word" as const,
  },

  sectionTitle: {
    margin: "0 0 14px",
    fontSize: "18px",
    fontWeight: 800,
  },

  item: {
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "14px",
    marginBottom: "10px",
  },

  itemTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
  },

  itemName: {
    fontSize: "15px",
    fontWeight: 800,
  },

  quantity: {
    display: "inline-block",
    marginTop: "5px",
    padding: "4px 8px",
    borderRadius: "6px",
    background: "#f1f5f9",
    color: "#475569",
    fontSize: "12px",
    fontWeight: 700,
  },

  addonBox: {
    marginTop: "10px",
    paddingTop: "10px",
    borderTop: "1px solid #f1f5f9",
  },

  addon: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    padding: "4px 0",
    color: "#64748b",
    fontSize: "13px",
  },

  cancelled: {
    background: "#fef2f2",
    borderColor: "#fecaca",
  },

  cancelledBadge: {
    display: "inline-block",
    marginTop: "7px",
    padding: "4px 7px",
    borderRadius: "6px",
    background: "#fee2e2",
    color: "#b91c1c",
    fontSize: "10px",
    fontWeight: 800,
  },

  note: {
    background: "#fffbeb",
    border: "1px solid #fde68a",
    borderRadius: "11px",
    padding: "13px",
    color: "#92400e",
    fontSize: "14px",
    lineHeight: 1.5,
  },

  paymentGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(3, minmax(0, 1fr))",
    gap: "12px",
  },

  paymentBox: {
    background: "#f8fafc",
    borderRadius: "11px",
    padding: "14px",
  },

  paymentLabel: {
    color: "#64748b",
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
  },

  paymentValue: {
    marginTop: "5px",
    fontSize: "18px",
    fontWeight: 800,
    color: "#111827",
  },

  proofSection: {
    marginTop: "16px",
    borderTop: "1px solid #e5e7eb",
    paddingTop: "16px",
  },

  proofButton: {
    border: 0,
    cursor: "pointer",
    background: "#111827",
    color: "#ffffff",
    borderRadius: "9px",
    padding: "10px 15px",
    fontSize: "13px",
    fontWeight: 700,
  },

  proofImage: {
    display: "block",
    width: "100%",
    maxWidth: "500px",
    maxHeight: "600px",
    objectFit: "contain" as const,
    marginTop: "12px",
    borderRadius: "12px",
    border: "1px solid #e5e7eb",
    background: "#f8fafc",
  },

  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "15px",
    padding: "10px 0",
    borderBottom: "1px solid #f1f5f9",
    fontSize: "14px",
  },

  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "15px",
    paddingTop: "14px",
    fontSize: "18px",
    fontWeight: 900,
  },

  loading: {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "50px",
    textAlign: "center" as const,
    color: "#64748b",
  },

  error: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#b91c1c",
    borderRadius: "12px",
    padding: "14px",
    fontSize: "14px",
    fontWeight: 600,
  },

  modal: {
    position: "fixed" as const,
    inset: 0,
    zIndex: 1000,
    background: "rgba(0,0,0,0.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
  },

  modalContent: {
    position: "relative" as const,
    maxWidth: "900px",
    maxHeight: "90vh",
    width: "100%",
    background: "#ffffff",
    borderRadius: "14px",
    padding: "14px",
    overflow: "auto",
  },

  modalClose: {
    position: "absolute" as const,
    top: "10px",
    right: "10px",
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    border: 0,
    background: "#111827",
    color: "#ffffff",
    fontSize: "20px",
    cursor: "pointer",
    zIndex: 2,
  },

  modalImage: {
    display: "block",
    width: "100%",
    maxHeight: "82vh",
    objectFit: "contain" as const,
    borderRadius: "8px",
    background: "#f8fafc",
  },
};

export default function OrderDetailsPage({
  params,
}: PageProps) {
  const [orderId, setOrderId] =
    useState<string>("");

  const [order, setOrder] =
    useState<Order | null>(null);

  const [items, setItems] =
    useState<OrderItem[]>([]);

  const [payments, setPayments] =
    useState<Payment[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [proofImage, setProofImage] =
    useState<string | null>(null);

  const [userName, setUserName] =
    useState("");

  useEffect(() => {
    params.then((value) => {
      setOrderId(value.id);
    });
  }, [params]);

  useEffect(() => {
    setUserName(
      getUserName() || "Staff",
    );
  }, []);

  useEffect(() => {
    if (!orderId) return;

    async function loadOrder() {
      const token =
        getAuthToken();

      if (!token) {
        window.location.href =
          "/login";
        return;
      }

      setLoading(true);
      setError("");

      try {
        const apiBase =
          process.env
            .NEXT_PUBLIC_API_BASE_URL ||
          "http://127.0.0.1:4000";

        const response =
          await fetch(
            `${apiBase}/api/orders/${encodeURIComponent(
              orderId,
            )}`,
            {
              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            },
          );

        if (
          response.status === 401
        ) {
          clearAuthSession();
          window.location.href =
            "/login";
          return;
        }

        const data =
          (await response.json()) as OrderResponse;

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.error ||
              "Failed to load order.",
          );
        }

        setOrder(data.order);
        setItems(
          data.items || [],
        );
        setPayments(
          data.payments || [],
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load order.",
        );
      } finally {
        setLoading(false);
      }
    }

    loadOrder();
  }, [orderId]);

  const payment = payments[0];

  const activeItems =
    useMemo(
      () =>
        items.filter(
          (item) =>
            String(
              item.status,
            ).toUpperCase() !==
            "CANCELLED",
        ),
      [items],
    );

  const calculatedItemsTotal =
    useMemo(() => {
      return items.reduce(
        (total, item) => {
          return (
            total +
            Number(
              item.item_total ||
                0,
            )
          );
        },
        0,
      );
    }, [items]);

  function openProof(
    path?: string | null,
  ) {
    if (!path) return;

    setProofImage(path);
  }

  if (loading) {
    return (
      <main style={styles.page}>
        <div
          style={styles.container}
        >
          <div
            style={styles.loading}
          >
            Loading order details...
          </div>
        </div>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main style={styles.page}>
        <div
          style={styles.container}
        >
          <div
            style={styles.topbar}
          >
            <button
              type="button"
              style={
                styles.backButton
              }
              onClick={() =>
                window.location.href =
                  "/orders"
              }
            >
              ← Back to Orders
            </button>
          </div>

          <div
            style={styles.error}
          >
            {error ||
              "Order not found."}
          </div>
        </div>
      </main>
    );
  }

  const statusStyle =
    statusColor(
      order.status,
    );

  return (
    <main style={styles.page}>
      <div
        style={styles.container}
      >
        {/* Header */}
        <div
          style={styles.topbar}
        >
          <button
            type="button"
            style={
              styles.backButton
            }
            onClick={() =>
              window.location.href =
                "/orders"
            }
          >
            ← Back to Orders
          </button>

          <div
            style={{
              textAlign: "right",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                color: "#64748b",
              }}
            >
              Logged in as
            </div>

            <div
              style={{
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              {userName}
            </div>
          </div>
        </div>

        {/* Order Header */}
        <section
          style={styles.card}
        >
          <div
            style={styles.hero}
          >
            <div>
              <div
                style={
                  styles.tokenLabel
                }
              >
                Token Number
              </div>

              <h1
                style={styles.token}
              >
                #{order.token_number}
              </h1>
            </div>

            <div>
              <span
                style={{
                  ...styles.status,
                  background:
                    statusStyle.background,
                  color:
                    statusStyle.color,
                }}
              >
                {order.status}
              </span>
            </div>
          </div>

          <div
            style={styles.infoGrid}
          >
            <div
              style={
                styles.infoBox
              }
            >
              <div
                style={
                  styles.infoLabel
                }
              >
                Customer
              </div>

              <div
                style={
                  styles.infoValue
                }
              >
                {order.customer_name ||
                  "Walk-in Customer"}
              </div>
            </div>

            <div
              style={
                styles.infoBox
              }
            >
              <div
                style={
                  styles.infoLabel
                }
              >
                Phone
              </div>

              <div
                style={
                  styles.infoValue
                }
              >
                {order.customer_phone ||
                  "-"}
              </div>
            </div>

            <div
              style={
                styles.infoBox
              }
            >
              <div
                style={
                  styles.infoLabel
                }
              >
                Created
              </div>

              <div
                style={
                  styles.infoValue
                }
              >
                {formatDateTime(
                  order.created_at,
                )}
              </div>
            </div>

            <div
              style={
                styles.infoBox
              }
            >
              <div
                style={
                  styles.infoLabel
                }
              >
                Payment Mode
              </div>

              <div
                style={
                  styles.infoValue
                }
              >
                {order.payment_mode}
              </div>
            </div>

            <div
              style={
                styles.infoBox
              }
            >
              <div
                style={
                  styles.infoLabel
                }
              >
                Payment Status
              </div>

              <div
                style={
                  styles.infoValue
                }
              >
                {order.payment_status}
              </div>
            </div>

            <div
              style={
                styles.infoBox
              }
            >
              <div
                style={
                  styles.infoLabel
                }
              >
                Delivered
              </div>

              <div
                style={
                  styles.infoValue
                }
              >
                {formatDateTime(
                  order.delivered_at,
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Items */}
        <section
          style={styles.card}
        >
          <h2
            style={
              styles.sectionTitle
            }
          >
            Order Details
          </h2>

          {items.length === 0 ? (
            <div
              style={{
                color: "#64748b",
                fontSize: "14px",
              }}
            >
              No items found.
            </div>
          ) : (
            items.map((item) => {
              const cancelled =
                String(
                  item.status,
                ).toUpperCase() ===
                "CANCELLED";

              return (
                <div
                  key={item.id}
                  style={{
                    ...styles.item,
                    ...(cancelled
                      ? styles.cancelled
                      : {}),
                  }}
                >
                  <div
                    style={
                      styles.itemTop
                    }
                  >
                    <div>
                      <div
                        style={
                          styles.itemName
                        }
                      >
                        {
                          item.item_name_snapshot
                        }
                      </div>

                      <div
                        style={
                          styles.quantity
                        }
                      >
                        ×{" "}
                        {item.quantity}
                      </div>

                      {cancelled && (
                        <div
                          style={
                            styles.cancelledBadge
                          }
                        >
                          CANCELLED
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: "15px",
                      }}
                    >
                      {money(
                        item.item_total,
                      )}
                    </div>
                  </div>

                  {item.addons &&
                    item.addons.length >
                      0 && (
                      <div
                        style={
                          styles.addonBox
                        }
                      >
                        {item.addons.map(
                          (addon) => (
                            <div
                              key={
                                addon.id
                              }
                              style={
                                styles.addon
                              }
                            >
                              <span>
                                +{" "}
                                {
                                  addon.addon_name_snapshot
                                }{" "}
                                ×{" "}
                                {
                                  addon.quantity
                                }
                              </span>

                              <strong>
                                {money(
                                  addon.addon_total,
                                )}
                              </strong>
                            </div>
                          ),
                        )}
                      </div>
                    )}

                  {cancelled &&
                    (item.cancellation_reason ||
                      item.cancellation_note) && (
                      <div
                        style={{
                          marginTop:
                            "10px",
                          fontSize:
                            "12px",
                          color:
                            "#991b1b",
                        }}
                      >
                        <strong>
                          Cancellation:
                        </strong>{" "}
                        {item.cancellation_reason ||
                          "Other"}

                        {item.cancellation_note
                          ? ` — ${item.cancellation_note}`
                          : ""}
                      </div>
                    )}
                </div>
              );
            })
          )}
        </section>

        {/* Special Note */}
        {order.special_note && (
          <section
            style={styles.card}
          >
            <h2
              style={
                styles.sectionTitle
              }
            >
              Special Note
            </h2>

            <div
              style={styles.note}
            >
              {order.special_note}
            </div>
          </section>
        )}

        {/* Payment */}
        <section
          style={styles.card}
        >
          <h2
            style={
              styles.sectionTitle
            }
          >
            Payment Details
          </h2>

          <div
            style={styles.paymentGrid}
          >
            <div
              style={
                styles.paymentBox
              }
            >
              <div
                style={
                  styles.paymentLabel
                }
              >
                Payment Mode
              </div>

              <div
                style={
                  styles.paymentValue
                }
              >
                {order.payment_mode}
              </div>
            </div>

            <div
              style={
                styles.paymentBox
              }
            >
              <div
                style={
                  styles.paymentLabel
                }
              >
                Cash Paid
              </div>

              <div
                style={
                  styles.paymentValue
                }
              >
                {money(
                  order.cash_received,
                )}
              </div>
            </div>

            <div
              style={
                styles.paymentBox
              }
            >
              <div
                style={
                  styles.paymentLabel
                }
              >
                Online Paid
              </div>

              <div
                style={
                  styles.paymentValue
                }
              >
                {money(
                  order.online_received,
                )}
              </div>
            </div>

            <div
              style={
                styles.paymentBox
              }
            >
              <div
                style={
                  styles.paymentLabel
                }
              >
                Change
              </div>

              <div
                style={
                  styles.paymentValue
                }
              >
                {money(
                  order.change_amount,
                )}
              </div>
            </div>

            <div
              style={
                styles.paymentBox
              }
            >
              <div
                style={
                  styles.paymentLabel
                }
              >
                Payment Status
              </div>

              <div
                style={
                  styles.paymentValue
                }
              >
                {order.payment_status}
              </div>
            </div>

            <div
              style={
                styles.paymentBox
              }
            >
              <div
                style={
                  styles.paymentLabel
                }
              >
                Transaction Reference
              </div>

              <div
                style={{
                  ...styles.paymentValue,
                  fontSize: "14px",
                  wordBreak:
                    "break-word",
                }}
              >
                {payment?.transaction_reference ||
                  "Not provided"}
              </div>
            </div>
          </div>

          {(order.payment_mode ===
            "ONLINE" ||
            order.payment_mode ===
              "BOTH") && (
            <div
              style={
                styles.proofSection
              }
            >
              <div
                style={{
                  fontSize:
                    "14px",
                  fontWeight: 800,
                  marginBottom:
                    "7px",
                }}
              >
                Primary Payment Proof
              </div>

              {payment?.payment_proof_path ? (
                <>
                  <button
                    type="button"
                    style={
                      styles.proofButton
                    }
                    onClick={() =>
                      openProof(
                        payment.payment_proof_path,
                      )
                    }
                  >
                    👁 View Payment Proof
                  </button>

                  <img
                    src={
                      payment.payment_proof_path
                    }
                    alt="Online payment proof"
                    style={
                      styles.proofImage
                    }
                    onClick={() =>
                      openProof(
                        payment.payment_proof_path,
                      )
                    }
                  />
                </>
              ) : (
                <div
                  style={{
                    background:
                      "#fff7ed",
                    border:
                      "1px solid #fed7aa",
                    color:
                      "#c2410c",
                    padding:
                      "12px",
                    borderRadius:
                      "10px",
                    fontSize:
                      "13px",
                  }}
                >
                  No payment proof
                  image is available
                  for this payment.
                </div>
              )}
            </div>
          )}

          {payments.length > 0 && (
            <div
              style={{
                marginTop:
                  "16px",
                paddingTop:
                  "16px",
                borderTop:
                  "1px solid #e5e7eb",
              }}
            >
              <div
                style={{
                  fontSize:
                    "14px",
                  fontWeight: 800,
                  marginBottom:
                    "10px",
                }}
              >
                Payment Records
              </div>

              {payments.map(
                (record, index) => {
                  /*
                   * Keep the proof path in a local string variable.
                   * This gives TypeScript a definite string after
                   * hasProof is checked and prevents JSX src/type
                   * errors caused by string | null | undefined.
                   */
                  const proofPath =
                    typeof record.payment_proof_path ===
                      "string"
                      ? record.payment_proof_path.trim()
                      : "";

                  const hasProof =
                    proofPath.length > 0;

                  const transactionReference =
                    typeof record.transaction_reference ===
                      "string"
                      ? record.transaction_reference.trim()
                      : "";

                  const hasReference =
                    transactionReference.length > 0;

                  return (
                    <div
                      key={
                        record.id
                      }
                      style={{
                        padding:
                          "13px",
                        background:
                          "#f8fafc",
                        border:
                          "1px solid #e5e7eb",
                        borderRadius:
                          "10px",
                        marginBottom:
                          "10px",
                      }}
                    >
                      <div
                        style={{
                          display:
                            "flex",
                          justifyContent:
                            "space-between",
                          alignItems:
                            "flex-start",
                          gap:
                            "12px",
                          flexWrap:
                            "wrap",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize:
                                "13px",
                              fontWeight:
                                800,
                              color:
                                "#111827",
                            }}
                          >
                            Payment #
                            {index + 1}{" "}
                            —{" "}
                            {
                              record.mode
                            }
                          </div>

                          <div
                            style={{
                              marginTop:
                                "5px",
                              fontSize:
                                "12px",
                              color:
                                "#475569",
                            }}
                          >
                            Cash{" "}
                            {money(
                              record.cash_amount,
                            )}{" "}
                            / Online{" "}
                            {money(
                              record.online_amount,
                            )}
                          </div>

                          <div
                            style={{
                              marginTop:
                                "4px",
                              fontSize:
                                "12px",
                              color:
                                "#64748b",
                            }}
                          >
                            {formatDateTime(
                              record.created_at,
                            )}
                          </div>
                        </div>

                        {hasProof && (
                          <button
                            type="button"
                            style={
                              styles.proofButton
                            }
                            onClick={() =>
                              openProof(
                                proofPath,
                              )
                            }
                          >
                            👁 View Proof
                          </button>
                        )}
                      </div>

                      {hasReference && (
                        <div
                          style={{
                            marginTop:
                              "10px",
                            padding:
                              "9px",
                            background:
                              "#ffffff",
                            borderRadius:
                              "8px",
                            fontSize:
                              "12px",
                            color:
                              "#475569",
                          }}
                        >
                          <strong>
                            Transaction
                            Reference:
                          </strong>{" "}
                          {
                            record.transaction_reference
                          }
                        </div>
                      )}

                      {hasProof ? (
                        <div
                          style={{
                            marginTop:
                              "10px",
                          }}
                        >
                          <div
                            style={{
                              fontSize:
                                "11px",
                              fontWeight:
                                800,
                              color:
                                "#64748b",
                              marginBottom:
                                "6px",
                              textTransform:
                                "uppercase",
                              letterSpacing:
                                "0.04em",
                            }}
                          >
                            Payment Proof
                          </div>

                          <img
                            src={proofPath}
                            alt={`Payment ${index + 1} proof`}
                            style={
                              styles.proofImage
                            }
                            onClick={() =>
                              openProof(
                                proofPath,
                              )
                            }
                          />
                        </div>
                      ) : (
                        <div
                          style={{
                            marginTop:
                              "10px",
                            background:
                              "#fff7ed",
                            border:
                              "1px solid #fed7aa",
                            color:
                              "#c2410c",
                            padding:
                              "10px",
                            borderRadius:
                              "8px",
                            fontSize:
                              "12px",
                          }}
                        >
                          No payment proof
                          image is
                          attached to
                          this payment.
                        </div>
                      )}
                    </div>
                  );
                },
              )}
            </div>
          )}
        </section>

        {/* Order Summary */}
        <section
          style={styles.card}
        >
          <h2
            style={
              styles.sectionTitle
            }
          >
            Order Summary
          </h2>

          <div
            style={
              styles.summaryRow
            }
          >
            <span>
              Item Value
            </span>

            <strong>
              {money(
                calculatedItemsTotal,
              )}
            </strong>
          </div>

          <div
            style={
              styles.summaryRow
            }
          >
            <span>
              Subtotal
            </span>

            <strong>
              {money(
                order.subtotal,
              )}
            </strong>
          </div>

          <div
            style={
              styles.summaryRow
            }
          >
            <span>
              Refunds
            </span>

            <strong
              style={{
                color:
                  "#dc2626",
              }}
            >
              -{" "}
              {money(
                order.refund_total,
              )}
            </strong>
          </div>

          <div
            style={
              styles.totalRow
            }
          >
            <span>
              Total
            </span>

            <span>
              {money(
                order.total,
              )}
            </span>
          </div>
        </section>
      </div>

      {/* Payment proof modal */}
      {proofImage && (
        <div
          style={styles.modal}
          onClick={() =>
            setProofImage(null)
          }
        >
          <div
            style={
              styles.modalContent
            }
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <button
              type="button"
              style={
                styles.modalClose
              }
              onClick={() =>
                setProofImage(null)
              }
            >
              ×
            </button>

            <img
              src={proofImage}
              alt="Payment proof"
              style={
                styles.modalImage
              }
            />
          </div>
        </div>
      )}
    </main>
  );
}