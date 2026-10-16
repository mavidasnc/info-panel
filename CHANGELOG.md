# Changelog

Formato basato su [Keep a Changelog](https://keepachangelog.com/it/1.1.0/).

## [0.4.0] - 2026-10-16

### Aggiunto
- La versione del mod (`info-panel vX.Y.Z`, letta da `plugin.json`) in fondo al pannello, in grigio: conferma che l'aggiornamento è andato a buon fine. Se il file non è leggibile mostra `n/d`.
- Valore di stato `version` nel contratto dei tipi.
- Screenshot illustrativo in `docs/info-panel.png`, richiamato dal README.

### Modificato
- `/info-panel` ora alterna: chiude il pannello se è disegnato, lo apre altrimenti (anche se era in attesa di un terminale più largo). Prima lo riapriva soltanto.
- Il pannello riserva una riga alla versione: albero e agenti dividono una riga utile in meno.
- Il README descrive l'installazione da GitHub (`/plugin install info-panel --marketplace mavidasnc/info-panel`) e l'aggiornamento. Il repository è pubblico.

## [0.3.1] - 2026-10-16

### Corretto
- Esplora risorse non si apriva: `explorer.exe` lanciato direttamente non dava alcun segnale. Il pulsante `↗` ora mostra un toast di conferma («Apro Esplora risorse: percorso») e apre la cartella con `cmd /c start`; se l'exit code non è 0 il toast d'errore riporta il codice e l'inizio dell'errore.
- Il percorso passato a Esplora risorse usa sempre `\` e non ha il `\` finale; se lo stato `cwd` è ancora vuoto parte da `$.session.cwd()`.

## [0.3.0] - 2026-10-16

### Aggiunto
- Opzione `icons` con tre set: `emoji` (predefinito, nessun font da installare), `nerd` (la tabella della 0.2.0) e `simple` (simboli Unicode colorati: `▪`/`▫` per le cartelle, `●` per i file). Un valore sconosciuto vale `emoji`.
- Pulsante `↗` su ogni riga cartella: apre Esplora risorse sulla cartella (solo Windows; il toast di errore ora dice anche il motivo).
- Pulsante `→` su ogni riga cartella: imposta la cartella come cartella di lavoro della sessione con il comando integrato `/cd`.
- Pulsante `↑` nell'intestazione: sposta la cartella di lavoro sulla cartella padre; alla radice di un'unità non fa nulla e lo segnala.
- Sincronizzazione con la cartella di lavoro: ogni secondo il mod controlla se è cambiata (anche con un `/cd` digitato a mano) e in tal caso chiude l'albero, lo riporta in cima e rilegge la radice.
- Valore di stato `cwd` nel contratto dei tipi.

### Modificato
- Le icone hanno una larghezza in colonne (2 per le emoji, 1 per gli altri set) che entra nel calcolo dei troncamenti: nessuna riga supera la larghezza utile, anche con i tre pulsanti sulle cartelle. Sulle righe troppo strette le azioni `↗` e `→` si nascondono.
- I pulsanti dell'intestazione sono in grigio attenuato.
- Il Nerd Font non è più un requisito (resta come opzione `nerd`).

### Rimosso
- Il doppio clic su una cartella: il motore assorbe con ogni probabilità il secondo clic, quindi non era affidabile; lo sostituisce il pulsante `↗`.

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
