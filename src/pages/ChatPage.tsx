import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { toast } from 'sonner';
import {
  abortChat,
  buildMainSessionKey,
  buildNewSessionKey,
  deleteUploadedFile,
  deleteSession,
  getAgents,
  getChatHistory,
  getChatSessions,
  getGatewayStatus,
  isCurrentClientSession,
  getUploadedFiles,
  readDeviceProfile,
  sendChatMessage,
  stageFileBuffer,
} from '../lib/device-api';
import { formatMessageRole, formatTime, safePretty } from '../lib/format';
import type { AgentSummary, ChatSession, GatewayStatus, RawMessage, StagedFile, UploadedFileRecord } from '../lib/types';

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

function inferMimeType(fileName: string): string {
  const normalized = String(fileName || '').toLowerCase();
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  if (normalized.endsWith('.gif')) return 'image/gif';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.pdf')) return 'application/pdf';
  if (normalized.endsWith('.txt') || normalized.endsWith('.md')) return 'text/plain';
  if (normalized.endsWith('.csv')) return 'text/csv';
  if (normalized.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

function getFileTypeBadge(fileName: string): string {
  const normalized = String(fileName || '').toLowerCase();
  if (normalized.endsWith('.png') || normalized.endsWith('.jpg') || normalized.endsWith('.jpeg') || normalized.endsWith('.gif') || normalized.endsWith('.webp')) {
    return '图';
  }
  if (normalized.endsWith('.pdf')) return 'PDF';
  if (normalized.endsWith('.doc') || normalized.endsWith('.docx')) return 'DOC';
  if (normalized.endsWith('.xls') || normalized.endsWith('.xlsx') || normalized.endsWith('.csv')) return '表';
  if (normalized.endsWith('.ppt') || normalized.endsWith('.pptx')) return 'PPT';
  if (normalized.endsWith('.md') || normalized.endsWith('.txt')) return '文';
  if (normalized.endsWith('.json') || normalized.endsWith('.yaml') || normalized.endsWith('.yml')) return '码';
  if (normalized.endsWith('.zip') || normalized.endsWith('.rar') || normalized.endsWith('.7z')) return '包';
  return '档';
}

function formatFileSize(fileSize: number): string {
  if (fileSize >= 1024 * 1024 * 1024) return `${(fileSize / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (fileSize >= 1024 * 1024) return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
  if (fileSize >= 1024) return `${(fileSize / 1024).toFixed(1)} KB`;
  return `${fileSize} B`;
}

function getUploadedFileIdFromPath(filePath: string): string {
  return String(filePath || '').split('/').filter(Boolean).pop() || String(filePath || '');
}

function formatSessionTitle(session: ChatSession, agent: AgentSummary | null): string {
  const mainSessionKey = agent?.mainSessionKey || buildMainSessionKey(agent?.id || 'main');
  const rawTitle = String(session.label || session.displayName || '').trim();
  if (rawTitle && !rawTitle.startsWith('agent:')) {
    return rawTitle;
  }
  if (session.key === mainSessionKey) {
    return '当前对话';
  }
  return '新对话';
}

function truncateText(value: string, maxLength: number): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}…` : trimmed;
}

function buildSessionSummary(history: RawMessage[]): { title: string; preview: string } | null {
  const firstUser = history.find((message) => message.role === 'user');
  const firstAssistant = history.find((message) => message.role === 'assistant');
  const title = truncateText(normalizeMessageContent(firstUser?.content || '').replace(/\s+/g, ' '), 28);
  const preview = truncateText(normalizeMessageContent(firstAssistant?.content || '').replace(/\s+/g, ' '), 42);
  if (!title && !preview) return null;
  return {
    title: title || '新对话',
    preview: preview || '等待回复',
  };
}

function mergeSessions(serverSessions: ChatSession[], existingSessions: ChatSession[]): ChatSession[] {
  const optimisticSessions = existingSessions.filter((session) => {
    if (serverSessions.some((item) => item.key === session.key)) return false;
    const title = String(session.label || session.displayName || '');
    return title === '新对话' || title === '当前对话';
  });

  return [...optimisticSessions, ...serverSessions].sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
}

type PendingMessage = RawMessage & {
  sessionKey: string;
  baselineMatchCount?: number;
};

function isPendingMessageResolved(history: RawMessage[], pending: PendingMessage): boolean {
  const pendingText = normalizeMessageContent(pending.content).trim();
  if (!pendingText) return false;

  const historyMatchCount = history.filter((message) => {
    return message.role === pending.role && normalizeMessageContent(message.content).trim() === pendingText;
  }).length;

  return historyMatchCount > Number(pending.baselineMatchCount || 0);
}

export function ChatPage() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentAgentId, setCurrentAgentId] = useState('main');
  const [currentSessionKey, setCurrentSessionKey] = useState(() => buildMainSessionKey('main'));
  const [messages, setMessages] = useState<RawMessage[]>([]);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<StagedFile[]>([]);
  const [sending, setSending] = useState(false);
  const [sessionSummaries, setSessionSummaries] = useState<Record<string, { title: string; preview: string }>>({});
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [showUploadedFiles, setShowUploadedFiles] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileRecord[]>([]);
  const [loadingUploadedFiles, setLoadingUploadedFiles] = useState(false);
  const [deletingUploadedFileId, setDeletingUploadedFileId] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [refreshingSessions, setRefreshingSessions] = useState(false);
  const [deletingSession, setDeletingSession] = useState(false);
  const [aborting, setAborting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null);
  const dragDepthRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastGatewayConsoleKeyRef = useRef<string | null>(null);

  const resolveMainSessionKey = (agentId: string, sourceAgents: AgentSummary[] = agents) => {
    return sourceAgents.find((agent) => agent.id === agentId)?.mainSessionKey || buildMainSessionKey(agentId);
  };

  const loadAgents = async () => {
    const snapshot = await getAgents();
    setAgents(snapshot.agents);
    if (!snapshot.agents.find((agent) => agent.id === currentAgentId)) {
      const nextAgentId = snapshot.defaultAgentId || snapshot.agents[0]?.id || 'main';
      setCurrentAgentId(nextAgentId);
      setCurrentSessionKey(resolveMainSessionKey(nextAgentId, snapshot.agents));
    }
  };

  const loadSessions = async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setRefreshingSessions(true);
    }
    try {
      const next = await getChatSessions();
      setSessions((current) => mergeSessions(next, current));
    } finally {
      if (!silent) {
        setRefreshingSessions(false);
      }
    }
  };

  const loadHistory = async (sessionKey = currentSessionKey, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoadingHistory(true);
    }
    try {
      const history = await getChatHistory(sessionKey);
      setMessages(history);
      const summary = buildSessionSummary(history);
      if (summary) {
        setSessionSummaries((current) => ({ ...current, [sessionKey]: summary }));
      }
      setPendingMessages((current) => current.filter((item) => item.sessionKey !== sessionKey || !isPendingMessageResolved(history, item)));
    } finally {
      if (!silent) {
        setLoadingHistory(false);
      }
    }
  };

  useEffect(() => {
    void loadAgents();
  }, []);

  useEffect(() => {
    void loadSessions({ silent: true });
  }, [agents.length]);

  useEffect(() => {
    void loadHistory(currentSessionKey, { silent: false });
  }, [currentSessionKey]);

  useEffect(() => {
    const profile = readDeviceProfile();
    if (!profile) return;
    const source = new EventSource(`${profile.baseUrl}/api/events`);
    const reload = () => {
      void loadSessions({ silent: true });
      void loadHistory(currentSessionKey, { silent: true });
    };
    source.addEventListener('gateway:notification', reload as EventListener);
    source.addEventListener('gateway:chat-message', reload as EventListener);
    return () => source.close();
  }, [currentSessionKey, currentAgentId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadSessions({ silent: true });
      void loadHistory(currentSessionKey, { silent: true });
    }, sending ? 2000 : 6000);
    return () => window.clearInterval(timer);
  }, [currentSessionKey, currentAgentId, sending]);

  useEffect(() => {
    void loadUploadedFiles();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const next = await getGatewayStatus();
        if (!cancelled) {
          setGatewayStatus(next);
        }
      } catch {
        if (!cancelled) {
          setGatewayStatus(null);
        }
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 8000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!gatewayStatus || gatewayStatus.state === 'running') {
      lastGatewayConsoleKeyRef.current = null;
      return;
    }

    const consoleKey = JSON.stringify({
      state: gatewayStatus.state,
      port: gatewayStatus.port,
      pid: gatewayStatus.pid,
      error: gatewayStatus.error,
    });

    if (lastGatewayConsoleKeyRef.current === consoleKey) {
      return;
    }

    lastGatewayConsoleKeyRef.current = consoleKey;
    console.error('[tjykClaw] 聊天状态异常', gatewayStatus);
  }, [gatewayStatus]);

  const currentAgent = useMemo(
    () => agents.find((agent) => agent.id === currentAgentId) || null,
    [agents, currentAgentId],
  );

  const currentAgentSessions = useMemo(() => {
    const related = sessions
      .filter((session) => session.key.startsWith(`agent:${currentAgentId}:`) && isCurrentClientSession(session.key))
      .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));

    if (!related.some((session) => session.key === currentSessionKey) && currentSessionKey.startsWith(`agent:${currentAgentId}:`)) {
      related.unshift({
        key: currentSessionKey,
        displayName: currentSessionKey === resolveMainSessionKey(currentAgentId) ? '当前对话' : '新对话',
        updatedAt: Date.now(),
        model: currentAgent?.modelDisplay,
      });
    }

    return related;
  }, [currentAgent?.modelDisplay, currentAgentId, currentSessionKey, sessions]);

  const displayedMessages = useMemo(() => {
    const currentPending = pendingMessages
      .filter((message) => message.sessionKey === currentSessionKey)
      .filter((message) => !isPendingMessageResolved(messages, message));
    return [...messages, ...currentPending].sort((left, right) => (left.timestamp || 0) - (right.timestamp || 0));
  }, [currentSessionKey, messages, pendingMessages]);

  const currentSessionSummary = currentSessionKey ? sessionSummaries[currentSessionKey] : null;

  useEffect(() => {
    const pending = currentAgentSessions.filter((session) => !sessionSummaries[session.key]);
    if (!pending.length) return;

    let cancelled = false;
    void Promise.all(
      pending.slice(0, 12).map(async (session) => {
        try {
          const history = await getChatHistory(session.key);
          const summary = buildSessionSummary(history);
          if (!summary || cancelled) return;
          setSessionSummaries((current) => ({ ...current, [session.key]: summary }));
        } catch {
          // Ignore per-session summary errors.
        }
      }),
    );

    return () => {
      cancelled = true;
    };
  }, [currentAgentSessions, sessionSummaries]);

  const handleSelectAgent = (agentId: string) => {
    setCurrentAgentId(agentId);
    const related = sessions
      .filter((session) => session.key.startsWith(`agent:${agentId}:`) && isCurrentClientSession(session.key))
      .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
    setCurrentSessionKey(related[0]?.key || resolveMainSessionKey(agentId));
  };

  const handleSelectSession = (sessionKey: string) => {
    setCurrentSessionKey(sessionKey);
  };

  const handleCreateSessionForAgent = (agentId: string) => {
    const createdAt = Date.now();
    const nextSessionKey = buildNewSessionKey(agentId);
    const agent = agents.find((item) => item.id === agentId) || null;
    const placeholderSession: ChatSession = {
      key: nextSessionKey,
      displayName: '新对话',
      updatedAt: createdAt,
      model: agent?.modelDisplay,
    };

    setCurrentAgentId(agentId);
    setSessions((current) => [placeholderSession, ...current.filter((session) => session.key !== nextSessionKey)]);
    setCurrentSessionKey(nextSessionKey);
    setSessionSummaries((current) => ({
      ...current,
      [nextSessionKey]: {
        title: '新对话',
        preview: '从这里开始聊天',
      },
    }));
    setMessages([]);
    setPendingMessages((current) => current.filter((item) => item.sessionKey !== nextSessionKey));
  };

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setUploadingFiles(true);
    try {
      const staged = await Promise.all(Array.from(fileList).map((file) => stageFileBuffer(file)));
      setAttachments((current) => [...current, ...staged]);
      setUploadedFiles((current) => {
        const next = [...current];
        for (const file of staged) {
          const id = getUploadedFileIdFromPath(file.stagedPath);
          if (next.some((entry) => entry.id === id)) continue;
          next.unshift({
            id,
            fileName: file.fileName,
            storedPath: file.stagedPath,
            fileSize: file.fileSize,
            updatedAt: new Date().toISOString(),
          });
        }
        return next;
      });
      setShowUploadedFiles(true);
      void loadUploadedFiles();
      toast.success(`已上传 ${staged.length} 个文件，并加入当前聊天`);
    } finally {
      setUploadingFiles(false);
    }
  };

  const handlePickFiles = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    void handleUpload(event.target.files);
    event.target.value = '';
  };

  const loadUploadedFiles = async () => {
    setLoadingUploadedFiles(true);
    try {
      const items = await getUploadedFiles();
      setUploadedFiles(items);
    } finally {
      setLoadingUploadedFiles(false);
    }
  };

  const handleSend = async () => {
    if (!draft.trim() && attachments.length === 0) return;
    const messageText = draft;
    const stagedAttachments = attachments;
    const pendingText = normalizeMessageContent(messageText).trim();
    const baselineMatchCount = messages.filter((message) => (
      message.role === 'user' && normalizeMessageContent(message.content).trim() === pendingText
    )).length;
    const pendingMessage: PendingMessage = {
      id: `pending-${Date.now()}`,
      sessionKey: currentSessionKey,
      role: 'user',
      content: messageText,
      timestamp: Date.now(),
      baselineMatchCount,
      _attachedFiles: stagedAttachments,
    };
    setSending(true);
    setPendingMessages((current) => [...current, pendingMessage]);
    setSessionSummaries((current) => {
      if (current[currentSessionKey]?.title && current[currentSessionKey].title !== '新对话') {
        return current;
      }
      return {
        ...current,
        [currentSessionKey]: {
          title: truncateText(messageText.replace(/\s+/g, ' '), 28) || '新对话',
          preview: current[currentSessionKey]?.preview || '等待回复',
        },
      };
    });
    const pollTimer = window.setInterval(() => {
      void loadSessions();
      void loadHistory(currentSessionKey, { silent: true });
    }, 3000);
    try {
      await sendChatMessage(currentSessionKey, messageText, stagedAttachments);
      setDraft('');
      setAttachments([]);
      window.setTimeout(() => {
        void loadSessions();
        void loadHistory(currentSessionKey, { silent: true });
      }, 700);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPendingMessages((current) => current.filter((item) => item.id !== pendingMessage.id));
      toast.error(message);
      void loadHistory(currentSessionKey, { silent: true });
    } finally {
      window.clearInterval(pollTimer);
      setSending(false);
    }
  };

  const handleToggleUploadedFiles = () => {
    const next = !showUploadedFiles;
    setShowUploadedFiles(next);
    if (next) {
      void loadUploadedFiles();
    }
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setDragActive(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!dragActive) {
      setDragActive(true);
    }
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setDragActive(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setDragActive(false);
    void handleUpload(event.dataTransfer.files);
  };

  const handleReuseUploadedFile = (file: UploadedFileRecord) => {
    setAttachments((current) => [
      ...current,
      {
        id: `stored-${file.id}`,
        fileName: file.fileName,
        mimeType: inferMimeType(file.fileName),
        fileSize: file.fileSize,
        stagedPath: file.storedPath,
        preview: null,
      },
    ]);
    toast.success('文件已重新加入当前附件');
  };

  const handleCopyUploadedFilePath = async (file: UploadedFileRecord) => {
    try {
      await navigator.clipboard.writeText(file.storedPath);
      toast.success('文件路径已复制');
    } catch {
      toast.error('复制路径失败');
    }
  };

  const handleDeleteUploadedFile = async (file: UploadedFileRecord) => {
    if (!window.confirm(`确定删除文件 ${file.fileName}？`)) return;
    setDeletingUploadedFileId(file.id);
    try {
      await deleteUploadedFile(file.id);
      setUploadedFiles((current) => current.filter((entry) => entry.id !== file.id));
      setAttachments((current) => current.filter((entry) => entry.stagedPath !== file.storedPath));
      toast.success('文件已删除');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message || '删除文件失败');
      await loadUploadedFiles();
    } finally {
      setDeletingUploadedFileId(null);
    }
  };

  return (
    <>
      <section className="split">
        <div className="list-card panel">
          <div className="section-title">
            <div>
              <h2>对话列表</h2>
              <p>{currentAgent ? `当前角色：${currentAgent.name}` : '选择一个角色后开始新对话。'}</p>
            </div>
          </div>

          <div className="cluster">
            <button className="button primary" disabled={sending || deletingSession || aborting} onClick={() => handleCreateSessionForAgent(currentAgentId)}>
              新建对话
            </button>
            <button className="button ghost" disabled={sending || deletingSession || aborting || refreshingSessions} onClick={() => void loadSessions()}>
              {refreshingSessions ? '正在加载...' : '刷新'}
            </button>
          </div>

          <div className="role-switcher">
            {agents.map((agent) => (
              <button
                className={`role-chip ${currentAgentId === agent.id ? 'active' : ''}`}
                key={agent.id}
                disabled={sending || deletingSession || aborting}
                onClick={() => handleSelectAgent(agent.id)}
              >
                {agent.name}
              </button>
            ))}
          </div>

          <div className="chat-list">
            {currentAgentSessions.map((session) => (
              <button
                className={`session-item session-list-row ${currentSessionKey === session.key ? 'active' : ''}`}
                key={session.key}
                disabled={sending || deletingSession || aborting}
                onClick={() => handleSelectSession(session.key)}
              >
                <div className="session-list-copy">
                  <strong>{sessionSummaries[session.key]?.title || formatSessionTitle(session, currentAgent)}</strong>
                  <div className="muted">{sessionSummaries[session.key]?.preview || '等待回复'}</div>
                </div>
                <div className="muted session-list-meta">
                  {session.updatedAt ? formatTime(session.updatedAt) : '刚刚创建'}
                </div>
              </button>
            ))}
            {!currentAgentSessions.length ? <div className="empty">点“新建对话”开始第一条聊天。</div> : null}
          </div>
        </div>

        <div className="content-card panel">
          <div className="section-title">
            <div>
              <h2>对话内容</h2>
              {currentSessionSummary?.title ? <p>{currentSessionSummary.title}</p> : null}
            </div>
            <div className="cluster">
              <div className="chat-status-indicator" title={gatewayStatus?.state === 'running' ? '运行中' : '未就绪'}>
                <span className={`status-dot ${gatewayStatus?.state === 'running' ? 'ok' : 'warn'}`} />
              </div>
              <button
                className="button ghost"
                disabled={aborting || deletingSession}
                onClick={() => {
                  setAborting(true);
                  void abortChat(currentSessionKey).finally(() => {
                    setSending(false);
                    setAborting(false);
                    void loadHistory(currentSessionKey, { silent: true });
                  });
                }}
              >
                {aborting ? '正在中止...' : '中止运行'}
              </button>
              <button
                className="button danger"
                disabled={deletingSession || sending || aborting}
                onClick={() => {
                  setDeletingSession(true);
                  void deleteSession(currentSessionKey)
                    .then(async () => {
                      setSessions((current) => current.filter((session) => session.key !== currentSessionKey));
                      await loadSessions();
                      setPendingMessages((current) => current.filter((item) => item.sessionKey !== currentSessionKey));
                      const fallbackSessions = sessions
                        .filter((session) => session.key !== currentSessionKey && session.key.startsWith(`agent:${currentAgentId}:`))
                        .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
                      setCurrentSessionKey(fallbackSessions[0]?.key || resolveMainSessionKey(currentAgentId));
                    })
                    .finally(() => setDeletingSession(false));
                }}
              >
                {deletingSession ? '删除中...' : '删除当前对话'}
              </button>
            </div>
          </div>

          <div className="chat-thread">
            {loadingHistory ? <div className="empty">正在读取聊天内容…</div> : null}
            {displayedMessages.map((message, index) => (
              (() => {
                const normalized = normalizeMessageContent(message.content);
                if (!normalized) return null;
                return (
                  <div className={`message ${message.role}`} key={message.id || index}>
                    <div className="eyebrow">
                      {formatMessageRole(message.role)}
                      {message.timestamp ? ` · ${formatTime(message.timestamp)}` : ''}
                    </div>
                    <pre>{normalized}</pre>
                  </div>
                );
              })()
            ))}
            {!loadingHistory && displayedMessages.length === 0 ? <div className="empty">这里还没有聊天内容。</div> : null}
          </div>

          <div
            className={`chat-compose ${dragActive ? 'drop-active' : ''}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              hidden
              multiple
              type="file"
              onChange={handleFileInputChange}
            />
            <div className="field">
              <label>消息内容</label>
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
            </div>

            <div className="cluster chat-compose-actions">
              <button className="button subtle" type="button" disabled={uploadingFiles} onClick={handlePickFiles}>
                {uploadingFiles ? '上传中...' : '上传文件'}
              </button>
              <button className="button ghost" type="button" disabled={uploadingFiles} onClick={handleToggleUploadedFiles}>
                {showUploadedFiles ? `收起已上传文件 (${uploadedFiles.length})` : `已上传文件 (${uploadedFiles.length})`}
              </button>
              <button className="button primary" disabled={sending || uploadingFiles} onClick={() => void handleSend()}>
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

            {showUploadedFiles ? (
              <div className="list-card">
                <div className="section-title">
                  <div>
                    <h2>已上传文件</h2>
                    <p>这里列出已经存好的文件。</p>
                  </div>
                  <button className="button ghost" type="button" disabled={loadingUploadedFiles || deletingUploadedFileId !== null} onClick={() => void loadUploadedFiles()}>
                    {loadingUploadedFiles ? '正在加载...' : '刷新'}
                  </button>
                </div>
                <div className="chat-list">
                  {loadingUploadedFiles ? <div className="empty">正在读取文件…</div> : null}
                  {!loadingUploadedFiles && uploadedFiles.length === 0 ? <div className="empty">这里还没有文件。</div> : null}
                  {uploadedFiles.map((file) => (
                    <div className="selectable-row uploaded-file-row" key={file.id}>
                      <div className="uploaded-file-badge" aria-hidden="true">{getFileTypeBadge(file.fileName)}</div>
                      <div className="uploaded-file-copy">
                        <strong title={file.fileName}>{file.fileName}</strong>
                        <div className="muted">{formatFileSize(file.fileSize)} · {formatTime(file.updatedAt)}</div>
                      </div>
                      <div className="cluster uploaded-file-actions">
                        <button
                          className="button subtle"
                          type="button"
                          disabled={deletingUploadedFileId === file.id}
                          onClick={() => void handleCopyUploadedFilePath(file)}
                        >
                          复制路径
                        </button>
                        <button
                          className="button ghost"
                          type="button"
                          disabled={deletingUploadedFileId === file.id}
                          onClick={() => handleReuseUploadedFile(file)}
                        >
                          重新附加
                        </button>
                        <button
                          className="button danger"
                          type="button"
                          disabled={deletingUploadedFileId === file.id}
                          onClick={() => void handleDeleteUploadedFile(file)}
                        >
                          {deletingUploadedFileId === file.id ? '删除中...' : '删除'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}
