"use client";

import Link from "next/link";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getOrders,
  getOrder,
  logout,
  updateOrderStatus,
  cancelOrderItem,
  type Order,
} from "../../lib/orders";

import {
  getAuthToken,
  getUserName,
  getPermissions,
  clearAuthSession,
} from "../../lib/auth-storage";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:4000";

type StatusFilter =
  | "ALL"
  | "PREPARING"
  | "READY"
  | "DELIVERED"
  | "CANCELLED";

type PaymentFilter =
  | "ALL"
  | "CASH"
  | "ONLINE"
  | "BOTH";

type CancellationReason =
  | "CUSTOMER_CHANGED_MIND"
  | "ITEM_NOT_REQUIRED"
  | "WRONG_ITEM_SELECTED"
  | "OTHER";

type RefundMethod =
  | "CASH"
  | "ONLINE";

type PaymentMode =
  | "CASH"
  | "ONLINE"
  | "BOTH";

type Category = {
  id: string;
  name: string;
};

type MenuItem = {
  id: string;
  name: string;
  price: number | string;
  category_id?: string | null;
  category_name?: string | null;
};

type MenuAddon = {
  id: string;
  name: string;
  price: number | string;
};

type OrderDetail = {
  order?: any;
  items?: any[];
  order_items?: any[];
  orderItems?: any[];
  addons?: any[];
  order_item_addons?: any[];
  orderItemAddons?: any[];
  payments?: any[];
};

type CancelTarget = {
  orderId: string;
  itemId: string;
  itemName: string;
  amount: number;
  paymentMode: string;
};

type EditTarget = {
  orderId: string;
  version: number;
};

type EditableAddon = {
  addonId: string;
  quantity: number;
};

type EditableItem = {
  key: string;
  orderItemId?: string;
  itemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  originalQuantity: number;
  existing: boolean;
  status: string;
  addons: EditableAddon[];
};

type NewItemDraft = {
  itemId: string;
  quantity: number;
  addons: EditableAddon[];
};

function money(value: number) {
  return `₹${value.toFixed(2)}`;
}

function getNumber(
  value: unknown,
  fallback = 0,
) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

export default function OrdersPage() {
  const [orders, setOrders] =
    useState<Order[]>([]);

  const [orderDetails, setOrderDetails] =
    useState<Record<string, OrderDetail>>(
      {},
    );

  const [loading, setLoading] =
    useState(true);

  const [actionLoading, setActionLoading] =
    useState<string | null>(null);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("ALL");

  const [paymentFilter, setPaymentFilter] =
    useState<PaymentFilter>("ALL");

  const [userName, setUserName] =
    useState("");

  const [isMobile, setIsMobile] =
    useState(false);

  const [expandedOrders, setExpandedOrders] =
    useState<Record<string, boolean>>(
      {},
    );

  const [loadingDetails, setLoadingDetails] =
    useState<Record<string, boolean>>(
      {},
    );

  const [permissions, setPermissions] =
    useState<string[]>([]);

  /*
   * ============================================================
   * CANCEL ITEM STATE
   * ============================================================
   */

  const [cancelTarget, setCancelTarget] =
    useState<CancelTarget | null>(
      null,
    );

  const [cancelReason, setCancelReason] =
    useState<CancellationReason>(
      "CUSTOMER_CHANGED_MIND",
    );

  const [cancelNote, setCancelNote] =
    useState("");

  const [refundMethod, setRefundMethod] =
    useState<RefundMethod>("CASH");

  const [cancelLoading, setCancelLoading] =
    useState(false);

  /*
   * ============================================================
   * EDIT ORDER STATE
   * ============================================================
   */

  const [editTarget, setEditTarget] =
    useState<EditTarget | null>(null);

  const [editCustomerName, setEditCustomerName] =
    useState("");

  const [editCustomerPhone, setEditCustomerPhone] =
    useState("");

  const [editSpecialNote, setEditSpecialNote] =
    useState("");

  const [editItems, setEditItems] =
    useState<EditableItem[]>([]);

  const [editLoading, setEditLoading] =
    useState(false);

  const [menuLoading, setMenuLoading] =
    useState(false);

  const [menuItems, setMenuItems] =
    useState<MenuItem[]>([]);

  const [menuAddons, setMenuAddons] =
    useState<MenuAddon[]>([]);

  const [menuCategories, setMenuCategories] =
    useState<Category[]>([]);

  const [editCategory, setEditCategory] =
    useState("ALL");

  const [newItemDraft, setNewItemDraft] =
    useState<NewItemDraft | null>(null);

  const [newItemAddonId, setNewItemAddonId] =
    useState("");

  const [newItemAddonQuantity, setNewItemAddonQuantity] =
    useState(1);

  const [editPaymentMode, setEditPaymentMode] =
    useState<PaymentMode>("CASH");

  const [editCashReceived, setEditCashReceived] =
    useState("");

  const [editOnlineReceived, setEditOnlineReceived] =
    useState("");

  const [editTransactionReference, setEditTransactionReference] =
    useState("");

  const [editPaymentProof, setEditPaymentProof] =
    useState("");

  const [editPaymentError, setEditPaymentError] =
    useState("");

  const [editCameraOpen, setEditCameraOpen] =
    useState(false);

  const editVideoRef =
    useRef<HTMLVideoElement | null>(null);

  const editCameraStreamRef =
    useRef<MediaStream | null>(null);

  const [editRefundMethod, setEditRefundMethod] =
    useState<RefundMethod>("CASH");

  const [editRefundReason, setEditRefundReason] =
    useState<CancellationReason>(
      "CUSTOMER_CHANGED_MIND",
    );

  const [editRefundNote, setEditRefundNote] =
    useState("");

  const messageRef =
    useRef<HTMLDivElement | null>(null);

  const refreshingRef =
    useRef(false);

  /*
   * ============================================================
   * MESSAGE
   * ============================================================
   */

  useEffect(() => {
    if (!error && !success) {
      return;
    }

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });

    window.setTimeout(() => {
      messageRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  }, [error, success]);

  function showError(
    message: string,
  ) {
    setSuccess("");
    setError(message);
  }

  function showSuccess(
    message: string,
  ) {
    setError("");
    setSuccess(message);
  }

  /*
   * ============================================================
   * AUTH
   * ============================================================
   */

  function getToken() {
    return getAuthToken();
  }

  /*
   * ============================================================
   * LOAD ORDER DETAIL
   * ============================================================
   */

  const fetchOrderDetail =
    useCallback(
      async (orderId: string) => {
        try {
          setLoadingDetails(
            (current) => ({
              ...current,
              [orderId]: true,
            }),
          );

          const detail =
            await getOrder(orderId);

          setOrderDetails(
            (current) => ({
              ...current,
              [orderId]:
                detail as OrderDetail,
            }),
          );

          return detail as OrderDetail;
        } catch (err) {
          showError(
            err instanceof Error
              ? err.message
              : "Failed to load order details.",
          );

          return null;
        } finally {
          setLoadingDetails(
            (current) => ({
              ...current,
              [orderId]: false,
            }),
          );
        }
      },
      [],
    );

  /*
   * ============================================================
   * LOAD ORDERS
   * ============================================================
   */

  const loadOrders =
    useCallback(async () => {
      if (refreshingRef.current) {
        return;
      }

      const token = getToken();

      if (!token) {
        window.location.href =
          "/login";
        return;
      }

      refreshingRef.current = true;

      try {
        const response =
          await getOrders({
            page: 1,
            limit: 100,
          });

        const loadedOrders =
          response.orders ?? [];

        setOrders(
          loadedOrders,
        );

        const missing =
          loadedOrders.filter(
            (order) =>
              !orderDetails[order.id],
          );

        if (
          missing.length > 0
        ) {
          const results =
            await Promise.all(
              missing.map(
                async (order) => {
                  try {
                    const detail =
                      await getOrder(
                        order.id,
                      );

                    return {
                      id: order.id,
                      detail:
                        detail as OrderDetail,
                    };
                  } catch {
                    return null;
                  }
                },
              ),
            );

          setOrderDetails(
            (current) => {
              const next = {
                ...current,
              };

              for (
                const result of results
              ) {
                if (
                  result?.detail
                ) {
                  next[result.id] =
                    result.detail;
                }
              }

              return next;
            },
          );

          setExpandedOrders(
            (current) => {
              const next = {
                ...current,
              };

              for (
                const order of missing
              ) {
                if (
                  !(order.id in next)
                ) {
                  next[order.id] =
                    true;
                }
              }

              return next;
            },
          );
        }

        if (!success) {
          setError("");
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to load orders.";

        const lower =
          message.toLowerCase();

        if (
          lower.includes(
            "unauthorized",
          ) ||
          lower.includes(
            "session",
          ) ||
          lower.includes(
            "authentication",
          ) ||
          lower.includes(
            "invalid token",
          )
        ) {
          clearAuthSession();

          window.location.href =
            "/login";

          return;
        }

        showError(message);
      } finally {
        refreshingRef.current =
          false;

        setLoading(false);
      }
    }, [orderDetails, success]);

  /*
   * ============================================================
   * INITIAL SETUP
   * ============================================================
   */

  useEffect(() => {
    const token = getToken();

    if (!token) {
      window.location.href =
        "/login";

      return;
    }

    setUserName(getUserName());

    setPermissions(getPermissions());

    const mediaQuery =
      window.matchMedia(
        "(max-width: 640px)",
      );

    const updateMobile = () => {
      setIsMobile(
        mediaQuery.matches,
      );
    };

    updateMobile();

    mediaQuery.addEventListener(
      "change",
      updateMobile,
    );

    loadOrders();

    const interval =
      window.setInterval(
        loadOrders,
        1000,
      );

    const handleVisibility =
      () => {
        if (
          document.visibilityState ===
          "visible"
        ) {
          loadOrders();
        }
      };

    document.addEventListener(
      "visibilitychange",
      handleVisibility,
    );

    window.addEventListener(
      "focus",
      loadOrders,
    );

    return () => {
      window.clearInterval(
        interval,
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibility,
      );

      window.removeEventListener(
        "focus",
        loadOrders,
      );

      mediaQuery.removeEventListener(
        "change",
        updateMobile,
      );
    };
  }, [loadOrders]);

  /*
   * ============================================================
   * STATUS
   * ============================================================
   */

  async function changeStatus(
    orderId: string,
    status:
      | "READY"
      | "DELIVERED",
  ) {
    try {
      setActionLoading(orderId);
      setError("");
      setSuccess("");

      await updateOrderStatus(
        orderId,
        status,
      );

      await loadOrders();

      await fetchOrderDetail(
        orderId,
      );

      showSuccess(
        status === "READY"
          ? "Order marked Ready."
          : "Order marked Delivered.",
      );
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : "Failed to update order.",
      );
    } finally {
      setActionLoading(null);
    }
  }

  /*
   * ============================================================
   * LOGOUT
   * ============================================================
   */

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // Continue local logout.
    }

    clearAuthSession();

    window.location.href =
      "/login";
  }

  /*
   * ============================================================
   * EXPAND
   * ============================================================
   */

  async function toggleOrderDetails(
    orderId: string,
  ) {
    const open =
      Boolean(
        expandedOrders[orderId],
      );

    setExpandedOrders(
      (current) => ({
        ...current,
        [orderId]: !open,
      }),
    );

    if (
      !open &&
      !orderDetails[orderId]
    ) {
      await fetchOrderDetail(
        orderId,
      );
    }
  }

  /*
   * ============================================================
   * ORDER HELPERS
   * ============================================================
   */

  function getItems(
    detail?: OrderDetail,
  ) {
    if (!detail) {
      return [];
    }

    const sources = [
      detail.items,
      detail.order_items,
      detail.orderItems,
    ];

    for (
      const source of sources
    ) {
      if (
        Array.isArray(
          source,
        )
      ) {
        return source;
      }
    }

    return [];
  }

  function getAddons(
    detail?: OrderDetail,
  ) {
    if (!detail) {
      return [];
    }

    const sources = [
      detail.order_item_addons,
      detail.orderItemAddons,
      detail.addons,
    ];

    for (
      const source of sources
    ) {
      if (
        Array.isArray(
          source,
        )
      ) {
        return source;
      }
    }

    return [];
  }

  function getItemAddons(
    item: any,
    allAddons: any[],
  ) {
    const nested =
      Array.isArray(
        item.addons,
      )
        ? item.addons
        : Array.isArray(
              item.order_item_addons,
            )
          ? item.order_item_addons
          : Array.isArray(
                item.orderItemAddons,
              )
            ? item.orderItemAddons
            : [];

    const related =
      allAddons.filter(
        (addon: any) => {
          const addonItemId =
            addon.order_item_id ??
            addon.orderItemId ??
            addon.order_item?.id ??
            addon.orderItem?.id;

          return (
            addonItemId !=
              null &&
            item.id != null &&
            String(
              addonItemId,
            ) ===
              String(item.id)
          );
        },
      );

    const merged = [
      ...nested,
      ...related,
    ];

    return merged.filter(
      (
        addon,
        index,
        array,
      ) =>
        array.findIndex(
          (existing) => {
            if (
              addon.id !=
                null &&
              existing.id !=
                null
            ) {
              return (
                String(
                  existing.id,
                ) ===
                String(
                  addon.id,
                )
              );
            }

            return (
              String(
                existing.addon_id ??
                  existing.addonId ??
                  existing.addon_name_snapshot ??
                  "",
              ) ===
                String(
                  addon.addon_id ??
                    addon.addonId ??
                    addon.addon_name_snapshot ??
                    "",
                ) &&
              String(
                existing.unit_price_snapshot ??
                  existing.unitPriceSnapshot ??
                  existing.price ??
                  0,
              ) ===
                String(
                  addon.unit_price_snapshot ??
                    addon.unitPriceSnapshot ??
                    addon.price ??
                    0,
                )
            );
          },
        ) === index,
    );
  }

  function getItemRefundAmount(
    item: any,
    addons: any[],
  ) {
    const itemTotal =
      getNumber(
        item.item_total ??
          item.itemTotal ??
          item.total,
      );

    const itemAddons =
      getItemAddons(
        item,
        addons,
      );

    const addonTotal =
      itemAddons.reduce(
        (
          total: number,
          addon: any,
        ) =>
          total +
          getNumber(
            addon.addon_total ??
              addon.addonTotal ??
              addon.total,
          ),
        0,
      );

    return (
      itemTotal +
      addonTotal
    );
  }

  function getCurrentOrderValue(
    order: Order,
  ) {
    const gross =
      getNumber(
        order.total,
      );

    const refunded =
      getNumber(
        (order as any)
          .refund_total,
      );

    return Math.max(
      0,
      gross - refunded,
    );
  }

  function canEditOrder(
    order: Order,
  ) {
    const status =
      String(
        order.status ?? "",
      ).toUpperCase();

    return (
      status ===
        "PREPARING" ||
      status === "READY"
    );
  }

  function canCancelOrderItem(
    order: Order,
  ) {
    const status =
      String(
        order.status ?? "",
      ).toUpperCase();

    return (
      status !==
        "DELIVERED" &&
      status !==
        "CANCELLED"
    );
  }

  useEffect(() => {
    return () => {
      const stream =
        editCameraStreamRef.current;

      if (stream) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
      }
    };
  }, []);

  /*
   * ============================================================
   * LOAD MENU FOR EDIT
   * ============================================================
   */

  async function loadEditMenu() {
    if (
      menuItems.length > 0
    ) {
      return;
    }

    try {
      setMenuLoading(true);

      const token =
        getToken();

      const [
        itemsResponse,
        addonsResponse,
        categoriesResponse,
      ] =
        await Promise.all([
          fetch(
            `${API_BASE_URL}/api/items`,
            {
              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            },
          ),
          fetch(
            `${API_BASE_URL}/api/addons`,
            {
              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            },
          ),
          fetch(
            `${API_BASE_URL}/api/categories`,
            {
              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            },
          ),
        ]);

      const itemsData =
        await itemsResponse
          .json()
          .catch(() => null);

      const addonsData =
        await addonsResponse
          .json()
          .catch(() => null);

      const categoriesData =
        await categoriesResponse
          .json()
          .catch(() => null);

      if (
        !itemsResponse.ok
      ) {
        throw new Error(
          itemsData?.error ??
            "Failed to load items.",
        );
      }

      if (
        !addonsResponse.ok
      ) {
        throw new Error(
          addonsData?.error ??
            "Failed to load add-ons.",
        );
      }

      if (
        !categoriesResponse.ok
      ) {
        throw new Error(
          categoriesData?.error ??
            "Failed to load categories.",
        );
      }

      const loadedItems =
        Array.isArray(
          itemsData,
        )
          ? itemsData
          : itemsData?.items ??
            [];

      const loadedAddons =
        Array.isArray(
          addonsData,
        )
          ? addonsData
          : addonsData?.addons ??
            [];

      const loadedCategories =
        Array.isArray(
          categoriesData,
        )
          ? categoriesData
          : categoriesData?.categories ??
            [];

      setMenuItems(
        loadedItems,
      );

      setMenuAddons(
        loadedAddons,
      );

      setMenuCategories(
        loadedCategories,
      );
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : "Failed to load menu.",
      );
    } finally {
      setMenuLoading(false);
    }
  }

  /*
   * ============================================================
   * CREATE EDITABLE ITEMS FROM ORDER
   * ============================================================
   */

  function buildEditableItems(
    detail: OrderDetail,
  ) {
    const items =
      getItems(detail);

    const allAddons =
      getAddons(detail);

    return items
      .filter((item) => {
        const status =
          String(
            item.status ??
              "ACTIVE",
          ).toUpperCase();

        return (
          status !==
          "CANCELLED"
        );
      })
      .map(
        (
          item: any,
          index,
        ): EditableItem => {
          const itemId =
            String(
              item.item_id ??
                item.itemId ??
                "",
            );

          const itemName =
            String(
              item.item_name_snapshot ??
                item.itemNameSnapshot ??
                item.item_name ??
                item.name ??
                "Item",
            );

          const unitPrice =
            getNumber(
              item.unit_price_snapshot ??
                item.unitPriceSnapshot ??
                item.price,
            );

          const quantity =
            Math.max(
              1,
              getNumber(
                item.quantity,
                1,
              ),
            );

          const itemAddons =
            getItemAddons(
              item,
              allAddons,
            );

          const addons =
            itemAddons
              .map(
                (
                  addon: any,
                ) => ({
                  addonId: String(
                    addon.addon_id ??
                      addon.addonId ??
                      "",
                  ),
                  quantity:
                    Math.max(
                      1,
                      getNumber(
                        addon.quantity,
                        1,
                      ),
                    ),
                }),
              )
              .filter(
                (addon) =>
                  addon.addonId,
              );

          return {
            key:
              String(
                item.id ??
                  `existing-${index}`,
              ),
            orderItemId:
              item.id
                ? String(
                    item.id,
                  )
                : undefined,
            itemId,
            name: itemName,
            unitPrice,
            quantity,
            originalQuantity:
              quantity,
            existing: true,
            status: String(
              item.status ??
                "ACTIVE",
            ).toUpperCase(),
            addons,
          };
        },
      );
  }

  /*
   * ============================================================
   * ADDITIONAL PAYMENT CAMERA
   * ============================================================
   */

  function stopEditCamera() {
    const stream =
      editCameraStreamRef.current;

    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }

    editCameraStreamRef.current = null;
    setEditCameraOpen(false);
  }

  async function openEditCamera() {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setEditPaymentError(
        "Camera access is not available on this device/browser.",
      );
      return;
    }

    try {
      setEditPaymentError("");
      setError("");

      stopEditCamera();

      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal: "environment",
            },
          },
          audio: false,
        });

      editCameraStreamRef.current =
        stream;

      setEditCameraOpen(true);

      window.setTimeout(() => {
        if (editVideoRef.current) {
          editVideoRef.current.srcObject =
            stream;

          editVideoRef.current
            .play()
            .catch(() => {});
        }
      }, 50);
    } catch (error) {
      console.error(
        "Additional payment camera failed:",
        error,
      );

      setEditPaymentError(
        "Camera permission was denied or the camera could not be opened.",
      );
    }
  }

  function captureEditPaymentProof() {
    const video =
      editVideoRef.current;

    if (
      !video ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      setEditPaymentError(
        "Camera is not ready yet. Please wait a moment and try again.",
      );
      return;
    }

    const canvas =
      document.createElement(
        "canvas",
      );

    const maxWidth = 1280;
    const scale =
      Math.min(
        1,
        maxWidth /
          video.videoWidth,
      );

    canvas.width =
      Math.round(
        video.videoWidth *
          scale,
      );

    canvas.height =
      Math.round(
        video.videoHeight *
          scale,
      );

    const context =
      canvas.getContext(
        "2d",
      );

    if (!context) {
      setEditPaymentError(
        "Unable to capture the payment proof photo.",
      );
      return;
    }

    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    const image =
      canvas.toDataURL(
        "image/jpeg",
        0.72,
      );

    setEditPaymentProof(
      image,
    );

    /*
     * A captured proof image satisfies the online-payment
     * verification requirement, so clear any stale validation
     * message immediately.
     */
    setEditPaymentError("");
    setError("");

    stopEditCamera();
  }

  /*
   * ============================================================
   * OPEN EDIT
   * ============================================================
   */

  async function openEditOrder(
    order: Order,
  ) {
    /*
     * Do not carry an error from a previous save attempt into
     * a newly opened edit dialog.
     */
    setError("");
    setEditPaymentError("");

    if (
      !canEditOrder(order)
    ) {
      return;
    }

    if (
      !permissions.includes(
        "EDIT_ORDER",
      )
    ) {
      showError(
        "You do not have permission to edit orders.",
      );
      return;
    }

    let detail: OrderDetail | undefined =
      orderDetails[order.id];

    if (!detail) {
      const loadedDetail =
        await fetchOrderDetail(
          order.id,
        );

      detail =
        loadedDetail ?? undefined;
    }

    if (!detail) {
      return;
    }

    await loadEditMenu();

    const orderData =
      detail.order ??
      order;

    setEditCustomerName(
      String(
        order.customer_name ??
          "",
      ),
    );

    setEditCustomerPhone(
      String(
        order.customer_phone ??
          "",
      ),
    );

    setEditSpecialNote(
      String(
        orderData.special_note ??
          orderData.specialNote ??
          "",
      ),
    );

    setEditItems(
      buildEditableItems(
        detail,
      ),
    );

    const currentPayment =
      String(
        order.payment_mode ??
          orderData.payment_mode ??
          "CASH",
      ).toUpperCase();

    if (
      currentPayment ===
        "CASH" ||
      currentPayment ===
        "ONLINE" ||
      currentPayment ===
        "BOTH"
    ) {
      setEditPaymentMode(
        currentPayment as PaymentMode,
      );
    } else {
      setEditPaymentMode(
        "CASH",
      );
    }

    setEditCashReceived("");
    setEditOnlineReceived("");
    setEditTransactionReference("");
    setEditPaymentProof("");
    setEditPaymentError("");
    stopEditCamera();

    setEditRefundMethod(
      currentPayment ===
        "ONLINE"
        ? "ONLINE"
        : "CASH",
    );

    setEditRefundReason(
      "CUSTOMER_CHANGED_MIND",
    );

    setEditRefundNote("");

    setEditCategory("ALL");

    setNewItemDraft(null);
    setNewItemAddonId("");
    setNewItemAddonQuantity(1);

    setEditTarget({
      orderId: order.id,
      version:
        getNumber(
          orderData.version ??
            (order as any)
              .version,
        ),
    });

    setError("");
    setSuccess("");
  }

  function closeEditOrder() {
    if (editLoading) {
      return;
    }

    stopEditCamera();
    setEditPaymentProof("");
    setEditPaymentError("");
    setEditTarget(null);
    setNewItemDraft(null);
  }

  /*
   * ============================================================
   * EDIT ITEM HELPERS
   * ============================================================
   */

  function changeExistingItemQuantity(
    key: string,
    delta: number,
  ) {
    setEditItems(
      (current) =>
        current.map(
          (item) =>
            item.key === key
              ? {
                  ...item,
                  quantity:
                    Math.max(
                      1,
                      item.quantity +
                        delta,
                    ),
                }
              : item,
        ),
    );
  }

  function changeExistingAddonQuantity(
    itemKey: string,
    addonId: string,
    delta: number,
  ) {
    setEditItems(
      (current) =>
        current.map(
          (item) => {
            if (
              item.key !==
              itemKey
            ) {
              return item;
            }

            return {
              ...item,
              addons:
                item.addons
                  .map(
                    (
                      addon,
                    ) =>
                      addon.addonId ===
                      addonId
                        ? {
                            ...addon,
                            quantity:
                              Math.max(
                                1,
                                addon.quantity +
                                  delta,
                              ),
                          }
                        : addon,
                  ),
            };
          },
        ),
    );
  }

  function removeExistingAddon(
    itemKey: string,
    addonId: string,
  ) {
    setEditItems(
      (current) =>
        current.map(
          (item) =>
            item.key ===
            itemKey
              ? {
                  ...item,
                  addons:
                    item.addons.filter(
                      (
                        addon,
                      ) =>
                        addon.addonId !==
                        addonId,
                    ),
                }
              : item,
        ),
    );
  }

  function addAddonToExistingItem(
    itemKey: string,
    addonId: string,
  ) {
    if (!addonId) {
      return;
    }

    setEditItems(
      (current) =>
        current.map(
          (item) => {
            if (
              item.key !==
              itemKey
            ) {
              return item;
            }

            const existing =
              item.addons.find(
                (addon) =>
                  addon.addonId ===
                  addonId,
              );

            if (existing) {
              return {
                ...item,
                addons:
                  item.addons.map(
                    (
                      addon,
                    ) =>
                      addon.addonId ===
                      addonId
                        ? {
                            ...addon,
                            quantity:
                              addon.quantity +
                              1,
                          }
                        : addon,
                  ),
              };
            }

            return {
              ...item,
              addons: [
                ...item.addons,
                {
                  addonId,
                  quantity: 1,
                },
              ],
            };
          },
        ),
    );
  }

  /*
   * ============================================================
   * NEW ITEM
   * ============================================================
   */

  const filteredEditMenuItems =
    useMemo(() => {
      if (
        editCategory ===
        "ALL"
      ) {
        return menuItems;
      }

      return menuItems.filter(
        (item) =>
          String(
            item.category_id ??
              "",
          ) ===
          editCategory,
      );
    }, [
      menuItems,
      editCategory,
    ]);

  function startAddingItem() {
    if (
      newItemDraft
    ) {
      return;
    }

    if (
      filteredEditMenuItems.length ===
      0
    ) {
      showError(
        "No menu items are available.",
      );
      return;
    }

    /*
     * Do not silently select the first menu item.
     * The first API result may be a completely different food
     * such as Double Masala Maggie.
     */
    setNewItemDraft({
      itemId: "",
      quantity: 1,
      addons: [],
    });

    setEditCategory("ALL");
    setNewItemAddonId("");
    setNewItemAddonQuantity(1);
    setError("");
    setSuccess("");
  }

  function handleNewItemCategoryChange(
    categoryId: string,
  ) {
    setEditCategory(categoryId);

    setNewItemDraft(
      (current) => {
        if (!current) {
          return current;
        }

        const availableItems =
          categoryId === "ALL"
            ? menuItems
            : menuItems.filter(
                (item) =>
                  String(
                    item.category_id ??
                      "",
                  ) ===
                  categoryId,
              );

        const currentStillAvailable =
          availableItems.some(
            (item) =>
              item.id ===
              current.itemId,
          );

        if (
          currentStillAvailable
        ) {
          return current;
        }

        /*
         * Never leave the controlled Food Item select pointing at
         * an option that is no longer in the filtered list.
         */
        return {
          ...current,
          itemId:
            availableItems[0]?.id ??
            "",
          addons: [],
        };
      },
    );

    /*
     * Add-ons belong to the selected food item.
     */
    setNewItemAddonId("");
    setNewItemAddonQuantity(1);
  }

  function cancelAddingItem() {
    setNewItemDraft(null);
    setNewItemAddonId("");
    setNewItemAddonQuantity(1);
  }

  function updateNewItemQuantity(
    delta: number,
  ) {
    setNewItemDraft(
      (current) =>
        current
          ? {
              ...current,
              quantity:
                Math.max(
                  1,
                  current.quantity +
                    delta,
                ),
            }
          : current,
    );
  }

  function addAddonToNewItem() {
    if (
      !newItemDraft ||
      !newItemAddonId
    ) {
      return;
    }

    setNewItemDraft(
      (current) => {
        if (!current) {
          return current;
        }

        const existing =
          current.addons.find(
            (addon) =>
              addon.addonId ===
              newItemAddonId,
          );

        if (existing) {
          return {
            ...current,
            addons:
              current.addons.map(
                (
                  addon,
                ) =>
                  addon.addonId ===
                  newItemAddonId
                    ? {
                        ...addon,
                        quantity:
                          addon.quantity +
                          newItemAddonQuantity,
                      }
                    : addon,
              ),
          };
        }

        return {
          ...current,
          addons: [
            ...current.addons,
            {
              addonId:
                newItemAddonId,
              quantity:
                newItemAddonQuantity,
            },
          ],
        };
      },
    );

    setNewItemAddonId("");
    setNewItemAddonQuantity(1);
  }

  function changeNewItemAddonQuantity(
    addonId: string,
    delta: number,
  ) {
    setNewItemDraft(
      (current) =>
        current
          ? {
              ...current,
              addons:
                current.addons.map(
                  (
                    addon,
                  ) =>
                    addon.addonId ===
                    addonId
                      ? {
                          ...addon,
                          quantity:
                            Math.max(
                              1,
                              addon.quantity +
                                delta,
                            ),
                        }
                      : addon,
                ),
            }
          : current,
    );
  }

  function removeNewItemAddon(
    addonId: string,
  ) {
    setNewItemDraft(
      (current) =>
        current
          ? {
              ...current,
              addons:
                current.addons.filter(
                  (
                    addon,
                  ) =>
                    addon.addonId !==
                    addonId,
                ),
            }
          : current,
    );
  }

  function confirmNewItem() {
    if (
      !newItemDraft
    ) {
      return;
    }

    if (!newItemDraft.itemId) {
      showError(
        "Select a food item before adding it to the order.",
      );
      return;
    }

    const menuItem =
      menuItems.find(
        (item) =>
          item.id ===
          newItemDraft.itemId,
      );

    if (!menuItem) {
      showError(
        "Selected menu item is no longer available.",
      );
      return;
    }

    const newEntry: EditableItem =
      {
        key:
          `new-${Date.now()}-${Math.random()}`,
        itemId:
          menuItem.id,
        name:
          menuItem.name,
        unitPrice:
          getNumber(
            menuItem.price,
          ),
        quantity:
          newItemDraft.quantity,
        originalQuantity: 0,
        existing: false,
        status: "ACTIVE",
        addons:
          newItemDraft.addons,
      };

    setEditItems(
      (current) => [
        ...current,
        newEntry,
      ],
    );

    setNewItemDraft(null);
    setNewItemAddonId("");
    setNewItemAddonQuantity(1);
  }

  /*
   * ============================================================
   * EDIT ADDON OPTIONS
   * ============================================================
   */

  function getAddonsForItem(
    itemId: string,
  ) {
    /*
     * The POS/backend supports reusable
     * add-ons associated with items.
     *
     * If the item-addons API is available,
     * it can later be used to filter this
     * list more strictly.
     *
     * For now the backend remains the
     * authoritative validator.
     */
    return menuAddons;
  }

  /*
   * ============================================================
   * EDIT TOTAL CALCULATION
   * ============================================================
   */

  const editTotals =
    useMemo(() => {
      let total = 0;

      for (
        const item of editItems
      ) {
        total +=
          item.unitPrice *
          item.quantity;

        for (
          const addon of item.addons
        ) {
          const menuAddon =
            menuAddons.find(
              (entry) =>
                entry.id ===
                addon.addonId,
            );

          const addonPrice =
            getNumber(
              menuAddon?.price,
            );

          total +=
            addonPrice *
            addon.quantity;
        }
      }

      return total;
    }, [
      editItems,
      menuAddons,
    ]);

  const editOriginalValue =
    useMemo(() => {
      if (!editTarget) {
        return 0;
      }

      const detail =
        orderDetails[
          editTarget.orderId
        ];

      if (!detail) {
        return 0;
      }

      const items =
        getItems(detail);

      const allAddons =
        getAddons(detail);

      return items.reduce(
        (
          total,
          item,
        ) => {
          const status =
            String(
              item.status ??
                "ACTIVE",
            ).toUpperCase();

          if (
            status ===
            "CANCELLED"
          ) {
            return total;
          }

          return (
            total +
            getItemRefundAmount(
              item,
              allAddons,
            )
          );
        },
        0,
      );
    }, [
      editTarget,
      orderDetails,
    ]);

  const editDifference =
    editTotals -
    editOriginalValue;

  const editHasIncrease =
    editDifference >
    0.005;

  const editHasDecrease =
    editDifference <
    -0.005;

  const editPaymentTotal =
    getNumber(
      editCashReceived,
    ) +
    getNumber(
      editOnlineReceived,
    );

  const editPaymentShortfall =
    Math.max(
      0,
      editDifference -
        editPaymentTotal,
    );

  const editPaymentChange =
    editDifference > 0
      ? Math.max(
          0,
          editPaymentTotal -
            editDifference,
        )
      : 0;

  /*
   * ============================================================
   * PAYMENT VALIDATION
   * ============================================================
   */

  function validateEditPayment() {
    setEditPaymentError("");

    if (!editHasIncrease) {
      return null;
    }

    const additional =
      Math.round(
        editDifference * 100,
      ) / 100;

    const cash =
      Math.max(
        0,
        getNumber(
          editCashReceived,
        ),
      );

    const online =
      Math.max(
        0,
        getNumber(
          editOnlineReceived,
        ),
      );

    const totalReceived =
      Math.round(
        (cash + online) * 100,
      ) / 100;

    const required =
      Math.round(
        additional * 100,
      ) / 100;

    if (
      editPaymentMode ===
      "CASH"
    ) {
      if (
        cash !== required ||
        online !== 0
      ) {
        return `Cash payment must be exactly ${money(
          required,
        )}.`;
      }
    }

    if (
      editPaymentMode ===
      "ONLINE"
    ) {
      if (
        online !== required ||
        cash !== 0
      ) {
        return `Online payment must be exactly ${money(
          required,
        )}.`;
      }
    }

    if (
      editPaymentMode ===
      "BOTH"
    ) {
      if (
        cash <= 0 ||
        online <= 0
      ) {
        return "BOTH payment requires both cash and online amounts.";
      }

      if (
        totalReceived !==
        required
      ) {
        return `Cash + online payment must equal exactly ${money(
          required,
        )}.`;
      }
    }

    if (
      editPaymentMode ===
        "ONLINE" ||
      editPaymentMode ===
        "BOTH"
    ) {
      /*
       * Online additional payment can be verified by either:
       * 1. transaction reference, OR
       * 2. captured payment-proof image.
       *
       * If the proof image is attached, do NOT ask for the
       * transaction reference.
       */
      if (
        !editTransactionReference.trim() &&
        !editPaymentProof
      ) {
        return "Enter the transaction reference or attach the online payment proof photo.";
      }
    }

    return null;
  }

  /*
   * ============================================================
   * SAVE EDIT ORDER
   * ============================================================
   */

  async function saveEditOrder() {
    if (
      !editTarget
    ) {
      return;
    }

    const paymentError =
      validateEditPayment();

    if (paymentError) {
      setEditPaymentError(
        paymentError,
      );
      return;
    }

    setEditPaymentError("");

    if (
      editItems.length ===
      0
    ) {
      showError(
        "An order must contain at least one active item. Use Cancel Item for full item cancellation.",
      );
      return;
    }

    try {
      setEditLoading(true);

      setError("");
      setSuccess("");

      const token =
        getToken();

      if (!token) {
        clearAuthSession();

        window.location.href =
          "/login";

        return;
      }

      const payloadItems =
        editItems.map(
          (item) => ({
            orderItemId:
              item.existing
                ? item.orderItemId
                : undefined,
            itemId:
              item.itemId,
            quantity:
              item.quantity,
            addons:
              item.addons.map(
                (
                  addon,
                ) => ({
                  addonId:
                    addon.addonId,
                  quantity:
                    addon.quantity,
                }),
              ),
          }),
        );

      const response =
        await fetch(
          `${API_BASE_URL}/api/order-edit/${editTarget.orderId}`,
          {
            method: "PATCH",
            headers: {
              Authorization:
                `Bearer ${token}`,
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              version:
                editTarget.version,

              customerName:
                editCustomerName.trim() ||
                null,

              customerPhone:
                editCustomerPhone.trim() ||
                null,

              specialNote:
                editSpecialNote.trim() ||
                null,

              items:
                payloadItems,

              paymentMode:
                editHasIncrease
                  ? editPaymentMode
                  : undefined,

              cashReceived:
                editHasIncrease
                  ? Math.max(
                      0,
                      getNumber(
                        editCashReceived,
                      ),
                    )
                  : 0,

              onlineReceived:
                editHasIncrease
                  ? Math.max(
                      0,
                      getNumber(
                        editOnlineReceived,
                      ),
                    )
                  : 0,

              transactionReference:
                editHasIncrease
                  ? editTransactionReference.trim() ||
                    null
                  : null,

              paymentProofPath:
                editHasIncrease &&
                (editPaymentMode ===
                  "ONLINE" ||
                  editPaymentMode ===
                    "BOTH")
                  ? editPaymentProof
                  : null,

              refundMethod:
                editHasDecrease
                  ? editRefundMethod
                  : null,

              refundReason:
                editHasDecrease
                  ? editRefundReason
                  : null,

              refundNote:
                editHasDecrease
                  ? editRefundNote.trim() ||
                    null
                  : null,
            }),
          },
        );

      const data =
        await response
          .json()
          .catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error ??
            data?.message ??
            "Failed to edit order.",
        );
      }

      const orderId =
        editTarget.orderId;

      stopEditCamera();
      setEditPaymentProof("");
      setEditPaymentError("");
      setEditTarget(null);
      setNewItemDraft(null);

      await loadOrders();

      await fetchOrderDetail(
        orderId,
      );

      const message =
        editHasIncrease
          ? `Order updated. Additional payment received: ${money(
              editDifference,
            )}.`
          : editHasDecrease
            ? `Order updated. Refund recorded: ${money(
                Math.abs(
                  editDifference,
                ),
              )}.`
            : "Order updated successfully.";

      showSuccess(message);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to edit order.";

      if (
        message
          .toLowerCase()
          .includes(
            "version",
          )
      ) {
        showError(
          "This order was changed on another device. The latest order has been loaded. Please review it and try again.",
        );

        if (
          editTarget
        ) {
          await fetchOrderDetail(
            editTarget.orderId,
          );
        }
      } else {
        showError(message);
      }
    } finally {
      setEditLoading(false);
    }
  }

  /*
   * ============================================================
   * CANCEL ITEM
   * ============================================================
   */

  function openCancelModal(
    order: Order,
    item: any,
    allAddons: any[],
  ) {
    if (
      !canCancelOrderItem(
        order,
      )
    ) {
      return;
    }

    if (
      !permissions.includes(
        "CANCEL_ORDER",
      ) &&
      !permissions.includes(
        "EDIT_ORDER",
      )
    ) {
      showError(
        "You do not have permission to cancel items.",
      );
      return;
    }

    const itemId =
      String(
        item.id ??
          item.order_item_id ??
          item.orderItemId ??
          "",
      );

    if (!itemId) {
      showError(
        "Order item ID is missing.",
      );
      return;
    }

    const payment =
      String(
        order.payment_mode ??
          "",
      ).toUpperCase();

    const itemName =
      item.item_name_snapshot ??
      item.itemNameSnapshot ??
      item.item_name ??
      item.name ??
      "Item";

    const amount =
      getItemRefundAmount(
        item,
        allAddons,
      );

    setCancelTarget({
      orderId:
        order.id,
      itemId,
      itemName,
      amount,
      paymentMode:
        payment,
    });

    setCancelReason(
      "CUSTOMER_CHANGED_MIND",
    );

    setCancelNote("");

    setRefundMethod(
      payment === "ONLINE"
        ? "ONLINE"
        : "CASH",
    );

    setError("");
    setSuccess("");
  }

  async function cancelItem() {
    if (
      !cancelTarget
    ) {
      return;
    }

    try {
      setCancelLoading(true);

      setError("");
      setSuccess("");

      const token =
        getToken();

      if (!token) {
        clearAuthSession();

        window.location.href =
          "/login";

        return;
      }

      const response =
        await fetch(
          `${API_BASE_URL}/api/orders/${cancelTarget.orderId}/items/${cancelTarget.itemId}/cancel`,
          {
            method: "PATCH",
            headers: {
              Authorization:
                `Bearer ${token}`,
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              reason:
                cancelReason,
              note:
                cancelNote.trim() ||
                null,
              refundMethod:
                refundMethod,
            }),
          },
        );

      const data =
        await response
          .json()
          .catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error ??
            "Failed to cancel item.",
        );
      }

      const orderId =
        cancelTarget.orderId;

      setCancelTarget(null);
      setCancelNote("");

      await loadOrders();

      await fetchOrderDetail(
        orderId,
      );

      showSuccess(
        "Item cancelled and refund recorded successfully.",
      );
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : "Failed to cancel item.",
      );
    } finally {
      setCancelLoading(false);
    }
  }

  /*
   * ============================================================
   * FILTER
   * ============================================================
   */

  const filteredOrders =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      return orders.filter(
        (order) => {
          const tokenText =
            String(
              order.token_number ??
                (order as any)
                  .tokenNumber ??
                "",
            ).toLowerCase();

          const customerText =
            String(
              order.customer_name ??
                (order as any)
                  .customerName ??
                "",
            ).toLowerCase();

          const phoneText =
            String(
              order.customer_phone ??
                (order as any)
                  .customerPhone ??
                "",
            ).toLowerCase();

          const matchesSearch =
            !query ||
            tokenText.includes(
              query,
            ) ||
            customerText.includes(
              query,
            ) ||
            phoneText.includes(
              query,
            );

          const status =
            String(
              order.status ??
                "",
            ).toUpperCase();

          const payment =
            String(
              order.payment_mode ??
                (order as any)
                  .paymentMode ??
                "",
            ).toUpperCase();

          return (
            matchesSearch &&
            (statusFilter ===
              "ALL" ||
              status ===
                statusFilter) &&
            (paymentFilter ===
              "ALL" ||
              payment ===
                paymentFilter)
          );
        },
      );
    }, [
      orders,
      search,
      statusFilter,
      paymentFilter,
    ]);

  /*
   * ============================================================
   * STATS
   * ============================================================
   */

  const stats =
    useMemo(() => {
      let preparing = 0;
      let ready = 0;
      let delivered = 0;
      let cancelled = 0;
      let currentValue = 0;

      for (
        const order of orders
      ) {
        const status =
          String(
            order.status ??
              "",
          ).toUpperCase();

        if (
          status ===
          "PREPARING"
        ) {
          preparing++;
        }

        if (
          status ===
          "READY"
        ) {
          ready++;
        }

        if (
          status ===
          "DELIVERED"
        ) {
          delivered++;
        }

        if (
          status ===
          "CANCELLED"
        ) {
          cancelled++;
        }

        currentValue +=
          getCurrentOrderValue(
            order,
          );
      }

      return {
        total:
          orders.length,
        preparing,
        ready,
        delivered,
        cancelled,
        currentValue,
      };
    }, [orders]);

  /*
   * ============================================================
   * RENDER ORDER DETAILS
   * ============================================================
   */

  function renderOrderDetails(
    order: Order,
  ) {
    const detail =
      orderDetails[
        order.id
      ];

    const detailLoading =
      Boolean(
        loadingDetails[
          order.id
        ],
      );

    if (
      detailLoading &&
      !detail
    ) {
      return (
        <div
          style={
            styles.detailsLoading
          }
        >
          Loading order details...
        </div>
      );
    }

    if (!detail) {
      return (
        <div
          style={
            styles.detailsLoading
          }
        >
          Order details unavailable.
        </div>
      );
    }

    const items =
      getItems(detail);

    const allAddons =
      getAddons(detail);

    const specialNote =
      detail.order
        ?.special_note ??
      detail.order
        ?.specialNote ??
      "";

    return (
      <div
        style={{
          ...styles.detailsBox,
          ...(isMobile
            ? styles.mobileDetailsBox
            : {}),
        }}
      >
        <div
          style={
            styles.detailsHeading
          }
        >
          ORDER DETAILS
        </div>

        {items.length ===
        0 ? (
          <div
            style={
              styles.detailsLoading
            }
          >
            No items found.
          </div>
        ) : (
          items.map(
            (
              item: any,
              index,
            ) => {
              const itemStatus =
                String(
                  item.status ??
                    "ACTIVE",
                ).toUpperCase();

              const itemAddons =
                getItemAddons(
                  item,
                  allAddons,
                );

              const refundAmount =
                getItemRefundAmount(
                  item,
                  allAddons,
                );

              const itemName =
                item.item_name_snapshot ??
                item.itemNameSnapshot ??
                item.item_name ??
                item.name ??
                "Item";

              const quantity =
                getNumber(
                  item.quantity,
                  1,
                );

              return (
                <div
                  key={
                    item.id ??
                    `${order.id}-${index}`
                  }
                  style={{
                    ...styles.itemRow,
                    ...(itemStatus ===
                    "CANCELLED"
                      ? styles.cancelledItem
                      : {}),
                  }}
                >
                  <div
                    style={
                      styles.itemMain
                    }
                  >
                    <div
                      style={
                        styles.itemName
                      }
                    >
                      {itemName}
                    </div>

                    <div
                      style={
                        styles.quantityBadge
                      }
                    >
                      ×{" "}
                      {quantity}
                    </div>
                  </div>

                  {itemStatus ===
                    "CANCELLED" && (
                    <div
                      style={
                        styles.cancelledText
                      }
                    >
                      CANCELLED
                    </div>
                  )}

                  {itemAddons.length >
                    0 && (
                    <div
                      style={
                        styles.addonList
                      }
                    >
                      <div
                        style={
                          styles.addonHeading
                        }
                      >
                        ADD-ONS
                      </div>

                      {itemAddons.map(
                        (
                          addon: any,
                          addonIndex,
                        ) => {
                          const name =
                            addon.addon_name_snapshot ??
                            addon.addonNameSnapshot ??
                            addon.addon_name ??
                            addon.name ??
                            "Add-on";

                          const addonQuantity =
                            getNumber(
                              addon.quantity,
                              1,
                            );

                          const total =
                            getNumber(
                              addon.addon_total ??
                                addon.addonTotal ??
                                addon.total,
                            );

                          return (
                            <div
                              key={
                                addon.id ??
                                `${item.id}-addon-${addonIndex}`
                              }
                              style={
                                styles.addonRow
                              }
                            >
                              <span
                                style={
                                  styles.addonName
                                }
                              >
                                +{" "}
                                {name}

                                {addonQuantity >
                                1
                                  ? ` × ${addonQuantity}`
                                  : ""}
                              </span>

                              <span
                                style={
                                  styles.addonPrice
                                }
                              >
                                {total >
                                0
                                  ? money(
                                      total,
                                    )
                                  : "Free"}
                              </span>
                            </div>
                          );
                        },
                      )}
                    </div>
                  )}

                  {itemStatus !==
                    "CANCELLED" && (
                    <>
                      <div
                        style={
                          styles.itemRefundValue
                        }
                      >
                        Refund value:{" "}
                        {money(
                          refundAmount,
                        )}
                      </div>

                      {canCancelOrderItem(
                        order,
                      ) &&
                        (permissions.includes(
                          "CANCEL_ORDER",
                        ) ||
                          permissions.includes(
                            "EDIT_ORDER",
                          )) && (
                          <div
                            style={
                              styles.itemCancelRow
                            }
                          >
                            <button
                              type="button"
                              style={
                                styles.cancelButton
                              }
                              onClick={() =>
                                openCancelModal(
                                  order,
                                  item,
                                  allAddons,
                                )
                              }
                            >
                              Cancel Item
                            </button>
                          </div>
                        )}
                    </>
                  )}

                  {itemStatus ===
                    "CANCELLED" && (
                    <div
                      style={
                        styles.cancelInfo
                      }
                    >
                      Reason:{" "}
                      {item.cancellation_reason ??
                        "Not specified"}

                      {item.cancellation_note && (
                        <>
                          <br />
                          Note:{" "}
                          {
                            item.cancellation_note
                          }
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            },
          )
        )}

        {specialNote && (
          <div
            style={
              styles.specialNote
            }
          >
            <strong>
              Note:
            </strong>{" "}
            {specialNote}
          </div>
        )}
      </div>
    );
  }

  /*
   * ============================================================
   * EDIT ITEM DISPLAY
   * ============================================================
   */

  function renderEditItem(
    item: EditableItem,
  ) {
    const addons =
      getAddonsForItem(
        item.itemId,
      );

    return (
      <div
        key={item.key}
        style={
          styles.editItemCard
        }
      >
        <div
          style={
            styles.editItemTop
          }
        >
          <div
            style={
              styles.editItemInfo
            }
          >
            <strong
              style={
                styles.editItemName
              }
            >
              {item.name}
            </strong>

            <span
              style={
                styles.editItemPrice
              }
            >
              {money(
                item.unitPrice,
              )}{" "}
              each
            </span>

            {!item.existing && (
              <span
                style={
                  styles.newItemBadge
                }
              >
                NEW ITEM
              </span>
            )}
          </div>

          <div
            style={
              styles.quantityControls
            }
          >
            <button
              type="button"
              style={
                styles.quantityButton
              }
              disabled={
                editLoading ||
                item.quantity <=
                  1
              }
              onClick={() =>
                changeExistingItemQuantity(
                  item.key,
                  -1,
                )
              }
            >
              −
            </button>

            <strong
              style={
                styles.quantityNumber
              }
            >
              {item.quantity}
            </strong>

            <button
              type="button"
              style={
                styles.quantityButton
              }
              disabled={
                editLoading
              }
              onClick={() =>
                changeExistingItemQuantity(
                  item.key,
                  1,
                )
              }
            >
              +
            </button>
          </div>
        </div>

        {item.existing && (
          <div
            style={
              styles.historicalPriceText
            }
          >
            Existing item price is
            preserved from the
            original order.
          </div>
        )}

        <div
          style={
            styles.editAddonSection
          }
        >
          <div
            style={
              styles.editAddonHeading
            }
          >
            Add-ons
          </div>

          {item.addons.length ===
            0 && (
            <div
              style={
                styles.noAddonText
              }
            >
              No add-ons
            </div>
          )}

          {item.addons.map(
            (addon) => {
              const menuAddon =
                menuAddons.find(
                  (entry) =>
                    entry.id ===
                    addon.addonId,
                );

              return (
                <div
                  key={
                    addon.addonId
                  }
                  style={
                    styles.editAddonRow
                  }
                >
                  <div
                    style={
                      styles.editAddonName
                    }
                  >
                    {menuAddon
                      ?.name ??
                      "Add-on"}

                    <span
                      style={
                        styles.editAddonPrice
                      }
                    >
                      {money(
                        getNumber(
                          menuAddon?.price,
                        ),
                      )}
                    </span>
                  </div>

                  <div
                    style={
                      styles.quantityControls
                    }
                  >
                    <button
                      type="button"
                      style={
                        styles.smallQuantityButton
                      }
                      disabled={
                        editLoading ||
                        addon.quantity <=
                          1
                      }
                      onClick={() =>
                        changeExistingAddonQuantity(
                          item.key,
                          addon.addonId,
                          -1,
                        )
                      }
                    >
                      −
                    </button>

                    <strong
                      style={
                        styles.smallQuantityNumber
                      }
                    >
                      {
                        addon.quantity
                      }
                    </strong>

                    <button
                      type="button"
                      style={
                        styles.smallQuantityButton
                      }
                      disabled={
                        editLoading
                      }
                      onClick={() =>
                        changeExistingAddonQuantity(
                          item.key,
                          addon.addonId,
                          1,
                        )
                      }
                    >
                      +
                    </button>

                    <button
                      type="button"
                      style={
                        styles.removeAddonButton
                      }
                      disabled={
                        editLoading
                      }
                      onClick={() =>
                        removeExistingAddon(
                          item.key,
                          addon.addonId,
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            },
          )}

          <div
            style={
              styles.addAddonRow
            }
          >
            <select
              style={
                styles.smallSelect
              }
              defaultValue=""
              disabled={
                editLoading
              }
              onChange={(
                event,
              ) => {
                if (
                  event.target
                    .value
                ) {
                  addAddonToExistingItem(
                    item.key,
                    event.target
                      .value,
                  );

                  event.target.value =
                    "";
                }
              }}
            >
              <option value="">
                + Add add-on
              </option>

              {addons.map(
                (addon) => (
                  <option
                    key={
                      addon.id
                    }
                    value={
                      addon.id
                    }
                  >
                    {addon.name} —{" "}
                    {getNumber(
                      addon.price,
                    ) >
                    0
                      ? money(
                          getNumber(
                            addon.price,
                          ),
                        )
                      : "Free"}
                  </option>
                ),
              )}
            </select>
          </div>
        </div>
      </div>
    );
  }

  /*
   * ============================================================
   * UI
   * ============================================================
   */

  return (
    <>
      <main
        style={{
          ...styles.page,
          ...(isMobile
            ? styles.mobilePage
            : {}),
        }}
      >
        <div
          style={{
            ...styles.container,
            ...(isMobile
              ? styles.mobileContainer
              : {}),
          }}
        >
          <nav
            style={{
              ...styles.navbar,
              ...(isMobile
                ? styles.mobileNavbar
                : {}),
            }}
          >
            <div
              style={
                styles.navBrand
              }
            >
              Food Stall POS
            </div>

            <div
              style={
                styles.navLinks
              }
            >
              <Link
                href="/"
                style={
                  styles.navLink
                }
              >
                Dashboard
              </Link>

              <Link
                href="/pos"
                style={
                  styles.navLink
                }
              >
                + New Order
              </Link>

              <Link
                href="/orders"
                style={{
                  ...styles.navLink,
                  ...styles.navLinkActive,
                }}
              >
                Orders
              </Link>
            </div>

            <button
              type="button"
              style={
                styles.navLogout
              }
              onClick={
                handleLogout
              }
            >
              Logout
            </button>
          </nav>

          <header
            style={{
              ...styles.header,
              ...(isMobile
                ? styles.mobileHeader
                : {}),
            }}
          >
            <div>
              <h1
                style={{
                  ...styles.title,
                  ...(isMobile
                    ? styles.mobileTitle
                    : {}),
                }}
              >
                Orders
              </h1>

              <p
                style={
                  styles.subtitle
                }
              >
                Logged in as{" "}
                <strong>
                  {userName ||
                    "Staff"}
                </strong>
              </p>
            </div>
          </header>

          {(error ||
            success) && (
            <div
              ref={messageRef}
              style={
                error
                  ? styles.error
                  : styles.success
              }
            >
              {error ||
                success}
            </div>
          )}

          <section
            style={{
              ...styles.statsGrid,
              ...(isMobile
                ? styles.mobileStatsGrid
                : {}),
            }}
          >
            <StatCard
              label="Total"
              value={
                stats.total
              }
            />

            <StatCard
              label="Preparing"
              value={
                stats.preparing
              }
            />

            <StatCard
              label="Ready"
              value={
                stats.ready
              }
            />

            <StatCard
              label="Delivered"
              value={
                stats.delivered
              }
            />

            <StatCard
              label="Cancelled"
              value={
                stats.cancelled
              }
            />

            <StatCard
              label="Current Value"
              value={money(
                stats.currentValue,
              )}
            />
          </section>

          <section
            style={{
              ...styles.toolbar,
              ...(isMobile
                ? styles.mobileToolbar
                : {}),
            }}
          >
            <input
              style={{
                ...styles.search,
                ...(isMobile
                  ? styles.mobileSearch
                  : {}),
              }}
              placeholder="Search token, customer or phone..."
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target
                    .value,
                )
              }
            />

            <div
              style={
                styles.filterRow
              }
            >
              {(
                [
                  "ALL",
                  "PREPARING",
                  "READY",
                  "DELIVERED",
                  "CANCELLED",
                ] as StatusFilter[]
              ).map(
                (status) => (
                  <button
                    key={
                      status
                    }
                    style={
                      statusFilter ===
                      status
                        ? styles.filterActive
                        : styles.filter
                    }
                    onClick={() =>
                      setStatusFilter(
                        status,
                      )
                    }
                  >
                    {status ===
                    "ALL"
                      ? "All"
                      : status}
                  </button>
                ),
              )}
            </div>

            <div
              style={
                styles.filterRow
              }
            >
              {(
                [
                  "ALL",
                  "CASH",
                  "ONLINE",
                  "BOTH",
                ] as PaymentFilter[]
              ).map(
                (payment) => (
                  <button
                    key={
                      payment
                    }
                    style={
                      paymentFilter ===
                      payment
                        ? styles.filterActive
                        : styles.filter
                    }
                    onClick={() =>
                      setPaymentFilter(
                        payment,
                      )
                    }
                  >
                    {payment ===
                    "ALL"
                      ? "All Payments"
                      : payment}
                  </button>
                ),
              )}
            </div>
          </section>

          <section>
            <div
              style={
                styles.ordersHeader
              }
            >
              <div>
                <h2
                  style={
                    styles.sectionTitle
                  }
                >
                  Orders{" "}
                  <span
                    style={
                      styles.liveText
                    }
                  >
                    ● Live
                  </span>
                </h2>
              </div>

              <span
                style={
                  styles.muted
                }
              >
                {
                  filteredOrders.length
                }{" "}
                shown
              </span>
            </div>

            {loading ? (
              <div
                style={
                  styles.empty
                }
              >
                Loading orders...
              </div>
            ) : filteredOrders.length ===
              0 ? (
              <div
                style={
                  styles.empty
                }
              >
                No orders found.
              </div>
            ) : (
              <div
                style={
                  styles.orderList
                }
              >
                {filteredOrders.map(
                  (order) => {
                    const status =
                      String(
                        order.status ??
                          "",
                      ).toUpperCase();

                    const isExpanded =
                      Boolean(
                        expandedOrders[
                          order.id
                        ],
                      );

                    const isLoading =
                      actionLoading ===
                      order.id;

                    const currentValue =
                      getCurrentOrderValue(
                        order,
                      );

                    return (
                      <article
                        key={
                          order.id
                        }
                        style={{
                          ...styles.orderCard,
                          ...(isMobile
                            ? styles.mobileOrderCard
                            : {}),
                        }}
                      >
                        <div
                          style={{
                            ...styles.orderMain,
                            ...(isMobile
                              ? styles.mobileOrderMain
                              : {}),
                          }}
                        >
                          <div
                            style={{
                              ...styles.token,
                              ...(isMobile
                                ? styles.mobileToken
                                : {}),
                            }}
                          >
                            #
                            {
                              order.token_number
                            }
                          </div>

                          <div
                            style={
                              styles.customer
                            }
                          >
                            <strong
                              style={
                                isMobile
                                  ? styles.mobileCustomerName
                                  : undefined
                              }
                            >
                              {
                                order.customer_name ??
                                "Walk-in Customer"
                              }
                            </strong>

                            {order.customer_phone && (
                              <span
                                style={
                                  styles.muted
                                }
                              >
                                {
                                  order.customer_phone
                                }
                              </span>
                            )}
                          </div>

                          <div
                            style={{
                              ...styles.statusBadge,
                              ...(status ===
                              "CANCELLED"
                                ? styles.cancelledBadge
                                : status ===
                                    "DELIVERED"
                                  ? styles.deliveredBadge
                                  : status ===
                                      "READY"
                                    ? styles.readyBadge
                                    : styles.preparingBadge),
                            }}
                          >
                            {status}
                          </div>

                          <div
                            style={
                              styles.payment
                            }
                          >
                            {
                              order.payment_mode
                            }
                          </div>

                          <div
                            style={
                              styles.amount
                            }
                          >
                            {money(
                              currentValue,
                            )}
                          </div>
                        </div>

                        <div
                          style={
                            styles.detailsToggleRow
                          }
                        >
                          <button
                            type="button"
                            style={
                              styles.detailsButton
                            }
                            onClick={() =>
                              window.location.href =
                                `/orders/${order.id}`
                            }
                          >
                            Order Details
                          </button>

                          {canEditOrder(
                            order,
                          ) &&
                            permissions.includes(
                              "EDIT_ORDER",
                            ) && (
                              <button
                                type="button"
                                style={
                                  styles.editButton
                                }
                                onClick={() =>
                                  openEditOrder(
                                    order,
                                  )
                                }
                              >
                                Edit Order
                              </button>
                            )}

                          {status ===
                            "DELIVERED" && (
                            <span
                              style={
                                styles.lockedText
                              }
                            >
                              Delivered
                            </span>
                          )}

                          {status ===
                            "CANCELLED" && (
                            <span
                              style={
                                styles.cancelledTextTop
                              }
                            >
                              Cancelled
                            </span>
                          )}
                        </div>

                        {isExpanded &&
                          renderOrderDetails(
                            order,
                          )}

                        {status ===
                          "PREPARING" && (
                          <div
                            style={
                              styles.orderActions
                            }
                          >
                            <button
                              style={
                                styles.actionButton
                              }
                              disabled={
                                isLoading
                              }
                              onClick={() =>
                                changeStatus(
                                  order.id,
                                  "READY",
                                )
                              }
                            >
                              {isLoading
                                ? "Updating..."
                                : "Mark Ready"}
                            </button>
                          </div>
                        )}

                        {status ===
                          "READY" && (
                          <div
                            style={
                              styles.orderActions
                            }
                          >
                            <button
                              style={
                                styles.actionButton
                              }
                              disabled={
                                isLoading
                              }
                              onClick={() =>
                                changeStatus(
                                  order.id,
                                  "DELIVERED",
                                )
                              }
                            >
                              {isLoading
                                ? "Updating..."
                                : "Mark Delivered"}
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  },
                )}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* ========================================================
          CANCEL ITEM MODAL
          ======================================================== */}

      {cancelTarget && (
        <div
          style={
            styles.modalBackdrop
          }
        >
          <div
            style={{
              ...styles.modal,
              ...(isMobile
                ? styles.mobileModal
                : {}),
            }}
          >
            <div
              style={
                styles.modalHeader
              }
            >
              <div>
                <h2
                  style={
                    styles.modalTitle
                  }
                >
                  Cancel Item
                </h2>

                <p
                  style={
                    styles.modalSubtitle
                  }
                >
                  {
                    cancelTarget.itemName
                  }
                </p>
              </div>

              <button
                type="button"
                style={
                  styles.closeButton
                }
                disabled={
                  cancelLoading
                }
                onClick={() =>
                  setCancelTarget(
                    null,
                  )
                }
              >
                ×
              </button>
            </div>

            <div
              style={
                styles.cancelSummary
              }
            >
              <span>
                Refund
              </span>

              <strong>
                {money(
                  cancelTarget.amount,
                )}
              </strong>
            </div>

            <label
              style={
                styles.fieldLabel
              }
            >
              Cancellation Reason
            </label>

            <select
              style={
                styles.modalInput
              }
              value={
                cancelReason
              }
              onChange={(
                event,
              ) =>
                setCancelReason(
                  event.target
                    .value as CancellationReason,
                )
              }
              disabled={
                cancelLoading
              }
            >
              <option value="CUSTOMER_CHANGED_MIND">
                Customer changed mind
              </option>

              <option value="ITEM_NOT_REQUIRED">
                Item not required
              </option>

              <option value="WRONG_ITEM_SELECTED">
                Wrong item selected
              </option>

              <option value="OTHER">
                Other
              </option>
            </select>

            <label
              style={
                styles.fieldLabel
              }
            >
              Note
            </label>

            <textarea
              style={
                styles.modalInput
              }
              rows={3}
              placeholder="Optional note"
              value={
                cancelNote
              }
              onChange={(
                event,
              ) =>
                setCancelNote(
                  event.target
                    .value,
                )
              }
              disabled={
                cancelLoading
              }
            />

            {cancelTarget.paymentMode ===
              "BOTH" && (
              <>
                <label
                  style={
                    styles.fieldLabel
                  }
                >
                  Refund Method
                </label>

                <div
                  style={
                    styles.refundButtons
                  }
                >
                  <button
                    type="button"
                    style={
                      refundMethod ===
                      "CASH"
                        ? styles.refundActive
                        : styles.refundButton
                    }
                    onClick={() =>
                      setRefundMethod(
                        "CASH",
                      )
                    }
                  >
                    Cash
                  </button>

                  <button
                    type="button"
                    style={
                      refundMethod ===
                      "ONLINE"
                        ? styles.refundActive
                        : styles.refundButton
                    }
                    onClick={() =>
                      setRefundMethod(
                        "ONLINE",
                      )
                    }
                  >
                    Online
                  </button>
                </div>
              </>
            )}

            <div
              style={
                styles.modalActions
              }
            >
              <button
                type="button"
                style={
                  styles.keepButton
                }
                disabled={
                  cancelLoading
                }
                onClick={() =>
                  setCancelTarget(
                    null,
                  )
                }
              >
                Keep Item
              </button>

              <button
                type="button"
                style={
                  styles.confirmCancelButton
                }
                disabled={
                  cancelLoading
                }
                onClick={
                  cancelItem
                }
              >
                {cancelLoading
                  ? "Cancelling..."
                  : "Cancel & Refund"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          EDIT ORDER MODAL
          ======================================================== */}

      {editTarget && (
        <div
          style={
            styles.modalBackdrop
          }
        >
          <div
            style={{
              ...styles.editModal,
              ...(isMobile
                ? styles.mobileEditModal
                : {}),
            }}
          >
            <div
              style={
                styles.modalHeader
              }
            >
              <div>
                <h2
                  style={
                    styles.modalTitle
                  }
                >
                  Edit Order
                </h2>

                <p
                  style={
                    styles.modalSubtitle
                  }
                >
                  Change customer
                  details, quantities,
                  add-ons or add new
                  items.
                </p>
              </div>

              <button
                type="button"
                style={
                  styles.closeButton
                }
                disabled={
                  editLoading
                }
                onClick={
                  closeEditOrder
                }
              >
                ×
              </button>
            </div>

            {/* CUSTOMER */}

            <div
              style={
                styles.editSection
              }
            >
              <div
                style={
                  styles.editSectionTitle
                }
              >
                Customer
              </div>

              <label
                style={
                  styles.fieldLabel
                }
              >
                Customer Name
              </label>

              <input
                style={
                  styles.modalInput
                }
                value={
                  editCustomerName
                }
                onChange={(
                  event,
                ) =>
                  setEditCustomerName(
                    event.target
                      .value,
                  )
                }
                disabled={
                  editLoading
                }
              />

              <label
                style={
                  styles.fieldLabel
                }
              >
                Customer Phone
              </label>

              <input
                style={
                  styles.modalInput
                }
                inputMode="numeric"
                value={
                  editCustomerPhone
                }
                onChange={(
                  event,
                ) =>
                  setEditCustomerPhone(
                    event.target
                      .value,
                  )
                }
                disabled={
                  editLoading
                }
              />

              <label
                style={
                  styles.fieldLabel
                }
              >
                Special Note
              </label>

              <textarea
                style={
                  styles.modalInput
                }
                rows={3}
                value={
                  editSpecialNote
                }
                onChange={(
                  event,
                ) =>
                  setEditSpecialNote(
                    event.target
                      .value,
                  )
                }
                disabled={
                  editLoading
                }
              />
            </div>

            {/* ITEMS */}

            <div
              style={
                styles.editSection
              }
            >
              <div
                style={
                  styles.editSectionHeader
                }
              >
                <div>
                  <div
                    style={
                      styles.editSectionTitle
                    }
                  >
                    Items
                  </div>

                  <div
                    style={
                      styles.editSectionHint
                    }
                  >
                    Existing prices are
                    preserved. New
                    items use the
                    current menu price.
                  </div>
                </div>

                <button
                  type="button"
                  style={
                    styles.addItemButton
                  }
                  disabled={
                    editLoading ||
                    menuLoading
                  }
                  onClick={
                    startAddingItem
                  }
                >
                  + Add Item
                </button>
              </div>

              {menuLoading && (
                <div
                  style={
                    styles.menuLoading
                  }
                >
                  Loading menu...
                </div>
              )}

              <div
                style={
                  styles.editItemsList
                }
              >
                {editItems.map(
                  (
                    item,
                  ) =>
                    renderEditItem(
                      item,
                    ),
                )}
              </div>

              {editItems.length ===
                0 && (
                <div
                  style={
                    styles.noEditItems
                  }
                >
                  No active items.
                  Add a new item or
                  close this window
                  and use Cancel Item
                  only when appropriate.
                </div>
              )}

              {/* ADD NEW ITEM */}

              {newItemDraft && (
                <div
                  style={
                    styles.newItemPanel
                  }
                >
                  <div
                    style={
                      styles.newItemPanelHeader
                    }
                  >
                    <strong>
                      Add New Item
                    </strong>

                    <button
                      type="button"
                      style={
                        styles.closeMiniButton
                      }
                      onClick={
                        cancelAddingItem
                      }
                    >
                      ×
                    </button>
                  </div>

                  <label
                    style={
                      styles.fieldLabel
                    }
                  >
                    Category
                  </label>

                  <select
                    style={
                      styles.modalInput
                    }
                    value={
                      editCategory
                    }
                    onChange={(
                      event,
                    ) =>
                      handleNewItemCategoryChange(
                        event.target.value,
                      )
                    }
                  >
                    <option value="ALL">
                      All Categories
                    </option>

                    {menuCategories.map(
                      (
                        category,
                      ) => (
                        <option
                          key={
                            category.id
                          }
                          value={
                            category.id
                          }
                        >
                          {
                            category.name
                          }
                        </option>
                      ),
                    )}
                  </select>

                  <label
                    style={
                      styles.fieldLabel
                    }
                  >
                    Food Item
                  </label>

                  <select
                    style={
                      styles.modalInput
                    }
                    value={
                      newItemDraft.itemId
                    }
                    onChange={(
                      event,
                    ) =>
                      setNewItemDraft(
                        (
                          current,
                        ) =>
                          current
                            ? {
                                ...current,
                                itemId:
                                  event
                                    .target
                                    .value,
                              }
                            : current,
                      )
                    }
                  >
                    <option value="">
                      Select food item
                    </option>

                    {filteredEditMenuItems.map(
                      (
                        item,
                      ) => (
                        <option
                          key={
                            item.id
                          }
                          value={
                            item.id
                          }
                        >
                          {
                            item.name
                          }{" "}
                          —{" "}
                          {money(
                            getNumber(
                              item.price,
                            ),
                          )}
                        </option>
                      ),
                    )}
                  </select>

                  <div
                    style={
                      styles.newItemQuantityRow
                    }
                  >
                    <span>
                      Quantity
                    </span>

                    <div
                      style={
                        styles.quantityControls
                      }
                    >
                      <button
                        type="button"
                        style={
                          styles.quantityButton
                        }
                        onClick={() =>
                          updateNewItemQuantity(
                            -1,
                          )
                        }
                      >
                        −
                      </button>

                      <strong
                        style={
                          styles.quantityNumber
                        }
                      >
                        {
                          newItemDraft.quantity
                        }
                      </strong>

                      <button
                        type="button"
                        style={
                          styles.quantityButton
                        }
                        onClick={() =>
                          updateNewItemQuantity(
                            1,
                          )
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div
                    style={
                      styles.newAddonBuilder
                    }
                  >
                    <div
                      style={
                        styles.editAddonHeading
                      }
                    >
                      Add-ons
                    </div>

                    <div
                      style={
                        styles.newAddonControls
                      }
                    >
                      <select
                        style={
                          styles.smallSelect
                        }
                        value={
                          newItemAddonId
                        }
                        disabled={
                          editLoading ||
                          !newItemDraft?.itemId
                        }
                        onChange={(
                          event,
                        ) =>
                          setNewItemAddonId(
                            event
                              .target
                              .value,
                          )
                        }
                      >
                        <option value="">
                          Select add-on
                        </option>

                        {menuAddons.map(
                          (
                            addon,
                          ) => (
                            <option
                              key={
                                addon.id
                              }
                              value={
                                addon.id
                              }
                            >
                              {
                                addon.name
                              }{" "}
                              —{" "}
                              {getNumber(
                                addon.price,
                              ) >
                              0
                                ? money(
                                    getNumber(
                                      addon.price,
                                    ),
                                  )
                                : "Free"}
                            </option>
                          ),
                        )}
                      </select>

                      <input
                        style={
                          styles.addonQuantityInput
                        }
                        type="number"
                        min="1"
                        value={
                          newItemAddonQuantity
                        }
                        onChange={(
                          event,
                        ) =>
                          setNewItemAddonQuantity(
                            Math.max(
                              1,
                              getNumber(
                                event
                                  .target
                                  .value,
                                1,
                              ),
                            ),
                          )
                        }
                      />

                      <button
                        type="button"
                        style={
                          styles.smallPrimaryButton
                        }
                        onClick={
                          addAddonToNewItem
                        }
                      >
                        Add
                      </button>
                    </div>

                    {newItemDraft
                      .addons.length >
                      0 && (
                      <div
                        style={
                          styles.newAddonList
                        }
                      >
                        {newItemDraft.addons.map(
                          (
                            addon,
                          ) => {
                            const menuAddon =
                              menuAddons.find(
                                (
                                  entry,
                                ) =>
                                  entry.id ===
                                  addon.addonId,
                              );

                            return (
                              <div
                                key={
                                  addon.addonId
                                }
                                style={
                                  styles.editAddonRow
                                }
                              >
                                <div
                                  style={
                                    styles.editAddonName
                                  }
                                >
                                  {
                                    menuAddon?.name
                                  }
                                </div>

                                <div
                                  style={
                                    styles.quantityControls
                                  }
                                >
                                  <button
                                    type="button"
                                    style={
                                      styles.smallQuantityButton
                                    }
                                    onClick={() =>
                                      changeNewItemAddonQuantity(
                                        addon.addonId,
                                        -1,
                                      )
                                    }
                                  >
                                    −
                                  </button>

                                  <strong
                                    style={
                                      styles.smallQuantityNumber
                                    }
                                  >
                                    {
                                      addon.quantity
                                    }
                                  </strong>

                                  <button
                                    type="button"
                                    style={
                                      styles.smallQuantityButton
                                    }
                                    onClick={() =>
                                      changeNewItemAddonQuantity(
                                        addon.addonId,
                                        1,
                                      )
                                    }
                                  >
                                    +
                                  </button>

                                  <button
                                    type="button"
                                    style={
                                      styles.removeAddonButton
                                    }
                                    onClick={() =>
                                      removeNewItemAddon(
                                        addon.addonId,
                                      )
                                    }
                                  >
                                    ×
                                  </button>
                                </div>
                              </div>
                            );
                          },
                        )}
                      </div>
                    )}
                  </div>

                  <div
                    style={
                      styles.newItemActions
                    }
                  >
                    <button
                      type="button"
                      style={
                        styles.keepButton
                      }
                      onClick={
                        cancelAddingItem
                      }
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      style={
                        styles.saveButton
                      }
                      disabled={
                        editLoading ||
                        !newItemDraft?.itemId
                      }
                      onClick={
                        confirmNewItem
                      }
                    >
                      Add To Order
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* TOTALS */}

            <div
              style={
                styles.editTotalsBox
              }
            >
              <div
                style={
                  styles.totalLine
                }
              >
                <span>
                  Original Active
                  Value
                </span>

                <strong>
                  {money(
                    editOriginalValue,
                  )}
                </strong>
              </div>

              <div
                style={
                  styles.totalLine
                }
              >
                <span>
                  New Order Value
                </span>

                <strong>
                  {money(
                    editTotals,
                  )}
                </strong>
              </div>

              <div
                style={{
                  ...styles.differenceLine,
                  ...(editHasIncrease
                    ? styles.increaseLine
                    : editHasDecrease
                      ? styles.decreaseLine
                      : styles.noChangeLine),
                }}
              >
                <span>
                  {editHasIncrease
                    ? "Additional Payment"
                    : editHasDecrease
                      ? "Refund"
                      : "No Payment Change"}
                </span>

                <strong>
                  {money(
                    Math.abs(
                      editDifference,
                    ),
                  )}
                </strong>
              </div>
            </div>

            {/* ADDITIONAL PAYMENT */}

            {editHasIncrease && (
              <div
                style={
                  styles.paymentSection
                }
              >
                <div
                  style={
                    styles.editSectionTitle
                  }
                >
                  Additional Payment
                </div>

                <div
                  style={
                    styles.paymentNotice
                  }
                >
                  Additional amount
                  required:{" "}
                  <strong>
                    {money(
                      editDifference,
                    )}
                  </strong>
                </div>

                <label
                  style={
                    styles.fieldLabel
                  }
                >
                  Payment Mode
                </label>

                <div
                  style={
                    styles.paymentModeGrid
                  }
                >
                  {(
                    [
                      "CASH",
                      "ONLINE",
                      "BOTH",
                    ] as PaymentMode[]
                  ).map(
                    (mode) => (
                      <button
                        type="button"
                        key={
                          mode
                        }
                        style={
                          editPaymentMode ===
                          mode
                            ? styles.refundActive
                            : styles.refundButton
                        }
                        onClick={() => {
                          setEditPaymentMode(
                            mode,
                          );
                          setEditPaymentError("");
                          setError("");
                        }}
                      >
                        {mode}
                      </button>
                    ),
                  )}
                </div>

                {(editPaymentMode ===
                  "CASH" ||
                  editPaymentMode ===
                    "BOTH") && (
                  <>
                    <label
                      style={
                        styles.fieldLabel
                      }
                    >
                      Cash Received
                    </label>

                    <input
                      style={
                        styles.modalInput
                      }
                      type="number"
                      min="0"
                      step="0.01"
                      value={
                        editCashReceived
                      }
                      onChange={(
                        event,
                      ) => {
                        setEditCashReceived(
                          event
                            .target
                            .value,
                        );
                        setEditPaymentError("");
                      }}
                    />
                  </>
                )}

                {(editPaymentMode ===
                  "ONLINE" ||
                  editPaymentMode ===
                    "BOTH") && (
                  <>
                    <label
                      style={
                        styles.fieldLabel
                      }
                    >
                      Online Received
                    </label>

                    <input
                      style={
                        styles.modalInput
                      }
                      type="number"
                      min="0"
                      step="0.01"
                      value={
                        editOnlineReceived
                      }
                      onChange={(
                        event,
                      ) => {
                        setEditOnlineReceived(
                          event
                            .target
                            .value,
                        );
                        setEditPaymentError("");
                      }}
                    />

                    <label
                      style={
                        styles.fieldLabel
                      }
                    >
                      Transaction
                      Reference
                    </label>

                    <input
                      style={
                        styles.modalInput
                      }
                      value={
                        editTransactionReference
                      }
                      onChange={(
                        event,
                      ) => {
                        setEditTransactionReference(
                          event
                            .target
                            .value,
                        );
                        setEditPaymentError("");
                      }}
                      placeholder="UPI / transaction reference"
                    />

                    <div
                      style={
                        styles.paymentProofBox
                      }
                    >
                      <div
                        style={
                          styles.paymentProofHeader
                        }
                      >
                        <div>
                          <div
                            style={
                              styles.paymentProofTitle
                            }
                          >
                            Online Payment Proof
                          </div>

                          <div
                            style={
                              styles.paymentProofHint
                            }
                          >
                            Capture a photo of the
                            successful payment screen.
                          </div>
                        </div>

                        {editPaymentProof && (
                          <span
                            style={
                              styles.paymentProofBadge
                            }
                          >
                            Captured
                          </span>
                        )}
                      </div>

                      {editCameraOpen ? (
                        <div
                          style={
                            styles.cameraContainer
                          }
                        >
                          <video
                            ref={
                              editVideoRef
                            }
                            autoPlay
                            muted
                            playsInline
                            style={
                              styles.cameraVideo
                            }
                          />

                          <div
                            style={
                              styles.cameraActions
                            }
                          >
                            <button
                              type="button"
                              style={
                                styles.captureButton
                              }
                              onClick={
                                captureEditPaymentProof
                              }
                            >
                              Capture Photo
                            </button>

                            <button
                              type="button"
                              style={
                                styles.cancelCameraButton
                              }
                              onClick={
                                stopEditCamera
                              }
                            >
                              Close Camera
                            </button>
                          </div>
                        </div>
                      ) : editPaymentProof ? (
                        <div
                          style={
                            styles.paymentProofPreviewBox
                          }
                        >
                          <img
                            src={
                              editPaymentProof
                            }
                            alt="Additional payment proof"
                            style={
                              styles.paymentProofPreview
                            }
                          />

                          <div
                            style={
                              styles.paymentProofActions
                            }
                          >
                            <button
                              type="button"
                              style={
                                styles.captureButton
                              }
                              onClick={
                                openEditCamera
                              }
                            >
                              Retake Photo
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          style={
                            styles.captureProofButton
                          }
                          onClick={
                            openEditCamera
                          }
                        >
                          📷 Capture Payment Proof
                        </button>
                      )}

                      {editPaymentError && (
                        <div
                          style={
                            styles.paymentInlineError
                          }
                        >
                          {editPaymentError}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {editPaymentError &&
                  editPaymentMode ===
                    "CASH" && (
                  <div
                    style={
                      styles.paymentInlineError
                    }
                  >
                    {editPaymentError}
                  </div>
                )}

                <div
                  style={
                    styles.paymentCalculation
                  }
                >
                  <span>
                    Total Received
                  </span>

                  <strong>
                    {money(
                      editPaymentTotal,
                    )}
                  </strong>

                  <span>
                    Change
                  </span>

                  <strong>
                    {money(
                      editPaymentChange,
                    )}
                  </strong>

                  <span>
                    Remaining
                  </span>

                  <strong
                    style={
                      editPaymentShortfall >
                      0
                        ? styles.dangerText
                        : styles.successText
                    }
                  >
                    {money(
                      editPaymentShortfall,
                    )}
                  </strong>
                </div>
              </div>
            )}

            {/* REFUND */}

            {editHasDecrease && (
              <div
                style={
                  styles.refundSection
                }
              >
                <div
                  style={
                    styles.editSectionTitle
                  }
                >
                  Refund
                </div>

                <div
                  style={
                    styles.paymentNotice
                  }
                >
                  Refund amount:{" "}
                  <strong>
                    {money(
                      Math.abs(
                        editDifference,
                      ),
                    )}
                  </strong>
                </div>

                <label
                  style={
                    styles.fieldLabel
                  }
                >
                  Refund Method
                </label>

                <div
                  style={
                    styles.paymentModeGrid
                  }
                >
                  <button
                    type="button"
                    style={
                      editRefundMethod ===
                      "CASH"
                        ? styles.refundActive
                        : styles.refundButton
                    }
                    onClick={() =>
                      setEditRefundMethod(
                        "CASH",
                      )
                    }
                  >
                    Cash
                  </button>

                  <button
                    type="button"
                    style={
                      editRefundMethod ===
                      "ONLINE"
                        ? styles.refundActive
                        : styles.refundButton
                    }
                    onClick={() =>
                      setEditRefundMethod(
                        "ONLINE",
                      )
                    }
                  >
                    Online
                  </button>
                </div>

                <label
                  style={
                    styles.fieldLabel
                  }
                >
                  Refund Reason
                </label>

                <select
                  style={
                    styles.modalInput
                  }
                  value={
                    editRefundReason
                  }
                  onChange={(
                    event,
                  ) =>
                    setEditRefundReason(
                      event
                        .target
                        .value as CancellationReason,
                    )
                  }
                >
                  <option value="CUSTOMER_CHANGED_MIND">
                    Customer changed mind
                  </option>

                  <option value="ITEM_NOT_REQUIRED">
                    Item not required
                  </option>

                  <option value="WRONG_ITEM_SELECTED">
                    Wrong item selected
                  </option>

                  <option value="OTHER">
                    Other
                  </option>
                </select>

                <label
                  style={
                    styles.fieldLabel
                  }
                >
                  Refund Note
                </label>

                <textarea
                  style={
                    styles.modalInput
                  }
                  rows={3}
                  value={
                    editRefundNote
                  }
                  onChange={(
                    event,
                  ) =>
                    setEditRefundNote(
                      event
                        .target
                        .value,
                    )
                  }
                  placeholder="Optional refund note"
                />
              </div>
            )}

            {/* FINAL ACTIONS */}

            <div
              style={
                styles.modalActions
              }
            >
              <button
                type="button"
                style={
                  styles.keepButton
                }
                disabled={
                  editLoading
                }
                onClick={
                  closeEditOrder
                }
              >
                Cancel
              </button>

              <button
                type="button"
                style={
                  styles.saveButton
                }
                disabled={
                  editLoading ||
                  (editHasIncrease &&
                    editPaymentShortfall >
                      0)
                }
                onClick={
                  saveEditOrder
                }
              >
                {editLoading
                  ? "Saving..."
                  : editHasIncrease
                    ? "Save & Take Payment"
                    : editHasDecrease
                      ? "Save & Refund"
                      : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/*
 * ==============================================================
 * STAT CARD
 * ==============================================================
 */

function StatCard({
  label,
  value,
}: {
  label: string;
  value:
    | string
    | number;
}) {
  return (
    <div
      style={
        styles.statCard
      }
    >
      <span
        style={
          styles.statLabel
        }
      >
        {label}
      </span>

      <strong
        style={
          styles.statValue
        }
      >
        {value}
      </strong>
    </div>
  );
}

/*
 * ==============================================================
 * STYLES
 * ==============================================================
 */

const styles: Record<
  string,
  React.CSSProperties
> = {
  page: {
    minHeight: "100vh",
    background: "#f5f6f8",
    padding: 16,
    boxSizing: "border-box",
  },

  mobilePage: {
    padding: 3,
  },

  container: {
    width: "100%",
    maxWidth: 1200,
    margin: "0 auto",
    background: "#fff",
    borderRadius: 18,
    padding: 20,
    boxSizing: "border-box",
  },

  mobileContainer: {
    padding: 7,
    borderRadius: 9,
  },

  navbar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: 7,
    marginBottom: 14,
    border:
      "1px solid #e5e7eb",
    borderRadius: 9,
    background: "#f8fafc",
  },

  mobileNavbar: {
    padding: 5,
    gap: 5,
    marginBottom: 8,
    overflowX: "auto",
  },

  navBrand: {
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap",
  },

  navLinks: {
    display: "flex",
    gap: 4,
    flex: 1,
  },

  navLink: {
    textDecoration:
      "none",
    color: "#334155",
    padding:
      "6px 9px",
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 700,
    whiteSpace:
      "nowrap",
  },

  navLinkActive: {
    background: "#111827",
    color: "#fff",
  },

  navLogout: {
    border:
      "1px solid #d1d5db",
    background: "#fff",
    borderRadius: 6,
    padding:
      "6px 9px",
    fontSize: 10,
    cursor:
      "pointer",
    fontWeight: 700,
  },

  header: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems:
      "center",
    gap: 16,
    marginBottom: 18,
  },

  mobileHeader: {
    marginBottom: 9,
  },

  title: {
    margin: 0,
    fontSize: 32,
    lineHeight: 1.15,
  },

  mobileTitle: {
    fontSize: 20,
  },

  subtitle: {
    margin:
      "4px 0 0",
    color: "#6b7280",
    fontSize: 13,
  },

  error: {
    padding: 9,
    marginBottom: 9,
    borderRadius: 8,
    background: "#fef2f2",
    color: "#b91c1c",
    border:
      "1px solid #fecaca",
    fontSize: 12,
    fontWeight: 700,
    scrollMarginTop: 10,
  },

  success: {
    padding: 9,
    marginBottom: 9,
    borderRadius: 8,
    background: "#ecfdf5",
    color: "#047857",
    border:
      "1px solid #a7f3d0",
    fontSize: 12,
    fontWeight: 700,
    scrollMarginTop: 10,
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit,minmax(150px,1fr))",
    gap: 7,
    marginBottom: 15,
  },

  mobileStatsGrid: {
    gridTemplateColumns:
      "repeat(2,minmax(0,1fr))",
    gap: 5,
    marginBottom: 8,
  },

  statCard: {
    padding: 9,
    border:
      "1px solid #e5e7eb",
    borderRadius: 9,
    background: "#fff",
  },

  statLabel: {
    display: "block",
    color: "#6b7280",
    fontSize: 9,
    marginBottom: 3,
  },

  statValue: {
    fontSize: 16,
  },

  toolbar: {
    padding: 11,
    border:
      "1px solid #e5e7eb",
    borderRadius: 10,
    marginBottom: 14,
  },

  mobileToolbar: {
    padding: 6,
    marginBottom: 8,
  },

  search: {
    width: "100%",
    boxSizing:
      "border-box",
    padding: 9,
    border:
      "1px solid #d1d5db",
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 7,
    outline: "none",
  },

  mobileSearch: {
    padding: 8,
    fontSize: 12,
  },

  filterRow: {
    display: "flex",
    gap: 5,
    flexWrap:
      "wrap",
    marginBottom: 5,
  },

  filter: {
    padding:
      "6px 9px",
    border:
      "1px solid #d1d5db",
    borderRadius: 16,
    background: "#fff",
    cursor:
      "pointer",
    fontSize: 10,
    whiteSpace:
      "nowrap",
  },

  filterActive: {
    padding:
      "6px 9px",
    border:
      "1px solid #111827",
    borderRadius: 16,
    background: "#111827",
    color: "#fff",
    cursor:
      "pointer",
    fontSize: 10,
    whiteSpace:
      "nowrap",
  },

  ordersHeader: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems:
      "center",
    marginBottom: 7,
  },

  sectionTitle: {
    margin: 0,
    fontSize: 20,
    display: "inline",
  },

  liveText: {
    color: "#16a34a",
    fontSize: 10,
    fontWeight: 700,
    marginLeft: 5,
  },

  muted: {
    color: "#6b7280",
    fontSize: 10,
  },

  empty: {
    padding: 30,
    textAlign:
      "center",
    color: "#64748b",
    fontSize: 12,
    border:
      "1px solid #e5e7eb",
    borderRadius: 10,
  },

  orderList: {
    display: "flex",
    flexDirection:
      "column",
    gap: 6,
  },

  orderCard: {
    border:
      "1px solid #e5e7eb",
    borderRadius: 11,
    padding: 11,
    background: "#fff",
    boxSizing:
      "border-box",
  },

  mobileOrderCard: {
    padding: 7,
    borderRadius: 8,
  },

  orderMain: {
    display: "grid",
    gridTemplateColumns:
      "65px minmax(150px,1fr) 100px 80px 100px",
    alignItems:
      "center",
    gap: 8,
  },

  mobileOrderMain: {
    gridTemplateColumns:
      "32px minmax(0,1fr) auto",
    gridTemplateRows:
      "auto auto",
    gap: "2px 5px",
  },

  token: {
    fontSize: 19,
    fontWeight: 800,
  },

  mobileToken: {
    fontSize: 14,
  },

  customer: {
    display: "flex",
    flexDirection:
      "column",
    gap: 1,
    minWidth: 0,
  },

  mobileCustomerName: {
    fontSize: 11,
    overflow:
      "hidden",
    textOverflow:
      "ellipsis",
    whiteSpace:
      "nowrap",
  },

  statusBadge: {
    fontSize: 10,
    fontWeight: 800,
  },

  preparingBadge: {
    color: "#c2410c",
  },

  readyBadge: {
    color: "#2563eb",
  },

  deliveredBadge: {
    color: "#047857",
  },

  cancelledBadge: {
    color: "#dc2626",
  },

  payment: {
    color: "#6b7280",
    fontSize: 11,
  },

  amount: {
    textAlign: "right",
    fontSize: 15,
    fontWeight: 800,
  },

  detailsToggleRow: {
    display: "flex",
    alignItems:
      "center",
    gap: 6,
    marginTop: 7,
    flexWrap:
      "wrap",
  },

  detailsButton: {
    padding:
      "5px 8px",
    border:
      "1px solid #d1d5db",
    borderRadius: 6,
    background: "#f8fafc",
    color: "#334155",
    cursor:
      "pointer",
    fontSize: 10,
    fontWeight: 700,
  },

  editButton: {
    padding:
      "5px 8px",
    border:
      "1px solid #2563eb",
    borderRadius: 6,
    background: "#fff",
    color: "#2563eb",
    cursor:
      "pointer",
    fontSize: 10,
    fontWeight: 700,
  },

  lockedText: {
    color: "#047857",
    fontSize: 9,
    fontWeight: 800,
  },

  cancelledTextTop: {
    color: "#dc2626",
    fontSize: 9,
    fontWeight: 800,
  },

  detailsBox: {
    marginTop: 7,
    padding: 9,
    borderRadius: 8,
    background: "#f8fafc",
    border:
      "1px solid #eef2f7",
  },

  mobileDetailsBox: {
    marginTop: 5,
    padding: 7,
  },

  detailsHeading: {
    fontSize: 9,
    fontWeight: 800,
    color: "#64748b",
    letterSpacing:
      "0.05em",
    marginBottom: 4,
  },

  detailsLoading: {
    marginTop: 6,
    padding: 7,
    borderRadius: 7,
    background: "#f8fafc",
    color: "#64748b",
    fontSize: 10,
  },

  itemRow: {
    padding:
      "7px 0",
    borderBottom:
      "1px solid #e5e7eb",
  },

  itemMain: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems:
      "center",
    gap: 8,
  },

  itemName: {
    fontSize: 13,
    fontWeight: 700,
    minWidth: 0,
    overflow:
      "hidden",
    textOverflow:
      "ellipsis",
  },

  quantityBadge: {
    fontSize: 13,
    fontWeight: 800,
    whiteSpace:
      "nowrap",
  },

  addonList: {
    marginTop: 5,
    paddingLeft: 8,
    borderLeft:
      "2px solid #dbeafe",
  },

  addonHeading: {
    color: "#2563eb",
    fontSize: 9,
    fontWeight: 800,
    marginBottom: 2,
  },

  addonRow: {
    display: "flex",
    justifyContent:
      "space-between",
    gap: 8,
    color: "#64748b",
    fontSize: 10,
    marginTop: 2,
  },

  addonName: {
    fontWeight: 600,
  },

  addonPrice: {
    fontWeight: 700,
    whiteSpace:
      "nowrap",
  },

  cancelledItem: {
    opacity: 0.55,
  },

  cancelledText: {
    color: "#dc2626",
    fontSize: 9,
    fontWeight: 800,
    marginTop: 2,
  },

  cancelInfo: {
    marginTop: 5,
    color: "#b45309",
    fontSize: 10,
    lineHeight: 1.4,
  },

  itemRefundValue: {
    marginTop: 5,
    color: "#64748b",
    fontSize: 9,
  },

  itemCancelRow: {
    display: "flex",
    justifyContent:
      "flex-end",
    marginTop: 5,
  },

  cancelButton: {
    padding:
      "5px 8px",
    border:
      "1px solid #dc2626",
    borderRadius: 6,
    background: "#fff",
    color: "#dc2626",
    cursor:
      "pointer",
    fontSize: 9,
    fontWeight: 800,
  },

  specialNote: {
    marginTop: 6,
    padding: 6,
    borderRadius: 7,
    background: "#fff7ed",
    color: "#9a3412",
    fontSize: 10,
  },

  orderActions: {
    display: "flex",
    justifyContent:
      "flex-end",
    marginTop: 8,
  },

  actionButton: {
    padding:
      "7px 11px",
    minHeight: 32,
    border:
      "1px solid #111827",
    borderRadius: 7,
    background: "#111827",
    color: "#fff",
    cursor:
      "pointer",
    fontSize: 11,
    fontWeight: 700,
  },

  /*
   * MODALS
   */

  modalBackdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    background:
      "rgba(15,23,42,.55)",
    display: "flex",
    justifyContent:
      "center",
    alignItems:
      "center",
    padding: 15,
  },

  modal: {
    width: "100%",
    maxWidth: 450,
    maxHeight: "90vh",
    overflowY: "auto",
    background: "#fff",
    borderRadius: 12,
    padding: 17,
    boxShadow:
      "0 20px 50px rgba(0,0,0,.25)",
  },

  editModal: {
    width: "100%",
    maxWidth: 680,
    maxHeight: "94vh",
    overflowY: "auto",
    background: "#fff",
    borderRadius: 12,
    padding: 17,
    boxShadow:
      "0 20px 50px rgba(0,0,0,.25)",
  },

  mobileModal: {
    maxWidth:
      "100%",
    padding: 13,
    borderRadius: 9,
  },

  mobileEditModal: {
    maxWidth:
      "100%",
    maxHeight:
      "96vh",
    padding: 10,
    borderRadius: 9,
  },

  modalHeader: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems:
      "flex-start",
    gap: 10,
    marginBottom: 13,
  },

  modalTitle: {
    margin: 0,
    fontSize: 19,
  },

  modalSubtitle: {
    margin:
      "3px 0 0",
    color: "#64748b",
    fontSize: 10,
  },

  closeButton: {
    width: 30,
    height: 30,
    border: 0,
    borderRadius: 6,
    background: "#f1f5f9",
    fontSize: 20,
    cursor:
      "pointer",
  },

  closeMiniButton: {
    width: 25,
    height: 25,
    border: 0,
    borderRadius: 6,
    background: "#f1f5f9",
    fontSize: 16,
    cursor:
      "pointer",
  },

  cancelSummary: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems:
      "center",
    padding: 10,
    borderRadius: 8,
    background: "#fef2f2",
    color: "#991b1b",
    marginBottom: 12,
    fontSize: 11,
  },

  fieldLabel: {
    display: "block",
    fontSize: 10,
    fontWeight: 800,
    marginBottom: 5,
    marginTop: 10,
  },

  modalInput: {
    width: "100%",
    boxSizing:
      "border-box",
    border:
      "1px solid #d1d5db",
    borderRadius: 7,
    padding: 8,
    fontSize: 12,
    outline: "none",
    background: "#fff",
  },

  refundButtons: {
    display: "grid",
    gridTemplateColumns:
      "1fr 1fr",
    gap: 6,
  },

  refundActive: {
    padding: 8,
    border:
      "1px solid #111827",
    borderRadius: 7,
    background: "#111827",
    color: "#fff",
    cursor:
      "pointer",
    fontSize: 11,
    fontWeight: 800,
  },

  refundButton: {
    padding: 8,
    border:
      "1px solid #d1d5db",
    borderRadius: 7,
    background: "#fff",
    cursor:
      "pointer",
    fontSize: 11,
  },

  modalActions: {
    display: "grid",
    gridTemplateColumns:
      "1fr 1fr",
    gap: 7,
    marginTop: 15,
  },

  keepButton: {
    height: 38,
    border: 0,
    borderRadius: 7,
    background: "#e5e7eb",
    color: "#374151",
    cursor:
      "pointer",
    fontSize: 11,
    fontWeight: 700,
  },

  confirmCancelButton: {
    height: 38,
    border: 0,
    borderRadius: 7,
    background: "#dc2626",
    color: "#fff",
    cursor:
      "pointer",
    fontSize: 11,
    fontWeight: 800,
  },

  saveButton: {
    height: 38,
    border: 0,
    borderRadius: 7,
    background: "#111827",
    color: "#fff",
    cursor:
      "pointer",
    fontSize: 11,
    fontWeight: 800,
  },

  /*
   * EDIT SECTIONS
   */

  editSection: {
    border:
      "1px solid #e5e7eb",
    borderRadius: 10,
    padding: 11,
    marginBottom: 10,
    background: "#fff",
  },

  editSectionHeader: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems:
      "center",
    gap: 8,
    marginBottom: 9,
  },

  editSectionTitle: {
    fontSize: 13,
    fontWeight: 900,
    color: "#111827",
  },

  editSectionHint: {
    marginTop: 2,
    fontSize: 9,
    color: "#64748b",
  },

  addItemButton: {
    padding:
      "7px 10px",
    border:
      "1px solid #2563eb",
    borderRadius: 7,
    background: "#2563eb",
    color: "#fff",
    cursor:
      "pointer",
    fontSize: 10,
    fontWeight: 800,
    whiteSpace:
      "nowrap",
  },

  menuLoading: {
    padding: 8,
    borderRadius: 7,
    background: "#eff6ff",
    color: "#1d4ed8",
    fontSize: 10,
    marginBottom: 7,
  },

  editItemsList: {
    display: "flex",
    flexDirection:
      "column",
    gap: 7,
  },

  editItemCard: {
    border:
      "1px solid #e5e7eb",
    borderRadius: 9,
    padding: 9,
    background: "#f8fafc",
  },

  editItemTop: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems:
      "center",
    gap: 8,
  },

  editItemInfo: {
    display: "flex",
    flexDirection:
      "column",
    gap: 2,
    minWidth: 0,
  },

  editItemName: {
    fontSize: 12,
    fontWeight: 800,
  },

  editItemPrice: {
    fontSize: 9,
    color: "#64748b",
  },

  newItemBadge: {
    display: "inline-block",
    width: "fit-content",
    marginTop: 2,
    padding:
      "2px 5px",
    borderRadius: 4,
    background: "#dbeafe",
    color: "#1d4ed8",
    fontSize: 8,
    fontWeight: 900,
  },

  historicalPriceText: {
    marginTop: 5,
    color: "#64748b",
    fontSize: 8,
  },

  quantityControls: {
    display: "flex",
    alignItems:
      "center",
    gap: 5,
    flexShrink: 0,
  },

  quantityButton: {
    width: 29,
    height: 29,
    border:
      "1px solid #d1d5db",
    borderRadius: 6,
    background: "#fff",
    cursor:
      "pointer",
    fontSize: 17,
    fontWeight: 700,
  },

  quantityNumber: {
    minWidth: 22,
    textAlign:
      "center",
    fontSize: 12,
  },

  editAddonSection: {
    marginTop: 8,
    paddingTop: 7,
    borderTop:
      "1px solid #e5e7eb",
  },

  editAddonHeading: {
    fontSize: 9,
    fontWeight: 900,
    color: "#475569",
    marginBottom: 5,
  },

  noAddonText: {
    color: "#94a3b8",
    fontSize: 9,
    marginBottom: 5,
  },

  editAddonRow: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems:
      "center",
    gap: 8,
    padding:
      "5px 0",
    borderBottom:
      "1px solid #eef2f7",
  },

  editAddonName: {
    display: "flex",
    flexDirection:
      "column",
    gap: 2,
    fontSize: 10,
    fontWeight: 700,
  },

  editAddonPrice: {
    color: "#64748b",
    fontSize: 8,
    fontWeight: 500,
  },

  smallQuantityButton: {
    width: 23,
    height: 23,
    border:
      "1px solid #d1d5db",
    borderRadius: 5,
    background: "#fff",
    cursor:
      "pointer",
    fontSize: 13,
    fontWeight: 700,
  },

  smallQuantityNumber: {
    minWidth: 16,
    textAlign:
      "center",
    fontSize: 10,
  },

  removeAddonButton: {
    width: 23,
    height: 23,
    border:
      "1px solid #fecaca",
    borderRadius: 5,
    background: "#fff",
    color: "#dc2626",
    cursor:
      "pointer",
    fontSize: 14,
    fontWeight: 800,
  },

  addAddonRow: {
    marginTop: 6,
  },

  smallSelect: {
    width: "100%",
    boxSizing:
      "border-box",
    padding: 6,
    border:
      "1px solid #d1d5db",
    borderRadius: 6,
    background: "#fff",
    fontSize: 9,
  },

  noEditItems: {
    padding: 12,
    textAlign:
      "center",
    borderRadius: 8,
    background: "#f8fafc",
    color: "#64748b",
    fontSize: 10,
  },

  /*
   * NEW ITEM
   */

  newItemPanel: {
    marginTop: 9,
    border:
      "1px solid #bfdbfe",
    borderRadius: 9,
    padding: 10,
    background: "#eff6ff",
  },

  newItemPanelHeader: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems:
      "center",
    fontSize: 11,
    color: "#1e3a8a",
  },

  newItemQuantityRow: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems:
      "center",
    marginTop: 9,
    fontSize: 10,
    fontWeight: 800,
  },

  newAddonBuilder: {
    marginTop: 10,
    paddingTop: 8,
    borderTop:
      "1px solid #dbeafe",
  },

  newAddonControls: {
    display: "grid",
    gridTemplateColumns:
      "minmax(0,1fr) 60px auto",
    gap: 5,
  },

  addonQuantityInput: {
    width: "100%",
    boxSizing:
      "border-box",
    padding: 6,
    border:
      "1px solid #d1d5db",
    borderRadius: 6,
    fontSize: 9,
  },

  smallPrimaryButton: {
    padding:
      "6px 9px",
    border: 0,
    borderRadius: 6,
    background: "#2563eb",
    color: "#fff",
    cursor:
      "pointer",
    fontSize: 9,
    fontWeight: 800,
  },

  newAddonList: {
    marginTop: 5,
  },

  newItemActions: {
    display: "grid",
    gridTemplateColumns:
      "1fr 1fr",
    gap: 6,
    marginTop: 10,
  },

  /*
   * TOTALS
   */

  editTotalsBox: {
    border:
      "1px solid #e5e7eb",
    borderRadius: 9,
    padding: 10,
    marginBottom: 10,
    background: "#f8fafc",
  },

  totalLine: {
    display: "flex",
    justifyContent:
      "space-between",
    gap: 10,
    padding:
      "4px 0",
    color: "#475569",
    fontSize: 10,
  },

  differenceLine: {
    display: "flex",
    justifyContent:
      "space-between",
    gap: 10,
    padding:
      "8px 0 2px",
    marginTop: 5,
    borderTop:
      "1px solid #e5e7eb",
    fontSize: 12,
    fontWeight: 900,
  },

  increaseLine: {
    color: "#b45309",
  },

  decreaseLine: {
    color: "#047857",
  },

  noChangeLine: {
    color: "#334155",
  },

  /*
   * PAYMENT / REFUND
   */

  paymentSection: {
    border:
      "1px solid #fde68a",
    borderRadius: 9,
    padding: 10,
    marginBottom: 10,
    background: "#fffbeb",
  },

  refundSection: {
    border:
      "1px solid #a7f3d0",
    borderRadius: 9,
    padding: 10,
    marginBottom: 10,
    background: "#ecfdf5",
  },

  paymentNotice: {
    marginTop: 6,
    padding: 8,
    borderRadius: 7,
    background: "#fff",
    color: "#475569",
    fontSize: 10,
  },

  paymentModeGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(3,1fr)",
    gap: 5,
  },

  paymentProofBox: {
    marginTop: 9,
    padding: 9,
    border:
      "1px solid #dbeafe",
    borderRadius: 8,
    background: "#eff6ff",
  },

  paymentProofHeader: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "flex-start",
    gap: 8,
  },

  paymentProofTitle: {
    fontSize: 10,
    fontWeight: 900,
    color: "#1e3a8a",
  },

  paymentProofHint: {
    marginTop: 3,
    fontSize: 8,
    lineHeight: 1.4,
    color: "#64748b",
  },

  paymentProofBadge: {
    padding:
      "3px 6px",
    borderRadius: 999,
    background: "#dcfce7",
    color: "#166534",
    fontSize: 8,
    fontWeight: 900,
    whiteSpace:
      "nowrap",
  },

  captureProofButton: {
    width: "100%",
    marginTop: 8,
    padding:
      "9px 10px",
    border: 0,
    borderRadius: 7,
    background: "#2563eb",
    color: "#fff",
    cursor:
      "pointer",
    fontSize: 9,
    fontWeight: 900,
  },

  cameraContainer: {
    marginTop: 8,
  },

  cameraVideo: {
    display: "block",
    width: "100%",
    maxHeight: 280,
    objectFit: "cover",
    borderRadius: 8,
    background: "#111827",
  },

  cameraActions: {
    display: "grid",
    gridTemplateColumns:
      "1fr 1fr",
    gap: 6,
    marginTop: 7,
  },

  captureButton: {
    padding:
      "8px 9px",
    border: 0,
    borderRadius: 7,
    background: "#2563eb",
    color: "#fff",
    cursor:
      "pointer",
    fontSize: 9,
    fontWeight: 900,
  },

  cancelCameraButton: {
    padding:
      "8px 9px",
    border:
      "1px solid #cbd5e1",
    borderRadius: 7,
    background: "#fff",
    color: "#334155",
    cursor:
      "pointer",
    fontSize: 9,
    fontWeight: 800,
  },

  paymentProofPreviewBox: {
    marginTop: 8,
  },

  paymentProofPreview: {
    display: "block",
    width: "100%",
    maxHeight: 280,
    objectFit: "contain",
    borderRadius: 8,
    background: "#111827",
  },

  paymentProofActions: {
    marginTop: 7,
  },

  paymentInlineError: {
    marginTop: 7,
    padding: 8,
    borderRadius: 7,
    border:
      "1px solid #fecaca",
    background: "#fef2f2",
    color: "#b91c1c",
    fontSize: 9,
    fontWeight: 800,
    lineHeight: 1.45,
  },

  paymentCalculation: {
    display: "grid",
    gridTemplateColumns:
      "1fr auto",
    gap: 4,
    marginTop: 8,
    padding: 8,
    borderRadius: 7,
    background: "#fff",
    fontSize: 9,
    color: "#475569",
  },

  dangerText: {
    color: "#dc2626",
  },

  successText: {
    color: "#047857",
  },
};