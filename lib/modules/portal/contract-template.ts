export const CONTRACT_VERSION = "2.6"

export const MINIMUM_CONTRACT_VERSION = "2.3"

function parseVersion(v: string): [number, number] | null {
  const m = /^(\d+)\.(\d+)(?:\.\d+)?$/.exec(v)
  if (!m) return null
  return [Number(m[1]), Number(m[2])]
}

export function hasSignedMinimumContract(
  contractVersion: string | null | undefined,
): boolean {
  if (!contractVersion) return false
  const signed = parseVersion(contractVersion)
  const minimum = parseVersion(MINIMUM_CONTRACT_VERSION)
  if (!signed || !minimum) return false
  const [sMaj, sMin] = signed
  const [mMaj, mMin] = minimum
  if (sMaj !== mMaj) return sMaj > mMaj
  return sMin >= mMin
}

export interface ContractParams {
  brandName: string
  currency: string
  baseFee?: number | null
  monthlyPayoutCap?: number | null
}

export interface ContractClause {
  title: string
  paragraphs: string[]
}

export function getContractClauses(params: ContractParams): ContractClause[] {
  const { brandName, currency, baseFee, monthlyPayoutCap } = params
  const cur = currency.toUpperCase()
  const feeDisplay =
    baseFee != null && baseFee > 0
      ? `a base rate of ${cur} ${baseFee}`
      : "the base rate listed in the Creator Brief, as agreed upon by the campaign manager"

  const monthlyCapParagraph =
    monthlyPayoutCap != null && monthlyPayoutCap > 0
      ? `Creator's aggregate monthly compensation under this agreement shall not exceed ${cur} ${monthlyPayoutCap}. Any approved earnings accrued in excess of such monthly limit shall carry forward to the following calendar month and shall be disbursed in accordance with the same cap, provided Creator continues to deliver content pursuant to this agreement. For the avoidance of doubt, carryover balances shall remain payable and shall not be forfeited so long as Creator remains in compliance with the terms hereof.`
      : "Creator's aggregate monthly compensation under this agreement may be subject to a monthly payout limit as communicated by 8x Social. Any approved earnings accrued in excess of such monthly limit shall carry forward to the following calendar month and shall be disbursed in accordance with the same cap, provided Creator continues to deliver content pursuant to this agreement. For the avoidance of doubt, carryover balances shall remain payable and shall not be forfeited so long as Creator remains in compliance with the terms hereof."

  return [
    {
      title: "1. Scope of Work",
      paragraphs: [
        `Creator agrees to produce original short-form video content for ${brandName} ("Brand") in accordance with the Creator Brief provided by 8x Social, Inc. ("Company"). Content must follow the guidelines, formats, and messaging outlined in the brief.`,
        "Creator will post approved content to the designated social media accounts as directed by 8x Social, including reposting to additional platforms (e.g., Instagram Reels, YouTube Shorts) when specified in the Creator Brief. All posting schedules and platform requirements will be communicated in advance.",
        "Creator acknowledges that campaign accounts are dedicated to a single brand and will only post content as directed by 8x Social. Content produced for one brand may not be repurposed, reused, or reposted for any other brand or client.",
      ],
    },
    {
      title: "2. Compensation",
      paragraphs: [
        `Creator will receive ${feeDisplay} per approved video. This rate covers the original video post and any required reposts to additional platforms (e.g., Instagram Reels) as directed by 8x Social. The rate may be adjusted based on performance, quality, and account metrics as described in Section 5.`,
        "Payment is contingent upon video acceptance by 8x Social or the Brand. Videos that are rejected, require revision, or do not meet the standards outlined in the Creator Brief shall not be eligible for compensation until they are resubmitted and approved. For the avoidance of doubt, no payment shall be due for any video that has not been explicitly accepted.",
        "Payment for each video is further contingent upon the following conditions being met: (a) Creator must enable a TikTok Spark Ads code for each TikTok video within 48 hours of posting and maintain the authorization for a minimum of 365 days; and (b) the video must not be subject to a shadowban or other platform restriction that materially suppresses its distribution. Videos posted from accounts that are shadowbanned, restricted, or otherwise penalized by the platform may be deemed ineligible for compensation at 8x Social's sole discretion. If Creator suspects their account may be subject to such restrictions, Creator should promptly contact the 8x Social team to discuss next steps and resolve the issue before continuing to post.",
        "Additional performance bonuses may be available based on video view counts and engagement metrics, as outlined in the Creator Brief.",
        monthlyCapParagraph,
      ],
    },
    {
      title: "3. Payment Methods",
      paragraphs: [
        "Payments will be processed through PayPal, Venmo, the 8x Platform wallet, or any other suitable method as determined by 8x Social.",
        "Payment processing times may vary by method. 8x Social will communicate payment schedules and any applicable processing fees in advance.",
      ],
    },
    {
      title: "4. Content Delivery & Standards",
      paragraphs: [
        "Creator shall deliver all original video files (without watermark) to 8x Social upon request. Files must be in MP4 format at a minimum resolution of 1080p.",
        "If content does not meet the standards outlined in the Creator Brief or contains material errors (including but not limited to incorrect product references, competitor branding, or off-topic content), Creator agrees to reshoot and deliver corrected content within 48 hours of notification, at no additional cost, subject to 8x Social's right to treat the deviation as a material breach under the following paragraph. Off-brief content shall not be eligible for compensation under Section 2 unless and until corrected and re-approved.",
        "Material deviation from the Creator Brief — including but not limited to posting content that includes incorrect product references, competitor branding, off-topic content, prohibited claims, or content that has not been approved by 8x Social where approval is required by the Creator Brief — constitutes a material breach of this agreement and shall result in automatic termination of this agreement, effective immediately and without further notice. 8x Social may, in its sole discretion, elect to waive automatic termination and instead require Creator to cure the breach via reshoot under the preceding paragraph; any such waiver shall not be deemed a waiver of 8x Social's right to terminate for any subsequent material deviation. Termination under this clause does not relieve Creator of obligations that survive termination under Section 14, and pending payments for content already accepted prior to the deviation shall still be processed.",
        "Creator agrees to meet the posting cadence outlined in the Creator Brief. Consistent failure to meet posting schedules may result in rate adjustment or termination of this agreement.",
      ],
    },
    {
      title: "5. Performance Adjustments",
      paragraphs: [
        "Base compensation rates are subject to review and adjustment every 3\u20135 videos. Adjustments will be based on content quality, posting consistency, engagement metrics, and account health.",
        "8x Social will provide feedback and communicate any rate changes before they take effect. Creators who consistently meet or exceed quality standards may receive rate increases.",
      ],
    },
    {
      title: "6. Content Ownership & Intellectual Property",
      paragraphs: [
        "Upon delivery and payment, Creator irrevocably assigns to 8x Social all rights, title, and interest in and to all content produced under this agreement, including all intellectual property rights therein. This assignment is worldwide and perpetual.",
        "8x Social shall have the unrestricted right to use, reproduce, modify, distribute, display, sublicense, and otherwise exploit the content in any medium and for any purpose, including but not limited to organic social media, paid advertising campaigns, website and email marketing, and any other commercial use. 8x Social may transfer or sublicense these rights to its clients, successors, and assigns.",
        "Creator agrees to provide any platform-specific advertising authorizations requested by 8x Social within 48 hours of request. This includes but is not limited to TikTok Spark Ads codes, Meta whitelisting permissions, and any similar platform feature that enables paid promotion of Creator's content. All such authorizations shall be granted for a minimum period of 365 days from the date of issue.",
        "Creator waives any moral rights in the content to the fullest extent permitted by applicable law.",
      ],
    },
    {
      title: "7. Creator Warranties",
      paragraphs: [
        "Creator warrants and represents that: (a) all content produced under this agreement is original and does not infringe the intellectual property rights, privacy rights, or any other rights of any third party; (b) the content does not include unlicensed third-party intellectual property, including but not limited to music, images, fonts, sound effects, or video clips; (c) Creator has obtained all necessary appearance, location, and other consents required for the content; (d) the content does not contain any defamatory, obscene, or unlawful material.",
        "Creator is solely responsible for compliance with all applicable advertising disclosure laws and regulations, including but not limited to the U.S. Federal Trade Commission (FTC) guidelines, the UK Advertising Standards Authority (ASA) rules, and any equivalent regulations in Creator's jurisdiction. Creator shall include all required sponsorship disclosures and labels on content as required by applicable law and platform policies.",
        "Creator represents and warrants that they are at least 18 years of age (or the age of majority in their jurisdiction) and have full legal capacity to enter into and perform this agreement. If Creator is under 18, this agreement must be co-signed by a parent or legal guardian who agrees to be bound by these terms.",
      ],
    },
    {
      title: "8. Indemnification",
      paragraphs: [
        "Creator shall indemnify, defend, and hold harmless 8x Social, its clients, officers, directors, employees, and agents from and against any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable legal fees) arising out of or related to: (a) any breach of the warranties in Section 7; (b) any claim that the content infringes or misappropriates any third-party intellectual property or other rights; (c) Creator's failure to comply with applicable advertising disclosure laws or regulations; (d) any other breach of this agreement by Creator.",
      ],
    },
    {
      title: "9. Content Removal",
      paragraphs: [
        "Creator agrees to remove or disable any content from their accounts within 24 hours of written request from 8x Social. Requests may be made for any reason, including but not limited to brand safety, legal concerns, or reputational risk.",
        "Failure to remove content within the specified timeframe constitutes a material breach of this agreement.",
      ],
    },
    {
      title: "10. Account Ownership & Content Continuity",
      paragraphs: [
        "Creator owns and manages their social media accounts used for campaign content. Creator acknowledges that all content posted to campaign accounts is subject to the intellectual property assignment in Section 6, regardless of account ownership.",
        "Upon termination of this agreement, Creator agrees to keep existing campaign content live on their accounts for a minimum of 90 days unless otherwise directed by 8x Social.",
      ],
    },
    {
      title: "11. Exclusivity",
      paragraphs: [
        `During the term of this agreement, Creator shall not produce, post, or distribute content for any direct competitor of ${brandName} on any platform, unless expressly authorized in writing by 8x Social.`,
        "Campaign accounts used for this agreement are dedicated exclusively to the assigned brand. Creator will not post unrelated, personal, or third-party content on campaign accounts without prior written approval from 8x Social.",
      ],
    },
    {
      title: "12. Non-Solicitation",
      paragraphs: [
        `During this agreement and for a period of 12 months following termination, Creator shall not directly or indirectly solicit, accept, or perform work for any brand or client introduced to Creator through 8x Social, except through 8x Social.`,
        "Breach of this clause entitles 8x Social to a fee of USD 5,000 per violation, in addition to any other remedies available at law or in equity.",
      ],
    },
    {
      title: "13. Confidentiality",
      paragraphs: [
        `Creator agrees to treat all non-public information received from 8x Social and ${brandName} as strictly confidential. This includes but is not limited to: creative briefs, campaign strategies, compensation structures, performance data, internal communications, product information, product roadmaps, unreleased features, pricing, beta or pre-release access, and any information about the Brand's business operations.`,
        "Creator shall not disclose confidential information to any third party without prior written consent from 8x Social. This obligation survives termination of this agreement.",
      ],
    },
    {
      title: "14. Duration & Termination",
      paragraphs: [
        "This agreement remains in effect until terminated by either party. Either Creator or 8x Social may terminate this agreement at any time by providing written notice. Notwithstanding the foregoing, this agreement is subject to automatic termination without notice for material brief deviation as set forth in Section 4.",
        "Upon termination: (a) any pending payments for completed and approved content will still be processed; (b) the intellectual property assignment in Section 6 survives termination and remains in full effect; (c) the content continuity obligation in Section 10 survives termination; (d) the non-solicitation obligation in Section 12 survives termination for the specified period; (e) the confidentiality obligation in Section 13 survives termination; (f) the indemnification obligation in Section 8 survives termination.",
      ],
    },
    {
      title: "15. Limitation of Liability",
      paragraphs: [
        "To the maximum extent permitted by applicable law, 8x Social's total liability to Creator under or in connection with this agreement shall not exceed the total compensation paid to Creator in the 3 months preceding the event giving rise to the claim.",
        "In no event shall 8x Social be liable for any indirect, incidental, special, consequential, or punitive damages, regardless of the cause of action or the theory of liability.",
      ],
    },
    {
      title: "16. Dispute Resolution",
      paragraphs: [
        "In the event of any dispute arising out of or relating to this agreement, the parties agree to first attempt resolution through good-faith mediation. If mediation fails to resolve the dispute within 30 days, either party may pursue any available legal remedies.",
      ],
    },
    {
      title: "17. Governing Law",
      paragraphs: [
        "This Agreement is governed by and construed in accordance with the laws of the State of Delaware, USA, without regard to its conflict of laws principles.",
      ],
    },
    {
      title: "18. Updates to Terms",
      paragraphs: [
        "8x Social may update the terms of this agreement by providing Creator with 14 days' written notice. Continued posting of content after the notice period constitutes acceptance of the updated terms. If Creator does not agree to the updated terms, Creator may terminate this agreement in accordance with Section 14.",
      ],
    },
  ]
}
