import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useStudyAssistantContext } from '../context/StudyAssistantContext';

const STORAGE_KEY = 'study-assistant-chat-v1';

const QUICK_ACTIONS = [
  { id: 'explain', label: 'Explain' },
  { id: 'summarize', label: 'Summarize' },
  { id: 'quiz', label: 'Generate Quiz' },
  { id: 'flashcards', label: 'Create Flashcards' },
];

const actionPrompts = {
  explain: 'Explain this in a simpler way.',
  summarize: 'Summarize the key ideas.',
  quiz: 'Generate a short quiz from this.',
  flashcards: 'Create flashcards from this.',
};

const createMessage = (role, content, meta = {}) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  role,
  content,
  createdAt: Date.now(),
  ...meta,
});

const getStoredMessages = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.length > 0
      ? parsed
      : [
          createMessage(
            'assistant',
            'Ask for an explanation, summary, quiz, or flashcards. In Study Area, I will use your open module and current highlight context.',
          ),
        ];
  } catch (error) {
    console.error('Failed to load assistant history:', error);
    return [createMessage('assistant', 'How can I help you study today?')];
  }
};

const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const splitSentences = (text) =>
  String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => normalizeText(sentence))
    .filter(Boolean);

const toBulletList = (sentences) =>
  sentences
    .filter(Boolean)
    .map((sentence) => `• ${sentence}`)
    .join('\n');

const extractKeywords = (text) => {
  const stopwords = new Set([
    'this', 'that', 'with', 'from', 'your', 'have', 'were', 'what', 'when', 'where', 'which', 'while',
    'there', 'their', 'about', 'into', 'module', 'study', 'highlight', 'page', 'pages', 'using',
  ]);

  return [...new Set(
    normalizeText(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(' ')
      .filter((word) => word.length > 3 && !stopwords.has(word)),
  )].slice(0, 4);
};

const explainText = (text, moduleTitle) => {
  const sentences = splitSentences(text);
  const lead = sentences[0] || normalizeText(text);
  const support = sentences[1] || '';
  const scope = moduleTitle ? ` from ${moduleTitle}` : '';
  return [
    `Here is the core idea${scope}: ${lead}`,
    support ? `Why it matters: ${support}` : 'Why it matters: this is one of the main ideas worth reviewing again before you move on.',
    'Try this next: restate it in your own words, then connect it to one example or question you might see in class.',
  ].join('\n\n');
};

const summarizeText = (text) => {
  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return 'I could not find enough text to summarize yet.';
  }
  return toBulletList(sentences.slice(0, 3));
};

const buildQuizText = (text) => {
  const sentences = splitSentences(text);
  const keywords = extractKeywords(text);
  const prompts = (sentences.length > 0 ? sentences : [normalizeText(text)]).slice(0, 3);
  return prompts
    .map((sentence, index) => {
      const keyword = keywords[index] || keywords[0] || `concept ${index + 1}`;
      return `${index + 1}. What best explains ${keyword}?\nAnswer guide: ${sentence}`;
    })
    .join('\n\n');
};

const buildFlashcardsText = (text) => {
  const sentences = splitSentences(text);
  const keywords = extractKeywords(text);
  const prompts = (sentences.length > 0 ? sentences : [normalizeText(text)]).slice(0, 4);
  return prompts
    .map((sentence, index) => {
      const keyword = keywords[index] || keywords[0] || `Concept ${index + 1}`;
      return `Front: ${keyword}\nBack: ${sentence}`;
    })
    .join('\n\n');
};

const buildGeneralResponse = (message) => {
  const text = normalizeText(message).toLowerCase();
  if (!text) {
    return 'Type a question or use one of the quick actions to start a study conversation.';
  }
  if (text.includes('quiz')) {
    return 'I can help you practice. Open Study Area for module-based quiz generation, or tell me a topic and I will help you outline likely question types.';
  }
  if (text.includes('flashcard')) {
    return 'For strong flashcards, keep one concept per card, make the front specific, and keep the back short enough to recall from memory.';
  }
  if (text.includes('summarize') || text.includes('summary')) {
    return 'A strong summary should capture the main idea, supporting points, and one takeaway you expect to remember later.';
  }
  return 'I am in general assistant mode right now. I can help with study strategies, revision plans, and question breakdowns. For module-aware help, open the Study Area.';
};

async function fetchHighlightTools(moduleId, sourceText) {
  const token = localStorage.getItem('token');
  const response = await fetch(`/highlight-tools/${moduleId}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': token || '',
    },
    body: JSON.stringify({ text: sourceText }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || 'Failed to generate study tools.');
  }
  return payload;
}

export default function StudyAssistant() {
  const location = useLocation();
  const { studyContext } = useStudyAssistantContext();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(() => getStoredMessages());
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const scrollRef = useRef(null);
  const dockPositionClass = 'bottom-24 right-3 sm:bottom-28 sm:right-4 lg:bottom-6 lg:right-6';
  const alignmentClass = 'items-end';
  const panelOriginClass = 'origin-bottom-right';

  const modeLabel = studyContext.isStudyArea ? 'Context-aware mode' : 'General mode';
  const contextSource = useMemo(() => {
    if (!studyContext.isStudyArea) return '';
    return normalizeText(studyContext.assistantSourceText)
      || normalizeText(studyContext.highlightedText)
      || normalizeText(studyContext.savedHighlightsText)
      || normalizeText(studyContext.moduleSummary)
      || normalizeText(studyContext.moduleText);
  }, [studyContext]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen, isThinking]);

  useEffect(() => {
    if (!studyContext.isStudyArea && location.pathname !== '/study-area') {
      return;
    }

    setMessages((current) => {
      const latest = current[current.length - 1];
      const contextLabel = studyContext.isStudyArea
        ? `Using ${studyContext.highlightedText ? 'highlighted text' : 'your uploaded module'} as context.`
        : 'Using general assistant mode.';

      if (latest?.role === 'assistant' && latest?.systemNote === contextLabel) {
        return current;
      }

      return [
        ...current,
        createMessage('assistant', contextLabel, { systemNote: contextLabel }),
      ];
    });
  }, [
    location.pathname,
    studyContext.highlightedText,
    studyContext.isStudyArea,
    studyContext.moduleId,
  ]);

  const handleAssistantResponse = async (prompt, actionId = '') => {
    const normalizedPrompt = normalizeText(prompt);
    if (!normalizedPrompt) return;

    const userMessage = createMessage('user', normalizedPrompt, { actionId });
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setIsThinking(true);

    try {
      let responseText = '';

      if (!studyContext.isStudyArea) {
        responseText = buildGeneralResponse(normalizedPrompt);
      } else {
        const moduleTitle = studyContext.moduleTitle || 'your study material';
        const sourceText = contextSource;

        if (!sourceText) {
          responseText = `I can see you are in Study Area, but I do not have usable module text yet. Open a module or highlight some text in ${moduleTitle} and try again.`;
        } else if ((actionId === 'summarize' || actionId === 'quiz' || actionId === 'flashcards') && studyContext.moduleId) {
          const tools = await fetchHighlightTools(studyContext.moduleId, sourceText);
          if (actionId === 'summarize') {
            responseText = `Summary for ${moduleTitle}:\n${tools.summary || summarizeText(sourceText)}`;
          } else if (actionId === 'quiz') {
            responseText = `Quiz practice from ${moduleTitle}:\n${(tools.quizQuestions || []).slice(0, 3).map((item, index) => `${index + 1}. ${item.question}`).join('\n\n') || buildQuizText(sourceText)}`;
          } else {
            responseText = `Flashcards for ${moduleTitle}:\n${(tools.flashcards || []).slice(0, 4).map((card) => `Front: ${card.front}\nBack: ${card.back}`).join('\n\n') || buildFlashcardsText(sourceText)}`;
          }

          if (tools.warning) {
            responseText = `${responseText}\n\nNote: ${tools.warning}`;
          }
        } else if (actionId === 'explain' || /explain|what does|help me understand/i.test(normalizedPrompt)) {
          responseText = explainText(sourceText, moduleTitle);
        } else if (/summar/i.test(normalizedPrompt)) {
          responseText = `Summary for ${moduleTitle}:\n${summarizeText(sourceText)}`;
        } else if (/quiz|question|test/i.test(normalizedPrompt)) {
          responseText = `Quiz practice from ${moduleTitle}:\n${buildQuizText(sourceText)}`;
        } else if (/flashcard/i.test(normalizedPrompt)) {
          responseText = `Flashcards for ${moduleTitle}:\n${buildFlashcardsText(sourceText)}`;
        } else {
          responseText = [
            `I am using ${studyContext.highlightedText ? 'your highlighted text' : moduleTitle} as context.`,
            explainText(sourceText, moduleTitle),
          ].join('\n\n');
        }
      }

      setMessages((current) => [...current, createMessage('assistant', responseText)]);
    } catch (error) {
      console.error('Study assistant failed:', error);
      setMessages((current) => [
        ...current,
        createMessage('assistant', error.message || 'The study assistant could not finish that request.'),
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div className={`pointer-events-none fixed z-[25] ${dockPositionClass}`}>
      <div className={`pointer-events-none flex flex-col gap-3 ${alignmentClass}`}>
        <div
          className={`flex h-[min(38rem,calc(100vh-9rem))] w-[min(21rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] ${panelOriginClass} flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white/95 shadow-[0_28px_80px_rgba(15,23,42,0.2)] backdrop-blur transition-all duration-300 sm:h-[min(36rem,calc(100vh-10rem))] lg:h-[min(42rem,calc(100vh-8rem))] lg:w-[min(24rem,calc(100vw-2rem))] lg:max-w-[calc(100vw-2rem)] ${
            isOpen
              ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
              : 'pointer-events-none translate-y-6 scale-95 opacity-0'
          }`}
        >
          <div className="border-b border-slate-200 bg-[linear-gradient(135deg,_#0f172a_0%,_#1d4ed8_58%,_#38bdf8_100%)] px-5 py-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-100">{modeLabel}</div>
                <h2 className="mt-2 text-lg font-semibold">AI Study Assistant</h2>
                <p className="mt-1 text-sm text-sky-100/90">
                  {studyContext.isStudyArea
                    ? studyContext.highlightedText
                      ? 'Using your current highlight as the main source.'
                      : 'Using your open module as the study source.'
                    : 'Ask for general study help from anywhere in the app.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full bg-white/12 p-2 text-sm font-semibold text-white transition hover:bg-white/20"
                aria-label="Close AI Study Assistant"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="border-b border-slate-100 px-4 py-3">
            <div className="flex flex-wrap gap-2">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => handleAssistantResponse(actionPrompts[action.id], action.id)}
                  disabled={isThinking}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          <div ref={scrollRef} className="study-scroll-area min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                    message.role === 'user'
                      ? 'ml-auto bg-slate-900 text-white'
                      : 'bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{message.content}</div>
                </div>
              ))}
              {isThinking && (
                <div className="max-w-[88%] rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-800 shadow-sm">
                  Thinking through your study request...
                </div>
              )}
            </div>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleAssistantResponse(input);
            }}
            className="shrink-0 border-t border-slate-200 px-4 py-4"
          >
            <div className="flex items-end gap-3">
              <label className="sr-only" htmlFor="study-assistant-input">
                Ask the AI Study Assistant
              </label>
              <textarea
                id="study-assistant-input"
                rows={1}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={studyContext.isStudyArea ? 'Ask about this module or highlight...' : 'Ask for study help...'}
                className="max-h-28 min-h-[48px] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
              />
              <button
                type="submit"
                disabled={isThinking || !normalizeText(input)}
                className="inline-flex h-12 min-w-[56px] items-center justify-center rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </form>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="pointer-events-auto relative overflow-hidden group flex h-16 w-16 items-center justify-center rounded-full bg-[linear-gradient(135deg,_#0f172a_0%,_#2563eb_60%,_#38bdf8_100%)] text-white shadow-[0_20px_45px_rgba(37,99,235,0.38)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_60px_rgba(37,99,235,0.45)]"
          aria-label={isOpen ? 'Close AI Study Assistant' : 'Open AI Study Assistant'}
        >
          <span className="pointer-events-none absolute inset-0 rounded-full bg-white/0 transition group-hover:bg-white/10" />
          <svg viewBox="0 0 24 24" className="relative h-7 w-7 fill-none stroke-current stroke-[1.8]" aria-hidden="true">
            <path d="M8 10h8M8 14h5" strokeLinecap="round" />
            <path
              d="M12 3c4.97 0 9 3.582 9 8s-4.03 8-9 8c-.73 0-1.44-.077-2.11-.223L4 21l1.79-4.474C4.67 15.11 3 13.173 3 11c0-4.418 4.03-8 9-8Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
