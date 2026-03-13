import { Activity, Bot, Clock3, Cpu, KeyRound, Radio, Settings2, Sparkles } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: '总览', hint: '实时状态', icon: Activity },
  { to: '/chat', label: '聊天', hint: '会话', icon: Radio },
  { to: '/agents', label: '智能体', hint: '路由', icon: Bot },
  { to: '/skills', label: '技能', hint: '市场', icon: Sparkles },
  { to: '/cron', label: '定时任务', hint: '自动化', icon: Clock3 },
  { to: '/providers', label: '模型与账号', hint: '提供商 / 用量', icon: KeyRound },
  { to: '/device', label: '设备', hint: '配对 / 网关', icon: Cpu },
  { to: '/settings', label: '设置', hint: '运行环境', icon: Settings2 },
];

export function AppShell() {
  return (
    <div className="shell">
      <aside className="sidebar panel">
        <div className="brand">
          <h1>天玑云科Claw</h1>
          <p>
            面向局域网智能硬件的浏览器控制台。
          </p>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to}>
                {({ isActive }) => (
                  <div className={`nav-item ${isActive ? 'active' : ''}`}>
                    <Icon size={16} />
                    <div>
                      <div>{item.label}</div>
                      <small>{item.hint}</small>
                    </div>
                  </div>
                )}
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
