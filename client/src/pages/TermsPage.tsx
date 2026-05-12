import { Terminal, Scale, AlertTriangle, Zap, ServerCrash } from 'lucide-react';

export default function TermsPage() {
  return (
    <div className="flex-1 h-full overflow-y-auto w-full p-4 md:p-8 relative z-10 text-zinc-300">
      <div className="mb-12 text-center">
        <h1 className="text-4xl md:text-5xl font-bold font-['Orbitron'] tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-emerald-500 to-teal-600 mb-4 drop-shadow-[0_0_15px_rgba(74,222,128,0.3)]">
          TERMS OF ENGAGEMENT
        </h1>
        <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
          System protocols and rules of combat for the CodeFight arena. By accessing the network, you accept these directives.
        </p>
      </div>

      <div className="space-y-8">
        <section className="bg-black/40 backdrop-blur-xl border border-zinc-800/60 rounded-2xl p-8 relative overflow-hidden group hover:border-zinc-700 transition-colors">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.6)]" />
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
              <Terminal className="text-blue-400" size={24} />
            </div>
            <h2 className="text-2xl font-semibold text-white font-['Orbitron'] tracking-wide">1. System Introduction</h2>
          </div>
          <p className="text-zinc-400 leading-relaxed ml-[68px]">
            Welcome to CodeFight. By accessing or using our competitive coding arena, you agree to be bound by these Terms and Conditions. Please read them carefully before initializing any combat sequences.
          </p>
        </section>

        <section className="bg-black/40 backdrop-blur-xl border border-zinc-800/60 rounded-2xl p-8 relative overflow-hidden group hover:border-zinc-700 transition-colors">
          <div className="absolute top-0 left-0 w-1 h-full bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)]" />
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20">
              <AlertTriangle className="text-red-400" size={24} />
            </div>
            <h2 className="text-2xl font-semibold text-white font-['Orbitron'] tracking-wide">2. Operator Conduct</h2>
          </div>
          <ul className="space-y-3 ml-[68px] text-zinc-400">
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.8)] flex-shrink-0" />
              <p>Operators must not use automated tools, bots, or external APIs to solve ranked match algorithms.</p>
            </li>
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.8)] flex-shrink-0" />
              <p>Exploiting logic flaws, deploying DDoS attacks, or maliciously disrupting the execution environment constitutes an immediate and permanent network ban.</p>
            </li>
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.8)] flex-shrink-0" />
              <p>Maintain professional protocols. CodeFight has zero tolerance for harassment in match debriefs or public comms channels.</p>
            </li>
          </ul>
        </section>

        <section className="bg-black/40 backdrop-blur-xl border border-zinc-800/60 rounded-2xl p-8 relative overflow-hidden group hover:border-zinc-700 transition-colors">
          <div className="absolute top-0 left-0 w-1 h-full bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.6)]" />
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-purple-500/10 rounded-xl border border-purple-500/20">
              <Scale className="text-purple-400" size={24} />
            </div>
            <h2 className="text-2xl font-semibold text-white font-['Orbitron'] tracking-wide">3. Intellectual Property</h2>
          </div>
          <p className="text-zinc-400 leading-relaxed ml-[68px]">
            Any code compiled inside the arena is considered a public competitive entry. CodeFight retains the right to display, execute, analyze, and archive your algorithms for match replays and global leaderboards.
          </p>
        </section>

        <section className="bg-black/40 backdrop-blur-xl border border-zinc-800/60 rounded-2xl p-8 relative overflow-hidden group hover:border-zinc-700 transition-colors">
          <div className="absolute top-0 left-0 w-1 h-full bg-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.6)]" />
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-yellow-500/10 rounded-xl border border-yellow-500/20">
              <Zap className="text-yellow-400" size={24} />
            </div>
            <h2 className="text-2xl font-semibold text-white font-['Orbitron'] tracking-wide">4. Sudden Death Directives</h2>
          </div>
          <p className="text-zinc-400 leading-relaxed ml-[68px]">
            During tied engagements proceeding to the "Sudden Death" Phase, all rulings by the master referee engine are absolute. Hidden test parameters are heavily encrypted and will not be disclosed under any circumstances.
          </p>
        </section>

        <section className="bg-black/40 backdrop-blur-xl border border-zinc-800/60 rounded-2xl p-8 relative overflow-hidden group hover:border-zinc-700 transition-colors">
          <div className="absolute top-0 left-0 w-1 h-full bg-zinc-500 shadow-[0_0_15px_rgba(113,113,122,0.6)]" />
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-zinc-500/10 rounded-xl border border-zinc-500/20">
              <ServerCrash className="text-zinc-400" size={24} />
            </div>
            <h2 className="text-2xl font-semibold text-white font-['Orbitron'] tracking-wide">5. System Liability</h2>
          </div>
          <p className="text-zinc-400 leading-relaxed ml-[68px]">
            CodeFight is provided "as is". The Administration is not responsible for dropped ELO ratings resulting from network disconnects, client crashes, or server node outages during an active engagement.
          </p>
        </section>
      </div>
      
      <div className="mt-12 text-center text-zinc-500 text-sm">
        <p>Last Updated: Version 2.4.1 (System Epoch)</p>
      </div>
    </div>
  );
}