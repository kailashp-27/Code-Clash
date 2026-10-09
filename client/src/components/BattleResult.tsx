import { Link } from 'react-router-dom';
import { ArrowRight, Check, Code2, ShieldCheck, Swords, Trophy } from 'lucide-react';
import type { BattleState, MatchOverPayload } from '../socket/events';
import BattleReport from './BattleReport';
const duration = (value: number | null) => value === null ? '—' : `${Math.floor(value / 60)}m ${Math.floor(value % 60).toString().padStart(2, '0')}s`;
export default function BattleResult({ result, match, userId, onReview }: { result: MatchOverPayload; match: BattleState; userId: string; onReview: () => void }) {
  const outcome = result.outcome;
  const title = { win: 'Arena conquered.', loss: 'Your next move awaits.', draw: 'An even match.', cancelled: 'Battle cancelled.' }[outcome];
  const ownDelta = result.ratingChanges[userId] ?? 0;
  const participants = Object.entries(result.players).sort(([id]) => id === userId ? -1 : 1);
  const mine = result.players[userId];
  const accepted = new Set(match.progress[userId]?.problemIds ?? []);
  return <section className={`battle-result battle-result--${outcome}`} aria-labelledby="result-title">
    <div className="result-topline"><span><ShieldCheck size={15} /> Server-verified result</span><span>RANKED / {result.matchId.slice(0, 8).toUpperCase()}</span></div>
    <div className="result-hero"><div className="result-emblem"><Trophy size={32} strokeWidth={1.5} /></div><div className="result-hero-copy"><div className="battle-eyebrow">{outcome === 'win' ? 'Victory' : outcome === 'loss' ? 'Defeat' : outcome === 'draw' ? 'Draw' : 'No contest'}</div><h1 id="result-title">{title}</h1><p>{result.reason}</p></div><div className="result-elo-summary"><span>YOUR ELO</span><strong>{result.ratingsAfter[userId] ?? '—'}</strong><small className={ownDelta >= 0 ? 'battle-positive' : 'battle-negative'}>{ownDelta > 0 ? '+' : ''}{ownDelta} this battle</small></div></div>
    <div className="result-scoreboard">{participants.map(([id, player], index) => <article key={id} className={`result-player${id === userId ? ' result-player--you' : ''}${result.winnerId === id ? ' result-player--winner' : ''}`}>
      <div className="result-player-heading"><span className="result-avatar">{player.username.slice(0, 2).toUpperCase()}</span><div><h2>{player.username}</h2><span>{id === userId ? 'You' : 'Opponent'} · {result.winnerId === id ? 'Winner' : 'Competitor'}</span></div>{result.winnerId === id ? <Trophy size={19} /> : null}</div>
      <div className="result-solve-score">{player.solved}<span>/{match.problems.length}</span><small>problems solved</small></div>
      <dl><div><dt>Solve time</dt><dd>{duration(player.solveSeconds)}</dd></div><div><dt>Elo</dt><dd>{result.ratingsBefore[id] ?? '—'} <ArrowRight size={12} /> {result.ratingsAfter[id] ?? '—'}</dd></div><div><dt>Rating change</dt><dd className={(result.ratingChanges[id] ?? 0) >= 0 ? 'battle-positive' : 'battle-negative'}>{(result.ratingChanges[id] ?? 0) > 0 ? '+' : ''}{result.ratingChanges[id] ?? 0}</dd></div></dl>{index === 0 ? <span className="result-versus">VS</span> : null}
    </article>)}</div>
    <div className="result-problems"><h2>Your problem breakdown</h2><div className="result-problem-list">{match.problems.map((p, index) => <article key={p.id}><span className="result-problem-index">0{index + 1}</span><div><strong>{p.title}</strong><span>{p.topic} · {p.difficulty.toLowerCase()}</span></div><span className={accepted.has(p.id) ? 'result-accepted' : 'result-unsolved'}>{accepted.has(p.id) ? <Check size={13} /> : null}{accepted.has(p.id) ? 'Solved' : 'Unsolved'}</span></article>)}</div></div>
    <div className="result-actions"><Link className="battle-button battle-button--primary" to="/"><Swords size={16} />Find another battle<ArrowRight size={15} /></Link><button className="battle-button" onClick={onReview}><Code2 size={16} />Review your code</button><Link className="battle-button" to="/profile">View profile</Link></div>
    {outcome === 'cancelled' ? <p className="result-footnote">No ratings changed.</p> : <p className="result-footnote">{mine?.solved ?? 0} solved · Judged submissions determine this result. Runtime is feedback, not the winner rule.</p>}
    <details className="result-integrity-note"><summary><ShieldCheck size={15} />Fair play & result rules</summary><p>Similarity checks are advisory. AI authorship is not assessed. Reports require an independent moderator decision before they become strikes.</p></details>
    {outcome !== 'cancelled' ? <BattleReport matchId={result.matchId} problems={match.problems} /> : null}
  </section>;
}
