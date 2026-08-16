const rateLimit = require("express-rate-limit");

// Limite globale sur toute l'API
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de requêtes. Réessaie dans un instant." },
});

// Limite plus stricte spécifiquement sur l'endpoint de chat (appelle l'API payante)
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de messages envoyés. Patiente une minute." },
});

module.exports = { globalLimiter, chatLimiter };
