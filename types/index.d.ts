// Una voce di una cartella: nome e tipo, come li restituisce $.fs.list
export type TreeEntry = { name: string; kind: 'file' | 'dir' | 'other' }

// Una riga della sezione agenti: id, etichetta da mostrare, stato (AgentStatus) ed eventuale agente padre
export type AgentRow = { id: string; label: string; status: string; parentId?: string }

declare module 'claude-code' {
  interface PluginState {
    'info-panel': {
      // Percorso relativo ('' = radice) -> figli già filtrati e ordinati
      listings: Record<string, TreeEntry[]>
      // Percorsi relativi delle cartelle aperte
      expanded: string[]
      // Prima riga visibile dell'albero
      treeOffset: number
      // Ultima lettura di $.agent.list()
      agents: AgentRow[]
      // agentId -> modello in uso; chiave 'main' per l'agente principale
      models: Record<string, string>
      // True mentre l'agente principale lavora a un turno
      isMainRunning: boolean
      // Fotogramma dello spinner
      frame: number
      // Nome della cartella di lavoro, per l'intestazione
      rootName: string
      // Percorso assoluto della cartella di lavoro, per accorgersi di un /cd
      cwd: string
      // Versione del mod, dal suo plugin.json, mostrata in fondo al pannello
      version: string
    }
  }
}
