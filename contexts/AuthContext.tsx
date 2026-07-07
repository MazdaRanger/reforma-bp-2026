
import React, { createContext, useContext, useEffect, useState } from 'react';
import firebase from 'firebase/compat/app';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, ADMIN_UID, USERS_COLLECTION } from '../services/firebase';
import { UserProfile, UserPermissions, Settings } from '../types';
import { initialSettingsState } from '../utils/constants';

interface AuthContextType {
  user: firebase.User | null;
  userData: UserProfile;
  userPermissions: UserPermissions;
  settings: Settings;
  loading: boolean;
  login: (email: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<firebase.User | null>(null);
  const [userData, setUserData] = useState<UserProfile>({ uid: '', email: '', displayName: '' });
  const [userPermissions, setUserPermissions] = useState<UserPermissions>({ role: 'Guest', hasFinanceAccess: false });
  const [settings, setSettings] = useState<Settings>(initialSettingsState);
  const [loading, setLoading] = useState(true);

  // Initialize Firebase Auth Listener
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // 1. Check if user is Super Admin
        const isSuperAdmin = currentUser.uid === ADMIN_UID;
        
        let role = 'Staff'; // Default role
        let firestoreDisplayName = '';
        
        if (isSuperAdmin) {
             role = 'Manager';
             
             // Sync Admin Role to Firestore
             try {
                 const userRef = doc(db, USERS_COLLECTION, currentUser.uid);
                 const userSnap = await getDoc(userRef);
                 
                 if (!userSnap.exists() || userSnap.data()?.role !== 'Manager') {
                     await setDoc(userRef, {
                         uid: currentUser.uid,
                         email: currentUser.email,
                         displayName: currentUser.displayName || 'Super Admin',
                         role: 'Manager',
                         createdAt: serverTimestamp()
                     }, { merge: true });
                 }
                 if (userSnap.exists()) {
                     firestoreDisplayName = userSnap.data().displayName;
                 }
             } catch (err: any) {
                 console.error("Failed to sync admin role to Firestore.", err);
             }
        } else {
             // 2. Fetch Role from Firestore 'users' collection
             try {
                 let userDocRef = doc(db, USERS_COLLECTION, currentUser.uid);
                 let userDocSnap = await getDoc(userDocRef);
                 
                 // Fallback: Check by Email if UID doc doesn't exist (legacy support)
                 if (!userDocSnap.exists() && currentUser.email) {
                     userDocRef = doc(db, USERS_COLLECTION, currentUser.email.toLowerCase());
                     userDocSnap = await getDoc(userDocRef);
                 }
                 
                 if (userDocSnap.exists()) {
                     const data = userDocSnap.data();
                     role = data.role || 'Staff';
                     firestoreDisplayName = data.displayName;
                 }
             } catch (error) {
                 console.error("Error fetching user role:", error);
             }
        }

        // Logic Akses Finance: Manager atau Admin Bengkel
        const hasFinanceAccess = role === 'Manager' || role === 'Admin Bengkel';

        // Set User Data
        setUserData({
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: firestoreDisplayName || currentUser.displayName || 'User',
            jobdesk: role,
            role: role
        });
        
        setUserPermissions({
            role: role,
            hasFinanceAccess: hasFinanceAccess 
        });
      } else {
        setUserData({ uid: '', email: '', displayName: '' });
        setUserPermissions({ role: 'Guest', hasFinanceAccess: false });
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, password?: string) => {
    if (!password) throw new Error("Password required");
    await auth.signInWithEmailAndPassword(email, password);
  };

  const logout = async () => {
    await auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, userData, userPermissions, settings, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
