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

export async function updateProfile({ name, email, phoneNumber }) {
  const { data } = await apiClient.patch("/auth/me", { name, email, phoneNumber });
  return data;
}

// The photo endpoint needs the bearer token, so it cannot be an <img src>.
// Returns an object URL the caller must revoke, or null when no photo exists.
export async function getProfilePhotoUrl() {
  try {
    const { data } = await apiClient.get("/auth/me/photo", { responseType: "blob" });
    return URL.createObjectURL(data);
  } catch (error) {
    if (error.response?.status === 404) return null;
    throw error;
  }
}

export async function uploadProfilePhoto(file) {
  const { data } = await apiClient.put("/auth/me/photo", file, {
    headers: { "Content-Type": file.type },
  });
  return data;
}

export async function deleteProfilePhoto() {
  const { data } = await apiClient.delete("/auth/me/photo");
  return data;
}
