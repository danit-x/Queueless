import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import SiteNav from "./components/SiteNav";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home_2";
import Login from "./pages/Login";
import ManageQueue from "./pages/ManageQueue";
import Register from "./pages/Register";
import Ticket from "./pages/Ticket";

export default function App() {
  return (
    <>
      <SiteNav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<Dashboard />} />
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

