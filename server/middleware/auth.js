const { admin } = require("../db/firestore");

// Vérifie le token Firebase envoyé par le frontend (header "Authorization: Bearer <idToken>")
// et attache l'identifiant de l'utilisateur à req.uid. Toutes les routes protégées
// s'en servent pour ne lire/écrire QUE les données de l'utilisateur connecté.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Non authentifié." });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session expirée, reconnecte-toi." });
  }
}

module.exports = { requireAuth };
