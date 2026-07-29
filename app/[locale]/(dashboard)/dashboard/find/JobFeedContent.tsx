'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { JobApplyModal } from './JobApplyModal';
import { useJobs } from '@/lib/modules/jobs/hooks';
import { useApplications } from '@/lib/modules/applications/hooks';
import { Globe, Search, ChevronDown, Check, MapPin, ArrowUpRight } from 'lucide-react';
import { COUNTRIES } from '@/lib/constants/countries';
import { useComponentTranslations } from '@/lib/i18n/useComponentTranslations';
import { useRouter, Link } from '@/i18n/routing';
import { JobCard } from '@/components/shared/Jobs/JobCard';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileHeaderSlot } from '@/lib/contexts/MobileHeaderContext';
import { useManagedCreatorStatus } from '@/lib/modules/managed-creators/hooks';
import type { JobWithDetails } from '@/app/api/jobs/route';
import type { CampaignCardData } from './CampaignBanner';

// Use JobWithDetails from API route
type Job = JobWithDetails;

interface JobFeedContentProps {
  userLanguages: string[];
  userCountry: string | null;
  campaigns?: CampaignCardData[];
}

interface JobFeedTranslations {
  jobFeed: {
    title: string;
    subtitle: string;
    filterJobs: string;
    filterByCountries: string;
    selectCountries: string;
    searchCountries: string;
    clearFilters: string;
    loadingJobs: string;
    errorLoadingJobs: string;
    noJobsMatch: string;
    noJobsAvailable: string;
    platforms: string;
    viewDetails: string;
    applyNow: string;
    seeMore: string;
    moreJobsComingSoon: {
      title: string;
      description: string;
      gotIt: string;
    };
    applicationStatus: {
      submitted: string;
      applicationAccepted: string;
      underReview: string;
      applicationRejected: string;
      applicationWithdrawn: string;
      accepted: string;
      applied: string;
      rejected: string;
      withdrawn: string;
      uploadVideo: string;
    };
    paymentFrequency: {
      perPost: string;
      weekly: string;
      monthly: string;
      yearly: string;
      notAvailable: string;
    };
    nextPage?: string;
  };
}

interface JobCardData {
  job: Job;
  // Pre-computed application data to avoid IIFEs in render
  appData: {
    status: string | undefined;
    id: string | undefined;
    hasVideo: boolean;
    hasApplied: boolean;
    onboardingCallUrl: string | null;
  };
}

const LOCALSTORAGE_KEY = '8x-selected-country';
const EMPTY_CAMPAIGNS: CampaignCardData[] = [];

export function JobFeedContent({ userLanguages, userCountry, campaigns = EMPTY_CAMPAIGNS }: JobFeedContentProps) {
  const t = useComponentTranslations<JobFeedTranslations>('Dashboard');
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const { data: managedStatus } = useManagedCreatorStatus();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [moreJobsModalOpen, setMoreJobsModalOpen] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const countryPickerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Country priority: ?country= query param > localStorage > userCountry
  const countryParam = searchParams.get('country');
  const initialCountry = countryParam
    ? COUNTRIES.find(c => c.toLowerCase() === countryParam.toLowerCase()) ?? countryParam
    : userCountry;

  const [selectedCountry, setSelectedCountry] = useState<string | null>(initialCountry);

  // Pagination state
  const [page, setPage] = useState(1);
  const limit = 12;

  // Filter countries based on search
  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return COUNTRIES;
    const query = countrySearch.toLowerCase();
    return COUNTRIES.filter((country) => country.toLowerCase().includes(query));
  }, [countrySearch]);

  // Sync from localStorage on mount (avoids hydration mismatch)
  // Skip if ?country= query param is present — it takes priority
  useEffect(() => {
    if (countryParam) return;
    const saved = localStorage.getItem(LOCALSTORAGE_KEY);
    if (saved && COUNTRIES.includes(saved as (typeof COUNTRIES)[number])) {
      setSelectedCountry(saved);
    }
  }, [countryParam]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showCountryPicker) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Check if click is inside any element with the country picker data attribute
      if (target.closest('[data-country-picker]')) return;
      setShowCountryPicker(false);
      setCountrySearch('');
    };

    document.addEventListener('mousedown', handleClickOutside);
    // Focus search input when dropdown opens
    const focusTimeout = setTimeout(() => searchInputRef.current?.focus(), 50);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      clearTimeout(focusTimeout);
    };
  }, [showCountryPicker]);

  // Handle country selection (single-select: replaces current selection)
  const handleCountrySelect = useCallback((country: string) => {
    setSelectedCountry(country);
    setShowCountryPicker(false);
    setCountrySearch('');
    setPage(1);
    // Persist to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCALSTORAGE_KEY, country);
    }
    // Update URL query param without navigation
    const params = new URLSearchParams(searchParams.toString());
    params.set('country', country);
    window.history.replaceState(null, '', `?${params.toString()}`);
  }, [searchParams]);

  const jobsResponse = useJobs({
    countries: selectedCountry ? [selectedCountry] : undefined,
    page,
    limit,
  });

  // Handle both paginated and non-paginated responses
  const isPaginated =
    jobsResponse.data !== null &&
    typeof jobsResponse.data === 'object' &&
    'data' in jobsResponse.data &&
    'total' in jobsResponse.data;

  const jobs = isPaginated
    ? (jobsResponse.data as { data: JobWithDetails[] }).data
    : Array.isArray(jobsResponse.data)
      ? jobsResponse.data
      : [];

  const paginationData = isPaginated
    ? (jobsResponse.data as { total: number; page: number; limit: number; totalPages: number })
    : null;

  const isLoading = jobsResponse.isLoading;
  const error = jobsResponse.error;

  const { data: applications = [] } = useApplications();

  // Create a map of job_id -> application data for O(1) lookup - memoized
  const applicationsMap = useMemo(
    () =>
      new Map(
        applications.map((app) => [
          app.job_id,
          { status: app.application_status, id: app.id, media: app.media || null, onboarding_call_url: app.onboarding_call_url || null },
        ])
      ),
    [applications]
  );

  // Transform jobs into cards with pre-computed application data (rerender-memo optimization)
  // This avoids IIFEs in render by computing application state once per card
  // Exclude jobs that appear as campaign cards (they have portal_config)
  const campaignSlugs = useMemo(
    () => new Set(campaigns.map(c => c.brandSlug)),
    [campaigns]
  );

  const jobCards: JobCardData[] = useMemo(
    () =>
      jobs.filter((job) => !job.portal_config).map((job) => {
        // Pre-compute application data to avoid repeated lookups in render
        const appDataRaw = applicationsMap.get(job.id);
        const hasVideo = appDataRaw?.media
          ? Array.isArray(appDataRaw.media) && appDataRaw.media.length > 0
          : false;

        return {
          job,
          appData: {
            status: appDataRaw?.status,
            id: appDataRaw?.id,
            hasVideo,
            hasApplied: applicationsMap.has(job.id),
            onboardingCallUrl: appDataRaw?.onboarding_call_url ?? null,
          },
        };
      }),
    [jobs, applicationsMap]
  );

  // Filter campaigns by selected country (empty countries = show everywhere)
  const filteredCampaigns = useMemo(
    () => selectedCountry
      ? campaigns.filter(c => c.countries.length === 0 || c.countries.includes(selectedCountry))
      : campaigns,
    [campaigns, selectedCountry]
  );

  // Helper for handleView (kept for non-render usage)
  const getApplicationData = (jobId: string) => {
    return applicationsMap.get(jobId);
  };

  const getStatusText = (status: string | undefined, hasVideo: boolean = false, isCpmJob: boolean = false) => {
    if (!status || !t?.jobFeed?.applicationStatus) return '';

    // CPM jobs don't need application videos - show "Hired" when accepted
    if (isCpmJob) {
      const statusMap = t.jobFeed.applicationStatus;
      switch (status) {
        case 'accepted':
          return statusMap.accepted || 'Hired';
        case 'pending':
          return statusMap.applied || 'Applied';
        case 'under_review':
          return statusMap.underReview || 'Under Review';
        case 'rejected':
          return statusMap.rejected || 'Rejected';
        case 'withdrawn':
          return statusMap.withdrawn || 'Withdrawn';
        default:
          return '';
      }
    }

    // If status is pending and no video, show "Upload Video" (for non-CPM jobs)
    if (status === 'pending' && !hasVideo) {
      return t.jobFeed.applicationStatus.uploadVideo || 'Upload Video';
    }

    const statusMap = t.jobFeed.applicationStatus;
    switch (status) {
      case 'accepted':
        return statusMap.accepted;
      case 'pending':
        return statusMap.applied;
      case 'under_review':
        return statusMap.underReview;
      case 'rejected':
        return statusMap.rejected;
      case 'withdrawn':
        return statusMap.withdrawn;
      default:
        return '';
    }
  };

  const handleView = (job: Job) => {
    // Check if user is accepted for this job - redirect to workspace instead
    const appData = getApplicationData(job.id);
    if (appData?.status === 'accepted') {
      // Redirect to the workspace for accepted users
      router.push(`/dashboard/jobs/${job.job_slug}`);
    } else {
      // Redirect to dashboard job page
      router.push(`/dashboard/job/${job.job_slug}`);
    }
  };

  const handleApply = (job: Job) => {
    setSelectedJob(job);
    setApplyModalOpen(true);
  };

  // Pagination handlers
  const handleNextPage = () => {
    if (paginationData && page < paginationData.totalPages) {
      setPage(page + 1);
    } else {
      // Cycle back to first page
      setPage(1);
    }
    // Scroll to top of job cards
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Country picker dropdown JSX (reused in mobile and desktop)
  // Note: This is a JSX element, not a component, to avoid remounting on state changes
  const countryPickerDropdown = (
    <div className="relative" ref={countryPickerRef} data-country-picker>
      <button
        onClick={() => setShowCountryPicker(!showCountryPicker)}
        className={`
          flex items-center gap-2 px-3 py-1.5
          bg-white rounded-full shadow-sm border-0
          transition-all duration-200 ease-out
          hover:shadow-md text-sm
          ${showCountryPicker ? 'shadow-md ring-2 ring-blue-100' : ''}
        `}
      >
        <MapPin className="w-4 h-4 text-blue-600" />
        <span className="font-medium text-gray-900 max-w-[120px] truncate">
          {selectedCountry || 'Select country'}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showCountryPicker ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown - positioned to stay within viewport on mobile */}
      {showCountryPicker && (
        <div data-country-picker className="fixed md:absolute left-4 md:left-0 right-4 md:right-auto top-14 md:top-auto z-[60] md:w-72 md:mt-2 bg-white rounded-2xl shadow-xl border-0 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Search */}
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                placeholder="Search countries..."
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all duration-150"
              />
            </div>
          </div>

          {/* Country List */}
          <div className="max-h-72 overflow-y-auto py-2">
            {filteredCountries.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500 text-sm">
                No countries found
              </div>
            ) : (
              filteredCountries.map((country) => (
                <button
                  key={country}
                  onClick={() => handleCountrySelect(country)}
                  className={`
                    w-full flex items-center gap-3 px-4 py-2.5 text-left
                    transition-colors duration-100
                    ${selectedCountry === country
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50'
                    }
                  `}
                >
                  <span className="flex-1 text-sm font-medium">{country}</span>
                  {selectedCountry === country && (
                    <Check className="w-4 h-4 text-blue-600" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Mobile header content — portaled into layout's mobile header bar */}
      <MobileHeaderSlot>
        {countryPickerDropdown}
      </MobileHeaderSlot>

      {/* Desktop Filter Bar */}
      <div className="hidden md:flex items-center gap-3 px-4 py-3 border-b bg-background sticky top-0 z-30">
        {!isMobile && countryPickerDropdown}
      </div>

      {/* Content Area - with top padding for mobile header */}
      <div className="flex-1 overflow-auto pt-14 md:pt-4 px-4 pb-4">
          {/* No Country Selected State - Katana Style */}
          {!selectedCountry && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <MapPin className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-gray-500 mb-4">
                Select a country to see available jobs
              </p>
              <button
                onClick={() => setShowCountryPicker(true)}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-full transition-all duration-200 ease-out hover:bg-blue-700 shadow-sm hover:shadow-md"
              >
                <MapPin className="w-4 h-4" />
                Choose Country
              </button>
            </div>
          )}

          {/* Loading State */}
          {selectedCountry && isLoading && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-10 h-10 rounded-full border-2 border-blue-600/20 border-t-blue-600 animate-spin mb-4" />
              <p className="text-gray-500">
                {t?.jobFeed?.loadingJobs || 'Loading jobs...'}
              </p>
            </div>
          )}

          {/* Error State */}
          {selectedCountry && error && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
                <Globe className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">
                Something went wrong
              </h3>
              <p className="text-red-600">
                {t?.jobFeed?.errorLoadingJobs || 'Error loading jobs. Please try again later.'}
              </p>
            </div>
          )}

          {/* No Jobs State */}
          {selectedCountry && !isLoading && !error && jobCards.length === 0 && filteredCampaigns.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <Globe className="w-6 h-6 text-gray-400" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">
                No jobs in {selectedCountry}
              </h3>
              <p className="text-gray-500 text-sm">
                Try selecting a different country
              </p>
            </div>
          )}

          {/* Job Cards - only when country is selected */}
          {selectedCountry && !isLoading && !error && (jobCards.length > 0 || filteredCampaigns.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Featured Campaign Cards */}
            {filteredCampaigns.map((campaign) => {
              // Use country-specific compensation when a country is selected
              const comp = (selectedCountry && campaign.compensationByCountry[selectedCountry]) || campaign.compensation;
              return (
              <Link
                key={campaign.brandSlug}
                href={`/dashboard/jobs/${campaign.brandSlug}?country=${encodeURIComponent(selectedCountry)}`}
                className="group bg-gradient-to-br from-violet-50 to-white rounded-3xl border border-violet-100 shadow-sm transition-all duration-200 ease-out hover:shadow-md flex flex-col h-full overflow-hidden"
              >
                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="px-3 py-1 bg-violet-100 text-violet-700 text-xs font-medium rounded-full">
                      Featured
                    </span>
                  </div>

                  <h2 className="font-semibold text-xl text-gray-900 mb-3 line-clamp-2 leading-tight">
                    {campaign.brandName}
                  </h2>

                  {campaign.aboutText && (
                    <p className="text-gray-600 text-sm mb-4 leading-relaxed line-clamp-3 flex-grow">
                      {campaign.aboutText}
                    </p>
                  )}

                  {comp && (
                    <div className="mb-4">
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-3xl text-violet-600">
                          {comp.currency.toUpperCase()} {comp.baseFee}
                          {comp.maxBaseFee && comp.maxBaseFee !== comp.baseFee
                            ? `–${comp.maxBaseFee}`
                            : ''}
                        </span>
                        <span className="text-sm text-gray-500">per video</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-5 border-t border-violet-100">
                  <span className="w-full bg-violet-600 group-hover:bg-violet-700 text-white font-semibold rounded-xl px-5 py-3 text-sm flex items-center justify-center gap-2 transition-colors duration-150">
                    {managedStatus?.brands?.some((b) => b.slug === campaign.brandSlug) ||
                     managedStatus?.campaigns?.some((c) => c.brandSlug === campaign.brandSlug)
                      ? 'Continue Application'
                      : 'Learn More'}
                    <ArrowUpRight className="w-4 h-4" />
                  </span>
                </div>
              </Link>
              );
            })}

            {jobCards.map((jobCard, cardIndex) => (
              <JobCard
                key={`${jobCard.job.id}-${cardIndex}`}
                job={{
                  id: jobCard.job.id,
                  job_slug: jobCard.job.job_slug,
                  job_title: jobCard.job.job_title,
                  description: jobCard.job.description,
                  industry: jobCard.job.industry,
                  budget_per_creator: jobCard.job.budget_per_creator,
                  payment_frequency: jobCard.job.payment_frequency,
                  status: jobCard.job.status ?? undefined,
                  platforms_required: jobCard.job.platforms_required,
                  target_country: jobCard.job.target_country,
                  cpm_platforms_allowed: jobCard.job.cpm_platforms_allowed,
                  currency: jobCard.job.currency,
                  job_type: jobCard.job.job_type,
                  cpm_rate: jobCard.job.cpm_rate,
                  cpm_cap: jobCard.job.cpm_cap,
                  cpm_base_pay: jobCard.job.cpm_base_pay,
                  portal_config_version: (jobCard.job.portal_config as { version?: number } | null)?.version ?? null,
                }}
                applicationStatus={getStatusText(
                  jobCard.appData.status,
                  jobCard.appData.hasVideo,
                  jobCard.job.job_type === 'cpm'
                )}
                applicationRawStatus={jobCard.appData.status as 'pending' | 'under_review' | 'accepted' | 'rejected' | 'withdrawn' | undefined}
                hasApplied={jobCard.appData.hasApplied}
                applicationId={jobCard.appData.id}
                needsVideoUpload={
                  jobCard.job.job_type !== 'cpm' &&
                  jobCard.appData.status === 'pending' &&
                  !jobCard.appData.hasVideo
                }
                onboardingCallUrl={jobCard.appData.onboardingCallUrl}
                onView={() => handleView(jobCard.job)}
                onApply={() => handleApply(jobCard.job)}
                onUploadVideo={
                  jobCard.job.job_type !== 'cpm' && jobCard.appData.id
                    ? () => router.push(`/dashboard/applications/${jobCard.appData.id}/video`)
                    : undefined
                }
                translations={{
                  viewDetails: t?.jobFeed?.viewDetails,
                  applyNow: t?.jobFeed?.applyNow,
                  platforms: t?.jobFeed?.platforms,
                  perCreator: t?.jobFeed?.paymentFrequency?.notAvailable,
                  perPost: t?.jobFeed?.paymentFrequency?.perPost,
                  weekly: t?.jobFeed?.paymentFrequency?.weekly,
                  monthly: t?.jobFeed?.paymentFrequency?.monthly,
                  yearly: t?.jobFeed?.paymentFrequency?.yearly,
                  notAvailable: t?.jobFeed?.paymentFrequency?.notAvailable,
                  uploadVideo: t?.jobFeed?.applicationStatus?.uploadVideo,
                }}
              />
            ))}
          </div>
          )}

          {/* Pagination - Katana Style */}
          {selectedCountry && !isLoading && !error && jobCards.length > 0 && paginationData && paginationData.totalPages > 1 && (
            <div className="mt-10 flex flex-col items-center gap-4">
              <button
                onClick={handleNextPage}
                className="inline-flex items-center justify-center px-8 py-3 text-sm font-medium rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all duration-200 ease-out shadow-sm hover:shadow-md border-0"
              >
                {t?.jobFeed?.nextPage || 'Next Page'}
              </button>
            </div>
          )}
      </div>

      {/* Apply Modal */}
      {selectedJob && (
        <JobApplyModal job={selectedJob} open={applyModalOpen} onOpenChange={setApplyModalOpen} />
      )}

      {/* More Jobs Coming Soon Modal - Katana Style */}
      <Dialog open={moreJobsModalOpen} onOpenChange={setMoreJobsModalOpen}>
        <DialogContent className="max-w-md rounded-2xl border-0 shadow-xl p-8">
          <DialogHeader className="space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto">
              <Globe className="w-7 h-7 text-blue-600" />
            </div>
            <DialogTitle className="text-xl font-semibold text-gray-900 text-center">
              {t?.jobFeed?.moreJobsComingSoon?.title || 'More Jobs Coming Soon'}
            </DialogTitle>
            <DialogDescription className="text-center text-gray-500">
              {t?.jobFeed?.moreJobsComingSoon?.description ||
                "We're constantly adding new creator opportunities. Check back soon for more exciting opportunities!"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-center pt-4">
            <button
              onClick={() => setMoreJobsModalOpen(false)}
              className="inline-flex items-center justify-center px-8 py-3 text-sm font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-all duration-200 ease-out shadow-sm hover:shadow-md border-0"
            >
              {t?.jobFeed?.moreJobsComingSoon?.gotIt || 'Got it'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
