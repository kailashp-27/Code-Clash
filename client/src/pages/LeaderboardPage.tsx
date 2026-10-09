import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, ArrowLeft, RefreshCw } from 'lucide-react';
import { apiUrl } from '../utils/api';
import './ProfilePage.css';
interface Rankings { total: number; players: { id: string; username: string; position: number; rating: number; wins: number; losses: number; draws: number; isYou: boolean }[] }
export default function LeaderboardPage() {
  const [data, setData] = useState<Rankings | null>(null), [error, setError] = useState(''), [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(apiUrl('/api/profile/leaderboard'), { headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` }, signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(response.status === 401 ? 'Sign in to see the rankings.' : 'Unable to load the leaderboard.'); return response.json() as Promise<Rankings>; })
      .then(value => { setData(value); setError(''); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [version]);
  return <main className="clash-profile"><div className="profile-container"><div className="profile-page-heading"><div><p className="profile-eyebrow">THE RANKED ARENA</p><h1><Trophy aria-hidden="true" /> Leaderboard</h1><p>{data ? `${data.total} registered contenders · Top 100 by Elo` : 'Every point earned in battle.'}</p></div><button className="profile-button" onClick={() => setVersion(v => v + 1)}><RefreshCw size={16} />Refresh</button></div>
    {error ? <div role="alert">{error} <Link to="/login">Sign in</Link></div> : !data ? <p role="status">Loading rankings…</p> : <section className="profile-panel"><div className="profile-table-scroll"><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}><caption className="profile-eyebrow">Live ranked standings · equal ratings share a position</caption><thead><tr>{['Rank', 'Player', 'Elo', 'Record'].map(label => <th key={label} scope="col" style={{ padding: 16 }}>{label}</th>)}</tr></thead><tbody>{data.players.map(player => <tr key={player.id} style={{ background: player.isYou ? 'rgba(0,229,255,.07)' : undefined, borderTop: '1px solid #252b40' }}><td style={{ padding: 16 }}>#{player.position}</td><th scope="row" style={{ padding: 16 }}>{player.username}{player.isYou ? ' · You' : ''}</th><td style={{ padding: 16, color: '#00e5ff', fontWeight: 700 }}>{player.rating}</td><td style={{ padding: 16, whiteSpace: 'nowrap' }}>{player.wins}W · {player.losses}L · {player.draws}D</td></tr>)}</tbody></table></div></section>}
    <Link className="profile-button" to="/"><ArrowLeft size={16} />Back to the arena</Link></div></main>;
}
