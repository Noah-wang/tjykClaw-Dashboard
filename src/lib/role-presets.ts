export type RolePreset = {
  id: string;
  name: string;
  description: string;
};

export const ROLE_PRESETS: RolePreset[] = [
  {
    id: 'qa-assistant',
    name: '问答助手',
    description: '适合日常问答、快速解释、通用对话和基础信息整理。',
  },
  {
    id: 'research-assistant',
    name: '研究助手',
    description: '适合资料调研、结构化分析、总结对比和深度问题拆解。',
  },
  {
    id: 'document-assistant',
    name: '文档助手',
    description: '适合改写文档、整理内容、提炼重点和生成说明材料。',
  },
  {
    id: 'device-assistant',
    name: '设备管家',
    description: '适合处理硬件状态、局域网设备操作、配置核查和运行排障。',
  },
  {
    id: 'creative-assistant',
    name: '创意助手',
    description: '适合头脑风暴、文案想法、活动主题和灵感延展。',
  },
];

export function findRolePreset(name: string): RolePreset | null {
  const normalized = String(name || '').trim();
  if (!normalized) return null;
  return ROLE_PRESETS.find((preset) => preset.name === normalized) || null;
}
