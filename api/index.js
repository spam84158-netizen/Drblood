// Vercel transforme ce fichier en fonction serverless. On réutilise
// directement l'app Express existante (server/index.js), sans dupliquer
// aucune logique.
module.exports = require("../server/index.js");
