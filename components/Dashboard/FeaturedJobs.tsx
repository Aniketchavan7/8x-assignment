'use client';

import { ArrowRight } from 'lucide-react';
import { useRouter, Link } from '@/i18n/routing';
import { JobCard } from '@/components/shared/Jobs/JobCard';
import type { FeaturedJob } from '@/lib/modules/onboarding/featured-jobs';

export function FeaturedJobs({ jobs }: { jobs: FeaturedJob[] }) {
  const router = useRouter();

  if (jobs.length === 0) {
    return (
      <div className="bg-white rounded-3xl shadow-sm p-8 text-center">
        <p className="text-gray-900 font-medium">No campaigns available right now</p>
        <p className="text-sm text-gray-500 mt-1">
          Check back soon — new opportunities arrive every week.
        </p>
        <Link
          href="/dashboard/find"
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Browse all jobs
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={{
              id: job.id,
              job_slug: job.job_slug,
              job_title: job.job_title,
              description: job.description,
              industry: job.industry,
              budget_per_creator: job.budget_per_creator,
              payment_frequency: job.payment_frequency,
              status: job.status ?? undefined,
              platforms_required: job.platforms_required,
              target_country: job.target_country,
              cpm_platforms_allowed: job.cpm_platforms_allowed,
              currency: job.currency ?? undefined,
              job_type: job.job_type,
              cpm_rate: job.cpm_rate,
              cpm_cap: job.cpm_cap,
              cpm_base_pay: job.cpm_base_pay,
              portal_config_version: job.portal_config_version,
            }}
            onView={() => {
              const country = job.target_country
                ? `?country=${encodeURIComponent(job.target_country)}`
                : '';
              router.push(`/dashboard/jobs/${job.brand_slug}${country}`);
            }}
            hidePricing
          />
        ))}
      </div>

      <div className="pt-1">
        <Link
          href="/dashboard/find"
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white text-gray-900 border border-gray-200 px-4 py-3 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Find more jobs
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
