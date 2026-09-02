import type { Blog } from '../types/blog';
import { API_BASE_URL } from './config';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: options?.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data && typeof data.error === 'string') message = data.error;
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new ApiError(message, res.status);
  }

  return res.json() as Promise<T>;
}

interface BlogsResponse {
  blogs: Blog[];
}

/** All blogs (drafts included) — used by the admin panel. */
export const getAllBlogs = async (): Promise<Blog[]> => {
  const data = await request<BlogsResponse>('/api/blogs');
  return data.blogs;
};

/** Published blogs only — used by the public site. */
export const getPublishedBlogs = async (): Promise<Blog[]> => {
  const data = await request<BlogsResponse>('/api/blogs?status=published');
  return data.blogs;
};

export const getBlog = (id: string): Promise<Blog> =>
  request<Blog>(`/api/blogs/${id}`);

export const getBlogBySlug = (slug: string): Promise<Blog> =>
  request<Blog>(`/api/blogs/slug/${slug}`);

export const getCategories = (): Promise<{ name: string; count: number }[]> =>
  request<{ name: string; count: number }[]>('/api/categories');

export const createBlog = (blog: Omit<Blog, 'id'>): Promise<Blog> =>
  request<Blog>('/api/blogs', { method: 'POST', body: JSON.stringify(blog) });

export const updateBlog = (id: string, blog: Partial<Blog>): Promise<Blog> =>
  request<Blog>(`/api/blogs/${id}`, { method: 'PUT', body: JSON.stringify(blog) });

export const publishBlog = (id: string): Promise<Blog> =>
  request<Blog>(`/api/blogs/${id}/publish`, { method: 'POST' });

export const draftBlog = (id: string): Promise<Blog> =>
  request<Blog>(`/api/blogs/${id}/draft`, { method: 'POST' });

export const scheduleBlog = (id: string, scheduledAt: string): Promise<Blog> =>
  request<Blog>(`/api/blogs/${id}/schedule`, {
    method: 'POST',
    body: JSON.stringify({ scheduledAt }),
  });

export const deleteBlog = (id: string): Promise<{ ok: true }> =>
  request<{ ok: true }>(`/api/blogs/${id}`, { method: 'DELETE' });

export const uploadImage = async (file: File, folder: 'banners' | 'sections'): Promise<string> => {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('folder', folder);
  const res = await fetch(`${API_BASE_URL}/api/uploads`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    let message = `Upload failed (${res.status})`;
    try {
      const data = await res.json();
      if (data && typeof data.error === 'string') message = data.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }
  const data = (await res.json()) as { url: string };
  return data.url;
};
