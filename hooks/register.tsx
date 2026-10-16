import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRow, TreeEntry } from '../types'

// Id del pane e sua larghezza richiesta (in colonne) quando è agganciato a lato
const PANE = 'info-panel'
const PANE_COLUMNS = 40

// Cartelle che l'albero non mostra mai
const HIDDEN = ['.git', 'node_modules']

// Fotogrammi dello spinner degli agenti attivi
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

// Stati in cui un agente sta lavorando (spinner animato)
const ACTIVE = ['running', 'pending', 'waiting']

// Set di icone selezionabili con l'opzione `icons`: emoji (nessun font), nerd (serve un Nerd Font), simple (simboli Unicode colorati)
export type IconSet = 'emoji' | 'nerd' | 'simple'

// Icona di una voce dell'albero: glifo, larghezza in colonne del terminale e colore (hex, perché i colori di tema non coprono queste tinte; le emoji non hanno colore)
export type Icon = { glyph: string; width: number; color?: string }

// Glifo e colore di una voce del set nerd: la larghezza (1) la aggiunge iconFor
type NerdIcon = { glyph: string; color: string }

// Cartelle: gialle, aperte o chiuse
const FOLDER: NerdIcon = { glyph: '\u{e5ff}', color: '#e5c07b' } // nf-custom-folder
const FOLDER_OPEN: NerdIcon = { glyph: '\u{e5fe}', color: '#e5c07b' } // nf-custom-folder_open

// File senza una voce più precisa
const FILE: NerdIcon = { glyph: '\u{f016}', color: '#7f848e' } // nf-fa-file_o

// Set simple: cartelle gialle (chiusa ▪, aperta ▫) e file ●, che prende il colore della famiglia dal set nerd
const SIMPLE_FOLDER = '▪'
const SIMPLE_FOLDER_OPEN = '▫'
const SIMPLE_FILE = '●'

// Set emoji: ogni glifo è un solo code point >= U+1F300 con Emoji_Presentation=Yes (niente variation selector),
// così il terminale lo disegna sempre largo 2 colonne
const EMOJI_FOLDER = '📁'
const EMOJI_FOLDER_OPEN = '📂'
const EMOJI_FILE = '📄'

// Emoji dei file: prima per nome esatto (minuscolo), poi per estensione (minuscola, con il punto)
export const EMOJIS: Record<string, string> = {
  // Nomi esatti (.env.local, .env.production... usano la voce di .env)
  'package.json': '📦',
  dockerfile: '🐳',
  '.gitignore': '🙈',
  '.gitattributes': '🙈',
  '.env': '🔧',
  // Estensioni
  '.php': '🐘',
  '.js': '🟨',
  '.mjs': '🟨',
  '.cjs': '🟨',
  '.ts': '🟦',
  '.tsx': '🔵',
  '.jsx': '🔵',
  '.json': '📋',
  '.md': '📝',
  '.html': '🌐',
  '.css': '🎨',
  '.scss': '🎨',
  '.sass': '🎨',
  '.py': '🐍',
  '.yml': '🔧',
  '.yaml': '🔧',
  '.toml': '🔧',
  '.ini': '🔧',
  '.conf': '🔧',
  '.png': '📷',
  '.jpg': '📷',
  '.jpeg': '📷',
  '.gif': '📷',
  '.webp': '📷',
  '.ico': '📷',
  '.svg': '📐',
  '.sh': '💻',
  '.bash': '💻',
  '.ps1': '💻',
  '.zip': '🧳',
  '.gz': '🧳',
  '.tar': '🧳',
  '.7z': '🧳',
  '.pdf': '📕',
  '.txt': '📃',
  '.log': '📃',
  '.sql': '💾',
  '.lock': '🔒',
}

// Icone dei file del set nerd: prima si cerca per nome esatto (minuscolo), poi per estensione (minuscola, con il punto)
const ICONS: Record<string, NerdIcon> = {
  // Nomi esatti (.env.local, .env.production... usano la voce di .env)
  'package.json': { glyph: '\u{e616}', color: '#cb3837' }, // nf-seti-npm
  'composer.json': { glyph: '\u{e783}', color: '#c0864b' }, // nf-dev-composer
  dockerfile: { glyph: '\u{e650}', color: '#2496ed' }, // nf-seti-docker
  '.gitignore': { glyph: '\u{e65d}', color: '#f1502f' }, // nf-seti-git
  '.gitattributes': { glyph: '\u{e65d}', color: '#f1502f' }, // nf-seti-git
  '.env': { glyph: '\u{f084}', color: '#d19a66' }, // nf-fa-key
  // Estensioni
  '.php': { glyph: '\u{e608}', color: '#a074c4' }, // nf-seti-php
  '.js': { glyph: '\u{e60c}', color: '#e5c07b' }, // nf-seti-javascript
  '.mjs': { glyph: '\u{e60c}', color: '#e5c07b' }, // nf-seti-javascript
  '.cjs': { glyph: '\u{e60c}', color: '#e5c07b' }, // nf-seti-javascript
  '.ts': { glyph: '\u{e628}', color: '#61afef' }, // nf-seti-typescript
  '.jsx': { glyph: '\u{e625}', color: '#56b6c2' }, // nf-seti-react
  '.tsx': { glyph: '\u{e625}', color: '#56b6c2' }, // nf-seti-react
  '.json': { glyph: '\u{e60b}', color: '#e5c07b' }, // nf-seti-json
  '.md': { glyph: '\u{e609}', color: '#dcdfe4' }, // nf-seti-markdown
  '.html': { glyph: '\u{e60e}', color: '#d19a66' }, // nf-seti-html
  '.css': { glyph: '\u{e614}', color: '#61afef' }, // nf-seti-css
  '.scss': { glyph: '\u{e603}', color: '#e06c9f' }, // nf-seti-sass
  '.sass': { glyph: '\u{e603}', color: '#e06c9f' }, // nf-seti-sass
  '.py': { glyph: '\u{e606}', color: '#61afef' }, // nf-seti-python
  '.yml': { glyph: '\u{e6a8}', color: '#e06c75' }, // nf-seti-yml
  '.yaml': { glyph: '\u{e6a8}', color: '#e06c75' }, // nf-seti-yml
  '.png': { glyph: '\u{e60d}', color: '#98c379' }, // nf-seti-image
  '.jpg': { glyph: '\u{e60d}', color: '#98c379' }, // nf-seti-image
  '.jpeg': { glyph: '\u{e60d}', color: '#98c379' }, // nf-seti-image
  '.gif': { glyph: '\u{e60d}', color: '#98c379' }, // nf-seti-image
  '.webp': { glyph: '\u{e60d}', color: '#98c379' }, // nf-seti-image
  '.ico': { glyph: '\u{e60d}', color: '#98c379' }, // nf-seti-image
  '.svg': { glyph: '\u{e698}', color: '#d19a66' }, // nf-seti-svg
  '.sh': { glyph: '\u{e691}', color: '#98c379' }, // nf-seti-shell
  '.bash': { glyph: '\u{e691}', color: '#98c379' }, // nf-seti-shell
  '.ps1': { glyph: '\u{e683}', color: '#61afef' }, // nf-seti-powershell
  '.zip': { glyph: '\u{e6aa}', color: '#c8a165' }, // nf-seti-zip
  '.gz': { glyph: '\u{e6aa}', color: '#c8a165' }, // nf-seti-zip
  '.tar': { glyph: '\u{e6aa}', color: '#c8a165' }, // nf-seti-zip
  '.7z': { glyph: '\u{e6aa}', color: '#c8a165' }, // nf-seti-zip
  '.pdf': { glyph: '\u{e67d}', color: '#e06c75' }, // nf-seti-pdf
  '.txt': { glyph: '\u{e64e}', color: '#7f848e' }, // nf-seti-text
  '.log': { glyph: '\u{e64e}', color: '#7f848e' }, // nf-seti-text
  '.sql': { glyph: '\u{e64d}', color: '#56b6c2' }, // nf-seti-db
  '.lock': { glyph: '\u{e672}', color: '#7f848e' }, // nf-seti-lock
  '.toml': { glyph: '\u{e615}', color: '#7f848e' }, // nf-seti-config
  '.ini': { glyph: '\u{e615}', color: '#7f848e' }, // nf-seti-config
  '.conf': { glyph: '\u{e615}', color: '#7f848e' }, // nf-seti-config
}

// Listing di una cartella già filtrati e ordinati, per percorso relativo ('' = radice)
const listings = atom({ plugin: 'info-panel', key: 'listings' } as const, {})

// Percorsi relativi delle cartelle aperte
const expanded = atom({ plugin: 'info-panel', key: 'expanded' } as const, [])

// Prima riga visibile dell'albero
const treeOffset = atom({ plugin: 'info-panel', key: 'treeOffset' } as const, 0)

// Ultima lettura di $.agent.list()
const agents = atom({ plugin: 'info-panel', key: 'agents' } as const, [])

// Modello in uso per agente (agentId -> modello), chiave 'main' per l'agente principale
const models = atom({ plugin: 'info-panel', key: 'models' } as const, {})

// True mentre l'agente principale lavora a un turno
const isMainRunning = atom({ plugin: 'info-panel', key: 'isMainRunning' } as const, false)

// Fotogramma corrente dello spinner
const frame = atom({ plugin: 'info-panel', key: 'frame' } as const, 0)

// Nome della cartella di lavoro, per l'intestazione
const rootName = atom({ plugin: 'info-panel', key: 'rootName' } as const, '')

// Percorso assoluto della cartella di lavoro: il timer lo confronta con $.session.cwd() per accorgersi di un /cd
const cwdState = atom({ plugin: 'info-panel', key: 'cwd' } as const, '')

// Una riga dell'albero già "appiattita": profondità, stato aperto e guide ad albero servono al disegno
export type TreeRow = { path: string; name: string; kind: TreeEntry['kind']; depth: number; isOpen: boolean; prefix: string }

// Toglie .git e node_modules, poi cartelle prima e file dopo, ognuno in ordine alfabetico senza distinguere le maiuscole
export const sortAndFilter = (entries: readonly TreeEntry[]): TreeEntry[] =>
  entries
    .filter(entry => !HIDDEN.includes(entry.name))
    .map(({ name, kind }) => ({ name, kind }))
    .sort((a, b) => {
      // Le cartelle vengono prima di tutto il resto
      if ((a.kind === 'dir') !== (b.kind === 'dir')) {
        return a.kind === 'dir' ? -1 : 1
      }
      const left = a.name.toLowerCase()
      const right = b.name.toLowerCase()

      return left < right ? -1 : left > right ? 1 : 0
    })

// Visita in profondità dalla radice e produce le righe visibili: i figli compaiono solo per le cartelle aperte con listing presente
export const flatten = (tree: Record<string, TreeEntry[]>, open: readonly string[]): TreeRow[] => {
  const rows: TreeRow[] = []

  // `guides` sono le guide degli antenati (3 colonne per livello): │ se l'antenato ha fratelli dopo di sé, altrimenti spazi
  const visit = (parent: string, depth: number, guides: string) => {
    const children = tree[parent] ?? []

    for (const [index, entry] of children.entries()) {
      const path = parent ? `${parent}/${entry.name}` : entry.name
      const isOpen = entry.kind === 'dir' && open.includes(path) && path in tree
      // L'ultimo figlio chiude il ramo con └─, gli altri usano ├─
      const isLast = index === children.length - 1
      rows.push({ path, name: entry.name, kind: entry.kind, depth, isOpen, prefix: `${guides}${isLast ? '└─ ' : '├─ '}` })
      if (isOpen) {
        visit(path, depth + 1, `${guides}${isLast ? '   ' : '│  '}`)
      }
    }
  }

  visit('', 0, '')

  return rows
}

// Divide le righe utili del corpo: circa l'80% all'albero (intestazione compresa), il resto agli agenti (separatore compreso, almeno 2 righe)
export const split = (bodyRows: number) => {
  const treeRows = Math.min(Math.max(3, Math.floor(bodyRows * 0.8)), Math.max(1, bodyRows - 2))

  return { treeRows, agentRows: Math.max(0, bodyRows - treeRows) }
}

// Nome del modello senza il prefisso "claude-" (es. sonnet-5-5), n/d se non noto
export const shortModel = (id?: string) => (id ? id.replace(/^claude-/, '') : 'n/d')

// Tronca il testo a `cols` colonne, con i puntini di sospensione se è più lungo
export const fit = (text: string, cols: number) => {
  if (cols <= 0) {
    return ''
  }
  if (text.length <= cols) {
    return text
  }

  return cols === 1 ? text.slice(0, 1) : `${text.slice(0, cols - 1)}…`
}

// Quante voci mostrare in `lines` righe: se non ci stanno tutte l'ultima riga diventa "+n altri"
export const clip = <T,>(items: readonly T[], lines: number) => {
  if (items.length <= lines) {
    return { shown: [...items], hidden: 0 }
  }
  // Con almeno 2 righe una è riservata al contatore, con una sola si mostra la prima voce
  const shown = items.slice(0, lines >= 2 ? lines - 1 : Math.max(0, lines))

  return { shown, hidden: lines >= 2 ? items.length - shown.length : 0 }
}

// Voce di una tabella per un file: prima per nome esatto, poi per estensione; undefined se non c'è
const lookup = <T,>(table: Record<string, T>, name: string): T | undefined => {
  // Nome minuscolo; tutti i .env.* (local, production...) condividono la voce di .env
  const lower = name.toLowerCase()
  const byName = lower.startsWith('.env.') ? '.env' : lower
  // Estensione col punto; un punto iniziale (.gitignore) non è un'estensione
  const dot = lower.lastIndexOf('.')
  const byExtension = dot > 0 ? lower.slice(dot) : ''

  // Object.hasOwn evita che nomi come "constructor" peschino dal prototipo
  for (const key of [byName, byExtension]) {
    if (Object.hasOwn(table, key)) {
      return table[key]
    }
  }

  return undefined
}

// Icona di una voce dell'albero nel set scelto (un valore sconosciuto vale emoji): cartelle aperte o chiuse, file per nome esatto, poi per estensione, altrimenti quella di default
export const iconFor = (name: string, kind: TreeEntry['kind'], isOpen: boolean, set: string): Icon => {
  if (set === 'nerd') {
    const nerd = kind === 'dir' ? (isOpen ? FOLDER_OPEN : FOLDER) : (lookup(ICONS, name) ?? FILE)

    return { ...nerd, width: 1 }
  }

  if (set === 'simple') {
    if (kind === 'dir') {
      return { glyph: isOpen ? SIMPLE_FOLDER_OPEN : SIMPLE_FOLDER, width: 1, color: FOLDER.color }
    }

    return { glyph: SIMPLE_FILE, width: 1, color: (lookup(ICONS, name) ?? FILE).color }
  }

  // Emoji: larghe 2 colonne, il colore del terminale non si applica
  if (kind === 'dir') {
    return { glyph: isOpen ? EMOJI_FOLDER_OPEN : EMOJI_FOLDER, width: 2 }
  }

  return { glyph: lookup(EMOJIS, name) ?? EMOJI_FILE, width: 2 }
}

// Percorso assoluto di una cartella dell'albero: cwd + separatore + percorso relativo, con il separatore della cwd (\ su Windows)
export const absolutePath = (cwd: string, path: string) => {
  const sep = cwd.includes('\\') ? '\\' : '/'

  // La cwd può finire con un separatore (radice di un'unità): non lo si raddoppia
  return `${cwd.replace(/[\\/]+$/, '')}${sep}${path.split('/').join(sep)}`
}

// Cartella padre di `cwd` (gestisce \ e /); undefined se è già la radice di un'unità (C:\) o di / e non si può salire
export const parentDir = (cwd: string): string | undefined => {
  // Senza separatori finali: C:\a\ diventa C:\a, la radice C:\ diventa C: e / diventa vuoto
  const trimmed = cwd.replace(/[\\/]+$/, '')
  const cut = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'))

  // Nessun separatore rimasto: si era già alla radice
  if (cut < 0) {
    return undefined
  }

  const parent = trimmed.slice(0, cut)

  // La radice resta col suo separatore: C:\ e /
  return parent === '' || parent.endsWith(':') ? `${parent}${trimmed.charAt(cut)}` : parent
}

// Un agente lavora quando il suo stato è running, pending o waiting
const isActive = (status: string) => ACTIVE.includes(status)

// Icona di stato: spinner se attivo, simbolo fisso per gli stati finali o a riposo
const statusIconFor = (status: string, tick: number) => {
  if (isActive(status)) {
    return { glyph: SPINNER[tick % SPINNER.length] ?? '', color: 'claude' }
  }
  if (status === 'completed') {
    return { glyph: '✓', color: 'success' }
  }
  if (status === 'failed' || status === 'killed') {
    return { glyph: '✗', color: 'error' }
  }

  return { glyph: '◌', color: undefined }
}

// Ultima parte di un percorso (es. C:\Claude\mio-progetto -> mio-progetto)
const folderName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path

// Legge una cartella (la radice se `path` è vuoto): se non è leggibile restituisce una sola riga di avviso
const listDir = async ($: EngineInterface, path: string): Promise<TreeEntry[]> => {
  try {
    return sortAndFilter(await $.fs.list(path || undefined))
  } catch {
    return [{ name: '(non leggibile)', kind: 'other' }]
  }
}

// Rilegge le cartelle indicate e aggiorna i loro listing
const loadListings = async ($: EngineInterface, paths: string[]) => {
  const loaded = await Promise.all(paths.map(async path => [path, await listDir($, path)] as const))
  await update($, listings, current => ({ ...current, ...Object.fromEntries(loaded) }))
}

// Clic su una cartella: la chiude se è aperta, altrimenti ne legge il contenuto e la apre
const toggle = async ($: EngineInterface, path: string, windowRows: number) => {
  const open = await read($, expanded)

  if (open.includes(path)) {
    await update($, expanded, list => list.filter(one => one !== path))
  } else {
    await loadListings($, [path])
    await update($, expanded, list => [...list, path])
  }

  // Dopo l'apertura o la chiusura l'albero cambia altezza: riporta la finestra entro il nuovo massimo
  const rows = flatten(await read($, listings), await read($, expanded))
  await update($, treeOffset, offset => Math.min(offset, Math.max(0, rows.length - windowRows)))
}

// Motivo di un errore, su una riga e troncato, per i toast
const reasonOf = (error: unknown) => fit(String(error instanceof Error ? error.message : error).replace(/\s+/g, ' '), 60)

// Apre Esplora risorse sulla cartella (solo Windows); explorer.exe risponde 1 anche quando apre, quindi l'exit code si ignora
const openInExplorer = async ($: EngineInterface, path: string) => {
  try {
    await $.process.run(['explorer.exe', absolutePath(await read($, cwdState), path)])
  } catch (error) {
    // Chiamata rifiutata o comando non avviabile (per esempio fuori da Windows): il toast dice anche il motivo
    $.ui.toast(`Impossibile aprire Esplora risorse: ${reasonOf(error)}`)
  }
}

// Sposta la cartella di lavoro della sessione con il comando integrato /cd (il percorso va senza virgolette)
const changeDir = async ($: EngineInterface, target: string) => {
  try {
    await $.command.run({ command: 'cd', args: target })
  } catch (error) {
    // Comando rifiutato o percorso non valido
    $.ui.toast(`Impossibile cambiare cartella: ${reasonOf(error)}`)
  }
}

// Sale alla cartella padre della cartella di lavoro; alla radice di un'unità non fa nulla e lo dice
const goToParent = async ($: EngineInterface) => {
  const parent = parentDir(await read($, cwdState))

  if (parent === undefined) {
    $.ui.toast('Già alla radice: non c\'è una cartella padre')

    return
  }

  await changeDir($, parent)
}

// Se la cartella di lavoro è cambiata (un /cd, anche digitato a mano) riparte da zero: albero chiuso, in cima, radice riletta
const syncCwd = async ($: EngineInterface) => {
  const now = await $.session.cwd()

  if (now === (await read($, cwdState))) {
    return
  }

  // Prima il nuovo valore, così un secondo giro del timer non rifà la stessa cosa
  await update($, cwdState, () => now)
  await update($, expanded, () => [])
  await update($, listings, () => ({}))
  await update($, treeOffset, () => 0)
  await update($, rootName, () => folderName(now))
  await loadListings($, [''])
}

// Clic su un file: inserisce @percorso (con uno spazio dopo) nel prompt, alla posizione del cursore
const mentionFile = async ($: EngineInterface, path: string) => {
  await $.prompt.fill({ text: `@${path} `, mode: 'insert' })
}

// Clic su un agente: apre il suo transcript nella vista principale (l'agente principale non ha agentId)
const viewAgent = async ($: EngineInterface, id: string) => {
  const shown = await $.ui.view(id === 'main' ? {} : { agentId: id })

  if (shown.deny) {
    $.ui.toast(shown.deny)
  }
}

export const register: Register = (on, options) => {
  // Set di icone scelto nelle opzioni del mod (un valore sconosciuto vale emoji, lo gestisce iconFor)
  const iconSet = String(options.icons ?? 'emoji')

  // All'avvio (e dopo ogni reload) registra il comando, carica la radice, apre il pane e avvia i timer
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'info-panel',
      description: 'Apre il pannello con l\'albero della cartella e gli agenti',
    })
    const result = await next(e)

    // Nome della cartella di lavoro, radice dell'albero e modello dell'agente principale
    const cwd = await $.session.cwd()
    const model = await $.session.model()
    await update($, cwdState, () => cwd)
    await update($, rootName, () => folderName(cwd))
    await update($, models, current => ({ ...current, main: model }))
    await loadListings($, [''])

    // Apre il pane; sul terminale stretto resta in attesa di uno più largo
    void $.ui.open({ id: PANE, title: 'Info', columns: PANE_COLUMNS })

    // Ogni secondo rilegge gli agenti e scrive solo se qualcosa è cambiato
    $.clock.every(1000, async () => {
      const found = await $.agent.list()
      const rows: AgentRow[] = found.map(agent => ({
        id: agent.id,
        label: agent.name ?? (agent.description || agent.type),
        status: agent.status,
        ...(agent.parentId ? { parentId: agent.parentId } : {}),
      }))

      if (JSON.stringify(rows) !== JSON.stringify(await read($, agents))) {
        await update($, agents, () => rows)
      }
    })

    // Ogni secondo controlla se la cartella di lavoro è cambiata (/cd)
    $.clock.every(1000, () => syncCwd($))

    // Ogni 200 ms fa avanzare lo spinner, ma solo se qualcuno sta lavorando
    $.clock.every(200, async () => {
      const [isRunning, rows] = await Promise.all([read($, isMainRunning), read($, agents)])

      if (isRunning || rows.some(row => isActive(row.status))) {
        await update($, frame, tick => tick + 1)
      }
    })

    return result
  })

  // /info-panel: riapre il pane, con l'input della persona si piazza a qualsiasi larghezza
  on('command.run', { command: 'info-panel' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Info', columns: PANE_COLUMNS })

    return { text: 'Pannello info aperto.' }
  })

  // Ogni richiesta al modello porta il modello usato: lo registra per l'agente che la fa (main se manca agentId)
  on('turn.step', async function* ($, e, next) {
    await update($, models, current => ({ ...current, [e.agentId ?? 'main']: e.model }))

    return yield* next(e)
  })

  // Inizio di un turno dell'agente principale: da qui lo spinner gira
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, isMainRunning, () => true)
    }

    return next(e)
  })

  // Fine di un turno dell'agente principale: ferma lo spinner e riallinea l'albero ai file creati nel turno
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, isMainRunning, () => false)
      await loadListings($, ['', ...(await read($, expanded))])
    }

    return next(e)
  })

  // Rotella sul pane: se il puntatore è sull'albero lo scorre da sé, altrimenti lascia fare al motore
  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    // Il pane ha 1 riga di padding in alto e 1 in basso: le righe utili sono bodyRows - 2
    const { treeRows } = split(Math.max(0, e.bodyRows - 2))

    // pointer.row conta dal bordo del corpo: l'albero parte dalla riga 1 (la riga 0 è il padding, sopra l'albero, e scorre anche lui)
    if (e.pointer && e.pointer.row - 1 >= treeRows) {
      return next(e)
    }

    // La finestra dell'albero ha una riga in meno per l'intestazione
    const windowRows = Math.max(0, treeRows - 1)
    const rows = flatten(await read($, listings), await read($, expanded))
    const maxOffset = Math.max(0, rows.length - windowRows)
    await update($, treeOffset, offset => Math.min(Math.max(offset + e.by, 0), maxOffset))

    return { deny: 'albero scorso da info-panel' }
  })

  // Il pane: albero della cartella in alto, agenti in basso, per un totale di righe pari a bodyRows
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)

    // Spazio a disposizione, tolto 1 di padding per lato: colonne utili e righe divise tra albero e agenti
    const cols = Math.max(1, e.props.bodyColumns - 2)
    const { treeRows, agentRows } = split(Math.max(0, e.props.scroll.bodyRows - 2))
    const windowRows = Math.max(0, treeRows - 1)
    const agentLines = Math.max(0, agentRows - 1)

    // Stato da cui si disegna
    const [tree, open, offsetNow, agentList, modelOf, isRunning, tick, name] = await Promise.all([
      read($, listings),
      read($, expanded),
      read($, treeOffset),
      read($, agents),
      read($, models),
      read($, isMainRunning),
      read($, frame),
      read($, rootName),
    ])

    // Finestra dell'albero: la prima riga visibile non supera mai l'ultima possibile, le righe che mancano sono vuote
    const rows = flatten(tree, open)
    const offset = Math.min(offsetNow, Math.max(0, rows.length - windowRows))
    const visible = rows.slice(offset, offset + windowRows)
    const fillers = Array.from({ length: windowRows - visible.length }, () => <Text> </Text>)

    // Agenti: prima il principale, poi i sub-agenti con quelli attivi in cima
    const subs = agentList
      .map(row => ({ id: row.id, label: row.label, status: row.status, model: modelOf[row.id] }))
      .sort((a, b) => Number(isActive(b.status)) - Number(isActive(a.status)))
    const entries = [
      { id: 'main', label: 'principale', status: isRunning ? 'running' : 'idle', model: modelOf.main },
      ...subs,
    ]
    const { shown, hidden } = clip(entries, agentLines)

    // Separatore con il numero di agenti, riempito di trattini fino a fine riga
    const title = `── Agenti (${entries.length}) `
    const separator = fit(title + '─'.repeat(Math.max(0, cols - title.length)), cols)

    return (
      <Box flexDirection="column" padding={1}>
        <Box flexDirection="row">
          <Text weight="bold">{fit(`${name}/`, cols - 4)}</Text>
          <Text> </Text>
          <Button key="parent" plain dimColor onPress={() => goToParent($)}>
            ↑
          </Button>
          <Text> </Text>
          <Button key="refresh" plain dimColor onPress={() => loadListings($, ['', ...open])}>
            ↻
          </Button>
        </Box>
        {visible.map(row => {
          const icon = iconFor(row.name, row.kind, row.isOpen, iconSet)
          // Se le guide non ci stanno si perdono quelle a sinistra e resta la coda col connettore (├─ o └─), con 1 colonna per il nome
          const room = Math.max(0, cols - icon.width - 2)
          const guides = row.prefix.length > room ? row.prefix.slice(row.prefix.length - room) : row.prefix
          // Spazio per il nome: dopo guide, icona e spazio che la segue
          const nameRoom = cols - guides.length - icon.width - 1
          // Le azioni ↗ e → (con i due spazi che le separano: 4 colonne) compaiono solo se al nome resta almeno 1 colonna
          const hasActions = row.kind === 'dir' && nameRoom - 4 >= 1
          // Le cartelle hanno la / finale
          const label = fit(row.kind === 'dir' ? `${row.name}/` : row.name, hasActions ? nameRoom - 4 : nameRoom)

          // Guide ad albero in grigio, icona (colorata, se il set ha i colori), poi il nome
          const line = [
            <Text dimColor>{guides}</Text>,
            <Text color={icon.color}>{icon.glyph}</Text>,
            ` ${label}`,
          ]

          // La riga di avviso "(non leggibile)" non è cliccabile
          if (row.kind === 'other') {
            return <Text>{line}</Text>
          }

          // Cartella: il nome apre o chiude, poi ↗ apre Esplora risorse e → ne fa la cartella di lavoro
          if (row.kind === 'dir') {
            const actions = hasActions
              ? [
                  <Text> </Text>,
                  <Button key={`open:${row.path}`} plain dimColor onPress={() => openInExplorer($, row.path)}>
                    ↗
                  </Button>,
                  <Text> </Text>,
                  <Button
                    key={`cd:${row.path}`}
                    plain
                    dimColor
                    onPress={async () => changeDir($, absolutePath(await read($, cwdState), row.path))}
                  >
                    →
                  </Button>,
                ]
              : []

            return (
              <Box key={`row:${row.path}`} flexDirection="row">
                <Button key={`dir:${row.path}`} plain onPress={() => toggle($, row.path, windowRows)}>
                  {line}
                </Button>
                {actions}
              </Box>
            )
          }

          return (
            <Button key={`file:${row.path}`} plain onPress={() => mentionFile($, row.path)}>
              {line}
            </Button>
          )
        })}
        {fillers}
        {agentRows > 0 ? <Text dimColor>{separator}</Text> : null}
        {shown.map(entry => {
          const { glyph, color } = statusIconFor(entry.status, tick)
          // Il modello si tronca a sua volta, così icona, nome (almeno 1 colonna) e modello restano entro la larghezza
          const modelText = fit(shortModel(entry.model), cols - 4)
          // Il nome lascia posto all'icona, allo spazio e al modello
          const room = Math.max(1, cols - 2 - modelText.length - 1)
          const isDone = !isActive(entry.status) && entry.id !== 'main'

          return (
            <Button key={`agent:${entry.id}`} plain dimColor={isDone} onPress={() => viewAgent($, entry.id)}>
              <Text color={color}>{glyph}</Text>
              {' '}
              {fit(entry.label, room)}
              {' '}
              <Text dimColor>{modelText}</Text>
            </Button>
          )
        })}
        {hidden > 0 ? <Text dimColor>{fit(`+${hidden} altri`, cols)}</Text> : null}
      </Box>
    )
  })
}
