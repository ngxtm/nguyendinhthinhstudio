/**
 * Image Upload Zone Component
 * Optimized upload với queue, retry, pause/resume
 */

'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, X, FileImage, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { uploadImage } from '@/app/lib/api';
import imageCompression from 'browser-image-compression';

interface Props {
  albumId: string;
  onUploadComplete: () => void;
}

type UploadStatus = 'pending' | 'uploading' | 'success' | 'error' | 'paused';

interface FileWithProgress {
  file: File;
  preview: string | null;
  progress: number;
  status: UploadStatus;
  error?: string;
  retryCount: number;
  statusText?: string; // "Đang lấy URL...", "Đang upload...", "Đang lưu vào DB..."
}

export default function ImageUploadZone({ albumId, onUploadComplete }: Props) {
  const [files, setFiles] = useState<FileWithProgress[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadControllerRef = useRef<{ cancel: boolean }>({ cancel: false });

  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  const MAX_FILES = 50;
  const CONCURRENT_UPLOADS = 2; // Upload 2 ảnh đồng thời
  const PREVIEW_SIZE_LIMIT = 10 * 1024 * 1024; // Chỉ tạo preview cho ảnh < 10MB
  const COMPRESSION_THRESHOLD = 10 * 1024 * 1024; // Compress ảnh > 10MB
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

  /**
   * Compress image if it's larger than 10MB
   * Target: ~10MB with quality 0.85 (very good quality)
   */
  async function compressImageIfNeeded(file: File): Promise<File> {
    // Skip compression if file is already small enough
    if (file.size <= COMPRESSION_THRESHOLD) {
      return file;
    }

    // Skip compression for GIF (would lose animation)
    if (file.type === 'image/gif') {
      return file;
    }

    try {
      console.log(`🗜️ Compressing ${file.name} (${formatFileSize(file.size)})...`);

      const options = {
        maxSizeMB: 10, // Target 10MB
        maxWidthOrHeight: 4096, // Max dimension (keeps aspect ratio)
        useWebWorker: true,
        quality: 0.85, // 85% quality - still very sharp
        fileType: file.type as any,
      };

      const compressedFile = await imageCompression(file, options);

      console.log(`✅ Compressed: ${formatFileSize(file.size)} → ${formatFileSize(compressedFile.size)}`);

      // Rename to keep original filename
      return new File([compressedFile], file.name, {
        type: compressedFile.type,
        lastModified: Date.now(),
      });
    } catch (error) {
      console.error('Compression failed:', error);
      toast.warning(`Không thể nén ${file.name}, sẽ upload bản gốc`);
      return file;
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async function handleFiles(newFiles: FileList | null) {
    if (!newFiles || newFiles.length === 0) return;

    if (files.length + newFiles.length > MAX_FILES) {
      toast.error(`Chỉ có thể upload tối đa ${MAX_FILES} ảnh/lần`);
      return;
    }

    const validFiles: FileWithProgress[] = [];
    const filesToProcess = Array.from(newFiles);

    // Show compression toast if needed
    const largeFiles = filesToProcess.filter(f => f.size > COMPRESSION_THRESHOLD && f.type !== 'image/gif');
    if (largeFiles.length > 0) {
      toast.info(`Đang nén ${largeFiles.length} ảnh lớn để tối ưu upload...`, { duration: 5000 });
    }

    // Process files with compression
    for (const file of filesToProcess) {
      const error = validateFile(file);

      if (error) {
        validFiles.push({
          file,
          preview: null,
          progress: 0,
          status: 'error',
          error: error,
          retryCount: 0,
        });
        continue;
      }

      // Compress if needed
      const processedFile = await compressImageIfNeeded(file);

      // Chỉ tạo preview cho ảnh nhỏ hơn 10MB (tránh lag)
      const shouldCreatePreview = processedFile.size < PREVIEW_SIZE_LIMIT;

      validFiles.push({
        file: processedFile,
        preview: shouldCreatePreview ? URL.createObjectURL(processedFile) : null,
        progress: 0,
        status: 'pending',
        error: undefined,
        retryCount: 0,
      });
    }

    setFiles((prev) => [...prev, ...validFiles]);

    if (validFiles.length > 0) {
      toast.success(`Đã thêm ${validFiles.length} ảnh vào danh sách`);
    }
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
      if (newFiles[index].preview) {
        URL.revokeObjectURL(newFiles[index].preview!);
      }
      newFiles.splice(index, 1);
      return newFiles;
    });
  }

  const uploadSingleFile = useCallback(async (
    fileItem: FileWithProgress,
    index: number
  ): Promise<void> => {
    // Check if cancelled
    if (uploadControllerRef.current.cancel) {
      throw new Error('Upload cancelled');
    }

    // Update status to uploading
    setFiles((prev) => {
      const newFiles = [...prev];
      newFiles[index].status = 'uploading';
      newFiles[index].progress = 0;
      newFiles[index].error = undefined;
      return newFiles;
    });

    try {
      await uploadImage(
        albumId,
        fileItem.file,
        (progress) => {
          setFiles((prev) => {
            const newFiles = [...prev];
            newFiles[index].progress = progress;
            return newFiles;
          });
        }
      );

      // Success
      setFiles((prev) => {
        const newFiles = [...prev];
        newFiles[index].status = 'success';
        newFiles[index].progress = 100;
        return newFiles;
      });
    } catch (error: any) {
      // Set error state - NO AUTO RETRY
      setFiles((prev) => {
        const newFiles = [...prev];
        newFiles[index].status = 'error';
        newFiles[index].error = error.message || 'Upload thất bại';
        return newFiles;
      });
      throw error;
    }
  }, [albumId]);

  async function handleUpload() {
    const validFiles = files.filter((f) => !f.error && f.status !== 'success');

    if (validFiles.length === 0) {
      toast.error('Không có file hợp lệ để upload');
      return;
    }

    try {
      setUploading(true);
      uploadControllerRef.current.cancel = false;

      toast.info(`Bắt đầu upload ${validFiles.length} ảnh...`);

      // Upload với concurrency (2 ảnh cùng lúc)
      const queue = [...files.map((f, i) => ({ file: f, index: i })).filter(({ file }) =>
        !file.error && file.status !== 'success'
      )];

      const activeUploads: Promise<void>[] = [];
      let completed = 0;
      let failed = 0;

      while (queue.length > 0 || activeUploads.length > 0) {
        // Check if cancelled
        if (uploadControllerRef.current.cancel) {
          break;
        }

        // Start new uploads up to CONCURRENT_UPLOADS
        while (activeUploads.length < CONCURRENT_UPLOADS && queue.length > 0) {
          const { file, index } = queue.shift()!;

          const uploadPromise = uploadSingleFile(file, index)
            .then(() => {
              completed++;
            })
            .catch(() => {
              failed++;
            });

          activeUploads.push(uploadPromise);
        }

        // Wait for at least one upload to complete
        if (activeUploads.length > 0) {
          await Promise.race(activeUploads);
          activeUploads.splice(0, 1);
        }
      }

      // Summary
      if (uploadControllerRef.current.cancel) {
        toast.warning('Upload đã bị hủy');
      } else if (failed > 0) {
        toast.warning(`Upload hoàn thành: ${completed} thành công, ${failed} thất bại. Bấm nút Retry để thử lại.`);
      } else {
        toast.success(`Upload thành công ${completed} ảnh!`);
      }

      // Clean up successful files
      setFiles((prev) => prev.filter(f => f.status !== 'success'));

      // Reload album if any success
      if (completed > 0) {
        onUploadComplete();
      }
    } catch (error: any) {
      console.error('Upload failed:', error);
      toast.error('Có lỗi xảy ra khi upload');
    } finally {
      setUploading(false);
      uploadControllerRef.current.cancel = false;
    }
  }

  // Retry single failed file
  async function handleRetryFile(index: number) {
    const fileItem = files[index];
    if (fileItem.status !== 'error') return;

    try {
      await uploadSingleFile(fileItem, index);
      toast.success(`Upload thành công ${fileItem.file.name}!`);

      // Remove from list if success
      setFiles((prev) => prev.filter((_, i) => i !== index));
      onUploadComplete();
    } catch (error) {
      toast.error(`Upload thất bại ${fileItem.file.name}`);
    }
  }

  function handleCancelUpload() {
    uploadControllerRef.current.cancel = true;
    setUploading(false);

    // Reset all uploading files to pending
    setFiles((prev) => prev.map(f => ({
      ...f,
      status: f.status === 'uploading' ? 'pending' : f.status,
      progress: f.status === 'uploading' ? 0 : f.progress,
    })));

    toast.warning('Đã hủy upload');
  }

  const stats = {
    total: files.length,
    pending: files.filter(f => f.status === 'pending').length,
    uploading: files.filter(f => f.status === 'uploading').length,
    success: files.filter(f => f.status === 'success').length,
    error: files.filter(f => f.status === 'error').length,
  };

  return (
    <div>
      {/* Drop Zone */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
          dragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400 bg-white'
        } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
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
        <p className="text-xs text-gray-400 mt-1">
          ✨ Ảnh lớn hơn 10MB sẽ tự động được nén để tối ưu upload
        </p>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_TYPES.join(',')}
          onChange={handleFileInput}
          disabled={uploading}
          className="hidden"
        />
      </div>

      {/* Preview Grid */}
      {files.length > 0 && (
        <div className="mt-6">
          {/* Stats Bar */}
          <div className="flex items-center justify-between mb-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-6 text-sm">
              <span className="text-gray-700">
                <span className="font-semibold">{stats.total}</span> ảnh tổng
              </span>
              {stats.pending > 0 && (
                <span className="text-gray-500">
                  {stats.pending} chờ
                </span>
              )}
              {stats.uploading > 0 && (
                <span className="text-blue-600 flex items-center gap-1">
                  <Loader2 size={14} className="animate-spin" />
                  {stats.uploading} đang upload
                </span>
              )}
              {stats.success > 0 && (
                <span className="text-green-600 flex items-center gap-1">
                  <CheckCircle size={14} />
                  {stats.success} thành công
                </span>
              )}
              {stats.error > 0 && (
                <span className="text-red-600 flex items-center gap-1">
                  <AlertCircle size={14} />
                  {stats.error} thất bại
                </span>
              )}
            </div>

            {!uploading && (
              <button
                onClick={() => {
                  files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
                  setFiles([]);
                }}
                className="text-sm text-red-600 hover:text-red-700 font-medium"
              >
                Xóa tất cả
              </button>
            )}
          </div>

          {/* Files List */}
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {files.map((fileItem, index) => (
              <div
                key={index}
                className={`flex items-center gap-4 p-4 rounded-lg border ${
                  fileItem.status === 'success'
                    ? 'bg-green-50 border-green-200'
                    : fileItem.status === 'error'
                    ? 'bg-red-50 border-red-200'
                    : fileItem.status === 'uploading'
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-white border-gray-200'
                }`}
              >
                {/* Preview or Icon */}
                <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-100">
                  {fileItem.preview ? (
                    <img
                      src={fileItem.preview}
                      alt={fileItem.file.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <FileImage size={32} className="text-gray-400" />
                    </div>
                  )}
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {fileItem.file.name}
                  </p>
                  <p className="text-sm text-gray-500">
                    {formatFileSize(fileItem.file.size)}
                  </p>

                  {/* Status Text - Simple */}
                  {fileItem.status === 'uploading' && (
                    <p className="mt-1 text-sm text-blue-600 font-medium">
                      Đang upload...
                    </p>
                  )}

                  {/* Error Message */}
                  {fileItem.error && (
                    <p className="mt-1 text-sm text-red-600">
                      ❌ {fileItem.error}
                    </p>
                  )}
                </div>

                {/* Status Icon */}
                <div className="flex-shrink-0">
                  {fileItem.status === 'pending' && (
                    <div className="text-gray-400">
                      <Upload size={20} />
                    </div>
                  )}
                  {fileItem.status === 'uploading' && (
                    <div className="text-blue-600">
                      <Loader2 size={20} className="animate-spin" />
                    </div>
                  )}
                  {fileItem.status === 'success' && (
                    <div className="text-green-600">
                      <CheckCircle size={20} />
                    </div>
                  )}
                  {fileItem.status === 'error' && (
                    <div className="text-red-600">
                      <AlertCircle size={20} />
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                {!uploading && (
                  <div className="flex-shrink-0 flex gap-2">
                    {/* Retry button for failed files */}
                    {fileItem.status === 'error' && (
                      <button
                        onClick={() => handleRetryFile(index)}
                        className="px-3 py-1.5 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium"
                        title="Thử lại"
                      >
                        Retry
                      </button>
                    )}

                    {/* Remove button */}
                    {fileItem.status !== 'success' && (
                      <button
                        onClick={() => removeFile(index)}
                        className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                        title="Xóa file"
                      >
                        <X size={20} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Control Buttons */}
          <div className="mt-6 flex gap-3">
            {!uploading ? (
              <>
                <button
                  onClick={handleUpload}
                  disabled={files.every((f) => f.error || f.status === 'success')}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Upload size={20} />
                  Upload {files.filter((f) => !f.error && f.status !== 'success').length} ảnh
                </button>
                <button
                  onClick={() => {
                    files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
                    setFiles([]);
                  }}
                  className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Hủy
                </button>
              </>
            ) : (
              <button
                onClick={handleCancelUpload}
                className="flex-1 px-6 py-3 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium"
              >
                Hủy upload
              </button>
            )}
          </div>

          {/* Upload Tips */}
          {uploading && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
              💡 <strong>Tip:</strong> Upload đang chạy. Bạn có thể đóng tab này và quay lại sau.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
