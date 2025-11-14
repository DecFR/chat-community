import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MainLayout from './pages/MainLayout';
import AdminDashboard from './pages/AdminDashboard';
import ChatView from './components/ChatView';
import WelcomeScreen from './components/WelcomeScreen';
import { useAuthStore } from './stores/authStore';
import Toasts from './components/Toasts';

function App() {
  const { isAuthenticated } = useAuthStore();

  return (
    <BrowserRouter>
      <Toasts />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/app/*"
          element={
            isAuthenticated ? (
              <MainLayout />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        >
          <Route index element={<WelcomeScreen />} />
          <Route path="channel/:channelId" element={<ChatView />} />
          <Route path="dm/:friendId" element={<ChatView isDM />} />
          <Route path="admin" element={<AdminDashboard />} />
        </Route>
        <Route path="/" element={<Navigate to="/app" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
