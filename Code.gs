/**
 * NORMATIV I7-2011 — Backend gratuit pentru chatbot (Google Apps Script)
 * ------------------------------------------------------------------
 * Rolul acestui script: primește de la widget-ul de pe site
 * (1) întrebarea utilizatorului și (2) fragmentele relevante din normativ
 * (găsite deja în browser, ca să nu trimitem tot documentul de 474 pagini),
 * le trimite la Gemini (gratuit) și returnează răspunsul.
 *
 * De ce e nevoie de acest script și nu apelăm Gemini direct din browser?
 * Pentru că altfel cheia API ar fi vizibilă oricui deschide codul sursă al
 * paginii, iar cineva ar putea să ți-o folosească și să-ți consume cota
 * gratuită zilnică. Acest script ține cheia ascunsă, pe serverul Google.
 *
 * ====================== INSTALARE (5 minute) ======================
 * 1. Mergi pe https://aistudio.google.com/apikey și generează o cheie API
 *    gratuită (nu cere card).
 * 2. Mergi pe https://script.google.com → New project.
 * 3. Șterge codul din Code.gs implicit și lipește tot acest fișier.
 * 4. Meniul din stânga → Project Settings → Script Properties → Add
 *    script property: nume "GEMINI_API_KEY", valoare = cheia ta de la pasul 1.
 * 5. Deploy → New deployment → tip "Web app".
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 6. Copiază URL-ul generat (se termină în /exec) — acesta e URL-ul pe
 *    care îl pui în chatbot-widget.js, la APPS_SCRIPT_URL.
 * ====================================================================
 */

const MODEL = 'gemini-2.5-flash-lite'; // cel mai generos tier gratuit

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const question = (body.question || '').toString().trim();
    const context = (body.context || '').toString();

    if (!question) {
      return jsonResponse({ error: 'Lipsește întrebarea.' });
    }

    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) {
      return jsonResponse({ error: 'Cheia GEMINI_API_KEY nu este configurată în Script Properties.' });
    }

    const systemInstruction = [
      'Ești un asistent tehnic specializat EXCLUSIV pe normativul românesc I7-2011',
      '(instalații electrice pentru clădiri). Răspunzi DOAR pe baza fragmentelor din',
      'normativ furnizate mai jos, în limba română, clar și tehnic.',
      '',
      'Reguli obligatorii:',
      '1. Citează articolul relevant exact așa cum apare (ex: "conform art. 5.4.22").',
      '2. Dacă fragmentele furnizate nu conțin informația cerută, spune clar că',
      '   informația nu se regăsește în fragmentele disponibile din normativ și',
      '   recomandă consultarea directă a documentului sau a unui electrician autorizat.',
      '3. NU inventa niciodată valori, cote sau cifre care nu apar în text.',
      '4. Dacă în fragmentele furnizate apare o mențiune de tipul "fig. X.Y" sau',
      '   "Figura X.Y" relevantă pentru răspuns, adaugă în răspuns exact tokenul',
      '   [FIG:X.Y] (fără alte cuvinte în interiorul parantezelor) — interfața va',
      '   afișa automat imaginea figurii respective.',
      '5. Nu oferi consultanță care înlocuiește un proiectant/electrician autorizat;',
      '   menționează, dacă e cazul, că lucrările electrice trebuie executate de',
      '   personal calificat și verificate de un proiectant autorizat ISU/ANRE.',
      '',
      '=== FRAGMENTE RELEVANTE DIN NORMATIVUL I7-2011 ===',
      context,
      '=== SFÂRȘIT FRAGMENTE ==='
    ].join('\n');

    const payload = {
      contents: [
        { role: 'user', parts: [{ text: question }] }
      ],
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1200
      }
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const status = response.getResponseCode();
    const data = JSON.parse(response.getContentText());

    if (status !== 200) {
      const msg = (data.error && data.error.message) || 'Eroare necunoscută de la Gemini.';
      // 429 = am atins limita gratuită zilnică/pe minut
      return jsonResponse({ error: msg, retry: status === 429 });
    }

    const answer = data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts.map(p => p.text || '').join('');

    return jsonResponse({ answer: answer || 'Nu am putut genera un răspuns.' });

  } catch (err) {
    return jsonResponse({ error: 'Eroare server: ' + err.message });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Necesar pentru ca fetch() din browser (CORS) să funcționeze cu Apps Script
function doGet(e) {
  return jsonResponse({ status: 'ok', info: 'Acest endpoint acceptă doar POST.' });
}
