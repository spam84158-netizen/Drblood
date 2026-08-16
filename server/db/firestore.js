const admin = require("firebase-admin");

// La clé de compte de service Firebase est fournie via une variable
// d'environnement (JSON complet, sur une seule ligne). À générer depuis :
// Firebase Console > Paramètres du projet > Comptes de service > Générer une nouvelle clé privée.
if (!admin.apps.length) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    console.error(
      "⚠️  FIREBASE_SERVICE_ACCOUNT_KEY manquante. Génère-la depuis la console Firebase " +
        "(Paramètres du projet > Comptes de service > Générer une nouvelle clé privée) " +
        "et colle le JSON complet dans cette variable d'environnement."
    );
  } else {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(raw);
    } catch (err) {
      console.error("⚠️  FIREBASE_SERVICE_ACCOUNT_KEY n'est pas un JSON valide:", err.message);
    }
    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
  }
}

const db = admin.apps.length ? admin.firestore() : null;

module.exports = { admin, db };
