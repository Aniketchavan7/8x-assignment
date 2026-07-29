'use client';

import { useState } from 'react';
import { HelpCircle, ChevronDown } from 'lucide-react';
import { usePostHogClient } from '@/lib/analytics/posthog';
import { PostHogEvents } from '@/lib/analytics/events';

// Simple allowlist-based HTML sanitizer for FAQ content
// Only allows <strong>, </strong>, <br>, and <br/> tags
// This avoids the isomorphic-dompurify JSDOM issue with Turbopack
function sanitizeHtml(html: string): string {
  // Replace allowed tags with placeholders
  const strongOpen = '___STRONG_OPEN___';
  const strongClose = '___STRONG_CLOSE___';
  const br = '___BR___';

  let result = html
    .replace(/<strong>/gi, strongOpen)
    .replace(/<\/strong>/gi, strongClose)
    .replace(/<br\s*\/?>/gi, br);

  // Escape any remaining HTML
  result = result
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Restore allowed tags
  result = result
    .replace(new RegExp(strongOpen, 'g'), '<strong>')
    .replace(new RegExp(strongClose, 'g'), '</strong>')
    .replace(new RegExp(br, 'g'), '<br/>');

  return result;
}

interface FaqItemProps {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}

function FaqItem({ question, answer, isOpen, onToggle }: FaqItemProps) {
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full py-5 text-left gap-4"
      >
        <span className="font-medium text-gray-900">{question}</span>
        <ChevronDown
          className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          isOpen ? 'max-h-[600px] pb-5' : 'max-h-0'
        }`}
      >
        <div
          className="text-sm text-gray-600 leading-relaxed [&_strong]:font-semibold [&_strong]:text-gray-900"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(answer) }}
        />
      </div>
    </div>
  );
}

interface CpmFaqSectionProps {
  cpmRate: string;
  cpmCap: string;
  cpmBasePay?: string;
  payoutThreshold: string;
  hasBasePay?: boolean;
  /** Optional job slug for analytics tracking */
  jobSlug?: string;
  /** Source context for analytics (e.g., 'workspace', 'job_listing') */
  source?: string;
  translations: {
    title: string;
    whatIsCpm: { question: string; answer: string };
    howToGoViral: { question: string; answer: string };
    whatIsWarmup: { question: string; answer: string };
    howToWarmup: { question: string; answer: string };
    minViews: { question: string; answer: string };
    maxEarnings: { question: string; answer: string };
    basePay?: { question: string; answer: string };
    whenGetPaid: { question: string; answer: string };
  };
}

export function CpmFaqSection({
  cpmRate,
  cpmCap,
  cpmBasePay,
  payoutThreshold,
  hasBasePay = false,
  jobSlug,
  source = 'unknown',
  translations: t,
}: CpmFaqSectionProps) {
  const [openItem, setOpenItem] = useState<string | null>(null);
  const posthog = usePostHogClient();

  const handleToggle = (key: string) => {
    const isOpening = openItem !== key;
    setOpenItem(isOpening ? key : null);

    // Track FAQ item expand/collapse
    posthog?.capture(
      isOpening ? PostHogEvents.CPM_FAQ_ITEM_EXPANDED : PostHogEvents.CPM_FAQ_ITEM_COLLAPSED,
      {
        faq_item: key,
        job_slug: jobSlug,
        source,
      }
    );
  };

  const faqItems = [
    {
      key: 'whatIsCpm',
      question: t.whatIsCpm.question,
      answer: t.whatIsCpm.answer.replace('{rate}', cpmRate),
    },
    {
      key: 'howToGoViral',
      question: t.howToGoViral.question,
      answer: t.howToGoViral.answer,
    },
    {
      key: 'whatIsWarmup',
      question: t.whatIsWarmup.question,
      answer: t.whatIsWarmup.answer,
    },
    {
      key: 'howToWarmup',
      question: t.howToWarmup.question,
      answer: t.howToWarmup.answer,
    },
    {
      key: 'minViews',
      question: t.minViews.question,
      answer: t.minViews.answer.replace('{threshold}', payoutThreshold),
    },
    {
      key: 'maxEarnings',
      question: t.maxEarnings.question,
      answer: t.maxEarnings.answer.replace('{cap}', cpmCap),
    },
    ...(hasBasePay && t.basePay
      ? [
          {
            key: 'basePay',
            question: t.basePay.question,
            answer: t.basePay.answer.replace('{basePay}', cpmBasePay || ''),
          },
        ]
      : []),
    {
      key: 'whenGetPaid',
      question: t.whenGetPaid.question,
      answer: t.whenGetPaid.answer,
    },
  ];

  return (
    <div id="faq-section" className="bg-white rounded-3xl shadow-sm p-6 md:p-8 scroll-mt-8">
      <div className="flex items-center gap-2 mb-2">
        <HelpCircle className="w-5 h-5 text-blue-600" />
        <h2 className="text-lg font-semibold text-gray-900">{t.title}</h2>
      </div>
      <div className="mt-4">
        {faqItems.map(({ key, question, answer }) => (
          <FaqItem
            key={key}
            question={question}
            answer={answer}
            isOpen={openItem === key}
            onToggle={() => handleToggle(key)}
          />
        ))}
      </div>
    </div>
  );
}

// Default English translations for use when component is imported without translations
export const defaultCpmFaqTranslations = {
  title: 'Frequently Asked Questions',
  scrollButton: 'How this works',
  whatIsCpm: {
    question: 'What is CPM?',
    answer:
      'CPM stands for "Cost Per Mille" — the amount you earn per 1,000 views. For this campaign, you earn <strong>{rate}</strong> for every 1,000 views your video gets. The more views, the more you earn.',
  },
  howToGoViral: {
    question: 'How do I go viral?',
    answer:
      'Our top creators follow a proven 3-step formula:<br/><br/><strong>1. Create a fresh account</strong> — New accounts get priority from the algorithm. Create a dedicated account for this niche rather than using your personal one.<br/><br/><strong>2. Warm up your account</strong> — Spend 2-3 days engaging naturally before posting. This is crucial.<br/><br/><strong>3. Post optimized content</strong> — Follow the brand\'s content guidelines exactly. The hooks, formats, and styles we provide are tested to perform. Your first post on a warmed-up new account has the highest chance of going viral.',
  },
  whatIsWarmup: {
    question: 'What is warming up an account?',
    answer:
      "Warming up is the process of using your new account naturally for a few days before posting any content. This signals to the platform that you're a real person, not a bot or spam account.<br/><br/>It also trains the algorithm to understand what niche your content belongs to. When you engage with fitness content, the algorithm learns to show your fitness videos to fitness fans. Skip this step, and your video gets shown to random people who won't engage — killing your reach.",
  },
  howToWarmup: {
    question: 'How do I warm up my account?',
    answer:
      "<strong>Spend 2-3 days doing this before your first post:</strong><br/><br/>• Scroll and watch videos in your target niche for 20-30 minutes daily<br/>• Like and comment on videos similar to what you'll post<br/>• Follow 10-20 accounts in the same niche<br/>• Complete your profile with a photo and bio that fits the niche<br/><br/>Don't rush this. A properly warmed account dramatically increases your chances of going viral on your first post.",
  },
  minViews: {
    question: "What's the minimum views to get paid?",
    answer:
      'Your video needs at least <strong>{threshold} views</strong> to qualify for payout.<br/><br/>This threshold ensures that accounts are being correctly warmed up and content is reaching a real audience. If your video isn\'t hitting this minimum, it\'s a sign your account needs more warming up or the content needs adjusting. Videos under this threshold won\'t earn CPM, but you can keep submitting more videos.',
  },
  maxEarnings: {
    question: 'Is there a maximum I can earn per video?',
    answer:
      "Yes, each video is capped at <strong>{cap}</strong> in earnings. This helps the brand spread their budget across more creators. But there's no limit to how many videos you can submit — so keep posting!",
  },
  basePay: {
    question: 'What is base pay?',
    answer:
      'Base pay is a guaranteed amount you receive for each approved video, regardless of views. This is paid on top of your CPM earnings.<br/><br/>To unlock base pay, complete our free creator course. The course teaches you proven strategies to maximize your video performance. Once completed, you\'ll earn base pay on every approved video submission.',
  },
  whenGetPaid: {
    question: 'When do I get paid?',
    answer:
      "After you submit a video, the brand will review it to make sure it matches their campaign requirements and content guidelines. Once approved, we start tracking your views.<br/><br/>When your video hits the minimum view threshold, your earnings become available. You can withdraw your money anytime from the <strong>Wallet</strong> page.",
  },
};
