/**
 * Hanging a loop on something she already does.
 *
 * An if-then plan ("når jeg har sat kaffe over, åbner jeg e-Boks") works
 * differently from an intention ("jeg gør det i morgen"). The intention has to
 * be remembered and then acted on by the part of the system that is
 * overloaded. The if-then plan is triggered by the situation instead: the
 * kettle happens whether or not anyone decided anything, and the plan comes
 * along with it.
 *
 * The research on this is unusually clean, and it holds up specifically in
 * ADHD: children given if-then plans matched non-ADHD performance on tasks
 * that normally show a clear deficit. It shifts control from top-down (which
 * needs executive function) to bottom-up (which does not).
 *
 * Two rules make or break it, and both are enforced here.
 *
 * The cue has to be an event, not a time. "Klokken syv" is another decision.
 * "Når kaffen er sat over" is a thing that arrives on its own.
 *
 * The cue has to be one she genuinely meets. A cue tied to something she does
 * once a month is a plan that fires once a month.
 */

/** Anchors most people actually hit, in a day that is otherwise unstructured. */
export const CUE_SUGGESTIONS: string[] = [
  'Når jeg har sat kaffe over',
  'Når jeg har børstet tænder',
  'Når jeg har lagt telefonen fra mig',
  'Når jeg kommer hjem ad døren',
  'Når jeg har spist',
  'Når jeg tænder computeren',
  'Når vaskemaskinen er færdig',
  'Når jeg sætter mig i sofaen',
  'Når jeg har taget medicin',
  'Når jeg har hentet posten',
]

/** A time of day is not a cue. It is one more thing to remember. */
const IS_A_TIME = /\b(kl\.?\s*\d|klokken|om morgenen|hver dag klokken|\d{1,2}[.:]\d{2})\b/i

export function looksLikeATime(cue: string): boolean {
  return IS_A_TIME.test(cue)
}

/** The sentence, put together, so she can read the whole plan in one line. */
export function cueSentence(cue: string, action: string): string {
  const c = cue.trim().replace(/[,.]$/, '')
  const a = action.trim()
  const lower = a.charAt(0).toLowerCase() + a.slice(1)
  return `${c}, ${lower}.`
}
