import type { JobApplication, ApplicationStatus } from '@/lib/db/types';

// Extended JobApplication type with related data
export type JobApplicationListItem = Omit<JobApplication, 'application_status'> & {
  application_status: ApplicationStatus;
  language?: string | null; // Backward compatibility with production DB
  media?: Array<{ url: string; type: string; filename?: string }> | null;
  job: {
    id: string;
    job_title: string;
    job_slug: string;
    job_type: string;
    brand_organization_id: string;
    target_country: string | null;
  } | null;
  creator_profile: {
    id: string;
    display_name: string;
    profile_picture: string | null;
    user_id: string;
    location: string | null;
    bio: string | null;
    intro_video_url: string | null;
    average_rating: number | null;
    total_jobs_completed: number | null;
    account_status: string | null;
    onboarding_status: string | null;
    phone: string | null;
    users?: {
      id: string;
      email: string;
      country: string | null;
    } | null;
  } | null;
  brand_organization: {
    id: string;
    organization_name: string;
    organization_slug: string;
  } | null;
  // Social account handles for export
  tiktok_username?: string | null;
  instagram_username?: string | null;
};

export type ApplicationsApiResponse = {
  data: JobApplicationListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};
