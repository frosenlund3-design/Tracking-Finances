import { db, openNode, sealNode } from '@/db/db'
import { openText, sealText } from '@/lib/vault'
import type { BrainDumpEntry, CoachMessage, Completion, LoopNode, Note } from '@/db/types'

export interface BackupFile {
  app: 'loops'
  version: 1
  exportedAt: string
  data: {
    nodes: unknown[]
    dumps: unknown[]
    coachMessages: unknown[]
    coachSessions: unknown[]
    completions: unknown[]
    rewards: unknown[]
    claimed: unknown[]
    profile: unknown[]
    prefs: unknown[]
    notes: unknown[]
  }
}

/**
 * Backups are exported in the clear, even when the profile lock is on.
 *
 * A backup that only opens with a password you might forget is not a backup.
 * The file is readable, which the UI says plainly, so she knows to keep it
 * somewhere she'd keep a bank statement. The lock record itself is never
 * exported: restoring gives back the content, and she sets a new code if she
 * wants one.
 */
export async function exportBackup(): Promise<BackupFile> {
  const [nodes, dumps, coachMessages, coachSessions, completions, rewards, claimed, profile, prefs, notes] =
    await Promise.all([
      db.nodes.toArray(),
      db.dumps.toArray(),
      db.coachMessages.toArray(),
      db.coachSessions.toArray(),
      db.completions.toArray(),
      db.rewards.toArray(),
      db.claimed.toArray(),
      db.profile.toArray(),
      db.prefs.toArray(),
      db.notes.toArray(),
    ])

  return {
    app: 'loops',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      nodes: await Promise.all(nodes.map((n) => openNode(n))),
      dumps: await Promise.all(dumps.map(async (d) => ({ ...d, raw: await openText(d.raw) }))),
      coachMessages: await Promise.all(coachMessages.map(async (m) => ({ ...m, text: await openText(m.text) }))),
      coachSessions,
      completions: await Promise.all(completions.map(async (c) => ({ ...c, title: await openText(c.title) }))),
      rewards,
      claimed,
      profile,
      prefs,
      notes: await Promise.all(notes.map(async (n) => ({ ...n, text: await openText(n.text) }))),
    },
  }
}

export async function downloadBackup(): Promise<void> {
  const backup = await exportBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `loops-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export class BackupError extends Error {}

export async function importBackup(json: string): Promise<{ nodes: number }> {
  let parsed: BackupFile
  try {
    parsed = JSON.parse(json) as BackupFile
  } catch {
    throw new BackupError('Filen kunne ikke læses. Er det den rigtige fil?')
  }
  if (parsed?.app !== 'loops' || !parsed.data?.nodes) {
    throw new BackupError('Det ser ikke ud til at være en Loops-backup.')
  }

  const d = parsed.data
  // Imported content arrives in the clear; re-seal it if a lock is active.
  const nodes = await Promise.all((d.nodes as LoopNode[]).map(sealNode))
  const dumps = await Promise.all(((d.dumps ?? []) as BrainDumpEntry[]).map(async (x) => ({ ...x, raw: await sealText(x.raw) })))
  const messages = await Promise.all(((d.coachMessages ?? []) as CoachMessage[]).map(async (x) => ({ ...x, text: await sealText(x.text) })))
  const completions = await Promise.all(((d.completions ?? []) as Completion[]).map(async (x) => ({ ...x, title: await sealText(x.title) })))
  const notes = await Promise.all(((d.notes ?? []) as Note[]).map(async (x) => ({ ...x, text: await sealText(x.text) })))

  await db.transaction(
    'rw',
    [db.nodes, db.dumps, db.coachMessages, db.coachSessions, db.completions, db.rewards, db.claimed, db.profile, db.prefs, db.notes],
    async () => {
      await Promise.all([
        db.nodes.clear(), db.dumps.clear(), db.coachMessages.clear(), db.coachSessions.clear(),
        db.completions.clear(), db.rewards.clear(), db.claimed.clear(), db.profile.clear(), db.prefs.clear(),
        db.notes.clear(),
      ])
      await Promise.all([
        db.nodes.bulkAdd(nodes),
        db.dumps.bulkAdd(dumps),
        db.coachMessages.bulkAdd(messages),
        db.coachSessions.bulkAdd((d.coachSessions ?? []) as never[]),
        db.completions.bulkAdd(completions),
        db.rewards.bulkAdd((d.rewards ?? []) as never[]),
        db.claimed.bulkAdd((d.claimed ?? []) as never[]),
        db.profile.bulkAdd((d.profile ?? []) as never[]),
        db.prefs.bulkAdd((d.prefs ?? []) as never[]),
        db.notes.bulkAdd(notes),
      ])
    },
  )

  return { nodes: (d.nodes as unknown[]).length }
}

export async function wipeEverything(): Promise<void> {
  await db.delete()
  window.location.reload()
}
