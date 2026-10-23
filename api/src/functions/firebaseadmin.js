
const admin = require("firebase-admin");

function getFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin;
  }

  const serviceAccountJson =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    throw new Error("Firebase service account configuration is missing.");
  }

  const serviceAccount = JSON.parse(serviceAccountJson);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  return admin;
}

module.exports = { getFirebaseAdmin };
