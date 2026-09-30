import { initializeApp } from "firebase-admin/app";

initializeApp();

export {
  loginWithPin,
  createStaffUser,
  changeStaffPin,
} from "./auth.js";

export {
  startSession,
  invalidateSession,
} from "./sessions.js";

export {
  createOrder,
  updateOrderStatus,
  cancelOrderItem,
} from "./orders.js";