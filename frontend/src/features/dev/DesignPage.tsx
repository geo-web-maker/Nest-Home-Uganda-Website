// Development-only showcase of every S1 component. It is not in the production
// build and not pre-rendered, so its demo text is not part of the i18n strings.
import { useState } from 'react';
import { Logo } from '../../components/brand/Logo';
import { Weave } from '../../components/brand/Weave';
import { Accordion } from '../../components/ui/Accordion';
import { AccentText } from '../../components/ui/AccentText';
import { Badge } from '../../components/ui/Badge';
import type { BadgeTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { Field } from '../../components/ui/Field';
import { Rule } from '../../components/ui/Rule';
import shapes from '../../design/shapes.module.css';
import styles from './DesignPage.module.css';

type Theme = 'auto' | 'light' | 'dark';

const SWATCHES = [
  'bg',
  'mint',
  'surf',
  'ink',
  'mut',
  'forest',
  'leaf',
  'moss',
  'gold',
  'straw',
  'line',
  'onf',
];
const TONES: BadgeTone[] = ['default', 'new', 'blue', 'purple', 'red'];
const CARE = ['Elderly care', 'Postnatal care', 'Wound care', 'Chronic disease care'];
const FAQ = [
  { id: 'a', summary: 'How quickly can care start?', content: 'Placeholder answer.' },
  { id: 'b', summary: 'What if I need to cancel?', content: 'Placeholder answer.' },
];

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function DesignPage() {
  const [theme, setTheme] = useState<Theme>('auto');
  const [chosen, setChosen] = useState<string[]>(['Wound care']);

  function pickTheme(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }
  function toggle(name: string) {
    setChosen((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  }

  return (
    <div>
      <section className={styles.dark}>
        <div className="container">
          <Logo name="Nest Home Care" subtitle="Uganda · Kampala" />
          <h1 className={styles.title}>
            Design <AccentText>system</AccentText>
          </h1>
          <p className={styles.lead}>Every foundation component, in one place.</p>
          <div className={styles.row} role="group" aria-label="Theme">
            {(['auto', 'light', 'dark'] as Theme[]).map((t) => (
              <Button
                key={t}
                variant="outline"
                size="header"
                aria-pressed={theme === t}
                onClick={() => pickTheme(t)}
              >
                {t}
              </Button>
            ))}
          </div>
        </div>
        <Weave />
      </section>

      <section className={styles.section}>
        <div className="container">
          <Rule>Colour tokens</Rule>
          <div className={styles.swatches}>
            {SWATCHES.map((name) => (
              <div key={name} className={styles.swatch}>
                <span className={styles.chip} style={{ background: `var(--${name})` }} />
                <code>--{name}</code>
              </div>
            ))}
          </div>
          <Rule>Shapes</Rule>
          <div className={styles.row}>
            <span className={`${styles.shape} ${shapes.egg}`} />
            <span className={`${styles.shape} ${shapes.arch}`} />
            <span className={`${styles.shape} ${shapes.circle}`} />
            <span className={`${styles.shape} ${styles.wide} ${shapes.pill}`} />
            <span className={shapes.diamond} />
            <span className={shapes.diamondLg} />
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.mint}`}>
        <div className="container">
          <Rule>Buttons on light</Rule>
          <div className={styles.row}>
            <Button href="/contact">Book a home visit</Button>
            <Button variant="whatsapp" href="https://wa.me/256787499988">
              WhatsApp us
            </Button>
            <Button variant="outline">Outline</Button>
            <Button size="header">Header size</Button>
          </div>
          <Rule>Heading with accent</Rule>
          <h2 className={styles.h2}>
            Eight kinds of care, one <AccentText>trusted</AccentText> team.
          </h2>
          <Rule centered>Centred rule</Rule>
        </div>
      </section>

      <section className={styles.dark}>
        <div className="container">
          <Rule>Buttons on forest</Rule>
          <div className={styles.row}>
            <Button href="/contact">Book a home visit</Button>
            <Button variant="outline" href="/services">
              Our services
            </Button>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className="container">
          <Rule>Care chips</Rule>
          <div className={styles.row}>
            {CARE.map((name) => (
              <Chip key={name} selected={chosen.includes(name)} onToggle={() => toggle(name)}>
                {name}
              </Chip>
            ))}
          </div>
          <Rule>Area chips</Rule>
          <div className={styles.row}>
            <Chip variant="area">Ntinda</Chip>
            <Chip variant="area">Kololo</Chip>
          </div>
          <Rule>Form fields</Rule>
          <div className={styles.form}>
            <Field label="Full name" required requiredLabel="(required)" />
            <Field label="Phone" error="Enter a valid phone number." defaultValue="07" />
            <Field kind="select" label="Area" defaultValue="">
              <option value="">Choose an area</option>
              <option value="ntinda">Ntinda</option>
            </Field>
            <Field kind="textarea" label="Note" />
          </div>
          <Rule>Badges</Rule>
          <div className={styles.row}>
            {TONES.map((tone) => (
              <Badge key={tone} tone={tone}>
                {tone}
              </Badge>
            ))}
          </div>
          <Rule>Accordion</Rule>
          <Accordion items={FAQ} />
        </div>
      </section>
    </div>
  );
}

export const Component = DesignPage;
