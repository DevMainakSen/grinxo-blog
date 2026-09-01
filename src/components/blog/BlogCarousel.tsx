import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { Blog } from '../../types/blog';
import BlogMeta from './BlogMeta';

interface BlogCarouselProps {
  blogs: Blog[];
}

export default function BlogCarousel({ blogs }: BlogCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const goTo = useCallback(
    (index: number) => {
      setActiveIndex((index + blogs.length) % blogs.length);
    },
    [blogs.length]
  );

  const goNext = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo]);
  const goPrev = useCallback(() => goTo(activeIndex - 1), [activeIndex, goTo]);

  // Auto-advance
  useEffect(() => {
    if (isPaused || blogs.length <= 1) return;
    intervalRef.current = setInterval(goNext, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [goNext, isPaused, blogs.length]);

  if (blogs.length === 0) return null;

  return (
    <section
      className="blog-carousel"
      aria-label="Featured blog posts"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="carousel-track">
        {blogs.map((blog, index) => (
          <div
            key={blog.id}
            className={`carousel-slide${index === activeIndex ? ' carousel-slide--active' : ''}`}
            aria-hidden={index !== activeIndex}
          >
            {/* Background image */}
            <div className="carousel-slide__bg">
              <img
                src={blog.featuredImage}
                alt=""
                className="carousel-slide__bg-img"
                aria-hidden="true"
              />
              <div className="carousel-slide__overlay" />
            </div>

            {/* Content */}
            <div className="carousel-slide__content container">
              <span className="carousel-slide__category">{blog.category}</span>
              <h2 className="carousel-slide__title">{blog.title}</h2>
              <p className="carousel-slide__excerpt">{blog.excerpt}</p>
              <BlogMeta blog={blog} variant="hero" />
              <Link
                to={`/blog/${blog.slug}`}
                className="carousel-slide__cta"
                tabIndex={index === activeIndex ? 0 : -1}
              >
                Read Article
                <span aria-hidden="true"> →</span>
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      {blogs.length > 1 && (
        <>
          <button
            className="carousel-btn carousel-btn--prev"
            onClick={goPrev}
            aria-label="Previous featured post"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            className="carousel-btn carousel-btn--next"
            onClick={goNext}
            aria-label="Next featured post"
          >
            <span aria-hidden="true">›</span>
          </button>

          {/* Dots */}
          <div className="carousel-dots" role="tablist" aria-label="Featured posts">
            {blogs.map((blog, index) => (
              <button
                key={blog.id}
                role="tab"
                className={`carousel-dot${index === activeIndex ? ' carousel-dot--active' : ''}`}
                aria-selected={index === activeIndex}
                aria-label={`Go to slide ${index + 1}: ${blog.title}`}
                onClick={() => goTo(index)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
