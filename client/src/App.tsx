import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { BattlePage } from './pages/BattlePage';
import { LiveBattlePage } from './pages/LiveBattlePage';
import AuthPage from './pages/AuthPage';
import ProfilePage from './pages/ProfilePage';
import TermsPage from './pages/TermsPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          {/* Home - Lobby */}
          <Route index element={<BattlePage />} />
          
          {/* Main Navigation Pages */}
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/auth" element={<Navigate to="/login" replace />} />
          <Route path="/terms" element={<TermsPage />} />
          
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
        
        {/* Fullscreen Battle Route */}
        <Route path="/battle/:roomId" element={<LiveBattlePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
