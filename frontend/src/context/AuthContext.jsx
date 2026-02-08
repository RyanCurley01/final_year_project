import React, { useContext, useState, useEffect } from "react";
import { auth } from "../firebase";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";

const AuthContext = React.createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  function signup(email, password) {
    return createUserWithEmailAndPassword(auth, email, password);
  }

  function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  function logout() {
    localStorage.removeItem('currentUser');
    setCurrentUser(null);
    return signOut(auth);
  }

  // Allow manual update of user (e.g. after backend sync or legacy login)
  function setUser(user) {
    setCurrentUser(user);
    if (user) {
      localStorage.setItem('currentUser', JSON.stringify(user));
    } else {
      localStorage.removeItem('currentUser');
    }
  }

  useEffect(() => {
    // Check local storage first (for legacy login or persisted backend user)
    const stored = localStorage.getItem('currentUser');
    if (stored) {
      setCurrentUser(JSON.parse(stored));
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      // If Firebase detects a user, we generally want to respect it.
      // However, if we already have a "richer" user object from localStorage (with DB ID),
      // we might want to keep that, unless the UIDs don't match.
      if (user) {
         // If we don't have a current user, or the current user is just the firebase one (no ID),
         // try to load from local storage to get the full profile.
         const local = localStorage.getItem('currentUser');
         if (local) {
            const localUser = JSON.parse(local);
            // Verify it matches the firebase user (email or uid)
            // Handle different email field names (legacy 'email' vs backend 'accountEmailAddress')
            const localEmail = localUser.email || localUser.accountEmailAddress;
            
            if (localEmail === user.email || localUser.firebaseUid === user.uid) {
               setCurrentUser(localUser);
            } else {
               console.warn("Local user mismatch with Firebase user, overwriting with Firebase user");
               setCurrentUser(user);
            }
         } else {
            setCurrentUser(user);
         }
      } else {
         // Firebase says no user. 
         // Check if we have a legacy user (Basic Auth) in local storage?
         // If we do, we keep it. If not, we are logged out.
         const local = localStorage.getItem('currentUser');
         if (local) {
            const localUser = JSON.parse(local);
            // If it has a firebaseUid, and firebase says we are out, then we are out.
            // If it has NO firebaseUid (Legacy/Seeded), then we act as logged in.
            if (localUser.firebaseUid) {
               setCurrentUser(null);
            } else {
               setCurrentUser(localUser);
            }
         } else {
            setCurrentUser(null);
         }
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    login,
    signup,
    logout,
    setUser
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
