/** Samler alle værktøjer og kører dem. Ét sted, så intet kan smutte udenom. */
import { stripeTools } from './stripe.js'
import { ghlTools } from './ghl.js'
import { hasStripe, hasGhl } from '../config.js'
import { toToolText } from '../util.js'

const all = [...(hasStripe() ? stripeTools : []), ...(hasGhl() ? ghlTools : [])]
const byName = new Map(all.map((tool) => [tool.name, tool]))

/** Definitionerne som de sendes til Claude (uden vores egne felter). */
export const toolDefinitions = all.map(({ name, description, input_schema }) => ({
  name,
  description,
  input_schema,
}))

export const toolLabel = (name) => byName.get(name)?.label || 'Slår op'
export const toolWrites = (name) => Boolean(byName.get(name)?.writes)
export const availableToolNames = all.map((t) => t.name)

/**
 * Hvad en skrivning konkret vil gøre, skrevet så et menneske kan sige ja eller
 * nej til det. Det er den tekst brugeren får at se, før noget bliver skrevet.
 */
export function describeWrite(name, input) {
  const tool = byName.get(name)
  const rows = tool?.describe ? tool.describe(input || {}) : []
  return {
    titel: tool?.label || name,
    felter: rows.filter(([, value]) => value !== undefined && value !== null && value !== ''),
  }
}

/**
 * Kører ét værktøj. Kaster aldrig: en fejl bliver til tekst, som modellen kan
 * læse og forklare i chatten i stedet for at samtalen dør.
 */
export async function runTool(name, input) {
  const tool = byName.get(name)
  if (!tool) {
    return toToolText({ ok: false, fejl: `Ukendt værktøj: ${name}.` })
  }
  try {
    const result = await tool.run(input || {})
    return toToolText(result)
  } catch (error) {
    return toToolText({ ok: false, fejl: error?.message || 'Uventet fejl i værktøjet.' })
  }
}
