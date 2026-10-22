import { combinePresetAndAppleSplashScreens, defaultSplashScreenName, defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Iconos de la app instalada (Android e iOS) y pantallas de arranque de iOS, a partir del favicon.
// vite-plugin-pwa los genera en cada build y añade al <head> los <link> que les tocan.
const ink = '#1a1c1d'
const surface = '#f9f9fa'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: combinePresetAndAppleSplashScreens(
    {
      ...minimal2023Preset,
      // El icono ya es un cuadrado oscuro: el fondo del mismo color hace que el recorte de Android e iOS no se note.
      maskable: { sizes: [512], padding: 0.3, resizeOptions: { background: ink } },
      apple: { sizes: [180], padding: 0.3, resizeOptions: { background: ink } },
    },
    {
      padding: 0.6,
      resizeOptions: { background: surface, fit: 'contain' },
      linkMediaOptions: { log: false, addMediaScreen: true, xhtml: false },
      // Sin variante oscura, el mismo nombre para el archivo y para el <link> (si no, el <link> pide «-light-»).
      name: (landscape, size) => defaultSplashScreenName(landscape, size),
    },
  ),
  images: ['public/favicon.svg'],
})
