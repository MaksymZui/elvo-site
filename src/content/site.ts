export interface TextPart {
  text: string;
  accent?: boolean;
}

/** Lines of a heading; a part with `accent` takes the light blue colour. */
export type HeadingLines = (string | TextPart)[][];

const accent = (text: string): TextPart => ({ text, accent: true });

export const site = {
  name: 'ELVO',
  url: 'https://elvo.technology',
  email: 'support@elvo.technology',
  title: 'ELVO: Drones, Components, Payload and Fiber Optic Cable',
  description:
    'ELVO supplies drones and components, gimbals and cameras for professional UAV applications, and G.657.A2 fiber optic cable.',
  ogImageAlt: 'ELVO logo over a drone flying at sunset',
  tagline: ['Electronics', 'Drones', 'Components'],
  skipLink: 'Skip to content',
  contactLabel: 'Contact',
  menu: { open: 'Open menu', close: 'Close menu', label: 'Main' },
  homeLabel: 'ELVO home',
  sectionsLabel: 'Sections',
  sections: {
    top: 'Home',
    drones: 'Drones',
    payload: 'Payload',
    fiber: 'Fiber Optic',
    solutions: 'Solutions',
    contact: 'Contact',
  },
  nav: [
    { label: 'Drones', href: '#drones' },
    { label: 'Payload', href: '#payload' },
    { label: 'Fiber Optic', href: '#fiber' },
    { label: 'Solutions', href: '#solutions' },
  ],
  hero: {
    heading: [['Drones'], ['and ', accent('Components')]] as HeadingLines,
    imageAlt: 'Matrice 4T drone in flight over a mountain ridge at sunset',
    features: [
      { icon: 'shield-check', title: 'Original products', text: 'from trusted brands' },
      { icon: 'truck', title: 'Fast delivery', text: 'across Ukraine' },
      { icon: 'headset', title: 'Expert support', text: 'and consultation' },
    ],
  },
  drones: {
    heading: [['Drones'], ['and'], [accent('Components')]] as HeadingLines,
    imageAlt: 'DJI Matrice 4T and Autel Evo Max 4T drones on a dark reflective floor',
    models: [
      { id: 'dji', name: 'DJI Matrice 4T', alt: 'DJI Matrice 4T drone on a dark reflective floor' },
      {
        id: 'autel',
        name: 'Autel Evo Max 4T',
        alt: 'Autel Evo Max 4T drone on a dark reflective floor',
      },
    ],
  },
  payload: {
    heading: [['Professional'], [accent('Payload Solutions')]] as HeadingLines,
    text: 'High Performance Gimbals and Cameras for Professional UAV Applications.',
    imageAlt: 'Close view of a multi-lens gimbal camera',
  },
  fiber: {
    heading: [['Fiber Optic ', accent('Cable')]] as HeadingLines,
    standard: 'G.657.A2',
    text: 'Reliable connectivity for demanding applications.',
    imageAlt: 'Coil of black fiber optic cable with glowing blue fibers at the open end',
  },
  solutions: {
    heading: [['Professional'], [accent('Grade'), ' Solutions']] as HeadingLines,
    text: 'Premium components for reliable and efficient UAV operations.',
    panels: {
      camera: 'Multi-lens drone camera',
      propeller: 'Carbon propeller on a brushless motor',
      transmitter: 'Video transmitter with gold antenna connectors',
      frame: 'Carbon fiber drone frame',
      fpv: 'FPV camera module',
      fiber: 'Fiber optic cable with glowing fibers',
      chip: 'Flight controller board',
      goggles: 'FPV goggles',
    },
  },
  contact: {
    company: 'E-TRADE GROUP Sp. z o.o.',
    address: ['00-855 Warszawa', 'Grzybowska 43, 1p'],
    emailLabel: 'Email',
    addressLabel: 'Address',
  },
  copyright: '© ELVO',
};
