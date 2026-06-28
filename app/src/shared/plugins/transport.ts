// Plugin-Transport — der Wire-Vertrag zwischen Renderer und Main für `plugin:invoke`.
//
// Bewusst eine normalisierte Hülle: NIE rohe Exceptions über die IPC-Grenze. Jeder
// Aufruf endet als {ok:true,data} ODER {ok:false,error} — der Renderer-Client packt
// das aus. Siehe docs/plugin-system-plan.md, Entscheidung #5.

export interface PluginInvokeResult {
  ok: boolean
  data?: unknown
  error?: string
}
