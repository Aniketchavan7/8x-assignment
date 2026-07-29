'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Check, Save, Plus, Trash2, ChevronDown, ChevronUp, Briefcase, FileText, DollarSign } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { COUNTRIES, SUPPORTED_CURRENCIES, getCurrencySymbol } from '@/components/Admin/BrandDetail/shared';

const COUNTRY_MAP = new Map(COUNTRIES.map(c => [c.code, c]));
const PLATFORMS = ['tiktok', 'instagram', 'youtube'] as const;

interface CreatePortalConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  brandName: string;
  editJobId?: string;
  editJobTitle?: string;
  onJobCreated?: () => void;
}

type Step = 'input' | 'generating' | 'preview';

function SectionHeader({ icon: Icon, title }: { icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className="flex items-center gap-2 pt-2 pb-1">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h3 className="text-sm font-semibold">{title}</h3>
    </div>
  );
}

export function CreatePortalConfigModal({
  open,
  onOpenChange,
  brandId,
  brandName,
  editJobId,
  editJobTitle,
  onJobCreated,
}: CreatePortalConfigModalProps) {
  const { toast } = useToast();
  const isEditMode = !!editJobId;

  // Step state
  const [step, setStep] = useState<Step>('input');
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);

  // Job settings
  const [jobTitle, setJobTitle] = useState('');
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [countrySearch, setCountrySearch] = useState('');
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['tiktok', 'instagram']);

  // Pricing
  const [currency, setCurrency] = useState('USD');
  const [basePay, setBasePay] = useState('');
  const [bonusTiers, setBonusTiers] = useState<{ views: string; bonus: string }[]>([]);

  // Transcript
  const [context, setContext] = useState('');

  // Advanced (collapsed)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [mode, setMode] = useState<'active' | 'prospect'>('active');
  const [accessCode, setAccessCode] = useState('');

  // Generated result
  const [generatedConfig, setGeneratedConfig] = useState<Record<string, unknown> | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Editable JSON string for preview
  const [configJson, setConfigJson] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Auto-generate job title from brand name + countries
  useEffect(() => {
    if (isEditMode) return;
    const countryNames = selectedCountries.map(c => COUNTRY_MAP.get(c)?.name || c);
    const suffix = countryNames.length > 0 ? ` — ${countryNames.join(', ')}` : '';
    setJobTitle(`${brandName}${suffix}`);
  }, [brandName, selectedCountries, isEditMode]);

  // Load existing config in edit mode
  useEffect(() => {
    if (!open || !editJobId) return;
    let cancelled = false;

    const loadConfig = async () => {
      setIsLoadingEdit(true);
      try {
        const res = await fetch(`/api/admin/jobs/${editJobId}/portal-config`);
        if (!res.ok) throw new Error('Failed to load portal config');
        const data = await res.json();
        if (cancelled) return;
        if (data.portalConfig) {
          setGeneratedConfig(data.portalConfig);
          setConfigJson(JSON.stringify(data.portalConfig, null, 2));
          setStep('preview');
        }
      } catch {
        if (!cancelled) {
          toast({ title: 'Failed to load portal config', variant: 'destructive' });
          onOpenChange(false);
        }
      } finally {
        if (!cancelled) setIsLoadingEdit(false);
      }
    };

    loadConfig();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editJobId]);

  const filteredCountries = countrySearch.trim()
    ? COUNTRIES.filter(
        (c) =>
          !selectedCountries.includes(c.code) &&
          (c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
            c.code.toLowerCase().includes(countrySearch.toLowerCase()))
      ).slice(0, 8)
    : COUNTRIES.filter((c) => !selectedCountries.includes(c.code)).slice(0, 8);

  const addCountry = (code: string) => {
    if (!selectedCountries.includes(code)) {
      setSelectedCountries((prev) => [...prev, code]);
    }
    setCountrySearch('');
    setShowCountryDropdown(false);
  };

  const removeCountry = (code: string) => {
    setSelectedCountries((prev) => prev.filter((c) => c !== code));
  };

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  };

  const currencySymbol = getCurrencySymbol(currency);

  const isValidNumber = (val: string) => val !== '' && !isNaN(parseFloat(val)) && parseFloat(val) > 0;

  const canGenerate =
    context.length >= 50 &&
    selectedCountries.length > 0 &&
    selectedPlatforms.length > 0 &&
    isValidNumber(basePay) &&
    jobTitle.trim().length > 0;

  const handleGenerate = async () => {
    setStep('generating');
    setGenerateError(null);

    try {
      const parsedTiers = bonusTiers
        .filter(t => t.views && t.bonus)
        .map(t => ({ views: parseInt(t.views, 10), bonus: parseFloat(t.bonus) }))
        .filter(t => !isNaN(t.views) && !isNaN(t.bonus) && t.views > 0 && t.bonus > 0);

      const res = await fetch('/api/admin/jobs/generate-portal-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context,
          countries: selectedCountries,
          mode,
          accessCode: accessCode.trim() || undefined,
          platforms: selectedPlatforms,
          basePayDollars: parseFloat(basePay),
          bonusTiers: parsedTiers.length > 0 ? parsedTiers : undefined,
          currency,
          version: 3,
        }),
      });

      if (!res.ok || !res.body) {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to generate portal config');
        }
        throw new Error('Brief generation failed to start.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalConfig: Record<string, unknown> | null = null;
      let finalError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const lines = frame.split('\n');
          let event = 'message';
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) {
              dataLines.push(line.slice(5).replace(/^ /, ''));
            }
          }
          const data = dataLines.join('\n');
          if (event === 'done' && data) {
            const parsed = JSON.parse(data);
            finalConfig = parsed.config;
          } else if (event === 'error' && data) {
            const parsed = JSON.parse(data);
            finalError = parsed.error || 'Generation failed';
          }
        }
      }

      if (finalError) throw new Error(finalError);
      if (!finalConfig) throw new Error('Brief generation ended without a result.');

      setGeneratedConfig(finalConfig);
      setConfigJson(JSON.stringify(finalConfig, null, 2));
      setStep('preview');
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : 'Generation failed');
      setStep('input');
    }
  };

  const handleSave = async () => {
    if (!configJson) return;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(configJson);
    } catch (e) {
      const msg = e instanceof SyntaxError ? e.message : 'Unknown parse error';
      setJsonError(`Invalid JSON: ${msg}`);
      return;
    }

    // Structural validation
    const errors: string[] = [];
    if (!parsed.defaultLang || typeof parsed.defaultLang !== 'string') {
      errors.push('Missing or invalid "defaultLang"');
    }
    if (!parsed.content || typeof parsed.content !== 'object') {
      errors.push('Missing "content" object');
    } else {
      const lang = (parsed.defaultLang as string) || 'en';
      const langContent = (parsed.content as Record<string, unknown>)[lang];
      if (!langContent || typeof langContent !== 'object') {
        errors.push(`Missing content for language "${lang}"`);
      }
    }
    if (errors.length > 0) {
      setJsonError(errors.join('\n'));
      return;
    }
    setJsonError(null);

    setIsSaving(true);
    try {
      if (isEditMode) {
        const res = await fetch(`/api/admin/jobs/${editJobId}/portal-config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ portalConfig: parsed }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save portal config');

        setSaved(true);
        toast({
          title: 'Portal config saved',
          description: `Saved to "${editJobTitle || 'job'}"`,
        });
      } else {
        const basePayCents = Math.round(parseFloat(basePay) * 100);

        const jobRes = await fetch('/api/admin/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brand_organization_id: brandId,
            job_title: jobTitle.trim(),
            description: `Creator portal campaign for ${brandName}`,
            job_type: 'cpm',
            currency,
            cpm_rate: 0,
            cpm_cap: 0,
            cpm_base_pay: basePayCents,
            platforms_required: selectedPlatforms,
            target_country: selectedCountries[0] ? (COUNTRY_MAP.get(selectedCountries[0])?.name ?? selectedCountries[0]) : null,
            auto_approve_applications: true,
            transcript: context || null,
          }),
        });
        const jobData = await jobRes.json();
        if (!jobRes.ok) throw new Error(jobData.error || 'Failed to create job');

        const newJobId = jobData.job_id;

        const configRes = await fetch(`/api/admin/jobs/${newJobId}/portal-config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ portalConfig: parsed }),
        });
        const configData = await configRes.json();
        if (!configRes.ok) {
          await fetch(`/api/admin/jobs/${newJobId}`, { method: 'DELETE' }).catch(() => {});
          throw new Error(configData.error || 'Failed to save portal config');
        }

        setSaved(true);
        toast({
          title: 'Job created',
          description: `"${jobTitle.trim()}" created with portal config`,
        });
        onJobCreated?.();
      }
    } catch (error) {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Could not save',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setStep('input');
    setJobTitle('');
    setSelectedCountries([]);
    setCountrySearch('');
    setSelectedPlatforms(['tiktok', 'instagram']);
    setCurrency('USD');
    setBasePay('');
    setBonusTiers([]);
    setContext('');
    setShowAdvanced(false);
    setMode('active');
    setAccessCode('');
    setGeneratedConfig(null);
    setConfigJson('');
    setJsonError(null);
    setGenerateError(null);
    setSaved(false);
    onOpenChange(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      if (step === 'generating') return;
      handleClose();
    } else {
      onOpenChange(newOpen);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[640px] max-h-[85vh] flex flex-col"
        showCloseButton={step !== 'generating'}
        onEscapeKeyDown={(e) => { if (step === 'generating') e.preventDefault(); }}
        onInteractOutside={(e) => { if (step === 'generating') e.preventDefault(); }}
      >
        {/* Loading edit config */}
        {isLoadingEdit && (
          <>
            <VisuallyHidden>
              <DialogTitle>Loading portal config</DialogTitle>
            </VisuallyHidden>
            <div className="flex items-center justify-center py-20">
              <div className="text-center space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">Loading portal config...</p>
              </div>
            </div>
          </>
        )}

        {/* Step 1: Input Form */}
        {step === 'input' && !isLoadingEdit && (
          <>
            <DialogHeader>
              <DialogTitle>
                {isEditMode ? `Edit ${editJobTitle}` : `New Job for ${brandName}`}
              </DialogTitle>
              <DialogDescription>
                Set up the job, then generate the creator brief from a transcript.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-3 py-4 pr-1">
              {generateError && (
                <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                  {generateError}
                </div>
              )}

              {/* ── Job Settings ── */}
              <SectionHeader icon={Briefcase} title="Job Settings" />

              <div className="grid gap-2">
                <Label htmlFor="portal-job-title">
                  Job Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="portal-job-title"
                  placeholder="e.g. BrandName — United States"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Auto-generated from brand + country. You can edit it.
                </p>
              </div>

              <div className="grid gap-2">
                <Label>Target Country <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Input
                    placeholder="Search countries..."
                    value={countrySearch}
                    onChange={(e) => {
                      setCountrySearch(e.target.value);
                      setShowCountryDropdown(true);
                    }}
                    onFocus={() => setShowCountryDropdown(true)}
                    onBlur={() => setTimeout(() => setShowCountryDropdown(false), 150)}
                  />
                  {showCountryDropdown && filteredCountries.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {filteredCountries.map((country) => (
                        <button
                          key={country.code}
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center justify-between"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            addCountry(country.code);
                          }}
                        >
                          <span>{country.name}</span>
                          <span className="text-muted-foreground font-mono text-xs">{country.code}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedCountries.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedCountries.map((code) => {
                      const country = COUNTRY_MAP.get(code);
                      return (
                        <Badge
                          key={code}
                          variant="secondary"
                          className="cursor-pointer"
                          onClick={() => removeCountry(code)}
                        >
                          {country?.name || code} &times;
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid gap-2">
                <Label>Platforms <span className="text-destructive">*</span></Label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map((p) => (
                    <Badge
                      key={p}
                      variant={selectedPlatforms.includes(p) ? 'default' : 'outline'}
                      className="cursor-pointer capitalize"
                      onClick={() => togglePlatform(p)}
                    >
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* ── Pricing ── */}
              <SectionHeader icon={DollarSign} title="Pricing" />

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <span className="text-xs text-muted-foreground">Currency</span>
                  <Select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.code}</option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-1">
                  <span className="text-xs text-muted-foreground">Base Pay per Video <span className="text-destructive">*</span></span>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{currencySymbol}</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="15.00"
                      value={basePay}
                      onChange={(e) => setBasePay(e.target.value)}
                      className="pl-7"
                    />
                  </div>
                </div>
              </div>

              {/* Bonus tiers */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Bonus Tiers (optional)</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => setBonusTiers(prev => [...prev, { views: '', bonus: '' }])}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add tier
                  </Button>
                </div>
                {bonusTiers.map((tier, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        min="0"
                        placeholder="50000 views"
                        value={tier.views}
                        onChange={(e) => {
                          const updated = [...bonusTiers];
                          updated[i] = { ...updated[i], views: e.target.value };
                          setBonusTiers(updated);
                        }}
                        className="text-xs h-8"
                      />
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{currencySymbol}</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="25"
                          value={tier.bonus}
                          onChange={(e) => {
                            const updated = [...bonusTiers];
                            updated[i] = { ...updated[i], bonus: e.target.value };
                            setBonusTiers(updated);
                          }}
                          className="text-xs h-8 pl-6"
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setBonusTiers(prev => prev.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* ── Transcript ── */}
              <SectionHeader icon={FileText} title="Transcript / Context" />

              <div className="grid gap-2">
                <Textarea
                  placeholder="Paste the sales call transcript, brand brief, or any context about the brand and campaign..."
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  rows={6}
                />
                <p className="text-xs text-muted-foreground">
                  {context.length} characters (min 50) — Used to generate the creator brief, education content, and account setup instructions.
                </p>
              </div>

              {/* ── Advanced ── */}
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
              >
                {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Advanced settings
              </button>
              {showAdvanced && (
                <div className="space-y-3 pl-1 border-l-2 border-muted ml-1">
                  <div className="grid gap-2 pl-3">
                    <Label>Campaign Mode</Label>
                    <div className="flex gap-2">
                      {(['active', 'prospect'] as const).map((m) => (
                        <Badge
                          key={m}
                          variant={mode === m ? 'default' : 'outline'}
                          className="cursor-pointer capitalize"
                          onClick={() => setMode(m)}
                        >
                          {m}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Active = listed publicly. Prospect = unlisted, pricing hidden.
                    </p>
                  </div>
                  <div className="grid gap-2 pl-3">
                    <Label htmlFor="portal-access-code">Access Code</Label>
                    <Input
                      id="portal-access-code"
                      placeholder="e.g. BRAND2024"
                      value={accessCode}
                      onChange={(e) => setAccessCode(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={!canGenerate}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Documents
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 2: Generating */}
        {step === 'generating' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Generating Brief
              </DialogTitle>
              <DialogDescription>
                Creating creator brief for {brandName}...
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-center py-20">
              <div className="text-center space-y-4">
                <div className="relative mx-auto w-12 h-12">
                  <Loader2 className="h-12 w-12 animate-spin text-primary/30" />
                  <Sparkles className="h-5 w-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Generating creator brief</p>
                  <p className="text-xs text-muted-foreground">
                    Education, setup, posting guides, and more...
                  </p>
                  <p className="text-xs text-muted-foreground pt-2">
                    This can take up to a minute — please keep this window open.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Step 3: Preview + Save */}
        {step === 'preview' && generatedConfig && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {saved ? (
                  <>
                    <Check className="h-5 w-5 text-green-600" />
                    Job Created
                  </>
                ) : isEditMode ? (
                  <>
                    <Sparkles className="h-5 w-5" />
                    Edit Portal Config{editJobTitle ? ` — ${editJobTitle}` : ''}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    Review & Create Job
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                {saved
                  ? isEditMode
                    ? 'The portal config has been saved.'
                    : `"${jobTitle.trim()}" created.`
                  : isEditMode
                    ? 'Edit the JSON config and save changes.'
                    : 'Review the generated brief. The job will be created on confirm.'}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
              {/* Summary banner for create mode */}
              {!saved && !isEditMode && (
                <div className="p-3 rounded-md bg-muted/50 text-sm grid grid-cols-2 gap-x-4 gap-y-1">
                  <p className="col-span-2"><span className="font-medium">Job:</span> {jobTitle.trim()}</p>
                  <p><span className="font-medium">Country:</span> {selectedCountries.map(c => COUNTRY_MAP.get(c)?.name || c).join(', ')}</p>
                  <p><span className="font-medium">Platforms:</span> {selectedPlatforms.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ')}</p>
                  <p><span className="font-medium">Base Pay:</span> {currencySymbol}{basePay}/video</p>
                  {bonusTiers.length > 0 && <p><span className="font-medium">Bonuses:</span> {bonusTiers.length} tier{bonusTiers.length > 1 ? 's' : ''}</p>}
                </div>
              )}

              <div className="grid gap-2">
                <Label>{isEditMode ? 'Portal Config JSON' : 'Generated Brief (JSON)'}</Label>
                {jsonError && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive whitespace-pre-line">
                    {jsonError}
                  </div>
                )}
                <Textarea
                  value={configJson}
                  onChange={(e) => {
                    setConfigJson(e.target.value);
                    setJsonError(null);
                  }}
                  className="font-mono text-xs min-h-[40vh] resize-y"
                  spellCheck={false}
                />
              </div>
            </div>

            <DialogFooter className="pt-4">
              {saved ? (
                <Button onClick={handleClose}>Done</Button>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={isEditMode ? handleClose : () => setStep('input')}>
                    {isEditMode ? 'Cancel' : 'Back'}
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {isEditMode ? 'Saving...' : 'Creating Job...'}
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        {isEditMode ? 'Save Changes' : 'Create Job'}
                      </>
                    )}
                  </Button>
                </>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
