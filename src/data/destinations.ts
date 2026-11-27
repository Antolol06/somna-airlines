import type { CityId } from './cities';

/**
 * Arrival photographs. All are published under the Unsplash License (free to use,
 * no permission needed — https://unsplash.com/license); photographers are credited
 * on screen during the arrival and in the README.
 *
 * Coordinates are in image UV space (0,0 = bottom-left): `focal` keeps the landmark in
 * frame on narrow screens, `sun` places the light bloom, `horizon` separates sky from city.
 */
export interface DestinationPhoto {
  src: string;
  focal: [number, number];
  sun: [number, number];
  horizon: number;
  sunGain: number;
  /** which side the typography sits on (the landmark takes the other) */
  side?: 'left' | 'right';
  /** extra darkening behind the type for bright skies */
  scrim?: number;
  landmark: string;
  credit: { name: string; url: string };
}

const u = (id: string) => `https://unsplash.com/photos/${id}`;

export const DESTINATION_PHOTOS: Record<CityId, DestinationPhoto> = {
  tokyo: {
    src: '/destinations/tokyo.jpg',
    focal: [0.5, 0.56],
    sun: [0.22, 0.72],
    horizon: 0.66,
    sunGain: 0.7,
    landmark: 'Tokyo Tower',
    credit: { name: 'Alexandre Lallemand', url: u('aerial-view-of-city-buildings-during-daytime-UtPC_kz8CAc') },
  },
  newyork: {
    src: '/destinations/newyork.jpg',
    focal: [0.5, 0.5],
    sun: [0.88, 0.62],
    horizon: 0.6,
    sunGain: 0.8,
    landmark: 'Lower Manhattan from Brooklyn',
    credit: { name: 'Luca Bravo', url: u('panoramic-photography-of-brooklyn-bridge-_QdFx92MO2U') },
  },
  paris: {
    src: '/destinations/paris.jpg',
    focal: [0.5, 0.55],
    sun: [0.74, 0.66],
    horizon: 0.65,
    sunGain: 0.8,
    landmark: 'The Eiffel Tower and the Champ de Mars',
    credit: { name: 'Timelab', url: u('the-eiffel-tower-towering-over-the-city-of-paris-uYrACAHq6jI') },
  },
  rome: {
    src: '/destinations/rome.jpg',
    focal: [0.72, 0.5],
    sun: [0.32, 0.86],
    horizon: 0.47,
    sunGain: 0.55,
    scrim: 1.35,
    landmark: 'The rooftops toward St Peter’s',
    credit: { name: 'Wyatt Simpson', url: u('cityscape-of-rome-with-beautiful-architecture-zvN8ZiBa6Iw') },
  },
  london: {
    src: '/destinations/london.jpg',
    focal: [0.46, 0.45],
    sun: [0.5, 0.84],
    horizon: 0.77,
    sunGain: 0.75,
    landmark: 'The Thames at first light',
    credit: { name: 'Jaanus Jagomägi', url: u('london-cityscape-with-st-pauls-cathedral-Dymu1WiZVko') },
  },
  dubai: {
    src: '/destinations/dubai.jpg',
    focal: [0.32, 0.5],
    sun: [0.64, 0.44],
    horizon: 0.42,
    sunGain: 0.9,
    side: 'right',
    scrim: 1.3,
    landmark: 'The Burj Khalifa skyline',
    credit: { name: 'James Watson', url: u('the-sun-is-setting-over-the-city-skyline-7bknZdECbqY') },
  },
  singapore: {
    src: '/destinations/singapore.jpg',
    focal: [0.55, 0.5],
    sun: [0.32, 0.77],
    horizon: 0.5,
    sunGain: 0.3,
    scrim: 1.5,
    landmark: 'Marina Bay Sands',
    credit: { name: 'Kirill Petropavlov', url: u('marina-bay-sands-hotel-during-daytime-vmGwPt9gpV0') },
  },
  losangeles: {
    src: '/destinations/losangeles.jpg',
    focal: [0.5, 0.55],
    sun: [0.2, 0.86],
    horizon: 0.55,
    sunGain: 0.55,
    landmark: 'Downtown Los Angeles',
    credit: { name: 'Riccardo Tuninato', url: u('a-view-of-a-city-with-tall-buildings-and-palm-trees-1Xnzs_WKV1s') },
  },
};
