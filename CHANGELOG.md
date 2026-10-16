# Changelog

Formato basato su [Keep a Changelog](https://keepachangelog.com/it/1.1.0/).

## [0.2.0] - 2026-10-16

### Aggiunto
- Icone Nerd Font per tipo di file: cartelle gialle (aperte o chiuse, al posto delle frecce `▸`/`▾`), file riconosciuti per nome (`package.json`, `composer.json`, `Dockerfile`, `.gitignore`, `.env*`) e per estensione, con un colore per famiglia; icona di default per gli altri.
- Guide ad albero (`├─`, `└─`, `│`) che rendono evidente l'indentazione, 3 colonne per livello.
- Doppio clic su una cartella (entro 400 ms): la riporta com'era e apre Esplora risorse in quella posizione (solo Windows; se non riesce compare un avviso).
- Clic su un file: inserisce `@percorso` nel prompt.
- Clic su un agente: apre il suo transcript nella vista principale (sul principale, la conversazione principale).

### Modificato
- Padding di 1 attorno al pannello: larghezza e righe utili sono quelle del corpo meno 2.
- Divisione 80% albero / 20% agenti (prima 70/30).
- Richiede un Nerd Font nel terminale (vedi README).

## [0.1.0] - 2026-10-15

### Aggiunto
- Pannello laterale `info-panel`, diviso 70% sopra e 30% sotto.
- Albero della cartella di lavoro: clic su una cartella per aprirla o chiuderla, `.git` e `node_modules` nascosti, cartelle prima dei file in ordine alfabetico, scorrimento con la rotella e pulsante `↻` per rileggere.
- Elenco degli agenti (principale e sub-agenti) con icona di stato, spinner animato per quelli attivi e nome del modello, ricavato dall'hook `turn.step`.
- Comando `/info-panel` per riaprire il pannello.
- Test con `claude plugin test` e marketplace `mavida-info-panel` per l'installazione da cartella.
