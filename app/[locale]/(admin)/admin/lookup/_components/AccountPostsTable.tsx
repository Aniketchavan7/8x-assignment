'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';

interface PostRow {
  id: string;
  platform: string;
  post_url: string;
  posted_at: string;
  latest_views: number | null;
  thumbnail_url: string | null;
  ad_code: string | null;
}

interface Props {
  posts: PostRow[];
}

export function AccountPostsTable({ posts }: Props) {
  const [drawerPostId, setDrawerPostId] = useState<string | null>(null);

  if (posts.length === 0) {
    return <p className="text-sm text-muted-foreground">No posts.</p>;
  }

  return (
    <>
      <div className="overflow-hidden rounded border">
        <table className="w-full text-xs">
          <thead className="bg-muted">
            <tr>
              <th className="w-16 px-2 py-1.5 text-left font-medium">Thumb</th>
              <th className="px-2 py-1.5 text-left font-medium">Posted</th>
              <th className="px-2 py-1.5 text-left font-medium">Platform</th>
              <th className="px-2 py-1.5 text-left font-medium">Ad code</th>
              <th className="px-2 py-1.5 text-right font-medium">Views</th>
              <th className="px-2 py-1.5 text-left font-medium">URL</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {posts.map((p) => (
              <tr
                key={p.id}
                className="cursor-pointer bg-background hover:bg-accent/50"
                onClick={() => setDrawerPostId(p.id)}
              >
                <td className="px-2 py-1">
                  {p.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.thumbnail_url}
                      alt=""
                      className="h-12 w-9 rounded object-cover"
                    />
                  ) : (
                    <div className="h-12 w-9 rounded bg-muted" />
                  )}
                </td>
                <td className="px-2 py-1 font-mono whitespace-nowrap">
                  {fmtDate(p.posted_at)}
                </td>
                <td className="px-2 py-1">
                  <Badge variant="outline" className="text-[10px]">
                    {p.platform}
                  </Badge>
                </td>
                <td className="px-2 py-1 font-mono">{p.ad_code ?? '—'}</td>
                <td className="px-2 py-1 text-right tabular-nums">
                  {p.latest_views?.toLocaleString() ?? '—'}
                </td>
                <td className="px-2 py-1">
                  <a
                    href={p.post_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    <span className="max-w-[20ch] truncate">{p.post_url}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet
        open={drawerPostId !== null}
        onOpenChange={(open) => {
          if (!open) setDrawerPostId(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full max-w-3xl overflow-hidden p-0 sm:max-w-3xl"
        >
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle className="text-sm">Post details</SheetTitle>
          </SheetHeader>
          {drawerPostId && (
            <iframe
              src={`/admin/lookup/post/${drawerPostId}?embed=1`}
              className="h-[calc(100vh-3rem)] w-full"
              title="Post details"
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}
