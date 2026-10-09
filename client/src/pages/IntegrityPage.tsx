import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ShieldCheck, ShieldAlert, ArrowLeft, RefreshCw } from 'lucide-react';
import { authRequest } from '../utils/auth-api';
import { readSessionUser } from '../utils/session';
import './IntegrityPage.css';
interface Finding { id: string; matchId: string; problemId: string; category: string; status: string; reviewReason: string | null; appeal: string | null; appealedAt: string | null }
interface Standing { banned: boolean; reason: string | null; strikes: number; threshold: number; canReview: boolean; reports: Finding[] }
interface Review extends Finding { details: string; reporter: { username: string }; subject: { username: string }; submission: { sourceCode: string; language: string; integrity: Record<string, unknown> | null }; createdAt: string }
const readable = (value: string) => value.toLowerCase().replaceAll('_', ' ');
function Appeal({ finding, onSaved }: { finding: Finding; onSaved: () => void }) {
  const [text, setText] = useState(finding.appeal ?? '');
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try { await authRequest(`/api/integrity/reports/${finding.id}/appeal`, { method: 'POST', body: JSON.stringify({ text }) }); setMessage('Appeal saved for moderator review.'); onSaved(); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to appeal.'); } finally { setBusy(false); }
  }
  return <form onSubmit={event => void submit(event)}><label>Appeal this finding<textarea rows={3} minLength={20} maxLength={2000} required value={text} onChange={e => setText(e.target.value)} placeholder="Explain the context and evidence supporting your appeal." /></label><button disabled={busy}>{busy ? 'Saving…' : finding.appeal ? 'Update appeal' : 'Submit appeal'}</button>{message ? <p role="status">{message}</p> : null}</form>;
}
function ReviewDecision({ report, onSaved }: { report: Review; onSaved: () => void }) {
  const [reason, setReason] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function decide(status: string) {
    setBusy(true); setMessage('');
    try { const result = await authRequest<{ banned: boolean; strikes: number }>(`/api/integrity/review/${report.id}`, { method: 'POST', body: JSON.stringify({ status, reason }) }); setMessage(`${result.strikes} confirmed strikes. ${result.banned ? 'Competitive ban active.' : 'Competitive access allowed.'}`); onSaved(); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to review.'); } finally { setBusy(false); }
  }
  return <div className="integrity-decision"><label>Evidence and decision rationale<textarea minLength={20} maxLength={2000} rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Record verified evidence. Similarity or solution speed alone does not prove prohibited AI use." /></label><div><button disabled={busy || reason.trim().length < 20} onClick={() => void decide('DISMISSED')}>Dismiss / reverse finding</button><button className="integrity-confirm" disabled={busy || reason.trim().length < 20} onClick={() => void decide('CONFIRMED')}>Confirm violation</button></div>{message ? <p role="status">{message}</p> : null}</div>;
}
export default function IntegrityPage({ moderation = false }: { moderation?: boolean }) {
  const [standing, setStanding] = useState<Standing | null>(null); const [reports, setReports] = useState<Review[]>([]);
  const [error, setError] = useState(''); const [revision, setRevision] = useState(0);
  const signedIn = Boolean(readSessionUser());
  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    async function load() {
      try {
        const data = await authRequest<Standing>('/api/integrity/standing', { signal: controller.signal });
        setStanding(data);
        if (moderation) setReports(await authRequest<Review[]>('/api/integrity/review', { signal: controller.signal }));
        setError('');
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load account standing.'); }
    }
    void load(); return () => controller.abort();
  }, [moderation, revision, signedIn]);
  if (!signedIn) return <Navigate to="/login" replace />;
  const refresh = () => setRevision(n => n + 1);
  return <main className="integrity-page"><div className="integrity-page-top"><Link to="/"><ArrowLeft size={15} />Lobby</Link><button onClick={refresh}><RefreshCw size={14} />Refresh</button></div>
    <div className="integrity-page-heading"><ShieldCheck size={28} /><div><span>FAIR PLAY CENTER</span><h1>{moderation ? 'Integrity review' : 'Account standing'}</h1></div></div>
    <p className="integrity-intro">Three confirmed violations on distinct battle problems trigger a competitive ban. Pending reports and automated similarity flags add no strikes. A moderator can reverse a finding after appeal.</p>
    {error ? <p role="alert" className="integrity-error">{error}</p> : null}
    {!standing && !error ? <p role="status">Loading account standing…</p> : null}
    {standing ? <><section className={`integrity-standing ${standing.banned ? 'is-banned' : ''}`}><ShieldAlert size={25} /><div><h2>{standing.banned ? 'Account banned from play' : 'Account in good standing'}</h2><p>{standing.reason || 'You can play. Reports do not alter past battle results.'}</p></div><strong>{standing.strikes}<span> / {standing.threshold} strikes</span></strong></section>
      <nav><Link to="/standing">Your findings & appeals</Link>{standing.canReview ? <Link to="/moderation">Moderator review queue</Link> : null}</nav>
      {moderation ? reports.map(report => <article className="integrity-card" key={report.id}><div className="integrity-card-title"><h2>{report.subject.username}</h2><span>{readable(report.status)}</span></div><p><strong>{readable(report.category)}</strong> · Reported by {report.reporter.username} · {new Date(report.createdAt).toLocaleString()}</p><p>{report.details}</p><details><summary>Submitted source and local advisory · {report.submission.language}</summary><pre>{report.submission.sourceCode}</pre><p>Similarity: {JSON.stringify(report.submission.integrity?.state ?? 'not assessed')}. AI authorship remains unassessed.</p></details>{report.reviewReason ? <p>Recorded decision: {report.reviewReason}</p> : null}{report.appeal ? <p className="integrity-appeal">Appeal: {report.appeal}</p> : null}<ReviewDecision report={report} onSaved={refresh} /></article>) : standing.reports.map(finding => <article className="integrity-card" key={finding.id}><div className="integrity-card-title"><h2>{readable(finding.category)}</h2><span>{readable(finding.status)}</span></div><Link to={`/battle/${finding.matchId}`}>View battle</Link><p>{finding.reviewReason || 'Awaiting independent moderator review. No strike has been added.'}</p>{finding.status === 'CONFIRMED' ? <Appeal finding={finding} onSaved={refresh} /> : null}</article>)}
      {(moderation ? standing.canReview && reports.length === 0 : standing.reports.length === 0) ? <div className="integrity-empty"><ShieldCheck size={30} /><h2>{moderation ? 'No reports to review' : 'No integrity findings'}</h2><p>Your account standing is based on reviewed evidence.</p></div> : null}
    </> : null}
  </main>;
}
