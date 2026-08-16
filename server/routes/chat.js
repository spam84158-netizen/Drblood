const express = require("express");
const { v4: uuidv4 } = require("uuid");
const OpenAI = require("openai");
const { db } = require("../db/firestore");
const { requireAuth } = require("../middleware/auth");
const { SYSTEM_PROMPT } = require("../config/systemPrompt");
const { VD2_SYSTEM_PROMPT } = require("../config/systemPromptVD2");
const { TOOLS } = require("../config/tools");
const { saveFiles, zipBatch } = require("../services/fileStore");
const { validateMessageLength } = require("../middleware/security");
const { chatLimiter } = require("../middleware/rateLimit");

const router = express.Router();

// Groq expose une API compatible OpenAI (mêmes formats de requête/réponse,
// streaming SSE, function calling) : on réutilise le SDK "openai" en
// changeant juste baseURL + clé. Gratuit, sans carte bancaire.
const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const TEMPERATURE = parseFloat(process.env.GROQ_TEMPERATURE || "0.7");
const MAX_TOKENS = parseInt(process.env.GROQ_MAX_TOKENS || "2048", 10);
const MAX_CONTEXT_MESSAGES = parseInt(process.env.MAX_CONTEXT_MESSAGES || "20", 10);
const MAX_TOOL_ROUNDS = 3; // garde-fou anti-boucle infinie d'appels d'outils

function sseWrite(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

// Exécute réellement l'outil "create_files" : écrit les fichiers sur disque,
// zippe si nécessaire, et renvoie à la fois le résultat pour le modèle
// (texte JSON compact) et les métadonnées à afficher dans le chat.
async function runCreateFiles(args) {
  const parsed = typeof args === "string" ? JSON.parse(args) : args;
  const { batchId, batchDir, files } = saveFiles(parsed.files || []);

  let archive = null;
  const wantsZip = files.length > 1 || !!parsed.archive_name;
  if (wantsZip) {
    const archiveName = parsed.archive_name || "fichiers";
    const zipped = await zipBatch(batchDir, archiveName);
    archive = { batchId, filename: zipped.filename, size: zipped.size };
  }

  const filesForDisplay = files.map((f) => ({
    batchId,
    filename: f.filename,
    size: f.size,
    previewable: f.previewable,
  }));

  return {
    displayPayload: { files: filesForDisplay, archive },
    toolResultForModel: JSON.stringify({
      status: "ok",
      files: files.map((f) => ({ filename: f.filename, size: f.size })),
      archive: archive ? archive.filename : null,
    }),
  };
}

// POST /api/chat/:conversationId
// SÉCURITÉ IMPORTANTE :
// - Le frontend ne peut envoyer QUE "message" (le texte de l'utilisateur).
// - Tout champ "system", "role: system", ou instruction visant à remplacer
//   le prompt système est ignoré : on reconstruit nous-mêmes le tableau
//   "messages" envoyé à l'API, avec SYSTEM_PROMPT toujours en première position,
//   codé en dur côté serveur, jamais lu depuis req.body.
// - Le modèle peut créer des fichiers via l'outil "create_files" (server/config/tools.js) :
//   l'écriture disque, le nommage et le zippage sont entièrement gérés côté serveur
//   (server/services/fileStore.js), jamais par du code envoyé par le modèle.
router.post("/:conversationId", requireAuth, chatLimiter, validateMessageLength, async (req, res) => {
  const { conversationId } = req.params;
  const userMessage = req.body.message.trim();
  const convRef = db.collection("users").doc(req.uid).collection("conversations").doc(conversationId);

  const convDoc = await convRef.get();
  if (!convDoc.exists) {
    return res.status(404).json({ error: "Conversation introuvable." });
  }

  const historySnap = await convRef.collection("messages").orderBy("created_at", "asc").get();
  const history = historySnap.docs.map((d) => d.data()).slice(-MAX_CONTEXT_MESSAGES);

  const userMsgId = uuidv4();
  const now = Date.now();
  await convRef.collection("messages").doc(userMsgId).set({
    role: "user",
    content: userMessage,
    created_at: now,
  });
  await convRef.update({ updated_at: now });

  // Le mode (vd1/vd2) est lu depuis la conversation stockée en base, jamais
  // depuis le corps de la requête : impossible pour le client de "activer"
  // VD2 sur une conversation créée en VD1, ni d'injecter un autre prompt.
  const mode = convDoc.data().mode === "vd2" ? "vd2" : "vd1";
  const activeSystemPrompt = mode === "vd2" ? VD2_SYSTEM_PROMPT : SYSTEM_PROMPT;

  const messages = [
    { role: "system", content: activeSystemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let fullResponse = "";
  const allDisplayedFiles = []; // cumulé sur tous les tours d'outils, sauvegardé en DB
  const abortController = new AbortController();
  req.on("close", () => abortController.abort());

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const stream = await openai.chat.completions.create(
        {
          model: MODEL,
          messages,
          tools: TOOLS,
          tool_choice: "auto",
          temperature: TEMPERATURE,
          max_tokens: MAX_TOKENS,
          stream: true,
        },
        { signal: abortController.signal }
      );

      let roundText = "";
      let finishReason = null;
      const toolCallsAcc = []; // accumulation des deltas de tool_calls par index

      for await (const chunk of stream) {
        const choice = chunk.choices?.[0];
        if (!choice) continue;

        const delta = choice.delta || {};

        if (delta.content) {
          roundText += delta.content;
          fullResponse += delta.content;
          sseWrite(res, { delta: delta.content });
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!toolCallsAcc[tc.index]) {
              toolCallsAcc[tc.index] = { id: tc.id, type: "function", function: { name: "", arguments: "" } };
            }
            if (tc.function?.name) toolCallsAcc[tc.index].function.name += tc.function.name;
            if (tc.function?.arguments) toolCallsAcc[tc.index].function.arguments += tc.function.arguments;
            if (tc.id) toolCallsAcc[tc.index].id = tc.id;
          }
        }

        if (choice.finish_reason) finishReason = choice.finish_reason;
      }

      // Pas d'appel d'outil : le modèle a fini de répondre normalement.
      if (finishReason !== "tool_calls" || toolCallsAcc.length === 0) {
        break;
      }

      // Le modèle demande à créer des fichiers : on exécute chaque appel
      // côté serveur, on informe immédiatement le frontend (carte fichier),
      // puis on renvoie le résultat au modèle pour qu'il poursuive.
      messages.push({ role: "assistant", content: roundText || null, tool_calls: toolCallsAcc });

      for (const call of toolCallsAcc) {
        if (call.function.name !== "create_files") {
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ status: "error", error: "Outil inconnu." }) });
          continue;
        }
        try {
          const { displayPayload, toolResultForModel } = await runCreateFiles(call.function.arguments);
          if (displayPayload.files.length > 0) {
            allDisplayedFiles.push(displayPayload);
            sseWrite(res, { files: displayPayload });
          }
          messages.push({ role: "tool", tool_call_id: call.id, content: toolResultForModel });
        } catch (err) {
          console.error("Erreur create_files:", err.message);
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({ status: "error", error: err.message }),
          });
        }
      }
      // La boucle continue : nouvel appel au modèle avec les résultats d'outils.
    }

    sseWrite(res, { done: true });
    res.end();
  } catch (err) {
    if (err.name === "AbortError" || abortController.signal.aborted) {
      // interruption volontaire (bouton stop), rien à faire côté réponse
    } else {
      console.error("Erreur API Groq:", err.message);
      try {
        sseWrite(res, { error: "Une erreur est survenue lors de la génération de la réponse." });
        res.end();
      } catch (_) {
        // connexion déjà fermée
      }
    }
  } finally {
    if (fullResponse.trim().length > 0 || allDisplayedFiles.length > 0) {
      const assistantMsgId = uuidv4();
      const filesJson = allDisplayedFiles.length > 0 ? JSON.stringify(allDisplayedFiles) : null;
      const finishedAt = Date.now();
      try {
        await convRef.collection("messages").doc(assistantMsgId).set({
          role: "assistant",
          content: fullResponse,
          created_at: finishedAt,
          files: filesJson,
        });
        await convRef.update({ updated_at: finishedAt });
      } catch (err) {
        console.error("Erreur sauvegarde message assistant:", err.message);
      }
    }
  }
});

module.exports = router;
