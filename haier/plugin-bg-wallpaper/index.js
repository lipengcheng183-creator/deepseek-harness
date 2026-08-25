import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'plugin-bg-wallpaper'
export const inject = ['webServer']

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url))
const IMAGE_URL = '/plugins/plugin-bg-wallpaper/bg.png'
/** How strongly the wallpaper shows through (0 = hidden, 1 = full). */
const DEFAULT_STRENGTH = 0.45

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ opacity?: number }} config
 */
export function apply(ctx, config = {}) {
  const strength = typeof config.opacity === 'number' ? config.opacity : DEFAULT_STRENGTH
  // Panel alpha: keep text readable while letting the image show through.
  const panelAlpha = Math.max(0.35, Math.min(0.92, 1 - strength))
  const sidebarAlpha = Math.min(0.95, panelAlpha + 0.08)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: IMAGE_URL,
    handler(_req, res) {
      res.writeHead(200, {
        'content-type': 'image/png',
        'cache-control': 'no-cache',
      })
      res.end(readFileSync(join(PLUGIN_DIR, 'assets/bg.png')))
    },
  }), 'bg-wallpaper: image route')

  ctx.on('webserver/index-inject', (table) => {
    // Put the image on html. UI later paints opaque body/#root/.frame over
    // body::before, so we also force the main fill tokens translucent.
    table.push({
      kind: 'style',
      text: `
html {
  background-color: #0f1115;
  background-image: url('${IMAGE_URL}') !important;
  background-size: cover !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
  background-attachment: fixed !important;
}
html body,
html body #root {
  background-color: transparent !important;
  background-image: none !important;
}
html body {
  --dsw-alias-bg-base: rgba(15, 17, 21, ${panelAlpha}) !important;
  --dsw-specific-sidebar-fill: rgba(12, 14, 18, ${sidebarAlpha}) !important;
}
html body[data-ds-dark-theme] {
  --dsw-alias-bg-base: rgba(15, 17, 21, ${panelAlpha}) !important;
  --dsw-specific-sidebar-fill: rgba(12, 14, 18, ${sidebarAlpha}) !important;
}
`.replace(/\s+/g, ' ').trim(),
    })
  })
}
