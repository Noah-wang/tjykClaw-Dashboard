import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  abortChat,
  buildMainSessionKey,
  buildNewSessionKey,
  deleteSession,
  getAgents,
  getChatHistory,
  getChatSessions,
  isCurrentClientSession,
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
        if (record.type === 'toolCall' || record.type === 'toolResult') return '';
        if (record.type === 'thinking') return '';
        if (typeof record.text === 'string') return record.text;
        if (typeof record.content === 'string') return record.content;
        if (record.type === 'text' && typeof record.value === 'string') return record.value;
        if (typeof record.thinking === 'string') return '';
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
  }
  return safePretty(content);
}

export function ChatPage() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentAgentId, setCurrentAgentId] = useState('main');
  const [currentSessionKey, setCurrentSessionKey] = useState(() => buildMainSessionKey('main'));
  const [messages, setMessages] = useState<RawMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<StagedFile[]>([]);
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);

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
    if (!next.find((session) => session.key === currentSessionKey && isCurrentClientSession(session.key))) {
      setCurrentSessionKey(buildMainSessionKey(currentAgentId));
    }
  };

  const loadHistory = async (sessionKey = currentSessionKey) => {
    setLoadingHistory(true);
    const history = await getChatHistory(sessionKey);
    setMessages(history);
    setLoadingHistory(false);
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
    const timer = window.setInterval(() => {
      void loadSessions();
      void loadHistory();
    }, sending ? 2000 : 6000);
    return () => window.clearInterval(timer);
  }, [currentSessionKey, currentAgentId, sending]);

  const visibleSessions = useMemo(
    () => sessions.filter((session) => session.key.startsWith(`agent:${currentAgentId}:`) && isCurrentClientSession(session.key)),
    [currentAgentId, sessions],
  );

  const handleNewSession = () => {
    const key = buildNewSessionKey(currentAgentId);
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
    const messageText = draft;
    const stagedAttachments = attachments;
    setSending(true);
    setMessages((current) => [
      ...current,
      {
        id: `pending-${Date.now()}`,
        role: 'user',
        content: messageText,
        timestamp: Date.now(),
        _attachedFiles: stagedAttachments,
      },
    ]);
    const pollTimer = window.setInterval(() => {
      void loadSessions();
      void loadHistory();
    }, 3000);
    try {
      await sendChatMessage(currentSessionKey, messageText, stagedAttachments);
      setDraft('');
      setAttachments([]);
      window.setTimeout(() => {
        void loadSessions();
        void loadHistory();
      }, 700);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
      void loadHistory();
    } finally {
      window.clearInterval(pollTimer);
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
              <button
                className="button ghost"
                onClick={() =>
                  void abortChat(currentSessionKey).finally(() => {
                    setSending(false);
                    void loadHistory();
                  })
                }
              >
                中止运行
              </button>
              <button className="button danger" onClick={() => void deleteSession(currentSessionKey).then(loadSessions)}>
                删除会话
              </button>
            </div>
          </div>

          <div className="chat-thread">
            {loadingHistory ? <div className="empty">正在同步会话内容…</div> : null}
            {messages.map((message, index) => (
              (() => {
                const normalized = normalizeMessageContent(message.content);
                if (!normalized) return null;
                return (
                  <div className={`message ${message.role}`} key={message.id || index}>
                    <div className="eyebrow">{formatMessageRole(message.role)}</div>
                    <pre>{normalized}</pre>
                  </div>
                );
              })()
            ))}
            {!loadingHistory && messages.length === 0 ? <div className="empty">当前会话还没有历史消息。</div> : null}
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
                    setCurrentSessionKey(buildMainSessionKey(newAgentId));
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
