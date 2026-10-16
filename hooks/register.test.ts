import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { absolutePath, clip, EMOJIS, fit, flatten, iconFor, parentDir, shortModel, sortAndFilter, split } from './register'

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

// Il motore sotto il mod: cartella, modello, comando, pane, cartelle e agenti finti; restituisce l'orologio finto, le cartelle lette e la cartella di lavoro (modificabile)
const world = (on: On, agents: unknown[] = []) => {
  const clock = mock.clock(on)
  const listed: string[] = []
  const dir = { value: 'C:\\Users\\maurizio\\Claude\\mio-progetto' }

  on('session.start', () => ({ cwd: '' }))
  on('session.cwd', () => ({ value: dir.value }))
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

  return { clock, listed, dir }
}

// Righe di primo livello del pane: tutto ciò che il motore deve disegnare una per riga
const rowsOf = async (ui: { drawn: () => Promise<unknown> }) => {
  const root = (await ui.drawn()) as { children: unknown[] }

  return root.children
}

// Colonne occupate da un testo nel terminale: le emoji (code point >= U+1F300) ne occupano 2, il resto 1
const columns = (text: string) => [...text].reduce((sum, char) => sum + ((char.codePointAt(0) ?? 0) >= 0x1f300 ? 2 : 1), 0)

// Nodo disegnato dal motore: Button con `label`, altrimenti testo o contenitore con figli
type Node = string | { type: string; props?: { key?: string; label?: string }; children?: Node[] }

// Larghezza in colonne di una riga: somma di pulsanti (label), testi e contenitori affiancati
const widthOf = (node: Node): number => {
  if (typeof node === 'string') {
    return columns(node)
  }

  return node.type === 'Button' ? columns(node.props?.label ?? '') : (node.children ?? []).reduce((sum, child) => sum + widthOf(child), 0)
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

test('iconFor nerd: cartelle gialle, file per nome e per estensione, default per il resto', async () => {
  // Cartelle: stesso giallo, glifo diverso se aperta o chiusa; una colonna di larghezza
  expect(iconFor('src', 'dir', false, 'nerd')).toEqual({ glyph: '\u{e5ff}', color: '#e5c07b', width: 1 })
  expect(iconFor('src', 'dir', true, 'nerd')).toEqual({ glyph: '\u{e5fe}', color: '#e5c07b', width: 1 })
  // Per estensione, senza distinguere le maiuscole
  expect(iconFor('index.ts', 'file', false, 'nerd').glyph).toBe('\u{e628}')
  expect(iconFor('Main.PHP', 'file', false, 'nerd').glyph).toBe('\u{e608}')
  // Per nome esatto, prima dell'estensione: package.json non è un .json qualsiasi
  expect(iconFor('package.json', 'file', false, 'nerd').glyph).toBe('\u{e616}')
  expect(iconFor('data.json', 'file', false, 'nerd').glyph).toBe('\u{e60b}')
  expect(iconFor('.env.local', 'file', false, 'nerd').glyph).toBe('\u{f084}')
  expect(iconFor('Dockerfile', 'file', false, 'nerd').glyph).toBe('\u{e650}')
  // Estensione sconosciuta, file senza estensione e nomi che coincidono con il prototipo: icona di default
  const fallback = { glyph: '\u{f016}', color: '#7f848e', width: 1 }
  expect(iconFor('foto.xyz', 'file', false, 'nerd')).toEqual(fallback)
  expect(iconFor('Makefile', 'file', false, 'nerd')).toEqual(fallback)
  expect(iconFor('constructor', 'file', false, 'nerd')).toEqual(fallback)
})

test('iconFor simple: cartelle gialle ▪/▫, file ● con il colore della famiglia', async () => {
  expect(iconFor('src', 'dir', false, 'simple')).toEqual({ glyph: '▪', color: '#e5c07b', width: 1 })
  expect(iconFor('src', 'dir', true, 'simple')).toEqual({ glyph: '▫', color: '#e5c07b', width: 1 })
  // Stesso colore della tabella nerd (.ts blu, .php viola) e grigio di default
  expect(iconFor('index.ts', 'file', false, 'simple')).toEqual({ glyph: '●', color: '#61afef', width: 1 })
  expect(iconFor('Main.PHP', 'file', false, 'simple')).toEqual({ glyph: '●', color: '#a074c4', width: 1 })
  expect(iconFor('package.json', 'file', false, 'simple').color).toBe('#cb3837')
  expect(iconFor('foto.xyz', 'file', false, 'simple')).toEqual({ glyph: '●', color: '#7f848e', width: 1 })
})

test('iconFor emoji: larghe 2 colonne, un solo code point >= U+1F300 con Emoji_Presentation, senza colore', async () => {
  expect(iconFor('src', 'dir', false, 'emoji')).toEqual({ glyph: '📁', width: 2 })
  expect(iconFor('src', 'dir', true, 'emoji')).toEqual({ glyph: '📂', width: 2 })
  expect(iconFor('index.ts', 'file', false, 'emoji')).toEqual({ glyph: '🟦', width: 2 })
  expect(iconFor('Main.PHP', 'file', false, 'emoji').glyph).toBe('🐘')
  // Per nome esatto prima dell'estensione, e .env.* usa la voce di .env
  expect(iconFor('package.json', 'file', false, 'emoji').glyph).toBe('📦')
  expect(iconFor('data.json', 'file', false, 'emoji').glyph).toBe('📋')
  expect(iconFor('.env.local', 'file', false, 'emoji').glyph).toBe('🔧')
  expect(iconFor('foto.xyz', 'file', false, 'emoji')).toEqual({ glyph: '📄', width: 2 })
  expect(iconFor('constructor', 'file', false, 'emoji')).toEqual({ glyph: '📄', width: 2 })

  // Ogni glifo del set (tabella, cartelle e file di default) rispetta la regola
  const glyphs = [...Object.values(EMOJIS), '📁', '📂', '📄']
  expect(glyphs.length).toBeGreaterThan(30)
  for (const glyph of glyphs) {
    // Un solo code point, dal piano delle emoji in su, a presentazione emoji e senza variation selector
    expect([...glyph].length).toBe(1)
    expect(glyph.codePointAt(0) ?? 0).toBeGreaterThanOrEqual(0x1f300)
    expect(/^\p{Emoji_Presentation}$/u.test(glyph)).toBe(true)
    expect(glyph).not.toMatch(/[\u{fe00}-\u{fe0f}]/u)
  }
})

test('iconFor con un set sconosciuto usa le emoji', async () => {
  expect(iconFor('src', 'dir', false, 'altro')).toEqual(iconFor('src', 'dir', false, 'emoji'))
  expect(iconFor('index.ts', 'file', false, '')).toEqual(iconFor('index.ts', 'file', false, 'emoji'))
})

test('parentDir sale di un livello e si ferma alla radice', async () => {
  expect(parentDir('C:\\a\\b')).toBe('C:\\a')
  expect(parentDir('C:\\a')).toBe('C:\\')
  expect(parentDir('C:\\')).toBeUndefined()
  expect(parentDir('/home/x')).toBe('/home')
  expect(parentDir('/home')).toBe('/')
  expect(parentDir('/')).toBeUndefined()
  // Un separatore finale non cambia il risultato
  expect(parentDir('C:\\a\\b\\')).toBe('C:\\a')
})

test('absolutePath usa il separatore della cartella di lavoro', async () => {
  expect(absolutePath('C:\\Users\\m\\prog', 'src/lib')).toBe('C:\\Users\\m\\prog\\src\\lib')
  expect(absolutePath('/home/m/prog', 'src/lib')).toBe('/home/m/prog/src/lib')
  // Alla radice di un'unità il separatore non si raddoppia
  expect(absolutePath('C:\\', 'src')).toBe('C:\\src')
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

    // Intestazione con il nome della cartella e pulsanti cartella padre e aggiornamento
    expect(await ui.find({ text: 'mio-progetto/' })).toBeDefined()
    expect(await ui.find({ key: 'parent' })).toBeDefined()
    expect(await ui.find({ key: 'refresh' })).toBeDefined()
    // Cartelle cliccabili, chiuse, con l'emoji del set predefinito e i due pulsanti d'azione; .git e node_modules assenti
    expect(await ui.find({ key: 'dir:src', text: /├─ 📁 src\/$/ })).toBeDefined()
    expect(await ui.find({ key: 'open:src' })).toBeDefined()
    expect(await ui.find({ key: 'cd:src' })).toBeDefined()
    expect(await ui.find({ text: /node_modules|\.git/ })).toBeUndefined()
    // File cliccabile con la guida dell'ultima voce e l'emoji del tipo (.md); i file non hanno azioni
    expect(await ui.find({ key: 'file:README.md', text: /└─ 📝 README\.md$/ })).toBeDefined()
    expect(await ui.find({ key: 'open:README.md' })).toBeUndefined()
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

  // Corpo di 8 colonne: 6 utili; src/index.ts (guide, emoji, spazio e nome) e la riga dell'agente principale ci starebbero solo in 15 e 23
  const ui = await $.ui.mount({ plugin: 'info-panel', surface: 'terminal', component: 'Pane', requestId: 'info-panel', props: props(20, 8) })
  await ui.press({ key: 'dir:src' })
  const rows = (await rowsOf(ui)) as Node[]
  const lines = rows.filter(row => typeof row !== 'string' && /^(row|file|agent):/.test(row.props?.key ?? ''))

  // Tre voci in radice (le cartelle sono righe `row:`), il figlio di src e l'agente principale
  expect(lines.length).toBe(5)
  for (const row of lines) {
    expect(widthOf(row)).toBeLessThanOrEqual(6)
  }
})

// Un set per volta: la riga cartella con tre pulsanti, l'intestazione e i file restano entro bodyColumns - 2 a ogni larghezza
for (const icons of ['emoji', 'nerd', 'simple']) {
  test(`con il set ${icons} ogni riga sta in bodyColumns - 2, cartelle con tre pulsanti comprese`, { options: { icons } }, async ($, on) => {
    world(on)
    await $.session.start(START)

    for (const bodyColumns of [8, 11, 12, 14, 18, 24, 40]) {
      const ui = await $.ui.mount({ plugin: 'info-panel', surface: 'terminal', component: 'Pane', requestId: 'info-panel', props: props(20, bodyColumns) })
      await ui.press({ key: 'dir:src' })

      for (const row of (await rowsOf(ui)) as Node[]) {
        expect(widthOf(row)).toBeLessThanOrEqual(bodyColumns - 2)
      }
      await ui.unmount()
    }
  })
}

// L'opzione `icons` decide il set con cui si disegna l'albero; un valore sconosciuto vale emoji
for (const [icons, expected] of [['nerd', /├─ \u{e5ff} src\/$/u], ['simple', /├─ ▪ src\/$/u], ['xyz', /├─ 📁 src\/$/u]] as const) {
  test(`l'opzione icons "${icons}" sceglie le icone dell'albero`, { options: { icons } }, async ($, on) => {
    world(on)
    await $.session.start(START)

    const ui = await $.ui.mount({ plugin: 'info-panel', surface: 'terminal', component: 'Pane', requestId: 'info-panel', props: props(20) })
    expect(await ui.find({ key: 'dir:src', text: expected })).toBeDefined()
  })
}

test('la riga cartella ha tre pulsanti con chiavi distinte e occupa tutta la larghezza con nome troncato', async ($, on) => {
  world(on)
  await $.session.start(START)

  // 18 colonne utili: guide 3 + emoji 2 + spazio 1 + nome + 4 di azioni; "documentazione" si tronca
  const ui = await $.ui.mount({ plugin: 'info-panel', surface: 'terminal', component: 'Pane', requestId: 'info-panel', props: props(20, 14) })
  const rows = (await rowsOf(ui)) as Node[]
  const row = rows.find(one => typeof one !== 'string' && one.props?.key === 'row:docs') as Exclude<Node, string>

  // Tre pulsanti (nome, ↗, →) con le chiavi dir:, open: e cd: seguite dal percorso
  const keys = (row.children ?? []).filter(child => typeof child !== 'string' && child.type === 'Button').map(child => (child as Exclude<Node, string>).props?.key)
  expect(keys).toEqual(['dir:docs', 'open:docs', 'cd:docs'])
  // Con 12 colonne utili: 3 di guide, 2 di emoji, 1 di spazio, 2 per il nome e 4 per le azioni
  expect(widthOf(row)).toBe(12)
  expect(await ui.find({ key: 'dir:docs', text: /├─ 📁 d…$/ })).toBeDefined()
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
  expect(await ui.find({ key: 'dir:src', text: /📂 src\/$/ })).toBeDefined()

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

// Il motore sotto process.run e ui.toast: registra gli avvii e i toast; process.run risponde 1, come explorer.exe quando apre
const explorer = (on: On, deny?: string) => {
  const runs: (readonly string[])[] = []
  const toasts: string[] = []
  on('process.run', (_$, e) => {
    runs.push(e.argv)

    return deny ? { deny } : { value: { exitCode: 1, stdout: '', stderr: '' } as never }
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })

  return { runs, toasts }
}

// Il motore sotto il comando integrato /cd: registra gli argomenti; con `deny` lo rifiuta
const cdCommand = (on: On, deny?: string) => {
  const cds: string[] = []
  on('command.run', { command: 'cd' }, (_$, e) => {
    cds.push(e.args)

    return deny ? { deny } : { text: '' }
  })

  return cds
}

test('il pulsante ↗ apre Esplora risorse sulla cartella senza cambiarne lo stato', async ($, on) => {
  world(on)
  const { runs, toasts } = explorer(on)
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: 'info-panel', surface: 'terminal', component: 'Pane', requestId: 'info-panel', props: props(20) })
  await ui.press({ key: 'open:src' })

  // Percorso Windows assoluto: cwd + \ + cartella; la cartella resta chiusa e nessun errore
  expect(runs).toEqual([['explorer.exe', 'C:\\Users\\maurizio\\Claude\\mio-progetto\\src']])
  expect(toasts).toEqual([])
  expect(await ui.find({ text: 'index.ts' })).toBeUndefined()
})

test('se Esplora risorse non si può aprire il toast dice anche il motivo', async ($, on) => {
  world(on)
  const { toasts } = explorer(on, 'comandi non consentiti')
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: 'info-panel', surface: 'terminal', component: 'Pane', requestId: 'info-panel', props: props(20) })
  await ui.press({ key: 'open:src' })

  expect(toasts.length).toBe(1)
  expect(toasts[0]).toMatch(/^Impossibile aprire Esplora risorse: .*comandi non consentiti/)
})

test('il pulsante → lancia /cd sul percorso assoluto della cartella', async ($, on) => {
  world(on)
  const cds = cdCommand(on)
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: 'info-panel', surface: 'terminal', component: 'Pane', requestId: 'info-panel', props: props(20) })
  await ui.press({ key: 'cd:src' })

  expect(cds).toEqual(['C:\\Users\\maurizio\\Claude\\mio-progetto\\src'])
})

test('il pulsante ↑ lancia /cd sulla cartella padre', async ($, on) => {
  world(on)
  const cds = cdCommand(on)
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: 'info-panel', surface: 'terminal', component: 'Pane', requestId: 'info-panel', props: props(20) })
  await ui.press({ key: 'parent' })

  expect(cds).toEqual(['C:\\Users\\maurizio\\Claude'])
})

test('se /cd non si può eseguire compare un toast con il motivo', async ($, on) => {
  world(on)
  // Nessun comando cd sotto il mod: la chiamata viene rifiutata come per un comando sconosciuto
  const { toasts } = explorer(on)
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: 'info-panel', surface: 'terminal', component: 'Pane', requestId: 'info-panel', props: props(20) })
  await ui.press({ key: 'cd:src' })

  expect(toasts.length).toBe(1)
  expect(toasts[0]).toMatch(/^Impossibile cambiare cartella: .+/)
})

test('alla radice dell unità ↑ non lancia /cd e avvisa', async ($, on) => {
  const { dir } = world(on)
  dir.value = 'C:\\'
  const cds = cdCommand(on)
  const { toasts } = explorer(on)
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: 'info-panel', surface: 'terminal', component: 'Pane', requestId: 'info-panel', props: props(20) })
  // Il pulsante c'è anche alla radice, ma non fa nulla
  await ui.press({ key: 'parent' })

  expect(cds).toEqual([])
  expect(toasts).toEqual(['Già alla radice: non c\'è una cartella padre'])
})

test('un cambio di cartella di lavoro (/cd) azzera l albero e rilegge la radice', async ($, on) => {
  const { clock, listed, dir } = world(on)
  // Esplora risorse finto, registrato prima del primo uso di `$`
  const { runs } = explorer(on)
  await $.session.start(START)

  // Apre src: lo stato da azzerare
  const ui = await $.ui.mount({ plugin: 'info-panel', surface: 'terminal', component: 'Pane', requestId: 'info-panel', props: props(20) })
  await ui.press({ key: 'dir:src' })
  expect(await ui.find({ text: 'index.ts' })).toBeDefined()
  expect(await ui.find({ text: 'mio-progetto/' })).toBeDefined()

  // Senza cambi il timer non rilegge nulla
  const before = listed.filter(path => path === '').length
  await clock.advance(1000)
  expect(listed.filter(path => path === '').length).toBe(before)
  expect(await ui.find({ text: 'index.ts' })).toBeDefined()

  // La sessione passa a un'altra cartella: al prossimo secondo l'albero riparte chiuso, con la nuova intestazione e la radice riletta
  dir.value = 'C:\\Users\\maurizio\\Claude\\altro-progetto'
  await clock.advance(1000)
  expect(await ui.find({ text: 'index.ts' })).toBeUndefined()
  expect(await ui.find({ text: 'mio-progetto/' })).toBeUndefined()
  expect(await ui.find({ text: 'altro-progetto/' })).toBeDefined()
  expect(listed.filter(path => path === '').length).toBe(before + 1)
  // Le voci della radice ci sono, con src chiusa
  expect(await ui.find({ key: 'dir:src', text: /📁 src\/$/ })).toBeDefined()

  // Le azioni ora lavorano sulla nuova cartella
  await ui.press({ key: 'open:src' })
  expect(runs).toEqual([['explorer.exe', 'C:\\Users\\maurizio\\Claude\\altro-progetto\\src']])
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
