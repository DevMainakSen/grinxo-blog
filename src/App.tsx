import { Routes, Route, Navigate } from 'react-router-dom';
import BlogHome from './pages/BlogHome';
import BlogArticle from './pages/BlogArticle';

function App() {
  return (
    <Routes>
      {/* Redirect root to /blog */}
      <Route path="/" element={<Navigate to="/blog" replace />} />
      <Route path="/blog" element={<BlogHome />} />
      <Route path="/blog/:slug" element={<BlogArticle />} />
      {/* Catch-all: redirect unknown paths to /blog */}
      <Route path="*" element={<Navigate to="/blog" replace />} />
    </Routes>
  );
}

export default App;
