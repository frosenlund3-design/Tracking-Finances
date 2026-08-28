/**
 * Questions about the coach itself.
 *
 * "Skulle du ikke være terapeut?" got answered as though it were a question
 * about a task called "Eller bruge håndklæde faktisk)". That is not a small
 * bug. It is the moment somebody stops believing there is anything on the other
 * end, and it is unrecoverable.
 *
 * These answers are honest, because the alternative is worse. She has a PhD;
 * she will work out what this is within a week, and if it has been pretending,
 * everything else it said becomes suspect too. Saying plainly what it is buys
 * more trust than a good impression of a person would.
 */

import type { MetaKind } from './understand'

export interface MetaAnswer {
  lines: string[]
  options: string[]
}

export function answerMeta(kind: MetaKind): MetaAnswer {
  switch (kind) {
    case 'are-you-a-therapist':
      return {
        lines: [
          'Nej. Og jeg vil hellere sige det rent ud end lade som om.',
          'Jeg er en del af appen. Jeg kender en del om ADHD og om hvordan igangsætning, skam og udsættelse hænger sammen, og jeg kan se dine egne mønstre i det, du har lavet her. Det er noget, og det er ikke terapi.',
          'Forskellen betyder noget: en terapeut kan tage imod det, der gør ondt, og gå ind i det med dig over tid. Jeg kan hjælpe dig med det, der ligger foran dig lige nu, og jeg kan sige tingene ved deres rigtige navn.',
          'Har du brug for det første, kan din egen læge henvise, og der findes en tilskudsordning til psykolog. Det er en helt legitim ting at bede om.',
        ],
        options: ['Okay, hjælp mig med det du kan', 'Det var bare et spørgsmål', 'Hvad kan du så?'],
      }

    case 'are-you-real':
      return {
        lines: [
          'Jeg er ikke et menneske, og jeg er heller ikke ChatGPT.',
          'Jeg er bygget ind i appen og kører på din telefon. Der bliver ikke sendt noget nogen steder, og der er ingen der læser med. Det er derfor jeg kan gemme det, du skriver, uden at der er nogen risiko ved det.',
          'Det betyder også, at jeg ikke kan finde på hvad som helst. Jeg kan det, jeg kan, rigtig godt, og resten siger jeg ærligt at jeg ikke kan.',
        ],
        options: ['Hvad kan du så?', 'Fair nok', 'Hjælp mig i gang'],
      }

    case 'what-can-you-do':
      return {
        lines: [
          'Konkret:',
          'Jeg kan sætte dine opgaver i rækkefølge og sige hvorfor, dele en op i mindre trin, flytte den, parkere den, hænge den på en vane, eller slette den.',
          'Jeg kan svare på hvad du skal bruge til en opgave, hvor den foregår, og hvad der plejer at gå galt. Rigtige ting, ikke gode råd.',
          'Jeg kan tage det, du siger undervejs, ud af hovedet og ind på listen.',
          'Og jeg kan sige hvad der sker, når du sidder fast, i stedet for at bede dig tage dig sammen.',
          'Det jeg ikke kan: slå noget op udenfor, ringe til nogen for dig, eller være din behandler.',
        ],
        options: ['Sæt mine opgaver i rækkefølge', 'Hjælp mig i gang', 'Okay'],
      }

    case 'what-are-you':
      return {
        lines: [
          'Jeg er den del af Loops, du kan skrive til.',
          'Jeg kan se dine loops, hvornår du plejer at lukke ting, og hvad der bliver liggende. Det er derfor jeg kan sige noget, en app udefra ikke kan.',
          'Jeg kører lokalt på telefonen. Intet af det her forlader den.',
        ],
        options: ['Hvad kan du?', 'Hjælp mig i gang', 'Okay'],
      }
  }
}
