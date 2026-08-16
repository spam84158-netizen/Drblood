const fs = require("fs");
const os = require("os");
const path = require("path");
const archiver = require("archiver");
const { v4: uuidv4 } = require("uuid");

// Dossier de stockage des fichiers générés par l'IA — éphémère par nature
// (repart de zéro à chaque redémarrage/redéploiement, sur Render comme sur Vercel).
// Par défaut on utilise le dossier temporaire du système : c'est le SEUL
// emplacement inscriptible sur Vercel (système de fichiers en lecture seule
// ailleurs). Fonctionne aussi très bien sur Render/local.
const GENERATED_DIR = process.env.GENERATED_DIR || path.join(os.tmpdir(), "generated");
if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });

const MAX_FILES_PER_BATCH = 20;
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 Mo par fichier
const MAX_BATCH_BYTES = 8 * 1024 * 1024; // 8 Mo au total par génération

const PREVIEWABLE_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown", ".js", ".jsx", ".ts", ".tsx", ".json",
  ".html", ".htm", ".css", ".csv", ".py", ".java", ".c", ".cpp", ".h",
  ".sh", ".yml", ".yaml", ".xml", ".sql", ".php", ".rb", ".go", ".env",
]);

function safeFilename(name) {
  const base = path.basename(String(name || "").trim());
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return cleaned || "fichier.txt";
}

function safeArchiveName(name) {
  const cleaned = String(name || "archive")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);
  return cleaned || "archive";
}

// Écrit chaque fichier sur disque dans un dossier de lot (batch) isolé,
// identifié par un UUID — c'est cet UUID qui sert d'ID d'accès pour le
// téléchargement/l'aperçu (server/routes/files.js).
function saveFiles(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("Aucun fichier à créer.");
  }
  if (files.length > MAX_FILES_PER_BATCH) {
    throw new Error(`Trop de fichiers en une seule fois (max ${MAX_FILES_PER_BATCH}).`);
  }

  let totalBytes = 0;
  const batchId = uuidv4();
  const batchDir = path.join(GENERATED_DIR, batchId);
  fs.mkdirSync(batchDir, { recursive: true });

  const usedNames = new Set();
  const saved = files.map((f) => {
    let filename = safeFilename(f.filename);
    // Évite les collisions si le modèle propose deux fois le même nom
    let i = 1;
    const ext = path.extname(filename);
    const stem = filename.slice(0, filename.length - ext.length);
    while (usedNames.has(filename)) {
      filename = `${stem}_${i}${ext}`;
      i += 1;
    }
    usedNames.add(filename);

    const content = String(f.content ?? "");
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes > MAX_FILE_BYTES) {
      throw new Error(`Le fichier "${filename}" dépasse la taille maximale autorisée.`);
    }
    totalBytes += bytes;
    if (totalBytes > MAX_BATCH_BYTES) {
      throw new Error("Taille totale des fichiers générés trop importante.");
    }

    const filePath = path.join(batchDir, filename);
    fs.writeFileSync(filePath, content, "utf8");

    return {
      filename,
      size: bytes,
      previewable: PREVIEWABLE_EXTENSIONS.has(path.extname(filename).toLowerCase()),
    };
  });

  return { batchId, batchDir, files: saved };
}

// Zippe l'intégralité d'un lot de fichiers déjà écrits sur disque.
async function zipBatch(batchDir, archiveName) {
  const zipFilename = `${safeArchiveName(archiveName)}.zip`;
  const zipPath = path.join(batchDir, zipFilename);

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", resolve);
    archive.on("warning", (err) => console.warn("Avertissement archiver:", err.message));
    archive.on("error", reject);
    archive.pipe(output);
    archive.glob("**/*", { cwd: batchDir, ignore: [zipFilename] });
    archive.finalize();
  });

  const stat = fs.statSync(zipPath);
  return { filename: zipFilename, size: stat.size };
}

module.exports = {
  GENERATED_DIR,
  MAX_FILE_BYTES,
  saveFiles,
  zipBatch,
  safeFilename,
};
