import { writeFileSync } from 'node:fs';
// Original vector scenery for the public preview. No third-party art or artist claims.
const windows = (x, y, cols, rows) =>
  Array.from(
    { length: cols * rows },
    (_, i) =>
      `<rect x="${x + (i % cols) * 22}" y="${y + Math.floor(i / cols) * 28}" width="7" height="13" fill="${i % 4 === 0 ? '#eacb87' : '#395357'}"/>`,
  ).join('');
const buildings = Array.from({ length: 19 }, (_, i) => {
  const x = i * 47 - 24,
    y = 238 + ((i * 37) % 130);
  return `<g><path d="M${x} 525V${y}l23 -18 24 18V525" fill="${['#56615a', '#69746a', '#3c5452', '#7a7e6a'][i % 4]}" stroke="#2a4240" stroke-width="2"/>${windows(x + 7, y + 16, 2, Math.floor((515 - y) / 28))}</g>`;
}).join('');
const defs = `<defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#c6c9b3"/><stop offset="1" stop-color="#e7d9af"/></linearGradient><linearGradient id="sea" x2="0" y2="1"><stop stop-color="#7c9690"/><stop offset="1" stop-color="#243f43"/></linearGradient><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6L6 0" stroke="#243f43" stroke-opacity=".08"/></pattern></defs>`;
const svg = (h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${h}" viewBox="0 0 900 ${h}">${defs}${body}</svg>`;
const harbour = `<rect width="900" height="690" fill="url(#sky)"/><circle cx="687" cy="152" r="66" fill="#efe3ba"/><path d="M0 285Q150 182 286 284T580 280T900 247V430H0" fill="#9ba596"/><path d="M0 325Q128 256 290 324T605 305T900 323V410H0" fill="#788d81"/>${buildings}<path d="M0 465Q400 430 900 480V900H0" fill="url(#sea)"/><path d="M0 466Q370 440 900 481" stroke="#bfc5ac" stroke-width="7" fill="none"/><g stroke="#b4c2ad" stroke-width="2" opacity=".45">${Array.from({ length: 32 }, (_, i) => `<path d="M${(i * 143) % 900} ${490 + i * 6}h${24 + (i % 5) * 13}"/>`).join('')}</g><path d="M604 487l109 5 -18 16h-69z" fill="#213c3f"/><path d="M653 489v-57l23 43h-21" fill="#d5ceb0" stroke="#324c49" stroke-width="2"/><path d="M0 611L295 523l70 14L0 688z" fill="#344947"/><path d="M0 605L295 518l70 14L0 679" fill="#8c8c73" stroke="#253c3d" stroke-width="3"/><g stroke="#283f3e" stroke-width="5"><path d="M72 594v-59m100 30v-58m101 29v-52"/><path d="M50 538l245-66" stroke-width="3"/></g><path d="M239 493q-8-22 6-33 17-10 22 8l-5 23 19 37-40 10z" fill="#253d3d"/><path d="M245 537l-4 33m22-39 7 30" stroke="#253d3d" stroke-width="9"/><path d="M250 473l28 12" stroke="#c4b291" stroke-width="5"/><path d="M778 81q12-13 24 0 12-13 24 0m-108 22q8-9 16 0 8-9 16 0" fill="none" stroke="#52665c" stroke-width="2"/><rect width="900" height="690" fill="url(#hatch)"/>`;
writeFileSync('public/art/harbour.svg', svg(690, harbour));
writeFileSync(
  'public/art/window.svg',
  svg(
    900,
    `<rect width="900" height="900" fill="#d6ceb3"/><path d="M0 0h900v900H0z" fill="url(#hatch)"/><path d="M203 56h489v610H203z" fill="#263e3e"/><path d="M224 78h447v564H224z" fill="#afbdab"/><path d="M230 479l141-126 148 45 150-177v422H230" fill="#6f8b7d"/><path d="M232 568q176-74 438-50v121H232" fill="#597674"/><path d="M439 77v566M223 350h449" stroke="#344945" stroke-width="14"/><path d="M174 665h548v22H174z" fill="#536358"/><path d="M0 817q281-110 900-2v85H0" fill="#9b9b7b"/><path d="M526 736q-2-70 38-72 43 7 35 72l-13 20h-47z" fill="#ebe1c0" stroke="#526155" stroke-width="3"/><path d="M598 681q65-9 23 40h-23" stroke="#526155" stroke-width="7" fill="none"/><ellipse cx="564" cy="666" rx="30" ry="9" fill="#4d5950"/><path d="M558 638q-22-28 0-44t0-36" stroke="#efead6" fill="none" stroke-width="3"/><path d="M180 744l169 10-40 73-168-14z" fill="#e7ddbb" stroke="#59675c" stroke-width="3"/><path d="M176 777l110 9m-96-25 125 9m-139 24 95 7" stroke="#85917b" stroke-width="2"/><rect x="60" y="95" rx="36" width="267" height="103" fill="#f4eed9" stroke="#344a43" stroke-width="3"/><path d="M258 198l32 31-9-36" fill="#f4eed9" stroke="#344a43" stroke-width="3"/><text x="91" y="140" font-family="Georgia,serif" font-size="24" fill="#344a43">The sea had kept</text><text x="91" y="173" font-family="Georgia,serif" font-size="24" fill="#344a43">its own time.</text>`,
  ),
);
writeFileSync(
  'public/art/letter.svg',
  svg(
    800,
    `<rect width="900" height="800" fill="#435c57"/><path d="M0 150L900 18v782H0" fill="#9fa386"/><path d="M0 150L900 18" stroke="#243f3d" stroke-width="5"/><path d="M0 260l900-130M0 495l900-130M0 730l900-130" stroke="#7a8b73" stroke-width="3"/><path d="M171 271l521-59 61 338-524 63z" fill="#d5c9a3" stroke="#2b4640" stroke-width="4"/><path d="M171 271l283 168 238-227M229 613l172-219m352 156L514 369" fill="none" stroke="#7a8067" stroke-width="3"/><circle cx="454" cy="435" r="35" fill="#9c563c"/><path d="M443 416l9 15 14-12-5 30-16-4z" fill="none" stroke="#c08e65" stroke-width="3"/><path d="M0 0h900v800H0z" fill="url(#hatch)"/><rect x="88" y="648" width="454" height="81" fill="#f0e7cd" stroke="#2c4640" stroke-width="3"/><text x="115" y="698" font-family="Georgia,serif" font-size="25" fill="#30483f">But that morning, something changed.</text>`,
  ),
);
