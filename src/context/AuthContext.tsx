import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  User,
} from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase/config";
import { UserProfile } from "../types";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  authError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    name: string,
    email: string,
    password: string,
    role: "driver" | "customer"
  ) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setProfile(null);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
        setAuthError(null);
        setLoading(false);
      },
      async (err) => {
        console.error("Failed to load user profile:", err);
        setProfile(null);
        setAuthError(
          `Signed in, but couldn't load your account data (${err?.code ?? err?.message ?? "unknown error"}). Please try again or contact support.`
        );
        setLoading(false);
        // Sign back out so the app doesn't sit in a half-authenticated
        // limbo state — the user lands back on the login screen with
        // the error message visible instead of a silent stuck spinner.
        await firebaseSignOut(auth);
      }
    );
    return unsubscribe;
  }, [user]);

  const signIn = async (email: string, password: string) => {
    setAuthError(null);
    await signInWithEmailAndPassword(auth, email.trim(), password);
  };

  const signUp = async (
    name: string,
    email: string,
    password: string,
    requestedRole: "driver" | "customer"
  ) => {
    const credential = await createUserWithEmailAndPassword(
      auth,
      email.trim(),
      password
    );
    // The profile email has to match the Auth token. Security rules reject
    // any other value, and reject role "admin" — an existing admin promotes
    // accounts from Manage Users (setUserRole).
    await credential.user.getIdToken(true);
    const canonicalEmail = credential.user.email;
    if (!canonicalEmail) {
      throw new Error("Couldn't read the new account email.");
    }
    const newProfile: UserProfile = {
      uid: credential.user.uid,
      email: canonicalEmail,
      name: name.trim(),
      role: requestedRole,
      createdAt: Date.now(),
    };
    await setDoc(doc(db, "users", credential.user.uid), newProfile);
    setProfile(newProfile);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const value = useMemo(
    () => ({ user, profile, loading, authError, signIn, signUp, signOut }),
    [user, profile, loading, authError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
