import axios from "axios";

export const AUTH_UNAUTHORIZED_EVENT = "queueless:unauthorized";

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("queueless_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    delete config.headers.Authorization;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("queueless_token");
      localStorage.removeItem("queueless_user");
      window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));

      if (window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    }

    if (error.response?.data?.message) {
      error.message = error.response.data.message;
    } else if (error.request && !error.response) {
      error.message = "Backend is unavailable. Please check that the API is running.";
    }

    return Promise.reject(error);
  }
);
