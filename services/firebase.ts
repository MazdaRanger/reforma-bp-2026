
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';

export const firebaseConfig = {
  apiKey: "AIzaSyA4z2XCxu3tNAL5IiNXfY7suu6tYszPAYQ",
  authDomain: "body-repair-system.firebaseapp.com",
  projectId: "body-repair-system",
  storageBucket: "body-repair-system.firebasestorage.app",
  messagingSenderId: "672061097149",
  appId: "1:672061097149:web:2998766b147a4c20a6a3d4"
};

// Initialize Firebase (Compat)
const app = !firebase.apps.length ? firebase.initializeApp(firebaseConfig) : firebase.app();

export const auth = app.auth();
export const db = app.firestore();
export const storage = app.storage();
export const increment = firebase.firestore.FieldValue.increment;

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
export const SERVICES_MASTER_COLLECTION = "bengkel-services-master"; // NEW FOR PANEL RATE
// DEPRECATED (Keeping reference for migration if needed)
export const JOBS_COLLECTION = "shared-bengkel-jobs";
