'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Search, UserPlus, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { BrandJob } from '@/lib/types/admin-brand-creators';

interface AddExistingCreatorPanelProps {
  brandId: string;
  brandJobs: BrandJob[];
  onSuccess?: () => void;
}

interface SearchCreator {
  id: string;
  display_name: string | null;
  profile_picture: string | null;
  location: string | null;
  user_id: string | null;
}

export function AddExistingCreatorPanel({
  brandId,
  brandJobs,
  onSuccess,
}: AddExistingCreatorPanelProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchCreator[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCreator, setSelectedCreator] = useState<SearchCreator | null>(null);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/admin/creators?search=${encodeURIComponent(searchQuery.trim())}&limit=20`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(
            (data.data || []).map((c: any) => ({
              id: c.id,
              display_name: c.display_name,
              profile_picture: c.profile_picture,
              location: c.location,
              user_id: c.user_id,
            }))
          );
        }
      } catch {
        // silently fail
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const handleAssign = async () => {
    if (!selectedCreator || !selectedJobId) return;

    setIsAssigning(true);
    try {
      const response = await fetch(`/api/admin/creators/${selectedCreator.id}/assign-job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: selectedJobId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to assign creator');
      }

      toast({
        title: 'Creator assigned',
        description: `${selectedCreator.display_name || 'Creator'} has been assigned to the job`,
      });
      onSuccess?.();
      setSearchQuery('');
      setSearchResults([]);
      setSelectedCreator(null);
      setSelectedJobId('');
    } catch (error) {
      toast({
        title: 'Failed to assign',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Search */}
      <div className="space-y-2">
        <Label>Search Creators</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Selected creator */}
      {selectedCreator && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-primary bg-primary/5">
          <Avatar className="h-8 w-8">
            <AvatarImage src={selectedCreator.profile_picture || undefined} />
            <AvatarFallback className="text-xs">
              {(selectedCreator.display_name || '?')[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">
              {selectedCreator.display_name || 'Unknown'}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {selectedCreator.location || 'No location'}
            </p>
          </div>
          <Check className="h-4 w-4 text-primary flex-shrink-0" />
        </div>
      )}

      {/* Search results */}
      {!selectedCreator && (
        <div className="border rounded-lg min-h-[120px] max-h-[240px] overflow-y-auto">
          {isSearching ? (
            <div className="flex items-center justify-center h-[120px]">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : searchResults.length === 0 ? (
            <div className="flex items-center justify-center h-[120px] text-sm text-muted-foreground">
              {searchQuery.trim().length < 2
                ? 'Type at least 2 characters to search'
                : 'No creators found'}
            </div>
          ) : (
            <div className="divide-y">
              {searchResults.map((creator) => (
                <button
                  key={creator.id}
                  type="button"
                  onClick={() => setSelectedCreator(creator)}
                  className="w-full p-3 text-left hover:bg-muted/50 transition-colors flex items-center gap-3"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={creator.profile_picture || undefined} />
                    <AvatarFallback className="text-xs">
                      {(creator.display_name || '?')[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {creator.display_name || 'Unknown'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {creator.location || 'No location'}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs flex-shrink-0">
                    {creator.user_id ? 'Claimed' : 'Unclaimed'}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Job selection */}
      {selectedCreator && (
        <div className="space-y-2">
          <Label htmlFor="assign-job-panel">Assign to Job</Label>
          <Select
            id="assign-job-panel"
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            disabled={isAssigning}
          >
            <option value="">Select a job...</option>
            {brandJobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.job_title} ({job.job_type}) - {job.status}
              </option>
            ))}
          </Select>
        </div>
      )}

      {/* Actions */}
      {selectedCreator && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedCreator(null);
              setSelectedJobId('');
            }}
            disabled={isAssigning}
          >
            Clear
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleAssign}
            disabled={!selectedJobId || isAssigning}
          >
            {isAssigning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Assigning...
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                Assign to Job
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
