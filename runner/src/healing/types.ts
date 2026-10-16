/**
 * Shared types for the AgentQA self-healing ladder.
 *
 * Level identities (fixed) and the order they are *executed* in (cheapest first, so every $0 deterministic
 * tier runs before any LLM call):
 *
 *   Level 1  Smart Retry                    deterministic      run 1st
 *   Level 3  Multi-Selector Fallback        deterministic      run 2nd
 *   Level 4  DOM Geometry & Layout Matcher  deterministic      run 3rd
 *   Level 2  LLM DOM Repair                 needs an LLM       run 4th (skipped without a provider)
 *   Level 5  LLM Decompose & Rebuild        needs an LLM       run 5th (skipped without a provider)
 */

export type LevelId = 1 | 2 | 3 | 4 | 5;

export const LEVEL_NAMES: Record<LevelId, string> = {
  1: 'Smart Retry',
  2: 'LLM DOM Repair',
  3: 'Multi-Selector Fallback',
  4: 'DOM Geometry & Layout Matcher',
  5: 'LLM Decompose & Rebuild',
};

/** Order in which levels are attempted. */
export const ESCALATION_ORDER: LevelId[] = [1, 3, 4, 2, 5];

export type ActionKind = 'click' | 'fill' | 'check' | 'select' | 'press' | 'hover';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the runner remembers about an element the last time its selector worked. */
export interface ElementFingerprint {
  tag: string;
  role: string | null;
  text: string;
  ariaLabel: string;
  name: string;
  type: string;
  placeholder: string;
  id: string;
  testId: string;
  classes: string[];
  href: string;
  /** ancestor chain, nearest first, e.g. ["form#checkout", "main", "body"] */
  path: string[];
  inForm: boolean;
  box: Box;
  viewport: { w: number; h: number };
  /** other selectors that identified the same element at recording time (Level 3). */
  alternates: string[];
  recordedAt: string;
}

/** Hints a test author can pass when no fingerprint has been recorded yet. */
export interface ElementHint {
  tagName?: string;
  textPreview?: string;
  ariaLabel?: string;
  name?: string;
  type?: string;
  approximateBox?: Box;
}

export interface Candidate {
  selector: string;
  level: LevelId;
  /** 0..1 */
  confidence: number;
  reasoning: string;
  /** visible text / aria-label of the matched element, used for the intent guardrail */
  elementText: string;
  elementAria: string;
  /** score components, for the evidence view */
  evidence: Record<string, number | string | boolean>;
  /** id of a server-side cache record, when the candidate came from /healing/heal */
  cacheId?: string;
}

export type StepStatus = 'skipped' | 'miss' | 'blocked' | 'selected';

export interface LadderStep {
  level: LevelId;
  name: string;
  status: StepStatus;
  reason: string;
  ms: number;
}

export type BlockCode = 'intent_conflict' | 'low_confidence' | 'ambiguous' | 'not_actionable' | 'no_candidate';

export interface Blocked {
  code: BlockCode;
  reason: string;
  /** the candidate that was refused, if any */
  selector?: string;
  elementText?: string;
}

export interface LadderResult {
  original: string;
  action: ActionKind;
  selected?: Candidate;
  blocked?: Blocked;
  steps: LadderStep[];
  domBytesRaw: number;
  domBytesCompressed: number;
  elapsedMs: number;
  llmCostUsd: number;
  llmTokens: number;
}

export type HealVerdict = 'pending' | 'validated' | 'rejected' | 'unverified';

/** A heal that was applied during a test. It only counts once the test's own assertions pass. */
export interface HealRecord {
  testTitle: string;
  file: string;
  line: number | null;
  url: string;
  original: string;
  healed: string;
  action: ActionKind;
  level: LevelId;
  levelName: string;
  confidence: number;
  reasoning: string;
  steps: LadderStep[];
  domBytesRaw: number;
  domBytesCompressed: number;
  elapsedMs: number;
  llmCostUsd: number;
  verdict: HealVerdict;
  verdictReason: string;
  /** assertions executed after this heal was applied */
  assertionsAfter: number;
  evidence: Record<string, number | string | boolean>;
  timestamp: number;
}

export interface BlockedRecord {
  testTitle: string;
  file: string;
  line: number | null;
  url: string;
  original: string;
  action: ActionKind;
  blocked: Blocked;
  steps: LadderStep[];
  elapsedMs: number;
  timestamp: number;
}
