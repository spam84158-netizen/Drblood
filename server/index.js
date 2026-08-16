require("dotenv").config();

const express = require("express");
const path = require("path");

const { applySecurity } = require("./middleware/security");
const { globalLimiter } = require("./middleware/rateLimit");
const conversationsRouter = require("./routes/conversations");
const chatRouter = require("./routes/chat");
const statsRouter = require("./routes/stats");
const filesRouter = require("./routes/files");

const app = express();
const PORT = process.env.PORT || 3000;

// Render (et la plupart des hébergeurs) placent l'app derrière un reverse proxy.
// Sans ça, express-rate-limit plante aléatoirement en lisant X-Forwarded-For.
app.set("trust proxy", 1);

if (!process.env.GROQ_API_KEY) {
  console.error(
    "⚠️  GROQ_API_KEY manquante. Crée une clé gratuite sur https://console.groq.com/keys puis ajoute-la dans ton fichier .env (voir .env.example) ou dans les variables d'environnement Render."
  );
}
if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  console.error(
    "⚠️  FIREBASE_SERVICE_ACCOUNT_KEY manquante. Sans elle, l'historique des conversations et les statistiques ne fonctionneront pas."
  );
}

applySecurity(app);
app.use(express.json({ limit: "1mb" }));
app.use(globalLimiter);

// API
app.use("/api/conversations", conversationsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/stats", statsRouter);
app.use("/api/files", filesRouter);

// Healthcheck (utile pour Render)
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Frontend statique (site multi-pages : index.html sert la page d'accueil "/")
app.use(express.static(path.join(__dirname, "..", "public")));

// 404 pour toute route inconnue qui n'est ni une page statique ni une route API
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Route API introuvable." });
  }
  res.status(404).sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// Gestion globale des erreurs
app.use((err, req, res, next) => {
  console.error("Erreur serveur:", err);
  res.status(500).json({ error: "Erreur interne du serveur." });
});

// Sur Render/localhost, on démarre un vrai serveur qui écoute en continu.
// Sur Vercel, ce fichier est importé par api/index.js comme fonction serverless :
// il ne faut PAS appeler .listen() dans ce cas (Vercel gère ça lui-même).
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✅ Serveur lancé sur le port ${PORT}`);
  });
}

module.exports = app;
