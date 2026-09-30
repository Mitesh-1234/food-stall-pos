"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getAuthToken,
  clearAuthSession,
} from "../../lib/auth-storage";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:4000";

type PaymentMode = "CASH" | "ONLINE" | "BOTH";

type Category = {
  id: string;
  name: string;
};

type Addon = {
  id: string;
  name: string;
  price: number | string;
};

type Item = {
  id: string;
  name: string;
  price: number | string;
  category_id?: string | null;
  category_name?: string | null;
};

type CartItem = {
  item: Item;
  quantity: number;
  addonIds: string[];
};

function money(value: number) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function getToken() {
  return getAuthToken();
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();

  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {}),
        ...(options.headers ?? {}),
      },
    },
  );

  const data = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      clearAuthSession();
      if (typeof window !== "undefined") {
        window.location.replace("/login");
      }
    }

    throw new Error(
      data?.error ??
        data?.message ??
        "Request failed.",
    );
  }

  return data as T;
}

export default function POSPage() {
  const [
    categories,
    setCategories,
  ] = useState<Category[]>([]);

  const [items, setItems] =
    useState<Item[]>([]);

  const [addons, setAddons] =
    useState<Addon[]>([]);

  const [cart, setCart] =
    useState<CartItem[]>([]);

  const [
    selectedCategory,
    setSelectedCategory,
  ] = useState("ALL");

  const [
    customerName,
    setCustomerName,
  ] = useState("");

  const [
    customerPhone,
    setCustomerPhone,
  ] = useState("");

  const [
    specialNote,
    setSpecialNote,
  ] = useState("");

  const [
    paymentMode,
    setPaymentMode,
  ] = useState<PaymentMode>("CASH");

  const [
    cashReceived,
    setCashReceived,
  ] = useState("");

  const [
    onlineReceived,
    setOnlineReceived,
  ] = useState("");

  const [
    transactionReference,
    setTransactionReference,
  ] = useState("");

  const [
    paymentProof,
    setPaymentProof,
  ] = useState("");

  const [
    cameraOpen,
    setCameraOpen,
  ] = useState(false);

  const [
    cameraLoading,
    setCameraLoading,
  ] = useState(false);

  const [
    cameraError,
    setCameraError,
  ] = useState("");

  const videoRef =
    useRef<HTMLVideoElement | null>(
      null,
    );

  const streamRef =
    useRef<MediaStream | null>(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    success,
    setSuccess,
  ] = useState("");

  useEffect(() => {
    loadMenu();

    return () => {
      stopCamera();
    };
  }, []);

  async function loadMenu() {
    try {
      setLoading(true);
      setError("");

      const [
        categoriesResponse,
        itemsResponse,
        addonsResponse,
      ] = await Promise.all([
        apiRequest<any>(
          "/api/categories",
        ),

        apiRequest<any>(
          "/api/items",
        ),

        apiRequest<any>(
          "/api/addons",
        ),
      ]);

      setCategories(
        Array.isArray(
          categoriesResponse,
        )
          ? categoriesResponse
          : categoriesResponse.categories ??
              [],
      );

      setItems(
        Array.isArray(itemsResponse)
          ? itemsResponse
          : itemsResponse.items ?? [],
      );

      setAddons(
        Array.isArray(addonsResponse)
          ? addonsResponse
          : addonsResponse.addons ?? [],
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load menu.",
      );
    } finally {
      setLoading(false);
    }
  }

  function getAddon(addonId: string) {
    return addons.find(
      (addon) =>
        addon.id === addonId,
    );
  }

  function addItem(item: Item) {
    setError("");
    setSuccess("");

    setCart((current) => {
      const existing =
        current.find(
          (entry) =>
            entry.item.id === item.id,
        );

      if (existing) {
        return current.map(
          (entry) =>
            entry.item.id === item.id
              ? {
                  ...entry,
                  quantity:
                    entry.quantity + 1,
                }
              : entry,
        );
      }

      return [
        ...current,
        {
          item,
          quantity: 1,
          addonIds: [],
        },
      ];
    });
  }

  function changeQuantity(
    itemId: string,
    amount: number,
  ) {
    setCart((current) =>
      current
        .map((entry) =>
          entry.item.id === itemId
            ? {
                ...entry,
                quantity:
                  entry.quantity +
                  amount,
              }
            : entry,
        )
        .filter(
          (entry) =>
            entry.quantity > 0,
        ),
    );
  }

  function toggleAddon(
    itemId: string,
    addonId: string,
  ) {
    setCart((current) =>
      current.map((entry) => {
        if (
          entry.item.id !== itemId
        ) {
          return entry;
        }

        const exists =
          entry.addonIds.includes(
            addonId,
          );

        return {
          ...entry,
          addonIds: exists
            ? entry.addonIds.filter(
                (id) =>
                  id !== addonId,
              )
            : [
                ...entry.addonIds,
                addonId,
              ],
        };
      }),
    );
  }

  const visibleItems =
    useMemo(() => {
      if (
        selectedCategory ===
        "ALL"
      ) {
        return items;
      }

      return items.filter(
        (item) =>
          item.category_id ===
          selectedCategory,
      );
    }, [
      items,
      selectedCategory,
    ]);

  const total = useMemo(() => {
    return cart.reduce(
      (orderTotal, entry) => {
        const itemPrice =
          Number(entry.item.price);

        const addonPrice =
          entry.addonIds.reduce(
            (sum, addonId) => {
              const addon =
                getAddon(addonId);

              return (
                sum +
                Number(
                  addon?.price ?? 0,
                )
              );
            },
            0,
          );

        return (
          orderTotal +
          (itemPrice +
            addonPrice) *
            entry.quantity
        );
      },
      0,
    );
  }, [cart, addons]);

  const cash =
    Number(cashReceived) || 0;

  const online =
    Number(onlineReceived) || 0;

  const received =
    cash + online;

  const change = Math.max(
    0,
    received - total,
  );

  const remaining = Math.max(
    0,
    total - received,
  );

  /*
   * ==========================================================
   * CAMERA
   * ==========================================================
   */

  async function openCamera() {
    setCameraError("");
    setError("");

    if (
      typeof navigator ===
        "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices
        .getUserMedia
    ) {
      setCameraError(
        "Camera is not available in this browser. Open the POS using HTTPS or localhost.",
      );
      setCameraOpen(true);
      return;
    }

    try {
      setCameraLoading(true);
      setCameraOpen(true);

      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
            video: {
              facingMode: {
                ideal: "environment",
              },
              width: {
                ideal: 1280,
              },
              height: {
                ideal: 720,
              },
            },
            audio: false,
          },
        );

      streamRef.current =
        stream;

      if (videoRef.current) {
        videoRef.current.srcObject =
          stream;

        await videoRef.current.play();
      }
    } catch (err) {
      stopCamera();

      if (
        err instanceof DOMException
      ) {
        if (
          err.name ===
          "NotAllowedError"
        ) {
          setCameraError(
            "Camera permission was denied. Please allow Camera permission for this browser and try again.",
          );
        } else if (
          err.name ===
          "NotFoundError"
        ) {
          setCameraError(
            "No camera was found on this device.",
          );
        } else if (
          err.name ===
          "NotReadableError"
        ) {
          setCameraError(
            "The camera is already being used by another application.",
          );
        } else {
          setCameraError(
            `Camera error: ${err.message}`,
          );
        }
      } else {
        setCameraError(
          "Unable to access camera.",
        );
      }
    } finally {
      setCameraLoading(false);
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current
        .getTracks()
        .forEach((track) =>
          track.stop(),
        );

      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject =
        null;
    }
  }

  function closeCamera() {
    stopCamera();
    setCameraOpen(false);
    setCameraError("");
  }

  function capturePhoto() {
    const video =
      videoRef.current;

    if (!video) {
      setCameraError(
        "Camera preview is not ready.",
      );
      return;
    }

    if (
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      setCameraError(
        "Camera is still starting. Please wait a moment.",
      );
      return;
    }

    const canvas =
      document.createElement(
        "canvas",
      );

    const maxWidth = 1000;

    const scale = Math.min(
      1,
      maxWidth /
        video.videoWidth,
    );

    canvas.width =
      Math.round(
        video.videoWidth * scale,
      );

    canvas.height =
      Math.round(
        video.videoHeight * scale,
      );

    const context =
      canvas.getContext("2d");

    if (!context) {
      setCameraError(
        "Could not capture photo.",
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
        0.65,
      );

    setPaymentProof(image);

    closeCamera();
  }

  /*
   * ==========================================================
   * PAYMENT VALIDATION
   * ==========================================================
   */

  function validatePayment() {
    if (paymentMode === "CASH") {
      if (cash <= 0) {
        return "Enter cash received.";
      }

      if (cash < total) {
        return `Insufficient cash. Need ${money(
          total - cash,
        )}.`;
      }
    }

    if (
      paymentMode === "ONLINE"
    ) {
      if (online <= 0) {
        return "Enter online payment amount.";
      }

      if (
        Math.abs(
          online - total,
        ) > 0.009
      ) {
        return "Online payment must equal the order total.";
      }

      if (!paymentProof) {
        return "Capture the online payment proof photo.";
      }
    }

    if (paymentMode === "BOTH") {
      if (cash <= 0) {
        return "Enter cash received.";
      }

      if (online <= 0) {
        return "Enter online payment amount.";
      }

      if (
        Math.abs(
          cash + online - total,
        ) > 0.009
      ) {
        return "Cash + online payment must equal the order total.";
      }

      if (!paymentProof) {
        return "Capture the online payment proof photo.";
      }
    }

    return "";
  }

  async function createOrder() {
    setError("");
    setSuccess("");

    if (cart.length === 0) {
      setError(
        "Add at least one item.",
      );
      return;
    }

    const paymentError =
      validatePayment();

    if (paymentError) {
      setError(paymentError);
      return;
    }

    try {
      setSaving(true);

      const payload = {
        customerName:
          customerName.trim() ||
          null,

        customerPhone:
          customerPhone.trim() ||
          null,

        specialNote:
          specialNote.trim() ||
          null,

        items: cart.map(
          (entry) => ({
            itemId:
              entry.item.id,
            quantity:
              entry.quantity,
            addonIds:
              entry.addonIds,
          }),
        ),

        payment: {
          mode: paymentMode,

          cashReceived:
            paymentMode === "ONLINE"
              ? 0
              : cash,

          onlineReceived:
            paymentMode === "CASH"
              ? 0
              : online,

          transactionReference:
            transactionReference.trim() ||
            null,

          paymentProofPath:
            paymentProof ||
            null,
        },
      };

      const result =
        await apiRequest<any>(
          "/api/orders",
          {
            method: "POST",
            body: JSON.stringify(
              payload,
            ),
          },
        );

      const order =
        result?.order ??
        result?.data;

      const token =
        order?.tokenNumber ??
        order?.token_number;

      setSuccess(
        token
          ? `Order #${token} created successfully.`
          : "Order created successfully.",
      );

      clearOrder();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create order.",
      );
    } finally {
      setSaving(false);
    }
  }

  function clearOrder() {
    stopCamera();

    setCameraOpen(false);
    setCameraError("");

    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setSpecialNote("");
    setCashReceived("");
    setOnlineReceived("");
    setTransactionReference("");
    setPaymentProof("");
  }

  if (loading) {
    return (
      <main className="page">
        <div className="loading">
          Loading menu...
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="page">
        <div className="app">

          <header className="topbar">
            <div>
              <h1>
                Food Stall POS
              </h1>

              <span>
                New Order
              </span>
            </div>

            <div className="topActions">
              <button
                onClick={() =>
                  (window.location.href =
                    "/orders")
                }
              >
                Orders
              </button>

              <button
                onClick={() =>
                  (window.location.href =
                    "/")
                }
              >
                Dashboard
              </button>
            </div>
          </header>

          {error && (
            <div className="alert error">
              {error}
            </div>
          )}

          {success && (
            <div className="alert success">
              {success}
            </div>
          )}

          <div className="layout">

            <section className="left">

              <div className="card">
                <h2>
                  Customer
                </h2>

                <div className="two">
                  <input
                    placeholder="Customer name"
                    value={
                      customerName
                    }
                    onChange={(e) =>
                      setCustomerName(
                        e.target.value,
                      )
                    }
                  />

                  <input
                    placeholder="Phone number"
                    type="tel"
                    value={
                      customerPhone
                    }
                    onChange={(e) =>
                      setCustomerPhone(
                        e.target.value,
                      )
                    }
                  />
                </div>
              </div>

              <div className="card">
                <h2>
                  Categories
                </h2>

                <div className="chips">
                  <button
                    className={
                      selectedCategory ===
                      "ALL"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setSelectedCategory(
                        "ALL",
                      )
                    }
                  >
                    All
                  </button>

                  {categories.map(
                    (category) => (
                      <button
                        key={
                          category.id
                        }
                        className={
                          selectedCategory ===
                          category.id
                            ? "active"
                            : ""
                        }
                        onClick={() =>
                          setSelectedCategory(
                            category.id,
                          )
                        }
                      >
                        {category.name}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div className="card">
                <h2>
                  Food Items
                </h2>

                <div className="items">
                  {visibleItems.map(
                    (item) => (
                      <button
                        className="item"
                        key={item.id}
                        onClick={() =>
                          addItem(item)
                        }
                      >
                        <strong>
                          {item.name}
                        </strong>

                        <span>
                          {money(
                            Number(
                              item.price,
                            ),
                          )}
                        </span>
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div className="card">
                <h2>
                  Special Note
                </h2>

                <textarea
                  placeholder="Special instructions..."
                  value={
                    specialNote
                  }
                  onChange={(e) =>
                    setSpecialNote(
                      e.target.value,
                    )
                  }
                />
              </div>

            </section>

            <aside className="right">

              <div className="card">
                <h2>
                  Cart ({cart.length})
                </h2>

                {cart.length ===
                0 ? (
                  <div className="empty">
                    Add food items to
                    begin.
                  </div>
                ) : (
                  cart.map(
                    (entry) => (
                      <div
                        className="cartItem"
                        key={
                          entry.item.id
                        }
                      >
                        <div className="cartHeader">
                          <div>
                            <strong>
                              {
                                entry
                                  .item
                                  .name
                              }
                            </strong>

                            <div className="price">
                              {money(
                                Number(
                                  entry
                                    .item
                                    .price,
                                ),
                              )}
                            </div>
                          </div>

                          <div className="quantity">
                            <button
                              onClick={() =>
                                changeQuantity(
                                  entry
                                    .item
                                    .id,
                                  -1,
                                )
                              }
                            >
                              −
                            </button>

                            <strong>
                              {
                                entry.quantity
                              }
                            </strong>

                            <button
                              onClick={() =>
                                changeQuantity(
                                  entry
                                    .item
                                    .id,
                                  1,
                                )
                              }
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {addons.length >
                          0 && (
                          <div className="addons">
                            <small>
                              Add-ons
                            </small>

                            {addons.map(
                              (
                                addon,
                              ) => (
                                <label
                                  key={
                                    addon.id
                                  }
                                >
                                  <input
                                    type="checkbox"
                                    checked={entry.addonIds.includes(
                                      addon.id,
                                    )}
                                    onChange={() =>
                                      toggleAddon(
                                        entry
                                          .item
                                          .id,
                                        addon.id,
                                      )
                                    }
                                  />

                                  {
                                    addon.name
                                  }{" "}
                                  {Number(
                                    addon.price,
                                  ) >
                                  0
                                    ? `(+${money(
                                        Number(
                                          addon.price,
                                        ),
                                      )})`
                                    : "(Free)"}
                                </label>
                              ),
                            )}
                          </div>
                        )}
                      </div>
                    ),
                  )
                )}

                <div className="total">
                  <span>
                    Order Total
                  </span>

                  <strong>
                    {money(total)}
                  </strong>
                </div>
              </div>

              <div className="card">
                <h2>
                  Payment
                </h2>

                <div className="paymentModes">
                  {(
                    [
                      "CASH",
                      "ONLINE",
                      "BOTH",
                    ] as PaymentMode[]
                  ).map((mode) => (
                    <button
                      key={mode}
                      className={
                        paymentMode ===
                        mode
                          ? "active"
                          : ""
                      }
                      onClick={() => {
                        setPaymentMode(
                          mode,
                        );
                        setError("");
                      }}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                {(paymentMode ===
                  "CASH" ||
                  paymentMode ===
                    "BOTH") && (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Cash received"
                    value={
                      cashReceived
                    }
                    onChange={(e) =>
                      setCashReceived(
                        e.target.value,
                      )
                    }
                  />
                )}

                {(paymentMode ===
                  "ONLINE" ||
                  paymentMode ===
                    "BOTH") && (
                  <>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Online amount"
                      value={
                        onlineReceived
                      }
                      onChange={(e) =>
                        setOnlineReceived(
                          e.target.value,
                        )
                      }
                    />

                    <input
                      placeholder="Transaction reference"
                      value={
                        transactionReference
                      }
                      onChange={(e) =>
                        setTransactionReference(
                          e.target.value,
                        )
                      }
                    />

                    {!paymentProof && (
                      <button
                        className="cameraButton"
                        type="button"
                        onClick={
                          openCamera
                        }
                      >
                        📷 Capture Payment Proof
                      </button>
                    )}

                    {paymentProof && (
                      <div className="proof">
                        <div className="proofHeader">
                          <strong>
                            ✓ Payment
                            proof captured
                          </strong>

                          <button
                            type="button"
                            onClick={() =>
                              setPaymentProof(
                                "",
                              )
                            }
                          >
                            Retake
                          </button>
                        </div>

                        <img
                          src={
                            paymentProof
                          }
                          alt="Payment proof"
                        />
                      </div>
                    )}
                  </>
                )}

                <div className="paymentSummary">
                  <div>
                    <span>
                      Total
                    </span>

                    <strong>
                      {money(total)}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Received
                    </span>

                    <strong>
                      {money(
                        received,
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Change
                    </span>

                    <strong>
                      {money(change)}
                    </strong>
                  </div>

                  {remaining >
                    0 && (
                    <div className="remaining">
                      <span>
                        Remaining
                      </span>

                      <strong>
                        {money(
                          remaining,
                        )}
                      </strong>
                    </div>
                  )}
                </div>
              </div>

              <div className="actions">
                <button
                  className="clear"
                  disabled={saving}
                  onClick={
                    clearOrder
                  }
                >
                  Clear
                </button>

                <button
                  className="create"
                  disabled={
                    saving ||
                    cart.length ===
                      0
                  }
                  onClick={
                    createOrder
                  }
                >
                  {saving
                    ? "Creating..."
                    : "Create Order"}
                </button>
              </div>

            </aside>
          </div>
        </div>
      </main>

      {cameraOpen && (
        <div className="cameraOverlay">
          <div className="cameraModal">

            <div className="cameraHeader">
              <div>
                <h2>
                  Capture Payment Proof
                </h2>

                <span>
                  Take a clear photo of
                  the payment confirmation.
                </span>
              </div>

              <button
                type="button"
                className="closeCamera"
                onClick={
                  closeCamera
                }
              >
                ×
              </button>
            </div>

            {cameraError ? (
              <div className="cameraError">
                <strong>
                  Camera access problem
                </strong>

                <p>
                  {cameraError}
                </p>

                <button
                  type="button"
                  className="retryCamera"
                  onClick={
                    openCamera
                  }
                >
                  Try Camera Again
                </button>
              </div>
            ) : (
              <>
                <div className="videoContainer">
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                  />
                </div>

                <div className="cameraActions">
                  <button
                    type="button"
                    className="cancelCamera"
                    onClick={
                      closeCamera
                    }
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    className="captureButton"
                    disabled={
                      cameraLoading
                    }
                    onClick={
                      capturePhoto
                    }
                  >
                    {cameraLoading
                      ? "Starting Camera..."
                      : "● Capture Photo"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        .page {
          min-height: 100vh;
          background: #f5f7fa;
          padding: 16px;
          color: #111827;
          font-family:
            Inter,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        .app {
          max-width: 1250px;
          margin: 0 auto;
        }

        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          background: white;
          padding: 18px 20px;
          border-radius: 16px;
          margin-bottom: 16px;
          box-shadow:
            0 2px 10px
            rgba(0, 0, 0, 0.05);
        }

        .topbar h1 {
          margin: 0;
          font-size: 24px;
        }

        .topbar span {
          color: #6b7280;
          font-size: 13px;
        }

        .topActions {
          display: flex;
          gap: 8px;
        }

        button {
          border: 0;
          cursor: pointer;
          font: inherit;
        }

        .topActions button {
          padding: 10px 14px;
          border-radius: 9px;
          background: #f1f5f9;
        }

        .layout {
          display: grid;
          grid-template-columns:
            minmax(0, 1fr)
            430px;
          gap: 16px;
          align-items: start;
        }

        .left,
        .right {
          display: grid;
          gap: 16px;
        }

        .right {
          position: sticky;
          top: 16px;
        }

        .card {
          background: white;
          border-radius: 16px;
          padding: 18px;
          box-shadow:
            0 2px 10px
            rgba(0, 0, 0, 0.04);
        }

        .card h2 {
          margin: 0 0 14px;
          font-size: 18px;
        }

        .two {
          display: grid;
          grid-template-columns:
            1fr 1fr;
          gap: 10px;
        }

        input,
        textarea {
          width: 100%;
          padding: 12px;
          border:
            1px solid #d1d5db;
          border-radius: 10px;
          background: white;
          outline: none;
        }

        textarea {
          min-height: 85px;
          resize: vertical;
        }

        input:focus,
        textarea:focus {
          border-color: #64748b;
        }

        .chips {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 3px;
        }

        .chips button,
        .paymentModes button {
          white-space: nowrap;
          padding: 9px 14px;
          border-radius: 9px;
          background: #eef2f7;
        }

        .chips button.active,
        .paymentModes button.active {
          background: #111827;
          color: white;
        }

        .items {
          display: grid;
          grid-template-columns:
            repeat(
              auto-fill,
              minmax(145px, 1fr)
            );
          gap: 10px;
        }

        .item {
          min-height: 90px;
          padding: 14px;
          border:
            1px solid #e5e7eb;
          border-radius: 12px;
          background: white;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: space-between;
          text-align: left;
        }

        .item:hover {
          border-color: #111827;
        }

        .item span {
          color: #374151;
          font-weight: 600;
        }

        .empty {
          padding: 30px 10px;
          text-align: center;
          color: #9ca3af;
        }

        .cartItem {
          padding: 13px 0;
          border-bottom:
            1px solid #e5e7eb;
        }

        .cartHeader {
          display: flex;
          justify-content: space-between;
          gap: 10px;
        }

        .price {
          margin-top: 4px;
          color: #6b7280;
          font-size: 13px;
        }

        .quantity {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .quantity button {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          background: #eef2f7;
        }

        .addons {
          margin-top: 12px;
          display: grid;
          gap: 7px;
        }

        .addons small {
          color: #6b7280;
          font-weight: 600;
        }

        .addons label {
          display: flex;
          gap: 7px;
          align-items: center;
          font-size: 13px;
        }

        .addons input {
          width: auto;
        }

        .total {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 18px;
          font-size: 20px;
        }

        .paymentModes {
          display: grid;
          grid-template-columns:
            repeat(3, 1fr);
          gap: 8px;
          margin-bottom: 12px;
        }

        .paymentModes button {
          font-size: 12px;
          font-weight: 700;
        }

        .paymentSummary {
          margin-top: 14px;
          display: grid;
          gap: 8px;
        }

        .paymentSummary > div {
          display: flex;
          justify-content: space-between;
        }

        .remaining {
          color: #dc2626;
        }

        .cameraButton {
          width: 100%;
          min-height: 52px;
          margin-top: 10px;
          border-radius: 11px;
          background: #111827;
          color: white;
          font-weight: 800;
          font-size: 15px;
        }

        .cameraButton:active {
          transform: scale(0.99);
        }

        .proof {
          margin-top: 12px;
          padding: 10px;
          border-radius: 10px;
          background: #f0fdf4;
          border:
            1px solid #bbf7d0;
        }

        .proofHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .proofHeader button {
          padding: 7px 10px;
          border-radius: 7px;
          background: #fee2e2;
          color: #991b1b;
        }

        .proof img {
          display: block;
          width: 100%;
          max-height: 220px;
          object-fit: contain;
          margin-top: 10px;
          border-radius: 8px;
          background: #e5e7eb;
        }

        .actions {
          display: grid;
          grid-template-columns:
            110px 1fr;
          gap: 10px;
        }

        .actions button {
          min-height: 50px;
          border-radius: 12px;
          font-weight: 700;
        }

        .clear {
          background: #e5e7eb;
        }

        .create {
          background: #111827;
          color: white;
        }

        .create:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .alert {
          padding: 13px 15px;
          border-radius: 10px;
          margin-bottom: 16px;
          font-weight: 600;
        }

        .error {
          background: #fee2e2;
          color: #991b1b;
        }

        .success {
          background: #dcfce7;
          color: #166534;
        }

        .loading {
          max-width: 500px;
          margin: 80px auto;
          text-align: center;
          font-size: 18px;
        }

        /* CAMERA MODAL */

        .cameraOverlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(
            0,
            0,
            0,
            0.88
          );
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }

        .cameraModal {
          width: min(
            100%,
            650px
          );
          background: #111827;
          color: white;
          border-radius: 18px;
          overflow: hidden;
          box-shadow:
            0 25px 60px
            rgba(0, 0, 0, 0.4);
        }

        .cameraHeader {
          display: flex;
          justify-content: space-between;
          gap: 15px;
          padding: 16px;
        }

        .cameraHeader h2 {
          margin: 0 0 5px;
          font-size: 19px;
        }

        .cameraHeader span {
          color: #cbd5e1;
          font-size: 12px;
        }

        .closeCamera {
          width: 40px;
          height: 40px;
          flex-shrink: 0;
          border-radius: 50%;
          background: #374151;
          color: white;
          font-size: 25px;
        }

        .videoContainer {
          width: 100%;
          background: black;
          aspect-ratio: 4 / 3;
          overflow: hidden;
        }

        .videoContainer video {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
        }

        .cameraActions {
          display: grid;
          grid-template-columns:
            1fr 2fr;
          gap: 10px;
          padding: 16px;
        }

        .cameraActions button {
          min-height: 52px;
          border-radius: 11px;
          font-weight: 800;
        }

        .cancelCamera {
          background: #374151;
          color: white;
        }

        .captureButton {
          background: white;
          color: #111827;
          font-size: 16px;
        }

        .cameraError {
          padding: 35px 20px;
          text-align: center;
        }

        .cameraError strong {
          font-size: 18px;
        }

        .cameraError p {
          color: #cbd5e1;
          line-height: 1.5;
        }

        .retryCamera {
          padding: 12px 18px;
          border-radius: 10px;
          background: white;
          color: #111827;
          font-weight: 700;
        }

        @media (max-width: 900px) {
          .layout {
            grid-template-columns: 1fr;
          }

          .right {
            position: static;
          }
        }

        @media (max-width: 600px) {
          .page {
            padding: 8px;
          }

          .topbar {
            padding: 14px;
          }

          .topbar h1 {
            font-size: 19px;
          }

          .topActions button {
            padding: 8px 10px;
            font-size: 12px;
          }

          .two {
            grid-template-columns: 1fr;
          }

          .items {
            grid-template-columns:
              repeat(2, 1fr);
          }

          .card {
            padding: 14px;
          }

          .cameraOverlay {
            padding: 0;
          }

          .cameraModal {
            width: 100%;
            height: 100%;
            border-radius: 0;
            display: flex;
            flex-direction: column;
          }

          .videoContainer {
            flex: 1;
            aspect-ratio: auto;
          }

          .cameraActions {
            padding-bottom:
              max(
                16px,
                env(
                  safe-area-inset-bottom
                )
              );
          }
        }
      `}</style>
    </>
  );
}