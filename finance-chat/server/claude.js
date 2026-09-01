/**
 * Selve samtalen.
 *
 * Claude får et sæt værktøjer, beder om de opslag den har brug for, og
 * skriver svaret. Teksten sendes videre til browseren mens den bliver skrevet,
 * så det føles som ChatGPT frem for en spinner.
 */
import Anthropic from '@anthropic-ai/sdk'
import { config, hasStripe, hasGhl } from './config.js'
import { toolDefinitions, runTool, toolLabel, toolWrites } from './tools/index.js'

const client = new Anthropic({ apiKey: config.anthropicApiKey })

const MAX_TOOL_ROUNDS = 12

function systemPrompt() {
  const today = new Intl.DateTimeFormat('da-DK', {
    dateStyle: 'full',
    timeZone: config.timezone,
  }).format(new Date())

  const sources = []
  if (hasStripe()) sources.push('- **Stripe** (kun læsning): betalinger, fakturaer, abonnementer, saldo, omsætning.')
  if (hasGhl()) {
    sources.push(
      '- **GoHighLevel / Agencyflow**: kontakter og alle deres felter, noter, opgaver, aftaler, salgsmuligheder, fakturaer, betalinger og kontrakter.' +
        (config.ghlAllowWrites
          ? ' Du kan også *tilføje* noter, opgaver, tags og rette felter på en kontakt.'
          : ' Skrivning er slået fra.'),
    )
  }
  if (!sources.length) {
    sources.push('- (Ingen systemer er koblet på lige nu. Sig det ærligt hvis du bliver spurgt om data.)')
  }

  return `Du er en rolig, kompetent assistent for ${
    config.businessName || 'brugerens virksomhed'
  }. Du svarer altid på dansk, kort og konkret, som en dygtig bogholder der også kender kunderne.

I dag er det ${today} (tidszone ${config.timezone}).

## Hvad du kan se
${sources.join('\n')}

## Regler du aldrig bryder
1. **Slå op før du svarer.** Alt om kunder, penge, datoer og status skal komme fra et værktøj. Gæt aldrig, husk ikke tal fra tidligere hvis de kan have ændret sig, og opfind aldrig beløb, navne, datoer eller id'er.
2. **Sig det, hvis du ikke kan finde det.** Et tomt resultat er et gyldigt svar. En fejl fra et system forklarer du i almindeligt dansk.
3. **Du kan ikke flytte penge.** Stripe er skrivebeskyttet. Du kan ikke oprette, refundere, udbetale eller ændre noget dér. Bliver du bedt om det, sig at det skal gøres i Stripe selv.
4. **Skriv kun i GoHighLevel når brugeren beder om det.** Når du har skrevet noget, fortæl med det samme hvad der blev skrevet og på hvem. Du sletter aldrig noget.
5. **Er der flere mulige kunder, så spørg** hvem der menes, i stedet for at gætte.

## Sådan finder du en kunde
Den samme person kan ligge begge steder: pengene i Stripe, relationen i GoHighLevel. Søg begge steder når spørgsmålet er "har X betalt" eller "hvad ved vi om X", og match på e-mail eller navn. Kontraktoplysninger ligger ofte enten under kontrakter/dokumenter eller som et brugerdefineret felt på kontakten, så kig begge steder før du siger at der ingen kontrakt er.

## Sådan skriver du
- Svar først, detaljer bagefter. Ét spørgsmål, ét svar.
- Beløb altid med valuta. Datoer skrevet ud (fx 1. september 2026).
- Lister og oversigter som punkter eller en lille tabel.
- Skriv tekniske id'er (cus_..., kontakt-id) kun hvis brugeren beder om dem.
- Svaret kan blive læst højt, så skriv i hele sætninger og undgå lange id-strenge og for meget formatering.`
}

/**
 * Kører én tur i samtalen.
 *
 * @param {object[]} history  Tidligere beskeder (Anthropic-format).
 * @param {string} userText   Det brugeren lige har skrevet.
 * @param {(type: string, data: object) => void} emit  Sender hændelser til browseren.
 * @returns {Promise<object[]>} Den opdaterede historik.
 */
export async function runChat({ history, userText, emit, signal }) {
  const messages = [...history, { role: 'user', content: userText }]

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = client.messages.stream(
      {
        model: config.model,
        max_tokens: 16000,
        system: [
          {
            type: 'text',
            text: systemPrompt(),
            cache_control: { type: 'ephemeral' },
          },
        ],
        thinking: { type: 'adaptive' },
        output_config: { effort: config.effort },
        // Er intet system koblet på, sender vi ingen værktøjer overhovedet.
        ...(toolDefinitions.length ? { tools: toolDefinitions } : {}),
        messages,
      },
      { signal },
    )

    stream.on('text', (delta) => emit('text', { text: delta }))
    stream.on('streamEvent', (event) => {
      // Tankeblokke er tomme (display er slået fra), men starten på en er et
      // godt signal om at vise "tænker …" i stedet for ingenting.
      if (event.type === 'content_block_start' && event.content_block?.type === 'thinking') {
        emit('thinking', {})
      }
    })

    const message = await stream.finalMessage()

    if (message.stop_reason === 'refusal') {
      emit('text', {
        text:
          '\n\nJeg kunne ikke færdiggøre det svar. Prøv at spørge på en anden måde, eller del spørgsmålet op.',
      })
      messages.push({ role: 'assistant', content: message.content })
      return messages
    }

    if (message.stop_reason !== 'tool_use') {
      messages.push({ role: 'assistant', content: message.content })
      return messages
    }

    messages.push({ role: 'assistant', content: message.content })

    const calls = message.content.filter((block) => block.type === 'tool_use')
    const results = await Promise.all(
      calls.map(async (call) => {
        emit('tool_start', {
          id: call.id,
          name: call.name,
          label: toolLabel(call.name),
          writes: toolWrites(call.name),
        })
        const output = await runTool(call.name, call.input)
        emit('tool_end', { id: call.id, name: call.name })
        return { type: 'tool_result', tool_use_id: call.id, content: output }
      }),
    )

    messages.push({ role: 'user', content: results })
  }

  emit('text', {
    text:
      '\n\nJeg måtte stoppe efter mange opslag i træk. Prøv at spørge om en mindre bid ad gangen.',
  })
  return messages
}

/** Oversætter fejl fra API'et til noget en bruger kan bruge til noget. */
export function describeError(error) {
  if (error instanceof Anthropic.AuthenticationError) {
    return 'Nøglen til Claude bliver afvist. Tjek ANTHROPIC_API_KEY på serveren.'
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'Der er lige nu for mange forespørgsler. Prøv igen om et øjeblik.'
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return 'Der er ikke forbindelse til Claude lige nu. Prøv igen om lidt.'
  }
  if (error instanceof Anthropic.APIError) {
    return `Claude svarede med en fejl (${error.status}): ${error.message}`
  }
  return 'Noget gik galt undervejs. Prøv igen.'
}
