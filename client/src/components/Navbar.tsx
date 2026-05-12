import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Zap, LogOut } from 'lucide-react';

export const Navbar = () => {
  const [username, setUsername] = useState<string | null>(null);
  const [profileHover, setProfileHover] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUsername(user.username);
      } catch (e) {}
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUsername(null);
    navigate('/');
  };

  return (
    <nav
      className="flex items-center justify-between h-[60px] pl-6 pr-4 sticky top-0 z-50 transition-colors"
      style={{
        background: 'rgba(6, 7, 10, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
      }}
    >
      {/* ── Brand ── */}
      <Link to="/" className="flex items-center gap-3 no-underline">
        <div className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center bg-gradient-to-br from-[#00e5ff] to-[#7c3aed] shadow-[0_0_24px_rgba(0,229,255,0.15),0_0_8px_rgba(124,58,237,0.15)]">
          <Zap size={16} color="#fff" strokeWidth={2.5} />
        </div>
        <div className="flex flex-col">
          <span className="text-[17px] font-[800] tracking-[-0.02em] text-white leading-[1.1] font-['Space_Grotesk']">
            CODE<span className="text-[#00e5ff]">CLASH</span>
          </span>
          <span className="text-[8.5px] font-[500] tracking-[0.22em] text-[#3d405a] uppercase">
            CODE. CLASH. CONQUER.
          </span>
        </div>
      </Link>

      {/* ── Right: Profile / Sign In ── */}
      <div className="flex items-center gap-3">
        {username ? (
          <>
            <Link
              to="/profile"
              className="flex items-center gap-2.5 no-underline"
              onMouseEnter={() => setProfileHover(true)}
              onMouseLeave={() => setProfileHover(false)}
              style={{
                padding: '7px 16px',
                borderRadius: '10px',
                background: profileHover
                  ? 'rgba(0, 229, 255, 0.08)'
                  : 'rgba(255, 255, 255, 0.04)',
                border: profileHover
                  ? '1px solid rgba(0, 229, 255, 0.25)'
                  : '1px solid rgba(255, 255, 255, 0.06)',
                transition: 'all 0.25s ease',
              }}
            >
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.15), rgba(124, 58, 237, 0.15))',
                border: '1px solid rgba(0, 229, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 700,
                color: '#00e5ff',
                fontFamily: "'Space Grotesk', sans-serif",
              }}>
                {username.charAt(0).toUpperCase()}
              </div>
              <span style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#e8eaf0',
              }}>{username}</span>
            </Link>
            <button
              onClick={handleLogout}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                background: 'rgba(248, 113, 113, 0.06)',
                border: '1px solid rgba(248, 113, 113, 0.1)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                color: '#f87171',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(248, 113, 113, 0.12)';
                e.currentTarget.style.borderColor = 'rgba(248, 113, 113, 0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(248, 113, 113, 0.06)';
                e.currentTarget.style.borderColor = 'rgba(248, 113, 113, 0.1)';
              }}
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </>
        ) : (
          <Link
            to="/login"
            className="flex items-center gap-2 no-underline"
            style={{
              padding: '8px 20px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.1) 0%, rgba(124, 58, 237, 0.1) 100%)',
              border: '1px solid rgba(0, 229, 255, 0.2)',
              transition: 'all 0.3s ease',
              fontSize: '13px',
              fontWeight: 600,
              color: '#00e5ff',
              letterSpacing: '0.01em',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 229, 255, 0.18) 0%, rgba(124, 58, 237, 0.18) 100%)';
              e.currentTarget.style.borderColor = 'rgba(0, 229, 255, 0.4)';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 229, 255, 0.1), 0 0 40px rgba(124, 58, 237, 0.05)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 229, 255, 0.1) 0%, rgba(124, 58, 237, 0.1) 100%)';
              e.currentTarget.style.borderColor = 'rgba(0, 229, 255, 0.2)';
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <User size={14} />
            Sign In
          </Link>
        )}
      </div>
    </nav>
  );
};