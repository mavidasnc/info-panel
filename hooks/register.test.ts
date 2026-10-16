import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { clip, fit, flatten, iconFor, isDoublePress, shortModel, sortAndFilter, split } from './register'

// Input di session.start come lo passa il REPL
const START = { cwd: '', surface: 'terminal', isInteractive: true } as never

// Proprietà del Pane come le passa il motore: corpo di 40 colonne e `bodyRows` righe
const props = (bodyRows: number, bodyColumns = 40) =>
  ({ title: 'Info', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows }, view: {} }) as never

// Contenuto delle cartelle finte: '' è la radice
const FOLDERS: Record<string, { name: string; kind: string }[]> = {
  '': [
    { name: 'README.md', kind: 'file' },
    { name: 'node_modules', kind: 'dir' },
    { name: 'src', kind: 'dir' },
    { name: '.git', kind: 'dir' },
    { name: 'docs', kind: 'dir' },
  ],
  src: [{ name: 'index.ts', kind: 'file' }],
}

// Il motore sotto il mod: cartella, modello, comando, pane, cartelle e agenti finti; restituisce l'orologio finto e le cartelle lette
const world = (on: On, agents: unknown[] = []) => {
  const clock = mock.clock(on)
  const listed: string[] = []

  on('session.start', () => ({ cwd: '' }))
  on('session.cwd', () => ({ value: 'C:\\Users\\maurizio\\Claude\\mio-progetto' }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('command.register', () => ({ value: { command: 'info-panel' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: agents as never }))
  on('fs.list', (_$, e) => {
    // Il motore risolve i percorsi in assoluti: si riconosce la cartella dalla coda del percorso, la radice è ogni altro caso
    const normal = e.path.replace(/\\/g, '/')
    const path = Object.keys(FOLDERS).find(key => key !== '' && (normal === key || normal.endsWith(`/${key}`))) ?? ''
    listed.push(path)

    return { value: (FOLDERS[path] ?? []) as never }
  })
  // Il motore sotto i turni: rispondono con l'id del turno
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  // Il motore sotto turn.step: nessun chunk, risposta con turno e indice della richiesta
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
  })

  return { clock, listed }
}

// Righe di primo livello del pane: tutto ciò che il motore deve disegnare una per riga
const rowsOf = async (ui: { drawn: () => Promise<unknown> }) => {
  const root = (await ui.drawn()) as { children: unknown[] }

  return root.children
}

test('sortAndFilter nasconde .git e node_modules e mette le cartelle prima', async () => {
  const sorted = sortAndFilter(FOLDERS[''] as never)

  expect(sorted.map(entry => entry.name)).toEqual(['docs', 'src', 'README.md'])
})

test('flatten espande solo le cartelle aperte con listing presente', async () => {
  const tree = { '': sortAndFilter(FOLDERS[''] as never), src: sortAndFilter(FOLDERS.src as never) } as never

  // Con tutto chiuso restano le voci della radice
  expect(flatten(tree, []).map(row => row.path)).toEqual(['docs', 'src', 'README.md'])
  // Aprendo src compare il suo figlio, un livello più in dentro
  const open = flatten(tree, ['src'])
  expect(open.map(row => row.path)).toEqual(['docs', 'src', 'src/index.ts', 'README.md'])
  expect(open[2]?.depth).toBe(1)
  expect(open[1]?.isOpen).toBe(true)
  // Una cartella aperta senza listing non mostra figli
  expect(flatten(tree, ['docs']).map(row => row.path)).toEqual(['docs', 'src', 'README.md'])
})

test('flatten costruisce le guide ad albero su 3 livelli con ultimi figli', async () => {
  // a (con a1 e a2), b e z.txt; a1 contiene deep.ts
  const tree = {
    '': [{ name: 'a', kind: 'dir' }, { name: 'b', kind: 'dir' }, { name: 'z.txt', kind: 'file' }],
    a: [{ name: 'a1', kind: 'dir' }, { name: 'a2', kind: 'file' }],
    'a/a1': [{ name: 'deep.ts', kind: 'file' }],
  } as never

  const rows = flatten(tree, ['a', 'a/a1'])

  expect(rows.map(row => [row.path, row.prefix])).toEqual([
    ['a', '├─ '],
    // a ha fratelli dopo di sé: la sua guida resta │ per tutti i discendenti
    ['a/a1', '│  ├─ '],
    // deep.ts è l'unico figlio di a1 e chiude il ramo con └─
    ['a/a1/deep.ts', '│  │  └─ '],
    ['a/a2', '│  └─ '],
    ['b', '├─ '],
    // z.txt è l'ultima voce della radice
    ['z.txt', '└─ '],
  ])

  // Una cartella che è l'ultima del suo livello lascia spazi, non │, ai figli
  const last = flatten({ '': [{ name: 'a', kind: 'dir' }], a: [{ name: 'x', kind: 'file' }] } as never, ['a'])
  expect(last.map(row => row.prefix)).toEqual(['└─ ', '   └─ '])
})

test('split dà circa l 80% all albero e il resto agli agenti', async () => {
  expect(split(10)).toEqual({ treeRows: 8, agentRows: 2 })
  expect(split(20)).toEqual({ treeRows: 16, agentRows: 4 })
  expect(split(30)).toEqual({ treeRows: 24, agentRows: 6 })
  // Con poche righe gli agenti hanno comunque separatore e una riga, la somma resta pari alle righe
  expect(split(4)).toEqual({ treeRows: 2, agentRows: 2 })
  expect(split(4).treeRows + split(4).agentRows).toBe(4)
})

test('iconFor: cartelle gialle, file per nome e per estensione, default per il resto', async () => {
  // Cartelle: stesso giallo, glifo diverso se aperta o chiusa
  expect(iconFor('src', 'dir', false)).toEqual({ glyph: '\u{e5ff}', color: '#e5c07b' })
  expect(iconFor('src', 'dir', true)).toEqual({ glyph: '\u{e5fe}', color: '#e5c07b' })
  // Per estensione, senza distinguere le maiuscole
  expect(iconFor('index.ts', 'file', false).glyph).toBe('\u{e628}')
  expect(iconFor('Main.PHP', 'file', false).glyph).toBe('\u{e608}')
  // Per nome esatto, prima dell'estensione: package.json non è un .json qualsiasi
  expect(iconFor('package.json', 'file', false).glyph).toBe('\u{e616}')
  expect(iconFor('data.json', 'file', false).glyph).toBe('\u{e60b}')
  expect(iconFor('.env.local', 'file', false).glyph).toBe('\u{f084}')
  expect(iconFor('Dockerfile', 'file', false).glyph).toBe('\u{e650}')
  // Estensione sconosciuta, file senza estensione e nomi che coincidono con il prototipo: icona di default
  const fallback = { glyph: '\u{f016}', color: '#7f848e' }
  expect(iconFor('foto.xyz', 'file', false)).toEqual(fallback)
  expect(iconFor('Makefile', 'file', false)).toEqual(fallback)
  expect(iconFor('constructor', 'file', false)).toEqual(fallback)
})

test('isDoublePress riconosce lo stesso percorso entro 400 ms', async () => {
  const last = { path: 'src', at: 1000 }

  // Dentro la soglia
  expect(isDoublePress(last, 'src', 1000)).toBe(true)
  expect(isDoublePress(last, 'src', 1399)).toBe(true)
  // Fuori dalla soglia
  expect(isDoublePress(last, 'src', 1401)).toBe(false)
  // Altro percorso o nessun clic precedente
  expect(isDoublePress(last, 'docs', 1100)).toBe(false)
  expect(isDoublePress(undefined, 'src', 1100)).toBe(false)
})

test('shortModel, fit e clip', async () => {
  expect(shortModel('claude-sonnet-5-5')).toBe('sonnet-5-5')
  expect(shortModel('opus')).toBe('opus')
  expect(shortModel(undefined)).toBe('n/d')

  expect(fit('abcdef', 10)).toBe('abcdef')
  expect(fit('abcdef', 4)).toBe('abc…')
  expect(fit('abcdef', 0)).toBe('')

  expect(clip([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], hidden: 0 })
  // Non ci stanno: l'ultima riga è il contatore
  expect(clip([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 2], hidden: 3 })
})

test('il pane mostra intestazione, cartelle e riga principale su ogni superficie', async ($, on) => {
  world(on)
  await $.session.start(START)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'info-panel', surface, component: 'Pane', requestId: 'info-panel', props: props(20) })

    // Intestazione con il nome della cartella e pulsante di aggiornamento
    expect(await ui.find({ text: 'mio-progetto/' })).toBeDefined()
    expect(await ui.find({ key: 'refresh' })).toBeDefined()
    // Cartelle cliccabili, chiuse; .git e node_modules assenti
    expect(await ui.find({ key: 'dir:src', text: new RegExp('├─ \u{e5ff} src/$') })).toBeDefined()
    expect(await ui.find({ text: /node_modules|\.git/ })).toBeUndefined()
    // File cliccabile con la guida dell'ultima voce e l'icona del tipo (.md)
    expect(await ui.find({ key: 'file:README.md', text: new RegExp('└─ \u{e609} README\\.md$') })).toBeDefined()
    // Sezione agenti: riga principale col modello senza prefisso
    expect(await ui.find({ text: /Agenti \(1\)/ })).toBeDefined()
    expect(await ui.find({ text: /principale.*sonnet-5-5/ })).toBeDefined()

    // Le righe disegnate non superano quelle utili del corpo (20 meno 1 di padding sopra e sotto)
    expect((await rowsOf(ui)).length).toBeLessThanOrEqual(18)
    await ui.unmount()
  }
})

test('le righe di albero e agenti restano entro la larghezza utile (colonne meno 2 di padding)', async ($, on) => {
  world(on)
  await $.session.start(START)

  // Corpo di 8 colonne: 6 utili; src/index.ts (guide, glifo, spazio e nome) e la riga dell'agente principale ci starebbero solo in 14 e 23
  const ui = await $.ui.mount({ plugin: 'info-panel', surface: 'terminal', component: 'Pane', requestId: 'info-panel', props: props(20, 8) })
  await ui.press({ key: 'dir:src' })
  const rows = (await rowsOf(ui)) as { type: string; props?: { key?: string; label?: string } }[]
  const lines = rows.filter(row => row.type === 'Button' && /^(dir|file|agent):/.test(row.props?.key ?? ''))

  // Tre voci in radice, il figlio di src e l'agente principale
  expect(lines.length).toBe(5)
  for (const row of lines) {
    expect((row.props?.label ?? '').length).toBeLessThanOrEqual(6)
  }
})

test('un clic su una cartella la apre, un secondo (oltre i 400 ms) la chiude', async ($, on) => {
  const { clock, listed } = world(on)
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: 'info-panel', surface: 'terminal', component: 'Pane', requestId: 'info-panel', props: props(20) })
  expect(await ui.find({ text: 'index.ts' })).toBeUndefined()

  // Apertura: legge src e mostra il figlio, la freccia si gira
  await ui.press({ key: 'dir:src' })
  expect(listed).toContain('src')
  expect(await ui.find({ text: 'index.ts' })).toBeDefined()
  expect(await ui.find({ key: 'dir:src', text: new RegExp('\u{e5fe} src/$') })).toBeDefined()

  // Chiusura, dopo la soglia del doppio clic: il figlio sparisce
  await clock.advance(500)
  await ui.press({ key: 'dir:src' })
  expect(await ui.find({ text: 'index.ts' })).toBeUndefined()
})

test('modello per agente dal hook turn.step e sub-agenti con stato', async ($, on) => {
  const { clock } = world(on, [
    { id: 'a1', name: 'esploratore', description: 'cerca', type: 'Explore', status: 'running' },
    { id: 'a2', description: 'revisione', type: 'general-purpose', status: 'completed' },
  ])
  await $.session.start(START)

  // Una richiesta del sub-agente a1 con haiku e una del principale con opus
  for (const step of [
    { turnId: 't1', index: 0, model: 'claude-haiku-4-5', messageCount: 1, agentId: 'a1' },
    { turnId: 't2', index: 0, model: 'claude-opus-4-8', messageCount: 1 },
  ]) {
    for await (const _chunk of $.turn.step(step as never)) {
      // nessun chunk atteso
    }
  }

  // Un secondo di orologio finto: il timer rilegge $.agent.list()
  await clock.advance(1000)

  const ui = await $.ui.mount({ plugin: 'info-panel', surface: 'terminal', component: 'Pane', requestId: 'info-panel', props: props(20) })
  expect(await ui.find({ text: /Agenti \(3\)/ })).toBeDefined()
  expect(await ui.find({ text: /principale.*opus-4-8/ })).toBeDefined()
  // Il sub-agente attivo ha lo spinner e il suo modello
  expect(await ui.find({ text: /esploratore.*haiku-4-5/ })).toBeDefined()
  expect(await ui.find({ text: /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] esploratore/ })).toBeDefined()
  // Quello concluso ha la spunta, la descrizione come etichetta e nessun modello noto
  expect(await ui.find({ text: /✓ revisione.*n\/d/ })).toBeDefined()

  // Il principale lavora durante un turno: lo spinner avanza con il timer
  await $.turn.start({ text: 'ciao', turnId: 't3' } as never)
  await clock.advance(200)
  expect(await ui.find({ text: /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] principale/ })).toBeDefined()
})

test('con molti agenti il pane resta entro le righe e mostra +n altri', async ($, on) => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `a${i}`, description: `lavoro ${i}`, type: 'Explore', status: 'running' }))
  const { clock } = world(on, many)
  await $.session.start(START)
  await clock.advance(1000)

  const ui = await $.ui.mount({ plugin: 'info-panel', surface: 'terminal', component: 'Pane', requestId: 'info-panel', props: props(14) })

  // 14 righe, 12 utili col padding: 9 all'albero (intestazione compresa), 3 agli agenti (separatore, principale, contatore)
  expect(await ui.find({ text: /\+12 altri/ })).toBeDefined()
  expect((await rowsOf(ui)).length).toBe(12)
})

test('la rotella sull albero lo scorre da sé, fuori dall albero lascia fare al motore', async ($, on) => {
  world(on)
  // Il motore sotto ui.scroll: accetta lo spostamento
  on('ui.scroll', () => ({}))
  await $.session.start(START)

  // 8 righe, 6 utili col padding: 4 all'albero (finestra di 3 sotto l'intestazione); aprendo src le voci diventano 4
  const ui = await $.ui.mount({ plugin: 'info-panel', surface: 'terminal', component: 'Pane', requestId: 'info-panel', props: props(8) })
  await ui.press({ key: 'dir:src' })
  expect(await ui.find({ text: 'docs' })).toBeDefined()
  expect(await ui.find({ text: 'README.md' })).toBeUndefined()

  // Una tacca di rotella sopra l'albero (riga 1, la 0 è il padding): lo scorre il mod e il motore non muove nulla
  const input = { component: 'Pane', requestId: 'info-panel', offset: 0, by: 1, bodyRows: 8, contentRows: 8, origin: { kind: 'person' } }
  const onTree = await $.ui.scroll({ ...input, pointer: { column: 3, row: 1 } } as never)
  expect(onTree.deny).toMatch(/info-panel/)
  expect(await ui.find({ text: 'docs' })).toBeUndefined()
  expect(await ui.find({ text: 'README.md' })).toBeDefined()

  // Sulla riga di padding in alto scorre l'albero anche lui
  const onPadding = await $.ui.scroll({ ...input, by: -1, pointer: { column: 3, row: 0 } } as never)
  expect(onPadding.deny).toMatch(/info-panel/)
  expect(await ui.find({ text: 'docs' })).toBeDefined()

  // Sopra la sezione agenti (separatore alla riga 5) passa al motore
  const onAgents = await $.ui.scroll({ ...input, pointer: { column: 3, row: 5 } } as never)
  expect(onAgents.deny).toBeUndefined()
})

test('un doppio clic su una cartella apre Esplora risorse e la lascia com era', async ($, on) => {
  const { clock } = world(on)
  // Il motore sotto process.run: registra il comando e risponde 1, come explorer.exe quando apre
  const runs: (readonly string[])[] = []
  on('process.run', (_$, e) => {
    runs.push(e.argv)

    return { value: { exitCode: 1, stdout: '', stderr: '' } as never }
  })
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: 'info-panel', surface: 'terminal', component: 'Pane', requestId: 'info-panel', props: props(20) })

  // Primo clic: la cartella si apre subito, Esplora risorse non parte
  await ui.press({ key: 'dir:src' })
  expect(await ui.find({ text: 'index.ts' })).toBeDefined()
  expect(runs).toEqual([])

  // Secondo clic entro 400 ms: la cartella torna chiusa e si apre Esplora risorse sul suo percorso Windows
  await clock.advance(300)
  await ui.press({ key: 'dir:src' })
  expect(await ui.find({ text: 'index.ts' })).toBeUndefined()
  expect(runs).toEqual([['explorer.exe', 'C:\\Users\\maurizio\\Claude\\mio-progetto\\src']])

  // Un terzo clic poco dopo è di nuovo un primo clic: si riapre e non parte un secondo Esplora risorse
  await clock.advance(100)
  await ui.press({ key: 'dir:src' })
  expect(await ui.find({ text: 'index.ts' })).toBeDefined()
  expect(runs.length).toBe(1)
})

test('se Esplora risorse non si può aprire compare un toast', async ($, on) => {
  const { clock } = world(on)
  // process.run rifiutato e toast registrati
  on('process.run', () => ({ deny: 'comandi non consentiti' }))
  const toasts: string[] = []
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: 'info-panel', surface: 'terminal', component: 'Pane', requestId: 'info-panel', props: props(20) })
  await ui.press({ key: 'dir:src' })
  await clock.advance(100)
  await ui.press({ key: 'dir:src' })

  expect(toasts).toEqual(['Impossibile aprire Esplora risorse'])
})

test('un clic su un file inserisce @percorso nel prompt', async ($, on) => {
  world(on)
  // Il motore sotto prompt.fill: registra cosa scrive il mod
  const filled: { text: string; mode: string }[] = []
  on('prompt.fill', (_$, e) => {
    filled.push({ text: e.text, mode: e.mode })

    return { isFilled: true }
  })
  await $.session.start(START)

  for (const surface of ['terminal', 'desktop'] as const) {
    filled.length = 0
    const ui = await $.ui.mount({ plugin: 'info-panel', surface, component: 'Pane', requestId: 'info-panel', props: props(20) })
    await ui.press({ key: 'file:README.md' })

    expect(filled).toEqual([{ text: '@README.md ', mode: 'insert' }])
    await ui.unmount()
  }
})

test('un clic su un agente apre il suo transcript, sul principale la vista principale', async ($, on) => {
  const { clock } = world(on, [{ id: 'a1', name: 'esploratore', description: 'cerca', type: 'Explore', status: 'running' }])
  // Il motore sotto ui.view: registra la vista chiesta e la accetta
  const views: unknown[] = []
  on('ui.view', (_$, e) => {
    views.push(e)

    return { value: {} }
  })
  await $.session.start(START)
  await clock.advance(1000)

  for (const surface of ['terminal', 'desktop'] as const) {
    views.length = 0
    const ui = await $.ui.mount({ plugin: 'info-panel', surface, component: 'Pane', requestId: 'info-panel', props: props(20) })
    await ui.press({ key: 'agent:a1' })
    await ui.press({ key: 'agent:main' })

    expect(views).toEqual([{ agentId: 'a1' }, {}])
    await ui.unmount()
  }
})
