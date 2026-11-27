import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// the website's own typefaces
import '@fontsource/jost/200.css';
import '@fontsource/jost/300.css';
import '@fontsource/jost/400.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles/deck.css';
import { Deck } from './deck/Deck';
import { Presenter } from './deck/Presenter';

const presenter = new URLSearchParams(location.search).has('presenter');
document.documentElement.classList.toggle('is-presenter', presenter);

createRoot(document.getElementById('root')!).render(<StrictMode>{presenter ? <Presenter /> : <Deck />}</StrictMode>);
