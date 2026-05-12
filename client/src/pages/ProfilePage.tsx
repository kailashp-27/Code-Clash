import { useNavigate } from 'react-router-dom';
import { Copy, Share2, Check, X, Swords } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function ProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [profileStats, setProfileStats] = useState<any>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (storedUser && token) {
      setUser(JSON.parse(storedUser));
      fetch('http://localhost:5000/api/profile', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => setProfileStats(data))
        .catch(err => console.error(err));
    } else {
      navigate('/auth');
    }
  }, [navigate]);

  if (!user || !profileStats) return <div className="flex items-center justify-center h-full text-zinc-400">Loading profile...</div>;

  const elo = profileStats.rating || 1200;
  const username = user.username || 'Player';
  const handle = `@${username.toLowerCase().replace(/\s+/g, '_')}`;
  const initials = username.substring(0, 2).toUpperCase();

  return (
    <div className="flex-1 h-full overflow-y-auto w-full p-4 md:p-8 text-zinc-300 font-sans space-y-6">
      
      {/* SECTION 1: IDENTITY */}
      <div className="bg-[#1C1C1E] border border-zinc-800/80 rounded-xl p-6 relative shadow-lg">
        <div className="absolute top-6 right-6 text-right text-xs text-zinc-500">
          <div>Joined Jan 2025</div>
          <div className="text-zinc-400 mt-1">Active today</div>
        </div>
        
        <div className="flex items-start gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-900 flex items-center justify-center text-2xl font-bold shadow-md">
            {initials}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">{username}</h1>
            <div className="text-zinc-400 text-sm mb-3">{handle} - CSE - Batch 2026<br/>Arun University</div>
            
            <div className="flex flex-wrap items-center gap-3 text-sm">
               <span className="px-3 py-1 bg-white text-blue-600 rounded-full font-medium shadow-sm flex items-center gap-1">
                 <span className="text-blue-500">💠</span> Diamond
               </span>
               <span className="text-zinc-300">Rating: {elo}</span>
               <span className="text-zinc-500">Top: 8%</span>
            </div>
          </div>
        </div>

        <div className="mt-4 max-w-xl">
          <div className="flex justify-between text-xs text-zinc-400 mb-2">
            <span>Diamond progress</span>
          </div>
          <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden flex">
            <div className="h-full bg-blue-500 w-[60%]" />
          </div>
          <div className="flex justify-between text-xs text-zinc-500 mt-2">
            <span>1600</span>
            <span>76 rating points to Master</span>
            <span>1800</span>
          </div>
        </div>
        
      </div>

      {/* SECTION 2: BATTLE STATS */}
      <div className="bg-[#1C1C1E] border border-zinc-800/80 rounded-xl p-6 shadow-lg">
        <h2 className="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase mb-4">BATTLE STATS</h2>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="bg-[#141415] p-4 rounded-lg border border-zinc-800/50">
            <div className="text-xs text-zinc-500 mb-1">Total battles</div>
            <div className="text-2xl font-bold text-white mb-1">{profileStats.totalBattles}</div>
            <div className="text-[10px] text-zinc-500 leading-tight">Ranked mode</div>
          </div>
          <div className="bg-[#141415] p-4 rounded-lg border border-zinc-800/50">
            <div className="text-xs text-zinc-500 mb-1">Win rate</div>
            <div className="text-2xl font-bold text-white mb-1">{profileStats.winRate}%</div>
            <div className="text-[10px] text-zinc-500 leading-tight">{profileStats.wins}W - {profileStats.losses}L</div>
          </div>
          <div className="bg-[#141415] p-4 rounded-lg border border-zinc-800/50">
            <div className="text-xs text-zinc-500 mb-1">Current streak</div>
            <div className="text-2xl font-bold text-green-400 mb-1 flex items-center gap-1">5W <span className="text-sm">🔥</span></div>
            <div className="text-[10px] text-zinc-500 leading-tight">Best: 11W</div>
          </div>
          <div className="bg-[#141415] p-4 rounded-lg border border-zinc-800/50">
            <div className="text-xs text-zinc-500 mb-1">Avg solve time</div>
            <div className="text-2xl font-bold text-white mb-1">18m</div>
            <div className="text-[10px] text-zinc-500 leading-tight">Fastest: 4m 11s</div>
          </div>
          <div className="bg-[#141415] p-4 rounded-lg border border-zinc-800/50">
            <div className="text-xs text-zinc-500 mb-1">Boss problems</div>
            <div className="text-2xl font-bold text-white mb-1">14</div>
            <div className="text-[10px] text-zinc-500 leading-tight">solved of 31 seen</div>
          </div>
          <div className="bg-[#141415] p-4 rounded-lg border border-zinc-800/50">
            <div className="text-xs text-zinc-500 mb-1">Peak rating</div>
            <div className="text-2xl font-bold text-white mb-1">1821</div>
            <div className="text-[10px] text-zinc-500 leading-tight">Apr 12, 2025</div>
          </div>
        </div>
      </div>

      {/* SECTION 3: RATING JOURNEY */}
      <div className="bg-[#1C1C1E] border border-zinc-800/80 rounded-xl p-6 shadow-lg">
        <h2 className="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase mb-4">RATING JOURNEY</h2>
        <RatingChart />
      </div>

      {/* SECTION 4: TOPIC STRENGTH */}
      <div className="bg-[#1C1C1E] border border-zinc-800/80 rounded-xl p-6 shadow-lg">
        <h2 className="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase mb-6">TOPIC STRENGTH</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
          <TopicBar label="Arrays" percent={91} color="bg-green-500" />
          <TopicBar label="Recursion" percent={68} color="bg-orange-500" />
          <TopicBar label="Trees" percent={84} color="bg-green-500" />
          <TopicBar label="Stack/Queue" percent={78} color="bg-green-500" />
          <TopicBar label="Strings" percent={75} color="bg-green-500" />
          <TopicBar label="DP" percent={32} color="bg-red-500" />
          <TopicBar label="Graphs" percent={61} color="bg-orange-500" />
          <TopicBar label="Sorting" percent={44} color="bg-red-500" />
        </div>
        <div className="flex flex-wrap gap-6 mt-8 text-[11px] text-zinc-400 font-medium">
           <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500" /> Strong: Arrays, Trees, Strings</div>
           <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-orange-500" /> Average: Graphs, Recursion</div>
           <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500" /> Weak: DP, Sorting</div>
        </div>
      </div>

      {/* SECTION 5: MODE PERFORMANCE */}
      <div className="bg-[#1C1C1E] border border-zinc-800/80 rounded-xl p-6 shadow-lg">
        <h2 className="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase mb-6">MODE PERFORMANCE</h2>
        <div className="space-y-4">
          <ModeBar icon="⚔️" label="Ranked" percent={64} battles={89} color="bg-blue-500" />
          <ModeBar icon="🎮" label="Casual" percent={60} battles={35} color="bg-blue-400" />
          <ModeBar icon="⚡" label="Blitz" percent={71} battles={22} color="bg-orange-500" />
          <ModeBar icon="👁️" label="Blind" percent={44} battles={18} color="bg-purple-500" />
        </div>
      </div>

      {/* SECTION 6: ACHIEVEMENTS */}
      <div className="bg-[#1C1C1E] border border-zinc-800/80 rounded-xl p-6 shadow-lg">
        <h2 className="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase mb-6">ACHIEVEMENTS  14 / 39</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#141415] p-4 rounded-lg border border-zinc-800/50 flex items-center text-left gap-3">
            <div className="text-2xl">🩸</div>
            <div>
              <div className="text-sm font-medium text-white mb-0.5">First blood</div>
              <div className="text-[10px] text-zinc-500 leading-tight">Won first battle</div>
            </div>
          </div>
          <div className="bg-[#141415] p-4 rounded-lg border border-zinc-800/50 flex items-center text-left gap-3">
            <div className="text-2xl">🔥</div>
            <div>
              <div className="text-sm font-medium text-white mb-0.5">On fire</div>
              <div className="text-[10px] text-zinc-500 leading-tight">7-day streak</div>
            </div>
          </div>
          <div className="bg-[#141415] p-4 rounded-lg border border-zinc-800/50 flex items-center text-left gap-3">
            <div className="text-2xl">⚡</div>
            <div>
              <div className="text-sm font-medium text-white mb-0.5">Blitz king</div>
              <div className="text-[10px] text-zinc-500 leading-tight">Won 10 blitz rounds</div>
            </div>
          </div>
          <div className="bg-[#141415] p-4 rounded-lg border border-zinc-800/50 flex items-center text-left gap-3">
            <div className="text-2xl">🧠</div>
            <div>
              <div className="text-sm font-medium text-white mb-0.5">Mind reader</div>
              <div className="text-[10px] text-zinc-500 leading-tight">Won 5 blind battles</div>
            </div>
          </div>
          <div className="bg-[#141415] p-4 rounded-lg border border-zinc-800/50 flex items-center text-left gap-3">
            <div className="text-2xl">💠</div>
            <div>
              <div className="text-sm font-medium text-white mb-0.5">Diamond</div>
              <div className="text-[10px] text-zinc-500 leading-tight">Reached Diamond tier</div>
            </div>
          </div>
          <div className="bg-[#141415] p-4 rounded-lg border border-zinc-800/50 flex items-center text-left gap-3">
            <div className="text-2xl">🔄</div>
            <div>
              <div className="text-sm font-medium text-white mb-0.5">Comeback kid</div>
              <div className="text-[10px] text-zinc-500 leading-tight">Win after 5 loss streak</div>
            </div>
          </div>
          <div className="bg-[#141415] p-4 rounded-lg border border-zinc-800/50 flex items-center text-left gap-3 opacity-50">
            <div className="text-2xl grayscale">🔒</div>
            <div>
              <div className="text-sm font-medium text-zinc-500 mb-0.5">???</div>
              <div className="text-[10px] text-zinc-600 leading-tight">Hidden until earned</div>
            </div>
          </div>
          <div className="bg-[#141415] p-4 rounded-lg border border-zinc-800/50 flex items-center text-left gap-3 opacity-50">
            <div className="text-2xl grayscale">🔒</div>
            <div>
              <div className="text-sm font-medium text-zinc-500 mb-0.5">???</div>
              <div className="text-[10px] text-zinc-600 leading-tight">Hidden until earned</div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 7: RECENT BATTLES */}
      <div className="bg-[#1C1C1E] border border-zinc-800/80 rounded-xl p-6 shadow-lg">
        <h2 className="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase mb-6">RECENT BATTLES</h2>
        <div className="space-y-2">
          {profileStats.recentMatches?.length > 0 ? profileStats.recentMatches.map((m: any) => (
            <BattleRow 
              key={m.id} 
              result={m.isWin ? "WIN" : "LOSS"} 
              opponent={m.opponent} 
              mode="Ranked" 
              elo={m.ratingChange ? (m.ratingChange > 0 ? `+${m.ratingChange}` : `${m.ratingChange}`) : "0"} 
              details={new Date(m.createdAt).toLocaleDateString()} 
            />
          )) : (
            <div className="text-zinc-500 text-sm">No recent battles.</div>
          )}
        </div>
      </div>

      {/* SECTION 8: SKILL PASSPORT */}
      <div className="bg-[#1C1C1E] border border-zinc-800/80 rounded-xl p-6 shadow-lg">
        <h2 className="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase mb-6">SKILL PASSPORT</h2>
        <div className="bg-[#141415] border border-zinc-800/50 rounded-xl p-6 relative">
          <div className="text-[10px] text-zinc-500 mb-4 tracking-wide">Verified by CodeClash battle data</div>
          <div className="text-sm md:text-base text-zinc-300 mb-8 pr-12 leading-relaxed font-medium">
            "{username.split(' ')[0]} consistently solves medium-level array and graph problems under 20 minutes in live, head-to-head competitive settings."
          </div>
          
          <div className="grid grid-cols-3 gap-4 mb-6">
             <div>
               <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wider">Rating</div>
               <div className="text-xl text-white font-medium">{elo}</div>
             </div>
             <div>
               <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wider">Tier</div>
               <div className="text-xl text-white font-medium">Diamond</div>
             </div>
             <div>
               <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wider">Win rate</div>
               <div className="text-xl text-white font-medium">{profileStats.winRate}%</div>
             </div>
          </div>
          
          <div className="flex items-center justify-between pt-6 border-t border-zinc-800/50 mt-4">
             <div className="text-[10px] md:text-xs text-zinc-500">codeclash.io/u/{username.toLowerCase().replace(/\s+/g, '_')}</div>
             <button className="flex items-center gap-2 px-4 py-2 bg-zinc-800/80 hover:bg-zinc-700 rounded-lg text-xs font-medium text-white transition-colors border border-zinc-700/50">
               <Copy size={14} /> Copy link
             </button>
          </div>
        </div>
      </div>

    </div>
  );
}

// Subcomponents

const TopicBar = ({ label, percent, color }: { label: string, percent: number, color: string }) => (
  <div className="flex items-center justify-between py-1">
    <div className="w-24 text-xs font-medium text-zinc-300">{label}</div>
    <div className="flex-1 mx-4 h-1 bg-zinc-800 rounded-full overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${percent}%` }} />
    </div>
    <div className="w-8 text-right text-xs text-zinc-400 font-medium">{percent}%</div>
  </div>
);

const ModeBar = ({ icon, label, percent, battles, color }: { icon: string, label: string, percent: number, battles: number, color: string }) => (
  <div className="flex items-center py-2 border-b border-zinc-800/30 last:border-0">
    <div className="w-28 flex items-center gap-3 text-xs font-medium text-zinc-300">
      <span className="opacity-70 text-sm">{icon}</span> {label}
    </div>
    <div className="flex-1 mx-4 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${percent}%` }} />
    </div>
    <div className="w-24 text-right flex flex-col items-end">
      <div className="text-xs text-zinc-300 font-medium">{percent}% <span className="text-zinc-600 font-normal ml-1">({battles} battles)</span></div>
    </div>
  </div>
);

const BattleRow = ({ result, opponent, mode, elo, details }: { result: string, opponent: string, mode: string, elo: string, details: string }) => {
  const isWin = result === 'WIN';
  return (
    <div className="flex items-center justify-between p-4 bg-transparent rounded-lg hover:bg-zinc-800/20 transition-colors border-b border-zinc-800/30 last:border-0">
      <div className="flex items-center gap-4">
        <div className={`w-2 h-2 rounded-full ${isWin ? 'bg-green-500' : 'bg-red-500'}`} />
        <div>
           <div className="flex items-center gap-3 mb-1">
             <span className="text-sm font-medium text-white">vs {opponent}</span>
             <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
               mode === 'Ranked' ? 'bg-blue-500 text-white' : 
               mode === 'Blitz' ? 'bg-orange-500 text-white' : 
               mode === 'Blind' ? 'bg-purple-500 text-white' :
               'bg-white text-zinc-900'
             }`}>{mode}</span>
           </div>
           <div className="text-[10px] text-zinc-500">{details}</div>
        </div>
      </div>
      <div className={`font-medium text-sm ${isWin && elo.startsWith('+') ? 'text-green-500' : elo.startsWith('-') ? 'text-red-500' : 'text-zinc-500'}`}>
        {elo}
      </div>
    </div>
  );
};

const RatingChart = () => {
  const points = [
    { month: 'Jan', value: 1200 },
    { month: 'Feb', value: 1280 },
    { month: 'Mar', value: 1350 },
    { month: 'Apr', value: 1410 },
    { month: 'May', value: 1500 },
    { month: 'Jun', value: 1580 },
    { month: 'Jul', value: 1650 },
    { month: 'Aug', value: 1720 },
    { month: 'Sep', value: 1821 },
    { month: 'Oct', value: 1780 },
    { month: 'Nov', value: 1724 },
  ];
  
  const max = 1900;
  const min = 1100;
  const range = max - min;
  
  const chartHeight = 220;
  const chartWidth = 800;
  
  const xStep = chartWidth / (points.length - 1);
  
  const getCoordinates = (index: number, value: number) => {
    const x = index * xStep;
    const y = chartHeight - ((value - min) / range) * chartHeight;
    return `${x},${y}`;
  };

  const pathData = points.map((p, i) => getCoordinates(i, p.value)).join(' L ');
  
  return (
    <div className="w-full mt-2 overflow-x-auto pb-4">
      <div className="min-w-[600px] relative h-[250px] text-[10px] text-zinc-500">
        {/* Y Axis Labels */}
        <div className="absolute left-0 top-0 bottom-6 flex flex-col justify-between items-end pr-3 w-12 border-r border-zinc-800/50 font-mono">
          {[1900, 1800, 1700, 1600, 1500, 1400, 1300, 1200, 1100].map(v => (
            <span key={v}>{v.toLocaleString()}</span>
          ))}
        </div>
        
        <div className="absolute left-14 right-0 top-0 bottom-6">
           {/* Grid lines */}
           {[...Array(9)].map((_, i) => (
             <div key={i} className="absolute w-full border-t border-zinc-800/30" style={{ top: `${(i/8)*100}%` }} />
           ))}
           
           {/* SVG Chart */}
           <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
             <path d={`M ${pathData}`} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
             {points.map((p, i) => {
               const [x, y] = getCoordinates(i, p.value).split(',');
               let color = "#3b82f6";
               if (i === 8) color = "#22c55e"; // peak
               if (i === 10) color = "#ef4444"; // current drop
               return (
                 <circle key={i} cx={x} cy={y} r="4.5" fill={color} stroke="#1C1C1E" strokeWidth="2" className="shadow-lg" />
               );
             })}
           </svg>
        </div>
        
        {/* X Axis Labels */}
        <div className="absolute left-14 right-0 bottom-0 h-6 flex justify-between items-end px-1 font-mono">
           {points.map(p => (
             <span key={p.month} className="transform -translate-x-1/2">{p.month}</span>
           ))}
        </div>
      </div>
    </div>
  );
};