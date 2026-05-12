import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { useSocketStore } from '../stores/useSocketStore';
import { Play, Square, Settings, Layout, Code2, Terminal, Users, CheckCircle2, ChevronRight, X, Maximize2, Minimize2, Trophy, Clock, Skull, Zap, LogOut, Send, ChevronLeft, Swords, Eye } from 'lucide-react';
import { PostMatchDebrief } from '../components/PostMatchDebrief';

export const LiveBattlePage = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { socket, connect } = useSocketStore();
  const [language, setLanguage] = useState('javascript');
  const [matchData, setMatchData] = useState<any>(null);
  const [currentProblemIndex, setCurrentProblemIndex] = useState(0);
  const [opponentProgress, setOpponentProgress] = useState('0/0');
  const [timeLeft, setTimeLeft] = useState('00:00');
  const [code, setCode] = useState('// Write your solution here...\n');
  const [consoleOutput, setConsoleOutput] = useState<string[]>([]);
  const [runHover, setRunHover] = useState(false);
  const [submitHover, setSubmitHover] = useState(false);
  const [leaveHover, setLeaveHover] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isTieBreaker, setIsTieBreaker] = useState(false);
  const [matchEnded, setMatchEnded] = useState(false);
  const [matchResult, setMatchResult] = useState('');
  const [matchRatingChange, setMatchRatingChange] = useState(0);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) setCurrentUser(JSON.parse(userStr));
  }, []);

  useEffect(() => { if (!socket) connect(); }, [socket, connect]);

  useEffect(() => {
    if (!socket) return;
    const handleMatchFound = (payload: any) => setMatchData(prev => ({ ...prev, ...payload }));
    const handleBattleSync = (payload: any) => setMatchData(prev => ({ ...prev, ...payload }));
    const handleOpponentUpdate = ({ passedCases, totalCases }: any) => setOpponentProgress(`${passedCases}/${totalCases}`);
    const handleMatchOver = ({ winner, loser, reason, ratingChange }: any) => {
      setMatchEnded(true);
      if (winner === currentUser?.username) {
        setMatchResult(`VICTORY (${reason === 'forfeit' ? 'Opponent Forfeited' : 'You Won'})`);
        setMatchRatingChange(ratingChange || 0);
      } else {
        setMatchResult('DEFEAT');
        setMatchRatingChange(-(ratingChange || 0));
      }
    };
    socket.on('match_found', handleMatchFound);
    socket.on('battle_sync', handleBattleSync);
    socket.on('opponent_test_update', handleOpponentUpdate);
    socket.on('match_over', handleMatchOver);
    if (roomId) socket.emit('join_battle', { roomId });
    return () => { 
      socket.off('match_found', handleMatchFound); 
      socket.off('battle_sync', handleBattleSync); 
      socket.off('opponent_test_update', handleOpponentUpdate); 
      socket.off('match_over', handleMatchOver);
    };
  }, [socket, roomId, currentUser?.username]);

  useEffect(() => {
    if (matchData?.phase === 'boss') {
      setIsTieBreaker(true);
    }
  }, [matchData?.phase]);

  useEffect(() => {
    if (!matchData?.endTime) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((matchData.endTime - Date.now()) / 1000));
      if (remaining <= 0) { setTimeLeft('00:00'); clearInterval(interval); return; }
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      setTimeLeft(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [matchData?.endTime]);

  const handleRunCode = () => {
    if (!socket || !roomId) return;
    const p = matchData?.problems[currentProblemIndex];
    if (!p) return;
    const total = p.totalTestCases;
    const passed = Math.floor(Math.random() * (total + 1));
    socket.emit('test_case_update', { roomId, passedCases: passed, totalCases: total });
    setConsoleOutput(prev => [...prev, `> Running ${p.title}...`, `  Result: ${passed}/${total} test cases passed.`, '']);
  };

  let opponentName = 'Opponent';
  let opponentRating = 1200;
  let myRating = 1200;

  if (matchData?.players) {
    const pKeys = Object.keys(matchData.players);
    const oppKey = pKeys.find(k => k !== socket?.id && matchData.players[k].username !== currentUser?.username);
    if (oppKey) {
      opponentName = matchData.players[oppKey].username;
      opponentRating = matchData.players[oppKey].rating;
    } else {
      const fallback = pKeys.find(k => k !== socket?.id);
      if (fallback) {
        opponentName = matchData.players[fallback].username;
        opponentRating = matchData.players[fallback].rating;
      }
    }
    
    const myKey = pKeys.find(k => k === socket?.id || matchData.players[k].username === currentUser?.username);
    if (myKey) {
      myRating = matchData.players[myKey].rating;
    }
  }
  const myUsername = currentUser?.username || 'You';
  const players = [`${myUsername} (${myRating})`, `${opponentName} (${opponentRating})`];

  const pList = matchData?.problems || [];
  const totalProblems = isTieBreaker ? 1 : 2;
  const activeProblem = isTieBreaker 
    ? (pList[2] || pList[0] || { title: 'Boss Problem Loading...', description: '', totalTestCases: 0 }) 
    : (pList[currentProblemIndex] || { title: 'Loading...', description: 'Waiting for match data...', totalTestCases: 0 });

  // Shared input styles
  const s = {
    panelBg: '#0a0c10',
    headerBg: 'rgba(12, 14, 20, 0.95)',
    border: 'rgba(255,255,255,0.05)',
    borderBright: 'rgba(255,255,255,0.08)',
  };

  return (
    <div style={{ width: '100%', height: '100vh', background: '#06070a', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'Inter', sans-serif" }}>

      {matchEnded && (
        <PostMatchDebrief
          isWin={matchResult.startsWith('VICTORY')}
          opponentName={opponentName}
          totalTimeStr="42m 15s"
          oldRating={myRating}
          ratingChange={matchRatingChange}
          scenarioTitle={matchResult.startsWith('VICTORY') ? "Opponent successfully defeated in standard phase." : "Defeated in standard phase."}
          isTiebreakerScenario={isTieBreaker}
          myTotalScore={matchResult.startsWith('VICTORY') ? 370 : 150}
          opponentTotalScore={matchResult.startsWith('VICTORY') ? 150 : 370}
          problems={[
            {
              title: pList[0]?.title || 'Two Sum',
              difficulty: 'EASY',
              timeStr: '12m 30s',
              status: matchResult.startsWith('VICTORY') ? 'SOLVED' : 'FAILED',
              score: { total: 120, baseScore: 100, speedBonus: 20, penalty: 0, partialCredit: 0 }
            },
            {
              title: pList[1]?.title || 'Valid Parentheses',
              difficulty: 'MEDIUM',
              timeStr: '29m 45s',
              status: 'SOLVED',
              score: { total: 100, baseScore: 100, speedBonus: 0, penalty: 0, partialCredit: 0 }
            }
          ]}
          reachedBoss={isTieBreaker}
          myComplexity="O(n)"
          myComplexityLabel="Optimal"
          opponentComplexity="O(n^2)"
          aiDebriefPoints={[
            "Identified optimal approach for P1 quickly.",
            "Struggled slightly with edge cases on P2, resulting in minor time loss.",
            "Recommended focus: Dynamic Programming patterns."
          ]}
          onClose={() => navigate('/')}
        />
      )}

      {/* ══ TOP BAR ══ */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: '56px', padding: '0 20px', flexShrink: 0,
        background: s.headerBg, borderBottom: `1px solid ${s.border}`,
        backdropFilter: 'blur(12px)',
      }}>
        {/* Left: Brand + Room */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => navigate('/')}>
            <div style={{
              width: '30px', height: '30px', borderRadius: '9px',
              background: 'linear-gradient(135deg, #00e5ff, #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 16px rgba(0,229,255,0.15)',
            }}>
              <Zap size={13} color="#fff" strokeWidth={2.5} />
            </div>
            <span style={{ fontSize: '14px', fontWeight: 800, color: '#fff', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em' }}>
              CODE<span style={{ color: '#00e5ff' }}>CLASH</span>
            </span>
          </div>
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.08)' }} />
          <div style={{
            fontSize: '11px', fontFamily: "'JetBrains Mono', monospace", color: '#454760',
            background: 'rgba(255,255,255,0.03)', padding: '4px 10px', borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.05)',
          }}>
            {roomId?.substring(0, 8)}
          </div>
        </div>

        {/* Center: Players + Timer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#00e5ff', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>{players[0]}</span>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '6px 16px', borderRadius: '10px',
            background: 'linear-gradient(135deg, rgba(0,229,255,0.06), rgba(124,58,237,0.06))',
            border: '1px solid rgba(0,229,255,0.12)',
          }}>
            <Clock size={13} color="#7a7e9a" />
            <span style={{
              fontSize: '20px', fontWeight: 800, fontFamily: "'JetBrains Mono', monospace",
              color: '#fff', letterSpacing: '0.05em',
              textShadow: '0 0 12px rgba(0,229,255,0.3)',
            }}>{timeLeft}</span>
            <button onClick={() => {
              if (!isTieBreaker) {
                const isTie = window.confirm("Simulate a tie? (OK = Tie -> Boss round, Cancel = Regular Result)");
                if (isTie) {
                  socket?.emit('trigger_tiebreaker', { roomId });
                } else {
                  setMatchEnded(true);
                  setMatchResult('VICTORY (Test)');
                }
              } else {
                  setMatchEnded(true);
                  setMatchResult('VICTORY (Boss Defeated)');
              }
            }} style={{ padding: '4px 8px', fontSize: '10px', background: '#f87171', color: 'white', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 600, marginLeft: '8px' }}>End (Test)</button>
          </div>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>{players[1]}</span>
        </div>

        {/* Right: Opponent + Leave */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '6px 14px', borderRadius: '8px', fontSize: '12px',
            background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.12)', color: '#7a7e9a',
          }}>
            <Swords size={13} color="#f87171" />
            <span>Opponent:</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: '#f87171' }}>{opponentProgress}</span>
          </div>
          <button
            onClick={() => {
              socket?.emit('forfeit_match', { roomId });
              navigate('/');
            }}
            onMouseEnter={() => setLeaveHover(true)}
            onMouseLeave={() => setLeaveHover(false)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
              background: leaveHover ? 'rgba(248,113,113,0.15)' : 'rgba(248,113,113,0.06)',
              border: leaveHover ? '1px solid rgba(248,113,113,0.35)' : '1px solid rgba(248,113,113,0.12)',
              color: '#f87171', cursor: 'pointer', transition: 'all 0.2s ease',
            }}
          >
            <LogOut size={13} /> Leave
          </button>
        </div>
      </header>

      {/* ══ MAIN WORKSPACE ══ */}
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT: Problem Panel (38%) ── */}
        <div style={{
          width: '38%', display: 'flex', flexDirection: 'column',
          background: s.panelBg, borderRight: `1px solid ${s.border}`,
        }}>
          {/* Problem Header */}
          <div style={{
            padding: '20px 24px 16px', borderBottom: `1px solid ${s.border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#fff', fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
                {activeProblem.title}
              </h1>
              <span style={{
                fontSize: '11px', fontFamily: "'JetBrains Mono', monospace", color: '#7a7e9a',
                background: 'rgba(255,255,255,0.04)', padding: '4px 10px', borderRadius: '6px',
                border: `1px solid ${s.border}`,
              }}>
                {isTieBreaker ? 'BOSS' : `${currentProblemIndex + 1}/${totalProblems}`}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{
                fontSize: '10px', fontWeight: 700, padding: '4px 10px', borderRadius: '6px',
                background: 'rgba(0,229,255,0.08)', color: '#00e5ff',
                border: '1px solid rgba(0,229,255,0.15)', textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>Active</span>
              <span style={{
                fontSize: '10px', fontWeight: 600, padding: '4px 10px', borderRadius: '6px',
                background: 'rgba(255,255,255,0.03)', color: '#7a7e9a',
                border: `1px solid ${s.border}`, display: 'flex', alignItems: 'center', gap: '4px',
              }}>
                <Eye size={10} /> {activeProblem.totalTestCases} Hidden
              </span>
            </div>
          </div>

          {/* Problem Body */}
          <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto', paddingBottom: '80px' }}>
            <p style={{ fontSize: '14px', lineHeight: 1.8, color: '#b0b3cc' }}>
              {activeProblem.description}
            </p>
            {activeProblem.sampleTestCase && (
              <div style={{ marginTop: '16px', padding: '14px', background: '#0a0b10', borderRadius: '8px', border: `1px solid ${s.borderBright}`, fontSize: '13px', fontFamily: "'JetBrains Mono', monospace", color: '#b0b3cc', whiteSpace: 'pre-wrap', boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.2)' }}>
                <div style={{ color: '#00e5ff', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Example</div>
                {activeProblem.sampleTestCase}
              </div>
            )}
            <div style={{
              marginTop: '20px', padding: '14px 16px', borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(0,229,255,0.04), rgba(124,58,237,0.04))',
              border: '1px solid rgba(0,229,255,0.1)',
              fontSize: '12px', color: '#00e5ff', lineHeight: 1.6, fontWeight: 500,
            }}>
              ⚡ Test cases are hidden during Ranked Match. Output correct values based on edge conditions.
            </div>
          </div>

          {/* Problem Navigation */}
          <div style={{
            padding: '12px 24px', borderTop: `1px solid ${s.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: s.panelBg, flexShrink: 0,
          }}>
            <button onClick={() => !isTieBreaker && currentProblemIndex > 0 && setCurrentProblemIndex(p => p - 1)}
              disabled={isTieBreaker || currentProblemIndex === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                background: 'rgba(255,255,255,0.03)', border: `1px solid ${s.border}`,
                color: (isTieBreaker || currentProblemIndex === 0) ? '#2a2c40' : '#7a7e9a',
                cursor: (isTieBreaker || currentProblemIndex === 0) ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
              }}
            ><ChevronLeft size={14} /> Previous</button>
            {/* Problem dots */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {!isTieBreaker ? Array.from({ length: totalProblems }).map((_, i) => (
                <div key={i} onClick={() => setCurrentProblemIndex(i)} style={{
                  width: i === currentProblemIndex ? '20px' : '8px', height: '8px',
                  borderRadius: '4px', cursor: 'pointer', transition: 'all 0.3s ease',
                  background: i === currentProblemIndex
                    ? 'linear-gradient(90deg, #00e5ff, #7c3aed)'
                    : 'rgba(255,255,255,0.08)',
                  boxShadow: i === currentProblemIndex ? '0 0 10px rgba(0,229,255,0.3)' : 'none',
                }} />
              )) : (
                <div style={{
                  width: '20px', height: '8px', borderRadius: '4px',
                  background: 'linear-gradient(90deg, #f87171, #ef4444)',
                  boxShadow: '0 0 10px rgba(239,68,68,0.4)',
                }} />
              )}
            </div>
            <button onClick={() => !isTieBreaker && currentProblemIndex < totalProblems - 1 && setCurrentProblemIndex(p => p + 1)}
              disabled={isTieBreaker || currentProblemIndex >= totalProblems - 1}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                background: 'rgba(255,255,255,0.03)', border: `1px solid ${s.border}`,
                color: (isTieBreaker || currentProblemIndex >= totalProblems - 1) ? '#2a2c40' : '#7a7e9a',
                cursor: (isTieBreaker || currentProblemIndex >= totalProblems - 1) ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
              }}
            >Next <ChevronRight size={14} /></button>
          </div>
        </div>

        {/* ── RIGHT: IDE Panel (62%) ── */}
        <div style={{ width: '62%', display: 'flex', flexDirection: 'column', background: '#0d0f13' }}>
          {/* IDE Toolbar */}
          <div style={{
            height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 16px', borderBottom: `1px solid ${s.border}`, flexShrink: 0,
            background: s.headerBg,
          }}>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.04)', color: '#b0b3cc', fontSize: '12px',
                border: `1px solid ${s.border}`, borderRadius: '7px', padding: '6px 12px',
                outline: 'none', fontWeight: 500, cursor: 'pointer',
              }}
            >
              <option value="javascript">JavaScript (Node.js)</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python 3</option>
              <option value="cpp">C++ (GCC)</option>
              <option value="java">Java (OpenJDK)</option>
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button onClick={handleRunCode}
                onMouseEnter={() => setRunHover(true)} onMouseLeave={() => setRunHover(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '7px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                  background: runHover ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                  border: runHover ? '1px solid rgba(255,255,255,0.15)' : `1px solid ${s.border}`,
                  color: '#e8eaf0', cursor: 'pointer', transition: 'all 0.2s',
                }}
              ><Play size={13} fill="currentColor" /> Run Code</button>
              <button
                onMouseEnter={() => setSubmitHover(true)} onMouseLeave={() => setSubmitHover(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '7px 20px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                  background: submitHover
                    ? 'linear-gradient(135deg, #00e5ff, #7c3aed)'
                    : 'linear-gradient(135deg, rgba(0,229,255,0.85), rgba(124,58,237,0.85))',
                  border: 'none', color: '#fff', cursor: 'pointer', transition: 'all 0.2s',
                  boxShadow: submitHover
                    ? '0 0 20px rgba(0,229,255,0.25), 0 4px 16px rgba(124,58,237,0.2)'
                    : '0 0 10px rgba(0,229,255,0.1)',
                  letterSpacing: '0.02em', fontFamily: "'Space Grotesk', sans-serif",
                }}
              ><Send size={13} /> Submit</button>
            </div>
          </div>

          {/* Code Editor */}
          <div style={{ flex: 1, position: 'relative' }}>
            <Editor
              height="100%"
              language={language}
              theme="vs-dark"
              value={code}
              onChange={(v) => setCode(v || '')}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                padding: { top: 16 },
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                cursorBlinking: "smooth",
                renderLineHighlight: "all",
              }}
            />
          </div>

          {/* Console Panel */}
          <div style={{
            height: '180px', borderTop: `1px solid ${s.border}`,
            display: 'flex', flexDirection: 'column', flexShrink: 0, background: s.panelBg,
          }}>
            <div style={{
              height: '34px', display: 'flex', alignItems: 'center', gap: '8px',
              padding: '0 16px', borderBottom: `1px solid ${s.border}`,
              background: s.headerBg,
            }}>
              <Terminal size={12} color="#7a7e9a" />
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#7a7e9a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Console</span>
            </div>
            <div style={{
              flex: 1, padding: '12px 16px', overflowY: 'auto',
              fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: '#7a7e9a', lineHeight: 1.7,
            }}>
              {consoleOutput.length === 0
                ? <span style={{ color: '#2a2c40' }}>Run results will appear here...</span>
                : consoleOutput.map((line, i) => (
                    <div key={i} style={{ color: line.includes('Result') ? '#22d3a0' : '#7a7e9a' }}>{line}</div>
                  ))
              }
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};