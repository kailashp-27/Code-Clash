import type { PrismaClient } from '@prisma/client';

export interface TestCase { [key: string]: string | boolean; stdin: string; stdout: string; hidden: boolean }
export interface ProblemSnapshot {
  id: string; title: string; description: string; difficulty: string; topic: string;
  tests: TestCase[]; starters: Record<string, string>; version: number;
}
export const languageIds: Record<string, number> = { javascript: 63, python: 71, cpp: 54, java: 62 };
const starters = {
  javascript: "const fs = require('fs');\nconst input = fs.readFileSync(0, 'utf8');\n// Parse input, solve the problem, and print the answer.\n",
  python: "import sys\ninput_data = sys.stdin.read()\n# Parse input, solve the problem, and print the answer.\n",
  cpp: '#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\nint main() {\n    // Read input and print the answer.\n    return 0;\n}\n',
  java: 'import java.io.*;\nimport java.util.*;\npublic class Main {\n    public static void main(String[] args) throws Exception {\n        // Read input and print the answer.\n    }\n}\n',
};
const test = (stdin: string, stdout: string, hidden = true): TestCase => ({ stdin, stdout, hidden });
const pairCases = [
  test('4 9\n2 7 11 15\n', '0 1\n', false), test('3 6\n3 3 8\n', '0 1\n', false),
  test('2 0\n-1 1\n', '0 1\n'), test('5 -9\n4 -5 8 -4 15\n', '1 3\n'),
  test('6 19\n1 2 3 4 9 10\n', '4 5\n'), test('4 0\n0 7 0 8\n', '0 2\n'),
  test('4 1000000\n-1000000 999999 1 7\n', '1 2\n'),
  test('5 12\n5 5 6 7 20\n', '0 3\n'),
];
// Replace the ambiguous duplicate fixture with a unique pair.
pairCases[7] = test('5 12\n1 5 6 7 20\n', '1 3\n');
const large = Array.from({ length: 20000 }, (_, i) => i + 1);
pairCases.push(test(`20002 -3\n${large.join(' ')} -1 -2\n`, '20000 20001\n'));
const bracketCases = [
  test('()[]{}\n', 'true\n', false), test('([)]\n', 'false\n', false),
  ...['', '(', ')', '{[()]}', '][', '(())', '(()', '())', '[{()}]()', '[[}}'].map(s => {
    const stack: string[] = []; const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }; let valid = true;
    for (const c of s) { if ('([{'.includes(c)) stack.push(c); else if (stack.pop() !== pairs[c]) { valid = false; break; } }
    return test(`${s}\n`, `${valid && stack.length === 0}\n`);
  }),
  test('('.repeat(20000) + ')'.repeat(20000) + '\n', 'true\n'),
  test('()'.repeat(20000) + ']\n', 'false\n'),
];
export const problemBank = [
  { shortCode: 'CC-TWO-SUM-V1', title: 'Two Sum', difficulty: 'EASY', topic: 'Arrays', tests: pairCases,
    description: 'Find the unique pair of distinct indices whose values add up to the target.\n\nInput\nFirst line: n target. Second line: n integers.\n2 ≤ n ≤ 100000. Values and target are between -1000000 and 1000000. Exactly one unordered pair exists.\n\nOutput\nPrint zero-based indices i j, with i < j. Output is compared as exact whitespace-separated tokens; do not print debugging text.\n\nLimits\nC++: 2 CPU seconds. Other languages: 4 CPU seconds. Wall time: 10 seconds. Memory: 500 MiB.\n\nWrite a complete program that reads stdin and writes stdout.' },
  { shortCode: 'CC-BRACKETS-V1', title: 'Balanced Brackets', difficulty: 'MEDIUM', topic: 'Stacks', tests: bracketCases,
    description: 'Decide whether every bracket is closed in the correct order. Allowed characters are ()[]{}. The empty string is balanced.\n\nInput\nOne line containing 0 to 100000 brackets. A blank line represents the empty string.\n\nOutput\nPrint exactly true or false in lowercase. Output is compared as exact whitespace-separated tokens; do not print debugging text.\n\nLimits\nC++: 2 CPU seconds. Other languages: 4 CPU seconds. Wall time: 10 seconds. Memory: 500 MiB.\n\nWrite a complete program that reads stdin and writes stdout.' },
];
export async function seedProblems(prisma: PrismaClient) {
  for (const problem of problemBank) {
    await prisma.problem.upsert({ where: { shortCode: problem.shortCode }, update: {},
      create: { ...problem, starters, version: 1 } });
  }
}
export function publicProblem(snapshot: ProblemSnapshot) {
  return { id: snapshot.id, title: snapshot.title, description: snapshot.description, difficulty: snapshot.difficulty,
    topic: snapshot.topic, totalTestCases: snapshot.tests.length, starters: snapshot.starters,
    examples: snapshot.tests.filter(t => !t.hidden).map(({ stdin, stdout }) => ({ stdin, stdout })) };
}
export function compareOutput(actual: string, expected: string) {
  if (Buffer.byteLength(actual, 'utf8') > 65536) return false;
  const tokens = (s: string) => s.trim().split(/\s+/).filter(Boolean);
  const a = tokens(actual), b = tokens(expected);
  return a.length === b.length && a.every((value, i) => value === b[i]);
}
