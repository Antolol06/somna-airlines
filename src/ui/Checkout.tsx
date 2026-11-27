import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { Journey } from '../data/cities';
import { formatEUR, TIERS, type quoteCapsules } from '../data/capsules';
import { DESTINATION_PHOTOS } from '../data/destinations';
import { lockScroll } from '../lib/scroll';
import { audio } from '../lib/audio';
import type { Prefs } from '../state/store';
import { BoardingPassLink } from './BoardingPassLink';
import { Wordmark } from './Wordmark';

export type CapsuleQuote = ReturnType<typeof quoteCapsules>;
const DEMO_CARD = { name: 'SOMNA DEMO TRAVELLER', number: '4242 4242 4242 4242', expiry: '12/39', code: '123' };
const EMPTY_CARD = { name: '', number: '', expiry: '', code: '' };
type CardField = keyof typeof DEMO_CARD;
const PAYMENT_FIELDS: { key: CardField; label: string; placeholder: string; max: number }[] = [
  { key: 'name', label: 'Cardholder', placeholder: 'Demo traveller', max: 64 },
  { key: 'number', label: 'Card number', placeholder: '4242 4242 4242 4242', max: 24 },
  { key: 'expiry', label: 'Expiry', placeholder: 'MM/YY', max: 7 },
  { key: 'code', label: 'Security code', placeholder: '123', max: 4 },
];
const FLIGHT_PATH = 'M 54 165 C 160 155 254 27 462 58';
const PAYMENT_STEPS = [
  { label: 'Card check', status: 'Checking the demo card…' },
  { label: 'Cabin ready', status: 'Confirming your capsules…' },
  { label: 'Passes issued', status: 'Your boarding passes are ready.' },
] as const;

const digits = (value: string) => value.replace(/\D/g, '');

function cardErrors(card: typeof DEMO_CARD) {
  const errors: Partial<Record<CardField, string>> = {};
  if (!card.name.trim()) errors.name = 'Enter a name for the demo card.';
  if (!/^[\d -]+$/.test(card.number) || !/^\d{13,19}$/.test(digits(card.number))) errors.number = 'Enter a demo card number with 13 to 19 digits.';
  const date = card.expiry.match(/^(0[1-9]|1[0-2])\s*\/?\s*(\d{2}|20\d{2})$/);
  const today = new Date();
  if (!date) errors.expiry = 'Enter the expiry as MM/YY.';
  else if ((Number(date[2]) % 100) * 12 + Number(date[1]) < (today.getFullYear() % 100) * 12 + today.getMonth() + 1) {
    errors.expiry = 'Enter an expiry this month or later.';
  }
  if (!/^\d{3,4}$/.test(card.code)) errors.code = 'Enter 3 or 4 digits.';
  return errors;
}

function reservationReference() {
  const alphabet = 'ACDEFHJKLMNPRSTUVWXY';
  const group = () => Array.from({ length: 3 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  return `SMN-${group()}-${group()}`;
}

function CapsuleFares({ quote }: { quote: CapsuleQuote }) {
  return (
    <ul className="checkout-fares" aria-label="Guest capsule fares">
      {quote.assignments.map(({ guest, slot, fare }) => slot && fare !== null && (
        <li key={guest}>
          <span>Guest {guest + 1} <small>{slot.id} · {TIERS[slot.tier].short}</small></span>
          <strong>{formatEUR(fare)}</strong>
        </li>
      ))}
    </ul>
  );
}

function DemoCard({ lastFour }: { lastFour: string }) {
  return (
    <div className="checkout-card" aria-hidden="true">
      <Wordmark />
      <span className="checkout-card-chip" />
      <span className="checkout-card-number">•••• &nbsp;•••• &nbsp;•••• &nbsp;{lastFour || '••••'}</span>
      <span className="checkout-card-tag">DEMO CARD</span>
    </div>
  );
}

function PaymentSequence({ journey, step, lastFour, passes, reduced }: { journey: Journey; step: number; lastFour: string; passes: number; reduced: boolean }) {
  const route = `${journey.from.code} to ${journey.to.code}`;
  return (
    <>
      <p className="checkout-flight-status" role="status">{PAYMENT_STEPS[step].status}</p>
      <div className="checkout-theatre" data-step={step} aria-hidden="true">
        <div className="checkout-stars" />
        {step === 0 && !reduced && (
          <div className="checkout-reader">
            <span className="checkout-reader-ring" />
            <span className="checkout-reader-ring" />
            <div className="checkout-scanned-card"><DemoCard lastFour={lastFour} /><span className="checkout-scan" /></div>
            <span className="checkout-reader-corner" />
          </div>
        )}
        {step === 1 && !reduced && (
          <svg className="checkout-airspace" viewBox="0 0 520 220" focusable="false">
            <path className="checkout-horizon" d="M-20 232 Q182 74 545 127 M-6 251 Q233 105 555 158 M-10 266 Q230 137 560 178" />
            <path className="checkout-arc-base" d={FLIGHT_PATH} />
            <path className="checkout-arc" d={FLIGHT_PATH} pathLength="1" />
            <circle className="checkout-beacon" cx="54" cy="165" r="5" />
            <circle className="checkout-beacon" cx="462" cy="58" r="5" />
            <text x="54" y="192" textAnchor="middle">{journey.from.code}</text>
            <text x="462" y="32" textAnchor="middle">{journey.to.code}</text>
            <path className="checkout-plane" d="M18 0l-7-3H3L-6-13h-5l5 10h-7l-4-5h-3l3 8-3 8h3l4-5h7l-5 10h5l9-10h8Z">
              <animateMotion path={FLIGHT_PATH} dur="1.53s" rotate="auto" fill="freeze" />
            </path>
          </svg>
        )}
        {(step === 2 || reduced) && (
          <div className="checkout-issued">
            <div className="checkout-issued-main">
              <span className="annot">SŌMNA · Boarding passes</span>
              <strong>{journey.from.code} <em>→</em> {journey.to.code}</strong>
              <span>{passes} {passes === 1 ? 'guest' : 'guests'} · {route}</span>
            </div>
            <span className="checkout-issued-stamp">✓</span>
          </div>
        )}
      </div>
      <ol className="checkout-progress" aria-label="Demo payment progress">
        {PAYMENT_STEPS.map(({ label }, index) => <li key={label} data-complete={index < step} aria-current={index === step ? 'step' : undefined}>{label}</li>)}
      </ol>
    </>
  );
}

interface CheckoutProps {
  journey: Journey;
  quote: CapsuleQuote;
  prefs: Prefs;
  reducedMotion: boolean;
  onClose: () => void;
  onComplete: (reference: string) => void;
  onFarewell: () => void;
}

export function Checkout({ journey, quote, prefs, reducedMotion, onClose, onComplete, onFarewell }: CheckoutProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const [card, setCard] = useState(EMPTY_CARD);
  const [validate, setValidate] = useState(false);
  const [lastFour, setLastFour] = useState('');
  const fields = useRef<Partial<Record<CardField, HTMLInputElement | null>>>({});
  const [phase, setPhase] = useState<'payment' | 'processing' | 'farewell'>('payment');
  const [step, setStep] = useState(0);
  const [reference, setReference] = useState('');
  const j = journey;
  const order = quote;
  const photo = DESTINATION_PHOTOS[j.to.id];
  const errors = validate ? cardErrors(card) : {};
  const demoFilled = PAYMENT_FIELDS.every(({ key }) => DEMO_CARD[key] === card[key]);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    lockScroll(true);
    return () => {
      dialog?.close();
      lockScroll(false);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'payment') heading.current?.focus();
    if (phase !== 'processing') return;
    if (reducedMotion) setStep(2);
    const flight = window.setTimeout(() => setStep(reducedMotion ? 2 : 1), reducedMotion ? 0 : 1280);
    const stamp = window.setTimeout(() => setStep(2), reducedMotion ? 0 : 3000);
    const complete = window.setTimeout(() => {
      const id = reservationReference();
      setReference(id);
      setPhase('farewell');
      onComplete(id);
      audio.chime();
    }, reducedMotion ? 210 : 4160);
    return () => {
      window.clearTimeout(flight);
      window.clearTimeout(stamp);
      window.clearTimeout(complete);
    };
  }, [phase, reducedMotion, onComplete]);

  const close = () => {
    ref.current?.close();
    onClose();
  };

  const pay = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!order.complete || phase !== 'payment') return;
    const invalid = cardErrors(card);
    const first = PAYMENT_FIELDS.find(({ key }) => invalid[key]);
    if (first) {
      setValidate(true);
      fields.current[first.key]?.focus();
      return;
    }
    setLastFour(digits(card.number).slice(-4));
    setCard(EMPTY_CARD);
    setValidate(false);
    audio.blip(620);
    setPhase('processing');
  };

  return (
    <dialog className="checkout" ref={ref} aria-labelledby={titleId} data-phase={phase}
      data-reduced={reducedMotion} onCancel={(event) => { event.preventDefault(); close(); }}>
      <header className="checkout-top">
        <Wordmark />
        <button className="btn btn-ghost btn-sm" onClick={close}>{phase === 'processing' ? 'Cancel demo' : phase === 'farewell' ? 'Close' : 'Back to booking'}</button>
      </header>
      {phase === 'payment' && (
        <div className="checkout-grid">
          <form className="checkout-form" onSubmit={pay} autoComplete="off" noValidate>
            <h2 id={titleId}>Demo payment</h2>
            <p>Enter fictional card details or use the sample card. This checkout runs locally in your browser.</p>
            <DemoCard lastFour={digits(card.number).length >= 13 ? digits(card.number).slice(-4) : ''} />
            <div className="checkout-fields">
              {PAYMENT_FIELDS.map(({ key, label, placeholder, max }) => (
                <div className="checkout-field" key={key}>
                  <label htmlFor={`${titleId}-field-${key}`}>{label}</label>
                  <input id={`${titleId}-field-${key}`} ref={(element) => { fields.current[key] = element; }} value={card[key]} placeholder={placeholder} maxLength={max}
                    inputMode={key === 'name' ? 'text' : 'numeric'} autoComplete="off" spellCheck={false}
                    aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${titleId}-${key}` : undefined}
                    onChange={(event) => setCard({ ...card, [key]: event.target.value })} />
                  {errors[key] && <span className="checkout-field-error" id={`${titleId}-${key}`}>{errors[key]}</span>}
                </div>
              ))}
            </div>
            <div className="checkout-actions">
              <button className="btn btn-ghost" type="button" onClick={() => { setCard(DEMO_CARD); setValidate(false); audio.blip(760); }}>Use demo card</button>
              <button className="btn btn-primary" type="submit">Simulate payment</button>
            </div>
            <span className="checkout-card-notice" role="status">{demoFilled ? 'Demo card filled. All fields are editable.' : ''}</span>
          </form>
          <aside className="checkout-order" aria-label="Checkout summary">
            <span className="annot">{j.departureDate} · {j.departureLocal} local</span>
            <h3>{j.from.code} <em>→</em> {j.to.code}</h3>
            <p>{j.from.name} to {j.to.name}</p>
            <CapsuleFares quote={order} />
            <div className="checkout-total"><span>Group total</span><strong>{formatEUR(order.total)}</strong></div>
          </aside>
        </div>
      )}
      {phase === 'processing' && (
        <div className="checkout-flight">
          <h2 ref={heading} id={titleId} tabIndex={-1}>Preparing your night</h2>
          <PaymentSequence journey={j} step={step} lastFour={lastFour} passes={order.assigned} reduced={reducedMotion} />
        </div>
      )}
      {phase === 'farewell' && (
        <div className="checkout-farewell" style={{ backgroundImage: `linear-gradient(90deg, #0d1018 15%, #0d1018e8 52%, #0d10186e), url("${photo.src}")` }}>
          <span className="eyebrow">Demo reservation complete · {reference}</span>
          <h2 ref={heading} id={titleId} tabIndex={-1}>Until morning,<br /><em>{j.to.name}.</em></h2>
          <p>Thank you for dreaming with SŌMNA. Your group is all set.</p>
          <CapsuleFares quote={order} />
          <div className="checkout-total"><span>Simulated total</span><strong>{formatEUR(order.total)}</strong></div>
          <div className="checkout-actions">
            <BoardingPassLink reference={reference} journey={j} quote={order} prefs={prefs} primary />
            <button className="btn btn-ghost" onClick={onFarewell}>Back to the sky</button>
          </div>
          <p className="checkout-disclaimer">One demo boarding pass per guest. No charge was made.</p>
          <p className="checkout-credit">Photo by <a href={photo.credit.url} target="_blank" rel="noopener noreferrer">{photo.credit.name}</a></p>
        </div>
      )}
    </dialog>
  );
}
