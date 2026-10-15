# Changelog

Formato basato su [Keep a Changelog](https://keepachangelog.com/it/1.1.0/).

## [0.1.0] - 2026-10-15

### Aggiunto
- Pannello laterale `info-panel`, diviso 70% sopra e 30% sotto.
- Albero della cartella di lavoro: clic su una cartella per aprirla o chiuderla, `.git` e `node_modules` nascosti, cartelle prima dei file in ordine alfabetico, scorrimento con la rotella e pulsante `↻` per rileggere.
- Elenco degli agenti (principale e sub-agenti) con icona di stato, spinner animato per quelli attivi e nome del modello, ricavato dall'hook `turn.step`.
- Comando `/info-panel` per riaprire il pannello.
- Test con `claude plugin test` e marketplace `mavida-info-panel` per l'installazione da cartella.
