export interface ViralFormat {
  title: string
  hook: string
  why: string
  avgViews: string
  difficulty: string
  example: { src: string; views: string }
  script: string
}

export interface NicheViralVideo {
  videoId: string
  transcript: string
  adaptation: string
}

export interface Persona {
  label: string
  who: string
  mindset: string
  angle: string
  reach: string
}

export interface ExampleVideo {
  id: string
  src: string
  script: string
  note?: string
  textOverlay?: string
  videoUrl?: string
}

/** Translatable content — one object per language inside portal_config.content */
export interface PortalContent {
  about?: string[]
  goalText: string
  formats?: ViralFormat[]
  celebration?: { particles: string[]; heroEmoji: string }
  compensation?: {
    currency: string
    baseFee: number
    baseFeeTitle?: string
    maxBaseFee?: number
    monthlyCap?: number
    bonusTiers?: { views: number; bonus: number }[]
    baseFeeDescription?: string
    performanceBonusDescription?: string
    longTermDescription?: string
  }

  education?: {
    brandDescription: string[]
    campaignGoal: string
    kpi: string
    platforms: string
    contentStyle: string
    sellingPoints: { title: string; detail: string }[]
    organicVsAd: { organic: string[]; paid: string[] }
    personas: Persona[]
  }

  setup: {
    nicheLabel: string
    usernameExamples: string[]
    warmupSearchTerms: string[]
    warmupCheckContent: string
    geoTag?: {
      location: string
      description: string
    }
  }

  onboarding?: {
    /** Supabase storage path for intro video, e.g. "intro/example.mp4" */
    introVideoPath?: string
    /** "simple" = download+script+upload flow; "full" = filming tips flow */
    uploadFlowVariant?: "simple" | "full"
  }

  posting: {
    nicheViralVideos: NicheViralVideo[]
    hashtag: string
  }

  maintenance: {
    nicheContentDescription: string
    searchTerms: string
    exampleComments: string[]
  }

  appAccess?: {
    title: string
    instructions: string[]
    downloadUrl?: string
    accessCode?: string
  }

  resources?: string | { title: string; url: string; description?: string }[]

  /** Markdown describing how creators access the brand's product. Falls back to "Ask your campaign manager" */
  productAccess?: string
}

/** Normalize legacy array resources to markdown string */
export function normalizeResources(
  resources: PortalContent['resources'],
): string {
  if (!resources) return ''
  if (typeof resources === 'string') return resources
  return resources
    .map((r) => `[${r.title}](${r.url})${r.description ? ` — ${r.description}` : ''}`)
    .join('\n\n')
}

/* ─── Brand Reference Video (from brand_reference_videos table) ─── */

export interface BrandReferenceVideo {
  id: string
  url: string | null
  transcript: string | null
  video_url: string | null
  notes: string | null
  music: string | null
  onscreen_text: string | null
  disclaimer: string | null
  adaptation: string | null
  storage_path?: string | null
  pdf_storage_path?: string | null
  pdf_url?: string | null
  promoted_onboarding?: boolean
  promoted_job_listing?: boolean
  promoted_brief?: boolean
  category?: string
  sort_order?: number
}

/* ─── V3: Markdown-based portal content ─── */

export interface PortalContentV3 {
  /** Portal landing page */
  job_description: {
    aboutMd: string
    compensationMd: string
  }

  /** Brief — each page is a markdown string */
  pages: {
    education: string
    setup: string
    account_creation: string
    account_warmup: string
    posting: string
    maintenance: string
    payment: string
  }
}

/** Type guard: is the content v3 markdown-based? */
export function isV3Content(content: PortalContent | PortalContentV3): content is PortalContentV3 {
  return 'job_description' in content && 'pages' in content
}

/* ─── Campaign mode + visibility ─── */

export type CampaignMode = "active" | "prospect"

export interface PortalVisibility {
  listed: boolean
  portalPricing: boolean
  briefPricing: boolean
  socialListening: boolean
  vpnAccepted: boolean
}

const ACTIVE_DEFAULTS: PortalVisibility = {
  listed: true,
  portalPricing: true,
  briefPricing: true,
  socialListening: false,
  vpnAccepted: false,
}

const PROSPECT_DEFAULTS: PortalVisibility = {
  listed: false,
  portalPricing: false,
  briefPricing: false,
  socialListening: true,
  vpnAccepted: false,
}

/** Shape of jobs.portal_config JSONB */
export interface PortalConfig {
  version?: 3
  defaultLang: string
  availableLanguages: string[]
  platforms?: ('tiktok' | 'instagram' | 'youtube')[]
  content: Record<string, PortalContent>
  mode?: CampaignMode
  accessCode?: string
  visibility?: Partial<PortalVisibility>
}

/** V3 portal config with markdown-based content */
export interface PortalConfigV3 extends Omit<PortalConfig, 'version' | 'content'> {
  version: 3
  content: Record<string, PortalContentV3>
}

/** Check if a portal config is v3 (markdown-based). Works on raw JSONB objects too. */
export function isV3Config(config: { version?: number }): boolean {
  return config.version === 3
}

/** PortalConfig after resolvePortalConfig — mode + visibility are guaranteed */
export interface ResolvedPortalConfig extends PortalConfig {
  mode: CampaignMode
  visibility: PortalVisibility
}

export interface ResolvedPortalConfigV3 extends PortalConfigV3 {
  mode: CampaignMode
  visibility: PortalVisibility
}

/** Strip brief-only fields for public portal responses. */
export function sanitizePortalConfig(config: PortalConfig): PortalConfig
export function sanitizePortalConfig(config: PortalConfigV3): PortalConfigV3
export function sanitizePortalConfig(config: PortalConfig | PortalConfigV3): PortalConfig | PortalConfigV3 {
  const { accessCode, ...rest } = config;

  // V3: strip pages (brief-only), keep job_description (portal landing)
  if (isV3Config(config)) {
    const sanitizedContent: Record<string, PortalContentV3> = {};
    for (const [lang, c] of Object.entries(config.content)) {
      sanitizedContent[lang] = { job_description: c.job_description, pages: { education: '', setup: '', account_creation: '', account_warmup: '', posting: '', maintenance: '', payment: '' } };
    }
    return { ...rest, content: sanitizedContent } as PortalConfigV3;
  }

  // V2: existing logic
  const sanitizedContent: Record<string, PortalContent> = {};
  for (const [lang, c] of Object.entries((config as PortalConfig).content)) {
    const { education, appAccess, productAccess, setup, posting, maintenance, onboarding, resources, ...safeContent } = c;
    sanitizedContent[lang] = safeContent as PortalContent;
  }
  return { ...rest, content: sanitizedContent } as PortalConfig;
}

/** Apply mode-based defaults, then per-field overrides */
export function resolvePortalConfig(raw: PortalConfig): ResolvedPortalConfig {
  const mode: CampaignMode = raw.mode ?? "prospect"
  const defaults = mode === "prospect" ? PROSPECT_DEFAULTS : ACTIVE_DEFAULTS
  return {
    ...raw,
    mode,
    availableLanguages: raw.availableLanguages ?? ['en'],
    visibility: { ...defaults, ...raw.visibility },
  }
}

export function resolvePortalConfigV3(raw: PortalConfigV3): ResolvedPortalConfigV3 {
  const mode: CampaignMode = raw.mode ?? "prospect"
  const defaults = mode === "prospect" ? PROSPECT_DEFAULTS : ACTIVE_DEFAULTS
  return {
    ...raw,
    mode,
    availableLanguages: raw.availableLanguages ?? ['en'],
    visibility: { ...defaults, ...raw.visibility },
  }
}

/** Minimal portal config used when a job has no portal_config */
export const DEFAULT_PORTAL_CONFIG: ResolvedPortalConfig = {
  defaultLang: 'en',
  availableLanguages: ['en'],
  platforms: ['tiktok', 'instagram'],
  mode: 'active',
  visibility: {
    listed: true,
    portalPricing: true,
    briefPricing: true,
    socialListening: false,
    vpnAccepted: false,
  },
  content: {
    en: {
      about: [],
      goalText: '',
      formats: [],
      celebration: { particles: [], heroEmoji: '' },
      compensation: { currency: 'USD', baseFee: 0 },
      education: {
        brandDescription: [],
        campaignGoal: '',
        kpi: '',
        platforms: '',
        contentStyle: '',
        sellingPoints: [],
        organicVsAd: { organic: [], paid: [] },
        personas: [],
      },
      setup: {
        nicheLabel: '',
        usernameExamples: [],
        warmupSearchTerms: [],
        warmupCheckContent: '',
      },
      onboarding: {
        introVideoPath: 'intro/default.mp4',
        uploadFlowVariant: 'simple',
      },
      posting: { nicheViralVideos: [], hashtag: '' },
      maintenance: { nicheContentDescription: '', searchTerms: '', exampleComments: [] },
    },
  },
};
