import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  getLobsterDocument,
  getLobsterDocuments,
  saveLobsterDocument,
} from '../lib/device-api';
import type { LobsterDocumentSummary } from '../lib/types';

export function LobsterDocsPage() {
  const [documents, setDocuments] = useState<LobsterDocumentSummary[]>([]);
  const [currentDocumentId, setCurrentDocumentId] = useState('soul');
  const [documentContent, setDocumentContent] = useState('');
  const [loadingDocument, setLoadingDocument] = useState(true);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [busyAction, setBusyAction] = useState<'save' | 'reload' | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadingDocuments(true);
      try {
        const items = await getLobsterDocuments();
        if (cancelled) return;
        setDocuments(items);
        if (!items.find((item) => item.id === currentDocumentId)) {
          setCurrentDocumentId(items[0]?.id || 'soul');
        }
      } finally {
        if (!cancelled) {
          setLoadingDocuments(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [currentDocumentId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadingDocument(true);
      const next = await getLobsterDocument(currentDocumentId);
      if (cancelled) return;
      setDocumentContent(next.content);
      setLoadingDocument(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [currentDocumentId]);

  return (
    <section className="list-card panel">
        <div className="section-title">
          <div>
            <h2>龙虾文档</h2>
            <p>这里直接修改龙虾自己的内置文稿，保存后马上生效。当前共 {documents.length} 份。</p>
          </div>
        </div>
      <div className="grid-2">
        <div className="field">
          <label>文档</label>
          <select disabled={loadingDocuments || busyAction !== null} value={currentDocumentId} onChange={(event) => setCurrentDocumentId(event.target.value)}>
            {documents.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>用途说明</label>
          <input
            value={loadingDocuments ? '正在加载文档说明...' : (documents.find((item) => item.id === currentDocumentId)?.description || '这里显示这份文稿的用途')}
            readOnly
          />
        </div>
      </div>
      <div className="field">
        <label>文档内容</label>
        <textarea
          value={loadingDocument ? '正在读取文稿…' : documentContent}
          onChange={(event) => setDocumentContent(event.target.value)}
          style={{ minHeight: 420 }}
          readOnly={loadingDocument || busyAction !== null}
        />
      </div>
      <div className="cluster">
        <button
          className="button primary"
          disabled={loadingDocument || busyAction !== null}
          onClick={() => {
            setBusyAction('save');
            void saveLobsterDocument(currentDocumentId, documentContent)
              .then((next) => {
                setDocumentContent(next.content);
                toast.success('文稿已保存');
              })
              .finally(() => setBusyAction(null));
          }}
        >
          {busyAction === 'save' ? '保存中...' : '保存'}
        </button>
        <button
          className="button ghost"
          disabled={loadingDocument || busyAction !== null}
          onClick={() => {
            setBusyAction('reload');
            void getLobsterDocument(currentDocumentId).then((next) => {
              setDocumentContent(next.content);
              toast.success('已重新加载文稿');
            }).finally(() => setBusyAction(null));
          }}
        >
          {busyAction === 'reload' ? '重新加载中...' : '重新加载'}
        </button>
      </div>
    </section>
  );
}
