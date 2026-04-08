import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import ModulesWorkspace from './pages/ModulesWorkspaceClean';
import ModuleDetail from './pages/ModuleDetail';
import Quiz from './pages/QuizClean';
import QuizHistory from './pages/QuizHistory';
import QuizStats from './pages/QuizStats';
import Flashcards from './pages/Flashcards';
import Tasks from './pages/Tasks';
import StudyArea from './pages/StudyArea';
import Layout from './components/Layout';
import { StudyAssistantProvider } from './context/StudyAssistantContext';
import { TaskReminderProvider } from './context/TaskReminderContext';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  return user ? children : <Navigate to="/login" />;
}

function App() {
  return (
    <AuthProvider>
      <StudyAssistantProvider>
        <BrowserRouter>
          <TaskReminderProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route index element={<Dashboard />} />
                <Route path="modules" element={<ModulesWorkspace />} />
                <Route path="modules/:id" element={<ModuleDetail />} />
                <Route path="quiz/:id" element={<Quiz />} />
                <Route path="quiz-history/:moduleId" element={<QuizHistory />} />
                <Route path="quiz-stats" element={<QuizStats />} />
                <Route path="flashcards" element={<Flashcards />} />
                <Route path="study-area" element={<StudyArea />} />
                <Route path="tasks" element={<Tasks />} />
              </Route>
            </Routes>
          </TaskReminderProvider>
        </BrowserRouter>
      </StudyAssistantProvider>
    </AuthProvider>
  );
}

export default App;
