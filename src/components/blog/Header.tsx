import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import GrinXOLogo from './GrinXOLogo';

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const isSavedActive = location.pathname === '/blog/saved';

  return (
    <header className="site-header">
      <div className="header-inner container">
        {/* Logo */}
        <Link to="/blog" className="header-logo" aria-label="GrinXO Blog Home">
          {/* Uses the real GrinXO logo image placed at public/grinxo-logo.png */}
          <img
            src="/grinxo-logo.png"
            alt="GrinXO"
            className="header-logo__img"
            height={46}
            style={{ width: 'auto' }}
            onError={(e) => {
              // Swap to inline SVG fallback if image file is not present yet
              const el = e.currentTarget;
              el.style.display = 'none';
              const fallback = el.nextElementSibling as HTMLElement | null;
              if (fallback) fallback.style.display = 'block';
            }}
          />
          <span style={{ display: 'none' }}>
            <GrinXOLogo height={46} />
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="header-nav" aria-label="Main navigation">
          <Link
            to="/blog"
            className={`nav-link${location.pathname === '/blog' ? ' nav-link--active' : ''}`}
          >
            Home
          </Link>
          <a href="#topics" className="nav-link">
            Topics
          </a>
          <a
            href="https://grinxo.com"
            className="nav-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            GrinXO.com
          </a>
        </nav>

        {/* Right action icons — matching code.html */}
        <div className="header-actions">
          <Link
            to="/blog/saved"
            className={`header-action-btn${isSavedActive ? ' header-action-btn--active' : ''}`}
            aria-label="Saved articles"
          >
            <span className="material-symbols-outlined" aria-hidden="true">bookmark</span>
          </Link>

          <button className="header-action-btn" aria-label="Shopping cart">
            <span className="material-symbols-outlined" aria-hidden="true">shopping_cart</span>
          </button>

          <a href="tel:7303337001" className="header-action-btn header-action-btn--phone" aria-label="Call us">
            <span className="material-symbols-outlined" aria-hidden="true">call</span>
            <span className="header-action-btn__label">7303-337-001</span>
          </a>

          <button className="header-action-btn header-action-btn--chat" aria-label="Chat with us">
            <span className="material-symbols-outlined" aria-hidden="true">chat</span>
            <span className="header-action-btn__label">Chat</span>
          </button>

          <button className="header-avatar" aria-label="User account">
            MS
          </button>
        </div>

        {/* Mobile menu toggle */}
        <button
          className="header-menu-toggle"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          <span className="hamburger-bar" />
          <span className="hamburger-bar" />
          <span className="hamburger-bar" />
        </button>
      </div>

      {/* Mobile Nav */}
        {menuOpen && (
        <nav id="mobile-nav" className="header-nav-mobile" aria-label="Mobile navigation">
          <Link
            to="/blog"
            className="nav-link-mobile"
            onClick={() => setMenuOpen(false)}
          >
            Home
          </Link>
          <Link
            to="/blog/saved"
            className={`nav-link-mobile${isSavedActive ? ' nav-link-mobile--active' : ''}`}
            onClick={() => setMenuOpen(false)}
          >
            Saved Articles
          </Link>
          <a
            href="#topics"
            className="nav-link-mobile"
            onClick={() => setMenuOpen(false)}
          >
            Topics
          </a>
          <a
            href="https://grinxo.com"
            className="nav-link-mobile"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMenuOpen(false)}
          >
            GrinXO.com
          </a>
          <a href="tel:7303337001" className="nav-link-mobile">
            📞 7303-337-001
          </a>
        </nav>
      )}
    </header>
  );
}
