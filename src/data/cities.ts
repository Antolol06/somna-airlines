/**
 * SŌMNA demonstration network.
 * Every route, schedule, duration and price derived from this file is
 * conceptual demonstration data — SŌMNA is a fictional airline.
 */
export type CityId =
  | 'rome'
  | 'newyork'
  | 'tokyo'
  | 'singapore'
  | 'dubai'
  | 'london'
  | 'paris'
  | 'losangeles';

export interface City {
  id: CityId;
  name: string;
  code: string;
  country: string;
  lat: number;
  lon: number;
  tz: string;
  /** Short poetic line used in the wake-up reveal. */
  morning: string;
}

export const CITIES: City[] = [
  { id: 'rome', name: 'Rome', code: 'FCO', country: 'Italy', lat: 41.9028, lon: 12.4964, tz: 'Europe/Rome', morning: 'Terracotta and domes, warming slowly in the first light.' },
  { id: 'newyork', name: 'New York', code: 'JFK', country: 'United States', lat: 40.7128, lon: -74.006, tz: 'America/New_York', morning: 'Manhattan, catching the early sun on a thousand windows.' },
  { id: 'tokyo', name: 'Tokyo', code: 'HND', country: 'Japan', lat: 35.6762, lon: 139.6503, tz: 'Asia/Tokyo', morning: 'A sunrise over the bay, and a city quietly waking.' },
  { id: 'singapore', name: 'Singapore', code: 'SIN', country: 'Singapore', lat: 1.3521, lon: 103.8198, tz: 'Asia/Singapore', morning: 'Warm air over the marina, the towers turning gold.' },
  { id: 'dubai', name: 'Dubai', code: 'DXB', country: 'United Arab Emirates', lat: 25.2048, lon: 55.2708, tz: 'Asia/Dubai', morning: 'Desert haze, a coastline of glass, the day already bright.' },
  { id: 'london', name: 'London', code: 'LHR', country: 'United Kingdom', lat: 51.5072, lon: -0.1276, tz: 'Europe/London', morning: 'Soft light along the river, the city in silhouette.' },
  { id: 'paris', name: 'Paris', code: 'CDG', country: 'France', lat: 48.8566, lon: 2.3522, tz: 'Europe/Paris', morning: 'The rooftops of Paris under golden morning light.' },
  { id: 'losangeles', name: 'Los Angeles', code: 'LAX', country: 'United States', lat: 34.0522, lon: -118.2437, tz: 'America/Los_Angeles', morning: 'Palms against the hills, the Pacific light arriving.' },
];

export const CITY: Record<CityId, City> = Object.fromEntries(CITIES.map((c) => [c.id, c])) as Record<CityId, City>;

const R_EARTH = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;

export function distanceKm(a: City, b: City) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}

/** Offset of a time zone from UTC in minutes at a given instant. */
export function tzOffsetMinutes(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}

export function formatLocalTime(date: Date, tz: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

export function formatLocalDate(date: Date, tz: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(date);
}

export interface Journey {
  from: City;
  to: City;
  km: number;
  hours: number;
  durationLabel: string;
  approxLabel: string;
  sleepHours: number;
  sleepLabel: string;
  tagline: string;
  departure: Date;
  arrival: Date;
  departureLocal: string;
  arrivalLocal: string;
  departureDate: string;
  arrivalDate: string;
  dayShift: number;
  tzShiftHours: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function todayPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function taglineFor(hours: number, from: City, to: City) {
  if (from.id === to.id) return 'Stay a little longer.';
  if (hours >= 10) return 'One night. Two worlds.';
  if (hours >= 7) return 'Close your eyes here. Open them there.';
  if (hours >= 4) return 'A short night, a new horizon.';
  return 'A brief dream, a different city.';
}

/**
 * Builds an illustrative SŌMNA itinerary. Schedules are chosen so that the
 * guest wakes in the destination's morning (between 05:45 and 10:30 local),
 * preferring a departure as close as possible to 22:30 at the origin.
 */
export function computeJourney(fromId: CityId, toId: CityId, dateISO: string = todayPlus(14)): Journey {
  const from = CITY[fromId];
  const to = CITY[toId];
  const km = distanceKm(from, to);
  const hours = km / 850 + 0.6;
  const durMin = Math.round((hours * 60) / 5) * 5;

  const [y, m, d] = dateISO.split('-').map(Number);
  const noonUTC = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12));
  const offO = tzOffsetMinutes(from.tz, noonUTC);
  const offD = tzOffsetMinutes(to.tz, noonUTC);

  let best = { dep: 0, score: Infinity };
  for (let arr = 5 * 60 + 45; arr <= 10 * 60 + 30; arr += 15) {
    const depUTC = arr - offD - durMin;
    const depLocal = (((depUTC + offO) % 1440) + 1440) % 1440;
    const target = 22 * 60 + 30;
    let diff = Math.abs(depLocal - target);
    diff = Math.min(diff, 1440 - diff);
    if (diff < best.score) best = { dep: depLocal, score: diff };
  }
  const depLocalMin = Math.round(best.dep / 5) * 5;
  // departure instant: chosen date at depLocalMin in origin tz
  const departure = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0) + (depLocalMin - offO) * 60000);
  const arrival = new Date(departure.getTime() + durMin * 60000);

  const depDay = Math.floor((departure.getTime() + offO * 60000) / 86400000);
  const arrDay = Math.floor((arrival.getTime() + tzOffsetMinutes(to.tz, arrival) * 60000) / 86400000);

  const hh = Math.floor(durMin / 60);
  const mm = durMin % 60;

  let sleepHours = 0;
  let sleepLabel: string;
  if (hours >= 5) {
    sleepHours = Math.max(1, Math.floor((hours - 3) * 2) / 2);
    sleepLabel = `up to ${sleepHours % 1 === 0 ? sleepHours.toFixed(0) : sleepHours.toFixed(1)} hours`;
  } else {
    const mins = Math.max(20, Math.round(((hours * 60 - 40) * 0.7) / 5) * 5);
    sleepHours = mins / 60;
    sleepLabel = mins >= 60 ? `up to ${(mins / 60).toFixed(1)} hours` : `a ${mins}-minute rest`;
  }

  const approx = hours >= 1.5 ? `approximately ${Math.round(hours)} hours` : `approximately ${Math.round(hours * 60 / 5) * 5} minutes`;

  return {
    from,
    to,
    km,
    hours,
    durationLabel: `${hh}h ${pad(mm)}m`,
    approxLabel: approx,
    sleepHours,
    sleepLabel,
    tagline: taglineFor(hours, from, to),
    departure,
    arrival,
    departureLocal: formatLocalTime(departure, from.tz),
    arrivalLocal: formatLocalTime(arrival, to.tz),
    departureDate: formatLocalDate(departure, from.tz),
    arrivalDate: formatLocalDate(arrival, to.tz),
    dayShift: arrDay - depDay,
    tzShiftHours: (tzOffsetMinutes(to.tz, arrival) - tzOffsetMinutes(from.tz, departure)) / 60,
  };
}

/** Lat/lon → position on a sphere matching three.js SphereGeometry UV layout. */
export function latLonToXYZ(lat: number, lon: number, r = 1): [number, number, number] {
  const la = toRad(lat);
  const lo = toRad(lon);
  return [r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo)];
}

/** Approximate sub-solar point for a given date (declination & longitude, degrees). */
export function subSolarPoint(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = (date.getTime() - start) / 86400000;
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60;
  const lon = -15 * (utcHours - 12);
  return { lat: decl, lon };
}
