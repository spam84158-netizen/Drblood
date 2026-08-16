const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { db } = require("../db/firestore");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Chaque utilisateur a ses propres conversations sous users/{uid}/conversations
function conversationsCol(uid) {
  return db.collection("users").doc(uid).collection("conversations");
}

// Liste toutes les conversations de l'utilisateur (les plus récentes en premier)
router.get("/", async (req, res) => {
  try {
    const snap = await conversationsCol(req.uid).orderBy("updated_at", "desc").get();
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json(rows);
  } catch (err) {
    console.error("Erreur listing conversations:", err.message);
    res.status(500).json({ error: "Erreur lors du chargement des conversations." });
  }
});

// Crée une nouvelle conversation
router.post("/", async (req, res) => {
  try {
    const id = uuidv4();
    const now = Date.now();
    const title = (req.body && req.body.title) || "Nouvelle conversation";
    // "mode" fige quel prompt système (VD1 ou VD2) est utilisé pour TOUTE
    // cette conversation. Fixé à la création, jamais modifiable ensuite,
    // et jamais relu depuis le corps des requêtes /api/chat (voir chat.js).
    const mode = req.body && req.body.mode === "vd2" ? "vd2" : "vd1";

    await conversationsCol(req.uid)
      .doc(id)
      .set({ title, mode, created_at: now, updated_at: now });

    res.status(201).json({ id, title, mode, created_at: now, updated_at: now });
  } catch (err) {
    console.error("Erreur création conversation:", err.message);
    res.status(500).json({ error: "Erreur lors de la création de la conversation." });
  }
});

// Récupère une conversation + tous ses messages
router.get("/:id", async (req, res) => {
  try {
    const convRef = conversationsCol(req.uid).doc(req.params.id);
    const convDoc = await convRef.get();

    if (!convDoc.exists) {
      return res.status(404).json({ error: "Conversation introuvable." });
    }

    const messagesSnap = await convRef.collection("messages").orderBy("created_at", "asc").get();
    const messages = messagesSnap.docs.map((d) => {
      const data = d.data();
      return { id: d.id, ...data, files: data.files ? JSON.parse(data.files) : null };
    });

    res.json({ id: convDoc.id, ...convDoc.data(), messages });
  } catch (err) {
    console.error("Erreur lecture conversation:", err.message);
    res.status(500).json({ error: "Erreur lors du chargement de la conversation." });
  }
});

// Renomme une conversation
router.patch("/:id", async (req, res) => {
  const { title } = req.body;
  if (!title || typeof title !== "string") {
    return res.status(400).json({ error: "Titre invalide." });
  }

  try {
    const ref = conversationsCol(req.uid).doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Conversation introuvable." });
    }
    await ref.update({ title: title.slice(0, 200), updated_at: Date.now() });
    res.json({ success: true });
  } catch (err) {
    console.error("Erreur renommage conversation:", err.message);
    res.status(500).json({ error: "Erreur lors du renommage." });
  }
});

// Supprime une sous-collection (messages) par lots de 200
async function deleteMessagesOf(convRef) {
  const snap = await convRef.collection("messages").limit(200).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  if (snap.size === 200) await deleteMessagesOf(convRef); // encore potentiellement plus à supprimer
}

// Supprime TOUTES les conversations de l'utilisateur (bouton "Vider l'historique")
router.delete("/", async (req, res) => {
  try {
    const snap = await conversationsCol(req.uid).get();
    for (const doc of snap.docs) {
      await deleteMessagesOf(doc.ref);
      await doc.ref.delete();
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Erreur suppression historique:", err.message);
    res.status(500).json({ error: "Erreur lors de la suppression." });
  }
});

// Supprime une conversation (et ses messages)
router.delete("/:id", async (req, res) => {
  try {
    const ref = conversationsCol(req.uid).doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Conversation introuvable." });
    }
    await deleteMessagesOf(ref);
    await ref.delete();
    res.json({ success: true });
  } catch (err) {
    console.error("Erreur suppression conversation:", err.message);
    res.status(500).json({ error: "Erreur lors de la suppression." });
  }
});

module.exports = router;
