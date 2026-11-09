import type { SignedPanel } from './panel-contract';

export const sample: SignedPanel[] = [
  {
    id: 'harbour',
    position: 1,
    url: '/art/harbour.svg',
    alt_text:
      'An olive-green harbour at dawn. A lone figure waits on the quay beside a small sailboat.',
    width: 900,
    height: 690,
  },
  {
    id: 'window',
    position: 2,
    url: '/art/window.svg',
    alt_text:
      'A cup of coffee and an open notebook beneath a tall window facing the sea. The sea had kept its own time.',
    width: 900,
    height: 900,
  },
  {
    id: 'letter',
    position: 3,
    url: '/art/letter.svg',
    alt_text: 'A sealed letter lies on a wooden table. But that morning, something changed.',
    width: 900,
    height: 800,
  },
];

export const sampleTitles = ['The return', 'A familiar silence', 'Letters from the shore'];
