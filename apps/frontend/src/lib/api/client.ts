/**
 * API Client Configuration
 * Base fetch wrapper với error handling và auth
 */

function resolveApiBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined') {
    return '';
  }

  const internalUrl = process.env.NEXT_PUBLIC_API_INTERNAL_URL?.trim();
  if (internalUrl) {
    return internalUrl.replace(/\/$/, '');
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/\/$/, '')}`;
  }

  const cfUrl = process.env.CF_PAGES_URL?.trim();
  if (cfUrl) {
    return `https://${cfUrl.replace(/\/$/, '')}`;
  }

  return 'http://localhost:3000';
}

const API_BASE_URL = resolveApiBaseUrl();

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public data?: unknown
  ) {
    super(`API Error ${status}: ${statusText}`);
    this.name = 'ApiError';
  }
}

export interface ApiResponse<T> {
  data: T;
  error?: string;
}

/**
 * Generic fetch wrapper with authentication
 */
export async function apiClient<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = API_BASE_URL ? `${API_BASE_URL}${endpoint}` : endpoint;

  // Get auth token from localStorage (sau khi login với Supabase)
  const token = typeof window !== 'undefined'
    ? localStorage.getItem('auth_token')
    : null;

  const headers = new Headers(options?.headers ?? {});
  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(response.status, response.statusText, error);
  }

  // Handle empty responses (DELETE requests)
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    return {} as T;
  }

  return response.json();
}

/**
 * Upload file với progress tracking và timeout
 * @param timeout - Timeout in milliseconds (default: 10 minutes for large files)
 */
export async function uploadFile(
  url: string,
  file: File,
  onProgress?: (progress: number) => void,
  timeout: number = 10 * 60 * 1000 // 10 phút mặc định
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Set timeout
    xhr.timeout = timeout;

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const progress = (e.loaded / e.total) * 100;
        onProgress(progress);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        // Log detailed error info
        console.error('Upload failed:', {
          status: xhr.status,
          statusText: xhr.statusText,
          response: xhr.responseText,
          headers: xhr.getAllResponseHeaders(),
        });

        // Try to parse error message from response
        let errorMsg = `Upload failed: ${xhr.status}`;
        try {
          const errorData = JSON.parse(xhr.responseText) as {
            errors?: Array<{ message?: string }>;
          };
          if (errorData.errors && errorData.errors.length > 0) {
            errorMsg += ` - ${errorData.errors
              .map((item) => item.message)
              .filter(Boolean)
              .join(', ')}`;
          }
        } catch {
          // Response is not JSON, use status text
          if (xhr.responseText) {
            errorMsg += ` - ${xhr.responseText.substring(0, 200)}`;
          }
        }

        reject(new Error(errorMsg));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed: Network error'));
    });

    xhr.addEventListener('timeout', () => {
      reject(new Error('Upload failed: Timeout (quá 10 phút)'));
    });

    // Cloudflare requires POST with multipart/form-data, not PUT
    xhr.open('POST', url);

    // Create FormData to send file as multipart/form-data
    const formData = new FormData();
    formData.append('file', file);

    xhr.send(formData);
  });
}
