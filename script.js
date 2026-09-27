let currentUser = null;
let currentPlan = "";

const form = document.getElementById("planForm");
const feedbackForm = document.getElementById("feedbackForm");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const user = {
    name: document.getElementById("name").value.trim(),
    userId: document.getElementById("userId").value.trim(),
    age: Number(document.getElementById("age").value),
    weight: Number(document.getElementById("weight").value),
    goal: document.getElementById("goal").value,
    intensity: document.getElementById("intensity").value
  };

  setButtonLoading(form.querySelector("button"), "Generating with Gemini...");

  try {
    const response = await fetch("/api/generate-workout", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(user)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Failed to generate plan.");

    currentUser = user;
    currentPlan = data.workout_plan;

    renderPlan(user, data.workout_plan, data.nutrition_tip);

    document.getElementById("plan").classList.remove("hidden");
    document.getElementById("feedback").classList.remove("hidden");
    document.getElementById("plan").scrollIntoView({behavior:"smooth"});

    loadUsers();
  } catch (err) {
    alert("Gemini error: " + err.message);
  } finally {
    resetButton(form.querySelector("button"), "⚡ Generate 7-Day Plan");
  }
});

feedbackForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!currentUser || !currentPlan) {
    alert("Generate a plan first.");
    return;
  }

  const feedback = document.getElementById("feedbackText").value.trim();
  if (!feedback) return;

  setButtonLoading(feedbackForm.querySelector("button"), "Updating with Gemini...");

  try {
    const response = await fetch("/api/update-plan", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        user_id: currentUser.userId,
        original_plan: currentPlan,
        feedback: feedback
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Failed to update plan.");

    currentPlan = data.workout_plan;
    renderPlan(currentUser, data.workout_plan, data.nutrition_tip);

    document.getElementById("updateMessage").classList.remove("hidden");
    document.getElementById("feedbackText").value = "";
    document.getElementById("plan").scrollIntoView({behavior:"smooth"});

    loadUsers();
  } catch (err) {
    alert("Gemini error: " + err.message);
  } finally {
    resetButton(feedbackForm.querySelector("button"), "✨ Update My Plan");
  }
});

function renderPlan(user, workoutPlan, nutritionTip) {
  document.getElementById("welcome").textContent = `${user.name}'s Personalized Plan`;
  document.getElementById("profileSummary").textContent =
    `Age ${user.age} · ${user.weight} kg · ${user.goal} · ${user.intensity} intensity`;

  // Gemini returns formatted text. Display it safely as text.
  document.getElementById("days").innerHTML = `
    <article class="day" style="grid-column:1/-1">
      <h3>🤖 Gemini AI Workout Plan</h3>
      <p style="white-space:pre-wrap">${escapeHtml(workoutPlan)}</p>
    </article>`;

  document.getElementById("tip").textContent = nutritionTip;
}

async function loadUsers() {
  try {
    const response = await fetch("/api/users");
    const users = await response.json();

    document.getElementById("usersTable").innerHTML = users.map(u => `
      <tr>
        <td>${escapeHtml(u.user_id)}</td>
        <td>${escapeHtml(u.name)}</td>
        <td>${u.age}</td>
        <td>${u.weight}</td>
        <td>${escapeHtml(u.goal)}</td>
        <td>${escapeHtml(u.intensity)}</td>
      </tr>`).join("");

    document.getElementById("emptyUsers").classList.toggle("hidden", users.length > 0);
  } catch (_) {
    // Dashboard is non-critical if the API is unavailable.
  }
}

function setButtonLoading(button, text) {
  button.disabled = true;
  button.dataset.originalText = button.textContent;
  button.textContent = text;
}

function resetButton(button, text) {
  button.disabled = false;
  button.textContent = text;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[ch]));
}

loadUsers();
