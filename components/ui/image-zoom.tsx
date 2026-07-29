'use client';

import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface ImageZoomProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  children?: React.ReactNode;
}

export function ImageZoom({ src, alt, className, children }: ImageZoomProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!src) {
    return <>{children}</>;
  }

  return (
    <>
      <div className={cn('cursor-zoom-in', className)} onClick={() => setIsOpen(true)}>
        {children}
      </div>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0" showCloseButton={true}>
          <div className="relative w-full h-full flex items-center justify-center p-4">
            <img
              src={src}
              alt={alt}
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
