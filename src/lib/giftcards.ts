/**
 * Gavekort-sparegrisen.
 *
 * HONESTY NOTE (this matters, see the "no fake features" rule):
 * Loops has no backend, no payment integration and no partnership with any
 * shop. It therefore does NOT buy or issue gift cards. What it does is real:
 * it converts closed loops into points, tracks a savings goal, and tells the
 * user when they have genuinely earned the reward, then links them straight
 * to a shop that actually sells a digital gift card in that amount, which they
 * buy for themselves. The UI says this in plain Danish; nothing is implied
 * that the app cannot do.
 *
 * Shops below were checked for selling digital gift cards to Danish customers
 * in (or covering) 50/100/200 kr.
 */

export interface GiftCardStore {
  id: string
  name: string
  /** What it's good for, in the user's language. */
  blurb: string
  url: string
  /** Amounts that are realistically buyable. */
  amounts: number[]
  /** Free-choice amount from this minimum, where the shop offers it. */
  freeAmountFrom?: number
  emoji: string
}

export const GIFT_CARD_STORES: GiftCardStore[] = [
  {
    id: 'matas',
    name: 'Matas',
    blurb: 'Digitalt gavekort med valgfrit beløb fra 50 kr. Hudpleje, duft, småting til dig selv.',
    url: 'https://www.matas.dk/gaver/gavekort/digitale-gavekort',
    amounts: [50, 100, 200],
    freeAmountFrom: 50,
    emoji: '🧴',
  },
  {
    id: 'bog-ide',
    name: 'Bog & idé',
    blurb: 'Digitalt gavekort på mail eller SMS. Bøger, papirvarer, lidt hygge.',
    url: 'https://www.bog-ide.dk/gavekort',
    amounts: [50, 100, 200],
    emoji: '📚',
  },
  {
    id: 'panduro',
    name: 'Panduro',
    blurb: 'Digitalt gavekort i faste beløb, bl.a. 100 og 200 kr. Kreative ting.',
    url: 'https://panduro.com/da-dk/products/gavekort/gavekort/digitale-gavekort',
    amounts: [100, 200],
    emoji: '🎨',
  },
  {
    id: 'imerco',
    name: 'Imerco',
    blurb: 'Digitalt gavekort på mail. Køkken og hjem.',
    url: 'https://www.imerco.dk/gaver/gavekort',
    amounts: [100, 200],
    emoji: '🍽️',
  },
  {
    id: 'magasin',
    name: 'Magasin',
    blurb: 'Print eller send digitalt med det samme. Bredt udvalg.',
    url: 'https://www.magasin.dk/gaver/gavekort/',
    amounts: [100, 200],
    emoji: '🛍️',
  },
  {
    id: 'espresso-house',
    name: 'Espresso House',
    blurb: 'Gavekort fra 100 kr. Kaffe og en pause der ikke er en opgave.',
    url: 'https://dk.espressohouse.com/gift-cards',
    amounts: [100, 200],
    emoji: '☕',
  },
  {
    id: 'gogift',
    name: 'GoGift / Gavekort.com',
    blurb: 'Ét sted med gavekort til rigtig mange butikker og oplevelser.',
    url: 'https://www.gavekort.com/dk/',
    amounts: [100, 200],
    emoji: '🎁',
  },
  {
    id: 'egen',
    name: 'Noget du selv vælger',
    blurb: 'Din egen belønning. Loops holder bare styr på, hvornår du har sparet nok op.',
    url: '',
    amounts: [50, 100, 200],
    emoji: '💛',
  },
]

/**
 * Points per krone.
 *
 * A closed loop pays roughly 12–25 point (see scoring.xpFor), so 25 point pr.
 * krone means 50 kr ≈ 70 lukkede loops, 100 kr ≈ 140, 200 kr ≈ 280. Det er
 * bevidst en rigtig opsparing over uger, ikke noget man snubler over på to
 * dage. En belønning, der kommer for let, holder op med at være en belønning.
 */
export const XP_PER_KRONE = 25

export function xpTargetFor(amountDKK: number): number {
  return amountDKK * XP_PER_KRONE
}

export function storeById(id: string): GiftCardStore | undefined {
  return GIFT_CARD_STORES.find((s) => s.id === id)
}

export function storesFor(amount: number): GiftCardStore[] {
  return GIFT_CARD_STORES.filter((s) => s.amounts.includes(amount) || (s.freeAmountFrom ?? Infinity) <= amount)
}
