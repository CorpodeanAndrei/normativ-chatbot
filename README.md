# Asistent AI pentru normativul I7-2011 — instalare completă

## Ce conține acest pachet

```
chatbot-widget.js     → widget-ul de chat (îl pui pe site-ul din Hostinger)
Code.gs                → backend gratuit (îl pui în Google Apps Script)
demo.html               → exemplu de pagină cu widget-ul instalat
data/
  normativ_chunks.json  → tot textul normativului, curățat și împărțit pe articole
  figures_index.json    → indexul figurilor (numărul figurii → numele imaginii)
  figures/               → 66 de pagini din normativ, extrase ca imagini (acolo unde sunt figuri/scheme)
```

Am extras deja tot conținutul din PDF-ul `NORMATIV_I7_2011_actualizat.pdf` pe
care mi l-ai trimis (474 pagini, peste 1700 de articole numerotate). Nu mai
trebuie să faci nimic la acest pas — datele sunt gata.

## Cum funcționează (pe scurt)

1. Vizitatorul scrie o întrebare în widget.
2. Widget-ul caută **în browser**, gratuit, în cele ~1700 de articole ale
   normativului, pe cele mai relevante 8 fragmente pentru întrebarea lui.
3. Trimite doar acele fragmente + întrebarea către un mic script Google
   (Apps Script, gratuit), care le trimite mai departe la Gemini (tot gratuit)
   și primește răspunsul.
4. Dacă răspunsul se referă la o figură din normativ, widget-ul afișează
   automat și imaginea paginii respective.

Nimic din acest lanț nu costă bani, în limitele zilnice gratuite ale Gemini
(suficiente pentru un site cu trafic mic-mediu).

## Pasul 1 — Cheia API Gemini (gratuită)

1. Intră pe **https://aistudio.google.com/apikey**
2. Autentifică-te cu un cont Google, apasă **Create API key**
3. Nu ai nevoie de card de credit. Copiază cheia generată — o vei folosi la pasul 2.

## Pasul 2 — Backend-ul (Google Apps Script, gratuit)

1. Intră pe **https://script.google.com** → **New project**
2. Șterge codul din `Code.gs` care apare implicit
3. Deschide fișierul `Code.gs` din acest pachet, copiază tot conținutul și
   lipește-l în editorul Apps Script
4. Din meniul din stânga: **Project Settings** → derulează la
   **Script Properties** → **Add script property**
   - Property: `GEMINI_API_KEY`
   - Value: cheia copiată la pasul 1
5. Sus dreapta: **Deploy** → **New deployment**
   - Select type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Apasă **Deploy**
6. Copiază URL-ul afișat (arată cam așa: `https://script.google.com/macros/s/AKfycb.../exec`)
   — acesta e URL-ul backend-ului tău.

## Pasul 3 — Configurează widget-ul

1. Deschide `chatbot-widget.js` cu un editor de text
2. La început, găsești:
   ```js
   var APPS_SCRIPT_URL = 'PUNE_AICI_URL_APPS_SCRIPT/exec';
   ```
   Înlocuiește cu URL-ul copiat la pasul 2.6.
3. Dacă vrei să pui folderul `data/` în alt loc pe site, actualizează și:
   ```js
   var DATA_BASE_URL = 'data';
   ```

## Pasul 4 — Urcă fișierele pe Hostinger

1. Intră în **hPanel Hostinger** → **File Manager** (sau folosește FTP)
2. Mergi în folderul site-ului (de obicei `public_html`)
3. Urcă acolo:
   - `chatbot-widget.js`
   - folderul `data/` (cu `normativ_chunks.json`, `figures_index.json` și
     subfolderul `figures/`) — merge pe orice plan Hostinger, inclusiv shared,
     pentru că sunt doar fișiere statice
4. Pe orice pagină HTML unde vrei să apară chatbot-ul, adaugă chiar înainte
   de `</body>`:
   ```html
   <script src="chatbot-widget.js"></script>
   ```
   (dacă site-ul e făcut cu un builder ca WordPress/Elementor, caută opțiunea
   „Custom HTML" sau „Insert script in footer" și pune acolo aceeași linie)

Gata — un buton rotund cu fulger apare în colțul din dreapta jos al paginii.

## Testează exemplele tale

- *„La ce înălțime se montează un întrerupător?"* → widget-ul va găsi
  articolul relevant (ex. 5.4.22) și va cita normativul.
- *„La ce tensiune poate funcționa un cablu de 2,5 mm?"* → widget-ul caută
  articolele care menționează exact „2,5" și secțiunea de cablu.

## Limitări importante — te rog citește

**Căutarea este bazată pe cuvinte-cheie, nu pe înțelegere semantică.**
Fiindcă soluția e complet gratuită, nu folosim o bază de date vectorială
(care ar costa bani sau ar necesita mai multă infrastructură). Pentru
majoritatea întrebărilor tehnice directe (cu numere, articole, termeni
exacți din normativ) funcționează bine. Pentru întrebări foarte generale
sau formulate diferit față de limbajul normativului, răspunsul poate fi
mai puțin precis. Dacă observi asta des, cea mai simplă îmbunătățire este
să adaugi un rând în prompt-ul din `Code.gs` care să spună explicit
utilizatorului să reformuleze cu termeni tehnici.

**Figurile detectate automat:** am extras 66 de pagini care conțin figuri
(identificate prin mențiunile „Fig. X.Y" din text). Documentul are și
anexe cu scheme care nu sunt etichetate explicit ca „Fig." — pe acestea nu
le-am putut indexa automat. Dacă vrei, pot extrage manual și acele pagini,
spune-mi la ce capitole/anexe te referi.

**Limita gratuită Gemini:** modelul folosit (`gemini-2.5-flash-lite`) are
în jur de 1.000 cereri/zi gratuit — mai mult decât suficient pentru un site
cu trafic redus-mediu. Dacă vreodată se depășește limita zilnică, widget-ul
arată automat un mesaj de „încearcă din nou peste un minut" în loc să dea eroare urâtă.

**Notă legală:** răspunsurile chatbot-ului nu înlocuiesc un proiectant sau
electrician autorizat — normativul I7-2011 are valoare de reglementare
tehnică oficială, iar lucrările electrice trebuie verificate de personal
calificat. Am adăugat deja o mențiune în acest sens în prompt-ul din
`Code.gs`, dar merită să fie vizibilă și pe pagina site-ului.

## Ce poți schimba ușor

- **Culorile widget-ului**: sunt în `chatbot-widget.js`, la secțiunea `css`
  (caută `#1b2b3a` = bleumarin închis și `#e8b34c` = auriu/aramă).
- **Textul de bun venit**: caută în `chatbot-widget.js` linia care începe
  cu `'Bună! Întreabă-mă orice...'`.
- **Numărul de fragmente trimise la AI** (implicit 8): caută `search(question, 8)`
  în `chatbot-widget.js` — mai multe fragmente = răspunsuri mai complete dar
  mai lente; mai puține = mai rapid dar risc să lipsească context.
