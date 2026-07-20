'use client';

export function ImageUploadProgress({ progress, state }: { progress: number; state: string }) {
  return <div aria-label="upload-progress" className="mt-2"><div className="h-1.5 overflow-hidden rounded bg-gray-200"><div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div><span className="text-xs text-gray-500">{state} · {Math.round(progress)}%</span></div>;
}
