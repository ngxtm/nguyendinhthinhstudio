'use client';

import { Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import ResponsiveActionMenu, { type ActionMenuPresentation } from './ResponsiveActionMenu';

interface ImageActionMenuProps {
  filename: string;
  isCover: boolean;
  onSetCover: () => Promise<boolean>;
  onDeleteRequest: () => void;
}

export default function ImageActionMenu({
  filename,
  isCover,
  onSetCover,
  onDeleteRequest,
}: ImageActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);

  const handleSetCover = async () => {
    if (isActionPending || isCover) return;

    setIsActionPending(true);
    try {
      const success = await onSetCover();
      if (success) setOpen(false);
    } finally {
      setIsActionPending(false);
    }
  };

  const handleDeleteRequest = () => {
    if (isActionPending) return;
    setOpen(false);
    onDeleteRequest();
  };

  const renderActions = (presentation: ActionMenuPresentation) => {
    const menuItemRole = presentation === 'desktop-popover' ? 'menuitem' : undefined;

    return (
      <>
        <button
          type="button"
          role={menuItemRole}
          disabled={isActionPending || isCover}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void handleSetCover();
          }}
          className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm text-gray-700 hover:bg-gray-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:text-gray-400 md:min-h-10 md:gap-2 md:px-3"
        >
          <Star
            size={18}
            aria-hidden="true"
            className={isCover ? 'fill-yellow-500 text-yellow-500' : undefined}
          />
          {isCover ? 'Đang là ảnh bìa' : 'Đặt làm ảnh bìa'}
        </button>
        <button
          type="button"
          role={menuItemRole}
          disabled={isActionPending}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            handleDeleteRequest();
          }}
          className="flex min-h-12 w-full items-center gap-3 border-t border-gray-100 px-4 text-left text-sm text-red-600 hover:bg-red-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-60 md:min-h-10 md:gap-2 md:px-3"
        >
          <Trash2 size={18} aria-hidden="true" />
          Xóa ảnh
        </button>
      </>
    );
  };

  return (
    <ResponsiveActionMenu
      open={open}
      onOpenChange={setOpen}
      triggerLabel={`Thao tác với ảnh ${filename}`}
      title={`Thao tác với ảnh ${filename}`}
    >
      {renderActions}
    </ResponsiveActionMenu>
  );
}
