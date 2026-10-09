import React, { lazy, Suspense, useState, useCallback } from 'react';
import { apiUrl } from '../utils/api';
const Editor = lazy(() => import('./LocalCodeEditor'));

const LANGUAGES = [
  { id: 63,  name: 'JavaScript',  monaco: 'javascript',  icon: '⚡', stub: 'console.log("Hello, World!");' },
  { id: 71,  name: 'Python 3',    monaco: 'python',       icon: '🐍', stub: 'print("Hello, World!")' },
  { id: 54,  name: 'C++',         monaco: 'cpp',          icon: '⚙️', stub: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}' },
  { id: 62,  name: 'Java',        monaco: 'java',         icon: '☕', stub: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}' },
  { id: 73,  name: 'Rust',        monaco: 'rust',         icon: '🦀', stub: 'fn main() {\n    println!("Hello, World!");\n}' },
  { id: 60,  name: 'Go',          monaco: 'go',           icon: '🐹', stub: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, World!")\n}' },
];

type OutputData = {
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  status?: { id: number; description: string };
  time?: string | null;
  memory?: number | null;
};

const StatusBadge = ({ status }: { status: OutputData['status'] }) => {
  if (!status) return null;
  const accepted = status.id === 3;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 10px',
        borderRadius: '99px',
        fontSize: '12px',
        fontWeight: 600,
        letterSpacing: '0.03em',
        background: accepted ? 'rgba(34,211,160,0.12)' : 'rgba(248,113,113,0.12)',
        color: accepted ? '#22d3a0' : '#f87171',
        border: `1px solid ${accepted ? 'rgba(34,211,160,0.3)' : 'rgba(248,113,113,0.3)'}`,
      }}
    >
      <span>{accepted ? '✓' : '✗'}</span>
      {status.description}
    </span>
  );
};

export const Sandbox = () => {
  const [language, setLanguage] = useState(LANGUAGES[0]!);
  const [sourceCode, setSourceCode] = useState(LANGUAGES[0]!.stub);
  const [output, setOutput] = useState<OutputData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [stdin, setStdin] = useState('');
  const [showStdin, setShowStdin] = useState(false);

  const handleLanguageChange = useCallback((langId: number) => {
    const lang = LANGUAGES.find(l => l.id === langId);
    if (lang) {
      setLanguage(lang);
      setSourceCode(lang.stub);
      setOutput(null);
    }
  }, []);

  const handleRunCode = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setOutput(null);
    try {
      const res = await fetch(apiUrl('/api/execute'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
        body: JSON.stringify({ source_code: sourceCode, language_id: language.id, stdin }),
      });
      if (!res.ok) {
        const failure = await res.json();
        throw new Error(failure.error || 'Code execution failed');
      }
      const data: OutputData = await res.json();
      setOutput(data);
    } catch (error: unknown) {
      setOutput({ stderr: error instanceof Error ? error.message : 'Failed to connect to the server.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleRunCode();
    }
  };

  const stdout = output?.stdout?.trim();
  const stderr = output?.stderr?.trim();
  const compileOut = output?.compile_output?.trim();

  return (
    <div
      onKeyDown={handleKeyDown}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-primary)',
        fontFamily: "'Inter', sans-serif",
        overflow: 'hidden',
      }}
    >
      {/* ── IDE Toolbar (language + controls) ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        height: '44px',
        minHeight: '44px',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        gap: '10px',
      }}>
        {/* Left: active file tab */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '14px' }}>{language.icon}</span>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
            {language.name === 'C++' ? 'solution.cpp'
              : language.name === 'Python 3' ? 'solution.py'
              : language.name === 'Java' ? 'Main.java'
              : language.name === 'Rust' ? 'main.rs'
              : language.name === 'Go' ? 'main.go'
              : 'solution.js'}
          </span>
          <span style={{
            padding: '2px 7px', borderRadius: '4px', fontSize: '10px',
            background: 'rgba(108,99,255,0.12)', color: 'var(--accent-light)',
            border: '1px solid rgba(108,99,255,0.25)', fontWeight: 700, letterSpacing: '0.06em',
          }}>SANDBOX</span>
        </div>

        {/* Right: controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Language Selector */}
          <div style={{ position: 'relative' }}>
            <select
              id="language-select"
              value={language.id}
              onChange={e => handleLanguageChange(Number(e.target.value))}
              style={{
                appearance: 'none',
                background: 'var(--bg-panel)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                padding: '5px 28px 5px 10px',
                fontSize: '13px',
                fontWeight: 500,
                fontFamily: "'Inter', sans-serif",
                cursor: 'pointer',
                outline: 'none',
                minWidth: '140px',
              }}
            >
              {LANGUAGES.map(l => (
                <option key={l.id} value={l.id}>{l.icon}  {l.name}</option>
              ))}
            </select>
            <span style={{
              position: 'absolute', right: '9px', top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-secondary)', pointerEvents: 'none', fontSize: '11px',
            }}>▾</span>
          </div>

          {/* Stdin Toggle */}
          <button
            id="stdin-toggle"
            onClick={() => setShowStdin(s => !s)}
            title="Toggle stdin input"
            style={{
              background: showStdin ? 'rgba(108,99,255,0.15)' : 'var(--bg-panel)',
              border: `1px solid ${showStdin ? 'rgba(108,99,255,0.4)' : 'var(--border)'}`,
              borderRadius: '8px',
              color: showStdin ? 'var(--accent-light)' : 'var(--text-secondary)',
              padding: '5px 11px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: "'Inter', sans-serif",
              letterSpacing: '0.02em',
            }}
          >
            stdin
          </button>

          {/* Run Button */}
          <button
            id="run-code-btn"
            onClick={handleRunCode}
            disabled={isLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              background: isLoading
                ? 'rgba(108,99,255,0.2)'
                : 'linear-gradient(135deg, #6c63ff 0%, #8b5cf6 100%)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              padding: '6px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontFamily: "'Inter', sans-serif",
              letterSpacing: '0.02em',
              boxShadow: isLoading ? 'none' : '0 0 18px rgba(108,99,255,0.35)',
              transition: 'all 0.2s ease',
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? (
              <>
                <span style={{
                  width: '12px', height: '12px', borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff',
                  display: 'inline-block',
                  animation: 'spin 0.8s linear infinite',
                }}/>
                Running...
              </>
            ) : (
              <>▶ Run<span style={{ opacity: 0.6, fontSize: '11px', marginLeft: '2px' }}>⌘↵</span></>
            )}
          </button>
        </div>
      </div>

      {/* ── Main Body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Editor Panel ── */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--border)',
          overflow: 'hidden',
        }}>
          {/* Monaco sits directly below the toolbar — no redundant tab bar */}

          {/* Monaco Editor */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <Suspense fallback={<p role="status">Loading editor…</p>}><Editor
              height="100%"
              theme="vs-dark"
              language={language.monaco}
              value={sourceCode}
              onChange={val => setSourceCode(val || '')}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontLigatures: true,
                lineHeight: 22,
                padding: { top: 16, bottom: 16 },
                scrollBeyondLastLine: false,
                renderLineHighlight: 'gutter',
                cursorSmoothCaretAnimation: 'on',
                smoothScrolling: true,
                tabSize: 2,
              }}
            /></Suspense>
          </div>

          {/* Stdin Panel (collapsible) */}
          {showStdin && (
            <div style={{
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              flexShrink: 0,
            }}>
              <div style={{
                padding: '8px 16px 4px',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}>Standard Input</div>
              <textarea
                id="stdin-input"
                value={stdin}
                onChange={e => setStdin(e.target.value)}
                placeholder="Enter stdin here (one value per line)..."
                style={{
                  width: '100%',
                  height: '90px',
                  padding: '8px 16px 12px',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  fontFamily: "'JetBrains Mono', monospace",
                  resize: 'none',
                }}
              />
            </div>
          )}
        </div>

        {/* ── Output Panel ── */}
        <div style={{
          width: '380px',
          minWidth: '300px',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-secondary)',
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          {/* Output Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            height: '36px',
            minHeight: '36px',
            background: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Output
            </span>
            {output && (
              <button
                onClick={() => setOutput(null)}
                style={{
                  background: 'none', border: 'none', color: 'var(--text-secondary)',
                  cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '2px 4px',
                }}
                title="Clear output"
              >×</button>
            )}
          </div>

          {/* Output Body */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
            {isLoading ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: '100%', gap: '16px',
              }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '50%',
                  border: '3px solid rgba(108,99,255,0.2)',
                  borderTopColor: 'var(--accent)',
                  animation: 'spin 0.8s linear infinite',
                }}/>
                <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Executing…</span>
              </div>
            ) : output ? (
              <div style={{ animation: 'slide-up 0.25s ease' }}>
                {/* Status Row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                  <StatusBadge status={output.status} />
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {output.time && (
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        ⏱ {output.time}s
                      </span>
                    )}
                    {output.memory != null && output.memory > 0 && (
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        🧠 {(output.memory / 1024).toFixed(1)} MB
                      </span>
                    )}
                  </div>
                </div>

                {/* Stdout */}
                {stdout ? (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#22d3a0', letterSpacing: '0.06em', marginBottom: '6px' }}>STDOUT</div>
                    <pre style={{
                      background: 'rgba(34,211,160,0.05)',
                      border: '1px solid rgba(34,211,160,0.15)',
                      borderRadius: '8px',
                      padding: '12px',
                      color: '#a7f3d0',
                      fontSize: '13px',
                      fontFamily: "'JetBrains Mono', monospace",
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      margin: 0,
                      lineHeight: 1.6,
                    }}>{stdout}</pre>
                  </div>
                ) : output.status?.id === 3 ? (
                  <div style={{
                    padding: '12px', borderRadius: '8px',
                    background: 'rgba(34,211,160,0.05)',
                    border: '1px solid rgba(34,211,160,0.15)',
                    color: 'var(--text-secondary)', fontSize: '13px', fontStyle: 'italic',
                    marginBottom: '12px',
                  }}>
                    Program exited successfully with no output.
                  </div>
                ) : null}

                {/* Compile Error */}
                {compileOut && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#fbbf24', letterSpacing: '0.06em', marginBottom: '6px' }}>COMPILE OUTPUT</div>
                    <pre style={{
                      background: 'rgba(251,191,36,0.05)',
                      border: '1px solid rgba(251,191,36,0.15)',
                      borderRadius: '8px',
                      padding: '12px',
                      color: '#fcd34d',
                      fontSize: '12px',
                      fontFamily: "'JetBrains Mono', monospace",
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      margin: 0,
                      lineHeight: 1.6,
                    }}>{compileOut}</pre>
                  </div>
                )}

                {/* Runtime Error */}
                {stderr && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#f87171', letterSpacing: '0.06em', marginBottom: '6px' }}>STDERR</div>
                    <pre style={{
                      background: 'rgba(248,113,113,0.05)',
                      border: '1px solid rgba(248,113,113,0.15)',
                      borderRadius: '8px',
                      padding: '12px',
                      color: '#fca5a5',
                      fontSize: '12px',
                      fontFamily: "'JetBrains Mono', monospace",
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      margin: 0,
                      lineHeight: 1.6,
                    }}>{stderr}</pre>
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: '100%', gap: '12px',
                color: 'var(--text-secondary)', textAlign: 'center',
              }}>
                <div style={{ fontSize: '40px', opacity: 0.3 }}>▶</div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                  Run your code to see output
                </div>
                <div style={{ fontSize: '12px', opacity: 0.6 }}>
                  Press <kbd style={{
                    background: 'var(--bg-panel)', border: '1px solid var(--border)',
                    borderRadius: '4px', padding: '1px 6px', fontFamily: 'monospace',
                  }}>⌘</kbd> + <kbd style={{
                    background: 'var(--bg-panel)', border: '1px solid var(--border)',
                    borderRadius: '4px', padding: '1px 6px', fontFamily: 'monospace',
                  }}>↵</kbd> to run
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Spinner keyframe injected inline */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slide-up { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        select:focus { outline: 1px solid var(--accent) !important; }
        textarea::placeholder { color: #55556a; }
      `}</style>
    </div>
  );
};
