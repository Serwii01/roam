import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { dismissInstall, installDismissed, promptInstall, useInstall } from '../lib/pwa'
import { Icon } from './Icon'

const HOUR = 60 * 60 * 1000

// Encima de las pestañas del móvil (y de la zona segura del iPhone); en escritorio, en la esquina.
const floating = 'fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md xl:inset-x-auto xl:right-6 xl:bottom-6'

/** Registra el service worker y avisa cuando hay una versión nueva o la app ya funciona sin conexión. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    // Una app instalada puede pasar días abierta: se busca versión nueva cada hora.
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => registration.update().catch(() => {}), HOUR)
    },
  })

  useEffect(() => {
    if (!offlineReady) return
    const id = setTimeout(() => setOfflineReady(false), 4000)
    return () => clearTimeout(id)
  }, [offlineReady, setOfflineReady])

  if (needRefresh)
    return (
      <div role="status" className={`${floating} flex items-center gap-3 rounded-md bg-ink p-3 pl-4 text-white shadow-2xl`}>
        <Icon name="refresh" size={20} className="text-accent-soft" />
        <span className="mr-auto text-sm">Hay una versión nueva de ROAM.</span>
        <button className="btn btn-ghost px-3! py-1.5! text-white!" onClick={() => setNeedRefresh(false)}>
          Luego
        </button>
        <button className="btn btn-accent px-3! py-1.5!" onClick={() => updateServiceWorker(true)}>
          Actualizar
        </button>
      </div>
    )
  if (offlineReady)
    return (
      <div role="status" className={`${floating} flex items-center gap-3 rounded-md bg-ink p-3 pl-4 text-sm text-white shadow-2xl`}>
        <Icon name="check_circle" size={20} className="text-accent-soft" />
        ROAM ya se puede abrir sin conexión.
      </div>
    )
  return null
}

/** Pasos para instalar en iPhone/iPad, donde Safari no tiene botón de instalar. */
function IosSteps() {
  return (
    <ol className="mt-1 space-y-1 text-sm text-ink-soft">
      <li>
        1. Pulsa <Icon name="ios_share" size={16} className="align-[-3px] text-ink" /> <b className="text-ink">Compartir</b> en la barra de Safari.
      </li>
      <li>
        2. Elige <Icon name="add_box" size={16} className="align-[-3px] text-ink" /> <b className="text-ink">Añadir a pantalla de inicio</b>.
      </li>
    </ol>
  )
}

/** Aviso en el móvil para instalar ROAM como app. Se puede cerrar y no vuelve a salir en un mes. */
export function InstallBanner() {
  const { standalone, canPrompt, ios } = useInstall()
  const [hidden, setHidden] = useState(installDismissed)
  if (standalone || hidden || !(canPrompt || ios)) return null
  const close = () => {
    dismissInstall()
    setHidden(true)
  }
  return (
    <div className={`${floating} rounded-md bg-card p-4 shadow-2xl ring-1 ring-surface-highest xl:hidden`}>
      <div className="flex items-start gap-3">
        <img src="/favicon.svg" alt="" className="h-10 w-10 shrink-0" />
        <div className="mr-auto">
          <div className="font-display font-semibold">Instala ROAM en tu móvil</div>
          {ios ? <IosSteps /> : <p className="text-sm text-ink-soft">Ábrela desde la pantalla de inicio, a pantalla completa y también sin conexión.</p>}
        </div>
        <button aria-label="Cerrar" className="-m-1 p-1 text-ink-soft" onClick={close}>
          <Icon name="close" size={20} />
        </button>
      </div>
      {canPrompt && (
        <button className="btn btn-accent mt-3 w-full" onClick={() => promptInstall().then((ok) => ok && setHidden(true))}>
          <Icon name="install_mobile" size={18} /> Instalar app
        </button>
      )}
    </div>
  )
}

/** Tarjeta de Ajustes: instalar la app o cómo hacerlo, en cualquier momento. */
export function InstallCard() {
  const { standalone, canPrompt, ios } = useInstall()
  return (
    <div className="card mt-6 flex flex-wrap items-center gap-3 p-6">
      <div className="mr-auto">
        <div className="font-display font-semibold">App en el móvil</div>
        {standalone ? (
          <div className="text-sm text-ink-soft">Estás usando ROAM como app instalada.</div>
        ) : ios ? (
          <IosSteps />
        ) : canPrompt ? (
          <div className="text-sm text-ink-soft">Instala ROAM para abrirla desde la pantalla de inicio, también sin conexión.</div>
        ) : (
          <div className="text-sm text-ink-soft">
            Desde Chrome en Android: menú <Icon name="more_vert" size={16} className="align-[-3px] text-ink" /> → <b className="text-ink">Instalar aplicación</b>. En
            iPhone, desde Safari: Compartir → <b className="text-ink">Añadir a pantalla de inicio</b>.
          </div>
        )}
      </div>
      {canPrompt && !standalone && (
        <button className="btn btn-accent" onClick={() => promptInstall()}>
          <Icon name="install_mobile" size={18} /> Instalar app
        </button>
      )}
    </div>
  )
}
