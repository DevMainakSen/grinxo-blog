import { Routes, Route, Navigate } from 'react-router-dom';
import BlogHome from './pages/BlogHome';
import BlogArticle from './pages/BlogArticle';
import BlogDashboard from './pages/admin/BlogDashboard';
import CreateBlog from './pages/admin/CreateBlog';
import EditBlog from './pages/admin/EditBlog';
import { ADMIN_BASE_PATH } from './services/config';

const BLOGS_PATH = `${ADMIN_BASE_PATH}/blogs`;

function App() {
  return (
    <Routes>
      {/* Redirect root to /blog */}
      <Route path="/" element={<Navigate to="/blog" replace />} />
      <Route path="/blog" element={<BlogHome />} />
      <Route path="/blog/:slug" element={<BlogArticle />} />

      {/* Admin panel */}
      <Route path={ADMIN_BASE_PATH} element={<Navigate to={BLOGS_PATH} replace />} />
      <Route path={BLOGS_PATH} element={<BlogDashboard />} />
      <Route path={`${BLOGS_PATH}/new`} element={<CreateBlog />} />
      <Route path={`${BLOGS_PATH}/:id/edit`} element={<EditBlog />} />

      {/* Catch-all: redirect unknown paths to /blog */}
      <Route path="*" element={<Navigate to="/blog" replace />} />
    </Routes>
  );
}

export default App;
