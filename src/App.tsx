import { useCallback, useEffect, useMemo, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell } from './components/AppShell';
import {
  clearDeviceProfile,
  getGatewayStatus,
  probeDevice,
  readDeviceProfile,
  saveDeviceProfile,
} from './lib/device-api';
import type { DeviceProfile, GatewayStatus } from './lib/types';
import { AgentsPage } from './pages/AgentsPage';
import { ChannelsPage } from './pages/ChannelsPage';
import { ChatPage } from './pages/ChatPage';
import { CronPage } from './pages/CronPage';
import { DevicePage } from './pages/DevicePage';
import { OverviewPage } from './pages/OverviewPage';
import { PairingPage } from './pages/PairingPage';
import { ProvidersPage } from './pages/ProvidersPage';
import { SettingsPage } from './pages/SettingsPage';
import { SkillsPage } from './pages/SkillsPage';

const routeTitles: Record<string, string> = {
  '/': '总览',
  '/chat': '聊天',
  '/agents': '智能体',
  '/skills': '技能',
  '/cron': '定时任务',
  '/providers': '模型与账号',
  '/device': '设备',
  '/settings': '设置',
};

function App() {
  const [device, setDevice] = useState<DeviceProfile | null>(() => readDeviceProfile());
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null);
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const location = useLocation();

  const pageTitle = useMemo(() => {
    if (!device) return '天玑云科Claw';
    return routeTitles[location.pathname] ? `天玑云科Claw · ${routeTitles[location.pathname]}` : '天玑云科Claw';
  }, [device, location.pathname]);

  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  const refreshGateway = useCallback(async () => {
    if (!device) return;
    try {
      const status = await getGatewayStatus();
      setGatewayStatus(status);
      setGatewayError(null);
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : String(error));
    }
  }, [device]);

  useEffect(() => {
    if (!device) return;
    void refreshGateway();
    const timer = window.setInterval(() => {
      void refreshGateway();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [device, refreshGateway]);

  const handlePair = useCallback(async (profile: DeviceProfile) => {
    const status = await probeDevice(profile.baseUrl);
    saveDeviceProfile(profile);
    setDevice(profile);
    setGatewayStatus(status);
    setGatewayError(null);
    toast.success(`已连接到 ${profile.name}`);
  }, []);

  const handleForgetDevice = useCallback(() => {
    clearDeviceProfile();
    setDevice(null);
    setGatewayStatus(null);
    setGatewayError(null);
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
          element={<OverviewPage gatewayStatus={gatewayStatus} gatewayError={gatewayError} />}
        />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/skills" element={<SkillsPage />} />
        <Route path="/cron" element={<CronPage />} />
        <Route path="/providers" element={<ProvidersPage />} />
        <Route path="/device" element={<DevicePage device={device} onForgetDevice={handleForgetDevice} />} />
        <Route path="/settings" element={<SettingsPage><ChannelsPage /></SettingsPage>} />
      </Route>
    </Routes>
  );
}

export default App;
