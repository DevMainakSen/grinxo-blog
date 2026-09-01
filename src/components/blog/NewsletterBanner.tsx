import { useState } from 'react';

export default function NewsletterBanner() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim()) {
      // No backend — just acknowledge visually
      setSubmitted(true);
    }
  }

  return (
    <section className="newsletter-banner" aria-labelledby="newsletter-heading">
      <div className="newsletter-banner__inner container">
        <div className="newsletter-banner__text">
          <h2 id="newsletter-heading" className="newsletter-banner__title">
            Plan Effortlessly
          </h2>
          <p className="newsletter-banner__subtitle">
            Get the latest trends and planning guides delivered straight to your inbox.
          </p>
        </div>

        {submitted ? (
          <p className="newsletter-banner__thanks">
            Thank you! We'll be in touch soon. 🎉
          </p>
        ) : (
          <form
            className="newsletter-banner__form"
            onSubmit={handleSubmit}
            aria-label="Newsletter signup"
          >
            <label htmlFor="newsletter-email" className="visually-hidden">
              Email address
            </label>
            <input
              id="newsletter-email"
              type="email"
              className="newsletter-banner__input"
              placeholder="Your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <button type="submit" className="newsletter-banner__btn">
              Subscribe
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
