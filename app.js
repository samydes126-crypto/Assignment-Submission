
import {
  auth,
  db,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
  serverTimestamp
} from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const UPLOAD_API_URL = "/api/upload";

const assignmentForm = document.getElementById("assignmentForm");
const studentNameInput = document.getElementById("studentName");
const subjectInput = document.getElementById("subject");
const assignmentTitleInput = document.getElementById("assignmentTitle");
const assignmentFileInput = document.getElementById("assignmentFile");

const formMessage = document.getElementById("formMessage");
const submissionList = document.getElementById("submissionList");
const emptyMessage = document.getElementById("emptyMessage");

const totalCount = document.getElementById("totalCount");
const pendingCount = document.getElementById("pendingCount");
const reviewedCount = document.getElementById("reviewedCount");
const recordLabel = document.getElementById("recordLabel");
const logoutButton = document.getElementById("logoutButton");

let currentUser = null;
let loadingSubmissions = false;

function showMessage(message, isError = false) {
  if (!formMessage) return;

  formMessage.textContent = message;
  formMessage.style.color = isError ? "#dc2626" : "#15803d";
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function formatFileSize(bytes) {
  if (!Number.isFinite(Number(bytes))) return "Unknown";
  return `${(Number(bytes) / 1024).toFixed(1)} KB`;
}

function formatDate(data) {
  if (data.createdAt?.toDate) {
    return data.createdAt.toDate().toLocaleDateString("en-IN");
  }

  if (typeof data.createdAt === "number") {
    return new Date(data.createdAt).toLocaleDateString("en-IN");
  }

  if (typeof data.date === "string") {
    return data.date;
  }

  return "Just submitted";
}

function updateDashboard(records) {
  if (totalCount) totalCount.textContent = records.length;

  const pending = records.filter(record =>
    (record.status || "Pending Review").toLowerCase().includes("pending")
  ).length;

  const reviewed = records.filter(record =>
    ["approved", "rejected"].includes(
      (record.status || "").toLowerCase()
    )
  ).length;

  if (pendingCount) pendingCount.textContent = pending;
  if (reviewedCount) reviewedCount.textContent = reviewed;

  if (recordLabel) {
    recordLabel.textContent =
      records.length === 1
        ? "1 submission"
        : `${records.length} submissions`;
  }
}

function renderSubmissions(records) {
  if (!submissionList) return;

  if (emptyMessage) {
    emptyMessage.style.display = records.length ? "none" : "block";
  }

  if (records.length === 0) {
    submissionList.innerHTML = "";
    return;
  }

  submissionList.innerHTML = records.map(record => {
    const status = record.status || "Pending Review";
    const remark = record.teacherRemark || "No remarks yet";

    return `
      <tr>
        <td>${escapeHTML(record.studentName || "Student")}</td>
        <td>${escapeHTML(record.subject || "—")}</td>
        <td>${escapeHTML(record.title || "Untitled Assignment")}</td>
        <td>
          ${escapeHTML(record.fileName || "No file attached")}
          <br>
          <small>${escapeHTML(formatFileSize(record.fileSize))}</small>
        </td>
        <td>${escapeHTML(formatDate(record))}</td>
        <td>${escapeHTML(status)}</td>
        <td>${escapeHTML(remark)}</td>
        <td>
          <button
            type="button"
            class="delete-submission-btn"
            data-id="${escapeHTML(record.id)}"
          >Delete</button>
        </td>
      </tr>
    `;
  }).join("");
}

async function loadSubmissions() {
  if (!currentUser || loadingSubmissions) return;

  loadingSubmissions = true;

  if (submissionList) {
    submissionList.innerHTML =
      '<tr><td colspan="8">Loading your submissions...</td></tr>';
  }

  try {
    const ownSubmissionsQuery = query(
      collection(db, "assignments"),
      where("studentUid", "==", currentUser.uid)
    );

    const snapshot = await getDocs(ownSubmissionsQuery);

    const records = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    records.sort((a, b) => {
      const timeA = a.createdAt?.toMillis?.() ??
        (typeof a.createdAt === "number" ? a.createdAt : 0);

      const timeB = b.createdAt?.toMillis?.() ??
        (typeof b.createdAt === "number" ? b.createdAt : 0);

      return timeB - timeA;
    });

    updateDashboard(records);
    renderSubmissions(records);
  } catch (error) {
    console.error("Could not load submissions:", error);

    if (submissionList) {
      submissionList.innerHTML =
        '<tr><td colspan="8">Unable to load submissions. Check Firestore security rules.</td></tr>';
    }

    showMessage(
      "Could not load submissions. Check Firestore rules and your internet connection.",
      true
    );
  } finally {
    loadingSubmissions = false;
  }
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    currentUser = null;
    window.location.replace("login.html");
    return;
  }

  if (user.email?.toLowerCase() === "teacher@gmail.com") {
    window.location.replace("teacher.html");
    return;
  }

  currentUser = user;

  if (studentNameInput && !studentNameInput.value.trim()) {
    studentNameInput.value = user.displayName || "";
  }

  await loadSubmissions();
});

if (assignmentForm) {
  assignmentForm.addEventListener("submit", async event => {
    event.preventDefault();

    if (!currentUser) {
      showMessage("Please log in before submitting an assignment.", true);
      return;
    }

    const studentName = studentNameInput?.value.trim() || "";
    const subject = subjectInput?.value.trim() || "";
    const title = assignmentTitleInput?.value.trim() || "";
    const file = assignmentFileInput?.files?.[0];

    if (!studentName || !subject || !title || !file) {
      showMessage("Please fill in all fields and select a PDF file.", true);
      return;
    }

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      showMessage("Please select a PDF file only.", true);
      return;
    }

    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      showMessage("The PDF must be greater than 0 bytes and 5 MB or smaller.", true);
      return;
    }

    const submitButton = assignmentForm.querySelector(
      'button[type="submit"], input[type="submit"]'
    );

    const originalButtonText = submitButton
      ? (submitButton.tagName === "BUTTON"
          ? submitButton.textContent
          : submitButton.value)
      : "";

    if (submitButton) {
      submitButton.disabled = true;

      if (submitButton.tagName === "BUTTON") {
        submitButton.textContent = "Uploading PDF...";
      } else {
        submitButton.value = "Uploading PDF...";
      }
    }

    try {
      showMessage("Uploading PDF to secure storage...");

      // Refresh/get the current Firebase ID token.
      const idToken = await currentUser.getIdToken();

      // Upload the actual file bytes to the Azure API.
      const uploadResponse = await fetch(UPLOAD_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "x-file-name": file.name,
          "Content-Type": "application/pdf"
        },
        body: file
      });

      const uploadResult = await uploadResponse.json().catch(() => ({}));

      if (!uploadResponse.ok) {
        throw new Error(
          uploadResult.error ||
          `PDF upload failed (HTTP ${uploadResponse.status}).`
        );
      }

      if (!uploadResult.blobName) {
        throw new Error("The upload API did not return a Blob filename.");
      }

      showMessage("PDF uploaded. Saving assignment details...");

      // Save metadata only after the PDF upload succeeds.
      await addDoc(collection(db, "assignments"), {
        studentUid: currentUser.uid,
        studentEmail: currentUser.email || "",
        studentName,
        subject,
        title,
        fileName: file.name,
        fileSize: file.size,
        blobName: uploadResult.blobName,
        status: "Pending Review",
        teacherRemark: "",
        createdAt: serverTimestamp(),
        date: new Date().toLocaleDateString("en-IN")
      });

      assignmentForm.reset();

      if (studentNameInput) {
        studentNameInput.value =
          currentUser.displayName || studentName;
      }

      showMessage("PDF uploaded and assignment submitted successfully!");
      await loadSubmissions();
    } catch (error) {
      console.error("Submission failed:", error);

      showMessage(
        error.message || "Submission failed. Please try again.",
        true
      );
    } finally {
      if (submitButton) {
        submitButton.disabled = false;

        if (submitButton.tagName === "BUTTON") {
          submitButton.textContent = originalButtonText || "Submit Assignment";
        } else {
          submitButton.value = originalButtonText || "Submit Assignment";
        }
      }
    }
  });
}

if (submissionList) {
  submissionList.addEventListener("click", async event => {
    const button = event.target.closest(".delete-submission-btn");

    if (!button || !currentUser) return;

    const submissionId = button.dataset.id;
    if (!submissionId) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this submission?"
    );

    if (!confirmed) return;

    button.disabled = true;

    try {
      await deleteDoc(doc(db, "assignments", submissionId));
      showMessage("Submission deleted successfully.");
      await loadSubmissions();
    } catch (error) {
      console.error("Delete failed:", error);

      showMessage(
        "Could not delete this submission. Check your Firestore security rules.",
        true
      );

      button.disabled = false;
    }
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    try {
      await signOut(auth);
      window.location.replace("login.html");
    } catch (error) {
      console.error("Logout failed:", error);
      showMessage("Logout failed. Please try again.", true);
    }
  });
}
