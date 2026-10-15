# info-panel

Mod per Claude Code che apre un pannello a lato del transcript, diviso in due sezioni:

- **In alto (circa 70%)**: l'albero della cartella di lavoro. Un clic sul nome di una cartella la apre o la chiude.
  Le cartelle vengono prima dei file, tutto in ordine alfabetico; `.git` e `node_modules` non compaiono.
  Il pulsante `↻` nell'intestazione rilegge le cartelle aperte, che si riallineano da sole anche a fine turno.
  La rotella del mouse sopra l'albero lo scorre.
- **In basso (circa 30%)**: l'agente principale e i sub-agenti della sessione, ognuno con l'icona di stato
  (spinner animato se lavora, `✓` concluso, `✗` fallito o fermato, `◌` a riposo) e il modello su cui lavora
  (per esempio `sonnet-5-5`). I sub-agenti attivi stanno in cima, quelli conclusi sono in grigio.
  Se non ci stanno tutti compare `+n altri`.

Il modello di ogni agente si ricava dalle richieste al modello (hook `turn.step`), perché l'elenco degli agenti
non lo riporta; finché un agente non ha fatto una richiesta mostra `n/d`.

## Comandi

- `/info-panel`: riapre il pannello (a qualsiasi larghezza del terminale, perché parte da un'azione della persona).

All'avvio della sessione il pannello si apre da solo solo se il terminale è abbastanza largo
(almeno 144 colonne in fullscreen); altrimenti resta in attesa o si apre con `/info-panel`.

## Installazione

Serve Claude Code 2.1.300 o successivo, da terminale, con il layout fullscreen per avere il pannello a lato.

```
claude plugin marketplace add <percorso>/info-panel
claude plugin install info-panel@mavida-info-panel
```

Il marketplace è la cartella stessa: le modifiche si applicano con `/reload-plugins`, senza nuove versioni.

## Sviluppo

```
claude plugin validate .
claude plugin test .
claude --plugin-dir <percorso>/info-panel
```

La struttura segue le convenzioni dei mod: `hooks/register.tsx` contiene la logica,
`types/index.d.ts` il contratto dello stato, `hooks/register.test.ts` i test.
Le modifiche sono elencate in [CHANGELOG.md](CHANGELOG.md).
