// Authentification Firebase par email/mot de passe.
// SDK modulaire chargé directement depuis le CDN Google (pas de build nécessaire).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBzH-n82Ieh_vcn8AK-rIDPpqtMjJeeXgw",
  authDomain: "vibe-app-a81d4.firebaseapp.com",
  projectId: "vibe-app-a81d4",
  storageBucket: "vibe-app-a81d4.firebasestorage.app",
  messagingSenderId: "973098397469",
  appId: "1:973098397469:web:4b0f2ab4b0f50b22c53bf4",
  measurementId: "G-XGDDKP1XQF",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// --- UI : overlay de connexion / inscription ---
function buildAuthOverlay() {
  const overlay = document.createElement("div");
  overlay.id = "authOverlay";
  overlay.className = "auth-overlay";
  overlay.innerHTML = `
    <div class="auth-box">
      <h2 class="auth-title">Dr Blood IA VD-1</h2>
      <p class="auth-subtitle" id="authSubtitle">Connecte-toi pour accéder au chat</p>

      <form id="authForm" class="auth-form">
        <input type="email" id="authEmail" placeholder="Adresse email" required autocomplete="email" />
        <input type="password" id="authPassword" placeholder="Mot de passe" required autocomplete="current-password" minlength="6" />
        <p class="auth-error hidden" id="authError"></p>
        <button type="submit" class="hero-cta auth-submit" id="authSubmitBtn">Se connecter</button>
      </form>

      <div class="auth-switch">
        <span id="authSwitchText">Pas encore de compte ?</span>
        <button type="button" id="authSwitchBtn" class="auth-link">Créer un compte</button>
      </div>
      <button type="button" id="authForgotBtn" class="auth-link auth-forgot">Mot de passe oublié ?</button>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function wireAuthOverlay(overlay) {
  let mode = "login"; // "login" | "signup"

  const form = overlay.querySelector("#authForm");
  const emailInput = overlay.querySelector("#authEmail");
  const passwordInput = overlay.querySelector("#authPassword");
  const errorEl = overlay.querySelector("#authError");
  const submitBtn = overlay.querySelector("#authSubmitBtn");
  const switchBtn = overlay.querySelector("#authSwitchBtn");
  const switchText = overlay.querySelector("#authSwitchText");
  const subtitle = overlay.querySelector("#authSubtitle");
  const forgotBtn = overlay.querySelector("#authForgotBtn");

  function setMode(next) {
    mode = next;
    errorEl.classList.add("hidden");
    if (mode === "login") {
      subtitle.textContent = "Connecte-toi pour accéder au chat";
      submitBtn.textContent = "Se connecter";
      switchText.textContent = "Pas encore de compte ?";
      switchBtn.textContent = "Créer un compte";
    } else {
      subtitle.textContent = "Crée ton compte pour accéder au chat";
      submitBtn.textContent = "Créer mon compte";
      switchText.textContent = "Déjà un compte ?";
      switchBtn.textContent = "Se connecter";
    }
  }

  switchBtn.addEventListener("click", () => setMode(mode === "login" ? "signup" : "login"));

  forgotBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    if (!email) {
      showError("Entre ton email d'abord, puis reclique sur ce lien.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      showError("Email de réinitialisation envoyé. Vérifie ta boîte mail.", true);
    } catch (err) {
      showError(translateFirebaseError(err.code));
    }
  });

  function showError(msg, isInfo = false) {
    errorEl.textContent = msg;
    errorEl.classList.remove("hidden");
    errorEl.classList.toggle("auth-info", isInfo);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    submitBtn.disabled = true;
    errorEl.classList.add("hidden");
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      // onAuthStateChanged se charge de cacher l'overlay
    } catch (err) {
      showError(translateFirebaseError(err.code));
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function translateFirebaseError(code) {
  const map = {
    "auth/invalid-email": "Adresse email invalide.",
    "auth/user-not-found": "Aucun compte avec cet email.",
    "auth/wrong-password": "Mot de passe incorrect.",
    "auth/invalid-credential": "Email ou mot de passe incorrect.",
    "auth/email-already-in-use": "Un compte existe déjà avec cet email.",
    "auth/weak-password": "Mot de passe trop court (6 caractères minimum).",
    "auth/too-many-requests": "Trop de tentatives. Réessaie dans quelques minutes.",
    "auth/network-request-failed": "Problème réseau, vérifie ta connexion.",
  };
  return map[code] || "Une erreur est survenue. Réessaie.";
}

// --- Initialisation : bloque l'accès tant que non connecté ---
const overlay = buildAuthOverlay();
wireAuthOverlay(overlay);

// Cache tout le contenu de la page pendant qu'on vérifie l'état de connexion
document.documentElement.classList.add("auth-checking");

onAuthStateChanged(auth, (user) => {
  document.documentElement.classList.remove("auth-checking");
  if (user) {
    overlay.classList.add("hidden");
    document.dispatchEvent(new CustomEvent("auth:ready", { detail: { user } }));
  } else {
    overlay.classList.remove("hidden");
  }
});

// Exposé globalement pour un éventuel bouton "Déconnexion" ailleurs (settings.html, nav.js...)
// et pour que app.js / stats.js puissent attacher le token Firebase à chaque appel API.
window.firebaseAuth = {
  auth,
  logout: () => signOut(auth),
  getIdToken: () => (auth.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null)),
};
