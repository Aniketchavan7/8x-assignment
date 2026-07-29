'use client';

import { GraduationCap, CheckCircle2 } from 'lucide-react';
import { Link } from '@/i18n/routing';

export interface BasePayCourseCardTranslations {
  title: string;
  whatIsBaseTitle: string;
  whatIsBase: string;
  applyButton: string;
  applyingButton: string;
  appliedMessage: string;
  freeLabel: string;
}

interface BasePayCourseCardProps {
  courseStatus: 'requested' | 'started' | 'completed' | null;
  courseCompletedAt?: string | null;
  translations: BasePayCourseCardTranslations;
}

export function BasePayCourseCard({
  courseStatus,
  courseCompletedAt,
  translations: t,
}: BasePayCourseCardProps) {
  const isCompleted = courseStatus === 'completed' || Boolean(courseCompletedAt);

  return (
    <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-3xl p-6 border border-purple-100">
      <div className="flex items-center gap-2 mb-3">
        <GraduationCap className="w-5 h-5 text-purple-600" />
        <h3 className="text-sm font-semibold text-gray-900">{t.title}</h3>
        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
          {t.freeLabel}
        </span>
      </div>

      <div className="bg-white/70 rounded-xl p-4 mb-4">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">
          {t.whatIsBaseTitle}
        </p>
        <p className="text-sm text-gray-700">{t.whatIsBase}</p>
      </div>

      {isCompleted ? (
        <>
          <div className="flex items-center gap-2 px-4 py-3 bg-green-50 rounded-xl border border-green-200 mb-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-700 font-medium">{t.appliedMessage}</p>
          </div>
          <Link
            href="/dashboard/course"
            className="w-full text-purple-600 hover:text-purple-700 font-medium text-sm flex items-center justify-center gap-1.5 py-2"
          >
            <GraduationCap className="w-4 h-4" />
            Review Course
          </Link>
        </>
      ) : (
        <Link
          href="/dashboard/course"
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl px-5 py-3 text-sm transition-colors duration-150 flex items-center justify-center gap-2"
        >
          <GraduationCap className="w-4 h-4" />
          {t.applyButton} — {t.freeLabel}
        </Link>
      )}
    </div>
  );
}
