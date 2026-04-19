// Ambient declarations for markdown-it plugins that ship no types.
declare module 'markdown-it-task-lists' {
  import type { PluginWithOptions } from 'markdown-it'
  const plugin: PluginWithOptions<{ enabled?: boolean; label?: boolean; labelAfter?: boolean }>
  export default plugin
}

declare module 'markdown-it-footnote' {
  import type { PluginSimple } from 'markdown-it'
  const plugin: PluginSimple
  export default plugin
}

declare module 'markdown-it-texmath' {
  import type { PluginWithOptions } from 'markdown-it'
  const plugin: PluginWithOptions<Record<string, unknown>>
  export default plugin
}

// Vite ?url-Imports und Bild-Assets
declare module '*?url' {
  const src: string
  export default src
}

declare module '*.png' {
  const src: string
  export default src
}

declare module '*.jpg' {
  const src: string
  export default src
}

declare module '*.svg' {
  const src: string
  export default src
}
