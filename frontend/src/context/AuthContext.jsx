import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AUTH_UNAUTHORIZED_EVENT } from "../services/api";
import {
  getCurrentUser,
  login as loginUser,
  register as registerUser,
} from "../services/authService";

const AuthContext = createContext(undefined);

function persistSession(data) {
  localStorage.setItem("queueless_token", data.token);
  localStorage.setItem("queueless_user", JSON.stringify(data.user));
  return data.user;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem("queueless_user");
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("queueless_token");

    if (!token) {
      setLoading(false);
      return;
    }

    getCurrentUser()
      .then(({ user: currentUser }) => {
        setUser(currentUser);
        localStorage.setItem("queueless_user", JSON.stringify(currentUser));
      })
      .catch(() => {
        localStorage.removeItem("queueless_token");
        localStorage.removeItem("queueless_user");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleUnauthorized() {
      localStorage.removeItem("queueless_token");
      localStorage.removeItem("queueless_user");
      setUser(null);
    }

    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  async function login(credentials) {
    const data = await loginUser(credentials.email, credentials.password);
    const authenticatedUser = persistSession(data);
    setUser(authenticatedUser);
    return authenticatedUser;
  }

  async function register({ name, email, password }) {
    const data = await registerUser(name, email, password);
    const authenticatedUser = persistSession(data);
    setUser(authenticatedUser);
    return authenticatedUser;
  }

  function logout() {
    localStorage.removeItem("queueless_token");
    localStorage.removeItem("queueless_user");
    setUser(null);
  }

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      login,
      register,
      logout,
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
