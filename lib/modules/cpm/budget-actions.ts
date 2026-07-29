'use server';

import { z } from 'zod';
import { createAuthenticatedSupabaseClient } from '@/lib/db/supabase';
import { validatedActionWithUser } from '@/lib/auth/middleware';
import { revalidatePath } from 'next/cache';
import { captureError } from '@/lib/analytics/capture-error';
import { ErrorCategories, ErrorSeverity } from '@/lib/analytics/events';
import { CPM_BUDGET } from './constants';

// =====================================================
// Types
// =====================================================

export interface CpmCampaignBudget {
  jobId: string;
  status: string;
  budgetCents: number;
  budgetSpentCents: number;
  remainingBudgetCents: number;
}

// =====================================================
// Get Campaign Budget
// =====================================================

const getCpmCampaignBudgetSchema = z.object({
  jobId: z.string().uuid(),
});

export type GetCpmCampaignBudgetResult =
  | { success: true; budget: CpmCampaignBudget }
  | { error: string };

export const getCpmCampaignBudget = validatedActionWithUser<
  typeof getCpmCampaignBudgetSchema,
  GetCpmCampaignBudgetResult
>(getCpmCampaignBudgetSchema, async (data, _, user) => {
  const supabase = await createAuthenticatedSupabaseClient();

  // Verify user is a brand member for this job's org
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('brand_organization_id')
    .eq('id', data.jobId)
    .single();

  if (jobError || !job) {
    return { error: 'Job not found' };
  }

  const { data: membership } = await supabase
    .from('brand_members')
    .select('id')
    .eq('brand_organization_id', job.brand_organization_id)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return { error: 'Unauthorized' };
  }

  // Call RPC function
  const { data: result, error } = await supabase.rpc('get_cpm_campaign_budget', {
    p_job_id: data.jobId,
  });

  if (error) {
    captureError(error, {
      category: ErrorCategories.DATABASE,
      operation: 'get_cpm_campaign_budget',
      userId: user.id,
      metadata: { jobId: data.jobId },
    });
    return { error: 'Failed to get campaign budget' };
  }

  const rpcResult = result as {
    success: boolean;
    error?: string;
    job_id?: string;
    status?: string;
    budget_cents?: number;
    budget_spent_cents?: number;
    remaining_budget_cents?: number;
  };

  if (!rpcResult.success) {
    return { error: rpcResult.error || 'Failed to get campaign budget' };
  }

  return {
    success: true,
    budget: {
      jobId: rpcResult.job_id!,
      status: rpcResult.status!,
      budgetCents: rpcResult.budget_cents!,
      budgetSpentCents: rpcResult.budget_spent_cents!,
      remainingBudgetCents: rpcResult.remaining_budget_cents!,
    },
  };
});

// =====================================================
// Fund Campaign
// =====================================================

const fundCpmCampaignSchema = z.object({
  jobId: z.string().uuid(),
  amountCents: z.coerce.number().int().positive(),
});

export type FundCpmCampaignResult =
  | {
      success: true;
      transactionId: string;
      newBudgetCents: number;
      newWalletBalanceCents: number;
    }
  | { error: string };

export const fundCpmCampaign = validatedActionWithUser<
  typeof fundCpmCampaignSchema,
  FundCpmCampaignResult
>(fundCpmCampaignSchema, async (data, _, user) => {
  const supabase = await createAuthenticatedSupabaseClient();

  // Verify user is a brand owner/admin for this job's org
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('brand_organization_id')
    .eq('id', data.jobId)
    .single();

  if (jobError || !job) {
    return { error: 'Job not found' };
  }

  const { data: membership } = await supabase
    .from('brand_members')
    .select('id, role')
    .eq('brand_organization_id', job.brand_organization_id)
    .eq('user_id', user.id)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.role || '')) {
    return { error: 'Only brand owners and admins can fund campaigns' };
  }

  // Call RPC function
  const { data: result, error } = await supabase.rpc('fund_cpm_campaign', {
    p_job_id: data.jobId,
    p_amount_cents: data.amountCents,
    p_user_id: user.id,
  });

  if (error) {
    captureError(error, {
      category: ErrorCategories.DATABASE,
      operation: 'fund_cpm_campaign',
      userId: user.id,
      severity: ErrorSeverity.ERROR,
      metadata: { jobId: data.jobId, amountCents: data.amountCents },
    });
    return { error: 'Failed to fund campaign' };
  }

  const rpcResult = result as {
    success: boolean;
    error?: string;
    transaction_id?: string;
    new_budget_cents?: number;
    new_wallet_balance_cents?: number;
  };

  if (!rpcResult.success) {
    return { error: rpcResult.error || 'Failed to fund campaign' };
  }

  revalidatePath('/dashboard/brand-cpm');
  revalidatePath('/dashboard/jobs');
  revalidatePath(`/dashboard/job/${data.jobId}`);

  return {
    success: true,
    transactionId: rpcResult.transaction_id!,
    newBudgetCents: rpcResult.new_budget_cents!,
    newWalletBalanceCents: rpcResult.new_wallet_balance_cents!,
  };
});

// =====================================================
// Withdraw Budget
// =====================================================

const withdrawCpmBudgetSchema = z.object({
  jobId: z.string().uuid(),
  amountCents: z.coerce.number().int().positive(),
});

export type WithdrawCpmBudgetResult =
  | {
      success: true;
      transactionId: string;
      newBudgetCents: number;
      newWalletBalanceCents: number;
      campaignDelisted: boolean;
      newStatus: string;
    }
  | { error: string };

export const withdrawCpmBudget = validatedActionWithUser<
  typeof withdrawCpmBudgetSchema,
  WithdrawCpmBudgetResult
>(withdrawCpmBudgetSchema, async (data, _, user) => {
  const supabase = await createAuthenticatedSupabaseClient();

  // Verify user is a brand owner/admin for this job's org
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('brand_organization_id')
    .eq('id', data.jobId)
    .single();

  if (jobError || !job) {
    return { error: 'Job not found' };
  }

  const { data: membership } = await supabase
    .from('brand_members')
    .select('id, role')
    .eq('brand_organization_id', job.brand_organization_id)
    .eq('user_id', user.id)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.role || '')) {
    return { error: 'Only brand owners and admins can withdraw campaign budget' };
  }

  // Call RPC function
  const { data: result, error } = await supabase.rpc('withdraw_cpm_campaign_budget', {
    p_job_id: data.jobId,
    p_amount_cents: data.amountCents,
    p_user_id: user.id,
  });

  if (error) {
    captureError(error, {
      category: ErrorCategories.DATABASE,
      operation: 'withdraw_cpm_campaign_budget',
      userId: user.id,
      severity: ErrorSeverity.ERROR,
      metadata: { jobId: data.jobId, amountCents: data.amountCents },
    });
    return { error: 'Failed to withdraw budget' };
  }

  const rpcResult = result as {
    success: boolean;
    error?: string;
    transaction_id?: string;
    new_budget_cents?: number;
    new_wallet_balance_cents?: number;
    campaign_delisted?: boolean;
    new_status?: string;
  };

  if (!rpcResult.success) {
    return { error: rpcResult.error || 'Failed to withdraw budget' };
  }

  revalidatePath('/dashboard/brand-cpm');
  revalidatePath('/dashboard/jobs');
  revalidatePath(`/dashboard/job/${data.jobId}`);

  return {
    success: true,
    transactionId: rpcResult.transaction_id!,
    newBudgetCents: rpcResult.new_budget_cents!,
    newWalletBalanceCents: rpcResult.new_wallet_balance_cents!,
    campaignDelisted: rpcResult.campaign_delisted || false,
    newStatus: rpcResult.new_status || 'open',
  };
});

// =====================================================
// Publish Campaign
// =====================================================

const publishCpmCampaignSchema = z.object({
  jobId: z.string().uuid(),
});

export type PublishCpmCampaignResult =
  | { success: true; newStatus: string }
  | { error: string; currentBudgetCents?: number; requiredBudgetCents?: number };

export const publishCpmCampaign = validatedActionWithUser<
  typeof publishCpmCampaignSchema,
  PublishCpmCampaignResult
>(publishCpmCampaignSchema, async (data, _, user) => {
  const supabase = await createAuthenticatedSupabaseClient();

  // Verify user is a brand owner/admin for this job's org
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('brand_organization_id')
    .eq('id', data.jobId)
    .single();

  if (jobError || !job) {
    return { error: 'Job not found' };
  }

  const { data: membership } = await supabase
    .from('brand_members')
    .select('id, role')
    .eq('brand_organization_id', job.brand_organization_id)
    .eq('user_id', user.id)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.role || '')) {
    return { error: 'Only brand owners and admins can publish campaigns' };
  }

  // Call RPC function
  const { data: result, error } = await supabase.rpc('publish_funded_campaign', {
    p_job_id: data.jobId,
    p_user_id: user.id,
  });

  if (error) {
    captureError(error, {
      category: ErrorCategories.DATABASE,
      operation: 'publish_funded_campaign',
      userId: user.id,
      severity: ErrorSeverity.ERROR,
      metadata: { jobId: data.jobId },
    });
    return { error: 'Failed to publish campaign' };
  }

  const rpcResult = result as {
    success: boolean;
    error?: string;
    new_status?: string;
    current_budget_cents?: number;
    required_budget_cents?: number;
  };

  if (!rpcResult.success) {
    return {
      error: rpcResult.error || 'Failed to publish campaign',
      currentBudgetCents: rpcResult.current_budget_cents,
      requiredBudgetCents: rpcResult.required_budget_cents,
    };
  }

  revalidatePath('/dashboard/brand-cpm');
  revalidatePath('/dashboard/jobs');
  revalidatePath('/dashboard/find');
  revalidatePath(`/dashboard/job/${data.jobId}`);

  return {
    success: true,
    newStatus: rpcResult.new_status || 'open',
  };
});

// =====================================================
// Unpublish Campaign
// =====================================================

const unpublishCpmCampaignSchema = z.object({
  jobId: z.string().uuid(),
});

export type UnpublishCpmCampaignResult =
  | { success: true; newStatus: string }
  | { error: string };

export const unpublishCpmCampaign = validatedActionWithUser<
  typeof unpublishCpmCampaignSchema,
  UnpublishCpmCampaignResult
>(unpublishCpmCampaignSchema, async (data, _, user) => {
  const supabase = await createAuthenticatedSupabaseClient();

  // Verify user is a brand owner/admin for this job's org
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('brand_organization_id')
    .eq('id', data.jobId)
    .single();

  if (jobError || !job) {
    return { error: 'Job not found' };
  }

  const { data: membership } = await supabase
    .from('brand_members')
    .select('id, role')
    .eq('brand_organization_id', job.brand_organization_id)
    .eq('user_id', user.id)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.role || '')) {
    return { error: 'Only brand owners and admins can unpublish campaigns' };
  }

  // Call RPC function
  const { data: result, error } = await supabase.rpc('unpublish_cpm_campaign', {
    p_job_id: data.jobId,
    p_user_id: user.id,
  });

  if (error) {
    captureError(error, {
      category: ErrorCategories.DATABASE,
      operation: 'unpublish_cpm_campaign',
      userId: user.id,
      severity: ErrorSeverity.ERROR,
      metadata: { jobId: data.jobId },
    });
    return { error: 'Failed to unpublish campaign' };
  }

  const rpcResult = result as {
    success: boolean;
    error?: string;
    new_status?: string;
  };

  if (!rpcResult.success) {
    return { error: rpcResult.error || 'Failed to unpublish campaign' };
  }

  revalidatePath('/dashboard/brand-cpm');
  revalidatePath('/dashboard/jobs');
  revalidatePath('/dashboard/find');
  revalidatePath(`/dashboard/job/${data.jobId}`);

  return {
    success: true,
    newStatus: rpcResult.new_status || 'pending_funding',
  };
});

