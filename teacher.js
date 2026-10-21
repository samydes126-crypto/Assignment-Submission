
import { auth, db, collection, getDocs, doc, updateDoc }
  from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";

const TEACHER_EMAIL = "teacher@gmail.com";

const list = document.getElementById("teacherSubmissionList");
const message = document.getElementById("teacherMessage");
const identity = document.getElementById("teacherIdentity");

const totalCount = document.getElementById("totalCount");
const pendingCount = document.getElementById("pendingCount");
const approvedCount = document.getElementById("approvedCount");

const refreshButton = document.getElementById("refreshButton");
const logoutButton = document.getElementById("logoutButton");

let currentTeacher = null;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? "#dc2626" : "#15803d";
}

function formatDate(data) {
  if (data.date && typeof data.date === "string") {
    return data.date;
  }

  if (data.createdAt?.toDate) {
    return data.createdAt.toDate().toLocaleDateString("en-IN");
  }

  if (typeof data.createdAt === "number") {
    return new Date(data.createdAt).toLocaleDateString("en-IN");
  }

  return "Date unavailable";
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.replace("login.html");
    return;
  }

  if (user.email?.toLowerCase() !== TEACHER_EMAIL) {
    await signOut(auth);
    window.location.replace("login.html");
    return;
  }

  currentTeacher = user;
  identity.textContent = `Signed in as ${user.email}`;
  await loadSubmissions();
});

async function loadSubmissions() {
  if (!currentTeacher) return;

  list.innerHTML = `<tr><td colspan="8">Loading submissions...</td></tr>`;
  refreshButton.disabled = true;

  try {
    const snapshot = await getDocs(collection(db, "assignments"));

    const records = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    totalCount.textContent = records.length;
    pendingCount.textContent = records.filter(item =>
      (item.status || "Pending Review").toLowerCase().includes("pending")
    ).length;
    approvedCount.textContent = records.filter(item =>
      (item.status || "").toLowerCase() === "approved"
    ).length;

    if (!records.length) {
      list.innerHTML = `
        <tr><td colspan="8">No submissions found yet.</td></tr>
      `;
      return;
    }

    list.innerHTML = records.map(item => {
      const status = ["Pending Review", "Approved", "Rejected"]
        .includes(item.status) ? item.status : "Pending Review";

      return `
        <tr data-record-id="${escapeHTML(item.id)}">
          <td>${escapeHTML(item.studentName || "Student")}</td>
          <td>${escapeHTML(item.subject || "—")}</td>
          <td>${escapeHTML(item.title || "Untitled Assignment")}</td>
          <td>${escapeHTML(item.fileName || "No file attached")}</td>
          <td>${escapeHTML(formatDate(item))}</td>
          <td>
            <select class="review-status" aria-label="Review status">
              ${["Pending Review", "Approved", "Rejected"].map(option => `
                <option value="${option}" ${option === status ? "selected" : ""}>
                  ${option}
                </option>
              `).join("")}
            </select>
          </td>
          <td>
            <textarea class="review-remark" maxlength="500"
              aria-label="Teacher remark"
              placeholder="Write feedback...">${escapeHTML(item.teacherRemark || "")}</textarea>
          </td>
          <td>
            <button type="button" class="review-btn">Save Review</button>
          </td>
        </tr>
      `;
    }).join("");

    showMessage(`Loaded ${records.length} submission(s).`);

  } catch (error) {
    console.error("Could not load submissions:", error);
    list.innerHTML = `
      <tr><td colspan="8">Unable to load submissions. Check Firestore rules and the browser console.</td></tr>
    `;
    showMessage("Could not load submissions. Security rules may need updating.", true);
  } finally {
    refreshButton.disabled = false;
  }
}

list.addEventListener("click", async event => {
  const button = event.target.closest(".review-btn");
  if (!button) return;

  const row = button.closest("tr");
  const id = row?.dataset.recordId;
  if (!id || !currentTeacher) return;

  const status = row.querySelector(".review-status").value;
  const teacherRemark = row.querySelector(".review-remark").value.trim();

  button.disabled = true;
  button.textContent = "Saving...";

  try {
    await updateDoc(doc(db, "assignments", id), {
      status,
      teacherRemark,
      reviewedBy: currentTeacher.email,
      reviewedAt: Date.now()
    });

    showMessage("Review saved successfully.");
    await loadSubmissions();

  } catch (error) {
    console.error("Could not save review:", error);
    showMessage("Could not save review. Firestore rules may need updating.", true);
    button.disabled = false;
    button.textContent = "Save Review";
  }
});

refreshButton.addEventListener("click", loadSubmissions);

logoutButton.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.replace("login.html");
  } catch (error) {
    console.error("Logout failed:", error);
    showMessage("Logout failed. Please try again.", true);
  }
});
