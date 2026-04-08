# Metis AI - AI-Powered Learning App

A clean MVP Metis AI app with AI-powered module analysis and quiz generation.

## Tech Stack

- **Frontend**: React (Vite) + Tailwind CSS
- **Backend**: Node.js + Express
- **Database**: MongoDB
- **AI**: OpenAI API

## Features

- JWT Authentication (Register/Login)
- Module Upload (PDF or text)
- AI-powered Summary & Quiz Generation
- Interactive Quiz with Scoring
- Task Manager with Deadlines
- Dashboard with Overview

## Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- OpenAI API Key

## Setup Instructions

### 1. Clone & Install Dependencies

```bash
# Server
cd server
npm install

# Client
cd ../client
npm install
```

### 2. Configure Environment Variables

Create `server/.env`:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/studyplanner
JWT_SECRET=your_jwt_secret_key_change_in_production
OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Start MongoDB

```bash
# Local MongoDB
mongod

# Or use MongoDB Atlas connection string in .env
```

### 4. Run the App

```bash
# Terminal 1 - Backend
cd server
npm run dev

# Terminal 2 - Frontend
cd client
npm run dev
```

### 5. Access the App

Open http://localhost:3000 in your browser.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /auth/register | Register new user |
| POST | /auth/login | Login user |
| POST | /modules/upload | Upload module (PDF/text) |
| GET | /modules | List all user modules |
| GET | /modules/:id | Get module details |
| POST | /modules/:id/quiz | Submit quiz answers |
| GET | /tasks | List all tasks |
| POST | /tasks | Create new task |
| PATCH | /tasks/:id | Toggle task completion |
| DELETE | /tasks/:id | Delete task |

## Project Structure

```
study-planner/
├── server/
│   ├── models/
│   │   ├── User.js
│   │   ├── Module.js
│   │   ├── QuizAttempt.js
│   │   └── Task.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── modules.js
│   │   └── tasks.js
│   ├── middleware/
│   │   └── auth.js
│   ├── server.js
│   └── package.json
└── client/
    ├── src/
    │   ├── components/
    │   │   └── Layout.jsx
    │   ├── context/
    │   │   └── AuthContext.jsx
    │   ├── pages/
    │   │   ├── Login.jsx
    │   │   ├── Register.jsx
    │   │   ├── Dashboard.jsx
    │   │   ├── Modules.jsx
    │   │   ├── ModuleDetail.jsx
    │   │   ├── Quiz.jsx
    │   │   └── Tasks.jsx
    │   ├── App.jsx
    │   └── main.jsx
    └── package.json
```

## Usage

1. **Register/Login**: Create an account or login
2. **Upload Module**: Upload a PDF or paste study text
3. **AI Processing**: Wait for AI to generate summary and quiz
4. **Take Quiz**: Test your knowledge
5. **Manage Tasks**: Add study tasks with deadlines
6. **Dashboard**: View your progress overview

## Notes

- AI processing may take a few seconds after upload
- Quiz questions are generated dynamically by OpenAI
- All data is stored in MongoDB
- JWT tokens expire after 7 days
