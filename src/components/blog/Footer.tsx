import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner container">
        {/* Brand */}
        <div className="footer-brand">
          <Link to="/blog" className="footer-logo">
            GrinXO
          </Link>
          <p className="footer-tagline">
            © 2024 GrinXO. Effortless planning for life's milestones.
          </p>
        </div>

        {/* Links */}
        <nav className="footer-links" aria-label="Footer navigation">
          <a href="#" className="footer-link">
            Privacy Policy
          </a>
          <a href="#" className="footer-link">
            Terms of Service
          </a>
          <a href="#" className="footer-link">
            Contact Us
          </a>
          <a href="#" className="footer-link">
            About GrinXO
          </a>
        </nav>
      </div>
    </footer>
  );
}
