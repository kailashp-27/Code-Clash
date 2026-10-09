import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Award, Check, ChevronRight, Clock, Flame, LockKeyhole, LogOut, RefreshCw, Shield, Swords, Target, TrendingUp, Trophy, Zap } from 'lucide-react';
import { apiUrl } from '../utils/api';
import { useSocketStore } from '../stores/useSocketStore';
import './ProfilePage.css';

export interface ProfileStats {
  user: { id: string; username: string; createdAt: string };
  rating: number; wins: number; losses: number; draws: number; totalBattles: number; winRate: number;
  currentStreak: number; bestStreak: number; peakRating: number;
  rank: { name: string; min: number; nextMin: number | null; progress: number };
  leaderboard: { position: number; total: number; topPercent: number };
  solvedProblems: number; acceptedSubmissions: number; averageSolveSeconds: number | null; fastestSolveSeconds: number | null;
  ratingHistory: { matchId: string; rating: number; change: number; at: string }[];
  topics: { name: string; solved: number; attempted: number }[];
  achievements: { id: string; title: string; description: string; progress: number; target: number; unlocked: boolean; unlockedAt: string | null }[];
  recentMatches: { id: string; opponent: string; outcome: 'win' | 'loss' | 'draw'; ratingChange: number | null; createdAt: string; endedAt: string | null; reason: string; problemTitles: string[] }[];
}

const number = (value: number) => value.toLocaleString();
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const duration = (seconds: number | null) => seconds === null ? '—' : seconds < 60 ? `${Math.round(seconds)}s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
const delta = (change: number) => `${change > 0 ? '+' : ''}${change}`;
const percent = (value: number) => Math.max(0, Math.min(100, value));

function Panel({ title, eyebrow, action, children, className = '' }: { title: string; eyebrow: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`profile-panel ${className}`}><div className="profile-panel-heading"><div><p className="profile-eyebrow">{eyebrow}</p><h2>{title}</h2></div>{action}</div>{children}</section>;
}

function ProfileActions({ onSignOut }: { onSignOut: () => void }) {
  return <nav className="profile-navigation" aria-label="Profile actions"><Link className="profile-button profile-button-lobby" to="/"><ArrowLeft size={15} aria-hidden="true" />Return to lobby</Link><button className="profile-button profile-button-signout" onClick={onSignOut}><LogOut size={15} aria-hidden="true" />Sign out</button></nav>;
}

function RatingChart({ history }: { history: ProfileStats['ratingHistory'] }) {
  const chartId = useId();
  if (!history.length) return <Empty icon={<TrendingUp size={28} />} title="Your journey starts here" text="Complete a ranked battle to record your first rating point." battleLink />;
  const values = history.map(point => point.rating);
  const low = Math.floor((Math.min(...values) - 30) / 50) * 50;
  const high = Math.ceil((Math.max(...values) + 30) / 50) * 50;
  const coordinates = history.map((point, index) => ({ ...point, x: history.length === 1 ? 400 : 58 + index / (history.length - 1) * 702, y: 190 - (point.rating - low) / (high - low) * 156 }));
  const path = coordinates.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const latest = history[history.length - 1];
  return <div className="profile-chart">
    <svg viewBox="0 0 800 236" role="img" aria-labelledby={`${chartId}-title ${chartId}-desc`}>
      <title id={`${chartId}-title`}>Rating history over {history.length} ranked battles</title>
      <desc id={`${chartId}-desc`}>First rating {history[0].rating} on {date(history[0].at)}. Latest rating {latest.rating} on {date(latest.at)}. Exact values are in the accessible rating data table below.</desc>
      <defs><linearGradient id={`${chartId}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00e5ff" stopOpacity=".18" /><stop offset="100%" stopColor="#00e5ff" stopOpacity="0" /></linearGradient></defs>
      {[0, 1, 2, 3].map(tick => <g key={tick}><line x1="58" x2="760" y1={34 + tick * 52} y2={34 + tick * 52} stroke="#252b40" strokeDasharray="4 6" /><text x="43" y={38 + tick * 52} textAnchor="end" fill="#a3abc2" fontSize="12">{Math.round(high - tick / 3 * (high - low))}</text></g>)}
      {history.length > 1 ? <><path d={`${path} L760,190 L58,190 Z`} fill={`url(#${chartId}-fill)`} /><path d={path} fill="none" stroke="#00e5ff" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /></> : null}
      {coordinates.map(point => <circle key={point.matchId} cx={point.x} cy={point.y} r="4" fill="#00e5ff" stroke="#0e1322" strokeWidth="2"><title>{date(point.at)}: {point.rating} Elo ({delta(point.change)})</title></circle>)}
      <text x="58" y="224" fill="#a3abc2" fontSize="12">{date(history[0].at)}</text><text x="760" y="224" textAnchor="end" fill="#a3abc2" fontSize="12">{date(latest.at)}</text>
    </svg>
    <details className="profile-chart-data"><summary>View rating data</summary><div className="profile-table-scroll"><table><caption>Recorded ranked rating changes</caption><thead><tr><th scope="col">Date</th><th scope="col">Rating</th><th scope="col">Change</th><th scope="col">Battle</th></tr></thead><tbody>{history.map(point => <tr key={point.matchId}><td>{date(point.at)}</td><td>{point.rating}</td><td>{delta(point.change)}</td><td><Link to={`/battle/${encodeURIComponent(point.matchId)}`}>View result</Link></td></tr>)}</tbody></table></div></details>
  </div>;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [request, setRequest] = useState(0);
  const [achievementFilter, setAchievementFilter] = useState<'all' | 'earned' | 'locked'>('all');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/login', { replace: true }); return; }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort('timeout'), 15000);
    let active = true;
    async function load() {
      try {
        const response = await fetch(apiUrl('/api/profile'), { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        if (response.status === 401) { localStorage.removeItem('token'); localStorage.removeItem('user'); navigate('/login', { replace: true }); return; }
        if (!response.ok) throw new Error('Your profile could not be loaded. Please try again.');
        const data: ProfileStats = await response.json();
        if (!data.user || !Array.isArray(data.achievements) || !Array.isArray(data.ratingHistory) || !data.rank || !data.leaderboard) throw new Error('Profile data is temporarily unavailable. Please try again.');
        if (active) { setStats(data); setError(''); }
      } catch (failure: unknown) {
        if (active) setError(controller.signal.aborted ? 'The request timed out. Check your connection and try again.' : failure instanceof Error ? failure.message : 'Your profile could not be loaded. Please try again.');
      } finally { window.clearTimeout(timeout); if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [navigate, request]);

  function refresh() { setLoading(true); setError(''); setRequest(value => value + 1); }
  function signOut() {
    localStorage.removeItem('token'); localStorage.removeItem('user');
    useSocketStore.getState().disconnect(); navigate('/', { replace: true });
  }
  if (!stats) return <section aria-label="Player profile" className="clash-profile profile-initial" aria-busy={loading}><ProfileActions onSignOut={signOut} /><div className="profile-initial-icon"><Shield size={32} aria-hidden="true" /></div><p className="profile-eyebrow">YOUR COMPETITIVE IDENTITY</p><h1>{loading ? 'Loading your profile' : 'Unable to load profile'}</h1>{loading ? <p role="status">Fetching your battle history and achievements…</p> : <><p role="alert">{error}</p><button className="profile-button" onClick={refresh}><RefreshCw size={16} aria-hidden="true" />Try again</button></>}</section>;

  const earned = stats.achievements.filter(achievement => achievement.unlocked).length;
  const achievements = stats.achievements.filter(achievement => achievementFilter === 'all' || (achievementFilter === 'earned' ? achievement.unlocked : !achievement.unlocked));
  const recordTotal = stats.wins + stats.losses + stats.draws;
  const latestChange = stats.ratingHistory.length ? stats.ratingHistory[stats.ratingHistory.length - 1].change : null;

  return <section aria-label="Player profile" className="clash-profile" aria-busy={loading}><div className="profile-container">
    <ProfileActions onSignOut={signOut} />
    <div className="profile-page-heading"><div><p className="profile-eyebrow">PLAYER INTELLIGENCE</p><h1>Your competitive profile<span>.</span></h1></div><button className="profile-button profile-button-quiet" onClick={refresh} disabled={loading} aria-label={loading ? 'Refreshing profile statistics' : 'Refresh profile statistics'}><RefreshCw size={15} className={loading ? 'profile-spin' : ''} aria-hidden="true" /><span>{loading ? 'Refreshing…' : 'Refresh stats'}</span></button></div>
    {error ? <div className="profile-error" role="alert">{error} Your last loaded stats are still shown. <button onClick={refresh} disabled={loading}>Retry</button></div> : null}
    <div className="profile-hero profile-panel">
      <div className="profile-identity"><div className="profile-avatar" aria-hidden="true">{stats.user.username.slice(0, 2).toUpperCase()}<span><Zap size={12} /></span></div><div><p className="profile-eyebrow">RANKED CONTENDER</p><h2>{stats.user.username}</h2><p className="profile-joined">Joined {date(stats.user.createdAt)}</p><div className="profile-identity-badges"><span className="profile-rank-badge"><Shield size={13} aria-hidden="true" />{stats.rank.name}</span><span><Award size={13} aria-hidden="true" />{earned} achievements earned</span></div></div></div>
      <div className="profile-hero-rating"><p className="profile-eyebrow">CURRENT ELO</p><div className="profile-rating-value">{number(stats.rating)}<TrendingUp size={26} aria-hidden="true" /></div><p>{latestChange === null ? 'Ready for your first ranked battle' : <><span className={latestChange > 0 ? 'profile-positive' : latestChange < 0 ? 'profile-negative' : ''}>{delta(latestChange)} Elo</span> in your latest battle</>}</p></div>
      <div className="profile-rank-progress"><div><span>{stats.rank.name}</span><strong>{stats.rank.nextMin === null ? 'Highest tier' : `${number(Math.max(0, stats.rank.nextMin - stats.rating))} Elo to next tier`}</strong></div><progress max="100" value={percent(stats.rank.progress)} aria-label={`${stats.rank.name} tier progress`} /><div className="profile-rank-range"><span>{number(stats.rank.min)} Elo</span><span>{stats.rank.nextMin === null ? 'Keep climbing' : `${number(stats.rank.nextMin)} Elo`}</span></div></div>
    </div>
    <div className="profile-stat-grid">
      <Stat icon={<Swords size={18} />} label="Ranked battles" value={number(stats.totalBattles)} detail={`${stats.wins} wins · ${stats.losses} losses · ${stats.draws} draws`} />
      <Stat icon={<Target size={18} />} label="Win rate" value={`${stats.winRate.toFixed(1)}%`} detail={stats.totalBattles ? 'Across completed ranked battles' : 'No completed battles yet'} />
      <Stat icon={<Flame size={18} />} label="Current streak" value={stats.currentStreak ? `${Math.abs(stats.currentStreak)}${stats.currentStreak > 0 ? 'W' : 'L'}` : '0'} detail={`Best winning streak: ${stats.bestStreak}`} />
      <Stat icon={<Trophy size={18} />} label="Peak rating" value={number(stats.peakRating)} detail={stats.leaderboard.position > 0 ? `#${number(stats.leaderboard.position)} of ${number(stats.leaderboard.total)} players` : 'Leaderboard position unavailable'} />
    </div>
    <div className="profile-analysis-grid">
      <Panel title="Rating journey" eyebrow="EVERY BATTLE LEAVES A MARK" action={<span className="profile-small-tag">Ranked Elo</span>}><RatingChart history={stats.ratingHistory} /></Panel>
      <Panel title="Battle performance" eyebrow="YOUR RECORD, AT A GLANCE">
        <div className="profile-record"><div><strong className="profile-positive">{stats.wins}</strong><span>Wins</span></div><div><strong className="profile-negative">{stats.losses}</strong><span>Losses</span></div><div><strong>{stats.draws}</strong><span>Draws</span></div></div>
        <div className="profile-record-bar" role="img" aria-label={`${stats.wins} wins, ${stats.losses} losses, ${stats.draws} draws`}><span style={{ width: `${recordTotal ? stats.wins / recordTotal * 100 : 0}%` }} /><span style={{ width: `${recordTotal ? stats.losses / recordTotal * 100 : 0}%` }} /><span style={{ width: `${recordTotal ? stats.draws / recordTotal * 100 : 0}%` }} /></div>
        <dl className="profile-performance-list"><div><dt><Check size={14} aria-hidden="true" />Problems solved</dt><dd>{number(stats.solvedProblems)}</dd></div><div><dt><Zap size={14} aria-hidden="true" />Accepted submissions</dt><dd>{number(stats.acceptedSubmissions)}</dd></div><div><dt><Clock size={14} aria-hidden="true" />Average solve time</dt><dd>{duration(stats.averageSolveSeconds)}</dd></div><div><dt><TrendingUp size={14} aria-hidden="true" />Fastest solve</dt><dd>{duration(stats.fastestSolveSeconds)}</dd></div></dl>
        {stats.averageSolveSeconds === null ? <p className="profile-note">Solve times appear after your first accepted solution.</p> : null}
      </Panel>
    </div>
    <Panel title="Achievement collection" eyebrow="EARNED THROUGH YOUR BATTLES" action={<span className="profile-achievement-count"><Trophy size={15} aria-hidden="true" /><strong>{earned}</strong> / {stats.achievements.length}</span>}>
      <div className="profile-filters" role="group" aria-label="Filter achievements">{(['all', 'earned', 'locked'] as const).map(filter => <button key={filter} onClick={() => setAchievementFilter(filter)} aria-pressed={achievementFilter === filter}>{filter === 'all' ? 'All achievements' : filter === 'earned' ? `Earned (${earned})` : 'In progress'}</button>)}</div>
      {achievements.length ? <div className="profile-achievements">{achievements.map(achievement => <article key={achievement.id} className={`profile-achievement ${achievement.unlocked ? 'is-earned' : ''}`}><div className="profile-achievement-top"><div className="profile-achievement-icon">{achievement.unlocked ? <Award size={24} aria-hidden="true" /> : <LockKeyhole size={21} aria-hidden="true" />}</div><span>{achievement.unlocked ? 'EARNED' : 'LOCKED'}</span></div><h3>{achievement.title}</h3><p>{achievement.description}</p><div className="profile-achievement-bottom">{achievement.unlocked ? <span className="profile-positive"><Check size={12} aria-hidden="true" />{achievement.unlockedAt ? `Unlocked ${date(achievement.unlockedAt)}` : 'Achievement unlocked'}</span> : <><progress max="100" value={achievement.target > 0 ? percent(achievement.progress / achievement.target * 100) : 0} aria-label={`${achievement.title}: ${achievement.progress} of ${achievement.target}`} /><span>{number(achievement.progress)} / {number(achievement.target)}</span></>}</div></article>)}</div> : <Empty icon={<Award size={24} />} text={achievementFilter === 'earned' ? 'Your first achievement is waiting. Play a battle to start making progress.' : achievementFilter === 'locked' ? 'All available achievements earned. Keep building your record.' : 'Achievements will appear here when available.'} />}
    </Panel>
    <div className="profile-bottom-grid">
      <Panel title="Recent battles" eyebrow="THE STORY BEHIND THE NUMBERS" action={<Link className="profile-text-link" to="/">Play again <ArrowRight size={14} aria-hidden="true" /></Link>}>
        {stats.recentMatches.length ? <div className="profile-battles">{stats.recentMatches.map(match => <Link key={match.id} className="profile-battle" to={`/battle/${encodeURIComponent(match.id)}`}><span className={`profile-outcome profile-outcome-${match.outcome}`}><Swords size={18} aria-hidden="true" /></span><div className="profile-battle-main"><div><strong>vs {match.opponent}</strong><span className={`profile-result-text profile-${match.outcome}`}>{match.outcome}</span></div><p>{match.problemTitles.length ? match.problemTitles.join(' · ') : match.reason.replace(/_/g, ' ').toLowerCase()}</p><time dateTime={match.endedAt ?? match.createdAt}>{date(match.endedAt ?? match.createdAt)}</time></div><span className={`profile-battle-delta ${match.ratingChange !== null && match.ratingChange > 0 ? 'profile-positive' : match.ratingChange !== null && match.ratingChange < 0 ? 'profile-negative' : ''}`}>{match.ratingChange === null ? '—' : delta(match.ratingChange)}<small>Elo</small></span><ChevronRight size={16} aria-hidden="true" /></Link>)}</div> : <Empty icon={<Swords size={26} />} title="A clean slate. A new contender." text="Your completed battles and results will appear here." battleLink />}
      </Panel>
      <Panel title="Topic mastery" eyebrow="BUILD YOUR RANGE">
        {stats.topics.length ? <div className="profile-topics">{stats.topics.map(topic => <div key={topic.name}><div><strong>{topic.name}</strong><span>{topic.solved} / {topic.attempted} solved</span></div><progress max="100" value={topic.attempted ? percent(topic.solved / topic.attempted * 100) : 0} aria-label={`${topic.name}: ${topic.solved} solved out of ${topic.attempted} attempted`} /></div>)}<p className="profile-note">Based on problems attempted in your battles.</p></div> : <Empty icon={<Target size={26} />} title="Discover your strengths" text="Attempt tagged problems to see your topic breakdown." />}
      </Panel>
    </div>
    <footer className="profile-footer"><Shield size={13} aria-hidden="true" />Built from your recorded battles. Every milestone earned.</footer>
  </div></section>;
}

function Stat({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return <section className="profile-stat profile-panel"><div className="profile-stat-label"><span>{label}</span><span aria-hidden="true">{icon}</span></div><strong>{value}</strong><p>{detail}</p></section>;
}

function Empty({ icon, title, text, battleLink = false }: { icon: ReactNode; title?: string; text: string; battleLink?: boolean }) {
  return <div className="profile-empty"><span aria-hidden="true">{icon}</span>{title ? <h3>{title}</h3> : null}<p>{text}</p>{battleLink ? <Link to="/">Find a battle <ArrowRight size={14} aria-hidden="true" /></Link> : null}</div>;
}
