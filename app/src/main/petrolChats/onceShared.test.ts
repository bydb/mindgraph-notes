import { describe, it, expect } from 'vitest'
import { OnceShared } from './onceShared'

describe('OnceShared (F84)', () => {
  it('gleichzeitige Aufrufe teilen einen Durchgang und warten darauf', async () => {
    const once = new OnceShared()
    let calls = 0
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    const order: string[] = []
    const a = once.run('v', async () => { calls++; await gate; order.push('job'); return true }).then(() => order.push('a'))
    const b = once.run('v', async () => { calls++; return true }).then(() => order.push('b'))
    release()
    await Promise.all([a, b])
    expect(calls).toBe(1)
    expect(order[0]).toBe('job')
    await once.run('v', async () => { calls++; return true })
    expect(calls).toBe(1)
  })

  it('erst nach Erfolg erledigt: Fehlschlag und Fehler werden erneut versucht', async () => {
    const once = new OnceShared()
    let calls = 0
    await once.run('v', async () => { calls++; return false })
    await once.run('v', async () => { calls++; throw new Error('Schlüssel') })
    await once.run('v', async () => { calls++; return true })
    await once.run('v', async () => { calls++; return true })
    expect(calls).toBe(3)
  })
})
