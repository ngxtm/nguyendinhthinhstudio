'use client';

export function ImageUploadErrors({ code, onRetry, onRemove }: { code: string; onRetry?: () => void; onRemove?: () => void }) {
  return <div role="alert" className="mt-1 flex items-center gap-2 text-sm text-red-600"><span>Không thể tải ảnh ({code}).</span>{onRetry && <button type="button" onClick={onRetry} className="font-medium underline">Thử lại</button>}{onRemove && <button type="button" onClick={onRemove} className="font-medium underline">Xóa</button>}</div>;
}
