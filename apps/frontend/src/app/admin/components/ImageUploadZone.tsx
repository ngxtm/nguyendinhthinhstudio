/**
 * Image Upload Zone Component
 * Optimized upload với queue, retry, pause/resume
 */

'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, X, FileImage, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { UploadApiError, uploadImage } from '@/lib/api/images'
import {
  ACCEPTED_SOURCE_MIME_TYPES,
  MAX_BATCH_FILES,
  MAX_SOURCE_BYTES,
  UPLOAD_CONCURRENCY
} from '@/lib/image-upload/upload-constants'
import { runUploadQueue } from '@/lib/image-upload/upload-queue'
import { ImageUploadProgress } from './ImageUploadProgress'
import { IMAGE_NORMALIZATION_MESSAGE, ImageUploadErrors } from './ImageUploadErrors'

interface Props {
  albumId: string
  disabled?: boolean
  onUploadingChange?: (uploading: boolean) => void
  onUploadComplete: () => void | Promise<void>
}

type UploadStatus = 'pending' | 'uploading' | 'success' | 'error' | 'paused'

interface FileWithProgress {
  file: File
  preview: string | null
  progress: number
  status: UploadStatus
  error?: string
  retryAfter?: string
  retryCount: number
  statusText?: string // "Đang lấy URL...", "Đang upload...", "Đang lưu vào DB..."
}

export default function ImageUploadZone({ albumId, disabled = false, onUploadingChange, onUploadComplete }: Props) {
  const [files, setFiles] = useState<FileWithProgress[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadControllerRef = useRef<{ cancel: boolean }>({ cancel: false })

  useEffect(() => {
    onUploadingChange?.(uploading)
  }, [onUploadingChange, uploading])

  useEffect(
    () => () => {
      onUploadingChange?.(false)
    },
    [onUploadingChange]
  )

  function validateFile(file: File): string | null {
    if (!ACCEPTED_SOURCE_MIME_TYPES.includes(file.type as never)) {
      return 'Chỉ hỗ trợ ảnh định dạng JPG, PNG hoặc WebP'
    }
    if (file.size > MAX_SOURCE_BYTES) {
      return 'Ảnh quá lớn (tối đa 100 MB)'
    }
    return null
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  async function handleFiles(newFiles: FileList | null) {
    if (disabled || !newFiles || newFiles.length === 0) return

    if (files.length + newFiles.length > MAX_BATCH_FILES) {
      toast.error(`Chỉ có thể tải lên tối đa ${MAX_BATCH_FILES} ảnh/lần`)
      return
    }

    const validFiles: FileWithProgress[] = []
    const filesToProcess = Array.from(newFiles)

    // Stage 07 owns optimization and previews; this legacy surface must never
    // perform iterative compression or retain an original-file preview.
    for (const file of filesToProcess) {
      const error = validateFile(file)

      if (error) {
        validFiles.push({
          file,
          preview: null,
          progress: 0,
          status: 'error',
          error: error,
          retryCount: 0
        })
        continue
      }

      validFiles.push({
        file,
        preview: null,
        progress: 0,
        status: 'pending',
        error: undefined,
        retryCount: 0
      })
    }

    setFiles(prev => [...prev, ...validFiles])

    if (validFiles.length > 0) {
      toast.success(`Đã chọn ${validFiles.length} ảnh. Bấm nút Tải ảnh lên bên dưới để bắt đầu.`)
    }
  }

  function handleDrag(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (disabled) {
      setDragActive(false)
      return
    }

    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (disabled) return

    handleFiles(e.dataTransfer.files)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    handleFiles(e.target.files)
  }

  function removeFile(index: number) {
    setFiles(prev => {
      const newFiles = [...prev]
      if (newFiles[index].preview) {
        URL.revokeObjectURL(newFiles[index].preview!)
      }
      newFiles.splice(index, 1)
      return newFiles
    })
  }

  const uploadSingleFile = useCallback(
    async (fileItem: FileWithProgress, index: number): Promise<void> => {
      // Check if cancelled
      if (uploadControllerRef.current.cancel) {
        throw new Error('Upload cancelled')
      }

      // Update status to uploading
      setFiles(prev => {
        const newFiles = [...prev]
        newFiles[index].status = 'uploading'
        newFiles[index].progress = 0
        newFiles[index].error = undefined
        newFiles[index].retryAfter = undefined
        newFiles[index].statusText = IMAGE_NORMALIZATION_MESSAGE
        return newFiles
      })

      try {
        await uploadImage(albumId, fileItem.file, progress => {
          setFiles(prev => {
            const newFiles = [...prev]
            newFiles[index].progress = progress
            newFiles[index].statusText =
              progress < 10 ? IMAGE_NORMALIZATION_MESSAGE : progress < 90 ? 'Đang tải ảnh lên' : 'Đang hoàn tất'
            return newFiles
          })
        })

        // Success
        setFiles(prev => {
          const newFiles = [...prev]
          newFiles[index].status = 'success'
          newFiles[index].progress = 100
          return newFiles
        })
      } catch (error: unknown) {
        // Set error state - NO AUTO RETRY
        const uploadError = error instanceof UploadApiError ? error : undefined
        setFiles(prev => {
          const newFiles = [...prev]
          newFiles[index].status = 'error'
          newFiles[index].error = uploadError?.code ?? 'upload_failed'
          newFiles[index].retryAfter = uploadError?.retryAfter
          return newFiles
        })
        throw error
      }
    },
    [albumId]
  )

  async function handleUpload() {
    const validFiles = files.filter(f => !f.error && f.status !== 'success')

    if (validFiles.length === 0) {
      toast.error('Không có ảnh hợp lệ để tải ảnh lên')
      return
    }

    try {
      setUploading(true)
      uploadControllerRef.current.cancel = false

      toast.info(`Bắt đầu tải ảnh lên ${validFiles.length} ảnh...`)

      // Upload với concurrency (2 ảnh cùng lúc)
      const queue = [
        ...files.map((f, i) => ({ file: f, index: i })).filter(({ file }) => !file.error && file.status !== 'success')
      ]

      const { completed, failed } = await runUploadQueue(queue, UPLOAD_CONCURRENCY, async ({ file, index }) => {
        if (uploadControllerRef.current.cancel) {
          throw new Error('Upload cancelled')
        }
        await uploadSingleFile(file, index)
      })

      // Summary
      if (uploadControllerRef.current.cancel) {
        toast.warning('Tải ảnh lên đã bị hủy')
      } else if (failed > 0) {
        toast.warning(
          `Tải ảnh lên hoàn thành: ${completed} thành công, ${failed} thất bại. Bấm nút Thử lại để thử lại.`
        )
      } else {
        toast.success(`Tải ảnh lên thành công ${completed} ảnh!`)
      }

      // Clean up successful files
      setFiles(prev => prev.filter(f => f.status !== 'success'))

      // Reload album if any success
      if (completed > 0) {
        await onUploadComplete()
      }
    } catch (error: any) {
      console.error('Upload failed:', error)
      toast.error('Có lỗi xảy ra khi tải ảnh lên')
    } finally {
      setUploading(false)
      uploadControllerRef.current.cancel = false
    }
  }

  // Retry single failed file
  async function handleRetryFile(index: number) {
    const fileItem = files[index]
    if (fileItem.status !== 'error') return

    try {
      await uploadSingleFile(fileItem, index)
      toast.success(`Tải ảnh lên thành công ${fileItem.file.name}!`)

      // Remove from list if success
      setFiles(prev => prev.filter((_, i) => i !== index))
      await onUploadComplete()
    } catch (error) {
      toast.error(`Tải ảnh lên thất bại ${fileItem.file.name}`)
    }
  }

  function handleCancelUpload() {
    uploadControllerRef.current.cancel = true
    setUploading(false)

    // Reset all uploading files to pending
    setFiles(prev =>
      prev.map(f => ({
        ...f,
        status: f.status === 'uploading' ? 'pending' : f.status,
        progress: f.status === 'uploading' ? 0 : f.progress
      }))
    )

    toast.warning('Đã hủy tải ảnh lên')
  }

  const stats = {
    total: files.length,
    pending: files.filter(f => f.status === 'pending').length,
    uploading: files.filter(f => f.status === 'uploading').length,
    success: files.filter(f => f.status === 'success').length,
    error: files.filter(f => f.status === 'error').length
  }

  return (
    <fieldset disabled={disabled} className="min-w-0 disabled:cursor-not-allowed disabled:opacity-60">
      {disabled && (
        <p className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Hoàn tất hoặc hủy chế độ chọn ảnh để tiếp tục tải ảnh lên.
        </p>
      )}
      {/* Drop Zone */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => !disabled && !uploading && fileInputRef.current?.click()}
        className={`relative cursor-pointer rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
          dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white hover:border-gray-400'
        } ${uploading || disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      >
        <Upload size={48} className={`mx-auto mb-4 ${dragActive ? 'text-blue-500' : 'text-gray-400'}`} />
        <p className="mb-2 text-lg font-medium text-gray-700">
          {dragActive ? 'Thả ảnh vào đây' : 'Kéo thả hoặc nhấp để chọn ảnh'}
        </p>
        <p className="text-sm text-gray-500">
          Hỗ trợ: JPG, PNG, WebP - Tối đa {MAX_SOURCE_BYTES / (1024 * 1024)} MB/ảnh
        </p>
        <p className="mt-1 text-xs text-gray-400">Mỗi ảnh sẽ được nén một lần sang WebP trước khi tải ảnh lên</p>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_SOURCE_MIME_TYPES.join(',')}
          onChange={handleFileInput}
          disabled={uploading || disabled}
          className="hidden"
        />
      </div>

      {/* Preview Grid */}
      {files.length > 0 && (
        <div className="mt-6">
          {/* Stats Bar */}
          <div className="mb-4 flex items-center justify-between rounded-lg bg-gray-50 p-4">
            <div className="flex items-center gap-6 text-sm">
              <span className="text-gray-700">
                <span className="font-semibold">{stats.total}</span> ảnh tổng
              </span>
              {stats.pending > 0 && <span className="text-gray-500">{stats.pending} sẵn sàng</span>}
              {stats.uploading > 0 && (
                <span className="flex items-center gap-1 text-blue-600">
                  <Loader2 size={14} className="animate-spin" />
                  {stats.uploading} đang tải ảnh lên
                </span>
              )}
              {stats.success > 0 && (
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle size={14} />
                  {stats.success} thành công
                </span>
              )}
              {stats.error > 0 && (
                <span className="flex items-center gap-1 text-red-600">
                  <AlertCircle size={14} />
                  {stats.error} thất bại
                </span>
              )}
            </div>

            {!uploading && (
              <button
                onClick={() => {
                  files.forEach(f => f.preview && URL.revokeObjectURL(f.preview))
                  setFiles([])
                }}
                className="text-sm font-medium text-red-600 hover:text-red-700"
              >
                Xóa tất cả
              </button>
            )}
          </div>

          {/* Files List */}
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {files.map((fileItem, index) => (
              <div
                key={index}
                className={`flex items-center gap-4 rounded-lg border p-4 ${
                  fileItem.status === 'success'
                    ? 'border-green-200 bg-green-50'
                    : fileItem.status === 'error'
                      ? 'border-red-200 bg-red-50'
                      : fileItem.status === 'uploading'
                        ? 'border-blue-200 bg-blue-50'
                        : 'border-gray-200 bg-white'
                }`}
              >
                {/* Preview or Icon */}
                <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                  {fileItem.preview ? (
                    <img src={fileItem.preview} alt={fileItem.file.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <FileImage size={32} className="text-gray-400" />
                    </div>
                  )}
                </div>

                {/* File Info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-900">{fileItem.file.name}</p>
                  <p className="text-sm text-gray-500">{formatFileSize(fileItem.file.size)}</p>

                  {/* Status Text - Simple */}
                  {fileItem.status === 'uploading' && (
                    <p className="mt-1 text-sm font-medium text-blue-600">Đang xử lý...</p>
                  )}
                  {(fileItem.status === 'pending' || fileItem.status === 'uploading') && (
                    <ImageUploadProgress
                      progress={fileItem.progress}
                      state={fileItem.statusText ?? (fileItem.status === 'uploading' ? 'Đang tải ảnh lên' : 'Sẵn sàng')}
                    />
                  )}

                  {/* Error Message */}
                  {fileItem.error && (
                    <ImageUploadErrors
                      code={fileItem.error}
                      retryAfter={fileItem.retryAfter}
                      onRetry={() => handleRetryFile(index)}
                      onRemove={() => removeFile(index)}
                    />
                  )}
                </div>

                {/* Status Icon */}
                <div className="flex-shrink-0">
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
                  <div className="flex flex-shrink-0 gap-2">
                    {/* Retry button for failed files */}
                    {fileItem.status === 'error' && (
                      <button
                        onClick={() => handleRetryFile(index)}
                        className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-orange-700"
                        title="Thử lại"
                      >
                        Thử lại
                      </button>
                    )}

                    {/* Remove button */}
                    {fileItem.status !== 'success' && (
                      <button
                        onClick={() => removeFile(index)}
                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        title="Xóa ảnh"
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
                  disabled={files.every(f => f.error || f.status === 'success')}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Upload size={20} />
                  Tải ảnh lên {files.filter(f => !f.error && f.status !== 'success').length} ảnh
                </button>
                <button
                  onClick={() => {
                    files.forEach(f => f.preview && URL.revokeObjectURL(f.preview))
                    setFiles([])
                  }}
                  className="rounded-lg border border-gray-300 px-6 py-3 font-medium transition-colors hover:bg-gray-50"
                >
                  Hủy
                </button>
              </>
            ) : (
              <button
                onClick={handleCancelUpload}
                className="flex-1 rounded-lg border border-red-300 px-6 py-3 font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                Hủy tải ảnh lên
              </button>
            )}
          </div>

          {/* Upload Tips */}
          {uploading && (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
              💡 <strong>Mẹo:</strong> Tải ảnh lên đang chạy. Bạn có thể đóng tab này và quay lại sau.
            </div>
          )}
        </div>
      )}
    </fieldset>
  )
}
