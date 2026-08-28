import { db } from '@/db/db'

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
  }
}

export async function exportBackup(): Promise<BackupFile> {
  const [nodes, dumps, coachMessages, coachSessions, completions, rewards, claimed, profile, prefs] =
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
    ])

  return {
    app: 'loops',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { nodes, dumps, coachMessages, coachSessions, completions, rewards, claimed, profile, prefs },
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
  await db.transaction(
    'rw',
    [db.nodes, db.dumps, db.coachMessages, db.coachSessions, db.completions, db.rewards, db.claimed, db.profile, db.prefs],
    async () => {
      await Promise.all([
        db.nodes.clear(), db.dumps.clear(), db.coachMessages.clear(), db.coachSessions.clear(),
        db.completions.clear(), db.rewards.clear(), db.claimed.clear(), db.profile.clear(), db.prefs.clear(),
      ])
      await Promise.all([
        db.nodes.bulkAdd(d.nodes as never[]),
        db.dumps.bulkAdd((d.dumps ?? []) as never[]),
        db.coachMessages.bulkAdd((d.coachMessages ?? []) as never[]),
        db.coachSessions.bulkAdd((d.coachSessions ?? []) as never[]),
        db.completions.bulkAdd((d.completions ?? []) as never[]),
        db.rewards.bulkAdd((d.rewards ?? []) as never[]),
        db.claimed.bulkAdd((d.claimed ?? []) as never[]),
        db.profile.bulkAdd((d.profile ?? []) as never[]),
        db.prefs.bulkAdd((d.prefs ?? []) as never[]),
      ])
    },
  )

  return { nodes: (d.nodes as unknown[]).length }
}

export async function wipeEverything(): Promise<void> {
  await db.delete()
  window.location.reload()
}
