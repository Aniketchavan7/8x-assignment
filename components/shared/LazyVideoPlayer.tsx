'use client';

import { useState, useRef, useEffect } from 'react';
import { Play } from 'lucide-react';

interface LazyVideoPlayerProps {
  src: string;
  className?: string;
}

/**
 * Video player that shows a thumbnail with play button overlay.
 * Only loads the actual video when the user clicks play.
 * Generates a poster from the first frame using IntersectionObserver + canvas.
 */
export function LazyVideoPlayer({ src, className = '' }: LazyVideoPlayerProps) {
  const [activated, setActivated] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Only generate thumbnail when card scrolls into view
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Generate a poster from the first frame once visible
  useEffect(() => {
    if (!isVisible || posterUrl) return;

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = src;

    const handleSeeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          setPosterUrl(canvas.toDataURL('image/jpeg', 0.7));
        }
      } catch {
        // CORS or other issues — fall back to no poster
      }
      video.remove();
    };

    video.addEventListener('seeked', handleSeeked, { once: true });
    video.addEventListener('loadeddata', () => {
      video.currentTime = 0.1;
    }, { once: true });

    return () => {
      video.removeEventListener('seeked', handleSeeked);
      video.src = '';
      video.load();
    };
  }, [isVisible, src, posterUrl]);

  // Auto-play when activated
  useEffect(() => {
    if (activated && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [activated]);

  if (activated) {
    return (
      <video
        ref={videoRef}
        src={src}
        controls
        preload="auto"
        playsInline
        className={`w-full h-full object-contain ${className}`}
      />
    );
  }

  return (
    <div ref={containerRef} className={`w-full h-full relative ${className}`}>
      {posterUrl ? (
        <img src={posterUrl} alt="" className="w-full h-full object-contain" />
      ) : (
        <div className="w-full h-full bg-muted/50" />
      )}
      <button
        type="button"
        onClick={() => setActivated(true)}
        className="absolute inset-0 flex items-center justify-center group cursor-pointer"
      >
        <div className="h-12 w-12 rounded-full bg-black/50 flex items-center justify-center group-hover:bg-black/70 transition-colors backdrop-blur-sm">
          <Play className="h-6 w-6 text-white ml-0.5" />
        </div>
      </button>
    </div>
  );
}
