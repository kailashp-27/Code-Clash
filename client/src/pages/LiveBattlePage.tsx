import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Clock, Play, Send, Swords, Terminal, Check, ArrowLeft, Code2, ShieldCheck, ChevronRight } from 'lucide-react';
import BattleResult from '../components/BattleResult';
import { useSocketStore } from '../stores/useSocketStore';
import { apiUrl } from '../utils/api';
import { readSessionUser } from '../utils/session';
import type { SessionUser } from '../utils/session';
import type { BattleLanguage, BattleState, MatchOverPayload, SubmissionDetail, SubmissionSummary } from '../socket/events';
import './LiveBattlePage.css';
const Editor = lazy(() => import('../components/LocalCodeEditor'));

const languages: { key: BattleLanguage; label: string; monaco: string; filename: string }[] = [
  { key: 'javascript', label: 'JavaScript', monaco: 'javascript', filename: 'solution.js' },
  { key: 'python', label: 'Python 3', monaco: 'python', filename: 'solution.py' },
  { key: 'cpp', label: 'C++', monaco: 'cpp', filename: 'solution.cpp' },
  { key: 'java', label: 'Java', monaco: 'java', filename: 'Main.java' },
];
function formatDuration(seconds: number | null) {
  if (seconds === null) return '—';
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
}
function label(value: string) { return value.replaceAll('_', ' ').toLowerCase(); }
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Your session has ended. Sign in again to continue.');
  const response = await fetch(apiUrl(path), { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers } });
  const body = await response.json();
  if (!response.ok) {
    const message = typeof body.error === 'string' ? body.error : body.error?.message;
    throw new Error(message || (response.status === 401 ? 'Your session has expired. Sign in again.' : `Request failed (${response.status}).`));
  }
  return body as T;
}
function readDrafts(key: string): Record<string, string> {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(key) || '{}');
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      return Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    }
  } catch { /* The editor works when storage is unavailable. */ }
  return {};
}

function SubmissionOutput({ submission, detail }: { submission: SubmissionSummary; detail?: SubmissionDetail }) {
  const finished = submission.state === 'FINISHED';
  return <div className="battle-output-content">
    <div className="battle-output-summary"><span className={`battle-verdict ${submission.verdict === 'ACCEPTED' ? 'battle-positive' : finished ? 'battle-negative' : ''}`}>{label(submission.verdict || submission.state)}</span>
      <span>{submission.mode === 'RUN' ? 'Examples' : 'Full test suite'} · {finished ? `${submission.passed}/${submission.total} passed` : 'Judging on the server…'}</span></div>
    <p className="battle-muted">{submission.mode === 'RUN' ? 'Running examples does not change battle progress.' : 'Hidden test inputs and execution output stay private.'}</p>
    {submission.time != null || submission.memory != null ? <div className="battle-metrics">
      {submission.time != null ? <span>Execution: {submission.time}s</span> : null}
      {submission.memory != null ? <span>Memory: {(submission.memory / 1024).toFixed(1)} MiB</span> : null}
    </div> : null}
    {!detail ? <p className="battle-muted">Loading submission details…</p> : null}
    {detail?.compileOutput ? <div className="battle-diagnostic"><h3>Compiler output</h3><pre>{detail.compileOutput}</pre></div> : null}
    {detail?.examples?.map((example, index) => <details className="battle-example-result" key={index} open={example.verdict !== 'ACCEPTED'}>
      <summary>Example {index + 1} · {label(example.verdict)}</summary><h3>Output</h3><pre>{example.stdout || '(no output)'}</pre>
      {example.stderr ? <><h3>Diagnostics</h3><pre>{example.stderr}</pre></> : null}</details>)}
    {detail?.integrity ? <IntegrityAdvisory integrity={detail.integrity} /> : null}
  </div>;
}

function IntegrityAdvisory({ integrity }: { integrity: Record<string, unknown> }) {
  const similarity = integrity.similarity as { maxScore?: number | null } | undefined;
  const score = typeof similarity?.maxScore === 'number' ? Math.round(similarity.maxScore * 100) : null;
  const signals = Array.isArray(integrity.signals) ? integrity.signals.filter((s): s is string => typeof s === 'string') : [];
  return <details className="battle-integrity"><summary>Submission integrity advisory</summary>
    <h3>{integrity.state === 'review_suggested' ? 'Similarity deserves a closer look' : integrity.state === 'no_similarity_found' ? 'No high similarity found' : 'Not enough evidence to assess similarity'}</h3>
    {score !== null ? <p>Local code similarity: {score}% overlap with an eligible comparison submission.</p> : null}
    <p>AI authorship: not assessed. Code alone cannot prove whether AI was used.</p>
    {signals.map(signal => <p className="battle-muted" key={signal}>{signal}</p>)}
    <p className="battle-muted">Only you can see this advisory. It does not change your battle result or Elo.</p>
  </details>;
}

function BattleWorkspace({ roomId, user }: { roomId: string; user: SessionUser }) {
  const socket = useSocketStore(state => state.socket);
  const isConnected = useSocketStore(state => state.isConnected);
  const connect = useSocketStore(state => state.connect);
  const [match, setMatch] = useState<BattleState | null>(null);
  const [result, setResult] = useState<MatchOverPayload | null>(null);
  const [error, setError] = useState('');
  const [requestError, setRequestError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [cancelledReason, setCancelledReason] = useState('');
  const [language, setLanguage] = useState<BattleLanguage>('javascript');
  const [problemId, setProblemId] = useState('');
  const [now, setNow] = useState(Date.now);
  const [sending, setSending] = useState<'RUN' | 'SUBMIT' | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [localSubmissions, setLocalSubmissions] = useState<Record<string, SubmissionSummary>>({});
  const [details, setDetails] = useState<Record<string, SubmissionDetail>>({});
  const [detailError, setDetailError] = useState('');
  const [forfeitPending, setForfeitPending] = useState(false);
  const [reviewCode, setReviewCode] = useState(false);
  const storageKey = `codeclash:drafts:v1:${user.id}:${roomId}`;
  const [drafts, setDrafts] = useState(() => readDrafts(storageKey));
  const actionLock = useRef(false);
  const pendingRequest = useRef<{ fingerprint: string; id: string } | null>(null);
  const forfeitTimer = useRef<number | undefined>(undefined);

  useEffect(() => { connect(); }, [connect]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(timer); window.clearTimeout(forfeitTimer.current); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    let busy = false;
    let finished = false;
    async function refresh() {
      if (busy || controller.signal.aborted) return;
      busy = true;
      try {
        const snapshot = await request<BattleState>(`/api/matches/${encodeURIComponent(roomId)}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setMatch(snapshot); setError('');
        if (snapshot.result) setResult(snapshot.result);
        finished = snapshot.status === 'COMPLETED' || snapshot.status === 'CANCELLED';
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load battle.');
      } finally { busy = false; }
    }
    async function poll() {
      await refresh();
      if (!controller.signal.aborted && !finished) timer = window.setTimeout(() => void poll(), 2000);
    }
    const refreshEvent = () => { void refresh(); };
    const onSnapshot = (snapshot: BattleState) => { if (snapshot.roomId === roomId) refreshEvent(); };
    const onResult = (payload: MatchOverPayload) => { if (payload.matchId === roomId) { setResult(payload); refreshEvent(); } };
    const onCancelled = (payload: { roomId: string; reason: string }) => { if (payload.roomId === roomId) { setCancelledReason(payload.reason); refreshEvent(); } };
    const onError = (payload: { message: string }) => setRequestError(payload.message);
    const onConnect = () => { socket?.emit('join_battle', { roomId }); refreshEvent(); };
    socket?.on('connect', onConnect); socket?.on('match_found', onSnapshot); socket?.on('battle_sync', onSnapshot);
    socket?.on('battle_progress', refreshEvent); socket?.on('submission_updated', refreshEvent);
    socket?.on('match_over', onResult); socket?.on('match_cancelled', onCancelled); socket?.on('server_error', onError);
    if (socket?.connected) socket.emit('join_battle', { roomId });
    void poll();
    return () => {
      controller.abort(); window.clearTimeout(timer);
      socket?.off('connect', onConnect); socket?.off('match_found', onSnapshot); socket?.off('battle_sync', onSnapshot);
      socket?.off('battle_progress', refreshEvent); socket?.off('submission_updated', refreshEvent);
      socket?.off('match_over', onResult); socket?.off('match_cancelled', onCancelled); socket?.off('server_error', onError);
    };
  }, [roomId, socket]);

  const submissionMap = new Map<string, SubmissionSummary>();
  for (const item of match?.submissions ?? []) submissionMap.set(item.id, item);
  for (const item of Object.values(localSubmissions)) if (!submissionMap.has(item.id)) submissionMap.set(item.id, item);
  for (const item of Object.values(details)) submissionMap.set(item.id, item);
  const submissions = Array.from(submissionMap.values()).sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
  const selected = submissions.find(item => item.id === selectedId) ?? submissions[0];
  const pendingIds = submissions.filter(item => item.state !== 'FINISHED').map(item => item.id).sort().join(',');
  const detailId = selected?.id;
  const hasDetail = !!(detailId && details[detailId]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    const ids = new Set(pendingIds ? pendingIds.split(',') : []);
    if (detailId && !hasDetail) ids.add(detailId);
    async function poll() {
      await Promise.all(Array.from(ids).map(async id => {
        try {
          const detail = await request<SubmissionDetail>(`/api/submissions/${encodeURIComponent(id)}`, { signal: controller.signal });
          if (controller.signal.aborted) return;
          setDetails(previous => ({ ...previous, [id]: detail })); setDetailError('');
          if (detail.state === 'FINISHED') ids.delete(id);
        } catch (failure) {
          if (!controller.signal.aborted) setDetailError(failure instanceof Error ? failure.message : 'Could not load submission.');
        }
      }));
      if (!controller.signal.aborted && ids.size) timer = window.setTimeout(() => void poll(), 1000);
    }
    if (ids.size) void poll();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [pendingIds, detailId, hasDetail]);

  const problem = match?.problems.find(item => item.id === problemId) ?? match?.problems[0];
  const draftKey = `${problem?.id ?? ''}:${language}`;
  const sourceCode = drafts[draftKey] ?? problem?.starters[language] ?? '';
  const languageInfo = languages.find(item => item.key === language)!;
  const mine = match?.progress[user.id];
  const opponentEntry = Object.entries(match?.players ?? {}).find(([id]) => id !== user.id);
  const opponentSolved = opponentEntry ? match?.progress[opponentEntry[0]]?.solved ?? 0 : 0;
  const secondsLeft = match ? Math.max(0, (match.endTime - now) / 1000) : null;
  const ended = !!result || !!cancelledReason || match?.status === 'COMPLETED' || match?.status === 'CANCELLED';
  const canSubmit = !!problem && match?.status === 'IN_PROGRESS' && !ended && (secondsLeft ?? 0) > 0;
  const hasPending = !!pendingIds || !!sending;
  function updateDraft(value: string | undefined) {
    const updated = { ...drafts, [draftKey]: value ?? '' };
    setDrafts(updated);
    try { sessionStorage.setItem(storageKey, JSON.stringify(updated)); }
    catch { setStorageError('Draft storage is unavailable. Keep a copy of your code before reloading.'); }
  }

  async function send(mode: 'RUN' | 'SUBMIT') {
    if (!problem || !canSubmit || hasPending || actionLock.current) return;
    if (!sourceCode.trim()) { setRequestError('Write a solution before running or submitting.'); return; }
    actionLock.current = true; setSending(mode); setRequestError('');
    const fingerprint = JSON.stringify({ problemId: problem.id, language, sourceCode, mode });
    const requestId = pendingRequest.current?.fingerprint === fingerprint ? pendingRequest.current.id : crypto.randomUUID();
    pendingRequest.current = { fingerprint, id: requestId };
    try {
      const response = await request<{ id: string; state: SubmissionSummary['state'] }>(`/api/matches/${encodeURIComponent(roomId)}/${mode === 'RUN' ? 'runs' : 'submissions'}`, {
        method: 'POST', body: JSON.stringify({ problemId: problem.id, language, sourceCode, requestId }),
      });
      pendingRequest.current = null;
      setLocalSubmissions(previous => ({ ...previous, [response.id]: {
        id: response.id, problemId: problem.id, mode, state: response.state, verdict: null,
        passed: 0, total: mode === 'RUN' ? problem.examples.length : problem.totalTestCases,
        time: null, memory: null, receivedAt: new Date().toISOString(), finishedAt: null,
      } }));
      setSelectedId(response.id);
    } catch (failure) { setRequestError(failure instanceof Error ? failure.message : 'Submission could not be sent. Try again.'); }
    finally { actionLock.current = false; setSending(null); }
  }
  function forfeit() {
    if (!socket?.connected || ended || forfeitPending) return;
    if (!window.confirm('Forfeit this battle? Your opponent will win and your rating will be updated.')) return;
    setForfeitPending(true); socket.emit('forfeit_match', { roomId });
    forfeitTimer.current = window.setTimeout(() => setForfeitPending(false), 5000);
  }

  return <main className={`live-battle${ended ? ' live-battle--ended' : ''}`}>
    <header className="battle-header">
      <Link to="/" className="battle-brand" aria-label="Code Clash lobby"><Swords size={21} /><span>CODE<span>CLASH</span></span></Link>
      <div className="battle-header-center">
        <div className="battle-player"><strong>{match?.players[user.id]?.username ?? user.username}</strong><span>{mine?.solved ?? 0}/{match?.problems.length ?? 2} solved</span></div>
        <div className={`battle-clock ${!ended && (secondsLeft ?? 999) < 60 ? 'battle-clock--urgent' : ''}`} aria-label={ended ? 'Battle finished' : 'Time remaining'}><Clock size={16} /><time>{ended ? 'Finished' : formatDuration(secondsLeft)}</time></div>
        <div className="battle-player battle-player--opponent"><strong>{opponentEntry?.[1].username ?? 'Opponent'}</strong><span>{opponentSolved}/{match?.problems.length ?? 2} solved</span></div>
      </div>
      {ended ? <Link className="battle-button" to="/profile">My profile</Link> : <button className="battle-button battle-forfeit" disabled={!isConnected || forfeitPending} onClick={forfeit}>{forfeitPending ? 'Forfeiting…' : 'Forfeit'}</button>}
    </header>
    <div className="battle-statusline"><span><i className={isConnected ? 'battle-dot battle-dot--online' : 'battle-dot'} />{ended ? 'Result saved' : isConnected ? 'Live connection' : 'Reconnecting · HTTP updates remain active'}</span><span><ShieldCheck size={12} /> Ranked arena · {roomId.slice(0, 8)}</span></div>
    {error ? <div className="battle-alert" role="alert">{error} <Link to="/login">Sign in</Link> · <Link to="/">Lobby</Link></div> : null}
    {requestError ? <div className="battle-alert" role="alert">{requestError}<button aria-label="Dismiss error" onClick={() => setRequestError('')}>×</button></div> : null}
    {storageError ? <div className="battle-alert" role="status">{storageError}</div> : null}
    {match?.status === 'DRAINING' || (!ended && match && secondsLeft === 0) ? <div className="battle-notice" role="status">Time is up. The server is finishing eligible submissions before resolving the battle.</div> : null}
    {result && match ? !reviewCode ? <BattleResult result={result} match={match} userId={user.id} onReview={() => { setReviewCode(true); if (selected) { setProblemId(selected.problemId); const detail = details[selected.id]; if (detail) setLanguage(detail.language); } }} /> : null : cancelledReason || match?.status === 'CANCELLED' ? <section className="battle-result"><h1>Battle cancelled</h1><p>{label(cancelledReason || 'The battle could not be completed.')}</p><p>No rating change.</p><Link to="/" className="battle-button">Return to lobby</Link></section> : null}
    {ended && reviewCode ? <div className="battle-reviewbar"><div><Code2 size={20} /><div><strong>Your saved solution</strong><span>Review your code, test results, and submission history.</span></div></div><button className="battle-button" onClick={() => setReviewCode(false)}><ArrowLeft size={14} />Back to result</button></div> : null}
    {!ended && match ? <div className="battle-roundbar"><div><span className="battle-eyebrow">THE CHALLENGE</span><strong>Two problems. One winner.</strong><p>Solve both first, or finish with more solves when the clock expires.</p></div><div className="battle-round-progress" aria-label="Your solved problems">{match.problems.map((p, i) => <span key={p.id} className={mine?.problemIds.includes(p.id) ? 'is-solved' : ''}>{mine?.problemIds.includes(p.id) ? <Check size={13} /> : `0${i + 1}`} {p.title}</span>)}</div></div> : null}
    {!match ? <div className="battle-loading" role="status"><Swords size={32} /><h1>Loading battle</h1><p>Retrieving your problem set and saved progress…</p></div> : !ended || reviewCode ? <div className="battle-workspace" id="battle-workspace">
      <section className="battle-problem-panel" aria-label="Problem statement">
        <nav className="battle-problem-tabs" aria-label="Battle problems">{match.problems.map((item, index) => <button key={item.id} aria-pressed={problem?.id === item.id} className={problem?.id === item.id ? 'is-active' : ''} onClick={() => { setProblemId(item.id); if (ended) { const saved = submissions.find(s => s.problemId === item.id); if (saved) setSelectedId(saved.id); } }}>{mine?.problemIds.includes(item.id) ? <Check size={14} /> : <span>{index + 1}</span>}{item.title}</button>)}</nav>
        {problem ? <div className="battle-statement"><div className="battle-statement-heading"><span>PROBLEM {String(match.problems.findIndex(p => p.id === problem.id) + 1).padStart(2, '0')}</span><span className={`battle-difficulty battle-difficulty--${problem.difficulty.toLowerCase()}`}>{problem.difficulty}</span></div><h1>{problem.title}</h1><div className="battle-topic"><span>{problem.topic}</span><span>{problem.totalTestCases} judge tests</span></div><p className="battle-description">{problem.description}</p>
          <div className="battle-contract"><strong>Program contract</strong><p>Write a complete program that reads standard input and prints the required answer to standard output. Each test runs separately.</p><p>Run checks visible examples. Submit checks the full suite of {problem.totalTestCases} tests.</p></div>
          <h2>Examples</h2>{problem.examples.map((example, index) => <article className="battle-example" key={index}><h3>Example {index + 1}</h3><div><span>Input</span><pre>{example.stdin || '(empty input)'}</pre></div><div><span>Expected output</span><pre>{example.stdout || '(empty output)'}</pre></div></article>)}
        </div> : <p className="battle-muted">No assigned problems are available.</p>}
      </section>
      <section className="battle-editor-panel" aria-label="Solution editor">
        <div className="battle-editor-toolbar"><span className="battle-filename"><Code2 size={15} />{languageInfo.filename}<span>{ended ? 'READ ONLY' : 'YOUR SOLUTION'}</span></span><label className="battle-language-label">Language<select value={language} onChange={event => setLanguage(event.target.value as BattleLanguage)}>{languages.filter(item => problem?.starters[item.key] !== undefined).map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label></div>
        <div className="battle-editor"><Suspense fallback={<p className="battle-loading-editor">Loading editor…</p>}><Editor key={draftKey} path={`${user.id}/${roomId}/${problem?.id}/${languageInfo.filename}`} height="100%" theme="codeclash-arena" language={languageInfo.monaco} value={ended && selected?.problemId === problem?.id && details[selected.id]?.language === language ? details[selected.id].sourceCode : sourceCode} onChange={updateDraft} loading={<p className="battle-loading-editor">Loading editor…</p>} options={{ ariaLabel: `${problem?.title ?? 'Problem'} solution in ${languageInfo.label}`, minimap: { enabled: false }, fontSize: 13, lineHeight: 22, fontFamily: "'JetBrains Mono', monospace", scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 16 }, tabSize: 4, readOnly: ended }} /></Suspense></div>
        <div className="battle-actions"><span><ShieldCheck size={13} />{sending ? 'Sending code…' : hasPending ? 'Judging submission…' : ended ? 'Saved submission · Read only' : 'Draft saved · Server judging'}</span>{!ended ? <><button className="battle-button" disabled={!canSubmit || hasPending} onClick={() => void send('RUN')}><Play size={15} />{sending === 'RUN' ? 'Sending…' : 'Run examples'}</button><button className="battle-button battle-button--primary" disabled={!canSubmit || hasPending} onClick={() => void send('SUBMIT')}><Send size={15} />{sending === 'SUBMIT' ? 'Sending…' : 'Submit solution'}<ChevronRight size={14} /></button></> : <span className="battle-review-hint">Choose a submission below to inspect its results.</span>}</div>
        <section className="battle-console" aria-label="Submission results"><div className="battle-console-header"><h2><Terminal size={15} />Results</h2><label>Submission<select value={selected?.id ?? ''} onChange={event => setSelectedId(event.target.value)} disabled={!submissions.length}><option value="" disabled>No submissions yet</option>{submissions.map(item => <option key={item.id} value={item.id}>{new Date(item.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · {match.problems.find(p => p.id === item.problemId)?.title ?? 'Problem'} · {item.mode === 'RUN' ? 'Run' : 'Submit'} · {label(item.verdict || item.state)}</option>)}</select></label></div>
          {detailError ? <p className="battle-alert" role="alert">{detailError}</p> : null}
          {selected ? <SubmissionOutput submission={selected} detail={details[selected.id]} /> : <div className="battle-console-empty"><Terminal size={24} /><p>Run the examples to check your program.</p><span>Submit when you are ready for the hidden tests.</span></div>}
        </section>
      </section>
    </div> : null}
    {ended ? <footer className="battle-footer"><Link to="/"><ArrowLeft size={14} />Return to lobby</Link><Link to="/standing">Account standing & appeals</Link></footer> : null}
  </main>;
}

export const LiveBattlePage = () => {
  const { roomId } = useParams();
  const [user] = useState(readSessionUser);
  if (!user || !localStorage.getItem('token')) return <Navigate to="/login" replace />;
  if (!roomId) return <Navigate to="/" replace />;
  return <BattleWorkspace key={`${user.id}:${roomId}`} roomId={roomId} user={user} />;
};
