/**
 * Two-minute sprints.
 *
 * Every task below is genuinely finishable in well under two minutes by
 * someone who has been putting it off for a month. That is the only rule the
 * list obeys, and it is the rule that matters: "tidy the kitchen" is a
 * project and gets avoided, "put everything on the counter where it lives"
 * is a task and gets done.
 */

export interface Room {
  key: string;
  label: string;
  glyph: string;
  tasks: string[];
}

export const ROOMS: Room[] = [
  {
    key: 'kitchen',
    label: 'Kitchen',
    glyph: '🍳',
    tasks: [
      'Everything on the counter, back where it lives',
      'Wipe one surface — the worst one',
      'Empty the dishwasher, or fill it',
      'Bin whatever is obviously finished in the fridge door',
      'Fold or bin the bags on the chair',
      'Put the clean dishes away, just the clean ones',
    ],
  },
  {
    key: 'bathroom',
    label: 'Bathroom',
    glyph: '🛁',
    tasks: [
      'Empty products you have not touched in a year',
      'Wipe the sink and the tap',
      'Fresh towel out, old one to the wash',
      'Everything on the edge of the bath, back on a shelf',
      'Bin the empties in the shower',
    ],
  },
  {
    key: 'bedroom',
    label: 'Bedroom',
    glyph: '🛏️',
    tasks: [
      'Clothes off the chair: worn, wash, or away',
      'Clear one surface completely',
      'Make the bed, badly is fine',
      'Glasses and mugs back to the kitchen',
      'Everything under the bed that should not be there',
    ],
  },
  {
    key: 'living',
    label: 'Living room',
    glyph: '🛋️',
    tasks: [
      'Cushions back on the sofa',
      'Everything on the coffee table, gone or straightened',
      'Cables into one bundle',
      'Post and paper into one pile',
      'Anything belonging in another room, into that room',
    ],
  },
  {
    key: 'desk',
    label: 'Desk',
    glyph: '💻',
    tasks: [
      'Every mug and glass, back to the kitchen',
      'Paper into one pile, bin the obvious',
      'Cables untangled and behind the desk',
      'Wipe the desk once the surface is clear',
      'Close the tabs you will not read',
    ],
  },
  {
    key: 'hallway',
    label: 'Hallway',
    glyph: '🚪',
    tasks: [
      'Shoes into pairs and against the wall',
      'Coats on hooks, not the floor',
      'Post: bin, keep, or deal with',
      'Bags off the floor',
      'Anything that has been by the door for a week, moved',
    ],
  },
];

const BY_KEY = new Map(ROOMS.map((r) => [r.key, r]));

export function room(key: string): Room | undefined {
  return BY_KEY.get(key);
}

/** Three tasks for a room. Three, because four is a list. */
export function pickTasks(roomKey: string, count = 3, random: () => number = Math.random): string[] {
  const found = BY_KEY.get(roomKey);
  if (!found) return [];
  const pool = [...found.tasks];
  // Fixed before the loop: `pool` shrinks as tasks are drawn, so comparing
  // against its live length would stop about halfway to the target.
  const wanted = Math.min(count, pool.length);
  const picked: string[] = [];
  while (picked.length < wanted && pool.length > 0) {
    const [task] = pool.splice(Math.floor(random() * pool.length), 1);
    if (task) picked.push(task);
  }
  return picked;
}

export const SPRINT_SECONDS = 120;
