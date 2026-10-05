import { apiClient } from "./api";

export async function login(email, password) {
  const { data } = await apiClient.post("/auth/login", { email, password });
  return data;
}

export async function register(name, email, password) {
  const { data } = await apiClient.post("/auth/register", { name, email, password });
  return data;
}

export async function getCurrentUser() {
  const { data } = await apiClient.get("/auth/me");
  return data;
}
