"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  getAuthToken,
  getUserName,
  getPermissions,
  clearAuthSession,
} from "../../lib/auth-storage";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:4000";

type Category = {
  id: string;
  name: string;
};

type Item = {
  id: string;
  name: string;
  price: number | string;
  category_id?: string | null;
  category_name?: string | null;
};

type Addon = {
  id: string;
  name: string;
  price: number | string;
};

type ItemAddon = {
  item_id: string;
  addon_id: string;
};

type MenuTab =
  | "ITEMS"
  | "CATEGORIES"
  | "ADDONS";

type ModalType =
  | "ITEM"
  | "CATEGORY"
  | "ADDON"
  | "ASSIGN"
  | null;

function money(value: number) {
  return `₹${value.toFixed(2)}`;
}

function numberValue(value: unknown) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

/*
 * Authentication is now handled through
 * sessionStorage by auth-storage.ts.
 *
 * This keeps every browser tab independent.
 */
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
        "Content-Type":
          "application/json",

        ...(token
          ? {
              Authorization:
                `Bearer ${token}`,
            }
          : {}),

        ...(options.headers ?? {}),
      },
    },
  );

  const data =
    await response
      .json()
      .catch(() => null);

  /*
   * If the backend says the session is
   * invalid, clear only this tab's
   * authentication session.
   */
  if (
    response.status === 401 ||
    response.status === 403
  ) {
    clearAuthSession();

    if (
      typeof window !==
      "undefined"
    ) {
      window.location.replace(
        "/login",
      );
    }

    throw new Error(
      data?.error ??
        data?.message ??
        "Authentication required.",
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error ??
        data?.message ??
        "Request failed.",
    );
  }

  return data as T;
}

export default function MenuPage() {
  const [
    categories,
    setCategories,
  ] = useState<Category[]>(
    [],
  );

  const [
    items,
    setItems,
  ] = useState<Item[]>(
    [],
  );

  const [
    addons,
    setAddons,
  ] = useState<Addon[]>(
    [],
  );

  const [
    itemAddons,
    setItemAddons,
  ] = useState<ItemAddon[]>(
    [],
  );

  const [
    activeTab,
    setActiveTab,
  ] = useState<MenuTab>(
    "ITEMS",
  );

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

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    selectedCategory,
    setSelectedCategory,
  ] = useState("ALL");

  const [
    modalType,
    setModalType,
  ] = useState<ModalType>(
    null,
  );

  const [
    editingId,
    setEditingId,
  ] = useState<string | null>(
    null,
  );

  const [
    userName,
    setUserName,
  ] = useState("");

  const [
    permissions,
    setPermissions,
  ] = useState<string[]>(
    [],
  );

  /*
   * ITEM FORM
   */

  const [
    itemName,
    setItemName,
  ] = useState("");

  const [
    itemPrice,
    setItemPrice,
  ] = useState("");

  const [
    itemCategoryId,
    setItemCategoryId,
  ] = useState("");

  /*
   * CATEGORY FORM
   */

  const [
    categoryName,
    setCategoryName,
  ] = useState("");

  /*
   * ADDON FORM
   */

  const [
    addonName,
    setAddonName,
  ] = useState("");

  const [
    addonPrice,
    setAddonPrice,
  ] = useState("0");

  /*
   * ASSIGN ADDONS
   */

  const [
    assignItemId,
    setAssignItemId,
  ] = useState("");

  const [
    selectedAddonIds,
    setSelectedAddonIds,
  ] = useState<string[]>(
    [],
  );

  /*
   * LOAD MENU
   */

  useEffect(() => {
    const token = getToken();

    if (!token) {
      window.location.replace(
        "/login",
      );

      return;
    }

    /*
     * Read user information from the
     * same sessionStorage-based helper
     * used by Login, Dashboard, POS
     * and Orders.
     */
    setUserName(
      getUserName(),
    );

    setPermissions(
      getPermissions(),
    );

    loadMenu();
  }, []);

  async function loadMenu() {
    try {
      setLoading(true);
      setError("");

      const [
        categoriesResponse,
        itemsResponse,
        addonsResponse,
        itemAddonsResponse,
      ] = await Promise.all([
        apiRequest<
          | Category[]
          | {
              categories?: Category[];
            }
        >(
          "/api/categories",
        ),

        apiRequest<
          | Item[]
          | {
              items?: Item[];
            }
        >(
          "/api/items",
        ),

        apiRequest<
          | Addon[]
          | {
              addons?: Addon[];
            }
        >(
          "/api/addons",
        ),

        apiRequest<
          | ItemAddon[]
          | {
              itemAddons?: ItemAddon[];
              item_addons?: ItemAddon[];
            }
        >(
          "/api/item-addons",
        ),
      ]);

      const categoryList =
        Array.isArray(
          categoriesResponse,
        )
          ? categoriesResponse
          : categoriesResponse.categories ??
            [];

      const itemList =
        Array.isArray(
          itemsResponse,
        )
          ? itemsResponse
          : itemsResponse.items ??
            [];

      const addonList =
        Array.isArray(
          addonsResponse,
        )
          ? addonsResponse
          : addonsResponse.addons ??
            [];

      const itemAddonList =
        Array.isArray(
          itemAddonsResponse,
        )
          ? itemAddonsResponse
          : itemAddonsResponse.itemAddons ??
            itemAddonsResponse.item_addons ??
            [];

      setCategories(
        categoryList,
      );

      setItems(
        itemList,
      );

      setAddons(
        addonList,
      );

      setItemAddons(
        itemAddonList,
      );
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : "Failed to load menu.",
      );
    } finally {
      setLoading(false);
    }
  }

  /*
   * MESSAGES
   */

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
   * PERMISSIONS
   */

  function canManageItems() {
    return permissions.includes(
      "MANAGE_ITEMS",
    );
  }

  function canManageAddons() {
    return permissions.includes(
      "MANAGE_ADD_ONS",
    );
  }

  function canManageAddonData() {
    return (
      permissions.includes(
        "MANAGE_ADD_ONS",
      ) ||
      permissions.includes(
        "MANAGE_ADDONS",
      )
    );
  }

  /*
   * OPEN ITEM MODAL
   */

  function openNewItem() {
    if (!canManageItems()) {
      showError(
        "You do not have permission to manage items.",
      );

      return;
    }

    setEditingId(null);
    setItemName("");
    setItemPrice("");
    setItemCategoryId(
      categories[0]?.id ??
        "",
    );

    setModalType("ITEM");
  }

  function openEditItem(
    item: Item,
  ) {
    if (!canManageItems()) {
      showError(
        "You do not have permission to manage items.",
      );

      return;
    }

    setEditingId(item.id);
    setItemName(item.name);
    setItemPrice(
      String(item.price),
    );

    setItemCategoryId(
      item.category_id ??
        "",
    );

    setModalType("ITEM");
  }

  /*
   * SAVE ITEM
   */

  async function saveItem() {
    if (!canManageItems()) {
      showError(
        "You do not have permission to manage items.",
      );

      return;
    }

    const name =
      itemName.trim();

    const price =
      numberValue(itemPrice);

    if (!name) {
      showError(
        "Enter an item name.",
      );

      return;
    }

    if (price < 0) {
      showError(
        "Price cannot be negative.",
      );

      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      if (editingId) {
        await apiRequest(
          `/api/items/${editingId}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              name,
              price,
              categoryId:
                itemCategoryId ||
                null,
            }),
          },
        );

        showSuccess(
          "Food item updated successfully.",
        );
      } else {
        await apiRequest(
          "/api/items",
          {
            method: "POST",
            body: JSON.stringify({
              name,
              price,
              categoryId:
                itemCategoryId ||
                null,
            }),
          },
        );

        showSuccess(
          "Food item created successfully.",
        );
      }

      closeModal();

      await loadMenu();
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : "Failed to save item.",
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * DELETE ITEM
   */

  async function deleteItem(
    item: Item,
  ) {
    if (!canManageItems()) {
      showError(
        "You do not have permission to manage items.",
      );

      return;
    }

    const confirmed =
      window.confirm(
        `Delete "${item.name}"?\n\nThis should only be used if the item is no longer needed.`,
      );

    if (!confirmed) {
      return;
    }

    try {
      setSaving(true);

      await apiRequest(
        `/api/items/${item.id}`,
        {
          method: "DELETE",
        },
      );

      showSuccess(
        "Food item deleted successfully.",
      );

      await loadMenu();
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : "Failed to delete item.",
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * CATEGORY MODAL
   */

  function openNewCategory() {
    setEditingId(null);
    setCategoryName("");
    setModalType(
      "CATEGORY",
    );
  }

  function openEditCategory(
    category: Category,
  ) {
    setEditingId(
      category.id,
    );

    setCategoryName(
      category.name,
    );

    setModalType(
      "CATEGORY",
    );
  }

  async function saveCategory() {
    const name =
      categoryName.trim();

    if (!name) {
      showError(
        "Enter a category name.",
      );

      return;
    }

    try {
      setSaving(true);

      if (editingId) {
        await apiRequest(
          `/api/categories/${editingId}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              name,
            }),
          },
        );

        showSuccess(
          "Category updated successfully.",
        );
      } else {
        await apiRequest(
          "/api/categories",
          {
            method: "POST",
            body: JSON.stringify({
              name,
            }),
          },
        );

        showSuccess(
          "Category created successfully.",
        );
      }

      closeModal();

      await loadMenu();
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : "Failed to save category.",
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * DELETE CATEGORY
   */

  async function deleteCategory(
    category: Category,
  ) {
    const itemCount =
      items.filter(
        (item) =>
          item.category_id ===
          category.id,
      ).length;

    if (itemCount > 0) {
      showError(
        `Cannot delete "${category.name}" because ${itemCount} item${
          itemCount === 1
            ? ""
            : "s"
        } still use this category. Move the items first.`,
      );

      return;
    }

    const confirmed =
      window.confirm(
        `Delete category "${category.name}"?`,
      );

    if (!confirmed) {
      return;
    }

    try {
      setSaving(true);

      await apiRequest(
        `/api/categories/${category.id}`,
        {
          method: "DELETE",
        },
      );

      showSuccess(
        "Category deleted successfully.",
      );

      await loadMenu();
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : "Failed to delete category.",
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * ADDON MODAL
   */

  function openNewAddon() {
    if (!canManageAddonData()) {
      showError(
        "You do not have permission to manage add-ons.",
      );

      return;
    }

    setEditingId(null);
    setAddonName("");
    setAddonPrice("0");

    setModalType("ADDON");
  }

  function openEditAddon(
    addon: Addon,
  ) {
    if (!canManageAddonData()) {
      showError(
        "You do not have permission to manage add-ons.",
      );

      return;
    }

    setEditingId(addon.id);
    setAddonName(addon.name);
    setAddonPrice(
      String(addon.price),
    );

    setModalType("ADDON");
  }

  async function saveAddon() {
    if (!canManageAddonData()) {
      showError(
        "You do not have permission to manage add-ons.",
      );

      return;
    }

    const name =
      addonName.trim();

    const price =
      numberValue(addonPrice);

    if (!name) {
      showError(
        "Enter an add-on name.",
      );

      return;
    }

    if (price < 0) {
      showError(
        "Add-on price cannot be negative.",
      );

      return;
    }

    try {
      setSaving(true);

      if (editingId) {
        await apiRequest(
          `/api/addons/${editingId}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              name,
              price,
            }),
          },
        );

        showSuccess(
          "Add-on updated successfully.",
        );
      } else {
        await apiRequest(
          "/api/addons",
          {
            method: "POST",
            body: JSON.stringify({
              name,
              price,
            }),
          },
        );

        showSuccess(
          "Add-on created successfully.",
        );
      }

      closeModal();

      await loadMenu();
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : "Failed to save add-on.",
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * DELETE ADDON
   */

  async function deleteAddon(
    addon: Addon,
  ) {
    if (!canManageAddonData()) {
      showError(
        "You do not have permission to manage add-ons.",
      );

      return;
    }

    const usageCount =
      itemAddons.filter(
        (entry) =>
          entry.addon_id ===
          addon.id,
      ).length;

    const warning =
      usageCount > 0
        ? `"${addon.name}" is associated with ${usageCount} item${
            usageCount === 1
              ? ""
              : "s"
          }. `
        : "";

    const confirmed =
      window.confirm(
        `${warning}Delete add-on "${addon.name}"?`,
      );

    if (!confirmed) {
      return;
    }

    try {
      setSaving(true);

      await apiRequest(
        `/api/addons/${addon.id}`,
        {
          method: "DELETE",
        },
      );

      showSuccess(
        "Add-on deleted successfully.",
      );

      await loadMenu();
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : "Failed to delete add-on.",
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * ASSIGN ADDONS
   */

  function openAssignAddons(
    item: Item,
  ) {
    if (!canManageAddonData()) {
      showError(
        "You do not have permission to manage add-ons.",
      );

      return;
    }

    const existing =
      itemAddons
        .filter(
          (entry) =>
            entry.item_id ===
            item.id,
        )
        .map(
          (entry) =>
            entry.addon_id,
        );

    setAssignItemId(
      item.id,
    );

    setSelectedAddonIds(
      existing,
    );

    setModalType(
      "ASSIGN",
    );
  }

  function toggleAssignedAddon(
    addonId: string,
  ) {
    setSelectedAddonIds(
      (current) =>
        current.includes(
          addonId,
        )
          ? current.filter(
              (id) =>
                id !==
                addonId,
            )
          : [
              ...current,
              addonId,
            ],
    );
  }

  async function saveAssignedAddons() {
    if (!assignItemId) {
      showError(
        "Select an item.",
      );

      return;
    }

    try {
      setSaving(true);

      await apiRequest(
        `/api/item-addons/${assignItemId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            addonIds:
              selectedAddonIds,
          }),
        },
      );

      showSuccess(
        "Item add-ons updated successfully.",
      );

      closeModal();

      await loadMenu();
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : "Failed to update item add-ons.",
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * MODAL CLOSE
   */

  function closeModal() {
    if (saving) {
      return;
    }

    setModalType(null);
    setEditingId(null);

    setItemName("");
    setItemPrice("");
    setItemCategoryId("");

    setCategoryName("");

    setAddonName("");
    setAddonPrice("0");

    setAssignItemId("");
    setSelectedAddonIds([]);
  }

  /*
   * FILTERED ITEMS
   */

  const filteredItems =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      return items.filter(
        (item) => {
          const matchesCategory =
            selectedCategory ===
              "ALL" ||
            item.category_id ===
              selectedCategory;

          const matchesSearch =
            !query ||
            item.name
              .toLowerCase()
              .includes(
                query,
              ) ||
            String(
              item.category_name ??
                "",
            )
              .toLowerCase()
              .includes(
                query,
              );

          return (
            matchesCategory &&
            matchesSearch
          );
        },
      );
    }, [
      items,
      search,
      selectedCategory,
    ]);

  /*
   * FILTERED ADDONS
   */

  const filteredAddons =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      if (!query) {
        return addons;
      }

      return addons.filter(
        (addon) =>
          addon.name
            .toLowerCase()
            .includes(
              query,
            ),
      );
    }, [
      addons,
      search,
    ]);

  /*
   * UI
   */

  if (loading) {
    return (
      <main
        style={styles.page}
      >
        <div
          style={
            styles.loadingCard
          }
        >
          <h2>
            Loading Menu...
          </h2>

          <p>
            Loading categories,
            food items and
            add-ons.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      style={styles.page}
    >
      <div
        style={
          styles.container
        }
      >
        {/* NAV */}

        <nav
          style={
            styles.navbar
          }
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
              style={
                styles.navLink
              }
            >
              Orders
            </Link>

            <Link
              href="/menu"
              style={{
                ...styles.navLink,
                ...styles.navLinkActive,
              }}
            >
              Menu
            </Link>
          </div>

          <button
            type="button"
            style={
              styles.logoutButton
            }
            onClick={() => {
              clearAuthSession();

              window.location.replace(
                "/login",
              );
            }}
          >
            Logout
          </button>
        </nav>

        {/* HEADER */}

        <header
          style={
            styles.header
          }
        >
          <div>
            <h1
              style={
                styles.title
              }
            >
              Menu Management
            </h1>

            <p
              style={
                styles.subtitle
              }
            >
              Manage food items,
              categories and
              reusable add-ons.
            </p>

            <p
              style={
                styles.loggedIn
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

        {/* MESSAGES */}

        {error && (
          <div
            style={
              styles.error
            }
          >
            {error}
          </div>
        )}

        {success && (
          <div
            style={
              styles.success
            }
          >
            {success}
          </div>
        )}

        {/* SUMMARY */}

        <section
          style={
            styles.statsGrid
          }
        >
          <StatCard
            label="Food Items"
            value={
              items.length
            }
          />

          <StatCard
            label="Categories"
            value={
              categories.length
            }
          />

          <StatCard
            label="Add-ons"
            value={
              addons.length
            }
          />

          <StatCard
            label="Item/Add-on Links"
            value={
              itemAddons.length
            }
          />
        </section>

        {/* TABS */}

        <section
          style={
            styles.tabsBox
          }
        >
          <div
            style={
              styles.tabs
            }
          >
            <button
              type="button"
              style={
                activeTab ===
                "ITEMS"
                  ? styles.tabActive
                  : styles.tab
              }
              onClick={() => {
                setActiveTab(
                  "ITEMS",
                );

                setSearch("");
              }}
            >
              Food Items
            </button>

            <button
              type="button"
              style={
                activeTab ===
                "CATEGORIES"
                  ? styles.tabActive
                  : styles.tab
              }
              onClick={() => {
                setActiveTab(
                  "CATEGORIES",
                );

                setSearch("");
              }}
            >
              Categories
            </button>

            <button
              type="button"
              style={
                activeTab ===
                "ADDONS"
                  ? styles.tabActive
                  : styles.tab
              }
              onClick={() => {
                setActiveTab(
                  "ADDONS",
                );

                setSearch("");
              }}
            >
              Add-ons
            </button>
          </div>
        </section>

        {/* ITEMS */}

        {activeTab ===
          "ITEMS" && (
          <section
            style={
              styles.section
            }
          >
            <div
              style={
                styles.sectionHeader
              }
            >
              <div>
                <h2
                  style={
                    styles.sectionTitle
                  }
                >
                  Food Items
                </h2>

                <p
                  style={
                    styles.sectionHint
                  }
                >
                  Create and manage
                  the items shown on
                  the POS.
                </p>
              </div>

              {canManageItems() && (
                <button
                  type="button"
                  style={
                    styles.primaryButton
                  }
                  onClick={
                    openNewItem
                  }
                >
                  + Add Item
                </button>
              )}
            </div>

            <div
              style={
                styles.toolbar
              }
            >
              <input
                style={
                  styles.search
                }
                placeholder="Search food items..."
                value={
                  search
                }
                onChange={(
                  event,
                ) =>
                  setSearch(
                    event
                      .target
                      .value,
                  )
                }
              />

              <select
                style={
                  styles.filterSelect
                }
                value={
                  selectedCategory
                }
                onChange={(
                  event,
                ) =>
                  setSelectedCategory(
                    event
                      .target
                      .value,
                  )
                }
              >
                <option value="ALL">
                  All Categories
                </option>

                {categories.map(
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
            </div>

            {filteredItems.length ===
            0 ? (
              <EmptyState
                title="No food items"
                text="Create your first food item to make it available in the POS."
              />
            ) : (
              <div
                style={
                  styles.itemGrid
                }
              >
                {filteredItems.map(
                  (
                    item,
                  ) => {
                    const linkedAddons =
                      itemAddons.filter(
                        (
                          entry,
                        ) =>
                          entry.item_id ===
                          item.id,
                      );

                    return (
                      <article
                        key={
                          item.id
                        }
                        style={
                          styles.itemCard
                        }
                      >
                        <div
                          style={
                            styles.cardTop
                          }
                        >
                          <div>
                            <h3
                              style={
                                styles.cardTitle
                              }
                            >
                              {
                                item.name
                              }
                            </h3>

                            <span
                              style={
                                styles.categoryBadge
                              }
                            >
                              {item.category_name ??
                                categories.find(
                                  (
                                    category,
                                  ) =>
                                    category.id ===
                                    item.category_id,
                                )?.name ??
                                "Uncategorized"}
                            </span>
                          </div>

                          <strong
                            style={
                              styles.price
                            }
                          >
                            {money(
                              numberValue(
                                item.price,
                              ),
                            )}
                          </strong>
                        </div>

                        <div
                          style={
                            styles.cardMeta
                          }
                        >
                          <span>
                            {
                              linkedAddons.length
                            }{" "}
                            add-on
                            {linkedAddons.length ===
                            1
                              ? ""
                              : "s"}
                          </span>
                        </div>

                        <div
                          style={
                            styles.cardActions
                          }
                        >
                          {canManageItems() && (
                            <button
                              type="button"
                              style={
                                styles.editButton
                              }
                              onClick={() =>
                                openEditItem(
                                  item,
                                )
                              }
                            >
                              Edit
                            </button>
                          )}

                          {canManageAddonData() && (
                            <button
                              type="button"
                              style={
                                styles.assignButton
                              }
                              onClick={() =>
                                openAssignAddons(
                                  item,
                                )
                              }
                            >
                              Add-ons
                            </button>
                          )}

                          {canManageItems() && (
                            <button
                              type="button"
                              style={
                                styles.deleteButton
                              }
                              onClick={() =>
                                deleteItem(
                                  item,
                                )
                              }
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  },
                )}
              </div>
            )}
          </section>
        )}

        {/* CATEGORIES */}

        {activeTab ===
          "CATEGORIES" && (
          <section
            style={
              styles.section
            }
          >
            <div
              style={
                styles.sectionHeader
              }
            >
              <div>
                <h2
                  style={
                    styles.sectionTitle
                  }
                >
                  Categories
                </h2>

                <p
                  style={
                    styles.sectionHint
                  }
                >
                  Organize food items
                  into POS categories.
                </p>
              </div>

              <button
                type="button"
                style={
                  styles.primaryButton
                }
                onClick={
                  openNewCategory
                }
              >
                + Add Category
              </button>
            </div>

            <div
              style={
                styles.categoryGrid
              }
            >
              {categories.length ===
              0 ? (
                <EmptyState
                  title="No categories"
                  text="Create a category before adding food items."
                />
              ) : (
                categories.map(
                  (
                    category,
                  ) => {
                    const count =
                      items.filter(
                        (
                          item,
                        ) =>
                          item.category_id ===
                          category.id,
                      ).length;

                    return (
                      <article
                        key={
                          category.id
                        }
                        style={
                          styles.categoryCard
                        }
                      >
                        <div>
                          <h3
                            style={
                              styles.cardTitle
                            }
                          >
                            {
                              category.name
                            }
                          </h3>

                          <p
                            style={
                              styles.categoryCount
                            }
                          >
                            {
                              count
                            }{" "}
                            item
                            {count ===
                            1
                              ? ""
                              : "s"}
                          </p>
                        </div>

                        <div
                          style={
                            styles.cardActions
                          }
                        >
                          <button
                            type="button"
                            style={
                              styles.editButton
                            }
                            onClick={() =>
                              openEditCategory(
                                category,
                              )
                            }
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            style={
                              styles.deleteButton
                            }
                            onClick={() =>
                              deleteCategory(
                                category,
                              )
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    );
                  },
                )
              )}
            </div>
          </section>
        )}

        {/* ADDONS */}

        {activeTab ===
          "ADDONS" && (
          <section
            style={
              styles.section
            }
          >
            <div
              style={
                styles.sectionHeader
              }
            >
              <div>
                <h2
                  style={
                    styles.sectionTitle
                  }
                >
                  Add-ons
                </h2>

                <p
                  style={
                    styles.sectionHint
                  }
                >
                  Reusable free or paid
                  customizations.
                </p>
              </div>

              {canManageAddonData() && (
                <button
                  type="button"
                  style={
                    styles.primaryButton
                  }
                  onClick={
                    openNewAddon
                  }
                >
                  + Add Add-on
                </button>
              )}
            </div>

            <div
              style={
                styles.toolbar
              }
            >
              <input
                style={
                  styles.search
                }
                placeholder="Search add-ons..."
                value={
                  search
                }
                onChange={(
                  event,
                ) =>
                  setSearch(
                    event
                      .target
                      .value,
                  )
                }
              />
            </div>

            {filteredAddons.length ===
            0 ? (
              <EmptyState
                title="No add-ons"
                text="Create reusable add-ons such as Extra Cheese or Sauce."
              />
            ) : (
              <div
                style={
                  styles.addonGrid
                }
              >
                {filteredAddons.map(
                  (
                    addon,
                  ) => {
                    const usage =
                      itemAddons.filter(
                        (
                          entry,
                        ) =>
                          entry.addon_id ===
                          addon.id,
                      ).length;

                    return (
                      <article
                        key={
                          addon.id
                        }
                        style={
                          styles.addonCard
                        }
                      >
                        <div
                          style={
                            styles.cardTop
                          }
                        >
                          <div>
                            <h3
                              style={
                                styles.cardTitle
                              }
                            >
                              {
                                addon.name
                              }
                            </h3>

                            <span
                              style={
                                styles.addonUsage
                              }
                            >
                              Used by{" "}
                              {
                                usage
                              }{" "}
                              item
                              {usage ===
                              1
                                ? ""
                                : "s"}
                            </span>
                          </div>

                          <strong
                            style={
                              styles.price
                            }
                          >
                            {numberValue(
                              addon.price,
                            ) ===
                            0
                              ? "Free"
                              : money(
                                  numberValue(
                                    addon.price,
                                  ),
                                )}
                          </strong>
                        </div>

                        <div
                          style={
                            styles.cardActions
                          }
                        >
                          {canManageAddonData() && (
                            <button
                              type="button"
                              style={
                                styles.editButton
                              }
                              onClick={() =>
                                openEditAddon(
                                  addon,
                                )
                              }
                            >
                              Edit
                            </button>
                          )}

                          {canManageAddonData() && (
                            <button
                              type="button"
                              style={
                                styles.deleteButton
                              }
                              onClick={() =>
                                deleteAddon(
                                  addon,
                                )
                              }
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  },
                )}
              </div>
            )}
          </section>
        )}
      </div>

      {/* ITEM MODAL */}

      {modalType ===
        "ITEM" && (
        <Modal
          title={
            editingId
              ? "Edit Food Item"
              : "Add Food Item"
          }
          subtitle="This item will appear in the POS for new orders."
          onClose={
            closeModal
          }
          saving={saving}
        >
          <label
            style={
              styles.label
            }
          >
            Item Name
          </label>

          <input
            style={
              styles.input
            }
            placeholder="e.g. Paneer Roll"
            value={
              itemName
            }
            onChange={(
              event,
            ) =>
              setItemName(
                event
                  .target
                  .value,
              )
            }
            autoFocus
          />

          <label
            style={
              styles.label
            }
          >
            Category
          </label>

          <select
            style={
              styles.input
            }
            value={
              itemCategoryId
            }
            onChange={(
              event,
            ) =>
              setItemCategoryId(
                event
                  .target
                  .value,
              )
            }
          >
            <option value="">
              No Category
            </option>

            {categories.map(
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
              styles.label
            }
          >
            Price
          </label>

          <input
            style={
              styles.input
            }
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={
              itemPrice
            }
            onChange={(
              event,
            ) =>
              setItemPrice(
                event
                  .target
                  .value,
              )
            }
          />

          <div
            style={
              styles.modalActions
            }
          >
            <button
              type="button"
              style={
                styles.secondaryButton
              }
              disabled={
                saving
              }
              onClick={
                closeModal
              }
            >
              Cancel
            </button>

            <button
              type="button"
              style={
                styles.primaryButton
              }
              disabled={
                saving
              }
              onClick={
                saveItem
              }
            >
              {saving
                ? "Saving..."
                : editingId
                  ? "Save Changes"
                  : "Create Item"}
            </button>
          </div>
        </Modal>
      )}

      {/* CATEGORY MODAL */}

      {modalType ===
        "CATEGORY" && (
        <Modal
          title={
            editingId
              ? "Edit Category"
              : "Add Category"
          }
          subtitle="Categories organize the POS menu."
          onClose={
            closeModal
          }
          saving={saving}
        >
          <label
            style={
              styles.label
            }
          >
            Category Name
          </label>

          <input
            style={
              styles.input
            }
            placeholder="e.g. Rolls"
            value={
              categoryName
            }
            onChange={(
              event,
            ) =>
              setCategoryName(
                event
                  .target
                  .value,
              )
            }
            autoFocus
          />

          <div
            style={
              styles.modalActions
            }
          >
            <button
              type="button"
              style={
                styles.secondaryButton
              }
              disabled={
                saving
              }
              onClick={
                closeModal
              }
            >
              Cancel
            </button>

            <button
              type="button"
              style={
                styles.primaryButton
              }
              disabled={
                saving
              }
              onClick={
                saveCategory
              }
            >
              {saving
                ? "Saving..."
                : editingId
                  ? "Save Changes"
                  : "Create Category"}
            </button>
          </div>
        </Modal>
      )}

      {/* ADDON MODAL */}

      {modalType ===
        "ADDON" && (
        <Modal
          title={
            editingId
              ? "Edit Add-on"
              : "Add Add-on"
          }
          subtitle="Free add-ons use ₹0. Paid add-ons use their configured price."
          onClose={
            closeModal
          }
          saving={saving}
        >
          <label
            style={
              styles.label
            }
          >
            Add-on Name
          </label>

          <input
            style={
              styles.input
            }
            placeholder="e.g. Extra Cheese"
            value={
              addonName
            }
            onChange={(
              event,
            ) =>
              setAddonName(
                event
                  .target
                  .value,
              )
            }
            autoFocus
          />

          <label
            style={
              styles.label
            }
          >
            Price
          </label>

          <input
            style={
              styles.input
            }
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={
              addonPrice
            }
            onChange={(
              event,
            ) =>
              setAddonPrice(
                event
                  .target
                  .value,
              )
            }
          />

          <div
            style={
              styles.freeHint
            }
          >
            ₹0 = Free add-on
          </div>

          <div
            style={
              styles.modalActions
            }
          >
            <button
              type="button"
              style={
                styles.secondaryButton
              }
              disabled={
                saving
              }
              onClick={
                closeModal
              }
            >
              Cancel
            </button>

            <button
              type="button"
              style={
                styles.primaryButton
              }
              disabled={
                saving
              }
              onClick={
                saveAddon
              }
            >
              {saving
                ? "Saving..."
                : editingId
                  ? "Save Changes"
                  : "Create Add-on"}
            </button>
          </div>
        </Modal>
      )}

      {/* ASSIGN ADDONS MODAL */}

      {modalType ===
        "ASSIGN" && (
        <Modal
          title="Item Add-ons"
          subtitle={
            items.find(
              (item) =>
                item.id ===
                assignItemId,
            )?.name ??
            "Food Item"
          }
          onClose={
            closeModal
          }
          saving={saving}
        >
          {addons.length ===
          0 ? (
            <EmptyState
              title="No add-ons"
              text="Create add-ons first."
            />
          ) : (
            <div
              style={
                styles.assignList
              }
            >
              {addons.map(
                (
                  addon,
                ) => {
                  const selected =
                    selectedAddonIds.includes(
                      addon.id,
                    );

                  return (
                    <label
                      key={
                        addon.id
                      }
                      style={{
                        ...styles.assignRow,
                        ...(selected
                          ? styles.assignRowSelected
                          : {}),
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={
                          selected
                        }
                        onChange={() =>
                          toggleAssignedAddon(
                            addon.id,
                          )
                        }
                      />

                      <span
                        style={
                          styles.assignName
                        }
                      >
                        {
                          addon.name
                        }
                      </span>

                      <span
                        style={
                          styles.assignPrice
                        }
                      >
                        {numberValue(
                          addon.price,
                        ) ===
                        0
                          ? "Free"
                          : money(
                              numberValue(
                                addon.price,
                              ),
                            )}
                      </span>
                    </label>
                  );
                },
              )}
            </div>
          )}

          <div
            style={
              styles.modalActions
            }
          >
            <button
              type="button"
              style={
                styles.secondaryButton
              }
              disabled={
                saving
              }
              onClick={
                closeModal
              }
            >
              Cancel
            </button>

            <button
              type="button"
              style={
                styles.primaryButton
              }
              disabled={
                saving ||
                addons.length ===
                  0
              }
              onClick={
                saveAssignedAddons
              }
            >
              {saving
                ? "Saving..."
                : "Save Add-ons"}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}

/*
 * MODAL COMPONENT
 */

function Modal({
  title,
  subtitle,
  children,
  onClose,
  saving,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onClose: () => void;
  saving: boolean;
}) {
  return (
    <div
      style={
        styles.backdrop
      }
    >
      <div
        style={
          styles.modal
        }
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
              {title}
            </h2>

            <p
              style={
                styles.modalSubtitle
              }
            >
              {subtitle}
            </p>
          </div>

          <button
            type="button"
            style={
              styles.closeButton
            }
            disabled={
              saving
            }
            onClick={
              onClose
            }
          >
            ×
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

/*
 * STAT
 */

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
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
 * EMPTY
 */

function EmptyState({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div
      style={
        styles.empty
      }
    >
      <strong>
        {title}
      </strong>

      <p>
        {text}
      </p>
    </div>
  );
}

/*
 * STYLES
 */

const styles: Record<
  string,
  React.CSSProperties
> = {
  page: {
    minHeight:
      "100vh",
    background:
      "#f5f6f8",
    padding: 16,
    boxSizing:
      "border-box",
  },

  container: {
    width: "100%",
    maxWidth: 1200,
    margin: "0 auto",
    background: "#fff",
    borderRadius: 18,
    padding: 20,
    boxSizing:
      "border-box",
  },

  loadingCard: {
    maxWidth: 600,
    margin: "80px auto",
    padding: 30,
    background: "#fff",
    borderRadius: 14,
    textAlign: "center",
  },

  navbar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: 7,
    marginBottom: 18,
    border: "1px solid #e5e7eb",
    borderRadius: 9,
    background: "#f8fafc",
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
    textDecoration: "none",
    color: "#334155",
    padding: "6px 9px",
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },

  navLinkActive: {
    background: "#111827",
    color: "#fff",
  },

  logoutButton: {
    border: "1px solid #d1d5db",
    background: "#fff",
    borderRadius: 6,
    padding: "6px 9px",
    fontSize: 10,
    cursor: "pointer",
    fontWeight: 700,
    whiteSpace: "nowrap",
  },

  header: {
    marginBottom: 16,
  },

  title: {
    margin: 0,
    fontSize: 30,
  },

  subtitle: {
    margin: "5px 0 0",
    color: "#64748b",
    fontSize: 13,
  },

  loggedIn: {
    margin: "5px 0 0",
    color: "#94a3b8",
    fontSize: 10,
  },

  error: {
    padding: 9,
    marginBottom: 9,
    borderRadius: 8,
    background: "#fef2f2",
    color: "#b91c1c",
    border: "1px solid #fecaca",
    fontSize: 12,
    fontWeight: 700,
  },

  success: {
    padding: 9,
    marginBottom: 9,
    borderRadius: 8,
    background: "#ecfdf5",
    color: "#047857",
    border: "1px solid #a7f3d0",
    fontSize: 12,
    fontWeight: 700,
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(4,minmax(0,1fr))",
    gap: 7,
    marginBottom: 14,
  },

  statCard: {
    padding: 10,
    border: "1px solid #e5e7eb",
    borderRadius: 9,
    background: "#fff",
  },

  statLabel: {
    display: "block",
    color: "#64748b",
    fontSize: 9,
    marginBottom: 3,
  },

  statValue: {
    fontSize: 18,
  },

  tabsBox: {
    border: "1px solid #e5e7eb",
    borderRadius: 9,
    padding: 5,
    marginBottom: 12,
    background: "#f8fafc",
  },

  tabs: {
    display: "flex",
    gap: 5,
    overflowX: "auto",
  },

  tab: {
    border: 0,
    background: "transparent",
    color: "#64748b",
    padding: "8px 12px",
    borderRadius: 7,
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },

  tabActive: {
    border: 0,
    background: "#111827",
    color: "#fff",
    padding: "8px 12px",
    borderRadius: 7,
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  section: {
    border: "1px solid #e5e7eb",
    borderRadius: 11,
    padding: 12,
    background: "#fff",
  },

  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 11,
  },

  sectionTitle: {
    margin: 0,
    fontSize: 18,
  },

  sectionHint: {
    margin: "3px 0 0",
    color: "#64748b",
    fontSize: 9,
  },

  toolbar: {
    display: "grid",
    gridTemplateColumns:
      "minmax(0,1fr) 220px",
    gap: 7,
    marginBottom: 10,
  },

  search: {
    width: "100%",
    boxSizing: "border-box",
    padding: 9,
    border: "1px solid #d1d5db",
    borderRadius: 7,
    fontSize: 11,
    outline: "none",
  },

  filterSelect: {
    width: "100%",
    boxSizing: "border-box",
    padding: 9,
    border: "1px solid #d1d5db",
    borderRadius: 7,
    background: "#fff",
    fontSize: 11,
  },

  primaryButton: {
    border: 0,
    borderRadius: 7,
    background: "#111827",
    color: "#fff",
    padding: "8px 11px",
    cursor: "pointer",
    fontSize: 10,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  secondaryButton: {
    border: "1px solid #d1d5db",
    borderRadius: 7,
    background: "#fff",
    color: "#374151",
    padding: "8px 11px",
    cursor: "pointer",
    fontSize: 10,
    fontWeight: 700,
  },

  itemGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(3,minmax(0,1fr))",
    gap: 7,
  },

  itemCard: {
    border: "1px solid #e5e7eb",
    borderRadius: 9,
    padding: 10,
    background: "#fff",
  },

  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },

  cardTitle: {
    margin: 0,
    fontSize: 13,
    fontWeight: 800,
  },

  categoryBadge: {
    display: "inline-block",
    marginTop: 4,
    padding: "3px 6px",
    borderRadius: 5,
    background: "#f1f5f9",
    color: "#475569",
    fontSize: 8,
    fontWeight: 700,
  },

  price: {
    fontSize: 14,
    whiteSpace: "nowrap",
  },

  cardMeta: {
    marginTop: 9,
    color: "#64748b",
    fontSize: 9,
  },

  cardActions: {
    display: "flex",
    gap: 5,
    flexWrap: "wrap",
    marginTop: 9,
  },

  editButton: {
    border: "1px solid #2563eb",
    borderRadius: 6,
    background: "#fff",
    color: "#2563eb",
    padding: "5px 8px",
    cursor: "pointer",
    fontSize: 9,
    fontWeight: 800,
  },

  assignButton: {
    border: "1px solid #7c3aed",
    borderRadius: 6,
    background: "#fff",
    color: "#7c3aed",
    padding: "5px 8px",
    cursor: "pointer",
    fontSize: 9,
    fontWeight: 800,
  },

  deleteButton: {
    border: "1px solid #dc2626",
    borderRadius: 6,
    background: "#fff",
    color: "#dc2626",
    padding: "5px 8px",
    cursor: "pointer",
    fontSize: 9,
    fontWeight: 800,
  },

  categoryGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(3,minmax(0,1fr))",
    gap: 7,
  },

  categoryCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    border: "1px solid #e5e7eb",
    borderRadius: 9,
    padding: 10,
    background: "#fff",
  },

  categoryCount: {
    margin: "4px 0 0",
    color: "#64748b",
    fontSize: 9,
  },

  addonGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(3,minmax(0,1fr))",
    gap: 7,
  },

  addonCard: {
    border: "1px solid #e5e7eb",
    borderRadius: 9,
    padding: 10,
    background: "#fff",
  },

  addonUsage: {
    display: "block",
    marginTop: 4,
    color: "#64748b",
    fontSize: 8,
  },

  empty: {
    padding: 30,
    border: "1px solid #e5e7eb",
    borderRadius: 9,
    textAlign: "center",
    color: "#64748b",
    fontSize: 11,
  },

  /*
   * MODAL
   */

  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    background:
      "rgba(15,23,42,.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 15,
  },

  modal: {
    width: "100%",
    maxWidth: 500,
    maxHeight: "90vh",
    overflowY: "auto",
    background: "#fff",
    borderRadius: 12,
    padding: 17,
    boxShadow:
      "0 20px 50px rgba(0,0,0,.25)",
  },

  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 13,
  },

  modalTitle: {
    margin: 0,
    fontSize: 18,
  },

  modalSubtitle: {
    margin: "3px 0 0",
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
    cursor: "pointer",
  },

  label: {
    display: "block",
    marginTop: 10,
    marginBottom: 5,
    fontSize: 10,
    fontWeight: 800,
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: 9,
    border: "1px solid #d1d5db",
    borderRadius: 7,
    fontSize: 12,
    background: "#fff",
    outline: "none",
  },

  freeHint: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 9,
  },

  modalActions: {
    display: "grid",
    gridTemplateColumns:
      "1fr 1fr",
    gap: 7,
    marginTop: 16,
  },

  assignList: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
  },

  assignRow: {
    display: "grid",
    gridTemplateColumns:
      "20px minmax(0,1fr) auto",
    alignItems: "center",
    gap: 7,
    padding: 9,
    border: "1px solid #e5e7eb",
    borderRadius: 7,
    cursor: "pointer",
  },

  assignRowSelected: {
    background: "#eff6ff",
    border:
      "1px solid #93c5fd",
  },

  assignName: {
    fontSize: 11,
    fontWeight: 700,
  },

  assignPrice: {
    fontSize: 10,
    color: "#64748b",
    fontWeight: 700,
  },
};