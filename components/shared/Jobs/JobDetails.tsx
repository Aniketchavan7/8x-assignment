'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { JobBadge } from './JobBadge';

// Lazy load ReactMarkdown to reduce initial bundle size
const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
import { JobPricing } from './JobPricing';
import { JobRequirements } from './JobRequirements';
import { JobMediaCarousel } from './JobMediaCarousel';
import { CpmFaqSection, defaultCpmFaqTranslations } from '@/components/Cpm';
import { ChevronDown, MapPin, HelpCircle } from 'lucide-react';
import { usePostHogClient } from '@/lib/analytics/posthog';
import { PostHogEvents } from '@/lib/analytics/events';
import type { JobStatus, JobVisibility, PaymentFrequency } from '@/lib/db/types';

interface JobDetailsProps {
  job: {
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
    content_guidelines?: string | null;
    usage_rights?: string | null;
    exclusivity_terms?: string | null;
    media?: Array<{ url: string; type: 'image' | 'video' }> | null;
    created_at?: string | null;
    published_at?: string | null;
    platforms_required?: string[];
    preferred_locations?: string[];
    currency?: 'EUR' | 'USD' | 'GBP';
    // CPM-specific fields
    job_type?: string | null;
    cpm_rate?: number | null;
    cpm_cap?: number | null;
    cpm_base_pay?: number | null;
    cpm_payout_threshold?: number | null;
    cpm_platforms_allowed?: string[] | null;
    target_country?: string | null;
  };
  brandOrganization?: {
    id: string;
    organization_name: string;
    organization_slug?: string;
    company_logo: string | null;
    description: string | null;
    industry: string | null;
    currency?: 'EUR' | 'USD' | 'GBP';
    website: string | null;
  } | null;
  showActions?: boolean;
  actions?: React.ReactNode;
  headerActions?: React.ReactNode;
  locale?: string;
  translations?: {
    jobDescription?: string;
    budget?: string;
    duration?: string;
    startDate?: string;
    endDate?: string;
    applicationDeadline?: string;
    about?: string;
    visitWebsite?: string;
    guidelinesAndTerms?: string;
    contentGuidelines?: string;
    usageRights?: string;
    exclusivityTerms?: string;
    pricePerCreator?: string;
    totalBudget?: string;
    paymentFrequency?: string;
    pricing?: string;
    allCountries?: string;
    requirements?: string;
    platformsRequired?: string;
    targetCountries?: string;
    notSpecified?: string;
    posted?: string;
    applicationsClose?: string;
    industry?: string;
    country?: string;
    frequentlyAskedQuestions?: string;
    eightXFooterDescription?: string;
    perPost?: string;
    perWeek?: string;
    perMonth?: string;
    perYear?: string;
    howThisWorks?: string;
    cpmFaq?: {
      title: string;
      scrollButton?: string;
      whatIsCpm: { question: string; answer: string };
      howToGoViral: { question: string; answer: string };
      whatIsWarmup: { question: string; answer: string };
      howToWarmup: { question: string; answer: string };
      minViews: { question: string; answer: string };
      maxEarnings: { question: string; answer: string };
      basePay?: { question: string; answer: string };
      whenGetPaid: { question: string; answer: string };
    };
  };
}

const formatDate = (dateString: string | null | undefined, locale: string = 'en-US') => {
  if (!dateString) return null;
  try {
    return new Intl.DateTimeFormat(locale || 'en', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(dateString));
  } catch {
    return null;
  }
};

export function JobDetails({
  job,
  brandOrganization,
  showActions = true,
  actions,
  locale = 'en-US',
  translations,
}: JobDetailsProps) {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const posthog = usePostHogClient();

  const isApplicationDeadlinePassed = job.application_deadline
    ? new Date(job.application_deadline) < new Date()
    : false;

  // Parse FAQs from content_guidelines (stored as JSON)
  let faqs: Array<{ question: string; answer: string }> = [];
  let actualContentGuidelines: string | null = null;

  if (job.content_guidelines) {
    try {
      const parsed = JSON.parse(job.content_guidelines);
      if (Array.isArray(parsed)) {
        faqs = parsed;
      } else {
        actualContentGuidelines = job.content_guidelines;
      }
    } catch {
      actualContentGuidelines = job.content_guidelines;
    }
  }

  // Get media from dedicated media column
  let media: Array<{ url: string; type: 'image' | 'video' }> = [];
  if (job.media && Array.isArray(job.media)) {
    media = job.media
      .filter(
        (item: { url?: string; type?: string }) =>
          item && item.url && (item.type === 'image' || item.type === 'video')
      )
      .map((item: { url: string; type: 'image' | 'video' }) => ({
        url: item.url,
        type: item.type as 'image' | 'video',
      }));
  }

  // Parse usage_rights
  let actualUsageRights: string | null = null;
  if (job.usage_rights) {
    try {
      const parsed = JSON.parse(job.usage_rights);
      if (!Array.isArray(parsed)) {
        actualUsageRights = job.usage_rights;
      }
    } catch {
      actualUsageRights = job.usage_rights;
    }
  }

  const hasGuidance = actualContentGuidelines || actualUsageRights || job.exclusivity_terms;

  // Display values directly from job (no translation switching)
  const displayTitle = job.job_title;
  const displayDescription = job.description;
  const isCpmJob = job.job_type === 'cpm';
  const displayCountry = job.target_country || null;

  // For CPM jobs, use cpm_platforms_allowed; for regular jobs, use platforms_required
  const displayPlatforms = isCpmJob
    ? (job.cpm_platforms_allowed || [])
    : (job.platforms_required || []);

  const jobCurrency = job.currency || 'USD';

  // Get fallback image
  const fallbackImage = brandOrganization?.company_logo || '/assets/brand/8x_black_on_white.svg';

  return (
    <div className="pb-24 md:pb-8">
      {/* Hero Section */}
      <div className="relative">
        {/* Mobile: Media Carousel at top */}
        <div className="block lg:hidden mb-8">
          <JobMediaCarousel media={media} fallbackImage={fallbackImage} alt={displayTitle} />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Left Column: Content */}
          <div className="lg:col-span-7 space-y-6 order-2 lg:order-1">
            {/* Status, Industry & Country Badge Row */}
            <div className="flex flex-wrap items-center gap-2">
              {job.status && <JobBadge status={job.status} />}
              {isCpmJob && (
                <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                  CPM Campaign
                </span>
              )}
              {job.industry && (
                <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
                  {job.industry}
                </span>
              )}
              {displayCountry && (
                <span className="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded-full flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {displayCountry}
                </span>
              )}
            </div>

            {/* Title */}
            <div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-gray-900">
                {displayTitle}
              </h1>

              {/* Meta Information */}
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-600">
                  {translations?.posted || 'Posted'} {formatDate(job.published_at, locale)}
                </span>
                {job.application_deadline && (
                  <>
                    <span className="text-blue-600 font-medium">•</span>
                    <span
                      className={
                        isApplicationDeadlinePassed ? 'text-red-600 font-medium' : 'text-gray-600'
                      }
                    >
                      {translations?.applicationsClose || 'Applications close'}{' '}
                      {formatDate(job.application_deadline, locale)}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Description */}
            {displayDescription && (
              <div className="prose prose-gray max-w-none prose-headings:text-gray-900 prose-headings:font-bold prose-h2:text-2xl prose-h2:mt-6 prose-h2:mb-3 prose-h3:text-xl prose-h3:mt-4 prose-h3:mb-2 prose-p:text-base prose-p:md:text-lg prose-p:leading-relaxed prose-p:text-gray-700 prose-li:text-gray-700 prose-strong:text-gray-900 prose-ul:my-3 prose-li:my-1">
                <ReactMarkdown>{displayDescription}</ReactMarkdown>
              </div>
            )}
          </div>

          {/* Right Column: Media, Actions */}
          <div className="lg:col-span-5 space-y-6 order-1 lg:order-2 hidden lg:block">
            {/* Desktop Media Carousel */}
            <JobMediaCarousel media={media} fallbackImage={fallbackImage} alt={displayTitle} />

            {/* Desktop CTA Button */}
            {(() => {
              const hasActions = actions !== null && actions !== undefined;
              if (showActions && hasActions) {
                return <div className="w-full">{actions}</div>;
              }
              return null;
            })()}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="my-12 md:my-16">
        <div className="h-px bg-gray-200" />
      </div>

      {/* Lower Content Sections */}
      <div className="space-y-12 md:space-y-16">
        {/* Pricing Section */}
        {(() => {
          // CPM jobs have different pricing display
          if (isCpmJob) {
            const formatCpmCurrency = (amountCents: number | null | undefined) => {
              if (amountCents == null) return 'N/A';
              return new Intl.NumberFormat(locale, {
                style: 'currency',
                currency: jobCurrency,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(amountCents / 100);
            };

            return (
              <>
                <section>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                      {translations?.pricing || 'Pricing'}
                    </h2>
                    <button
                      onClick={() => {
                        posthog?.capture(PostHogEvents.CPM_FAQ_SCROLL_BUTTON_CLICKED, {
                          job_id: job.id,
                          source: 'job_listing',
                        });
                        document.getElementById('faq-section')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors"
                    >
                      <HelpCircle className="w-4 h-4" />
                      {translations?.howThisWorks || 'How this works'}
                    </button>
                  </div>
                  <div className="bg-white rounded-3xl shadow-sm p-6 md:p-8 border-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <p className="text-sm text-gray-500 mb-1">CPM Rate</p>
                        <p className="text-2xl font-bold text-blue-600">
                          {formatCpmCurrency(job.cpm_rate)}
                          <span className="text-sm font-normal text-gray-500 ml-1">per 1K views</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 mb-1">Max Earnings Per Video</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {formatCpmCurrency(job.cpm_cap)}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* CPM FAQ Section */}
                <section>
                  <CpmFaqSection
                    cpmRate={formatCpmCurrency(job.cpm_rate)}
                    cpmCap={formatCpmCurrency(job.cpm_cap)}
                    cpmBasePay={formatCpmCurrency(job.cpm_base_pay)}
                    payoutThreshold={(job.cpm_payout_threshold ?? 1000).toLocaleString(locale)}
                    hasBasePay={false}
                    source="job_listing"
                    translations={translations?.cpmFaq || defaultCpmFaqTranslations}
                  />
                </section>
              </>
            );
          }

          // Regular job pricing
          if (!job.budget_per_creator) {
            return null;
          }

          return (
            <JobPricing
              budgetPerCreator={job.budget_per_creator}
              paymentFrequency={job.payment_frequency || null}
              totalBudget={job.total_budget}
              locale={locale}
              currency={jobCurrency}
              translations={{
                pricePerCreator: translations?.pricePerCreator,
                totalBudget: translations?.totalBudget,
                pricing: translations?.pricing,
                perPost: translations?.perPost,
                perWeek: translations?.perWeek,
                perMonth: translations?.perMonth,
                perYear: translations?.perYear,
              }}
            />
          );
        })()}

        {/* Requirements Section */}
        <JobRequirements
          platformsRequired={displayPlatforms}
          targetCountry={displayCountry}
          translations={{
            requirements: translations?.requirements,
            platformsRequired: translations?.platformsRequired,
            targetCountries: translations?.targetCountries,
            notSpecified: translations?.notSpecified,
          }}
        />

        {/* Brand Section */}
        {brandOrganization && (
          <section>
            <h2 className="text-sm font-semibold text-gray-600 mb-6 uppercase tracking-wide">
              {translations?.about || 'About'} {brandOrganization.organization_name}
            </h2>
            <div className="bg-white rounded-3xl shadow-sm p-6 md:p-8 border-0">
              <div className="flex items-start gap-6">
                {brandOrganization.company_logo && (
                  <div className="relative w-20 h-20 flex-shrink-0 rounded-2xl overflow-hidden bg-gray-100">
                    <Image
                      src={brandOrganization.company_logo}
                      alt={brandOrganization.organization_name}
                      fill
                      className="object-cover"
                      unoptimized={brandOrganization.company_logo.includes('127.0.0.1')}
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-xl md:text-2xl text-gray-900 mb-2">
                    {brandOrganization.organization_name}
                  </h3>
                  {brandOrganization.industry && (
                    <span className="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded-full inline-block mb-4">
                      {brandOrganization.industry}
                    </span>
                  )}
                  {brandOrganization.description && (
                    <p className="text-gray-700 leading-relaxed mt-4 whitespace-pre-wrap">
                      {brandOrganization.description}
                    </p>
                  )}
                  {brandOrganization.website && (
                    <a
                      href={brandOrganization.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 mt-4 text-blue-600 font-semibold text-sm hover:underline"
                    >
                      {translations?.visitWebsite || 'Visit Website'} →
                    </a>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* FAQ Section */}
        {faqs.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-600 mb-6 uppercase tracking-wide">
              {translations?.frequentlyAskedQuestions || 'Frequently Asked Questions'}
            </h2>
            <div className="space-y-3">
              {faqs.map((faq, index) => (
                <div
                  key={index}
                  className="bg-white rounded-2xl shadow-sm border-0 overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
                    className="w-full flex items-center justify-between p-4 md:p-5 text-left hover:bg-gray-50 transition-colors duration-150"
                  >
                    <span className="font-semibold text-gray-900 pr-4">{faq.question}</span>
                    <ChevronDown
                      className={`w-5 h-5 text-blue-600 flex-shrink-0 transition-transform duration-200 ${
                        expandedFaq === index ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {expandedFaq === index && (
                    <div className="px-4 md:px-5 pb-4 md:pb-5 border-t border-gray-100">
                      <p className="text-gray-700 leading-relaxed pt-4 whitespace-pre-line">
                        {faq.answer}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Guidelines & Terms Section */}
        {hasGuidance && (
          <section>
            <h2 className="text-sm font-semibold text-gray-600 mb-6 uppercase tracking-wide">
              {translations?.guidelinesAndTerms || 'Guidelines & Terms'}
            </h2>
            <div className="bg-white rounded-3xl shadow-sm p-6 md:p-8 space-y-6 border-0">
              {actualContentGuidelines && (
                <div>
                  <h3 className="font-semibold text-sm text-gray-900 mb-2 uppercase tracking-wide">
                    {translations?.contentGuidelines || 'Content Guidelines'}
                  </h3>
                  <p className="text-gray-700 whitespace-pre-line leading-relaxed">
                    {actualContentGuidelines}
                  </p>
                </div>
              )}
              {actualUsageRights && (
                <div>
                  <h3 className="font-semibold text-sm text-gray-900 mb-2 uppercase tracking-wide">
                    {translations?.usageRights || 'Usage Rights'}
                  </h3>
                  <p className="text-gray-700 whitespace-pre-line leading-relaxed">
                    {actualUsageRights}
                  </p>
                </div>
              )}
              {job.exclusivity_terms && (
                <div>
                  <h3 className="font-semibold text-sm text-gray-900 mb-2 uppercase tracking-wide">
                    {translations?.exclusivityTerms || 'Exclusivity Terms'}
                  </h3>
                  <p className="text-gray-700 whitespace-pre-line leading-relaxed">
                    {job.exclusivity_terms}
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* 8x Footer Section */}
        <section className="border-t border-gray-200 pt-8">
          <div className="flex items-center gap-4 mb-4">
            <Image
              src="/assets/brand/8x_logo.svg"
              alt="8x"
              width={48}
              height={48}
              className="h-12 w-12"
            />
          </div>
          <p className="text-gray-600 leading-relaxed max-w-2xl">
            {translations?.eightXFooterDescription ||
              '8x is the platform for virality. We connect brands with Gen Z creators to produce authentic UGC content that drives results. Creators get paid to go viral, and brands get viral content that outperforms traditional advertising.'}
          </p>
        </section>
      </div>

      {/* Mobile: Sticky CTA Button at Bottom */}
      {showActions && actions ? (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-sm border-t border-gray-200 lg:hidden z-50 shadow-lg">
          <div className="w-full">{actions}</div>
        </div>
      ) : null}
    </div>
  );
}
