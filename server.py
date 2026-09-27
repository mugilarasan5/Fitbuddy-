import os
import sqlite3
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from google import genai

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash")
DB_PATH = BASE_DIR / "fitbuddy.db"

app = FastAPI(title="FitBuddy - AI Fitness Plan Generator")


class UserInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    userId: str = Field(min_length=1, max_length=50)
    age: int = Field(ge=13, le=100)
    weight: float = Field(gt=20, le=300)
    goal: str
    intensity: str


class FeedbackRequest(BaseModel):
    user_id: str
    original_plan: str
    feedback: str = Field(min_length=1, max_length=2000)


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            age INTEGER NOT NULL,
            weight REAL NOT NULL,
            goal TEXT NOT NULL,
            intensity TEXT NOT NULL,
            original_plan TEXT,
            updated_plan TEXT,
            nutrition_tip TEXT
        )
    """)
    conn.commit()
    conn.close()


def gemini_client():
    if not API_KEY:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is not configured. Add it to the .env file."
        )

    return genai.Client(api_key=API_KEY)


def generate_with_gemini(prompt: str) -> str:
    try:
        client = gemini_client()

        response = client.models.generate_content(
            model=MODEL,
            contents=prompt
        )

        if not response.text:
            raise RuntimeError("Gemini returned an empty response.")

        return response.text.strip()

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini request failed: {exc}"
        )


def workout_prompt(user: UserInput) -> str:
    return f"""
You are FitBuddy, an AI fitness planning assistant.

Create a structured 7-day workout plan for this user:

Name: {user.name}
Age: {user.age}
Weight: {user.weight} kg
Fitness goal: {user.goal}
Workout intensity: {user.intensity}

For each day include:
- Day number and focus
- Warm-up
- Main exercises with sets/reps or duration
- Cool-down/recovery
- One short safety/form note when useful

Make the plan practical, readable, progressive and appropriate
to the stated intensity.

Do not claim to diagnose or treat medical conditions.
Do not recommend extreme dieting or unsafe exercise.

Return plain text with clear Day 1 through Day 7 headings.
"""


def nutrition_prompt(user: UserInput) -> str:
    return f"""
Give one concise nutrition or recovery tip for a fitness user.

Goal: {user.goal}
Intensity: {user.intensity}
Age: {user.age}

Keep it practical, general and safe.
Avoid medical diagnosis or treatment.

Return 2-4 sentences only.
"""


@app.on_event("startup")
def startup():
    init_db()


# =========================
# FRONTEND FILES
# =========================

@app.get("/")
def home():
    return FileResponse(
        BASE_DIR / "index.html",
        media_type="text/html"
    )


@app.get("/style.css")
def get_css():
    return FileResponse(
        BASE_DIR / "style.css",
        media_type="text/css"
    )


@app.get("/script.js")
def get_js():
    return FileResponse(
        BASE_DIR / "script.js",
        media_type="application/javascript"
    )


# =========================
# API
# =========================

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "gemini_configured": bool(API_KEY),
        "model": MODEL
    }


@app.post("/api/generate-workout")
def generate_workout(user: UserInput):

    plan = generate_with_gemini(
        workout_prompt(user)
    )

    tip = generate_with_gemini(
        nutrition_prompt(user)
    )

    conn = db()

    conn.execute("""
        INSERT INTO users
        (
            user_id,
            name,
            age,
            weight,
            goal,
            intensity,
            original_plan,
            updated_plan,
            nutrition_tip
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)

        ON CONFLICT(user_id) DO UPDATE SET
            name=excluded.name,
            age=excluded.age,
            weight=excluded.weight,
            goal=excluded.goal,
            intensity=excluded.intensity,
            original_plan=excluded.original_plan,
            updated_plan=NULL,
            nutrition_tip=excluded.nutrition_tip
    """, (
        user.userId,
        user.name,
        user.age,
        user.weight,
        user.goal,
        user.intensity,
        plan,
        tip
    ))

    conn.commit()
    conn.close()

    return {
        "workout_plan": plan,
        "nutrition_tip": tip
    }


@app.post("/api/update-plan")
def update_plan(request: FeedbackRequest):

    prompt = f"""
You are FitBuddy, an AI fitness planning assistant.

Here is the user's existing 7-day plan:

--- ORIGINAL PLAN ---
{request.original_plan}
--- END PLAN ---

User feedback:

--- FEEDBACK ---
{request.feedback}
--- END FEEDBACK ---

Revise the plan according to the feedback.

Keep useful parts of the original plan and make only sensible changes.

Return a complete updated Day 1 through Day 7 plan.

Do not provide medical diagnosis or unsafe recommendations.
"""

    updated = generate_with_gemini(prompt)

    conn = db()

    row = conn.execute(
        "SELECT goal, intensity FROM users WHERE user_id = ?",
        (request.user_id,)
    ).fetchone()

    if not row:
        conn.close()
        raise HTTPException(
            status_code=404,
            detail="User not found."
        )

    tip_user = type(
        "TipUser",
        (),
        {
            "goal": row["goal"],
            "intensity": row["intensity"],
            "age": 20
        }
    )()

    tip = generate_with_gemini(
        nutrition_prompt(tip_user)
    )

    conn.execute("""
        UPDATE users
        SET updated_plan = ?, nutrition_tip = ?
        WHERE user_id = ?
    """, (
        updated,
        tip,
        request.user_id
    ))

    conn.commit()
    conn.close()

    return {
        "workout_plan": updated,
        "nutrition_tip": tip
    }


@app.get("/api/users")
def users():

    conn = db()

    rows = conn.execute("""
        SELECT
            user_id,
            name,
            age,
            weight,
            goal,
            intensity
        FROM users
        ORDER BY rowid DESC
    """).fetchall()

    conn.close()

    return [
        dict(row)
        for row in rows
    ]