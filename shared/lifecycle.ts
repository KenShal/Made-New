/**
 * Design submission review lifecycle. This table is the single source of truth:
 * the server enforces it in `transitionDesign`, and the database enforces the
 * same rules in the `transition_design` SQL function (see supabase/migrations).
 */
export const DESIGN_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'changes_requested',
  'approved',
  'published',
  'rejected',
  'archived',
] as const;

export type DesignStatus = (typeof DESIGN_STATUSES)[number];

export type Actor = 'creator' | 'reviewer' | 'publisher';

interface Transition {
  from: DesignStatus;
  to: DesignStatus;
  actor: Actor;
  requiresReason?: boolean;
  requiresValidation?: boolean;
}

export const TRANSITIONS: readonly Transition[] = [
  { from: 'draft', to: 'submitted', actor: 'creator', requiresValidation: true },
  { from: 'changes_requested', to: 'submitted', actor: 'creator', requiresValidation: true },
  { from: 'draft', to: 'archived', actor: 'creator' },
  { from: 'rejected', to: 'archived', actor: 'creator' },
  { from: 'published', to: 'archived', actor: 'publisher', requiresReason: true },
  { from: 'submitted', to: 'under_review', actor: 'reviewer' },
  { from: 'under_review', to: 'approved', actor: 'reviewer', requiresValidation: true },
  { from: 'under_review', to: 'changes_requested', actor: 'reviewer', requiresReason: true },
  { from: 'under_review', to: 'rejected', actor: 'reviewer', requiresReason: true },
  { from: 'approved', to: 'published', actor: 'publisher', requiresValidation: true },
];

export const STATUS_LABELS: Record<DesignStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  changes_requested: 'Changes Requested',
  approved: 'Approved',
  published: 'Published',
  rejected: 'Rejected',
  archived: 'Archived',
};

export const EDITABLE_BY_CREATOR: readonly DesignStatus[] = ['draft', 'changes_requested'];

export function findTransition(from: DesignStatus, to: DesignStatus): Transition | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.to === to);
}

export type TransitionError =
  | 'invalid_transition'
  | 'forbidden_actor'
  | 'reason_required'
  | 'validation_failed';

export function checkTransition(input: {
  from: DesignStatus;
  to: DesignStatus;
  actors: readonly Actor[];
  reason?: string | null;
  validationPassed: boolean;
}): { ok: true } | { ok: false; error: TransitionError } {
  const t = findTransition(input.from, input.to);
  if (!t) return { ok: false, error: 'invalid_transition' };
  if (!input.actors.includes(t.actor)) return { ok: false, error: 'forbidden_actor' };
  if (t.requiresReason && !(input.reason && input.reason.trim().length >= 10)) {
    return { ok: false, error: 'reason_required' };
  }
  if (t.requiresValidation && !input.validationPassed) return { ok: false, error: 'validation_failed' };
  return { ok: true };
}

export function nextStatusesFor(from: DesignStatus, actor: Actor): DesignStatus[] {
  return TRANSITIONS.filter((t) => t.from === from && t.actor === actor).map((t) => t.to);
}
