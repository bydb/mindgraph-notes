// MindGraph Demo-Renderer-Plugin (R1a-Beleg, ADR plugin-renderer-host §11).
//
// SELBSTENTHALTENES Single-File-ESM (F12): KEINE Importe, keine Sub-Chunks, kein import.meta.url, kein eval.
// Beansprucht `.mgxdemo` (siehe manifest.json `ui.fileEditors`) und mountet einen schlichten Texteditor, der
// seinen Inhalt über die Host-Vault-Bridge liest/schreibt. Zeigt den vollen Vertrag: strikter Default-Export
// `{ id, activate }`, `registerFileEditor` auf die deklarierte `editorId`, eigener Mount + dispose (Teardown).
export default {
  id: 'mgx-demo-renderer',
  activate(host) {
    host.log('Demo-Renderer aktiviert')
    host.registerFileEditor({
      editorId: 'demo-text',
      mount(container, ctx) {
        const textarea = document.createElement('textarea')
        textarea.style.width = '100%'
        textarea.style.height = '100%'
        textarea.style.boxSizing = 'border-box'
        textarea.placeholder = 'Demo-Renderer — Inhalt wird über die Host-Vault-Bridge gespeichert.'
        container.appendChild(textarea)

        host.vault.read(ctx.filePath).then(
          (content) => { textarea.value = content },
          () => { /* neue/leere Datei */ },
        )

        let saveTimer
        const onInput = () => {
          clearTimeout(saveTimer)
          saveTimer = setTimeout(() => {
            host.vault.write(ctx.filePath, textarea.value).catch((err) => host.log('write failed:', err))
          }, 600)
        }
        textarea.addEventListener('input', onInput)

        // dispose: räumt Timer + Listener + DOM ab (gemeinsamer Realm — Plugin-Verantwortung, §7).
        return () => {
          clearTimeout(saveTimer)
          textarea.removeEventListener('input', onInput)
          textarea.remove()
        }
      },
    })
  },
}
