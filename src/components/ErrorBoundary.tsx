import { Component, type ReactNode } from 'react'

const RELOAD_KEY = 'rumbo-chunk-reload'

/** Tras publicar una versión nueva, una pestaña abierta puede pedir un trozo de JS que ya no existe. */
const isChunkError = (e: unknown) => /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(String(e))

/** Si una pantalla falla, muestra un aviso con opción de reintentar en vez de dejar la app en blanco. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown) {
    if (isChunkError(error)) {
      // Una sola recarga automática para coger la versión nueva (evita bucles si el fallo persiste).
      try {
        if (!sessionStorage.getItem(RELOAD_KEY)) {
          sessionStorage.setItem(RELOAD_KEY, '1')
          location.reload()
        }
      } catch {
        /* sin almacenamiento: se muestra el aviso */
      }
    }
    console.error(error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <div className="label-code text-accent-deep">Error de telemetría</div>
        <h1 className="headline-lg mt-3">Algo ha fallado</h1>
        <p className="mt-3 text-ink-soft">
          {isChunkError(this.state.error) ? 'Hay una versión nueva de la app. Recarga la página para usarla.' : 'Esta pantalla no se ha podido mostrar. Tus datos están a salvo.'}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button className="btn btn-dark" onClick={() => location.reload()}>
            Recargar
          </button>
          <button className="btn btn-ghost" onClick={() => this.setState({ error: null })}>
            Reintentar
          </button>
        </div>
        <pre className="mt-6 overflow-auto rounded-sm bg-surface-low p-3 text-left text-xs text-ink-soft">{String(this.state.error)}</pre>
      </div>
    )
  }
}
