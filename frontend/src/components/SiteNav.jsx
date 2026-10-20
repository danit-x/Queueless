import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./SiteNav.css";

export default function SiteNav() {
  const { isAuthenticated, logout, user } = useAuth();
  const navigate = useNavigate();

  const profileName = user?.name || user?.email || "Profile";
  const profileInitial = profileName.charAt(0).toUpperCase();

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
            <details className="site-nav-profile">
              <summary aria-label="Open profile menu">
                <span className="site-nav-avatar" aria-hidden="true">{profileInitial}</span>
                <span className="site-nav-profile-name">{profileName}</span>
              </summary>
              <div className="site-nav-profile-menu">
                <div className="site-nav-profile-info">
                  <strong>{user?.name || "Your profile"}</strong>
                  {user?.email && <span>{user.email}</span>}
                </div>
                <button type="button" onClick={handleLogout}>
                  Log out
                </button>
              </div>
            </details>
          ) : (
            <>
              <Link to="/login" className="site-nav-login">
                Sign in
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