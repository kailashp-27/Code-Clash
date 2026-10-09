import { Link } from 'react-router-dom';
import { Shield, Swords, Clock, Code, Scale } from 'lucide-react';
const rules = [
  { icon: Swords, title: 'One opponent. The same challenge.', text: 'Ranked matches pair two signed-in accounts near their rating. Both receive the same two problems and private test suite.' },
  { icon: Code, title: 'Correctness comes first', text: 'Write a complete program in JavaScript, Python, C++ or Java. Run Code checks public examples. Submit checks every test on the server. Passing some tests does not solve a problem.' },
  { icon: Clock, title: 'Thirty minutes to make it count', text: 'The first player to solve both problems wins. Submission receipt order decides a close finish, not judge worker speed. At the deadline, already-received submissions finish judging; more solved problems wins, and equal counts draw.' },
  { icon: Scale, title: 'Earn your rating', text: 'Ranked results use Elo with K=32, including draws. Leaving a battle forfeits it. A disconnected account has 30 seconds to return while the opponent remains online. If both leave, the match is cancelled. Judge infrastructure failures can cancel a battle without rating changes.' },
  { icon: Shield, title: 'Compete fairly', text: 'Prohibited assistance and copying can be reported after a battle. AI authorship is currently not assessed; code similarity alone is not proof of misconduct. Three moderator-confirmed violations on distinct battle problems trigger a ban from play. Duplicate reports and pending findings add no strikes. You can appeal confirmed findings from Account Standing, and moderators can reverse decisions. Authorized moderators can inspect reported source and evidence; hidden judge diagnostics remain private. Integrity reports do not rewrite completed results or Elo. An ongoing match is cancelled without rating changes if a participant is banned.' },
];
export default function TermsPage() {
  return <main style={{ flex: 1, overflowY: 'auto', padding: '40px 24px', color: '#e8eaf0', background: '#070a11' }}>
    <div style={{ maxWidth: 900, margin: '0 auto' }}><p style={{ color: '#00e5ff', fontSize: 12, letterSpacing: 2 }}>THE ARENA PLAYBOOK</p><h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 36 }}>Clear rules. Fair battles.</h1><p style={{ color: '#a3abc2', marginBottom: 28 }}>How the current ranked arena works.</p>
      {rules.map(rule => <section key={rule.title} style={{ border: '1px solid #252b40', borderRadius: 16, padding: 24, marginBottom: 16, background: 'linear-gradient(135deg,#131a2d,#0d1220)' }}><rule.icon size={24} color="#00e5ff" aria-hidden="true" /><h2 style={{ fontSize: 20, margin: '12px 0' }}>{rule.title}</h2><p style={{ color: '#a3abc2', lineHeight: 1.8 }}>{rule.text}</p></section>)}
      <Link to="/" style={{ color: '#00e5ff' }}>Return to the arena</Link>
    </div>
  </main>;
}
