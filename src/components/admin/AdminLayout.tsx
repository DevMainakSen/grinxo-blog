import { Link, NavLink, useLocation } from 'react-router-dom';
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

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-header__inner">
          <Link to={BLOGS_PATH} className="admin-header__brand">
            <span className="admin-header__logo" aria-hidden="true">G</span>
            <span className="admin-header__title">GrinXO Blog Admin</span>
          </Link>

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
        </div>
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