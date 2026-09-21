import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";

const AuthContext = createContext(null);

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

    api
      .me()
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

  async function login(credentials) {
    const data = await api.login(credentials);
    localStorage.setItem("queueless_token", data.token);
    localStorage.setItem("queueless_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
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
      logout,
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}

