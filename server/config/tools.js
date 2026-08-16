// Définition des "tools" (function calling) exposés au modèle.
// Le modèle appelle create_files quand l'utilisateur demande un fichier,
// un script, un document, ou plusieurs fichiers à regrouper dans un zip.
// L'exécution réelle (écriture disque + zip) se fait côté serveur dans
// server/routes/chat.js — le modèle ne fait que décrire le contenu voulu.

const TOOLS = [
  {
    type: "function",
    function: {
      name: "create_files",
      description:
        "Crée un ou plusieurs fichiers texte (code, document, données, config...) que l'utilisateur pourra télécharger et prévisualiser directement dans le chat. " +
        "Utilise cet outil dès que l'utilisateur demande un fichier, un script, un export, ou plusieurs fichiers à regrouper dans une archive .zip. " +
        "Ne mets jamais le contenu du fichier dans ta réponse texte en plus de l'appel d'outil : passe-le uniquement dans l'argument 'content'.",
      parameters: {
        type: "object",
        properties: {
          archive_name: {
            type: "string",
            description:
              "Nom de l'archive .zip (sans extension), utilisé seulement s'il y a plusieurs fichiers ou si l'utilisateur demande explicitement un zip.",
          },
          files: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                filename: {
                  type: "string",
                  description: "Nom de fichier avec extension, ex: script.py, notes.md, data.json, index.html",
                },
                content: {
                  type: "string",
                  description: "Contenu complet et final du fichier, en texte brut.",
                },
              },
              required: ["filename", "content"],
            },
          },
        },
        required: ["files"],
      },
    },
  },
];

module.exports = { TOOLS };
