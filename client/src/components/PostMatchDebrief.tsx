import React, { useState } from 'react';
import { Trophy, XCircle, Clock, CheckCircle2, XOctagon, ChevronDown, ChevronUp, Cpu, Flame, Target } from 'lucide-react';
import type { ProblemScoreResult } from '../utils/scoring';

export interface PostMatchDebriefProps {
  isWin: boolean;
  opponentName: string;
  totalTimeStr: string; // e.g. "45m 12s"
  oldRating: number;
  ratingChange: number;
  scenarioTitle: string; // e.g. "Boss problem solved — tiebreaker not needed. Full 150 pts claimed."
  isTiebreakerScenario: boolean;
  
  myTotalScore: number;
  opponentTotalScore: number;
  
  problems: {
    title: string;
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    timeStr: string;
    status: 'SOLVED' | 'FAILED' | 'DNF';
    score: ProblemScoreResult;
  }[];
  
  reachedBoss: boolean;
  myComplexity: string;
  myComplexityLabel: string; // e.g. "Optimal"
  opponentComplexity: string;
  
  aiDebriefPoints: string[];
  
  onClose: () => void;
}

export function PostMatchDebrief(props: PostMatchDebriefProps) {
  const [showAiDebrief, setShowAiDebrief] = useState(false);
  
  const {
    isWin, opponentName, totalTimeStr, oldRating, ratingChange, 
    scenarioTitle, isTiebreakerScenario, myTotalScore, opponentTotalScore,
    problems, reachedBoss, myComplexity, myComplexityLabel, opponentComplexity,
    aiDebriefPoints, onClose
  } = props;
  
  const newRating = oldRating + ratingChange;
  const isPositive = ratingChange > 0;
  
  const headerGlow = isWin ? 'shadow-[0_0_50px_rgba(34,197,94,0.15)] border-green-500/30' : 'shadow-[0_0_50px_rgba(239,68,68,0.15)] border-red-500/30';
  const bannerGlow = isTiebreakerScenario ? 'border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.2)]' : 'border-zinc-700';
  
  return (
    <div className="fixed inset-0 z-[9999] bg-[#050508] bg-opacity-95 backdrop-blur-xl flex flex-col items-center py-10 px-4 overflow-y-auto font-sans text-zinc-100">
      
      <div className="w-full max-w-4xl space-y-8 animate-in fade-in zoom-in duration-500">
        
        {/* HEADER */}
        <div className={`relative bg-[#0d0f14] border rounded-2xl p-8 text-center ${headerGlow}`}>
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/40 rounded-2xl pointer-events-none" />
          
          <div className="relative z-10 space-y-3">
            <div className="inline-flex items-center justify-center gap-2 px-3 py-1 bg-zinc-800/50 rounded-full text-xs font-semibold tracking-widest text-zinc-400 mb-2">
              <Trophy size={14} className={isWin ? 'text-green-400' : 'text-zinc-500'} />
              RANKED • {totalTimeStr}
            </div>
            
            <h1 className={`text-5xl md:text-6xl font-black uppercase tracking-tight ${isWin ? 'text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600' : 'text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-rose-700'}`}>
              {isWin ? 'VICTORY' : 'DEFEAT'} <span className="text-white text-3xl md:text-5xl opacity-80">vs {opponentName}</span>
            </h1>
            
            <div className="flex items-center justify-center gap-3 mt-6 text-xl font-bold font-mono">
              <span className="text-zinc-400">{oldRating}</span>
              <span className={`px-3 py-1 rounded-md bg-black/40 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                {isPositive ? '+' : ''}{ratingChange}
              </span>
              <span className="text-white text-2xl">{newRating}</span>
            </div>
          </div>
        </div>
        
        {/* SUMMARY BANNER */}
        <div className={`bg-[#14151a] border-l-4 rounded-r-lg p-4 flex items-center gap-4 ${isTiebreakerScenario ? 'border-purple-500 bg-purple-900/10' : 'border-blue-500 bg-blue-900/10'} ${bannerGlow}`}>
          <Flame size={24} className={isTiebreakerScenario ? 'text-purple-400' : 'text-blue-400'} />
          <p className="text-sm font-medium tracking-wide">{scenarioTitle}</p>
        </div>
        
        {/* SCOREBOARD */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 bg-[#0d0f14] border border-zinc-800 rounded-xl p-6 flex flex-col justify-center items-center text-center shadow-lg">
            <div className="text-sm text-zinc-500 uppercase tracking-widest mb-4">Total Score</div>
            <div className="flex justify-between items-end w-full px-4 mb-2">
              <div className="flex flex-col items-center">
                <span className="text-xs text-zinc-500 mb-1">You</span>
                <span className="text-4xl font-black text-white font-mono">{myTotalScore}</span>
              </div>
              <span className="text-zinc-600 font-bold mb-2">vs</span>
              <div className="flex flex-col items-center">
                <span className="text-xs text-zinc-500 mb-1">{opponentName}</span>
                <span className="text-4xl font-black text-zinc-400 font-mono">{opponentTotalScore}</span>
              </div>
            </div>
          </div>
          
          <div className="md:col-span-2 space-y-3">
            {problems.map((prob, idx) => (
              <div key={idx} className={`flex items-center justify-between p-4 bg-[#0d0f14] border ${prob.difficulty === 'HARD' ? 'border-purple-500/30' : 'border-zinc-800'} rounded-xl shadow-sm`}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {prob.status === 'SOLVED' && <CheckCircle2 size={16} className="text-green-500" />}
                    {prob.status === 'FAILED' && <XCircle size={16} className="text-red-500" />}
                    {prob.status === 'DNF' && <XOctagon size={16} className="text-zinc-600" />}
                    <h3 className="font-bold text-white tracking-wide">{prob.title}</h3>
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${prob.difficulty === 'HARD' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                      {prob.difficulty}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-500 font-medium">
                    <span className="flex items-center gap-1"><Clock size={12} /> {prob.timeStr}</span>
                    <span>•</span>
                    <span className={prob.status === 'SOLVED' ? 'text-green-400' : 'text-zinc-500'}>{prob.status}</span>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="text-xl font-bold font-mono text-white mb-0.5">{prob.score.total} pts</div>
                  <div className="text-[10px] text-zinc-500 flex flex-col items-end leading-tight">
                    {prob.score.baseScore > 0 && <span>Base: {prob.score.baseScore}</span>}
                    {prob.score.speedBonus > 0 && <span className="text-green-400">+{prob.score.speedBonus} speed bonus</span>}
                    {prob.score.penalty < 0 && <span className="text-red-400">{prob.score.penalty} penalties</span>}
                    {prob.score.partialCredit > 0 && <span className="text-blue-400">+{prob.score.partialCredit} partial hidden</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* APPROACH COMPARISON (Boss Only) */}
        {reachedBoss && (
          <div className="bg-[#0d0f14] border border-zinc-800 rounded-xl p-6 shadow-lg">
            <h3 className="text-xs uppercase tracking-widest text-zinc-500 mb-4 flex items-center gap-2">
              <Target size={14} /> Boss Approach Analysis
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-[#14151a] rounded-lg border border-zinc-800/80">
                <div className="text-xs text-zinc-500 mb-1">Your Approach</div>
                <div className="text-lg font-bold text-white font-mono mb-1">{myComplexity}</div>
                <div className="text-xs text-green-400 font-medium">{myComplexityLabel}</div>
              </div>
              <div className="p-4 bg-[#14151a] rounded-lg border border-zinc-800/80">
                <div className="text-xs text-zinc-500 mb-1">Opponent's Approach</div>
                <div className="text-lg font-bold text-white font-mono mb-1">{opponentComplexity}</div>
              </div>
            </div>
          </div>
        )}
        
        {/* AI DEBRIEF */}
        <div className="border border-zinc-800 rounded-xl bg-[#0d0f14] shadow-lg overflow-hidden transition-all duration-300">
          <button 
            onClick={() => setShowAiDebrief(!showAiDebrief)}
            className="w-full flex items-center justify-between p-5 hover:bg-zinc-800/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Cpu className="text-blue-400" />
              <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 tracking-wide">
                VIEW AI DEBRIEF ✨
              </span>
            </div>
            {showAiDebrief ? <ChevronUp className="text-zinc-500" /> : <ChevronDown className="text-zinc-500" />}
          </button>
          
          {showAiDebrief && (
            <div className="p-6 border-t border-zinc-800 bg-[#14151a]/50">
              <ul className="space-y-4">
                {aiDebriefPoints.map((pt, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                    <span className="text-sm text-zinc-300 leading-relaxed">{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        
        {/* FOOTER ACTION */}
        <div className="flex justify-center pt-4 pb-12">
          <button 
            onClick={onClose}
            className="px-10 py-4 bg-white text-black font-black uppercase tracking-widest text-sm rounded-full hover:bg-zinc-200 transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.2)]"
          >
            Find Next Battle
          </button>
        </div>
        
      </div>
    </div>
  );
}
