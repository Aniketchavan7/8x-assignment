import { DollarSign, TrendingUp } from 'lucide-react';

interface JobPricingProps {
  budgetPerCreator: number | null;
  paymentFrequency: 'post' | 'week' | 'month' | 'year' | null;
  totalBudget?: number | null;
  locale?: string;
  currency?: 'EUR' | 'USD' | 'GBP';
  translations?: {
    pricePerCreator?: string;
    totalBudget?: string;
    paymentFrequency?: string;
    pricing?: string;
    perPost?: string;
    perWeek?: string;
    perMonth?: string;
    perYear?: string;
  };
}

const formatCurrency = (
  value: number | null | undefined,
  locale: string = 'en-US',
  currency: 'EUR' | 'USD' | 'GBP' = 'USD'
) => {
  if (value === null || value === undefined) {
    return '—';
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 0,
  }).format(Number(value));
};

const formatFrequency = (
  frequency: 'post' | 'week' | 'month' | 'year' | null,
  translations?: {
    perPost?: string;
    perWeek?: string;
    perMonth?: string;
    perYear?: string;
  }
) => {
  if (!frequency) return '';
  const frequencyMap: Record<string, string> = {
    post: translations?.perPost || 'per post',
    week: translations?.perWeek || 'per week',
    month: translations?.perMonth || 'per month',
    year: translations?.perYear || 'per year',
  };
  return frequencyMap[frequency] || frequency.replace('_', ' ');
};

/**
 * Katana-style pricing component with rounded cards and soft shadows
 */
export function JobPricing({
  budgetPerCreator,
  paymentFrequency,
  totalBudget,
  locale = 'en-US',
  currency = 'USD',
  translations,
}: JobPricingProps) {
  if (!budgetPerCreator) {
    return null;
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-600 mb-6 uppercase tracking-wide">
        {translations?.pricing || 'Compensation'}
      </h2>

      <div className="bg-white rounded-3xl shadow-sm p-6 md:p-8 border-0">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          {/* Main Price */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                {translations?.pricePerCreator || 'Price per Creator'}
              </span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="font-bold text-4xl md:text-5xl text-blue-600">
                {formatCurrency(budgetPerCreator, locale, currency)}
              </span>
              {paymentFrequency && (
                <span className="text-lg text-gray-500">
                  {formatFrequency(paymentFrequency, translations)}
                </span>
              )}
            </div>
          </div>

          {/* Total Budget */}
          {totalBudget && (
            <div className="border-t md:border-t-0 md:border-l border-gray-200 pt-4 md:pt-0 md:pl-6">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                  {translations?.totalBudget || 'Total Budget'}
                </span>
              </div>
              <span className="font-bold text-2xl md:text-3xl text-gray-900">
                {formatCurrency(totalBudget, locale, currency)}
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
