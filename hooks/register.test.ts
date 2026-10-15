import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { clip, fit, flatten, shortModel, sortAndFilter, split } from './register'

// Input di session.start come lo passa il REPL
const START = { cwd: '', surface: 'terminal', isInteractive: true } as never

// Proprietà del Pane come le passa il motore: corpo di 40 colonne e `bodyRows` righe
const props = (bodyRows: number) =>
  ({ title: 'Info', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows }, view: {} }) as never

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

test('split dà circa il 70% all albero e il resto agli agenti', async () => {
  expect(split(10)).toEqual({ treeRows: 7, agentRows: 3 })
  expect(split(20)).toEqual({ treeRows: 14, agentRows: 6 })
  expect(split(30)).toEqual({ treeRows: 21, agentRows: 9 })
  // Con poche righe gli agenti hanno comunque separatore e una riga, la somma resta pari alle righe
  expect(split(4)).toEqual({ treeRows: 2, agentRows: 2 })
  expect(split(4).treeRows + split(4).agentRows).toBe(4)
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
    expect(await ui.find({ key: 'dir:src', text: '▸ src/' })).toBeDefined()
    expect(await ui.find({ text: /node_modules|\.git/ })).toBeUndefined()
    expect(await ui.find({ text: 'README.md' })).toBeDefined()
    // Sezione agenti: riga principale col modello senza prefisso
    expect(await ui.find({ text: /Agenti \(1\)/ })).toBeDefined()
    expect(await ui.find({ text: /principale.*sonnet-5-5/ })).toBeDefined()

    // Le righe disegnate non superano mai quelle del corpo
    expect((await rowsOf(ui)).length).toBeLessThanOrEqual(20)
    await ui.unmount()
  }
})

test('un clic su una cartella la apre, un secondo la chiude', async ($, on) => {
  const { listed } = world(on)
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: 'info-panel', surface: 'terminal', component: 'Pane', requestId: 'info-panel', props: props(20) })
  expect(await ui.find({ text: 'index.ts' })).toBeUndefined()

  // Apertura: legge src e mostra il figlio, la freccia si gira
  await ui.press({ key: 'dir:src' })
  expect(listed).toContain('src')
  expect(await ui.find({ text: 'index.ts' })).toBeDefined()
  expect(await ui.find({ key: 'dir:src', text: '▾ src/' })).toBeDefined()

  // Chiusura: il figlio sparisce
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

  const ui = await $.ui.mount({ plugin: 'info-panel', surface: 'terminal', component: 'Pane', requestId: 'info-panel', props: props(10) })

  // 10 righe: 7 all'albero (intestazione compresa), 3 agli agenti (separatore, principale, contatore)
  expect(await ui.find({ text: /\+12 altri/ })).toBeDefined()
  expect((await rowsOf(ui)).length).toBe(10)
})

test('la rotella sull albero lo scorre da sé, fuori dall albero lascia fare al motore', async ($, on) => {
  world(on)
  // Il motore sotto ui.scroll: accetta lo spostamento
  on('ui.scroll', () => ({}))
  await $.session.start(START)

  // 6 righe: 4 all'albero (finestra di 3 sotto l'intestazione); aprendo src le voci diventano 4
  const ui = await $.ui.mount({ plugin: 'info-panel', surface: 'terminal', component: 'Pane', requestId: 'info-panel', props: props(6) })
  await ui.press({ key: 'dir:src' })
  expect(await ui.find({ text: 'docs' })).toBeDefined()
  expect(await ui.find({ text: 'README.md' })).toBeUndefined()

  // Una tacca di rotella sopra l'albero: lo scorre il mod e il motore non muove nulla
  const input = { component: 'Pane', requestId: 'info-panel', offset: 0, by: 1, bodyRows: 6, contentRows: 6, origin: { kind: 'person' } }
  const onTree = await $.ui.scroll({ ...input, pointer: { column: 3, row: 1 } } as never)
  expect(onTree.deny).toMatch(/info-panel/)
  expect(await ui.find({ text: 'docs' })).toBeUndefined()
  expect(await ui.find({ text: 'README.md' })).toBeDefined()

  // Sopra la sezione agenti passa al motore
  const onAgents = await $.ui.scroll({ ...input, pointer: { column: 3, row: 5 } } as never)
  expect(onAgents.deny).toBeUndefined()
})
