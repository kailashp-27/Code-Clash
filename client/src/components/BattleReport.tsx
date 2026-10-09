import { useEffect, useState } from 'react';
import { Flag, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { authRequest } from '../utils/auth-api';
interface Target { id: string; problemId: string; language: string; receivedAt: string; verdict: string; reports: { id: string; status: string }[] }
export default function BattleReport({ matchId, problems }: { matchId: string; problems: { id: string; title: string }[] }) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [target, setTarget] = useState('');
  const [category, setCategory] = useState('SUSPECTED_AI');
  const [details, setDetails] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    authRequest<Target[]>(`/api/integrity/matches/${matchId}/targets`, { signal: controller.signal }).then(data => { setTargets(data); setTarget(data.find(t => !t.reports.length)?.id ?? ''); }).catch(e => { if (!controller.signal.aborted) setMessage(e.message); });
    return () => controller.abort();
  }, [matchId]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const saved = await authRequest<{ id: string; status: string }>('/api/integrity/reports', { method: 'POST', body: JSON.stringify({ submissionId: target, category, details }) });
      setTargets(previous => previous.map(t => t.id === target ? { ...t, reports: [saved] } : t));
      setMessage('Report saved for moderator review. A pending report does not add a strike.'); setDetails('');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to save report.'); }
    finally { setBusy(false); }
  }
  return <details className="battle-report"><summary><Flag size={15} /> Report a concern <span>Private moderator review</span></summary>
    <p>Suspect prohibited AI assistance or copying? Choose a submission and describe specific evidence. Three confirmed violations on distinct battle problems trigger a ban. Duplicate or unreviewed reports add no strikes.</p>
    {targets.length ? <form onSubmit={event => void submit(event)}>
      <label>Opponent submission<select required value={target} onChange={e => setTarget(e.target.value)}><option value="" disabled>Select a submission</option>{targets.map(t => <option key={t.id} value={t.id} disabled={t.reports.length > 0}>{problems.find(p => p.id === t.problemId)?.title ?? 'Problem'} · {new Date(t.receivedAt).toLocaleTimeString()} · {t.reports.length ? `Reported (${t.reports[0].status.toLowerCase()})` : t.verdict.toLowerCase()}</option>)}</select></label>
      <label>Concern<select value={category} onChange={e => setCategory(e.target.value)}><option value="SUSPECTED_AI">Suspected prohibited AI assistance</option><option value="COPYING">Suspected copying</option><option value="OTHER">Other integrity concern</option></select></label>
      <label>Evidence<textarea required minLength={20} maxLength={2000} rows={3} value={details} onChange={e => setDetails(e.target.value)} placeholder="Describe what you observed. A fast solution alone is not evidence of AI use." /></label>
      <button className="battle-button" disabled={busy || !target || targets.find(t => t.id === target)?.reports.length !== 0}><Flag size={14} />{busy ? 'Saving…' : 'Submit report'}</button>
    </form> : <p>No finished opponent submissions are available to report.</p>}
    {message ? <p role="status">{message}</p> : null}
    <Link to="/standing"><ShieldCheck size={14} /> Account standing & appeals</Link>
  </details>;
}
