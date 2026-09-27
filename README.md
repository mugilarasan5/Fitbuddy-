# FitBuddy + Gemini + FastAPI

This version connects the website to a FastAPI backend and Google's official `google-genai` SDK.

## 1. Open the folder in VS Code

Open the `FitBuddy_Gemini_FullStack` folder.

## 2. Create a virtual environment

Windows PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, use Command Prompt:

```cmd
.venv\Scripts\activate
```

## 3. Install packages

```bash
pip install -r requirements.txt
```

## 4. Create your `.env`

Copy `.env.example` to `.env` and put your Gemini API key there:

```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3-flash
```

Do NOT put the API key inside `index.html` or `script.js`.

## 5. Run

```bash
uvicorn server:app --reload
```

Then open:

http://127.0.0.1:8000

API test page:

http://127.0.0.1:8000/docs

Health check:

http://127.0.0.1:8000/api/health

## What is connected

- Generate 7-day workout plan -> Gemini
- Generate nutrition/recovery tip -> Gemini
- Submit feedback -> Gemini regenerates the plan
- User records -> SQLite
- Admin Users section -> reads SQLite through FastAPI

## Security

Keep `.env` private. It is included in `.gitignore`.
