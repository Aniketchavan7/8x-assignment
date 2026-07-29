export type AdminJobListItem = {
  id: string;
  job_title: string;
  job_slug: string;
  job_type: string;
  status: string;
  brand_organization_id: string;
  visibility: 'public' | 'private' | 'invite_only';
  created_at?: string | null;
  target_country: string | null;
  applicant_count: number;
  brand_organization?: {
    id: string;
    organization_name: string;
    organization_slug: string;
    eight_x_managed?: boolean;
  } | null;
};

export type AdminJobsApiResponse = {
  data: AdminJobListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};
