'use client';

import { useState } from 'react';
import { Building2, CheckCircle2, ArrowUpRight, Calendar } from 'lucide-react';
import type { JobStatus, PaymentFrequency } from '@/lib/db/types';

/**
 * Strip markdown syntax for plain text preview
 */
const stripMarkdown = (text: string): string => {
  return text
    .replace(/^#{1,6}\s+/gm, '') // Remove headings
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Bold
    .replace(/\*([^*]+)\*/g, '$1') // Italic
    .replace(/^[-*+]\s+/gm, '') // List items
    .replace(/^\d+\.\s+/gm, '') // Numbered lists
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
    .replace(/`([^`]+)`/g, '$1') // Inline code
    .replace(/\n{2,}/g, ' ') // Multiple newlines to space
    .replace(/\n/g, ' ') // Single newlines to space
    .trim();
};

interface JobCardProps {
  job: {
    id: string;
    job_slug: string;
    job_title: string;
    description: string;
    industry?: string | null;
    budget_per_creator: number | null;
    payment_frequency?: PaymentFrequency | null;
    status?: JobStatus | null;
    platforms_required?: string[];
    target_country?: string | null;
    cpm_platforms_allowed?: string[] | null;
    currency?: 'EUR' | 'USD' | 'GBP';
    job_type?: string | null;
    cpm_rate?: number | null;
    cpm_cap?: number | null;
    cpm_base_pay?: number | null;
    portal_config_version?: number | null;
  };
  applicationStatus?: string;
  applicationRawStatus?: 'pending' | 'under_review' | 'accepted' | 'rejected' | 'withdrawn';
  hasApplied?: boolean;
  applicationId?: string;
  needsVideoUpload?: boolean;
  onboardingCallUrl?: string | null;
  onView?: () => void;
  onApply?: () => void;
  onUploadVideo?: () => void;
  /** Hide the pricing block (used on the dashboard's featured slot). */
  hidePricing?: boolean;
  translations?: {
    viewDetails?: string;
    applyNow?: string;
    platforms?: string;
    perCreator?: string;
    perPost?: string;
    weekly?: string;
    monthly?: string;
    yearly?: string;
    notAvailable?: string;
    uploadVideo?: string;
    per1KViews?: string;
    maxEarnings?: string;
    cpmCampaign?: string;
  };
}

const formatCurrency = (
  amount: number | null,
  currency: 'EUR' | 'USD' | 'GBP' = 'USD',
  showDecimals = false
) => {
  if (!amount) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(amount);
};

const formatPaymentFrequency = (
  frequency: 'post' | 'week' | 'month' | 'year' | null,
  t?: JobCardProps['translations']
): string => {
  if (!frequency) return t?.notAvailable || 'N/A';
  switch (frequency) {
    case 'post':
      return t?.perPost || 'per post';
    case 'week':
      return t?.weekly || 'weekly';
    case 'month':
      return t?.monthly || 'monthly';
    case 'year':
      return t?.yearly || 'yearly';
    default:
      return t?.notAvailable || 'N/A';
  }
};

export function JobCard({
  job,
  applicationStatus,
  applicationRawStatus,
  hasApplied = false,
  applicationId,
  needsVideoUpload = false,
  onboardingCallUrl,
  onView,
  onApply,
  onUploadVideo,
  hidePricing = false,
  translations,
}: JobCardProps) {
  const [isViewing, setIsViewing] = useState(false);
  const isCpmJob = job.job_type === 'cpm';
  const isV3 = job.portal_config_version === 3;
  const displayTitle = job.job_title;
  const displayDescription = job.description;
  const displayCountry = job.target_country || null;

  // For CPM jobs, use cpm_platforms_allowed; for regular jobs, use platforms_required
  const displayPlatforms = isCpmJob
    ? (job.cpm_platforms_allowed || [])
    : (job.platforms_required || []);

  return (
    <div className="group bg-white rounded-3xl border-0 shadow-sm transition-all duration-200 ease-out hover:shadow-md flex flex-col h-full overflow-hidden">
      {/* Card Content */}
      <div className="p-6 flex-1 flex flex-col">
        {/* Header Row: Industry + Country + CPM Badge + Status */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            {isCpmJob && (
              <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                {translations?.cpmCampaign || 'CPM'}
              </span>
            )}
            {job.industry && (
              <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
                {job.industry}
              </span>
            )}
            {displayCountry && (
              <span className="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded-full">
                {displayCountry}
              </span>
            )}
          </div>
          {hasApplied && applicationStatus && (
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium min-w-0 max-w-[50%] border ${
              applicationRawStatus === 'accepted'
                ? 'bg-sky-50 text-sky-700 border-sky-200'
                : 'bg-green-50 text-green-700 border-green-200'
            }`}>
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{applicationStatus}</span>
            </div>
          )}
        </div>

        {/* Title */}
        <h2 className="font-semibold text-xl text-gray-900 mb-3 line-clamp-2 leading-tight">
          {displayTitle}
        </h2>

        {/* Description */}
        <p className="text-gray-600 text-sm mb-4 leading-relaxed line-clamp-3 flex-grow">
          {stripMarkdown(displayDescription)}
        </p>

        {/* Pricing Display */}
        {!hidePricing && (
          <div className="mb-4">
            {isCpmJob ? (
              isV3 ? (
                <div className="flex items-baseline gap-2">
                  <span className="font-bold text-3xl text-blue-600">
                    {formatCurrency(job.cpm_base_pay ? job.cpm_base_pay / 100 : null, job.currency || 'USD', true)}
                  </span>
                  <span className="text-sm text-gray-500">per video</span>
                </div>
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="font-bold text-3xl text-blue-600">
                    {formatCurrency(job.cpm_rate ? job.cpm_rate / 100 : null, job.currency || 'USD', true)}
                  </span>
                  <span className="text-sm text-gray-500">
                    {translations?.per1KViews || 'per 1K views'}
                  </span>
                </div>
              )
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="font-bold text-3xl text-blue-600">
                  {formatCurrency(job.budget_per_creator, job.currency || 'USD')}
                </span>
                <span className="text-sm text-gray-500">
                  {formatPaymentFrequency(job.payment_frequency || null, translations)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Platforms */}
        {displayPlatforms.length > 0 && (
          <div className="mb-4">
            <p className="text-gray-500 text-xs font-medium mb-2">
              {translations?.platforms || 'Platforms'}
            </p>
            <div className="flex flex-wrap gap-2">
              {displayPlatforms.map((platform) => (
                <span
                  key={platform}
                  className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full capitalize"
                >
                  {platform}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Card Footer - Actions */}
      <div className="p-5 border-t border-gray-100 flex gap-3 flex-wrap">
        {onView && (
          <button
            onClick={() => {
              setIsViewing(true);
              onView();
              setTimeout(() => setIsViewing(false), 5000);
            }}
            disabled={isViewing}
            className="flex-1 min-w-[120px] bg-gray-100 hover:bg-gray-200 text-gray-900 font-medium rounded-xl px-5 py-3 text-sm flex items-center justify-center gap-2 border-0 transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-gray-100"
          >
            <span className="truncate">{translations?.viewDetails || 'View Details'}</span>
            <ArrowUpRight className="w-4 h-4 flex-shrink-0" />
          </button>
        )}
        {hasApplied ? (
          onboardingCallUrl ? (
            <button
              onClick={() => window.open(onboardingCallUrl, '_blank')}
              className="flex-1 min-w-[120px] bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-3 text-sm border-0 transition-colors duration-150 flex items-center justify-center gap-2"
            >
              <Calendar className="w-4 h-4" />
              <span>Book Call</span>
            </button>
          ) : needsVideoUpload && onUploadVideo ? (
            <button
              onClick={onUploadVideo}
              className="flex-1 min-w-[120px] bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-3 text-sm border-0 transition-colors duration-150 truncate"
            >
              {applicationStatus || translations?.uploadVideo || 'Upload Video'}
            </button>
          ) : (
            <button
              disabled
              className={`flex-1 min-w-[120px] px-5 py-3 text-sm font-medium rounded-xl border-0 truncate cursor-not-allowed ${
                applicationRawStatus === 'accepted'
                  ? 'bg-sky-100 text-sky-700'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {applicationStatus || 'Applied'}
            </button>
          )
        ) : (
          onApply && (
            <button
              onClick={onApply}
              className="flex-1 min-w-[120px] bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-3 text-sm border-0 transition-colors duration-150 truncate"
            >
              {translations?.applyNow || 'Apply Now'}
            </button>
          )
        )}
      </div>
    </div>
  );
}
