import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  getInstalledSkills,
  uninstallSkill,
} from '../lib/device-api';
import type { SkillRecord } from '../lib/types';

function getSkillBadgeLabel(skill: SkillRecord): string {
  const source = String(skill.name || skill.slug || 'SK').trim();
  const parts = source.split(/[\s-_]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function SkillsPage() {
  const [installed, setInstalled] = useState<SkillRecord[]>([]);
  const [loadingInstalled, setLoadingInstalled] = useState(true);
  const [query, setQuery] = useState('');
  const [busySkillSlug, setBusySkillSlug] = useState<string | null>(null);

  const loadInstalled = async () => {
    setLoadingInstalled(true);
    try {
      setInstalled(await getInstalledSkills());
    } finally {
      setLoadingInstalled(false);
    }
  };

  useEffect(() => {
    void loadInstalled();
  }, []);

  const filteredSkills = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return installed;
    return installed.filter((skill) => {
      const haystack = [
        skill.name,
        skill.description,
        skill.slug,
        skill.source,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [installed, query]);

  return (
    <section className="list-card panel">
      <div className="section-title">
        <div>
          <h2>已安装技能</h2>
          <p>按卡片查看当前设备已安装技能，并支持按名称或描述快速筛选。当前共 {filteredSkills.length} 个。</p>
        </div>
      </div>
      <div className="skills-toolbar">
        <input
          className="skills-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索技能名称或描述"
        />
      </div>
      <div className="skills-grid">
        {loadingInstalled ? <div className="empty">正在读取已安装技能…</div> : null}
        {filteredSkills.map((skill) => (
          <article className="skill-card" key={skill.id}>
            <div className="skill-card-top">
              <div className="skill-logo" aria-hidden="true">
                {getSkillBadgeLabel(skill)}
              </div>
              <div className="skill-meta">
                <strong>{skill.name}</strong>
                <div className="muted skill-description">{skill.description || '当前技能未提供额外描述。'}</div>
              </div>
            </div>

            <div className="chip-row">
              {skill.version ? <span className="chip">{skill.version}</span> : null}
              {skill.source ? <span className="chip">{skill.source}</span> : null}
            </div>

            <div className="skill-card-footer">
              {skill.baseDir ? <div className="muted mono skill-path">{skill.baseDir}</div> : <span />}
              {skill.slug ? (
                <button
                  className="button danger"
                  disabled={busySkillSlug !== null}
                  onClick={() => {
                    setBusySkillSlug(skill.slug!);
                    void uninstallSkill(skill.slug!)
                      .then(loadInstalled)
                      .then(() => toast.success('技能已卸载'))
                      .finally(() => setBusySkillSlug(null));
                  }}
                >
                  {busySkillSlug === skill.slug ? '卸载中...' : '卸载'}
                </button>
              ) : null}
            </div>
          </article>
        ))}
        {!loadingInstalled && installed.length === 0 ? <div className="empty">设备暂未返回已安装技能。</div> : null}
        {!loadingInstalled && installed.length > 0 && filteredSkills.length === 0 ? <div className="empty">没有匹配的技能。</div> : null}
      </div>
    </section>
  );
}
