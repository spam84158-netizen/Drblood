# Chat IA

Application web de chat conversationnel avec IA (type ChatGPT), backend Node.js/Express sécurisé et API Groq (gratuite, compatible OpenAI), prête à déployer sur Render.

## Fonctionnalités

- Génération de fichiers par l'IA (function calling OpenAI) : scripts, documents, données... créés à la demande, regroupés en `.zip` si plusieurs fichiers, avec téléchargement et aperçu direct dans le chat (HTML, Markdown, code avec coloration syntaxique)
- Page d'accueil / splash avec présentation de la marque
- Chat en streaming (SSE) avec bouton stop
- Historique de conversations (créer / renommer / supprimer / reprendre)
- Bouton "copier" sur chaque réponse + bouton "copier" sur chaque bloc de code
- Markdown + coloration syntaxique
- Tableau de bord statistiques avec vrais graphiques (Chart.js) : conversations, messages, activité sur 14 jours, répartition utilisateur/IA
- Page Paramètres : thème, vidage de l'historique, infos marque, lien vers les CGU
- Page Conditions d'utilisation
- Icônes Telegram / WhatsApp / YouTube cliquables (ouvrent les liens dans un nouvel onglet) sur toutes les pages
- Mode sombre / clair, thème "sang & braise" (dark + rouge sang), partagé sur tout le site
- Interface responsive (mobile + desktop)
- Clé API jamais exposée côté navigateur
- Prompt système fixé côté serveur, non modifiable depuis le frontend
- Rate limiting + validation des entrées côté serveur

## Structure du projet

```
ai-chat-app/
├── server/
│   ├── index.js              # point d'entrée Express
│   ├── config/systemPrompt.js
│   ├── db/database.js        # SQLite (better-sqlite3)
│   ├── middleware/security.js
│   ├── middleware/rateLimit.js
│   └── routes/chat.js        # endpoint streaming SSE
│   └── routes/conversations.js
│   └── routes/stats.js       # statistiques d'usage (pour le dashboard)
├── public/
│   ├── index.html            # page d'accueil / splash (route "/")
│   ├── chat.html              # l'interface de chat
│   ├── stats.html             # tableau de bord avec graphiques (Chart.js)
│   ├── settings.html          # paramètres (thème, vider l'historique, mentions légales)
│   ├── terms.html             # conditions d'utilisation
│   ├── css/style.css          # thème "sang & braise" (dark/rouge), partagé par toutes les pages
│   └── js/
│       ├── config.js          # ⭐ branding + liens Telegram/WhatsApp/YouTube : modifie ici uniquement
│       ├── nav.js              # navbar + footer injectés sur toutes les pages, gestion du thème
│       ├── app.js              # logique du chat (streaming, historique)
│       └── stats.js            # graphiques du tableau de bord
├── .env.example
└── package.json
```

### Modifier la marque / les liens sociaux

Tout est centralisé dans **`public/js/config.js`** : nom de marque, créateur (Dr Blood), société (Zainz Compagnie), liens Telegram/WhatsApp/YouTube. Changer une valeur ici la met à jour partout sur le site (navbar, footer, accueil, paramètres, conditions d'utilisation).

## Installation locale

```bash
npm install
cp .env.example .env
# édite .env et mets ta clé GROQ_API_KEY (gratuite, voir ci-dessous)
npm start
```

L'app tourne sur `http://localhost:3000`.

### Obtenir une clé Groq gratuite

1. Crée un compte sur [console.groq.com](https://console.groq.com) (pas de carte bancaire demandée).
2. Va dans **API Keys** → **Create API Key**, copie la clé (commence par `gsk_...`).
3. Colle-la dans `GROQ_API_KEY` (fichier `.env` en local, ou variables d'environnement Render).

Limites du plan gratuit (généreuses pour un usage perso/petit projet) : voir [console.groq.com/settings/limits](https://console.groq.com/settings/limits) une fois connecté, ça dépend du modèle choisi.

## Déploiement sur Render

1. Pousse ce projet sur un repo GitHub/GitLab.
2. Sur Render : **New +** → **Web Service** → connecte le repo.
3. Configuration :
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Environment** : Node
4. Dans **Environment Variables**, ajoute :
   - `GROQ_API_KEY` = ta clé Groq gratuite (jamais dans le code, jamais dans le repo)
   - `GROQ_MODEL` = `llama-3.3-70b-versatile` (ou autre modèle Groq)
   - `ALLOWED_ORIGIN` = l'URL de ton service une fois déployé (ou `*` pour tester)
5. Déploie. Render fournit automatiquement `PORT`, pas besoin de le définir.

### ⚠️ Persistance des données sur Render

Le plan gratuit de Render a un **disque éphémère** : la base SQLite (`data.db`) est réinitialisée à chaque redéploiement. Pour une persistance durable :

- Ajoute un **Persistent Disk** dans les paramètres du service Render, monté par exemple sur `/data`, et mets `DB_PATH=/data/app.db` dans les variables d'environnement.
- Ou migre plus tard vers une base hébergée (Render Postgres, etc.) si tu veux passer à l'échelle.

## Sécurité — ce qui est déjà en place

- La clé API Groq reste côté serveur (`process.env.GROQ_API_KEY`), jamais envoyée au navigateur.
- Le prompt système (`server/config/systemPrompt.js`) est codé en dur côté serveur : le frontend ne peut envoyer que le champ `message`, rien d'autre n'est lu ni interprété comme instruction système.
- Rate limiting global (60 req/min) + spécifique au chat (15 req/min) via `express-rate-limit`.
- `helmet` pour les en-têtes de sécurité HTTP.
- Validation de la longueur des messages (max 8000 caractères) avant tout appel à l'API.
- Gestion propre des erreurs API et des interruptions volontaires (bouton stop).

## Génération de fichiers par l'IA

- `server/config/tools.js` déclare l'outil `create_files` exposé au modèle (function calling OpenAI).
- Quand le modèle l'appelle, `server/routes/chat.js` exécute réellement la création : écriture des fichiers via `server/services/fileStore.js`, zip automatique avec `archiver` si plusieurs fichiers (ou si un nom d'archive est demandé), puis renvoie le résultat au modèle pour qu'il poursuive sa réponse.
- `server/routes/files.js` sert le téléchargement (`/api/files/:batchId/:filename/download`) et l'aperçu (`/api/files/:batchId/:filename/preview`), avec protection contre le path traversal et limites de taille.
- Les métadonnées des fichiers sont sauvegardées avec le message (colonne `files` en base) pour rester visibles si on rouvre la conversation plus tard.
- ⚠️ Cette fonctionnalité crée des **fichiers texte** (code, docs, data...), pas d'**exécution de code**. Ajouter un vrai bac à sable d'exécution (lancer le script généré et renvoyer sa sortie) est un chantier à part, avec des enjeux de sécurité plus lourds (isolation, quotas CPU/mémoire, réseau) — à concevoir séparément si tu en as besoin.

## Pour aller plus loin

L'architecture (routes séparées, config isolée, DB découplée) permet d'ajouter facilement :

- Plusieurs modèles IA (ajouter un sélecteur + condition dans `chat.js`)
- Authentification utilisateur (ajouter une table `users` + middleware auth)
- Upload de fichiers/PDF
- Exécution de code en bac à sable (résultat de script, pas seulement le fichier)
- Abonnement / paiement
