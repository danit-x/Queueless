import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./SiteNav.css";

export default function SiteNav() {
  const { isAuthenticated, logout, user } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <header className="site-nav">
      <nav className="site-nav-inner" aria-label="Main navigation">
        <Link to="/" className="site-nav-brand">
          Queue<span>Less</span>
        </Link>
        <div className="site-nav-links">
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/dashboard">Dashboard</NavLink>
        </div>
        <div className="site-nav-actions">
          {isAuthenticated ? (
            <>
              <span className="site-nav-user">{user?.name || user?.email}</span>
              <button type="button" onClick={handleLogout}>
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="site-nav-login">
                Log in
              </Link>
              <Link to="/register" className="site-nav-register">
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}