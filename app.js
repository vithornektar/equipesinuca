(function () {
  "use strict";

  var STORAGE_KEY = "sinucaTorneioState_v1";
  var DEFAULT_A3FAD_LOGO = "assets/a3fad-logo.png";
  var MAX_DUPLAS = 16;
  var UNLOCK_KEY = "sinucaConfigUnlocked";

  var ROUND_LABELS = {
    oitavas: "Oitavas de Final",
    quartas: "Quartas de Final",
    semis: "Semifinal",
    final: "Final",
    third: "Disputa de 3º Lugar"
  };

  var state = loadState();

  // ---------------------------------------------------------------------
  // State helpers
  // ---------------------------------------------------------------------
  function defaultState() {
    return {
      name: "",
      date: "",
      location: "Faculdade de Arquitetura e Urbanismo e Design UFRGS",
      tournamentLogo: null, // dataURL or null
      a3fadLogo: null,      // dataURL or null (null => use default asset)
      duplas: [],           // [{id, name}]
      bracket: null,
      configPassword: null, // string or null (no password set = open access)
      registration: {
        infoText: "",
        fee: "",
        pix: "",
        whatsapp: "",
        startTime: "",
        totalSlots: 16,
        submissions: [] // [{id, duplaName, playerNames, courses, instagram, canPlay, canPlayOther, ts}]
      }
    };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      var parsed = JSON.parse(raw);
      return Object.assign(defaultState(), parsed);
    } catch (e) {
      console.error("Falha ao carregar estado salvo", e);
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Falha ao salvar estado (armazenamento cheio?)", e);
      alert("Não foi possível salvar automaticamente (armazenamento do navegador cheio). Considere usar uma imagem de logo menor.");
    }
  }

  function uid() {
    return "d_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  // ---------------------------------------------------------------------
  // Bracket slot helpers
  // ---------------------------------------------------------------------
  function isTeam(x) { return !!x && x.type === "team"; }
  function isBye(x) { return !!x && x.type === "bye"; }
  function sameSlot(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.type !== b.type) return false;
    if (a.type === "team") return a.id === b.id;
    return true; // both bye
  }

  function shuffle(arr) {
    var copy = arr.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
    }
    return copy;
  }

  function generateBracket() {
    if (state.duplas.length < 2) {
      alert("Cadastre ao menos 2 duplas antes de sortear o chaveamento.");
      return;
    }
    var shuffled = shuffle(state.duplas);
    var slots = new Array(16).fill(null);
    shuffled.slice(0, 16).forEach(function (d, i) { slots[i] = { type: "team", id: d.id, name: d.name }; });

    var oitavas = [];
    for (var i = 0; i < 16; i += 2) {
      var teamA = slots[i] || { type: "bye" };
      var teamB = slots[i + 1] || { type: "bye" };
      oitavas.push({ teamA: teamA, teamB: teamB, winner: null });
    }

    state.bracket = {
      oitavas: oitavas,
      quartas: buildEmptyRound(4),
      semis: buildEmptyRound(2),
      final: buildEmptyRound(1),
      third: buildEmptyRound(1)
    };

    rebuildBracket();
    saveState();
    renderAll();
    switchTab("bracket");
  }

  function buildEmptyRound(count) {
    var arr = [];
    for (var i = 0; i < count; i++) arr.push({ teamA: null, teamB: null, winner: null });
    return arr;
  }

  function autoResolveMatch(match) {
    var a = match.teamA, b = match.teamB;
    if (isTeam(a) && isBye(b)) { match.winner = a; return; }
    if (isBye(a) && isTeam(b)) { match.winner = b; return; }
    if (isBye(a) && isBye(b)) { match.winner = { type: "bye" }; return; }
    if (isTeam(a) && isTeam(b)) {
      if (match.winner && !sameSlot(match.winner, a) && !sameSlot(match.winner, b)) {
        match.winner = null;
      }
      return; // keep manual winner choice (or null awaiting choice)
    }
    // at least one side is null/TBD (still waiting on a previous round)
    match.winner = null;
  }

  function loserOf(match) {
    if (!match.winner) return null;
    if (!isTeam(match.teamA) || !isTeam(match.teamB)) return null; // no real loser if a bye was involved
    return sameSlot(match.winner, match.teamA) ? match.teamB : match.teamA;
  }

  function rebuildBracket() {
    if (!state.bracket) return;
    var b = state.bracket;
    var rounds = [b.oitavas, b.quartas, b.semis, b.final];

    for (var r = 0; r < rounds.length; r++) {
      var round = rounds[r];
      for (var idx = 0; idx < round.length; idx++) {
        autoResolveMatch(round[idx]);
      }
      if (r < rounds.length - 1) {
        var nextRound = rounds[r + 1];
        for (idx = 0; idx < round.length; idx++) {
          var m = round[idx];
          var nextMatch = nextRound[Math.floor(idx / 2)];
          var slotKey = idx % 2 === 0 ? "teamA" : "teamB";
          var newVal = m.winner || null;
          if (!sameSlot(nextMatch[slotKey], newVal)) {
            nextMatch[slotKey] = newVal;
            nextMatch.winner = null;
          }
        }
      }
    }
    // final needs re-resolve after last propagation pass
    autoResolveMatch(b.final[0]);

    // third place: fed by losers of the two semifinal matches
    var third = b.third[0];
    var newA = loserOf(b.semis[0]);
    var newB = loserOf(b.semis[1]);
    if (!sameSlot(third.teamA, newA)) { third.teamA = newA; third.winner = null; }
    if (!sameSlot(third.teamB, newB)) { third.teamB = newB; third.winner = null; }
    autoResolveMatch(third);
  }

  function setWinner(roundKey, index, side) {
    var match = state.bracket[roundKey][index];
    var chosen = side === "A" ? match.teamA : match.teamB;
    if (!isTeam(chosen)) return;
    match.winner = chosen;
    rebuildBracket();
    saveState();
    renderBracket();
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------
  function slotLabel(slot) {
    if (!slot) return "A definir";
    if (slot.type === "bye") return "BYE (passa direto)";
    return slot.name;
  }

  function slotClass(match, side) {
    var slot = side === "A" ? match.teamA : match.teamB;
    var classes = ["match-slot"];
    if (!slot) { classes.push("slot-tbd", "slot-disabled"); return classes.join(" "); }
    if (slot.type === "bye") { classes.push("slot-bye", "slot-disabled"); return classes.join(" "); }
    if (slot.type === "placeholder") { classes.push("slot-tbd", "slot-disabled"); return classes.join(" "); }
    if (match.winner && sameSlot(match.winner, slot)) classes.push("slot-winner");
    if (!isTeam(match.teamA) || !isTeam(match.teamB)) classes.push("slot-disabled");
    return classes.join(" ");
  }

  var BALL_COLORS = ["#f4c20d", "#1565c0", "#c62828", "#6a1b9a", "#ef6c00", "#2e7d32", "#7b3f3f"]; // balls 1-7, ball 8 is special (see ballChipHtml)

  function ballChipHtml(n) {
    var num = ((n - 1) % 8) + 1;
    if (num === 8) return '<span class="ball-chip ball-8">8</span>';
    return '<span class="ball-chip" style="--ball-color:' + BALL_COLORS[num - 1] + '">' + num + '</span>';
  }

  function renderMatchBox(roundKey, index, match) {
    var html = '<div class="match-box" data-round="' + roundKey + '" data-index="' + index + '">';
    html += '<div class="match-head">' + ballChipHtml(index + 1) + '<span>Jogo ' + (index + 1) + '</span></div>';
    html += '<div class="' + slotClass(match, "A") + '" data-side="A">' + escapeHtml(slotLabel(match.teamA)) + '</div>';
    html += '<div class="' + slotClass(match, "B") + '" data-side="B">' + escapeHtml(slotLabel(match.teamB)) + '</div>';
    html += '</div>';
    return html;
  }

  function renderRoundColumn(title, roundKey, matches) {
    var html = '<div class="bracket-round" data-round-col="' + roundKey + '">';
    html += '<div class="round-title">' + escapeHtml(title) + '</div>';
    matches.forEach(function (m, i) { html += renderMatchBox(roundKey, i, m); });
    html += '</div>';
    return html;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function buildPreviewBracket() {
    var oitavas = [];
    for (var i = 0; i < 8; i++) {
      oitavas.push({
        teamA: { type: "placeholder", name: "Vaga " + (i * 2 + 1) },
        teamB: { type: "placeholder", name: "Vaga " + (i * 2 + 2) },
        winner: null
      });
    }
    function tbdRound(count) {
      var arr = [];
      for (var j = 0; j < count; j++) arr.push({ teamA: null, teamB: null, winner: null });
      return arr;
    }
    return { oitavas: oitavas, quartas: tbdRound(4), semis: tbdRound(2), final: tbdRound(1), third: tbdRound(1) };
  }

  function renderBracket() {
    var container = document.getElementById("bracketContainer");
    var emptyState = document.getElementById("bracketEmptyState");
    var isPreview = !state.bracket;
    var b = state.bracket || buildPreviewBracket();

    emptyState.style.display = isPreview ? "" : "none";
    container.classList.toggle("bracket-preview", isPreview);
    document.body.classList.toggle("has-bracket", !isPreview);

    var html = '<div class="round-col-wrapper">';
    html += renderRoundColumn(ROUND_LABELS.oitavas, "oitavas", b.oitavas);
    html += renderRoundColumn(ROUND_LABELS.quartas, "quartas", b.quartas);
    html += renderRoundColumn(ROUND_LABELS.semis, "semis", b.semis);
    html += renderRoundColumn(ROUND_LABELS.final, "final", b.final);
    html += '</div>';
    html += renderRoundColumn(ROUND_LABELS.third, "third", b.third);

    container.innerHTML = html;

    // champion banner
    var champion = b.final[0].winner;
    var banner = document.getElementById("championBanner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "championBanner";
      banner.className = "champion-banner";
      container.parentNode.insertBefore(banner, container.nextSibling);
    }
    if (champion && isTeam(champion)) {
      banner.textContent = "🏆 Campeão: " + champion.name;
      banner.classList.add("show");
    } else {
      banner.classList.remove("show");
    }
  }

  function renderHeader() {
    var name = state.name || "Torneio de Sinuca";
    var infoParts = [];
    if (state.date) infoParts.push(formatDate(state.date));
    if (state.location) infoParts.push(state.location);
    var info = infoParts.join(" • ");

    document.getElementById("headerTournamentName").textContent = name;
    document.getElementById("headerTournamentInfo").textContent = info;
    document.getElementById("printTournamentName").textContent = name;
    document.getElementById("printTournamentInfo").textContent = info;

    var tLogoEl = document.getElementById("tournamentLogoPreview");
    var printTLogoEl = document.getElementById("printTournamentLogo");
    if (state.tournamentLogo) {
      tLogoEl.src = state.tournamentLogo; tLogoEl.style.display = "";
      printTLogoEl.src = state.tournamentLogo; printTLogoEl.style.display = "";
    } else {
      tLogoEl.style.display = "none";
      printTLogoEl.style.display = "none";
    }

    var a3fadSrc = state.a3fadLogo || DEFAULT_A3FAD_LOGO;
    document.getElementById("a3fadLogoPreview").src = a3fadSrc;
    document.getElementById("printA3fadLogo").src = a3fadSrc;
  }

  function formatDate(isoStr) {
    var parts = isoStr.split("-");
    if (parts.length !== 3) return isoStr;
    return parts[2] + "/" + parts[1] + "/" + parts[0];
  }

  function renderConfigForm() {
    document.getElementById("inputTournamentName").value = state.name || "";
    document.getElementById("inputTournamentDate").value = state.date || "";
    document.getElementById("inputTournamentLocation").value = state.location || "";

    setLogoPreview("logoTournamentBig", "logoTournamentPlaceholder", state.tournamentLogo);
    setLogoPreview("logoA3fadBig", "logoA3fadPlaceholder", state.a3fadLogo || DEFAULT_A3FAD_LOGO);
  }

  function setLogoPreview(imgId, placeholderId, src) {
    var img = document.getElementById(imgId);
    var placeholder = document.getElementById(placeholderId);
    if (src) {
      img.src = src; img.style.display = "";
      placeholder.style.display = "none";
    } else {
      img.style.display = "none";
      placeholder.style.display = "";
    }
  }

  function renderDuplasList() {
    var list = document.getElementById("duplasList");
    document.getElementById("duplasCounter").textContent = state.duplas.length + " / " + MAX_DUPLAS;
    list.innerHTML = state.duplas.map(function (d, i) {
      return '<li>' +
        '<span class="dupla-number">' + (i + 1) + '</span>' +
        '<span class="dupla-name">' + escapeHtml(d.name) + '</span>' +
        '<button type="button" class="btn-remove" data-id="' + d.id + '" title="Remover">✕</button>' +
        '</li>';
    }).join("");
  }

  function renderAll() {
    renderHeader();
    renderConfigForm();
    renderDuplasList();
    renderBracket();
    renderRegistrationSettings();
    renderRegistrationPublic();
    renderRegistrationSubmissions();
    renderConfigLock();
  }

  // ---------------------------------------------------------------------
  // Config lock screen
  // ---------------------------------------------------------------------
  function isConfigLocked() {
    return !!state.configPassword && sessionStorage.getItem(UNLOCK_KEY) !== "1";
  }

  function renderConfigLock() {
    var locked = isConfigLocked();
    document.getElementById("configLockScreen").style.display = locked ? "flex" : "none";
    document.getElementById("configContent").style.display = locked ? "none" : "";
    document.getElementById("configUnlockError").textContent = "";
    var pwInput = document.getElementById("inputConfigPasswordAttempt");
    if (pwInput) pwInput.value = "";
  }

  // ---------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------
  function renderRegistrationSettings() {
    var r = state.registration;
    document.getElementById("inputRegInfo").value = r.infoText || "";
    document.getElementById("inputRegFee").value = r.fee || "";
    document.getElementById("inputRegPix").value = r.pix || "";
    document.getElementById("inputRegWhatsapp").value = r.whatsapp || "";
    document.getElementById("inputRegStartTime").value = r.startTime || "";
    document.getElementById("inputRegSlots").value = r.totalSlots || 16;
  }

  function renderRegistrationPublic() {
    var r = state.registration;
    document.getElementById("regPublicTitle").textContent =
      (state.name || "Torneio de Sinuca") + " - Inscrições";
    document.getElementById("regInfoDisplay").textContent = r.infoText || "";
    document.getElementById("regFeeDisplay").textContent = r.fee || "a combinar";
    document.getElementById("regPixDisplay").textContent = r.pix || "a combinar";

    var startTime = r.startTime || "o horário combinado";
    var legend = document.querySelector(".reg-fieldset legend");
    if (legend) legend.textContent = "A dupla conseguirá jogar às " + startTime + "? *";

    var total = r.totalSlots || 16;
    var filled = r.submissions.length;
    document.getElementById("regSlotsCounter").textContent = filled + " / " + total + " vagas preenchidas";
  }

  function renderRegistrationSubmissions() {
    var list = document.getElementById("regSubmissionsList");
    var empty = document.getElementById("regEmptyState");
    var submissions = state.registration.submissions;

    empty.style.display = submissions.length ? "none" : "";

    var existingDuplaNames = state.duplas.map(function (d) { return d.name.trim().toLowerCase(); });
    var canAddMore = state.duplas.length < MAX_DUPLAS;

    list.innerHTML = submissions.map(function (s) {
      var already = existingDuplaNames.indexOf(s.duplaName.trim().toLowerCase()) !== -1;
      var disabled = already || !canAddMore;
      var btnLabel = already ? "Já no chaveamento" : "Adicionar ao chaveamento";
      var horario = s.canPlay === "sim" ? "Sim" : ("Outro: " + escapeHtml(s.canPlayOther || ""));
      return '<tr>' +
        '<td>' + escapeHtml(s.duplaName) + '</td>' +
        '<td>' + escapeHtml(s.playerNames) + '</td>' +
        '<td>' + escapeHtml(s.courses) + '</td>' +
        '<td>' + escapeHtml(s.instagram) + '</td>' +
        '<td>' + horario + '</td>' +
        '<td><button type="button" class="btn-add-bracket" data-id="' + s.id + '"' + (disabled ? " disabled" : "") + '>' + btnLabel + '</button></td>' +
        '</tr>';
    }).join("");
  }

  function buildWhatsappMessage(entry, r) {
    var lines = [
      "Inscrição - " + (state.name || "Torneio de Sinuca"),
      "Dupla: " + entry.duplaName,
      "Jogadores: " + entry.playerNames,
      "Curso: " + entry.courses,
      "Instagram: " + entry.instagram,
      "Consegue jogar às " + (r.startTime || "o horário combinado") + "? " +
        (entry.canPlay === "sim" ? "Sim" : "Outro: " + entry.canPlayOther)
    ];
    return lines.join("\n");
  }

  // ---------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------
  function switchTab(tabName) {
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });
    document.querySelectorAll(".tab-panel").forEach(function (panel) {
      panel.classList.toggle("active", panel.id === "tab-" + tabName);
    });
  }

  // ---------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------
  function readFileAsDataUrl(file, cb) {
    var reader = new FileReader();
    reader.onload = function (e) { cb(e.target.result); };
    reader.readAsDataURL(file);
  }

  document.addEventListener("DOMContentLoaded", function () {
    renderAll();

    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { switchTab(btn.dataset.tab); });
    });

    document.getElementById("inputTournamentName").addEventListener("input", function (e) {
      state.name = e.target.value; saveState(); renderHeader();
    });
    document.getElementById("inputTournamentDate").addEventListener("input", function (e) {
      state.date = e.target.value; saveState(); renderHeader();
    });
    document.getElementById("inputTournamentLocation").addEventListener("input", function (e) {
      state.location = e.target.value; saveState(); renderHeader();
    });

    document.getElementById("fileTournamentLogo").addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (!file) return;
      readFileAsDataUrl(file, function (dataUrl) {
        state.tournamentLogo = dataUrl; saveState(); renderHeader(); renderConfigForm();
      });
    });
    document.getElementById("btnClearTournamentLogo").addEventListener("click", function () {
      state.tournamentLogo = null; saveState(); renderHeader(); renderConfigForm();
      document.getElementById("fileTournamentLogo").value = "";
    });

    document.getElementById("fileA3fadLogo").addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (!file) return;
      readFileAsDataUrl(file, function (dataUrl) {
        state.a3fadLogo = dataUrl; saveState(); renderHeader(); renderConfigForm();
      });
    });
    document.getElementById("btnClearA3fadLogo").addEventListener("click", function () {
      state.a3fadLogo = null; saveState(); renderHeader(); renderConfigForm();
      document.getElementById("fileA3fadLogo").value = "";
    });

    document.getElementById("formAddDupla").addEventListener("submit", function (e) {
      e.preventDefault();
      var input = document.getElementById("inputDuplaName");
      var name = input.value.trim();
      if (!name) return;
      if (state.duplas.length >= MAX_DUPLAS) {
        alert("Limite máximo de " + MAX_DUPLAS + " duplas atingido.");
        return;
      }
      state.duplas.push({ id: uid(), name: name });
      input.value = "";
      saveState();
      renderDuplasList();
      input.focus();
    });

    document.getElementById("duplasList").addEventListener("click", function (e) {
      var btn = e.target.closest(".btn-remove");
      if (!btn) return;
      var id = btn.dataset.id;
      state.duplas = state.duplas.filter(function (d) { return d.id !== id; });
      saveState();
      renderDuplasList();
    });

    // ---- Registration settings ----
    function bindRegSetting(inputId, field, parse) {
      document.getElementById(inputId).addEventListener("input", function (e) {
        state.registration[field] = parse ? parse(e.target.value) : e.target.value;
        saveState();
        renderRegistrationPublic();
      });
    }
    bindRegSetting("inputRegInfo", "infoText");
    bindRegSetting("inputRegFee", "fee");
    bindRegSetting("inputRegPix", "pix");
    bindRegSetting("inputRegWhatsapp", "whatsapp");
    bindRegSetting("inputRegStartTime", "startTime");
    bindRegSetting("inputRegSlots", "totalSlots", function (v) {
      var n = parseInt(v, 10);
      return isNaN(n) ? 16 : Math.max(2, Math.min(MAX_DUPLAS, n));
    });

    // ---- Registration public form ----
    document.getElementById("formRegistration").addEventListener("submit", function (e) {
      e.preventDefault();
      var canPlayRadio = document.querySelector('input[name="regCanPlay"]:checked');
      if (!canPlayRadio) {
        alert("Selecione se a dupla consegue jogar no horário de início.");
        return;
      }
      var entry = {
        id: uid(),
        playerNames: document.getElementById("regPlayerNames").value.trim(),
        courses: document.getElementById("regCourses").value.trim(),
        duplaName: document.getElementById("regDuplaName").value.trim(),
        instagram: document.getElementById("regInstagram").value.trim(),
        canPlay: canPlayRadio.value,
        canPlayOther: document.getElementById("regCanPlayOther").value.trim(),
        ts: new Date().toISOString()
      };
      if (!entry.playerNames || !entry.courses || !entry.duplaName || !entry.instagram) {
        alert("Preencha todos os campos obrigatórios.");
        return;
      }

      state.registration.submissions.push(entry);
      saveState();
      renderRegistrationPublic();
      renderRegistrationSubmissions();

      var msg = buildWhatsappMessage(entry, state.registration);
      var phone = (state.registration.whatsapp || "").replace(/\D/g, "");
      if (phone) {
        window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(msg), "_blank");
      } else {
        alert("Inscrição registrada! (Configure o WhatsApp do responsável na aba de configuração de inscrições para gerar o envio automático.)\n\n" + msg);
      }

      e.target.reset();
    });

    document.getElementById("regSubmissionsList").addEventListener("click", function (e) {
      var btn = e.target.closest(".btn-add-bracket");
      if (!btn || btn.disabled) return;
      var id = btn.dataset.id;
      var entry = state.registration.submissions.find(function (s) { return s.id === id; });
      if (!entry) return;
      if (state.duplas.length >= MAX_DUPLAS) {
        alert("Limite máximo de " + MAX_DUPLAS + " duplas atingido.");
        return;
      }
      state.duplas.push({ id: uid(), name: entry.duplaName });
      saveState();
      renderDuplasList();
      renderRegistrationSubmissions();
    });

    // ---- Config lock screen ----
    document.getElementById("formConfigUnlock").addEventListener("submit", function (e) {
      e.preventDefault();
      var attempt = document.getElementById("inputConfigPasswordAttempt").value;
      if (attempt && attempt === state.configPassword) {
        sessionStorage.setItem(UNLOCK_KEY, "1");
        renderConfigLock();
      } else {
        document.getElementById("configUnlockError").textContent = "Senha incorreta.";
      }
    });

    document.getElementById("btnLockConfig").addEventListener("click", function () {
      sessionStorage.removeItem(UNLOCK_KEY);
      renderConfigLock();
    });

    document.getElementById("btnSaveConfigPassword").addEventListener("click", function () {
      var newPw = document.getElementById("inputNewConfigPassword").value;
      state.configPassword = newPw ? newPw : null;
      saveState();
      document.getElementById("inputNewConfigPassword").value = "";
      alert(newPw ? "Senha salva. Da próxima vez, a aba Configuração vai pedir essa senha." : "Senha removida. A aba Configuração ficará sem proteção.");
    });

    document.getElementById("btnSortear").addEventListener("click", function () {
      if (state.bracket) {
        if (!confirm("Já existe um chaveamento gerado. Sortear novamente vai apagar os resultados registrados. Continuar?")) return;
      }
      generateBracket();
    });

    document.getElementById("btnResortear").addEventListener("click", function () {
      if (!confirm("Isso vai gerar um novo sorteio e apagar os resultados registrados. Continuar?")) return;
      generateBracket();
    });

    document.getElementById("btnResetTournament").addEventListener("click", function () {
      if (!confirm("Isso vai apagar o nome, data, local, logo do torneio, duplas e chaveamento (o logo A3FAD e a senha de configuração são mantidos). Continuar?")) return;
      var keepA3fad = state.a3fadLogo;
      var keepPassword = state.configPassword;
      state = defaultState();
      state.a3fadLogo = keepA3fad;
      state.configPassword = keepPassword;
      saveState();
      renderAll();
    });

    document.getElementById("btnExportPdf").addEventListener("click", function () {
      if (!state.bracket) {
        alert("Gere o chaveamento antes de exportar.");
        return;
      }
      window.print();
    });

    document.getElementById("bracketContainer").addEventListener("click", function (e) {
      var slot = e.target.closest(".match-slot");
      if (!slot || slot.classList.contains("slot-disabled")) return;
      var box = slot.closest(".match-box");
      var roundKey = box.dataset.round;
      var index = parseInt(box.dataset.index, 10);
      var side = slot.dataset.side;
      setWinner(roundKey, index, side);
    });
  });
})();
