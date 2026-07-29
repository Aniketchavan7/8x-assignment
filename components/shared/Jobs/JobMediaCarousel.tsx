'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { LazyVideoPlayer } from '@/components/shared/LazyVideoPlayer';

interface MediaItem {
  url: string;
  type: 'image' | 'video';
}

interface JobMediaCarouselProps {
  media: MediaItem[];
  fallbackImage?: string;
  alt?: string;
}

/**
 * Katana-style media carousel with rounded corners and smooth transitions
 */
export function JobMediaCarousel({
  media,
  fallbackImage = '/assets/brand/8x_black_on_white.svg',
  alt = 'Job media',
}: JobMediaCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // If no media, show fallback image
  const items = media.length > 0 ? media : [{ url: fallbackImage, type: 'image' as const }];
  const currentItem = items[currentIndex];

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? items.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === items.length - 1 ? 0 : prev + 1));
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  return (
    <div className="relative w-full aspect-square rounded-3xl overflow-hidden bg-gray-100 shadow-sm">
      {/* Media Display */}
      <div className="relative w-full h-full">
        {currentItem.type === 'image' ? (
          <Image
            src={currentItem.url}
            alt={`${alt} ${currentIndex + 1}`}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
            unoptimized={currentItem.url.includes('127.0.0.1')}
          />
        ) : (
          <LazyVideoPlayer src={currentItem.url} className="object-cover" />
        )}

        {/* Gradient overlay for better button visibility */}
        {items.length > 1 && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/10 pointer-events-none" />
        )}
      </div>

      {/* Navigation Buttons - Katana style with rounded-full */}
      {items.length > 1 && (
        <>
          <button
            onClick={goToPrevious}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white transition-colors duration-150 z-10 shadow-md"
            aria-label="Previous media"
          >
            <ChevronLeft className="h-5 w-5 text-gray-700" />
          </button>
          <button
            onClick={goToNext}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white transition-colors duration-150 z-10 shadow-md"
            aria-label="Next media"
          >
            <ChevronRight className="h-5 w-5 text-gray-700" />
          </button>
        </>
      )}

      {/* Carousel Indicators - Katana style dots */}
      {items.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {items.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`h-2 rounded-full transition-all duration-200 ${
                currentIndex === index ? 'w-6 bg-white' : 'w-2 bg-white/60 hover:bg-white/80'
              }`}
              aria-label={`Go to media ${index + 1}`}
            />
          ))}
        </div>
      )}

      {/* Media Counter - Katana style pill */}
      {items.length > 1 && (
        <div className="absolute top-3 right-3 px-3 py-1.5 bg-black/60 backdrop-blur-sm text-white text-xs font-medium rounded-full z-10">
          {currentIndex + 1} / {items.length}
        </div>
      )}
    </div>
  );
}
