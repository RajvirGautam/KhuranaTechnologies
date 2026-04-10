# AI Job Application Tracker

A full-stack TypeScript web app for tracking job applications in a Kanban board with AI-assisted job description parsing and resume bullet point suggestions.

## Stack

- Frontend: React + TypeScript + Vite + Tailwind CSS + React Query + dnd-kit
- Backend: Node.js + Express + TypeScript
- Database: MongoDB + Mongoose
- Auth: JWT + bcrypt + Google OAuth
- AI: OpenRouter API (Nemotron) with strict JSON validation

## Features

- Register and login with JWT auth
- Login with Google OAuth
- Protected frontend and backend routes
- Persistent login via local storage token + `/auth/me`
- Kanban board with five stages:
  - Applied
  - Phone Screen
  - Interview
  - Offer
  - Rejected
- Drag and drop cards between columns
- Create, edit, and delete application cards
- AI Job Description parser for:
  - Company name
  - Role
  - Required skills
  - Nice-to-have skills
  - Seniority
  - Location
  - Paste job text or provide a public job URL for scraping
- AI-generated resume bullet suggestions (3 to 5) with copy buttons
- Frontend loading, empty, and error states
- Service-layer AI implementation (no provider logic in route handlers)

## Setup & Running the Project Locally

### Prerequisites
- [Node.js](https://nodejs.org/en/) (v18 or higher recommended)
- [MongoDB](https://www.mongodb.com/) (running locally or a MongoDB Atlas URI)

### 1) Backend

```bash
cd backend
cp .env.example .env
# Edit .env and supply your variables (see Environment Variables section)
npm install
npm run dev
```

### 2) Frontend

Open a new terminal window:

```bash
cd frontend
cp .env.example .env
# Edit .env and supply your variables (see Environment Variables section)
npm install
npm run dev
```

The frontend will run at `http://localhost:5173` and automatically proxy API requests to the local backend.

## Environment Variables Example

### Backend (`backend/.env`)

```properties
NODE_ENV=development
PORT=4011
MONGODB_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
CLIENT_ORIGIN=http://localhost:5173
AI_API=your_ai_api_key
GOOGLE_CLIENT_ID=your_google_client_id
```

### Frontend (`frontend/.env`)

```properties
VITE_API_BASE_URL=/api
VITE_PROXY_TARGET=http://localhost:4011
VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id.apps.googleusercontent.com
```

## Build

```bash
cd backend && npm run build
cd ../frontend && npm run build
```

## Decisions Made

- **Tech Stack**: Chose React with Vite for a fast development experience and Tailwind CSS for rapid styling without jumping between files. Backend was built with Node.js and Express for familiar JS syntax across the stack. MongoDB was selected for its flexible document schema matching the JSON nature of job applications.
- **AI Integrations**: Incorporated OpenRouter API (Nemotron model) for both job description parsing and resume bullet suggestions because of its reliable capability to return structured JSON. The backend strictly validates the AI output avoiding application crashes if malformed data is received.
- **State & Data Fetching**: Utilized React Query combined with local component state (for drag-and-drop optimistic updates via `dnd-kit`). This allows for caching and immediate UI feedback before network confirmation.
- **Kanban Implementation**: `dnd-kit` was chosen instead of alternatives as it is more modern, lightweight, accessible, and actively maintained, catering perfectly to vertical and horizontal drag-and-drop scenarios across multiple columns.
- **Authentication**: Adopted a dual strategy with standard JWT email/password login and Google OAuth to lower user friction. The JWT is stored locally, and user sessions/protection are managed robustly across frontend state and backend middleware.
- **Scraping Capability**: The backend service also acts as a basic HTML scraper for open public job links. This allows users to easily parse job listings by passing just a URL, streamlining user input significantly without requiring manual copy-pasting.

## API Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/applications`
- `POST /api/applications`
- `PUT /api/applications/:id`
- `DELETE /api/applications/:id`
- `POST /api/ai/parse`
  - Accepts `jobDescription` or `jobLink`
- `POST /api/ai/suggestions`

## Notes

- Add `GOOGLE_CLIENT_ID` in `backend/.env` and `VITE_GOOGLE_CLIENT_ID` in `frontend/.env` for Google sign-in.
- Add your own `AI_API` key in `backend/.env`.
- Never commit secrets.
- If the AI provider returns invalid JSON, backend returns a safe `422` response and frontend shows an error message instead of crashing.
- Public job pages can be scraped when they are accessible server-side. Some sites may block bots or require login/JS rendering, so site-specific adapters may still be needed for perfect coverage.
