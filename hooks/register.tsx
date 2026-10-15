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

// Una riga dell'albero già "appiattita": profondità e stato aperto servono al disegno
export type TreeRow = { path: string; name: string; kind: TreeEntry['kind']; depth: number; isOpen: boolean }

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

  const visit = (parent: string, depth: number) => {
    for (const entry of tree[parent] ?? []) {
      const path = parent ? `${parent}/${entry.name}` : entry.name
      const isOpen = entry.kind === 'dir' && open.includes(path) && path in tree
      rows.push({ path, name: entry.name, kind: entry.kind, depth, isOpen })
      if (isOpen) {
        visit(path, depth + 1)
      }
    }
  }

  visit('', 0)

  return rows
}

// Divide le righe del corpo: circa il 70% all'albero (intestazione compresa), il resto agli agenti (separatore compreso, almeno 2 righe)
export const split = (bodyRows: number) => {
  const treeRows = Math.min(Math.max(3, Math.floor(bodyRows * 0.7)), Math.max(1, bodyRows - 2))

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

// Un agente lavora quando il suo stato è running, pending o waiting
const isActive = (status: string) => ACTIVE.includes(status)

// Icona di stato: spinner se attivo, simbolo fisso per gli stati finali o a riposo
const iconFor = (status: string, tick: number) => {
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

export const register: Register = on => {
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
    const { treeRows } = split(e.bodyRows)

    if (e.pointer && e.pointer.row >= treeRows) {
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

    // Spazio a disposizione: colonne del corpo e righe divise tra albero e agenti
    const cols = Math.max(1, e.props.bodyColumns)
    const { treeRows, agentRows } = split(e.props.scroll.bodyRows)
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
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Text weight="bold">{fit(`${name}/`, cols - 2)}</Text>
          <Text> </Text>
          <Button key="refresh" plain onPress={() => loadListings($, ['', ...open])}>
            ↻
          </Button>
        </Box>
        {visible.map(row =>
          row.kind === 'dir' ? (
            <Button key={`dir:${row.path}`} plain onPress={() => toggle($, row.path, windowRows)}>
              {fit(`${'  '.repeat(row.depth)}${row.isOpen ? '▾' : '▸'} ${row.name}/`, cols)}
            </Button>
          ) : (
            <Text>{fit(`${'  '.repeat(row.depth)}${row.name}`, cols)}</Text>
          ),
        )}
        {fillers}
        {agentRows > 0 ? <Text dimColor>{separator}</Text> : null}
        {shown.map(entry => {
          const { glyph, color } = iconFor(entry.status, tick)
          const modelText = shortModel(entry.model)
          // Il nome lascia posto all'icona, allo spazio e al modello
          const room = Math.max(1, cols - 2 - modelText.length - 1)
          const isDone = !isActive(entry.status) && entry.id !== 'main'

          return (
            <Text wrap="truncate-end" dimColor={isDone}>
              <Text color={color}>{glyph}</Text>
              {' '}
              {fit(entry.label, room)}
              {' '}
              <Text dimColor>{modelText}</Text>
            </Text>
          )
        })}
        {hidden > 0 ? <Text dimColor>{fit(`+${hidden} altri`, cols)}</Text> : null}
      </Box>
    )
  })
}
