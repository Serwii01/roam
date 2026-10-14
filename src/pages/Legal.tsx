// Textos legales (RGPD / LOPDGDD / LSSI-CE) y créditos de terceros. Son PLANTILLAS: los datos del
// titular salen de las variables VITE_LEGAL_* (ver .env.example). Conviene que los revise un profesional.
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/AppShell'

const env = import.meta.env as Record<string, string | undefined>
const OWNER = env.VITE_LEGAL_NAME
const EMAIL = env.VITE_LEGAL_EMAIL
const NIF = env.VITE_LEGAL_NIF
const ADDRESS = env.VITE_LEGAL_ADDRESS
const UPDATED = '15 de octubre de 2026'
const complete = Boolean(OWNER && EMAIL)

/** Dato del titular, o un marcador visible si falta configurarlo. */
function V({ value, label }: { value?: string; label: string }) {
  return value ? <>{value}</> : <mark className="rounded-xs bg-accent-soft px-1 font-semibold text-accent-ink">[{label}]</mark>
}

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
        <Logo />
        <Link to="/" className="label-code text-ink-soft hover:text-ink">
          Volver
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-20">
        {!complete && (
          <div className="mb-6 rounded-sm border border-accent-soft bg-accent-soft/40 px-4 py-3 text-sm text-accent-ink">
            <b>Plantilla sin completar.</b> Define VITE_LEGAL_NAME y VITE_LEGAL_EMAIL (y si procede VITE_LEGAL_NIF y VITE_LEGAL_ADDRESS) antes de publicar.
          </div>
        )}
        <div className="label-stamp text-accent-deep">Última actualización: {UPDATED}</div>
        <h1 className="headline-lg mt-2">{title}</h1>
        <article className="mt-8 space-y-6 leading-relaxed [&_a]:text-accent-deep [&_a]:underline [&_h2]:headline-sm [&_h2]:mt-8 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
          {children}
        </article>
        <LegalFooter />
      </main>
    </div>
  )
}

export function LegalFooter() {
  return (
    <nav className="label-code mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-surface-highest pt-6 text-ink-soft">
      <Link to="/privacidad">Privacidad</Link>
      <Link to="/aviso-legal">Aviso legal</Link>
      <Link to="/terminos">Términos</Link>
      <Link to="/creditos">Créditos y licencias</Link>
    </nav>
  )
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Política de privacidad">
      <h2>1. Responsable</h2>
      <p>
        <V value={OWNER} label="NOMBRE O RAZÓN SOCIAL" />
        {NIF && <> · NIF {NIF}</>}
        {ADDRESS && <> · {ADDRESS}</>} · Contacto: <V value={EMAIL} label="EMAIL DE CONTACTO" />.
      </p>

      <h2>2. Qué datos tratamos</h2>
      <ul>
        <li>
          <b>Cuenta:</b> email y contraseña (la contraseña se guarda cifrada por el proveedor de autenticación; nadie puede leerla).
        </li>
        <li>
          <b>Perfil:</b> nombre visible, nombre de usuario, foto o monigote, bio, país y ciudad de origen.
        </li>
        <li>
          <b>Viajes:</b> títulos, fechas, paradas con su ubicación, región y provincia, medios de transporte, aeropuertos, notas, valoraciones,
          etiquetas, fotos que subas y enlaces de música.
        </li>
        <li>
          <b>Pasaportes:</b> solo país emisor y fechas de expedición y caducidad. No pedimos ni guardamos el número de pasaporte.
        </li>
        <li>
          <b>Lugares marcados</b> y lista de deseos.
        </li>
      </ul>
      <p>No usamos tus datos para publicidad ni los vendemos. No elaboramos perfiles comerciales.</p>

      <h2>3. Para qué y con qué base</h2>
      <ul>
        <li>
          Prestarte el servicio (guardar y mostrarte tus viajes, mapas y estadísticas): ejecución del contrato que aceptas al registrarte (art.
          6.1.b RGPD).
        </li>
        <li>
          Mostrar tu perfil a otras personas, solo si activas «Perfil público»: tu consentimiento (art. 6.1.a), que puedes retirar desactivándolo.
          Los pasaportes nunca se muestran.
        </li>
        <li>Seguridad y prevención de abusos: interés legítimo (art. 6.1.f).</li>
      </ul>

      <h2>4. Quién más interviene</h2>
      <ul>
        <li>
          <b>Supabase</b> (base de datos, autenticación y almacenamiento de fotos), como encargado del tratamiento, con los datos alojados en la
          Unión Europea.
        </li>
        <li>
          <b>Proveedor de alojamiento web</b> de la aplicación (sirve los archivos de la web; puede registrar la IP en sus registros técnicos).
        </li>
      </ul>
      <p>Al usar ciertas funciones, tu navegador se conecta directamente con estos servicios, que reciben tu dirección IP:</p>
      <ul>
        <li>
          <b>OpenFreeMap</b>, al ver el mapa moderno (teselas del mapa).
        </li>
        <li>
          <b>Photon (komoot)</b>, al buscar un lugar, con el texto que escribes.
        </li>
        <li>
          <b>Nominatim (Fundación OpenStreetMap)</b>, al elegir un lugar, con sus coordenadas, para saber su región y provincia.
        </li>
        <li>
          <b>Spotify</b>, solo si pulsas un reproductor o pegas un enlace en el editor. Spotify puede usar sus propias cookies según su política.
        </li>
      </ul>

      <h2>5. Cuánto tiempo</h2>
      <p>Mientras tengas la cuenta. Si la borras, eliminamos tu perfil, tus viajes, tus fotos y el resto de tus datos de forma inmediata.</p>

      <h2>6. Tus derechos</h2>
      <p>
        Puedes acceder, rectificar, suprimir, oponerte, limitar el tratamiento y pedir la portabilidad de tus datos. Desde{' '}
        <b>Perfil y ajustes → Tus datos</b> puedes descargar una copia completa (JSON) y borrar tu cuenta. Para cualquier otra solicitud, escribe
        a <V value={EMAIL} label="EMAIL DE CONTACTO" />. Si crees que no hemos atendido bien tu solicitud, puedes reclamar ante la{' '}
        <a href="https://www.aepd.es" target="_blank" rel="noreferrer">
          Agencia Española de Protección de Datos
        </a>
        .
      </p>

      <h2>7. Cookies y almacenamiento local</h2>
      <p>
        Solo usamos almacenamiento técnico imprescindible: la sesión iniciada, tus preferencias y una caché de búsquedas de lugares. No hay
        cookies de análisis ni de publicidad, por lo que no es necesario pedir consentimiento (art. 22.2 LSSI-CE). Las fuentes y los iconos se
        sirven desde la propia aplicación.
      </p>

      <h2>8. Edad mínima</h2>
      <p>Debes tener al menos 14 años para crear una cuenta (art. 7 LOPDGDD).</p>

      <h2>9. Seguridad</h2>
      <p>
        Las comunicaciones van cifradas (HTTPS). En la base de datos, cada usuario solo puede leer y modificar sus propios datos, salvo lo que haga
        público. Las fotos se guardan en un almacenamiento privado y se muestran con enlaces temporales.
      </p>
    </LegalLayout>
  )
}

export function LegalNoticePage() {
  return (
    <LegalLayout title="Aviso legal">
      <h2>Titular</h2>
      <p>
        En cumplimiento del art. 10 de la Ley 34/2002 (LSSI-CE): titular <V value={OWNER} label="NOMBRE O RAZÓN SOCIAL" />
        {NIF ? <>, NIF {NIF}</> : <>, NIF <V label="NIF (si realizas actividad económica)" /></>}
        {ADDRESS ? <>, domicilio en {ADDRESS}</> : <>, domicilio <V label="DIRECCIÓN (si realizas actividad económica)" /></>}. Contacto:{' '}
        <V value={EMAIL} label="EMAIL DE CONTACTO" />.
      </p>
      <h2>Objeto</h2>
      <p>ROAM es una aplicación web gratuita para registrar viajes, rutas, países y regiones visitados.</p>
      <h2>Propiedad intelectual</h2>
      <p>
        El diseño y el código de la aplicación pertenecen a su titular. Los datos geográficos, mapas, banderas, iconos, fuentes y avatares son de
        terceros y se usan según sus licencias, detalladas en <Link to="/creditos">Créditos y licencias</Link>. El contenido que subes sigue
        siendo tuyo.
      </p>
      <h2>Responsabilidad</h2>
      <p>
        La información geográfica (fronteras, aeropuertos, distancias) es orientativa y procede de fuentes abiertas; puede contener errores. Las
        fronteras mostradas no implican ninguna postura sobre territorios en disputa.
      </p>
      <h2>Legislación</h2>
      <p>Se rige por la legislación española.</p>
    </LegalLayout>
  )
}

export function TermsPage() {
  return (
    <LegalLayout title="Términos de uso">
      <h2>1. El servicio</h2>
      <p>
        ROAM es gratuito y se ofrece «tal cual», sin garantía de disponibilidad continua. Podemos cambiar o retirar funciones avisando con
        antelación razonable cuando afecten a tus datos.
      </p>
      <h2>2. Tu cuenta</h2>
      <ul>
        <li>Debes tener al menos 14 años y dar un email válido.</li>
        <li>Eres responsable de mantener tu contraseña en secreto.</li>
        <li>Puedes borrar tu cuenta cuando quieras desde Perfil y ajustes.</li>
      </ul>
      <h2>3. Tu contenido</h2>
      <p>
        Lo que subes (textos, fotos, enlaces) es tuyo. Nos das permiso solo para guardarlo y mostrártelo, y para mostrarlo a otros si haces tu
        perfil público. Debes tener derecho a lo que subes y no publicar datos de otras personas sin su permiso.
      </p>
      <h2>4. Usos no permitidos</h2>
      <ul>
        <li>Contenido ilegal, ofensivo o que vulnere derechos de terceros.</li>
        <li>Automatizar peticiones o intentar acceder a datos de otros usuarios.</li>
        <li>Usar la aplicación para sobrecargar los servicios de mapas o búsqueda de terceros.</li>
      </ul>
      <h2>5. Baja y suspensión</h2>
      <p>Podemos suspender cuentas que incumplan estos términos. Tú puedes darte de baja borrando tu cuenta.</p>
      <h2>6. Contacto</h2>
      <p>
        <V value={EMAIL} label="EMAIL DE CONTACTO" />
      </p>
    </LegalLayout>
  )
}

const CREDITS: { what: string; who: string; license: string; url: string; note?: string }[] = [
  { what: 'Datos de mapas y búsqueda de lugares', who: '© colaboradores de OpenStreetMap', license: 'ODbL 1.0', url: 'https://www.openstreetmap.org/copyright' },
  { what: 'Mapa base moderno', who: 'OpenFreeMap · © OpenMapTiles', license: 'Datos ODbL; estilo BSD', url: 'https://openfreemap.org' },
  { what: 'Búsqueda de lugares', who: 'Photon (komoot)', license: 'Servicio gratuito de uso razonable', url: 'https://photon.komoot.io' },
  { what: 'Región y provincia de cada lugar', who: 'Nominatim · Fundación OpenStreetMap', license: 'Política de uso de Nominatim', url: 'https://operations.osmfoundation.org/policies/nominatim/' },
  { what: 'Fronteras de países y regiones', who: 'Natural Earth', license: 'Dominio público', url: 'https://www.naturalearthdata.com', note: 'Países vía world-atlas (ISC, Mike Bostock); simplificados.' },
  { what: 'Aeropuertos', who: 'OurAirports', license: 'Dominio público', url: 'https://ourairports.com/data/' },
  { what: 'Regiones y provincias ISO 3166-2', who: 'Debian iso-codes (Tobias Quathamer y colaboradores)', license: 'LGPL-2.1-or-later', url: 'https://salsa.debian.org/iso-codes-team/iso-codes', note: 'Convertidas a la base de datos de la app.' },
  { what: 'Nombres de países en español', who: 'i18n-iso-countries', license: 'MIT', url: 'https://github.com/michaelwittig/node-i18n-iso-countries' },
  { what: 'Banderas', who: 'flag-icons (Panayiotis Lipiridis)', license: 'MIT', url: 'https://github.com/lipis/flag-icons' },
  { what: 'Avatares por defecto', who: '«Croodles» de Vijay Verma, vía DiceBear', license: 'CC BY 4.0', url: 'https://www.dicebear.com/styles/croodles/', note: 'Modificados: colores de fondo y de pelo.' },
  { what: 'Iconos', who: 'Material Symbols (Google)', license: 'Apache 2.0', url: 'https://fonts.google.com/icons' },
  { what: 'Tipografías', who: 'Space Grotesk y Plus Jakarta Sans', license: 'SIL Open Font License 1.1', url: 'https://fontsource.org' },
  { what: 'Motor de mapas', who: 'MapLibre GL JS', license: 'BSD-3-Clause', url: 'https://maplibre.org' },
  { what: 'Música', who: 'Spotify (reproductor embebido)', license: 'Términos de Spotify', url: 'https://developer.spotify.com/terms' },
]

export function CreditsPage() {
  return (
    <LegalLayout title="Créditos y licencias">
      <p>ROAM se apoya en datos y herramientas abiertas. Gracias a quienes las crean y mantienen.</p>
      <div className="divide-y divide-surface-highest rounded-md bg-card shadow-[var(--shadow-card)]">
        {CREDITS.map((c) => (
          <div key={c.what} className="grid gap-1 px-5 py-4 sm:grid-cols-[1fr_auto] sm:gap-4">
            <div>
              <div className="label-stamp text-ink-soft">{c.what}</div>
              <a href={c.url} target="_blank" rel="noreferrer" className="font-display font-semibold">
                {c.who}
              </a>
              {c.note && <div className="text-sm text-ink-soft">{c.note}</div>}
            </div>
            <div className="label-code self-center text-accent-deep">{c.license}</div>
          </div>
        ))}
      </div>
      <p className="text-sm text-ink-soft">
        Los textos completos de las licencias que lo requieren están en el repositorio, en <code>THIRD_PARTY_NOTICES.md</code> y la carpeta{' '}
        <code>licenses/</code>.
      </p>
    </LegalLayout>
  )
}
