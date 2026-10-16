/**
 * Intent-preserving repair guardrails (TypeScript twin of backend/src/modules/healing/guardrails.py).
 * Both read shared/intent-vocabulary.json, so the runner and the server refuse the same repairs.
 *
 * A repair may never flip a control from the "affirm" polarity (Place order, Submit, Pay...) to the
 * "cancel" polarity (Cancel, Delete, Back...) or the other way round: healing a checkout test onto the
 * Cancel button would turn a real regression into a green test.
 */

import fs from 'node:fs';
import path from 'node:path';

export type Polarity = 'affirm' | 'cancel' | 'neutral';

interface Vocabulary {
  affirm: RegExp[];
  cancel: RegExp[];
}

let cached: Vocabulary | null = null;

function vocabularyPath(): string {
  const candidates = [
    process.env.AGENTQA_INTENT_VOCAB,
    path.resolve(__dirname, '../../../shared/intent-vocabulary.json'),
    path.resolve(process.cwd(), 'shared/intent-vocabulary.json'),
    path.resolve(process.cwd(), '../shared/intent-vocabulary.json'),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  throw new Error('intent-vocabulary.json not found (set AGENTQA_INTENT_VOCAB)');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function vocabulary(): Vocabulary {
  if (cached) return cached;
  const raw = JSON.parse(fs.readFileSync(vocabularyPath(), 'utf-8')) as { affirm: string[]; cancel: string[] };
  const compile = (words: string[]) => words.map((w) => new RegExp(`(?<![a-z0-9])${escapeRegex(w)}(?![a-z0-9])`));
  cached = { affirm: compile(raw.affirm), cancel: compile(raw.cancel) };
  return cached;
}

/** The vocabulary as plain strings, for code that runs inside the page (Level 4 uses it as a matching signal). */
export function vocabularySources(): { affirm: string[]; cancel: string[] } {
  const raw = JSON.parse(fs.readFileSync(vocabularyPath(), 'utf-8')) as { affirm: string[]; cancel: string[] };
  return { affirm: raw.affirm, cancel: raw.cancel };
}

/** lower-case, split camelCase / snake_case / kebab-case, collapse punctuation */
export function normalize(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** 'cancel' wins over 'affirm' ("Cancel order" is a cancel control). */
export function polarity(text: string | null | undefined): Polarity {
  const norm = normalize(text);
  if (!norm) return 'neutral';
  const v = vocabulary();
  if (v.cancel.some((p) => p.test(norm))) return 'cancel';
  if (v.affirm.some((p) => p.test(norm))) return 'affirm';
  return 'neutral';
}

/** Polarity of the first text that carries one (visible text, aria-label, then selector tokens). */
export function intentPolarity(...texts: Array<string | null | undefined>): Polarity {
  for (const t of texts) {
    const p = polarity(t);
    if (p !== 'neutral') return p;
  }
  return 'neutral';
}

export interface GuardrailVerdict {
  allowed: boolean;
  code: 'ok' | 'low_confidence' | 'intent_conflict';
  reason: string;
}

export function evaluateRepair(
  originalTexts: Array<string | null | undefined>,
  candidateTexts: Array<string | null | undefined>,
  confidence: number,
  minConfidence: number,
): GuardrailVerdict {
  if (confidence < minConfidence) {
    return {
      allowed: false,
      code: 'low_confidence',
      reason: `confidence ${confidence.toFixed(2)} is below the ${minConfidence.toFixed(2)} threshold`,
    };
  }
  const original = intentPolarity(...originalTexts);
  const candidate = intentPolarity(...candidateTexts);
  if (original !== 'neutral' && candidate !== 'neutral' && original !== candidate) {
    return {
      allowed: false,
      code: 'intent_conflict',
      reason: `original control reads as '${original}' but the replacement reads as '${candidate}'`,
    };
  }
  return { allowed: true, code: 'ok', reason: 'intent preserved' };
}
