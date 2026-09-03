import { useMemo, useState } from 'react';
import type { BlogCategory } from '../../types/blog';

interface TopicFilterBarProps {
  categories: BlogCategory[];
  totalCount: number;
  activeTopic: string;
  onTopicChange: (topic: string) => void;
  visibleLimit?: number;
}

export default function TopicFilterBar({
  categories,
  totalCount,
  activeTopic,
  onTopicChange,
  visibleLimit = 6,
}: TopicFilterBarProps) {
  const [showAll, setShowAll] = useState(false);

  const topics = useMemo<BlogCategory[]>(
    () => [{ name: 'All', count: totalCount }, ...categories],
    [categories, totalCount]
  );

  const visible = showAll ? topics : topics.slice(0, visibleLimit);
  const hiddenCount = Math.max(0, topics.length - visibleLimit);

  return (
    <div
      className="topic-filter"
      role="group"
      aria-label="Filter stories by topic"
    >
      {visible.map((topic) => {
        const isActive = activeTopic === topic.name;
        return (
          <button
            key={topic.name}
            type="button"
            className={`topic-filter__pill${isActive ? ' topic-filter__pill--active' : ''}`}
            aria-pressed={isActive}
            onClick={() => {
              if (topic.name === 'All') setShowAll(false);
              onTopicChange(topic.name);
            }}
          >
            <span>{topic.name}</span>
            <span className="topic-filter__count">{topic.count}</span>
          </button>
        );
      })}

      {!showAll && hiddenCount > 0 && (
        <button
          type="button"
          className="topic-filter__pill topic-filter__pill--more"
          onClick={() => setShowAll(true)}
          aria-expanded={false}
        >
          +{hiddenCount} more
        </button>
      )}
    </div>
  );
}