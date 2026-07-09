
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, FieldValue } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

export const firebaseConfig = {
  apiKey: "AIzaSyA4z2XCxu3tNAL5IiNXfY7suu6tYszPAYQ",
  authDomain: "body-repair-system.firebaseapp.com",
  projectId: "body-repair-system",
  storageBucket: "body-repair-system.firebasestorage.app",
  messagingSenderId: "672061097149",
  appId: "1:672061097149:web:2998766b147a4c20a6a3d4"
};

// Initialize Firebase (Modular v9+)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const ADMIN_UID = "1O2CzQEvsVOnBuDWqfbtQWHJ4RP2";
// NEW COLLECTIONS
export const UNITS_MASTER_COLLECTION = "bengkel-units-master";
export const SERVICE_JOBS_COLLECTION = "bengkel-service-jobs";
// SYSTEM
export const SETTINGS_COLLECTION = "bengkel-settings";
export const USERS_COLLECTION = "users";
export const SPAREPART_COLLECTION = "bengkel-spareparts-master";
export const SUPPLIERS_COLLECTION = "bengkel-suppliers";
export const PURCHASE_ORDERS_COLLECTION = "bengkel-purchase-orders";
export const CASHIER_COLLECTION = "bengkel-cashier-transactions";
export const ASSETS_COLLECTION = "bengkel-assets";
export const SERVICES_MASTER_COLLECTION = "bengkel-services-master";
// DEPRECATED (Keeping reference for migration if needed)
export const JOBS_COLLECTION = "shared-bengkel-jobs";
