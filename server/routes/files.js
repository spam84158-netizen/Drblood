const express = require("express");
const fs = require("fs");
const path = require("path");
const { GENERATED_DIR } = require("../services/fileStore");

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Résout un chemin fichier en s'assurant qu'il reste bien à l'intérieur du
// dossier du lot (protection contre le path traversal, ex: ../../etc/passwd).
function resolveSafePath(batchId, filename) {
  if (!UUID_RE.test(batchId)) return null;
  const dir = path.join(GENERATED_DIR, batchId);
  const filePath = path.join(dir, path.basename(String(filename || "")));
  if (!filePath.startsWith(dir + path.sep) && filePath !== dir) return null;
  return filePath;
}

// GET /api/files/:batchId/:filename/download — téléchargement direct
router.get("/:batchId/:filename/download", (req, res) => {
  const filePath = resolveSafePath(req.params.batchId, req.params.filename);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Fichier introuvable ou expiré." });
  }
  res.download(filePath, req.params.filename);
});

// GET /api/files/:batchId/:filename/preview — contenu brut pour aperçu inline
router.get("/:batchId/:filename/preview", (req, res) => {
  const filePath = resolveSafePath(req.params.batchId, req.params.filename);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Fichier introuvable ou expiré." });
  }
  const stat = fs.statSync(filePath);
  if (stat.size > 2 * 1024 * 1024) {
    return res.status(413).json({ error: "Fichier trop volumineux pour l'aperçu." });
  }
  const content = fs.readFileSync(filePath, "utf8");
  res.json({ content });
});

module.exports = router;
