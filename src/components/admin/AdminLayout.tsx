import { Link, NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { ADMIN_BASE_PATH } from '../../services/config';

interface AdminLayoutProps {
  children: ReactNode;
}

const BLOGS_PATH = `${ADMIN_BASE_PATH}/blogs`;
const NEW_PATH = `${ADMIN_BASE_PATH}/blogs/new`;

export default function AdminLayout({ children }: AdminLayoutProps) {
  const location = useLocation();
  const inDashboard = location.pathname === BLOGS_PATH;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-header__inner">
          <Link to={BLOGS_PATH} className="admin-header__brand">
            <span className="admin-header__logo" aria-hidden="true">G</span>
            <span className="admin-header__title">GrinXO Blog Admin</span>
          </Link>

          {/* Desktop nav */}
          <nav className="admin-header__nav" aria-label="Admin navigation">
            <NavLink
              to={BLOGS_PATH}
              className={({ isActive }) =>
                `admin-nav-link${isActive ? ' admin-nav-link--active' : ''}`
              }
            >
              Blogs
            </NavLink>
            <NavLink to={NEW_PATH} className="admin-nav-link">
              New Blog
            </NavLink>
            <a
              href="/blog"
              className="admin-nav-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              View Public Site ↗
            </a>
          </nav>

          {!inDashboard && (
            <Link to={BLOGS_PATH} className="btn btn--ghost btn--sm admin-header__back">
              ← Dashboard
            </Link>
          )}

          {/* Mobile menu toggle */}
          <button
            type="button"
            className="admin-header__toggle"
            aria-label={menuOpen ? 'Close admin menu' : 'Open admin menu'}
            aria-expanded={menuOpen}
            aria-controls="admin-mobile-menu"
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            <span className="hamburger-bar" />
            <span className="hamburger-bar" />
            <span className="hamburger-bar" />
          </button>
        </div>

        {/* Mobile nav drawer */}
        {menuOpen && (
          <nav
            id="admin-mobile-menu"
            className="admin-nav-mobile"
            aria-label="Admin navigation (mobile)"
          >
            <NavLink
              to={BLOGS_PATH}
              className={({ isActive }) =>
                `admin-nav-mobile__link${isActive ? ' is-active' : ''}`
              }
              onClick={() => setMenuOpen(false)}
            >
              Blogs
            </NavLink>
            <NavLink
              to={NEW_PATH}
              className="admin-nav-mobile__link"
              onClick={() => setMenuOpen(false)}
            >
              New Blog
            </NavLink>
            <a
              href="/blog"
              className="admin-nav-mobile__link"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
            >
              View Public Site ↗
            </a>
            {!inDashboard && (
              <Link
                to={BLOGS_PATH}
                className="admin-nav-mobile__link"
                onClick={() => setMenuOpen(false)}
              >
                ← Dashboard
              </Link>
            )}
          </nav>
        )}
      </header>

      <main className="admin-main">
        <div className="admin-content">{children}</div>
      </main>

      <footer className="admin-footer">
        <p>
          GrinXO Blog Admin — prototype demo. No authentication. Data is stored
          locally in <code>server/data/blogs.json</code>.
        </p>
      </footer>
    </div>
  );
}