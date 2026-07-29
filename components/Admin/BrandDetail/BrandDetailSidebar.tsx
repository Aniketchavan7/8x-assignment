'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Building2,
  Settings,
  ArrowLeft,
  Table2,
  LayoutDashboard,
  FileVideo,
  Film,
  BookOpen,
  CalendarDays,
  Workflow,
  Radio,
  DollarSign,
  ListVideo,
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import type { BrandOrganizationWithMembers } from '@/app/api/admin/brands/route';

export type SectionId =
  | 'lifecycle'
  | 'social-listening'
  | 'creator-list'
  | 'dashboard'
  | 'posts-by-date'
  | 'pipeline'
  | 'content'
  | 'creator-brief'
  | 'reference-videos'
  | 'intro-videos'
  | 'payments'
  | 'settings';

const PRIMARY_SECTIONS: { id: SectionId; icon: React.ElementType; label: string }[] = [
  { id: 'lifecycle', icon: Workflow, label: 'Lifecycle' },
  { id: 'social-listening', icon: Radio, label: 'Social Listening' },
  { id: 'creator-list', icon: ListVideo, label: 'Creator Listening' },
  { id: 'creator-brief', icon: BookOpen, label: 'Brief Editor' },
  { id: 'intro-videos', icon: FileVideo, label: 'Application Videos' },
  { id: 'pipeline', icon: Table2, label: 'Pipeline' },
  { id: 'payments', icon: DollarSign, label: 'Payments' },
  { id: 'settings', icon: Settings, label: 'Settings' },
];

const SECONDARY_SECTIONS: { id: SectionId; icon: React.ElementType; label: string }[] = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'posts-by-date', icon: CalendarDays, label: 'Posts by Date' },
  { id: 'content', icon: Film, label: 'Content' },
];

/** URL-friendly view param ↔ SectionId mappings */
export const SECTION_TO_VIEW: Record<SectionId, string> = {
  lifecycle: 'lifecycle',
  'social-listening': 'social_listening',
  'creator-list': 'creator_list',
  dashboard: 'dashboard',
  'posts-by-date': 'posts_by_date',
  pipeline: 'pipeline',
  content: 'content',
  'creator-brief': 'brief_editor',
  'intro-videos': 'videos',
  payments: 'payments',
  settings: 'settings',
  'reference-videos': 'reference_videos',
};

export const VIEW_TO_SECTION: Record<string, SectionId> = Object.fromEntries(
  Object.entries(SECTION_TO_VIEW).map(([k, v]) => [v, k as SectionId])
) as Record<string, SectionId>;


interface BrandDetailSidebarProps {
  brand: BrandOrganizationWithMembers;
  activeSection: SectionId;
  onSectionChange: (section: SectionId) => void;
}

export function BrandDetailSidebar({
  brand,
  activeSection,
  onSectionChange,
}: BrandDetailSidebarProps) {
  const renderNavItem = (section: { id: SectionId; icon: React.ElementType; label: string }) => {
    const Icon = section.icon;
    const isActive = activeSection === section.id;
    return (
      <button
        key={section.id}
        onClick={() => onSectionChange(section.id)}
        className={`
          w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors
          ${
            isActive
              ? 'bg-white/15 text-white font-medium'
              : 'text-white hover:bg-white/10'
          }
        `}
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span className="truncate">{section.label}</span>
      </button>
    );
  };

  return (
    <div className="w-56 border-r flex flex-col flex-shrink-0 bg-blue-600 dark:bg-blue-700">
      {/* Back button */}
      <div className="p-3 border-b border-white/10">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-white hover:bg-white/10"
          asChild
        >
          <Link href="/admin/brands">
            <ArrowLeft className="h-4 w-4" />
            Back to Brands
          </Link>
        </Button>
      </div>

      {/* Brand identity */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarImage src={brand.company_logo || undefined} alt={brand.organization_name} />
            <AvatarFallback className="bg-white/10 text-white">
              <Building2 className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate text-primary-foreground">{brand.organization_name}</p>
            <p className="text-xs text-white/80 font-mono truncate">
              @{brand.organization_slug}
            </p>
          </div>
        </div>

        {/* View as Brand button */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-3 justify-center gap-2 text-white hover:bg-white/10 border border-white/20"
          asChild
        >
          <Link href={`/admin/view-as/brand/${brand.id}/dashboard/analytics`}>
            <LayoutDashboard className="h-3.5 w-3.5" />
            View as Brand
          </Link>
        </Button>
      </div>

      {/* Section navigation */}
      <nav className="flex-1 p-2 overflow-y-auto">
        <div className="space-y-0.5">
          {PRIMARY_SECTIONS.map(renderNavItem)}
        </div>
        <div className="my-3 border-t border-white/10" />
        <div className="space-y-0.5">
          {SECONDARY_SECTIONS.map(renderNavItem)}
        </div>
      </nav>
    </div>
  );
}
