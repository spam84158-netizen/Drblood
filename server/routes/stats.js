const express = require("express");
const { db } = require("../db/firestore");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// GET /api/stats — statistiques d'usage agrégées depuis Firestore, pour l'utilisateur connecté
router.get("/", async (req, res) => {
  try {
    const convCol = db.collection("users").doc(req.uid).collection("conversations");
    const convSnap = await convCol.get();
    const totalConversations = convSnap.size;

    let totalMessages = 0;
    let totalUserMessages = 0;
    let totalAssistantMessages = 0;
    const dayCounts = {};
    const since = Date.now() - 14 * 24 * 60 * 60 * 1000;

    // Petite volumétrie attendue (usage perso) : on parcourt les messages de
    // chaque conversation directement, pas besoin d'agrégation côté Firestore.
    for (const convDoc of convSnap.docs) {
      const messagesSnap = await convDoc.ref.collection("messages").get();
      messagesSnap.forEach((m) => {
        const data = m.data();
        totalMessages++;
        if (data.role === "user") totalUserMessages++;
        if (data.role === "assistant") totalAssistantMessages++;
        if (data.created_at >= since) {
          const key = new Date(data.created_at).toISOString().slice(0, 10);
          dayCounts[key] = (dayCounts[key] || 0) + 1;
        }
      });
    }

    const avgMessagesPerConversation =
      totalConversations > 0 ? +(totalMessages / totalConversations).toFixed(1) : 0;

    const messagesPerDay = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      messagesPerDay.push({ date: key, count: dayCounts[key] || 0 });
    }

    res.json({
      totalConversations,
      totalMessages,
      totalUserMessages,
      totalAssistantMessages,
      avgMessagesPerConversation,
      messagesPerDay,
    });
  } catch (err) {
    console.error("Erreur calcul stats:", err.message);
    res.status(500).json({ error: "Erreur lors du calcul des statistiques." });
  }
});

module.exports = router;
