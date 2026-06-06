import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  BookmarkCheck,
  Download,
  FileText,
  Loader2,
  MessageSquare,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import api from '../services/api';
import Button, { cn } from '../components/ui/Button';
import CareerReportDetail from '../components/reports/CareerReportDetail';
import {
  formatCareerReportMarkdown,
  removeSavedReport,
  upsertSavedReport,
} from '../services/careerReports';
import {
  formatTimeLabel,
  getReportScore,
} from '../services/matchWorkspace';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return String(Math.round(Math.max(0, Math.min(100, numeric))));
}

function safeFileName(value) {
  return String(value || 'career-report')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'career-report';
}

function renderInlineMarkdown(text, keyPrefix) {
  const raw = String(text || '');
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  const nodes = [];
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(raw.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={`${keyPrefix}-bold-${match.index}`} className="font-black text-current">
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      nodes.push(
        <code key={`${keyPrefix}-code-${match.index}`} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.92em] font-bold text-slate-700">
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < raw.length) nodes.push(raw.slice(lastIndex));
  return nodes.length ? nodes : raw;
}

const MarkdownText = ({ children }) => {
  const lines = String(children || '').split(/\r?\n/);
  const blocks = [];
  let listItems = [];
  let listType = 'ul';

  const flushList = () => {
    if (!listItems.length) return;
    const Tag = listType;
    const className = listType === 'ol'
      ? 'list-decimal space-y-1 pl-5'
      : 'list-disc space-y-1 pl-5';
    blocks.push(
      <Tag key={`list-${blocks.length}`} className={className}>
        {listItems.map((item, index) => (
          <li key={`item-${index}`}>{renderInlineMarkdown(item, `li-${blocks.length}-${index}`)}</li>
        ))}
      </Tag>
    );
    listItems = [];
    listType = 'ul';
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }

    const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    const numberedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (bulletMatch || numberedMatch) {
      const nextType = numberedMatch ? 'ol' : 'ul';
      if (listItems.length && listType !== nextType) flushList();
      listType = nextType;
      listItems.push((bulletMatch || numberedMatch)[1]);
      return;
    }

    flushList();
    blocks.push(
      <p key={`p-${index}`}>
        {renderInlineMarkdown(trimmed, `p-${index}`)}
      </p>
    );
  });
  flushList();

  return <div className="space-y-2">{blocks}</div>;
};

const ChatBubble = ({ message }) => {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-6',
          isUser
            ? 'bg-slate-950 text-white'
            : 'border border-slate-100 bg-white text-slate-700 shadow-sm'
        )}
      >
        <MarkdownText>{message.content}</MarkdownText>
        <div className={cn('mt-1 text-[10px]', isUser ? 'text-white/50' : 'text-slate-400')}>
          {formatTimeLabel(message.createdAt)}
          {message.model ? ` · ${message.model}` : ''}
        </div>
      </div>
    </div>
  );
};

const Report = () => {
  const { matchWorkspace, saveWorkspace } = useData();
  const savedReports = asArray(matchWorkspace.savedReports);
  const [selectedId, setSelectedId] = useState(savedReports[0]?.id || null);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  useEffect(() => {
    if (!savedReports.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !savedReports.some((report) => report.id === selectedId)) {
      setSelectedId(savedReports[0].id);
    }
  }, [savedReports, selectedId]);

  const selectedReport = useMemo(
    () => savedReports.find((report) => report.id === selectedId) || savedReports[0] || null,
    [savedReports, selectedId],
  );
  const chatMessages = asArray(selectedReport?.chatMessages);

  const persistReport = async (report, syncServer = true) => {
    await saveWorkspace(upsertSavedReport(matchWorkspace, report), syncServer);
  };

  const handleRemove = async (reportId) => {
    if (!reportId) return;
    const confirmed = window.confirm('取消收藏后，这份报告会从职业报告板块移除。继续吗？');
    if (!confirmed) return;
    await saveWorkspace(removeSavedReport(matchWorkspace, reportId), true);
  };

  const handleDownload = () => {
    if (!selectedReport) return;
    const markdown = formatCareerReportMarkdown(selectedReport);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeFileName(`${selectedReport.title}-${selectedReport.companyName}`)}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleNewChat = async () => {
    if (!selectedReport || chatLoading) return;
    if (chatMessages.length) {
      const confirmed = window.confirm('开启新聊天会清空这份报告当前会话记录。继续吗？');
      if (!confirmed) return;
    }
    const now = new Date().toISOString();
    await persistReport({
      ...selectedReport,
      chatMessages: [],
      updatedAt: now,
    }, true);
    setChatInput('');
  };

  const handleSend = async (event) => {
    event.preventDefault();
    const question = chatInput.trim();
    if (!question || !selectedReport || chatLoading) return;

    const now = new Date().toISOString();
    const userMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: question,
      createdAt: now,
    };
    const optimisticReport = {
      ...selectedReport,
      chatMessages: [...chatMessages, userMessage],
      updatedAt: now,
    };
    setChatInput('');
    setChatLoading(true);
    await persistReport(optimisticReport, false);

    try {
      const response = await api.post('/api/reports/chat', {
        report: optimisticReport,
        messages: chatMessages,
        question,
      });
      const assistantMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: response.answer || '我暂时没有生成有效回答，可以换个问法再试一次。',
        model: response.model || '后端配置模型',
        createdAt: new Date().toISOString(),
      };
      await persistReport({
        ...optimisticReport,
        chatMessages: [...optimisticReport.chatMessages, assistantMessage],
        updatedAt: assistantMessage.createdAt,
      }, true);
    } catch (error) {
      const errorMessage = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: `报告聊天暂时失败：${error.message}`,
        createdAt: new Date().toISOString(),
      };
      await persistReport({
        ...optimisticReport,
        chatMessages: [...optimisticReport.chatMessages, errorMessage],
        updatedAt: errorMessage.createdAt,
      }, true);
    } finally {
      setChatLoading(false);
    }
  };

  if (!savedReports.length) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex min-h-[70vh] flex-col items-center justify-center px-8 text-center"
      >
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-[28px] border border-orange-100 bg-orange-50 text-orange-500 shadow-xl shadow-orange-100/60">
          <FileText size={38} />
        </div>
        <h2 className="text-2xl font-black tracking-tight text-slate-900">暂无收藏的职业报告</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
          在岗位匹配的收割记录里点击收藏，报告会长期保留在这里，支持下载和基于报告继续提问。
        </p>
        <Link
          to="/matching/harvest"
          className="mt-6 inline-flex h-11 items-center rounded-full bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-800"
        >
          去收割记录收藏报告
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid min-h-[calc(100vh-6rem)] grid-cols-1 gap-8 p-6 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)] max-w-7xl mx-auto"
    >
      <aside className="space-y-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight text-slate-950">
            <BookmarkCheck size={24} className="text-orange-500" />
            职业报告
          </h1>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            收藏后的收割报告会持久保存在这里。
          </p>
        </div>
        <div className="space-y-2">
          {savedReports.map((report) => (
            <button
              key={report.id}
              type="button"
              onClick={() => setSelectedId(report.id)}
              className={cn(
                'w-full rounded-2xl border p-4 text-left transition',
                selectedReport?.id === report.id
                  ? 'border-orange-200 bg-orange-50 shadow-sm'
                  : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-slate-900">{report.title}</div>
                  <div className="mt-1 truncate text-[11px] font-semibold text-slate-500">{report.companyName}</div>
                </div>
                <div className="rounded-xl bg-slate-950 px-2.5 py-1 text-xs font-black text-white">
                  {formatScore(getReportScore(report))}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-[10px] font-bold text-slate-400">
                <span>{formatTimeLabel(report.savedAt || report.generatedAt)}</span>
                <span>{asArray(report.ranking?.jdSplitAssessment).length} 条解释</span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-slate-100 bg-white px-4 py-3">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500">Saved Report</div>
            <div className="mt-1 truncate text-sm font-bold text-slate-900">{selectedReport?.id}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="default" className="h-10" onClick={handleDownload}>
              <Download size={15} />
              下载 Markdown
            </Button>
            <Button variant="danger" ghost className="h-10" onClick={() => handleRemove(selectedReport?.id)}>
              <Trash2 size={15} />
              取消收藏
            </Button>
          </div>
        </div>
        <CareerReportDetail report={selectedReport || {}} />
      </main>


      {/* Floating AI Chat Toggle */}
      <div className="fixed bottom-8 right-8 z-[100] flex flex-col items-end gap-3">
        <AnimatePresence>
          {isChatOpen && (
            <motion.aside
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="flex h-[580px] w-[380px] flex-col rounded-[32px] border border-orange-100 bg-white p-4 shadow-2xl shadow-slate-900/10 mb-2 overflow-hidden ring-1 ring-slate-100"
            >
              <div className="mb-4 flex items-center justify-between border-b border-slate-50 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/20">
                    <Bot size={20} />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-slate-900">针对报告 AI 聊天</h2>
                    <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Selected: {selectedReport?.title?.slice(0, 16)}...</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleNewChat}
                    disabled={chatLoading || !selectedReport}
                    className="rounded-full border border-slate-100 px-3 py-1.5 text-[10px] font-black text-slate-500 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    新聊天
                  </button>
                  <button 
                    type="button"
                    onClick={() => setIsChatOpen(false)}
                    className="p-2 hover:bg-slate-50 rounded-full text-slate-400 transition"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-3xl bg-slate-50/50 p-4 scrollbar-hide">
                {chatMessages.length ? (
                  chatMessages.map((message) => <ChatBubble key={message.id || `${message.role}-${message.createdAt}`} message={message} />)
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
                    <MessageSquare size={32} className="opacity-20 mb-4" />
                    <p className="max-w-[240px] text-xs leading-relaxed font-medium">
                      围绕这份报告提问，我可以帮你：<br/>
                      • 发现关键能力缺口<br/>
                      • 优化简历描述<br/>
                      • 制定面试准备策略
                    </p>
                  </div>
                )}
                {chatLoading && (
                  <div className="flex items-center gap-2 text-[10px] font-bold text-blue-500 bg-blue-50 rounded-lg px-3 py-2">
                    <Loader2 size={12} className="animate-spin" />
                    AI 正在阅读报告...
                  </div>
                )}
              </div>

              <form onSubmit={handleSend} className="mt-4 flex gap-2">
                <input
                  autoFocus
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  disabled={chatLoading}
                  placeholder="询问 AI 关于报告..."
                  className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:bg-white focus:border-orange-300 focus:ring-4 focus:ring-orange-100 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatInput.trim()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 shadow-lg shadow-slate-950/20"
                >
                  {chatLoading ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
                </button>
              </form>
            </motion.aside>
          )}
        </AnimatePresence>

        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-3xl shadow-2xl transition-all hover:scale-105 active:scale-95 group",
            isChatOpen 
              ? "bg-white text-slate-950 border-2 border-slate-950" 
              : "bg-slate-950 text-white hover:bg-slate-800"
          )}
        >
          {isChatOpen ? <X size={24} /> : <MessageSquare size={24} />}
        </button>
      </div>
    </motion.div>
  );
};

export default Report;
