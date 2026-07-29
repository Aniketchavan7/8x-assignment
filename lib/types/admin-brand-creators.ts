export type BrandCreator = {
  id: string;
  application_status: string;
  created_at: string;
  job: {
    id: string;
    job_title: string;
    job_type: string;
  };
  creator_profile: {
    id: string;
    display_name: string | null;
    profile_picture: string | null;
    location: string | null;
    phone: string | null;
    user_id: string | null;
    invite_token: string | null;
    invite_expires_at: string | null;
  } | null;
};

export type BrandJob = {
  id: string;
  job_title: string;
  job_type: string;
  status: string;
  target_country: string | null;
};

export type BrandCreatorsApiResponse = {
  creators: BrandCreator[];
  jobs: BrandJob[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};
