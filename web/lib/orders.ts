const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:4000";

import {
  clearAuthSession,
  getAuthToken,
} from "./auth-storage";

export type Order = {
  id: string;

  token_number?: number | string;
  tokenNumber?: number | string;

  customer_name?: string | null;
  customerName?: string | null;

  customer_phone?: string | null;
  customerPhone?: string | null;

  status?: string;

  payment_mode?: string;
  paymentMode?: string;

  total?: number | string;
  subtotal?: number | string;
  refund_total?: number | string;

  created_at?: string;
  createdAt?: string;

  [key: string]: unknown;
};

export type GetOrdersResponse = {
  success: boolean;
  orders: Order[];
  page?: number;
  limit?: number;
  total?: number;
};

export type OrderDetailResponse = {
  success?: boolean;
  order?: any;
  items?: any[];
  order_items?: any[];
  orderItems?: any[];
  payments?: any[];
  addons?: any[];
  order_item_addons?: any[];
  orderItemAddons?: any[];
  [key: string]: unknown;
};

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getAuthToken();

  if (!token) {
    throw new Error(
      "Authentication required",
    );
  }

  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization:
          `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
    },
  );

  const data =
    await response
      .json()
      .catch(() => null);

  if (!response.ok) {
    const message =
      data?.error ??
      data?.message ??
      `Request failed (${response.status})`;

    if (
      response.status === 401 ||
      response.status === 403
    ) {
      clearAuthSession();
    }

    throw new Error(message);
  }

  return data as T;
}

export async function getOrders(
  params: {
    page?: number;
    limit?: number;
    status?: string;
    paymentMode?: string;
    search?: string;
  } = {},
): Promise<GetOrdersResponse> {
  const query =
    new URLSearchParams();

  if (params.page) {
    query.set(
      "page",
      String(params.page),
    );
  }

  if (params.limit) {
    query.set(
      "limit",
      String(params.limit),
    );
  }

  if (params.status) {
    query.set(
      "status",
      params.status,
    );
  }

  if (params.paymentMode) {
    query.set(
      "paymentMode",
      params.paymentMode,
    );
  }

  if (params.search) {
    query.set(
      "search",
      params.search,
    );
  }

  const queryString =
    query.toString();

  return apiRequest<GetOrdersResponse>(
    `/api/orders${
      queryString
        ? `?${queryString}`
        : ""
    }`,
  );
}

export async function getOrder(
  orderId: string,
): Promise<OrderDetailResponse> {
  return apiRequest<OrderDetailResponse>(
    `/api/orders/${orderId}`,
  );
}

export async function updateOrderStatus(
  orderId: string,
  status:
    | "READY"
    | "DELIVERED",
) {
  return apiRequest(
    `/api/orders/${orderId}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status,
      }),
    },
  );
}

export async function cancelOrderItem(
  orderId: string,
  orderItemId: string,
  data: {
    reason: string;
    note?: string;
    refundMethod?: string;
  },
) {
  return apiRequest(
    `/api/orders/${orderId}/items/${orderItemId}/cancel`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    },
  );
}

export async function logout() {
  const token =
    getAuthToken();

  if (!token) {
    clearAuthSession();
    return;
  }

  try {
    await fetch(
      `${API_BASE_URL}/api/auth/logout`,
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${token}`,
          "Content-Type":
            "application/json",
        },
      },
    );
  } finally {
    clearAuthSession();
  }
}