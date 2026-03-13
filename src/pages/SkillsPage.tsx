import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  getInstalledSkills,
  installSkill,
  searchMarketplace,
  uninstallSkill,
} from '../lib/device-api';
import type { MarketplaceSkill, SkillRecord } from '../lib/types';

export function SkillsPage() {
  const [installed, setInstalled] = useState<SkillRecord[]>([]);
  const [query, setQuery] = useState('搜索');
  const [results, setResults] = useState<MarketplaceSkill[]>([]);

  const loadInstalled = async () => {
    setInstalled(await getInstalledSkills());
  };

  useEffect(() => {
    void loadInstalled();
    void handleSearch();
  }, []);

  const handleSearch = async () => {
    setResults(await searchMarketplace(query));
  };

  return (
    <>
      <section className="grid-2">
        <div className="list-card panel">
          <div className="section-title">
            <div>
              <h2>已安装技能</h2>
              <p>设备上已经存在的技能列表。</p>
            </div>
          </div>
          <div className="chat-list">
            {installed.map((skill) => (
              <div className="selectable-row" key={skill.id}>
                <strong>{skill.name}</strong>
                <div className="muted">{skill.description}</div>
                <div className="chip-row">
                  {skill.version ? <span className="chip">{skill.version}</span> : null}
                  {skill.baseDir ? <span className="chip mono">{skill.baseDir}</span> : null}
                </div>
                {skill.slug ? (
                  <div className="cluster">
                    <button
                      className="button danger"
                      onClick={() => void uninstallSkill(skill.slug!).then(loadInstalled).then(() => toast.success('技能已卸载'))}
                    >
                      卸载
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
            {installed.length === 0 ? <div className="empty">设备暂未返回已安装技能。</div> : null}
          </div>
        </div>

        <div className="form-card panel">
          <div className="section-title">
            <div>
              <h2>技能市场</h2>
              <p>搜索 ClawHub，并直接安装到设备上。</p>
            </div>
          </div>

          <div className="cluster">
            <input
              style={{ flex: 1, minWidth: 240 }}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索技能"
            />
            <button className="button primary" onClick={() => void handleSearch()}>
              搜索
            </button>
          </div>

          <div className="chat-list">
            {results.map((skill) => (
              <div className="selectable-row" key={skill.slug}>
                <strong>{skill.name}</strong>
                <div className="muted">{skill.description}</div>
                <div className="chip-row">
                  <span className="chip">{skill.version}</span>
                  {typeof skill.downloads === 'number' ? <span className="chip">{skill.downloads} 下载</span> : null}
                  {typeof skill.stars === 'number' ? <span className="chip">{skill.stars} 星</span> : null}
                </div>
                <div className="cluster">
                  <button
                    className="button subtle"
                    onClick={() => void installSkill(skill.slug).then(loadInstalled).then(() => toast.success('技能已安装'))}
                  >
                    安装
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
