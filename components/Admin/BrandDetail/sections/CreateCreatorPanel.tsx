'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import {
  X,
  UserPlus,
  Loader2,
  Check,
  ChevronDown,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { COUNTRIES } from '@/components/Admin/BrandDetail/shared';
import { TikTokIcon, InstagramIcon } from '@/components/Admin/BrandDetail/shared';
import { STATUSES, STATUS_CONFIG, type StatusId } from './pipelineHelpers';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateCreatorPanelProps {
  brandId: string;
  brandJobs: { id: string; job_title: string }[];
  onClose: () => void;
  onSuccess: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function RequiredStar() {
  return <span className="text-destructive">*</span>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateCreatorPanel({ brandId, brandJobs, onClose, onSuccess }: CreateCreatorPanelProps) {
  const { toast } = useToast();

  // Main fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pipelineStatus, setPipelineStatus] = useState<StatusId>('applied');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [brandTiktok, setBrandTiktok] = useState('');
  const [brandInstagram, setBrandInstagram] = useState('');
  const [basePay, setBasePay] = useState('');
  const [country, setCountry] = useState('');
  const [tiktokUsername, setTiktokUsername] = useState('');
  const [instagramUsername, setInstagramUsername] = useState('');
  const [notes, setNotes] = useState('');

  // UI
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedFirst = firstName.trim();
    if (!trimmedFirst) {
      toast({ title: 'First name required', variant: 'destructive' });
      return;
    }

    const trimmedLast = lastName.trim();
    const displayName = `${trimmedFirst} ${trimmedLast}`.replace(/\s+/g, ' ').trim();

    setIsSubmitting(true);

    try {
      const createItem: Record<string, unknown> = {
        name: displayName,
        status: pipelineStatus,
      };

      if (email.trim()) createItem.email = email.trim();
      if (phone.trim()) createItem.phone = phone.trim();
      if (country) createItem.country = country;
      if (tiktokUsername.trim()) createItem.tiktok_username = tiktokUsername.trim();
      if (instagramUsername.trim()) createItem.instagram_username = instagramUsername.trim();
      if (selectedJobId) createItem.job_id = selectedJobId;
      if (basePay) createItem.base_pay = Number(basePay);
      if (notes.trim()) createItem.notes = notes.trim();

      const res = await fetch('/api/managed-creators/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-view-as-brand': brandId,
        },
        body: JSON.stringify({
          creates: [createItem],
          updates: [],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create creator');
      }

      if (data.errors?.length > 0) {
        throw new Error(data.errors[0]?.error || 'Failed to create creator');
      }

      const createdId = data.created?.[0]?.id;
      if (!createdId) {
        throw new Error('Creator was not created. Please try again.');
      }

      const changes: Record<string, string | null> = {};

      // Set 8x brand account URLs
      if (brandTiktok.trim()) changes.collected_tiktok_url = brandTiktok.trim();
      if (brandInstagram.trim()) changes.collected_instagram_url = brandInstagram.trim();

      if (Object.keys(changes).length > 0) {
        await fetch('/api/managed-creators/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-view-as-brand': brandId,
          },
          body: JSON.stringify({
            updates: [{ id: createdId, changes }],
            creates: [],
          }),
        });
      }

      setCreated(true);
      onSuccess();

      toast({
        title: 'Creator created',
        description: `${displayName} has been added to the pipeline.`,
      });
    } catch (error) {
      console.error('Error creating creator:', error);
      toast({
        title: 'Failed to create creator',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAnother = () => {
    setFirstName('');
    setLastName('');
    setPipelineStatus('applied');
    setSelectedJobId('');
    setBrandTiktok('');
    setBrandInstagram('');
    setBasePay('');
    setCountry('');
    setEmail('');
    setPhone('');
    setTiktokUsername('');
    setInstagramUsername('');
    setNotes('');
    setCreated(false);
  };

  // ---------------------------------------------------------------------------
  // Success state
  // ---------------------------------------------------------------------------

  if (created) {
    return (
      <div className="flex h-full w-full flex-col min-w-0">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background z-10">
          <div className="flex items-center gap-2">
            <Check className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold">Creator Created</h2>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            The creator has been added to the pipeline and is ready to be managed.
          </p>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={handleCreateAnother} className="flex-1">
              Create Another
            </Button>
            <Button onClick={onClose} className="flex-1">
              Done
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Form — mirrors grid columns
  // ---------------------------------------------------------------------------

  const statusCfg = STATUS_CONFIG[STATUSES.find((s) => s.id === pipelineStatus)?.label ?? ''];

  return (
    <div className="flex h-full w-full flex-col min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background z-10">
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Create Creator</h2>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Name */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="panel-first-name" className="text-xs">
              First Name <RequiredStar />
            </Label>
            <Input
              id="panel-first-name"
              placeholder="Jane"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              maxLength={50}
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="panel-last-name" className="text-xs">Last Name</Label>
            <Input
              id="panel-last-name"
              placeholder="Smith"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              maxLength={50}
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Email + Phone */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="panel-email" className="text-xs">Email</Label>
            <Input
              id="panel-email"
              type="email"
              placeholder="jane@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="panel-phone" className="text-xs">Phone</Label>
            <Input
              id="panel-phone"
              placeholder="+44 7123 456789"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={20}
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Status */}
        <div className="space-y-1">
          <Label htmlFor="panel-pipeline-status" className="text-xs">Status</Label>
          <Select
            id="panel-pipeline-status"
            value={pipelineStatus}
            onChange={(e) => setPipelineStatus(e.target.value as StatusId)}
            disabled={isSubmitting}
            className="text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          {statusCfg && (
            <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium mt-1 ${statusCfg.bg} ${statusCfg.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot} flex-shrink-0`} />
              {STATUSES.find((s) => s.id === pipelineStatus)?.label}
            </div>
          )}
        </div>

        {/* Job */}
        <div className="space-y-1">
          <Label htmlFor="panel-job" className="text-xs">Job</Label>
          <Select
            id="panel-job"
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            disabled={isSubmitting}
            className="text-sm"
          >
            <option value="">No job</option>
            {brandJobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.job_title}
              </option>
            ))}
          </Select>
        </div>

        {/* 8x Brand Accounts — TikTok & IG */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="panel-brand-tiktok" className="text-xs flex items-center gap-1">
              <TikTokIcon className="h-3 w-3" /> Branded TikTok
            </Label>
            <Input
              id="panel-brand-tiktok"
              placeholder="@brand8x"
              value={brandTiktok}
              onChange={(e) => setBrandTiktok(e.target.value)}
              maxLength={200}
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="panel-brand-instagram" className="text-xs flex items-center gap-1">
              <InstagramIcon className="h-3 w-3" /> Branded IG
            </Label>
            <Input
              id="panel-brand-instagram"
              placeholder="@brand8x"
              value={brandInstagram}
              onChange={(e) => setBrandInstagram(e.target.value)}
              maxLength={200}
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Base Pay + Country */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="panel-base-pay" className="text-xs">Base Pay</Label>
            <Input
              id="panel-base-pay"
              type="number"
              placeholder="0"
              value={basePay}
              onChange={(e) => setBasePay(e.target.value)}
              min={0}
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="panel-country" className="text-xs">Country</Label>
            <Select
              id="panel-country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              disabled={isSubmitting}
              className="text-sm"
            >
              <option value="">Select</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Collapsible extras */}
        <Collapsible open={showMore} onOpenChange={setShowMore}>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-1">
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMore ? 'rotate-180' : ''}`} />
            Personal Handles & Notes
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-2">
            {/* Personal social handles */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="panel-tiktok" className="text-xs flex items-center gap-1">
                  <TikTokIcon className="h-3 w-3" /> Personal TikTok
                </Label>
                <Input
                  id="panel-tiktok"
                  placeholder="@username"
                  value={tiktokUsername}
                  onChange={(e) => setTiktokUsername(e.target.value)}
                  maxLength={100}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="panel-instagram" className="text-xs flex items-center gap-1">
                  <InstagramIcon className="h-3 w-3" /> Personal IG
                </Label>
                <Input
                  id="panel-instagram"
                  placeholder="@username"
                  value={instagramUsername}
                  onChange={(e) => setInstagramUsername(e.target.value)}
                  maxLength={100}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label htmlFor="panel-notes" className="text-xs">Notes</Label>
              <Textarea
                id="panel-notes"
                placeholder="Internal notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                disabled={isSubmitting}
                rows={2}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Button
          type="submit"
          disabled={isSubmitting || !firstName.trim()}
          className="w-full"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <UserPlus className="mr-2 h-4 w-4" />
              Create Creator
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
