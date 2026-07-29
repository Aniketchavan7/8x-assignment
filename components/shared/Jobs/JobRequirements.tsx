import { Monitor, MapPin } from 'lucide-react';

interface JobRequirementsProps {
  platformsRequired?: string[];
  targetCountry?: string | null;
  translations?: {
    requirements?: string;
    platformsRequired?: string;
    targetCountries?: string;
    notSpecified?: string;
  };
}

const getIconForSection = (title: string) => {
  const titleLower = title.toLowerCase();
  if (titleLower.includes('platform')) return Monitor;
  if (titleLower.includes('countr')) return MapPin;
  return Monitor;
};

/**
 * Katana-style requirements component with rounded cards and soft shadows
 */
export function JobRequirements({
  platformsRequired = [],
  targetCountry,
  translations,
}: JobRequirementsProps) {
  const requirementSections = [
    {
      title: translations?.platformsRequired || 'Platforms Required',
      items: platformsRequired || [],
    },
    {
      title: translations?.targetCountries || 'Target Country',
      items: targetCountry ? [targetCountry] : [],
    },
  ].filter((section) => section.items.length > 0);

  if (requirementSections.length === 0) {
    return null;
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-600 mb-6 uppercase tracking-wide">
        {translations?.requirements || 'Requirements'}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {requirementSections.map((section) => {
          const Icon = getIconForSection(section.title);
          return (
            <div key={section.title} className="bg-white rounded-3xl shadow-sm p-5 border-0">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center">
                  <Icon className="w-4 h-4 text-blue-600" />
                </div>
                <h3 className="font-semibold text-sm text-gray-900">
                  {section.title}
                </h3>
              </div>
              {section.items.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {section.items.map((item) => (
                    <span
                      key={`${section.title}-${item}`}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-full capitalize hover:bg-gray-200 transition-colors duration-150"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  {translations?.notSpecified || 'Not specified'}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
