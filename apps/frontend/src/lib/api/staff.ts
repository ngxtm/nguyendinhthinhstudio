/**
 * Staff API Service
 */

import { adminApiClient, uploadFile } from './client';

export type StaffRole = 'photographer' | 'makeup_artist';
export type StaffStatus = 'active' | 'inactive';

export interface Staff {
  id: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  role: StaffRole;
  status: StaffStatus;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStaffDto {
  fullName: string;
  phone?: string;
  email?: string;
  avatarUrl?: string;
  role: StaffRole;
  status?: StaffStatus;
  note?: string;
}

export interface UpdateStaffDto extends Partial<CreateStaffDto> {}

/**
 * List all staff (admin only).
 */
export async function listStaff(): Promise<Staff[]> {
  return adminApiClient<Staff[]>('/staff');
}

/**
 * Get a staff member by ID (admin only).
 */
export async function getStaff(id: string): Promise<Staff> {
  return adminApiClient<Staff>(`/staff/${id}`);
}

/**
 * Create a new staff member (admin only).
 */
export async function createStaff(data: CreateStaffDto): Promise<Staff> {
  return adminApiClient<Staff>('/staff', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Update a staff member (admin only).
 */
export async function updateStaff(id: string, data: UpdateStaffDto): Promise<Staff> {
  return adminApiClient<Staff>(`/staff/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Delete a staff member (admin only).
 */
export async function deleteStaff(id: string): Promise<void> {
  return adminApiClient<void>(`/staff/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Upload a staff avatar via the presign + R2 pipeline.
 * Returns the public avatar URL (imgproxy-optimised, 256x256 WebP).
 */
export async function uploadStaffAvatar(
  staffId: string,
  file: File,
): Promise<string> {
  const { objectKey, uploadUrl } = await adminApiClient<{
    objectKey: string;
    uploadUrl: string;
  }>('/staff/avatar/presign', {
    method: 'POST',
    body: JSON.stringify({ contentType: file.type, fileSize: file.size }),
  });
  await uploadFile(uploadUrl, file);
  return adminApiClient<string>(`/staff/${staffId}/avatar`, {
    method: 'POST',
    body: JSON.stringify({ objectKey }),
  });
}