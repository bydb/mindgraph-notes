export async function writeClipboardText(text: string): Promise<void> {
  if (window.electronAPI?.clipboardWriteText) {
    await window.electronAPI.clipboardWriteText(text)
    return
  }

  await navigator.clipboard.writeText(text)
}

export async function readClipboardText(): Promise<string> {
  if (window.electronAPI?.clipboardReadText) {
    return window.electronAPI.clipboardReadText()
  }

  return navigator.clipboard.readText()
}
