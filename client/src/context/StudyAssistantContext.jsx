import { createContext, useContext, useMemo, useState } from 'react';

const StudyAssistantContext = createContext(null);

const defaultStudyContext = {
  isStudyArea: false,
  moduleId: '',
  moduleTitle: '',
  moduleSummary: '',
  moduleText: '',
  highlightedText: '',
  savedHighlightsText: '',
  assistantSourceText: '',
  currentPage: 1,
};

export function StudyAssistantProvider({ children }) {
  const [studyContext, setStudyContext] = useState(defaultStudyContext);

  const value = useMemo(
    () => ({
      studyContext,
      setStudyContext: (nextContext) => {
        setStudyContext({
          ...defaultStudyContext,
          ...(nextContext || {}),
        });
      },
      clearStudyContext: () => setStudyContext(defaultStudyContext),
    }),
    [studyContext],
  );

  return <StudyAssistantContext.Provider value={value}>{children}</StudyAssistantContext.Provider>;
}

export function useStudyAssistantContext() {
  const context = useContext(StudyAssistantContext);
  if (!context) {
    throw new Error('useStudyAssistantContext must be used within a StudyAssistantProvider');
  }
  return context;
}
