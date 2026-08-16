const helmet = require("helmet");
const cors = require("cors");

function applySecurity(app) {
  app.use(
    helmet({
      contentSecurityPolicy: false, // désactivé ici car on charge marked.js / highlight.js en CDN dans index.html
    })
  );

  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  app.use(
    cors({
      origin: allowedOrigin === "*" ? true : allowedOrigin.split(","),
      methods: ["GET", "POST", "DELETE", "PATCH"],
    })
  );

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
}

// Rejette les messages utilisateur trop longs avant d'atteindre l'API du modèle
function validateMessageLength(req, res, next) {
  const MAX_CHARS = 8000;
  const content = req.body && req.body.message;
  if (typeof content !== "string" || content.trim().length === 0) {
    return res.status(400).json({ error: "Message vide ou invalide." });
  }
  if (content.length > MAX_CHARS) {
    return res.status(413).json({
      error: `Message trop long (max ${MAX_CHARS} caractères).`,
    });
  }
  next();
}

module.exports = { applySecurity, validateMessageLength };
