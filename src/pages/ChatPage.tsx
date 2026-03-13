import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  abortChat,
  deleteSession,
  getAgents,
  getChatHistory,
  getChatSessions,
  readDeviceProfile,
  sendChatMessage,
  stageFileBuffer,
} from '../lib/device-api';
import { formatMessageRole, formatTime, safePretty } from '../lib/format';
import type { AgentSummary, ChatSession, RawMessage, StagedFile } from '../lib/types';

function normalizeMessageContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (!item || typeof item !== 'object') return safePretty(item);
        const record = item as Record<string, unknown>;
        return typeof record.text === 'string'
          ? record.text
          : typeof record.thinking === 'string'
            ? record.thinking
            : safePretty(record);
      })
      .join('\n\n');
  }
  return safePretty(content);
}

export function ChatPage() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentAgentId, setCurrentAgentId] = useState('main');
  const [currentSessionKey, setCurrentSessionKey] = useState('agent:main:main');
  const [messages, setMessages] = useState<RawMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<StagedFile[]>([]);
  const [sending, setSending] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastIncomingContent, setLastIncomingContent] = useState('');
  const [idleTicks, setIdleTicks] = useState(0);

  const loadAgents = async () => {
    const snapshot = await getAgents();
    setAgents(snapshot.agents);
    if (!snapshot.agents.find((agent) => agent.id === currentAgentId)) {
      setCurrentAgentId(snapshot.defaultAgentId || snapshot.agents[0]?.id || 'main');
    }
  };

  const loadSessions = async () => {
    const next = await getChatSessions();
    setSessions(next);
    if (!next.find((session) => session.key === currentSessionKey)) {
      const currentAgent = agents.find((agent) => agent.id === currentAgentId);
      setCurrentSessionKey(currentAgent?.mainSessionKey || `agent:${currentAgentId}:main`);
    }
  };

  const loadHistory = async (sessionKey = currentSessionKey) => {
    const history = await getChatHistory(sessionKey);
    setMessages(history);
  };

  useEffect(() => {
    void loadAgents();
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [agents.length]);

  useEffect(() => {
    void loadHistory();
  }, [currentSessionKey]);

  useEffect(() => {
    const profile = readDeviceProfile();
    if (!profile) return;
    const source = new EventSource(`${profile.baseUrl}/api/events`);
    const reload = () => {
      void loadSessions();
      void loadHistory();
    };
    source.addEventListener('gateway:notification', reload as EventListener);
    source.addEventListener('gateway:chat-message', reload as EventListener);
    return () => source.close();
  }, [currentSessionKey, currentAgentId]);

  useEffect(() => {
    if (isGenerating) {
      const timer = window.setInterval(() => {
        void loadSessions();
        void loadHistory();
        setIdleTicks((prev) => prev + 1);
      }, 1000);
      return () => window.clearInterval(timer);
    }
  }, [isGenerating, currentSessionKey]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;

    if (lastMessage.role === 'user') {
      setIsGenerating(true);
      setIdleTicks(0);
    } else if (lastMessage.role === 'assistant') {
      const content = normalizeMessageContent(lastMessage.content);
      if (content !== lastIncomingContent) {
        setLastIncomingContent(content);
        setIdleTicks(0);
        setIsGenerating(true); // Content is actively growing
      } else if (idleTicks > 3) {
        setIsGenerating(false); // Generation stopped
      }
    }
  }, [messages, idleTicks, lastIncomingContent]);

  const visibleSessions = useMemo(
    () => sessions.filter((session) => session.key.startsWith(`agent:${currentAgentId}:`)),
    [currentAgentId, sessions],
  );

  const handleNewSession = () => {
    const key = `agent:${currentAgentId}:session-${Date.now()}`;
    setCurrentSessionKey(key);
    setMessages([]);
  };

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const staged = await Promise.all(Array.from(fileList).map((file) => stageFileBuffer(file)));
    setAttachments((current) => [...current, ...staged]);
  };

  const handleSend = async () => {
    if (!draft.trim() && attachments.length === 0) return;

    // Optimistic UI update
    const optimisticMessage: RawMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: draft,
    };
    setMessages((prev) => [...prev, optimisticMessage]);

    setSending(true);
    try {
      await sendChatMessage(currentSessionKey, draft, attachments);
      setDraft('');
      setAttachments([]);
      window.setTimeout(() => {
        void loadSessions();
        void loadHistory();
      }, 1200);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <section className="split">
        <div className="list-card panel">
          <div className="section-title">
            <div>
              <h2>会话列表</h2>
              <p>切换会话记录和历史命名空间。</p>
            </div>
          </div>

          <div className="cluster">
            <button className="button primary" onClick={handleNewSession}>
              新建会话
            </button>
            <button className="button ghost" onClick={() => void loadSessions()}>
              刷新
            </button>
          </div>

          <div className="chat-list">
            {visibleSessions.map((session) => (
              <button
                className={`session-item ${currentSessionKey === session.key ? 'active' : ''}`}
                key={session.key}
                onClick={() => setCurrentSessionKey(session.key)}
              >
                <strong>{session.displayName || session.label || session.key}</strong>
                <div className="muted mono">{session.key}</div>
                <div className="muted">{session.updatedAt ? formatTime(session.updatedAt) : '暂无时间'}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="content-card panel">
          <div className="section-title">
            <div>
              <h2>对话内容</h2>
              <p>{currentSessionKey}</p>
            </div>
            <div className="cluster">
              <button className="button ghost" onClick={() => void abortChat(currentSessionKey)}>
                中止运行
              </button>
              <button className="button danger" onClick={() => void deleteSession(currentSessionKey).then(loadSessions)}>
                删除会话
              </button>
            </div>
          </div>

          <div className="chat-thread">
            {messages.map((message, index) => (
              <div className={`message ${message.role}`} key={message.id || index}>
                <div className="eyebrow">{formatMessageRole(message.role)}</div>
                <pre>{normalizeMessageContent(message.content)}</pre>
              </div>
            ))}
            {isGenerating && messages[messages.length - 1]?.role === 'user' ? (
              <div className="message assistant" key="thinking">
                <div className="eyebrow">{formatMessageRole('assistant')}</div>
                <div className="thinking-indicator">
                  <span className="dot"></span><span className="dot"></span><span className="dot"></span>
                  正在思考并生成回复...
                </div>
              </div>
            ) : null}
            {messages.length === 0 ? <div className="empty">当前会话还没有历史消息。</div> : null}
          </div>

          <div className="chat-compose">
            <div className="field">
              <label>消息内容</label>
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
            </div>

            <div className="cluster">
              <select
                value={currentAgentId}
                onChange={(event) => {
                  const newAgentId = event.target.value;
                  setCurrentAgentId(newAgentId);
                  const agent = agents.find((a) => a.id === newAgentId);
                  if (agent) {
                    setCurrentSessionKey(agent.mainSessionKey || `agent:${newAgentId}:main`);
                  }
                }}
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
              </select>
              <input type="file" multiple onChange={(event) => void handleUpload(event.target.files)} />
              <button className="button primary" disabled={sending} onClick={() => void handleSend()}>
                {sending ? '发送中...' : '发送'}
              </button>
            </div>

            {attachments.length > 0 ? (
              <div className="message-attachments">
                {attachments.map((file) => (
                  <div className="attachment-pill" key={file.id}>
                    {file.fileName}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}
