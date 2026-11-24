// Todo lo que hace ROAM, por temas, para la portada. Al añadir o quitar una función de la app, actualízalo aquí.

export interface FeatureGroup {
  id: string
  icon: string
  title: string
  text: string
  items: [name: string, text: string][]
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    id: 'mapa',
    icon: 'public',
    title: 'Mapa y territorios',
    text: 'Dónde has estado, del continente a la provincia.',
    items: [
      ['Plano, globo 3D y mapa de calor', 'Tres formas de ver el mismo mapa.'],
      ['Países visitados', '249 países y territorios que se colorean solos con tus viajes. También puedes marcarlos a mano.'],
      ['Regiones y provincias', '5.046 subdivisiones: se marcan con cada parada o tocando el mapa del país.'],
      ['Rutas en el mapa', 'Los vuelos en arco y cada tramo con su distancia.'],
      ['Siete medios de transporte', 'Avión, tren, coche, autobús, barco, bici o a pie.'],
      ['Aeropuertos', '5.332 con código IATA, con los más cercanos a cada ciudad.'],
      ['Ficha de cada país', 'Su mapa, tus regiones y tus viajes por allí.'],
      ['Tu huella por años', 'Filtra el mapa por año y mira qué parte del mundo llevas.'],
      ['Exportar KML', 'Lleva tus rutas a Google Earth o Google My Maps.'],
    ],
  },
  {
    id: 'planificar',
    icon: 'edit_calendar',
    title: 'Crear y planificar',
    text: 'De la primera idea al viaje listo para salir.',
    items: [
      ['Asistente por pasos', 'Viaje, ruta, día a día, recuerdos y resumen. Se guarda solo.'],
      ['Planificado o realizado', 'Lo que planeas no cuenta como visitado hasta que lo haces.'],
      ['Dieciséis tipos de viaje', 'De mochilero a escapada urbana, en solitario o acompañado.'],
      ['Paradas arrastrables', 'Cambia el orden de la ruta y reparte las fechas entre las paradas.'],
      ['Alojamientos', 'Con sugerencias, ubicación, entrada y salida, localizador y enlace de la reserva.'],
      ['Vuelos por su número', 'Escribe IB6251 y busca los aeropuertos.'],
      ['Reservas desde un correo', 'Pega el texto o sube el .eml. Se lee en tu dispositivo y lo revisas antes de guardar.'],
      ['Equipaje', 'Plantillas y sugerencias según el destino y el tiempo.'],
      ['Documentos', 'Billetes, reservas y seguros del viaje en un sitio.'],
      ['El tiempo', 'Por parada, por día y del viaje entero.'],
      ['Presupuesto', 'Un total para el viaje y cuánto llevas gastado.'],
      ['Calendario', 'Descarga un viaje o suscríbete a todos desde iPhone, Google u Outlook.'],
    ],
  },
  {
    id: 'dias',
    icon: 'calendar_month',
    title: 'Día a día',
    text: 'Cada jornada con sus sitios, sus horas y sus trayectos.',
    items: [
      ['Buscador de sitios', 'Monumentos, barrios, bares y miradores de Wikipedia y OpenStreetMap.'],
      ['Ideas por zonas', 'Grupos de sitios que se recorren andando, sin repetir lo de otros días.'],
      ['Fotos de los sitios', 'De Wikipedia y Wikimedia Commons, con su autoría.'],
      ['Horas y orden', 'Arrastra para ordenar; al poner una hora, el sitio se coloca donde toca.'],
      ['Tiempo entre sitios', 'Cuánto se tarda andando o en transporte, y aviso si las horas no dan.'],
      ['Ordenar por cercanía', 'Propone un orden con menos rodeos para los sitios sin hora.'],
      ['Notas entre sitios', 'Un descanso, una comida o lo que quieras recordar.'],
      ['Vuelos y hotel integrados', 'Salidas, llegadas y a qué hora estarás más o menos en el alojamiento.'],
      ['Ruta en Google Maps', 'Abre el día entero con las coordenadas exactas.'],
    ],
  },
  {
    id: 'ruta',
    icon: 'explore',
    title: 'Durante el viaje',
    text: 'Lo que necesitas en la calle, con una mano.',
    items: [
      ['Pantalla «Hoy»', 'Lo siguiente del plan, cómo llegar y «Ya lo he visto».'],
      ['Dónde duermes y lo de mañana', 'Sin tener que buscar la reserva.'],
      ['Lo básico del país', 'Emergencias, enchufes y adaptador, lado de conducción, prefijo y moneda de más de 60 destinos.'],
      ['Sello al llegar', 'Al abrir la app en un país del viaje. Tu ubicación no sale del móvil.'],
      ['Gasto rápido', 'Apúntalo en segundos, con la categoría puesta según lo que escribas.'],
      ['Visor de documentos', 'Tus PDF se abren en la app, también en modo avión.'],
    ],
  },
  {
    id: 'gastos',
    icon: 'payments',
    title: 'Gastos y cuentas',
    text: 'Quién ha pagado qué y cómo quedar en paz.',
    items: [
      ['Tu saldo arriba', 'Te deben, debes o estás en paz.'],
      ['Cuatro formas de repartir', 'A partes iguales, por porcentaje, por importe o por partes.'],
      ['Varias monedas', 'Cada gasto en la suya, con su tipo de cambio.'],
      ['Los mínimos pagos', 'Quién paga a quién para saldarlo todo, al céntimo.'],
      ['Pagos y efectivo', 'Registra cualquier pago; lo confirma quien lo recibe.'],
      ['Compañeros sin cuenta', 'Entran en el reparto aunque no usen ROAM.'],
      ['Foto del ticket', 'Guardada junto al gasto.'],
      ['Avisos de repetidos', 'Para no apuntar dos veces la misma cena.'],
      ['Buscador y categorías', 'Encuentra un gasto y mira en qué se va el dinero, por día y por persona.'],
      ['Historial y recuperación', 'Qué cambió y quién, con opción de recuperar lo borrado.'],
      ['Cerrar cuentas', 'Al terminar, se cierran; se pueden reabrir.'],
      ['CSV e informe PDF', 'Y un resumen para pegar en el grupo.'],
    ],
  },
  {
    id: 'recuerdos',
    icon: 'photo_library',
    title: 'Bitácora y recuerdos',
    text: 'El diario que se escribe casi solo.',
    items: [
      ['Notas, valoraciones y etiquetas', 'En cada parada del viaje.'],
      ['Fotos', 'Colocadas por parada, también las HEIC del iPhone.'],
      ['Banda sonora', 'Una canción, un álbum o una playlist de Spotify.'],
      ['Revive tu viaje', 'La ruta animada sobre el globo, con fotos, sellos y kilómetros.'],
      ['Tal día como hoy', 'Un recuerdo cuando se cumplen años de una llegada.'],
      ['Viaje en PDF', 'Exporta la bitácora para imprimirla o guardarla.'],
      ['Bucket list', 'Los países que quieres visitar.'],
    ],
  },
  {
    id: 'pasaporte',
    icon: 'approval',
    title: 'Pasaporte y logros',
    text: 'Lo que has recorrido, en sellos y cifras.',
    items: [
      ['Sellos de inmigración', 'Uno por llegada, con su aeropuerto y su fecha.'],
      ['Libreta en PDF', 'Tu pasaporte completo para descargar.'],
      ['Más de 40 insignias', 'De exploración, distancia, transporte, ritmo y recuerdos.'],
      ['Resumen del año', 'Kilómetros, países nuevos, vuelo más largo y puntos extremos.'],
      ['Estadísticas', 'Meses más viajeros, transportes y aeropuertos.'],
      ['Tus pasaportes reales', 'Controla sus caducidades. Son privados siempre.'],
    ],
  },
  {
    id: 'compania',
    icon: 'group',
    title: 'En compañía',
    text: 'Viajar juntos y enseñarlo después.',
    items: [
      ['Viajes compartidos', 'Invita con un enlace y editad el mismo plan.'],
      ['Gastos en vivo', 'Lo que apunta un compañero aparece en tu pantalla.'],
      ['Amigos', 'Sigue a otros viajeros, mira sus viajes y comparad mapas.'],
      ['Enlace público', 'Enseña un viaje a quien no tiene cuenta; lo quitas cuando quieras.'],
      ['Perfil público', 'Opcional: tu mapa, tus viajes y tus insignias.'],
      ['Imágenes para redes', 'En tres formatos, y como sticker transparente para tu story.'],
      ['Avatar propio', 'Elige un garabato o sube tu foto.'],
    ],
  },
  {
    id: 'avisos',
    icon: 'notifications',
    title: 'Avisos',
    text: 'Solo los que quieras: cada tipo se activa por separado.',
    items: [
      ['Gastos y pagos', 'Al momento, cuando te afectan.'],
      ['Vuelos y trenes', 'El día antes, con hora, compañía y reserva.'],
      ['Alojamiento', 'El día de entrada, con la dirección.'],
      ['Pasaporte', 'A 60, 30 y 7 días de un viaje, si te falta o caduca pronto.'],
      ['Compañeros', 'Cuando alguien se une a tu viaje.'],
      ['Recordatorios y recuerdos', 'Deudas por saldar y aniversarios de tus llegadas.'],
      ['Bandeja en la app', 'Para revisarlos con calma.'],
    ],
  },
  {
    id: 'app',
    icon: 'install_mobile',
    title: 'App y sin conexión',
    text: 'En el móvil, la tableta y el ordenador, con la misma cuenta.',
    items: [
      ['Instalable', 'Android, iPhone, iPad y ordenador, sin tiendas de apps.'],
      ['Tus viajes sin red', 'Se abren al instante, también en modo avión.'],
      ['Cambios en cola', 'Apunta sin cobertura; se envían en orden al volver.'],
      ['Documentos en el móvil', 'Se guardan solos desde 30 días antes de salir.'],
      ['Claro, oscuro o automático', 'Según tu dispositivo o como lo prefieras.'],
      ['Actualización con un toque', 'Te avisa y no recarga a mitad de una edición.'],
    ],
  },
  {
    id: 'datos',
    icon: 'lock',
    title: 'Importar y privacidad',
    text: 'Entra con lo que ya tienes y sal cuando quieras.',
    items: [
      ['Desde tus fotos', 'Crea el viaje con la fecha y el lugar de cada imagen.'],
      ['Desde Google Maps', 'Tu cronología se procesa en el navegador: no se sube.'],
      ['Fotos sin ubicación', 'Se les quitan los datos GPS antes de subirlas.'],
      ['Privado por defecto', 'Tú decides qué viajes o qué perfil se ven.'],
      ['Descarga tus datos', 'Una copia en JSON cuando quieras.'],
      ['Borra tu cuenta', 'Con tus viajes y tus fotos, desde los ajustes.'],
    ],
  },
]

export const FEATURE_COUNT = FEATURE_GROUPS.reduce((n, g) => n + g.items.length, 0)

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** Funciones que contienen todas las palabras buscadas, sin mirar tildes ni mayúsculas. */
export function searchFeatures(q: string): FeatureGroup[] {
  const words = fold(q).split(/\s+/).filter(Boolean)
  if (!words.length) return FEATURE_GROUPS
  return FEATURE_GROUPS.map((g) => ({ ...g, items: g.items.filter(([name, text]) => words.every((w) => fold(`${g.title} ${name} ${text}`).includes(w))) })).filter((g) => g.items.length)
}
