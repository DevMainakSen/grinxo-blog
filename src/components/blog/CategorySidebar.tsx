import type { BlogCategory } from '../../types/blog';

interface CategorySidebarProps {
  categories: BlogCategory[];
}

export default function CategorySidebar({ categories }: CategorySidebarProps) {
  return (
    <aside className="category-sidebar" aria-label="Blog topics">
      <h3 className="category-sidebar__heading">Explore Topics</h3>
      <ul className="category-sidebar__list" role="list">
        {categories.map((cat) => (
          <li key={cat.name} className="category-sidebar__item">
            <span className="category-sidebar__name">{cat.name}</span>
            <span className="category-sidebar__count">{cat.count}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
