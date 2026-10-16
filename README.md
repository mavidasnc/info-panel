# info-panel

Mod per Claude Code che apre un pannello a lato del transcript, diviso in due sezioni:

- **In alto (circa 80%)**: l'albero della cartella di lavoro, con le guide `├─`, `└─` e `│` che mostrano
  l'indentazione e un'icona per tipo di file (cartelle gialle, file colorati per famiglia: PHP, JavaScript,
  TypeScript, JSON, Markdown, immagini, archivi e così via).
  Le cartelle vengono prima dei file, tutto in ordine alfabetico; `.git` e `node_modules` non compaiono.
  Il pulsante `↻` nell'intestazione rilegge le cartelle aperte, che si riallineano da sole anche a fine turno.
  La rotella del mouse sopra l'albero lo scorre.
  - Un clic su una cartella la apre o la chiude.
  - Un doppio clic (secondo clic entro 400 ms) riporta la cartella com'era e apre Esplora risorse in quella
    posizione. Funziona solo su Windows; se l'apertura non riesce compare un avviso.
  - Un clic su un file inserisce `@percorso` nel prompt, alla posizione del cursore.
- **In basso (circa 20%)**: l'agente principale e i sub-agenti della sessione, ognuno con l'icona di stato
  (spinner animato se lavora, `✓` concluso, `✗` fallito o fermato, `◌` a riposo) e il modello su cui lavora
  (per esempio `sonnet-5-5`). I sub-agenti attivi stanno in cima, quelli conclusi sono in grigio.
  Se non ci stanno tutti compare `+n altri`. Un clic su un agente apre il suo transcript nella vista
  principale; un clic su `principale` torna alla conversazione principale.

Attorno al pannello c'è 1 riga e 1 colonna di padding.

Il modello di ogni agente si ricava dalle richieste al modello (hook `turn.step`), perché l'elenco degli agenti
non lo riporta; finché un agente non ha fatto una richiesta mostra `n/d`.

## Requisito: un Nerd Font nel terminale

Le icone sono glifi Nerd Font, che il terminale disegna solo se il suo font li contiene: senza, al posto delle icone
compaiono dei quadratini. Il mod non installa font e non tocca la configurazione del terminale.
Per Tabby su Windows:

1. Scarica `CascadiaCode.zip` da [nerdfonts.com](https://www.nerdfonts.com/font-downloads).
2. Estrai lo zip e installa i file `.ttf` (clic destro, Installa per tutti gli utenti), in particolare
   "CaskaydiaCove Nerd Font Mono".
3. In Tabby apri Impostazioni, poi Aspetto, poi Font, e scegli "CaskaydiaCove Nerd Font Mono".
4. Riavvia Tabby se il font non compare, poi `/reload-plugins` in Claude Code.

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
