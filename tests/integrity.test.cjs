const assert = require('node:assert/strict');
const { test, before } = require('node:test');
let analyzeIntegrity;
before(async () => { ({ analyzeIntegrity } = await import('../server/dist/integrity.js')); });

const solution = `function shortestPaths(graph, start) {
  const distance = new Array(graph.length).fill(Infinity);
  const visited = new Array(graph.length).fill(false);
  distance[start] = 0;
  for (let step = 0; step < graph.length; step++) {
    let closest = -1;
    for (let vertex = 0; vertex < graph.length; vertex++) {
      if (!visited[vertex] && (closest === -1 || distance[vertex] < distance[closest])) closest = vertex;
    }
    if (closest === -1 || distance[closest] === Infinity) break;
    visited[closest] = true;
    for (const edge of graph[closest]) {
      if (distance[closest] + edge.weight < distance[edge.target]) distance[edge.target] = distance[closest] + edge.weight;
    }
  }
  return distance;
}`;
const peer = (sourceCode, userId = 'other') => ({ id: 'submission-2', sourceCode, userId });

test('identical nontrivial code suggests review without AI attribution or peer contents', () => {
  const result = analyzeIntegrity(solution, [peer(solution)], 'owner');
  assert.equal(result.state, 'review_suggested');
  assert.equal(result.similarity.maxScore, 1);
  assert.equal(result.similarity.matchedSubmissionId, 'submission-2');
  assert.equal(result.aiAssessment.state, 'not_assessed');
  assert.deepEqual(result.review, { status: 'unreviewed' });
  const json = JSON.stringify(result);
  assert.ok(!json.includes('sourceCode'));
  assert.ok(!json.includes('userId'));
  assert.ok(!json.includes('shortestPaths'));
  assert.ok(!json.includes('rating'));
});

test('renaming, whitespace and comments preserve the signal', () => {
  const renamed = solution.replace(/\b(graph|start|distance|visited|step|closest|vertex|edge|shortestPaths)\b/g, name => `renamed_${name}`)
    .replace(/\n/g, '\n /* harmless comment */ ');
  assert.equal(analyzeIntegrity(renamed, [peer(solution)], 'owner').similarity.maxScore, 1);
});

test('short solutions and padded common starter code are not assessed', () => {
  for (const code of ['function add(a,b) { return a+b; }',
    'public class Main { public static void main(String[] args) { ' + 'int a = 0; '.repeat(60) + '} }']) {
    const result = analyzeIntegrity(code, [peer(code)], 'owner');
    assert.equal(result.state, 'not_assessed');
    assert.equal(result.similarity.maxScore, null);
  }
});

test('comment markers inside strings are preserved and actual comments ignored', () => {
  const literal = `const text = "https://example.test/*x*/#fragment"; const quote = 'it\\'s // text';\n`;
  const a = literal + solution;
  const b = '// outside comment\n' + literal + '/* outside */\n' + solution;
  assert.equal(analyzeIntegrity(a, [peer(b)], 'owner').similarity.maxScore, 1);
  assert.equal(analyzeIntegrity('const text = "unterminated;' + solution, [peer(a)], 'owner').state, 'not_assessed');
  assert.equal(analyzeIntegrity('/* unterminated ' + solution, [peer(a)], 'owner').state, 'not_assessed');
});

test('triple quoted strings remain opaque; interpolated templates abstain', () => {
  const code = 'text = """// not a comment\n# not a comment\n/* neither */"""\n' + solution;
  assert.equal(analyzeIntegrity(code, [peer(code)], 'owner').similarity.maxScore, 1);
  assert.equal(analyzeIntegrity('const s = `value ${x}`;\n' + solution, [peer(solution)], 'owner').state, 'not_assessed');
});

test('distinct nontrivial algorithms do not trigger review', () => {
  const sorting = `function partitionSort(items, lo, hi) {
    if (lo >= hi) return;
    const pivot = items[hi]; let boundary = lo;
    for (let index = lo; index < hi; index++) {
      if (items[index] < pivot) {
        const saved = items[index]; items[index] = items[boundary]; items[boundary] = saved; boundary++;
      }
    }
    const saved = items[boundary]; items[boundary] = items[hi]; items[hi] = saved;
    partitionSort(items, lo, boundary - 1);
    partitionSort(items, boundary + 1, hi);
    return items;
  }`;
  const result = analyzeIntegrity(solution, [peer(sorting)], 'owner');
  assert.equal(result.state, 'no_similarity_found');
  assert.ok(result.similarity.maxScore < 0.85);
  assert.equal(result.similarity.matchedSubmissionId, null);
});

test('no eligible peers and own submissions remain unassessed', () => {
  for (const peers of [[], [peer(solution, 'owner')], [peer('return 0;')]]) {
    const result = analyzeIntegrity(solution, peers, 'owner');
    assert.equal(result.state, 'not_assessed');
    assert.equal(result.similarity.maxScore, null);
  }
});

test('AI-generated comment is not evidence of AI authorship', () => {
  const result = analyzeIntegrity('// AI generated\n' + solution, [peer(solution)], 'owner');
  assert.equal(result.aiAssessment.state, 'not_assessed');
  assert.equal(result.similarity.maxScore, 1);
});

test('oversized and excessive-token inputs abstain; comparison count is bounded', () => {
  assert.equal(analyzeIntegrity('x'.repeat(65537), [peer(solution)], 'owner').state, 'not_assessed');
  assert.equal(analyzeIntegrity('if(x){} '.repeat(2000), [peer(solution)], 'owner').state, 'not_assessed');
  const peers = Array.from({ length: 50 }, () => peer('return 0;'));
  peers.push(peer(solution));
  assert.equal(analyzeIntegrity(solution, peers, 'owner').state, 'not_assessed');
});
