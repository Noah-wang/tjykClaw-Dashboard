import { useCallback, useEffect, useMemo, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell } from './components/AppShell';
import {
  probeDevice,
  readDeviceProfile,
  saveDeviceProfile,
} from './lib/device-api';
import type { DeviceProfile } from './lib/types';
import { AgentsPage } from './pages/AgentsPage';
import { BackupsPage } from './pages/BackupsPage';
import { ChatPage } from './pages/ChatPage';
import { CronPage } from './pages/CronPage';
import { LobsterDocsPage } from './pages/LobsterDocsPage';
import { OverviewPage } from './pages/OverviewPage';
import { PairingPage } from './pages/PairingPage';
import { ProvidersPage } from './pages/ProvidersPage';
import { SkillsPage } from './pages/SkillsPage';

const routeTitles: Record<string, string> = {
  '/': '总览',
  '/chat': '聊天',
  '/agents': '角色管理',
  '/skills': '技能',
  '/cron': '定时任务',
  '/providers': '模型',
  '/backups': '备份恢复',
  '/lobster-docs': '龙虾文档',
};

function App() {
  const [device, setDevice] = useState<DeviceProfile | null>(() => readDeviceProfile());
  const location = useLocation();

  const pageTitle = useMemo(() => {
    if (!device) return '天玑云科Claw';
    return routeTitles[location.pathname] ? `天玑云科Claw · ${routeTitles[location.pathname]}` : '天玑云科Claw';
  }, [device, location.pathname]);

  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  const handlePair = useCallback(async (profile: DeviceProfile) => {
    await probeDevice(profile.baseUrl);
    saveDeviceProfile(profile);
    setDevice(profile);
    toast.success(`已连接到 ${profile.name}`);
  }, []);

  if (!device) {
    return <PairingPage onPair={handlePair} />;
  }

  return (
    <Routes>
      <Route
        element={
          <AppShell />
        }
      >
        <Route
          path="/"
          element={<OverviewPage />}
        />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/skills" element={<SkillsPage />} />
        <Route path="/cron" element={<CronPage />} />
        <Route path="/providers" element={<ProvidersPage />} />
        <Route path="/backups" element={<BackupsPage />} />
        <Route path="/lobster-docs" element={<LobsterDocsPage />} />
      </Route>
    </Routes>
  );
}

export default App;
