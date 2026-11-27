import { AIRFLOWS, AMBIENT, SCENE } from '../data/capsuleOS';
import { TIERS, formatEUR, type quoteCapsules } from '../data/capsules';
import type { Journey } from '../data/cities';
import { SOUND_LABEL, WAKE_LABEL } from '../data/labels';
import type { Prefs } from '../state/store';

export type BoardingPass = {
  reference: string;
  journey: Journey;
  quote: ReturnType<typeof quoteCapsules>;
  prefs: Prefs;
};

const WIDTH = 760;
const HEIGHT = 352;
const INK = '0.94 0.92 0.87';
const MUTED = '0.69 0.72 0.79';
const GOLD = '0.95 0.77 0.54';
const LINE = '0.28 0.32 0.42';

// Keep PDF streams ASCII so string lengths are exact byte offsets. WinAnsi supports the euro symbol.
function pdfText(value: string) {
  return value.replaceAll('€', '\x80').replace(/[^\x20-\xff]/g, (char) => char.normalize('NFKD').replace(/[^\x20-\x7e]/g, '') || '?')
    .replace(/[()\\\u007f-\u00ff]/g, (char) => `\\${char.charCodeAt(0).toString(8).padStart(3, '0')}`);
}

function dateOnPass(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone }).format(date);
}

function drawPass(pass: BoardingPass, { guest, slot, fare }: BoardingPass['quote']['assignments'][number]) {
  if (!slot || fare === null) throw new Error('A boarding pass requires an assigned capsule.');
  const { journey: j, quote, reference, prefs } = pass;
  const content: string[] = [];
  const text = (value: string, x: number, y: number, size: number, color = INK, font = 'F1') => {
    content.push(`BT /${font} ${size} Tf ${color} rg 1 0 0 1 ${x} ${y} Tm (${pdfText(value)}) Tj ET`);
  };
  const rect = (x: number, y: number, w: number, h: number, color: string) => content.push(`${color} rg ${x} ${y} ${w} ${h} re f`);
  const rule = (x: number, y: number, x2: number, y2 = y) => content.push(`${LINE} RG 0.65 w ${x} ${y} m ${x2} ${y2} l S`);
  const label = (value: string, x: number, y: number) => text(value, x, y, 9, MUTED, 'F3');
  const field = (heading: string, value: string, x: number, y: number) => {
    label(heading, x, y);
    text(value, x, y - 19, 13, INK, 'F2');
  };

  rect(0, 0, WIDTH, HEIGHT, '0.045 0.06 0.10');
  rect(0, 142, 552, 149, '0.082 0.11 0.18');
  rect(552, 0, 208, HEIGHT, '0.072 0.087 0.13');
  rect(0, 348, WIDTH, 4, GOLD);
  rule(24, 291, 528);
  rule(24, 142, 528);
  content.push('q [4 5] 0 d');
  rule(552, 0, 552, 348);
  content.push('Q');

  text('SOMNA', 28, 313, 23, INK, 'F2');
  rect(46, 332, 12, 1, GOLD);
  text('THE ART OF ARRIVING', 123, 315, 9, MUTED, 'F3');
  text('DEMO BOARDING PASS', 370, 314, 12, GOLD, 'F3');
  label('DEPARTURE', 28, 268);
  label('WAKE-UP ARRIVAL', 359, 268);
  text(j.from.code, 27, 217, 52, INK, 'F2');
  text(j.to.code, 358, 217, 52, INK, 'F2');
  text(j.from.name, 29, 194, 14, MUTED);
  text(j.to.name, 360, 194, 14, MUTED);
  text(`${dateOnPass(j.departure, j.from.tz)}  /  ${j.departureLocal} local`, 29, 169, 11);
  text(`${dateOnPass(j.arrival, j.to.tz)}  /  ${j.arrivalLocal} local`, 360, 169, 11);

  content.push(`q ${LINE} RG 0.45 w 163 216 m 206 242 289 245 335 218 c S`, 'Q');
  content.push(`q ${GOLD} RG 1 w 163 222 m 220 273 282 261 335 235 c S`, 'Q');
  rect(161, 220, 4, 4, GOLD);
  rect(333, 233, 4, 4, GOLD);
  content.push(`q 0.99 0.15 -0.15 0.99 251 251 cm ${GOLD} rg -14 -2 m -5 1 l -9 8 l -5 8 l 3 2 l 10 2 l 14 0 l 10 -2 l 3 -2 l -5 -8 l -9 -8 l -5 -1 l h f Q`);
  text(`${j.durationLabel}  FLIGHT`, 202, 184, 9, MUTED, 'F3');

  field('GUEST', `Guest ${guest + 1} of ${quote.assigned}`, 28, 120);
  field('CABIN CLASS', TIERS[slot.tier].short, 162, 120);
  field('SLEEP WINDOW', j.sleepLabel, 315, 120);
  label('CAPSULE LOCATION', 28, 80);
  text(slot.position.replaceAll(' · ', ' / '), 28, 63, 11);
  label('CABIN SETTINGS', 28, 43);
  const airflow = AIRFLOWS.find(({ id }) => id === prefs.airflow)?.name ?? prefs.airflow;
  text(`${prefs.temperature.toFixed(1)} °C  /  ${SCENE[prefs.lighting].name}, ${AMBIENT[prefs.ambient].name.toLowerCase()} ${prefs.ambientLevel}%  /  ${SOUND_LABEL[prefs.sound]}  /  Window tint ${prefs.windowTint}%`, 28, 28, 10, MUTED);
  text(`Wake ${WAKE_LABEL[prefs.wake]}  /  Wake-up light ${prefs.wakeIntensity}%  /  Airflow ${airflow}  /  Reading light ${prefs.reading ? 'on' : 'off'}`, 28, 14, 9, MUTED);

  label('RESERVATION REFERENCE', 572, 319);
  text(reference, 572, 299, 15, GOLD, 'F3');
  rule(572, 285, 734);
  label('YOUR CAPSULE', 572, 267);
  text(slot.id, 570, 215, 49, INK, 'F2');
  text(`${TIERS[slot.tier].short}  /  Guest ${guest + 1}`, 573, 197, 11, MUTED);
  rule(572, 178, 734);
  field('CAPSULE FARE', formatEUR(fare), 572, 159);
  field('DEMO GROUP TOTAL', formatEUR(quote.total), 572, 115);
  rule(572, 80, 734);
  text('DEMONSTRATION ONLY', 572, 62, 11, GOLD, 'F2');
  text('Fictional flight. No charge made.', 572, 46, 9, MUTED);
  text('Invalid for travel.', 572, 33, 9, MUTED);
  text(`${String(guest + 1).padStart(2, '0')} / ${String(quote.assigned).padStart(2, '0')}`, 691, 14, 9, MUTED, 'F3');
  return content.join('\n');
}

/** One vector boarding pass per guest, using the PDF standard fonts. */
export function boardingPassPdf(pass: BoardingPass) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
  ];
  const pages = pass.quote.assignments.map((assignment) => {
    const stream = drawPass(pass, assignment);
    const page = objects.length + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${WIDTH} ${HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${page + 1} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    return `${page} 0 R`;
  });
  objects[1] = `<< /Type /Pages /Count ${pages.length} /Kids [${pages.join(' ')}] >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  return `${pdf}xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${pdf.length}\n%%EOF\n`;
}

