import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import SiteNav from "./components/SiteNav";
import CreateQueue from "./pages/CreateQueue";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home_2";
import Login from "./pages/Login";
import ManageQueue from "./pages/ManageQueue";
import Profile from "./pages/Profile";
import Register from "./pages/Register";
import Ticket from "./pages/Ticket";

export default function App() {
  const location = useLocation();
  const isDashboard = location.pathname.startsWith("/dashboard");

  return (
    <>
      {!isDashboard && <SiteNav />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/queues/new"
          element={
            <ProtectedRoute>
              <CreateQueue />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tickets/:ticketId"
          element={
            <ProtectedRoute>
              <Ticket />
            </ProtectedRoute>
          }
        />
        <Route
          path="/queues/:queueId/manage"
          element={
            <ProtectedRoute>
              <ManageQueue />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

