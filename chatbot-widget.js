(function () {
  'use strict';

  // ====================== CONFIGURARE ======================
  // 1. Pune aici URL-ul Apps Script-ului tău (Deploy > Web app > copiază URL-ul cu /exec)
  var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz7zOEbvoPe1h3n0HxvgMnYQTf6YGIRccUJbFdkw8jf6eitzFwAXIX9jhC1frEk30kt/exec';
  // 2. Pune aici folderul unde ai urcat pe Hostinger fișierele "data/" (chunks + figuri)
  var DATA_BASE_URL = 'https://corpodeanandrei.github.io/normativ-chatbot/data';
  // ===========================================================

  var STOPWORDS = ('sa se si la in cu de pe din care este sunt un o al a ai le lor pentru mai daca fi nu ca ' +
    'sau ori pana catre spre fara dar insa deci apoi acest aceasta acesta acele acei asta atat').split(' ');

  var state = { chunks: null, loading: false, figuresIndex: null, open: false, history: [] };
  var MAX_HISTORY_TURNS = 3; // câte schimburi anterioare ținem minte

  // Unele site-uri (builder-e no-code) randează elementul "Embed code" într-un
  // iframe izolat. Dacă e cazul, "position: fixed" rămâne prins în acel iframe
  // mic, în loc de tot ecranul. Încercăm să atașăm widget-ul direct la pagina
  // principală (window.top), care funcționează dacă iframe-ul e pe același
  // domeniu; altfel, cădem înapoi pe documentul curent.
  var doc = document;
  try {
    if (window.top && window.top !== window && window.top.document) {
      // testăm accesul (aruncă eroare dacă e cross-origin)
      void window.top.document.body;
      doc = window.top.document;
    }
  } catch (e) {
    doc = document;
  }

  function stripAccents(s) {
    s = s.toLowerCase();
    var map = { 'ă': 'a', 'â': 'a', 'î': 'i', 'ș': 's', 'ş': 's', 'ț': 't', 'ţ': 't' };
    return s.replace(/[ăâîșşțţ]/g, function (c) { return map[c]; });
  }

  // Coduri tehnice scurte (2-3 litere) care NU trebuie filtrate ca fiind
  // "prea comune", chiar dacă sunt scurte — sunt esențiale în normativ.
  var TECH_WHITELIST = ['tn', 'tt', 'it', 'pe', 'pen', 'ddr', 'rcd', 'sr', 'hd'];

  function tokenize(str) {
    var s = stripAccents(str);
    var nums = {};
    var numMatches = s.replace(/,/g, '.').match(/\d+\.\d+|\d+/g) || [];
    numMatches.forEach(function (n) { nums[n] = true; });

    // Coduri tehnice: secvențe de litere/cifre unite prin cratimă (ex: TN-C-S, TN-S)
    // — le păstrăm ca literă unită ("tncs") ȘI ca literă originală fără cratimă unită.
    var techCodes = {};
    var techMatches = s.match(/\b[a-z]{1,4}(?:-[a-z0-9]{1,4}){1,3}\b/g) || [];
    techMatches.forEach(function (t) {
      techCodes[t] = true;
      techCodes[t.replace(/-/g, '')] = true;
    });

    var words = (s.match(/[a-z]+/g) || [])
      .filter(function (w) {
        if (TECH_WHITELIST.indexOf(w) !== -1) return true;
        return w.length > 2 && STOPWORDS.indexOf(w) === -1;
      })
      .map(function (w) { return w.length <= 4 ? w : w.slice(0, 5); });

    return { nums: nums, words: words, techCodes: techCodes };
  }

  function ensureData() {
    if (state.chunks) return Promise.resolve();
    if (state.loading) return state.loading;
    state.loading = Promise.all([
      fetch(DATA_BASE_URL + '/normativ_chunks.json').then(function (r) { return r.json(); }),
      fetch(DATA_BASE_URL + '/figures_index.json').then(function (r) { return r.json(); })
    ]).then(function (res) {
      state.chunks = res[0];
      state.figuresIndex = res[1];
      state.chunks.forEach(function (c) {
        var t = tokenize(c.text);
        c._nums = t.nums;
        c._techCodes = t.techCodes;
        c._wordSet = {};
        t.words.forEach(function (w) { c._wordSet[w] = true; });
      });
    });
    return state.loading;
  }

  // Dacă întrebarea cere explicit o figură/schemă/imagine (fără alt termen
  // tehnic clar), preferăm fragmente care chiar conțin o mențiune "Fig."
  var FIGURE_REQUEST_WORDS = ['poza', 'poze', 'imagine', 'imagini', 'figura', 'figuri',
    'schema', 'scheme', 'schita', 'desen', 'desene', 'atasa', 'ataseze'];

  function search(query, topN) {
    var q = tokenize(query);
    var scored = [];
    var wantsFigure = false;
    var qStr = stripAccents(query);
    FIGURE_REQUEST_WORDS.forEach(function (w) { if (qStr.indexOf(w) !== -1) wantsFigure = true; });

    for (var i = 0; i < state.chunks.length; i++) {
      var c = state.chunks[i];
      var score = 0;
      q.words.forEach(function (w) { if (c._wordSet[w]) score += 1; });
      Object.keys(q.nums).forEach(function (n) { if (c._nums[n]) score += 3; });
      Object.keys(q.techCodes).forEach(function (t) { if (c._techCodes[t]) score += 8; });
      if (wantsFigure && /Fig\.\s*\d/.test(c.text)) score += 2;
      if (score > 0) scored.push({ score: score, chunk: c });
    }
    scored.sort(function (a, b) { return b.score - a.score; });
    var result = scored.slice(0, topN || 8).map(function (s) { return s.chunk; });

    // Fallback: dacă întrebarea e generică despre o figură și nu s-a găsit
    // nimic prin scor, alegem direct câteva fragmente care conțin figuri.
    if (wantsFigure && result.length === 0) {
      result = state.chunks.filter(function (c) { return /Fig\.\s*\d/.test(c.text); }).slice(0, 5);
    }
    return result;
  }

  function buildContext(chunks) {
    return chunks.map(function (c) {
      return 'Art. ' + c.article + (c.chapter ? ' (' + c.chapter + ')' : '') + ':\n' + c.text;
    }).join('\n\n---\n\n');
  }

  function extractFigureTokens(answer) {
    var re = /\[FIG:([0-9]+(?:\.[0-9]+)+)\]/g;
    var found = [];
    var m;
    while ((m = re.exec(answer)) !== null) found.push(m[1]);
    return found;
  }

  function stripFigureTokens(answer) {
    return answer.replace(/\[FIG:[0-9.]+\]/g, '').trim();
  }

  // ====================== UI ======================
  var css = '' +
    '.niw-bubble{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;' +
    'background:#1b2b3a;color:#e8b34c;border:none;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.25);' +
    'z-index:999998;font-size:26px;display:flex;align-items:center;justify-content:center;}' +
    '.niw-panel{position:fixed;bottom:88px;right:20px;width:360px;max-width:92vw;height:520px;max-height:78vh;' +
    'background:#f6f4ef;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.3);display:flex;flex-direction:column;' +
    'overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;z-index:999999;}' +
    '.niw-head{background:#1b2b3a;color:#f6f4ef;padding:14px 16px;display:flex;flex-direction:column;gap:2px;}' +
    '.niw-head strong{font-size:14px;font-weight:600;}' +
    '.niw-head span{font-size:11px;color:#9db2c4;}' +
    '.niw-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:' +
    'repeating-linear-gradient(0deg,#f6f4ef,#f6f4ef 27px,#eae6da 28px);}' +
    '.niw-msg{max-width:88%;padding:9px 12px;border-radius:8px;font-size:13.5px;line-height:1.5;white-space:pre-wrap;}' +
    '.niw-msg.user{align-self:flex-end;background:#e8b34c;color:#2a1f08;border-bottom-right-radius:2px;}' +
    '.niw-msg.bot{align-self:flex-start;background:#ffffff;color:#1b2b3a;border:1px solid #d8d2c2;border-bottom-left-radius:2px;}' +
    '.niw-msg.bot .niw-art{font-family:"Courier New",monospace;background:#eef1f4;color:#1b2b3a;' +
    'padding:1px 5px;border-radius:3px;font-size:12px;}' +
    '.niw-fig{max-width:100%;border-radius:6px;border:1px solid #d8d2c2;margin-top:6px;display:block;}' +
    '.niw-figcap{font-size:11px;color:#6b6455;margin-top:3px;}' +
    '.niw-inputrow{display:flex;gap:8px;padding:10px;border-top:1px solid #d8d2c2;background:#f6f4ef;}' +
    '.niw-inputrow input{flex:1;border:1px solid #c9c2ae;border-radius:6px;padding:9px 10px;font-size:13.5px;' +
    'background:#fff;color:#1b2b3a;}' +
    '.niw-inputrow input:focus{outline:2px solid #e8b34c;}' +
    '.niw-inputrow button{background:#1b2b3a;color:#e8b34c;border:none;border-radius:6px;padding:0 14px;' +
    'font-size:13px;font-weight:600;cursor:pointer;}' +
    '.niw-inputrow button:disabled{opacity:.5;cursor:default;}' +
    '.niw-typing{font-size:12px;color:#6b6455;align-self:flex-start;padding-left:4px;}' +
    '.niw-close{background:none;border:none;color:#f6f4ef;font-size:18px;cursor:pointer;position:absolute;' +
    'top:12px;right:12px;line-height:1;}';

  var styleTag = doc.createElement('style');
  styleTag.textContent = css;
  doc.head.appendChild(styleTag);

  var bubble = doc.createElement('button');
  bubble.className = 'niw-bubble';
  bubble.setAttribute('aria-label', 'Deschide asistentul normativ I7');
  bubble.textContent = '⚡';
  doc.body.appendChild(bubble);

  var panel = doc.createElement('div');
  panel.className = 'niw-panel';
  panel.style.display = 'none';
  panel.innerHTML =
    '<div class="niw-head" style="position:relative;">' +
    '<button class="niw-close" aria-label="Închide">×</button>' +
    '<strong>Asistent normativ I7-2011</strong>' +
    '<span>Instalații electrice · răspunsuri pe baza normativului</span>' +
    '</div>' +
    '<div class="niw-body" id="niw-body"></div>' +
    '<div class="niw-inputrow">' +
    '<input type="text" id="niw-input" placeholder="Ex: la ce înălțime se montează un întrerupător?" />' +
    '<button id="niw-send">Trimite</button>' +
    '</div>';
  doc.body.appendChild(panel);

  var bodyEl = panel.querySelector('#niw-body');
  var inputEl = panel.querySelector('#niw-input');
  var sendBtn = panel.querySelector('#niw-send');
  var closeBtn = panel.querySelector('.niw-close');

  function addMessage(role, text) {
    var div = doc.createElement('div');
    div.className = 'niw-msg ' + role;
    div.textContent = text;
    bodyEl.appendChild(div);
    bodyEl.scrollTop = bodyEl.scrollHeight;
    return div;
  }

  function addBotAnswer(answer) {
    var figureNums = extractFigureTokens(answer);
    var clean = stripFigureTokens(answer);
    var div = doc.createElement('div');
    div.className = 'niw-msg bot';
    div.textContent = clean;
    bodyEl.appendChild(div);

    figureNums.forEach(function (num) {
      var file = state.figuresIndex[num];
      if (!file) return;
      var img = doc.createElement('img');
      img.className = 'niw-fig';
      img.src = DATA_BASE_URL + '/figures/' + file;
      img.alt = 'Fig. ' + num;
      div.appendChild(img);
      var cap = doc.createElement('div');
      cap.className = 'niw-figcap';
      cap.textContent = 'Fig. ' + num + ' (normativ I7-2011)';
      div.appendChild(cap);
    });

    bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  function setLoading(isLoading) {
    sendBtn.disabled = isLoading;
    inputEl.disabled = isLoading;
    var existing = bodyEl.querySelector('.niw-typing');
    if (isLoading && !existing) {
      var t = doc.createElement('div');
      t.className = 'niw-typing';
      t.textContent = 'Caut în normativ…';
      bodyEl.appendChild(t);
      bodyEl.scrollTop = bodyEl.scrollHeight;
    } else if (!isLoading && existing) {
      existing.remove();
    }
  }

  function ask() {
    var question = inputEl.value.trim();
    if (!question) return;
    addMessage('user', question);
    inputEl.value = '';
    setLoading(true);

    ensureData().catch(function () {
      throw { stage: 'data' };
    }).then(function () {
      // Pentru căutare, folosim și ultima întrebare a utilizatorului (dacă există),
      // ca să prindem și întrebările de follow-up de tipul "dar de X?"
      var lastQ = state.history.length ? state.history[state.history.length - 1].question : '';
      var searchQuery = lastQ ? (lastQ + ' ' + question) : question;
      var relevant = search(searchQuery, 8);
      var context = buildContext(relevant);
      var historyText = state.history.map(function (h) {
        return 'Utilizator: ' + h.question + '\nAsistent: ' + h.answer;
      }).join('\n\n');

      return fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ question: question, context: context, history: historyText })
      }).catch(function () { throw { stage: 'backend' }; });
    }).then(function (r) { return r.json(); })
      .then(function (data) {
        setLoading(false);
        if (data.error) {
          addMessage('bot', data.retry
            ? 'Am atins limita gratuită de cereri pentru moment. Te rog încearcă din nou peste un minut.'
            : 'A apărut o eroare: ' + data.error);
          return;
        }
        addBotAnswer(data.answer);
        state.history.push({ question: question, answer: stripFigureTokens(data.answer) });
        if (state.history.length > MAX_HISTORY_TURNS) state.history.shift();
      })
      .catch(function (err) {
        setLoading(false);
        if (err && err.stage === 'data') {
          addMessage('bot', 'Nu am putut încărca datele normativului (verifică DATA_BASE_URL / folderul "data" de pe server).');
        } else if (err && err.stage === 'backend') {
          addMessage('bot', 'Nu am putut contacta backend-ul (Apps Script). Verifică APPS_SCRIPT_URL și deployment-ul.');
        } else {
          addMessage('bot', 'A apărut o eroare neașteptată: ' + (err && err.message ? err.message : 'necunoscută'));
        }
      });
  }

  sendBtn.addEventListener('click', ask);
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') ask();
  });

  bubble.addEventListener('click', function () {
    state.open = !state.open;
    panel.style.display = state.open ? 'flex' : 'none';
    if (state.open && bodyEl.children.length === 0) {
      addMessage('bot', 'Bună! Întreabă-mă orice despre normativul I7-2011 (instalații electrice pentru clădiri) — secțiuni de cabluri, montaj aparate, protecție la trăsnet și altele.');
      ensureData();
    }
  });
  closeBtn.addEventListener('click', function () {
    state.open = false;
    panel.style.display = 'none';
  });
})();
