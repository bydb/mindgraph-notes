// Headless-Ersatz für `electron` in den Skript-Läufen (run-ts.mjs): Telemetrie und
// Ledger fassen `app.getPath('userData')` und `BrowserWindow.getAllWindows()` an.
// Ohne diesen Stub wirft `require('electron')` in reinem Node („failed to install").
const os = require('os')
const path = require('path')
const userData = process.env.MG_HEADLESS_USERDATA || path.join(os.tmpdir(), 'mg-headless-userdata')
module.exports = {
  app: {
    getPath: (name) => (name === 'userData' ? userData : os.tmpdir()),
    getVersion: () => '0.0.0-headless',
    isReady: () => true,
    on: () => undefined
  },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => undefined, on: () => undefined },
  safeStorage: { isEncryptionAvailable: () => false }
}
