import React from 'react';

const STATUS_STYLES = {
  verified: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  partially_verified: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  unverified: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  disputed: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  flagged: 'bg-rose-500/20 text-rose-300 border-rose-500/40',

  discovered: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  generating: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30 animate-pulse',
  video_ready: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',

  pending: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  processing: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 animate-pulse',
  awaiting_approval: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  approved: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  rejected: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  publishing: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  published: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
  scheduled: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  completed: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  failed: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
};

const LABELS = {
  verified: 'Verified Explainer',
  partially_verified: 'Partially Verified',
  unverified: 'Unverified',
  disputed: 'Disputed',
  flagged: 'Unverified / Blocked',
  discovered: 'Ready to Explain',
  generating: 'Creating 45s Explainer...',
  video_ready: '45s Video Ready',
  pending: 'Queued',
  processing: 'Rendering 45s Video...',
  awaiting_approval: 'Ready for Review',
  approved: 'Approved',
  rejected: 'Rejected',
  publishing: 'Publishing',
  published: 'Published',
  scheduled: 'Scheduled',
  completed: 'Done',
  failed: 'Needs Retry',
};

export const CATEGORY_LABELS = {
  delhi_civic: 'Polity, Law & Civic Terms',
  tech_auto: 'AI, CS & Tech Terms',
  entertainment: 'Mobile Features & Gadgets',
  sports_viral: 'Govt Exams (SSC CGL, UPSC)',
  business_facts: 'Money, RBI & Banking Terms',
  bollywood_celeb: 'Everyday Science & Systems',
};

const VALID_EXPRESSION_FILES = new Set([
  'speaking',
  'explaining',
  'serious',
  'confident',
  'surprised',
  'questioning',
  'smile',
  'neutral',
]);

const EXPRESSION_FALLBACK_MAP = {
  curious: 'questioning',
  excited: 'surprised',
  happy: 'smile',
  warm: 'smile',
  analytical: 'explaining',
};

export function getSafeExpressionImage(expression) {
  const key = String(expression || 'explaining').toLowerCase().trim();
  if (VALID_EXPRESSION_FILES.has(key)) {
    return `/assets/presenter/expressions/${key}.jpg`;
  }
  const mapped = EXPRESSION_FALLBACK_MAP[key] || 'explaining';
  return `/assets/presenter/expressions/${mapped}.jpg`;
}

export function normalizeExpressionId(expression) {
  const key = String(expression || 'explaining').toLowerCase().trim();
  if (VALID_EXPRESSION_FILES.has(key)) return key;
  return EXPRESSION_FALLBACK_MAP[key] || 'explaining';
}

export function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || 'bg-slate-800 text-slate-300 border-slate-700';
  const label = LABELS[status] || status;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${style}`}>
      {label}
    </span>
  );
}
