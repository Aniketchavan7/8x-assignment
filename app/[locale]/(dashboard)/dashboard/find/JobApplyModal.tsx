'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useApplyJob } from '../hooks/useApplyJob';
import { useComponentTranslations } from '@/lib/i18n/useComponentTranslations';
import { useRouter } from '@/i18n/routing';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { Job } from '@/lib/db/types';

interface JobApplyModalProps {
  job: Job;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplySuccess?: (onboardingCallUrl: string | null) => void;
}

interface JobApplyTranslations {
  jobApply: {
    title: string;
    subtitle: string;
    successMessage: string;
    coverLetter: {
      label: string;
      required: string;
      description: string;
      placeholder: string;
    };
    termsAgreement: string;
    submitApplication: string;
    submittingApplication: string;
    cancel: string;
  };
}

export function JobApplyModal({ job, open, onOpenChange, onApplySuccess }: JobApplyModalProps) {
  const t = useComponentTranslations<JobApplyTranslations>('Dashboard');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const applyJob = useApplyJob();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreedToTerms) return;

    try {
      const result = await applyJob.mutateAsync({
        jobId: job.id,
        data: { cover_letter: null },
      });

      if (result?.brand_slug) {
        setAgreedToTerms(false);
        onOpenChange(false);

        // Invalidate managed-creator caches so onboarding page finds the record
        await queryClient.invalidateQueries({ queryKey: ['managed-creator-status'] });

        toast({
          title: t?.jobApply?.successMessage || 'Application submitted!',
          description: 'Complete your video to finish your application.',
        });

        router.push(`/dashboard/${result.brand_slug}/onboarding`);
      } else {
        // Fallback: close modal if no brand_slug returned
        onOpenChange(false);
      }
    } catch {
      // Error is handled by React Query and displayed in UI
    }
  };

  // Reset error/success when modal closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      applyJob.reset();
    }
    onOpenChange(newOpen);
  };

  const isSubmitting = applyJob.isPending;
  const error = applyJob.error?.message || null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-gray-900">
              {(t?.jobApply?.title || 'Apply to {jobTitle}').replace('{jobTitle}', job.job_title)}
            </DialogTitle>
            <DialogDescription className="text-base text-gray-600">
              {t?.jobApply?.subtitle ||
                "Tell us why you're the perfect creator for this opportunity"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} id="apply-form" className="space-y-6 mt-4 pb-4">
            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800 font-medium">{error}</p>
              </div>
            )}

            {/* Terms Checkbox */}
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <Checkbox
                id="terms"
                checked={agreedToTerms}
                onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                className="mt-0.5"
                disabled={isSubmitting}
              />
              <Label
                htmlFor="terms"
                className="text-gray-900 cursor-pointer text-sm leading-normal flex-1"
              >
                {t?.jobApply?.termsAgreement ||
                  'I agree that all content I create for this campaign will belong to the brand, and the brand may request removal of posts or accounts. I also agree to 8x platform terms and conditions.'}
              </Label>
            </div>
          </form>
        </div>

        {/* Sticky Footer */}
        <DialogFooter className="flex-shrink-0 bg-white border-t px-6 py-4 gap-2 mt-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="border-gray-300 bg-white hover:bg-gray-50 text-gray-900"
          >
            {t?.jobApply?.cancel || 'Cancel'}
          </Button>
          <Button
            type="submit"
            form="apply-form"
            disabled={!agreedToTerms || isSubmitting}
            className="bg-primary hover:bg-primary/90 text-white"
          >
            {isSubmitting
              ? t?.jobApply?.submittingApplication || 'Submitting Application...'
              : t?.jobApply?.submitApplication || 'Submit Application'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
