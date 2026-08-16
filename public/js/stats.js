async function loadStats() {
  try {
    const token = await window.firebaseAuth.getIdToken();
    const res = await fetch("/api/stats", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Erreur lors du chargement des statistiques.");
    const data = await res.json();
    renderStatCards(data);
    renderActivityChart(data.messagesPerDay);
    renderSplitChart(data.totalUserMessages, data.totalAssistantMessages);
  } catch (err) {
    console.error(err);
  }
}

function renderStatCards(data) {
  document.getElementById("statConversations").textContent = data.totalConversations;
  document.getElementById("statMessages").textContent = data.totalMessages;
  document.getElementById("statAvg").textContent = data.avgMessagesPerConversation;
  const recentTotal = data.messagesPerDay.reduce((sum, d) => sum + d.count, 0);
  document.getElementById("statRecent").textContent = recentTotal;
}

function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function renderActivityChart(messagesPerDay) {
  const ctx = document.getElementById("activityChart");
  const labels = messagesPerDay.map((d) =>
    new Date(d.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
  );
  const values = messagesPerDay.map((d) => d.count);
  const accent = getCSSVar("--accent-bright") || "#c81d25";
  const textSecondary = getCSSVar("--text-secondary") || "#8c8079";
  const border = getCSSVar("--border") || "#2a201d";

  new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Messages",
          data: values,
          borderColor: accent,
          backgroundColor: hexToRgba(accent, 0.15),
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: accent,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: textSecondary }, grid: { color: border } },
        y: { ticks: { color: textSecondary, precision: 0 }, grid: { color: border }, beginAtZero: true },
      },
    },
  });
}

function renderSplitChart(userCount, assistantCount) {
  const ctx = document.getElementById("splitChart");
  const accent = getCSSVar("--accent-bright") || "#c81d25";
  const gold = getCSSVar("--gold") || "#b08d57";
  const textSecondary = getCSSVar("--text-secondary") || "#8c8079";

  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Toi", "Zainz IA"],
      datasets: [
        {
          data: [userCount, assistantCount],
          backgroundColor: [gold, accent],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: textSecondary, padding: 16 } },
      },
      cutout: "68%",
    },
  });
}

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const bigint = parseInt(h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

document.addEventListener("auth:ready", loadStats, { once: true });
