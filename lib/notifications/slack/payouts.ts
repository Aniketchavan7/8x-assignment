import { sendSlackMessage, type SlackBlock } from './client';
import { SLACK_CHANNELS } from './channels';

function formatTimestamp(): string {
  return new Date().toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' });
}

export async function notifyPayoutTriggered(params: {
  adminEmail: string;
  creatorName: string;
  amount: number;
  currency: string;
  type: 'payout' | 'add_funds' | 'bonus';
  method?: string;
  description?: string;
}): Promise<void> {
  const { adminEmail, creatorName, amount, currency, type, method, description } = params;

  const formattedAmount = (amount / 100).toFixed(2);
  const emoji = type === 'payout' ? ':money_with_wings:' : type === 'bonus' ? ':gift:' : ':heavy_plus_sign:';
  const timestamp = formatTimestamp();

  const headerText = type === 'payout'
    ? `Payout to ${creatorName} — ${formattedAmount} ${currency.toUpperCase()}`
    : type === 'bonus'
    ? `Bonus to ${creatorName} — ${formattedAmount} ${currency.toUpperCase()}`
    : `Add Funds to ${creatorName} — ${formattedAmount} ${currency.toUpperCase()}`;

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: headerText,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Creator:*\n${creatorName}` },
        { type: 'mrkdwn', text: `*Amount:*\n${formattedAmount} ${currency.toUpperCase()}` },
        { type: 'mrkdwn', text: `*Admin:*\n${adminEmail}` },
        ...(method ? [{ type: 'mrkdwn' as const, text: `*Method:*\n${method}` }] : []),
        ...(description ? [{ type: 'mrkdwn' as const, text: `*Description:*\n${description}` }] : []),
      ],
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `${emoji} ${timestamp}` },
      ],
    },
  ];

  await sendSlackMessage({
    text: `${headerText} — by ${adminEmail}${description ? ` (${description})` : ''}`,
    blocks,
    channelId: SLACK_CHANNELS.PAYMENTS,
  });
}

export async function notifyPostPaymentProcessed(params: {
  adminEmail: string;
  postCount: number;
  totalAmount: number;
  method: 'stripe' | 'offplatform' | 'advance';
  offplatformMethod?: string;
  creatorSummary: string;
}): Promise<void> {
  const { adminEmail, postCount, totalAmount, method, offplatformMethod, creatorSummary } = params;

  const formattedAmount = (totalAmount / 100).toFixed(2);
  const methodLabel = method === 'offplatform'
    ? `Off-Platform (${offplatformMethod || 'unknown'})`
    : method === 'advance' ? 'Advance Applied' : 'Stripe Transfer';
  const emoji = method === 'offplatform' ? ':pencil:' : method === 'advance' ? ':fast_forward:' : ':credit_card:';

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'Post Payment Processed',
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Admin:*\n${adminEmail}` },
        { type: 'mrkdwn', text: `*Posts:*\n${postCount}` },
        { type: 'mrkdwn', text: `*Total:*\n${formattedAmount} USD` },
        { type: 'mrkdwn', text: `*Method:*\n${methodLabel}` },
      ],
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Creators:*\n${creatorSummary}` },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `${emoji} ${formatTimestamp()}` },
      ],
    },
  ];

  await sendSlackMessage({
    text: `Post Payment: ${adminEmail} processed ${postCount} posts (${formattedAmount} USD) via ${methodLabel}`,
    blocks,
    channelId: SLACK_CHANNELS.PAYMENTS,
  });
}

export async function notifyAdvanceBalanceUpdated(params: {
  adminEmail: string;
  creatorName: string;
  brandName: string;
  previousAmount: number;
  newAmount: number;
}): Promise<void> {
  const { adminEmail, creatorName, brandName, previousAmount, newAmount } = params;

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'Advance Balance Updated',
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Admin:*\n${adminEmail}` },
        { type: 'mrkdwn', text: `*Creator:*\n${creatorName}` },
        { type: 'mrkdwn', text: `*Brand:*\n${brandName}` },
        { type: 'mrkdwn', text: `*Balance:*\n${(previousAmount / 100).toFixed(2)} → ${(newAmount / 100).toFixed(2)} USD` },
      ],
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `:bank: ${formatTimestamp()}` },
      ],
    },
  ];

  await sendSlackMessage({
    text: `Advance: ${adminEmail} set ${creatorName} (${brandName}) advance to ${(newAmount / 100).toFixed(2)} USD`,
    blocks,
    channelId: SLACK_CHANNELS.PAYMENTS,
  });
}

export async function notifyContractOverridePayout(params: {
  adminEmail: string;
  creatorName: string;
  managedCreatorId: string;
  contractVersion: string | null;
  minimumVersion: string;
  postCount: number;
  amountCents: number;
}): Promise<void> {
  const {
    adminEmail,
    creatorName,
    managedCreatorId,
    contractVersion,
    minimumVersion,
    postCount,
    amountCents,
  } = params;

  const formattedAmount = (amountCents / 100).toFixed(2);
  const contractLabel = contractVersion ? `v${contractVersion}` : 'never signed';

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Contract override payout', emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Admin:*\n${adminEmail}` },
        { type: 'mrkdwn', text: `*Creator:*\n${creatorName} (${managedCreatorId})` },
        { type: 'mrkdwn', text: `*Contract:*\n${contractLabel} (minimum: v${minimumVersion})` },
        { type: 'mrkdwn', text: `*Posts paid:*\n${postCount}` },
        { type: 'mrkdwn', text: `*Amount:*\n${formattedAmount} USD` },
      ],
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `:warning: Override — ${formatTimestamp()}` }],
    },
  ];

  await sendSlackMessage({
    text: `⚠️ Contract override: ${adminEmail} paid ${creatorName} ${formattedAmount} USD (${contractLabel}, min v${minimumVersion})`,
    blocks,
    channelId: SLACK_CHANNELS.PAYMENTS,
  });
}

export async function notifyDisclosureOverridePayout(params: {
  adminEmail: string;
  creatorName: string;
  managedCreatorPostId: string;
  postUrl: string;
  platform: string;
  amountCents: number;
}): Promise<void> {
  const { adminEmail, creatorName, managedCreatorPostId, postUrl, platform, amountCents } = params;

  const formattedAmount = (amountCents / 100).toFixed(2);

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Disclosure override payout', emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Admin:*\n${adminEmail}` },
        { type: 'mrkdwn', text: `*Creator:*\n${creatorName}` },
        { type: 'mrkdwn', text: `*Platform:*\n${platform}` },
        { type: 'mrkdwn', text: `*Post:*\n<${postUrl}|View post>` },
        { type: 'mrkdwn', text: `*Amount:*\n${formattedAmount} USD` },
        { type: 'mrkdwn', text: `*MCP ID:*\n${managedCreatorPostId}` },
      ],
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `:warning: Override — ${formatTimestamp()}` }],
    },
  ];

  await sendSlackMessage({
    text: `⚠️ Disclosure override: ${adminEmail} paid ${creatorName} ${formattedAmount} USD without #ad on ${platform}`,
    blocks,
    channelId: SLACK_CHANNELS.PAYMENTS,
  });
}

export async function notifyAccountRestricted(params: {
  creatorName: string;
  stripeAccountId: string;
  disabledReason: string;
  currentlyDue: string[];
}): Promise<void> {
  const { creatorName, stripeAccountId, disabledReason, currentlyDue } = params;

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'Stripe Account Restricted',
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Creator:*\n${creatorName}` },
        { type: 'mrkdwn', text: `*Account:*\n${stripeAccountId}` },
        { type: 'mrkdwn', text: `*Reason:*\n${disabledReason}` },
        ...(currentlyDue.length > 0
          ? [{ type: 'mrkdwn' as const, text: `*Due:*\n${currentlyDue.join(', ')}` }]
          : []),
      ],
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `:warning: Payouts disabled — ${formatTimestamp()}` },
      ],
    },
  ];

  await sendSlackMessage({
    text: `Stripe account restricted: ${creatorName} (${stripeAccountId}) — ${disabledReason}`,
    blocks,
    channelId: SLACK_CHANNELS.PAYMENTS,
  });
}
