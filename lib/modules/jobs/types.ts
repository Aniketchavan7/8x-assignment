import type { JobStatus, JobVisibility, PaymentFrequency } from '@/lib/db/types';

/**
 * Brand organization data included with job details
 */
export interface JobBrandOrganization {
  id: string;
  organization_name: string;
  organization_slug: string;
  company_logo: string | null;
  description: string | null;
  industry: string | null;
  website: string | null;
}

/**
 * Job details props for the shared JobDetails component
 */
export interface JobDetailsData {
  id: string;
  job_title: string;
  description: string | null;
  status?: JobStatus | null;
  visibility?: JobVisibility | null;
  budget_per_creator: number | null;
  total_budget?: number | null;
  payment_frequency?: PaymentFrequency | null;
  estimated_duration?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  application_deadline?: string | null;
  industry?: string | null;
  platforms_required?: string[];
  preferred_locations?: string[];
  content_guidelines?: string | null;
  usage_rights?: string | null;
  exclusivity_terms?: string | null;
  media?: Array<{ url: string; type: 'image' | 'video' }> | null;
  published_at?: string | null;
  currency?: 'EUR' | 'USD' | 'GBP';
  // CPM-specific fields
  job_type?: string | null;
  cpm_rate?: number | null;
  cpm_cap?: number | null;
  cpm_base_pay?: number | null;
  cpm_platforms_allowed?: string[] | null;
  target_country?: string | null;
}

/**
 * CPM FAQ item translation
 */
export interface CpmFaqItemTranslation {
  question: string;
  answer: string;
}

/**
 * CPM FAQ translations
 */
export interface CpmFaqTranslations {
  title: string;
  scrollButton?: string;
  whatIsCpm: CpmFaqItemTranslation;
  howToGoViral: CpmFaqItemTranslation;
  whatIsWarmup: CpmFaqItemTranslation;
  howToWarmup: CpmFaqItemTranslation;
  minViews: CpmFaqItemTranslation;
  maxEarnings: CpmFaqItemTranslation;
  basePay?: CpmFaqItemTranslation;
  whenGetPaid: CpmFaqItemTranslation;
}

/**
 * Translation keys for job details display
 */
export interface JobDetailsTranslations {
  totalBudget?: string;
  duration?: string;
  startDate?: string;
  endDate?: string;
  applicationDeadline?: string;
  posted?: string;
  applicationsClose?: string;
  pricePerCreator?: string;
  pricing?: string;
  allCountries?: string;
  requirements?: string;
  platformsRequired?: string;
  targetCountries?: string;
  notSpecified?: string;
  about?: string;
  visitWebsite?: string;
  guidelinesAndTerms?: string;
  contentGuidelines?: string;
  usageRights?: string;
  exclusivityTerms?: string;
  country?: string;
  frequentlyAskedQuestions?: string;
  eightXFooterDescription?: string;
  perPost?: string;
  perWeek?: string;
  perMonth?: string;
  perYear?: string;
  howThisWorks?: string;
  cpmFaq?: CpmFaqTranslations;
}

/**
 * Translation keys for application status
 */
export interface ApplicationStatusTranslations {
  submitted?: string;
  applicationAccepted?: string;
  underReview?: string;
  applicationRejected?: string;
  applicationWithdrawn?: string;
  accepted?: string;
  applied?: string;
  rejected?: string;
  withdrawn?: string;
}

/**
 * Translation keys for job view actions
 */
export interface JobViewTranslations {
  backToJobFeed?: string;
  applyNow?: string;
  applying?: string;
  applicationsClosed?: string;
  loading?: string;
  loadingJobDetails?: string;
  failedToLoadJobDetails?: string;
  jobNotFound?: string;
  navigateHome?: string;
  shareJob?: string;
  linkCopied?: string;
}

/**
 * Combined translations for job pages
 */
export interface JobPageTranslations {
  jobFeed?: {
    applicationStatus?: ApplicationStatusTranslations;
  };
  jobView?: JobViewTranslations;
  jobDetails?: JobDetailsTranslations;
  cpm?: {
    workspace?: {
      faq?: CpmFaqTranslations;
    };
  };
}
