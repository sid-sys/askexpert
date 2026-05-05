"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  User,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
} from "firebase/auth";
import { doc, getDoc, setDoc, onSnapshot, collection, query, where, getDocs, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { FirestoreUser, COLLECTIONS } from "@/lib/types";

// ── Username generator ────────────────────────────────────────────────────
// Produces names like "swift_sage_42" — short, fun, memorable
const ADJ  = ["swift","bold","wise","sharp","keen","deep","true","clear","bright","calm","brave","rare"];
const NOUN = ["sage","mind","hawk","wolf","peak","lens","wave","path","fox","oak","star","lens"];
function randomHandle(): string {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  const n = NOUN[Math.floor(Math.random() * NOUN.length)];
  const num = Math.floor(Math.random() * 90) + 10; // 10-99
  return `${a}_${n}_${num}`;
}

/** Checks Firestore for uniqueness — loops up to 10 times, then falls back to UID prefix */
async function generateUniqueUsername(fallbackUid: string): Promise<string> {
  const { db: firestoreDb } = await import("@/lib/firebase");
  for (let i = 0; i < 10; i++) {
    const candidate = randomHandle();
    const snap = await getDocs(
      query(collection(firestoreDb, COLLECTIONS.USERS), where("username", "==", candidate))
    );
    if (snap.empty) return candidate;
  }
  // All 10 attempts collided — fall back to first 12 chars of UID
  return fallbackUid.slice(0, 12);
}

/** Checks whether a given username string is already taken in Firestore */
async function isUsernameTaken(handle: string): Promise<boolean> {
  const { db: firestoreDb } = await import("@/lib/firebase");
  const snap = await getDocs(
    query(collection(firestoreDb, COLLECTIONS.USERS), where("username", "==", handle))
  );
  return !snap.empty;
}


interface AuthContextType {
  user: User | null;
  userProfile: FirestoreUser | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, username: string) => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<FirestoreUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (uid: string) => {
    try {
      const ref = doc(db, COLLECTIONS.USERS, uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setUserProfile(snap.data() as FirestoreUser);
      }
    } catch (err: unknown) {
      // Silently ignore offline / aborted errors – the app will retry on next auth state change
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("client is offline") ||
        message.includes("AbortError") ||
        (err instanceof Error && err.name === "AbortError")
      ) {
        return;
      }
      console.error("[fetchProfile] Firestore error:", err);
    }
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.uid);
  };

  // profileUnsub holds the active onSnapshot listener for the user profile
  // We keep it in a ref-like pattern using a module-level variable

  useEffect(() => {
    let profileUnsub: (() => void) | null = null;

    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      // Unsubscribe from previous user's profile listener
      if (profileUnsub) { profileUnsub(); profileUnsub = null; }

      setUser(firebaseUser);

      if (firebaseUser) {
        // ── Set loading false IMMEDIATELY — don't wait for profile fetch ──
        setLoading(false);

        // Load profile from IndexedDB cache first, then network (non-blocking)
        const ref = doc(db, COLLECTIONS.USERS, firebaseUser.uid);
        profileUnsub = onSnapshot(ref, (snap) => {
          if (snap.exists()) {
            setUserProfile(snap.data() as FirestoreUser);
          }
        }, (err) => {
          const msg = err?.message || "";
          if (!msg.includes("client is offline") && !msg.includes("AbortError")) {
            console.error("[AuthContext] profile snapshot error:", err);
          }
        });
      } else {
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsub();
      if (profileUnsub) profileUnsub();
    };
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const { user: u } = result;
    const isAdminEmail = u.email?.toLowerCase() === "sidharthbabu9@gmail.com";
    const ref = doc(db, COLLECTIONS.USERS, u.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const username = await generateUniqueUsername(u.uid);
      const profile: FirestoreUser = {
        uid: u.uid,
        email: u.email || "",
        username,
        displayName: u.displayName || username,
        bio: "",
        photoURL: u.photoURL || "",
        isCreator: isAdminEmail ? true : false,
        isAdmin: isAdminEmail ? true : false,
        stripeAccountId: null,
        stripeOnboardingComplete: false,
        perQuestionPrice: 500,
        monthlyPrice: 1000,
        createdAt: serverTimestamp() as any,
      };
      await setDoc(ref, profile);
      setUserProfile(profile);
      // Grant Firebase custom claim for admin
      if (isAdminEmail) {
        await fetch("/api/admin/set-claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid: u.uid }),
        });
      }
    } else {
      const existing = snap.data() as FirestoreUser;
      // Retroactively grant admin if they weren't flagged yet
      if (isAdminEmail && !existing.isAdmin) {
        await setDoc(ref, { isAdmin: true, isCreator: true }, { merge: true });
        existing.isAdmin = true;
        existing.isCreator = true;
        await fetch("/api/admin/set-claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid: u.uid }),
        });
      }
      setUserProfile(existing);
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUpWithEmail = async (email: string, password: string, username: string) => {
    // ── Enforce username uniqueness BEFORE creating the Firebase Auth account ──
    const taken = await isUsernameTaken(username);
    if (taken) {
      throw new Error("That username is already taken. Please choose a different one.");
    }

    const result = await createUserWithEmailAndPassword(auth, email, password);
    const { user: u } = result;
    // Send email verification immediately
    await sendEmailVerification(u);
    // Grant admin flag in Firestore if it's the admin email
    const isAdmin = email.toLowerCase() === "sidharthbabu9@gmail.com";
    const profile: FirestoreUser = {
      uid: u.uid,
      email: u.email || "",
      username,
      displayName: username,
      bio: "",
      photoURL: "",
      isCreator: true,
      isAdmin,
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      perQuestionPrice: 500,
      monthlyPrice: 1000,
      createdAt: serverTimestamp() as any,
    };
    await setDoc(doc(db, COLLECTIONS.USERS, u.uid), profile);
    setUserProfile(profile);
    // If admin email — set custom claim server-side
    if (isAdmin) {
      await fetch("/api/admin/set-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: u.uid }),
      });
    }
  };

  const sendVerificationEmail = async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    }
  };

  const sendPasswordReset = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const logout = async () => {
    await signOut(auth);
    setUserProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        sendVerificationEmail,
        sendPasswordReset,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
