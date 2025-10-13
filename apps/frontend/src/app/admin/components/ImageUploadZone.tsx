/**
 * Image Upload Zone Component
 * Drag & drop upload với progress tracking
 */

'use client';

import { useState, useRef } from 'react';
import { Upload, X } from 'lucide-react';
import { uploadMultipleImages } from '@/app/lib/api';

interface Props {
  albumId: string;
  onUploadComplete: () => void;
}

interface FileWithPreview {
  file: File;
  preview: string;
  progress: number;
  error?: string;
}

export default function ImageUploadZone({ albumId, onUploadComplete }: Props) {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  const MAX_FILES = 50;
  const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

  function validateFile(file: File): string | null {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Chỉ hỗ trợ file ảnh (JPG, PNG, WebP, GIF)';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'File quá lớn (tối đa 100MB)';
    }
    return null;
  }

  function handleFiles(newFiles: FileList | null) {
    if (!newFiles || newFiles.length === 0) return;

    if (files.length + newFiles.length > MAX_FILES) {
      alert(`Chỉ có thể upload tối đa ${MAX_FILES} ảnh/lần`);
      return;
    }

    const validFiles: FileWithPreview[] = [];

    Array.from(newFiles).forEach((file) => {
      const error = validateFile(file);
      validFiles.push({
        file,
        preview: URL.createObjectURL(file),
        progress: 0,
        error: error || undefined,
      });
    });

    setFiles((prev) => [...prev, ...validFiles]);
  }

  function handleDrag(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    handleFiles(e.dataTransfer.files);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    handleFiles(e.target.files);
  }

  function removeFile(index: number) {
    setFiles((prev) => {
      const newFiles = [...prev];
      URL.revokeObjectURL(newFiles[index].preview);
      newFiles.splice(index, 1);
      return newFiles;
    });
  }

  async function handleUpload() {
    const validFiles = files.filter((f) => !f.error);

    if (validFiles.length === 0) {
      alert('Không có file hợp lệ để upload');
      return;
    }

    try {
      setUploading(true);

      await uploadMultipleImages(
        albumId,
        validFiles.map((f) => f.file),
        (fileIndex, progress) => {
          setFiles((prev) => {
            const newFiles = [...prev];
            const validIndex = validFiles.findIndex((_, i) => i === fileIndex);
            if (validIndex !== -1) {
              newFiles[validIndex].progress = progress;
            }
            return newFiles;
          });
        }
      );

      alert('Upload thành công!');

      // Clean up
      files.forEach((f) => URL.revokeObjectURL(f.preview));
      setFiles([]);

      // Reload album
      onUploadComplete();
    } catch (error: any) {
      console.error('Upload failed:', error);
      alert(error.message || 'Upload thất bại. Vui lòng thử lại.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {/* Drop Zone */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
          dragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400 bg-white'
        }`}
      >
        <Upload
          size={48}
          className={`mx-auto mb-4 ${dragActive ? 'text-blue-500' : 'text-gray-400'}`}
        />
        <p className="text-lg font-medium text-gray-700 mb-2">
          {dragActive ? 'Thả file vào đây' : 'Kéo thả hoặc click để chọn ảnh'}
        </p>
        <p className="text-sm text-gray-500">
          Hỗ trợ: JPG, PNG, WebP, GIF - Tối đa 100MB/ảnh
        </p>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_TYPES.join(',')}
          onChange={handleFileInput}
          className="hidden"
        />
      </div>

      {/* Preview Grid */}
      {files.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium">
              Đã chọn {files.length} ảnh
            </h3>
            {!uploading && (
              <button
                onClick={() => {
                  files.forEach((f) => URL.revokeObjectURL(f.preview));
                  setFiles([]);
                }}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Xóa tất cả
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {files.map((fileWithPreview, index) => (
              <div key={index} className="relative group">
                <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                  <img
                    src={fileWithPreview.preview}
                    alt={`Preview ${index + 1}`}
                    className="w-full h-full object-cover"
                  />

                  {/* Progress Overlay */}
                  {uploading && fileWithPreview.progress < 100 && (
                    <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                      <div className="text-white text-sm font-medium">
                        {Math.round(fileWithPreview.progress)}%
                      </div>
                    </div>
                  )}

                  {/* Error Overlay */}
                  {fileWithPreview.error && (
                    <div className="absolute inset-0 bg-red-500 bg-opacity-90 flex items-center justify-center p-2">
                      <p className="text-white text-xs text-center">
                        {fileWithPreview.error}
                      </p>
                    </div>
                  )}

                  {/* Remove Button */}
                  {!uploading && (
                    <button
                      onClick={() => removeFile(index)}
                      className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                <p className="mt-1 text-xs text-gray-500 truncate">
                  {fileWithPreview.file.name}
                </p>
              </div>
            ))}
          </div>

          {/* Upload Button */}
          <div className="mt-6 flex gap-4">
            <button
              onClick={handleUpload}
              disabled={uploading || files.every((f) => f.error)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? 'Đang upload...' : `Upload ${files.filter((f) => !f.error).length} ảnh`}
            </button>
            {!uploading && (
              <button
                onClick={() => {
                  files.forEach((f) => URL.revokeObjectURL(f.preview));
                  setFiles([]);
                }}
                className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Hủy
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
