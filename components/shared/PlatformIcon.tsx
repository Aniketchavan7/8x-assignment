'use client';

type PlatformIconProps = {
  platform: string;
  url: string;
  className?: string;
  type?: 'account' | 'post';
};

export function PlatformIcon({
  platform,
  url,
  className = '',
  type = 'account',
}: PlatformIconProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const getIconSrc = () => {
    const platformName = platform.toLowerCase();

    switch (platformName) {
      case 'tiktok':
        return '/assets/socials/Platform=TikTok, Color=Original.svg';
      case 'instagram':
        return '/assets/socials/Platform=Instagram, Color=Original.svg';
      case 'facebook':
        return '/assets/socials/Platform=Facebook, Color=Original.svg';
      case 'youtube':
        return '/assets/socials/Platform=YouTube, Color=Original.svg';
      case 'x':
      case 'twitter':
        return '/assets/socials/Platform=X (Twitter), Color=Original.svg';
      default:
        return null;
    }
  };

  const iconSrc = getIconSrc();

  if (!iconSrc) {
    return null;
  }

  const tooltipText =
    type === 'post' ? 'Open the post in a new tab' : 'Open the account in a new tab';

  return (
    <div
      className={`flex items-center justify-center ${className} cursor-pointer hover:opacity-70 transition-opacity`}
      onClick={handleClick}
      title={tooltipText}
    >
      <img src={iconSrc} alt={platform} className="h-5 w-5" />
    </div>
  );
}
