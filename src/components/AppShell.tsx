import {
  Activity,
  ArchiveRestore,
  Bot,
  ChevronDown,
  Clock3,
  FilePenLine,
  FolderClosed,
  FolderOpen,
  KeyRound,
  Radio,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

const primaryNavItems = [
  { to: '/', label: '总览', hint: '最近情况', icon: Activity },
  { to: '/chat', label: '聊天', hint: '对话', icon: Radio },
  { to: '/agents', label: '角色管理', hint: '角色', icon: Bot },
  { to: '/cron', label: '定时任务', hint: '自动执行', icon: Clock3 },
];

const lobsterSettingsItems = [
  { to: '/skills', label: '技能', hint: '已添加', icon: Sparkles },
  { to: '/providers', label: '模型', hint: '模型来源 / 用量', icon: KeyRound },
  { to: '/backups', label: '备份恢复', hint: '保存 / 找回', icon: ArchiveRestore },
  { to: '/lobster-docs', label: '龙虾文档', hint: '内置文稿', icon: FilePenLine },
];

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [lobsterSettingsOpen, setLobsterSettingsOpen] = useState(false);
  const location = useLocation();
  const lobsterSettingsActive = lobsterSettingsItems.some((item) => item.to === location.pathname);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (lobsterSettingsActive) {
      setLobsterSettingsOpen(true);
    }
  }, [lobsterSettingsActive]);

  return (
    <div className="shell">
      <aside className={`sidebar panel ${mobileNavOpen ? 'mobile-nav-open' : ''}`}>
        <div className="brand">
          <h1>天玑云科Claw</h1>
        </div>

        <button
          className={`mobile-nav-toggle ${mobileNavOpen ? 'open' : ''}`}
          type="button"
          onClick={() => setMobileNavOpen((current) => !current)}
        >
          <span>页面导航</span>
          <ChevronDown size={16} />
        </button>

        <nav className="nav-list">
          {primaryNavItems.map((item) => {
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

          <div className={`nav-group ${lobsterSettingsActive ? 'active' : ''} ${lobsterSettingsOpen ? 'open' : ''}`}>
            <button
              className={`nav-group-toggle ${lobsterSettingsActive ? 'active' : ''}`}
              type="button"
              onClick={() => setLobsterSettingsOpen((current) => !current)}
            >
              {lobsterSettingsOpen ? <FolderOpen size={16} /> : <FolderClosed size={16} />}
              <div>
                <div>龙虾设置</div>
                <small>文稿 / 备份 / 模型</small>
              </div>
              <ChevronDown size={16} />
            </button>

            {lobsterSettingsOpen ? (
              <div className="nav-sublist">
                {lobsterSettingsItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink key={item.to} to={item.to}>
                      {({ isActive }) => (
                        <div className={`nav-item nav-subitem ${isActive ? 'active' : ''}`}>
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
              </div>
            ) : null}
          </div>
        </nav>
      </aside>

      <main className="main">
        <div className="page-scroll">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
