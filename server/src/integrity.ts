/** Local, advisory similarity only. This module has no I/O or outcome/rating writes. */
const VERSION = 'local-token-similarity-v1';
const MAX_BYTES = 64 * 1024;
const MAX_TOKENS = 8192;
const MAX_PEERS = 50;
const MIN_TOKENS = 80;
const SHINGLE_SIZE = 7;
const MIN_SHARED_SHINGLES = 24;
const REVIEW_THRESHOLD = 0.85;
const SCOPE = 'Supplied completed submissions from other users; local lexical comparison only.';

const keywords = new Set(('abstract and as assert async await boolean bool break byte case catch char class '
  + 'const continue def default delete do double elif else enum except export extends false final finally '
  + 'float for from function global if import in int interface is lambda let long namespace new None not '
  + 'null of or package pass private protected public raise return short signed static struct super switch '
  + 'template this throw throws true try typedef typeof unsigned using var void volatile while with yield '
  + 'include').split(/\s+/));
const controls = new Set(['for', 'while', 'if', 'elif', 'switch', 'case', 'catch', 'except']);

export interface IntegrityResult {
  state: 'not_assessed' | 'review_suggested' | 'no_similarity_found';
  aiAssessment: { state: 'not_assessed'; reason: string };
  similarity: { maxScore: number | null; matchedSubmissionId: string | null; scope: string };
  signals: string[];
  review: { status: 'unreviewed' };
  version: string;
}

interface Tokens { values: string[]; controlCount: number }

/** A bounded lexical scanner, not a language parser. Literals remain opaque and exact. */
function tokenize(source: string): Tokens | null {
  if (Buffer.byteLength(source, 'utf8') > MAX_BYTES) return null;
  const values: string[] = [];
  const identifiers = new Map<string, string>();
  let controlCount = 0;
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (/\s/.test(ch)) { i++; continue; }
    if (source.startsWith('//', i) || ch === '#') {
      const end = source.indexOf('\n', i);
      i = end === -1 ? source.length : end + 1;
      continue;
    }
    if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2);
      if (end === -1) return null;
      i = end + 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const delimiter = source.startsWith(ch.repeat(3), i) && ch !== '`' ? ch.repeat(3) : ch;
      const start = i;
      i += delimiter.length;
      let closed = false;
      while (i < source.length) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source.startsWith(delimiter, i)) { i += delimiter.length; closed = true; break; }
        i++;
      }
      if (!closed) return null;
      // Interpolated templates require a real parser; abstain rather than misread embedded code.
      const literal = source.slice(start, i);
      if (ch === '`' && literal.includes('${')) return null;
      values.push(`literal:${literal}`);
    } else if (/[A-Za-z_$]/.test(ch)) {
      const start = i++;
      while (i < source.length && /[A-Za-z0-9_$]/.test(source[i]!)) i++;
      const word = source.slice(start, i);
      if (keywords.has(word)) {
        values.push(word);
        if (controls.has(word)) controlCount++;
      } else {
        if (!identifiers.has(word)) identifiers.set(word, `id:${identifiers.size}`);
        values.push(identifiers.get(word)!);
      }
    } else if (/[0-9]/.test(ch)) {
      const start = i++;
      while (i < source.length && /[A-Za-z0-9_.]/.test(source[i]!)) i++;
      values.push(`number:${source.slice(start, i)}`);
    } else {
      // Unsupported non-ASCII syntax (including identifier letters) requires a language parser.
      if (ch.charCodeAt(0) > 127) return null;
      const operator = ['===', '!==', '>>>', '<<=', '>>=', '**=', '==', '!=', '<=', '>=', '++', '--',
        '+=', '-=', '*=', '/=', '&&', '||', '=>', '::', '<<', '>>', '**', '//', '??', '?.']
        .find(candidate => source.startsWith(candidate, i));
      values.push(operator ?? ch);
      i += operator?.length ?? 1;
    }
    if (values.length > MAX_TOKENS) return null;
  }
  return { values, controlCount };
}

function fingerprints(tokens: Tokens | null): Set<string> | null {
  // Exclude small solutions and typical entry-point scaffolding, even when identical.
  if (!tokens || tokens.values.length < MIN_TOKENS || tokens.controlCount < 3) return null;
  const result = new Set<string>();
  for (let i = 0; i <= tokens.values.length - SHINGLE_SIZE; i++) {
    result.add(JSON.stringify(tokens.values.slice(i, i + SHINGLE_SIZE)));
  }
  return result.size >= MIN_SHARED_SHINGLES ? result : null;
}

export function analyzeIntegrity(
  source: string,
  peers: Array<{ id: string; sourceCode: string; userId: string }>,
  ownUserId: string,
): IntegrityResult {
  const result: IntegrityResult = {
    state: 'not_assessed',
    aiAssessment: {
      state: 'not_assessed',
      reason: 'No AI-authorship analyzer is configured. Code alone cannot establish AI assistance or misconduct.',
    },
    similarity: { maxScore: null, matchedSubmissionId: null, scope: SCOPE },
    signals: [],
    review: { status: 'unreviewed' },
    version: VERSION,
  };
  const own = fingerprints(tokenize(source));
  if (!own) {
    result.signals.push('Similarity not assessed: short, boilerplate, unsupported or over-limit input.');
    return result;
  }
  let assessed = 0;
  let best = 0;
  let bestShared = 0;
  let bestId: string | null = null;
  for (const peer of peers.slice(0, MAX_PEERS)) {
    if (peer.userId === ownUserId) continue;
    const other = fingerprints(tokenize(peer.sourceCode));
    if (!other) continue;
    assessed++;
    let shared = 0;
    for (const value of own) if (other.has(value)) shared++;
    const score = shared / (own.size + other.size - shared);
    if (score > best) { best = score; bestShared = shared; bestId = peer.id; }
  }
  if (!assessed) {
    result.signals.push('Similarity not assessed: no eligible other-user comparison submissions.');
    return result;
  }
  result.similarity.maxScore = Number(best.toFixed(4));
  // Only expose a comparator reference when review is suggested, never its source or user ID.
  if (best >= REVIEW_THRESHOLD && bestShared >= MIN_SHARED_SHINGLES) {
    result.state = 'review_suggested';
    result.similarity.matchedSubmissionId = bestId;
    result.signals.push('High lexical overlap warrants contextual human review; it does not establish copying, AI authorship or misconduct.');
  } else {
    result.state = 'no_similarity_found';
    result.signals.push('No overlap above the review threshold in the supplied scope; this does not establish independent or human authorship.');
  }
  return result;
}
