/**
 * Sample data for the customer site, one export per future database table
 * or API resource. Pages read only from here (and page-local helpers), so
 * swapping in real data later means replacing these exports with API calls
 * in src/api/ without touching the pages.
 *
 * Image names refer to public/images/<name>.(png|jpg|webp); missing files
 * show a placeholder (see components/Photo).
 */

export type Quality = 'OEM' | 'Genuine' | 'Aftermarket';
export type Fitment = 'guaranteed' | 'universal';

export interface Part {
  id: string;
  slug: string;
  name: string;
  brand: string;
  category: string;
  quality: Quality;
  fitment: Fitment;
  partNumber: string;
  price: number;
  compareAt?: number;
  rating: number;
  reviewCount: number;
  image: string;
  stock: number;
  summary: string;
  description: string[];
  features: string[];
  specs: { label: string; value: string }[];
  oemReferences: string[];
  warranty: string;
}

export const PART_CATEGORIES = ['Brakes & Rotors', 'Engine Components', 'Filters & Fluids', 'Suspension', 'Ignition'] as const;
export const QUALITIES: Quality[] = ['OEM', 'Genuine', 'Aftermarket'];

export const PARTS: Part[] = [
  {
    id: 'p-1001',
    slug: 'zimmermann-slotted-brake-rotors-front',
    name: 'Zimmermann Slotted Brake Rotors (Front Pair)',
    brand: 'Zimmermann',
    category: 'Brakes & Rotors',
    quality: 'OEM',
    fitment: 'guaranteed',
    partNumber: '34116895399',
    price: 289.99,
    compareAt: 350,
    rating: 4.8,
    reviewCount: 128,
    image: 'part-rotors',
    stock: 14,
    summary: 'Price for pair (left and right). Excludes taxes.',
    description: [
      'High-performance slotted rotors engineered for the G80 M3, with better heat dissipation and fade resistance under hard braking.',
      'The precision-machined slots clean the pad surface continuously, preventing glazing and keeping bite consistent. A Coat Z anti-corrosion finish keeps non-friction surfaces looking new.',
    ],
    features: [
      'High-carbon cast iron for thermal stability',
      'Precision-machined slots for pad outgassing',
      'Coat Z anti-corrosion protection on non-friction surfaces',
      'Direct OEM replacement, no modifications needed',
      'Manufactured in Germany to ISO/TS 16949 standards',
    ],
    specs: [
      { label: 'Position', value: 'Front axle' },
      { label: 'Diameter', value: '380 mm' },
      { label: 'Type', value: 'Vented, slotted' },
      { label: 'Coating', value: 'Coat Z anti-corrosion' },
    ],
    oemReferences: ['34 11 6 895 399', '34 11 6 895 400'],
    warranty: '2 years or 40,000 km, whichever comes first.',
  },
  {
    id: 'p-1002',
    slug: 'brembo-ceramic-brake-pads-front',
    name: 'Brembo Ceramic Brake Pads (Front Set)',
    brand: 'Brembo',
    category: 'Brakes & Rotors',
    quality: 'OEM',
    fitment: 'guaranteed',
    partNumber: 'P06075N',
    price: 124.99,
    rating: 4.8,
    reviewCount: 85,
    image: 'part-pads',
    stock: 22,
    summary: 'Set of four pads for one axle.',
    description: ['Low-dust ceramic compound with quiet operation and stable friction from cold to track temperatures.'],
    features: ['Low dust', 'Shims and chamfers pre-fitted', 'Includes wear sensor clip'],
    specs: [
      { label: 'Position', value: 'Front axle' },
      { label: 'Compound', value: 'Ceramic' },
    ],
    oemReferences: ['34 10 8 089 948'],
    warranty: '1 year.',
  },
  {
    id: 'p-1003',
    slug: 'mann-oil-filter-kit',
    name: 'Mann Oil Filter Kit with O-Rings',
    brand: 'Mann',
    category: 'Filters & Fluids',
    quality: 'Genuine',
    fitment: 'guaranteed',
    partNumber: 'HU 816 x',
    price: 18.5,
    rating: 5,
    reviewCount: 210,
    image: 'part-oil-filter',
    stock: 60,
    summary: 'Filter element with sealing rings.',
    description: ['Factory-specification filter element for BMW S58 and B58 engines.'],
    features: ['Includes O-rings', 'Factory specification media'],
    specs: [{ label: 'Engine', value: 'S58, B58' }],
    oemReferences: ['11 42 8 575 211'],
    warranty: '1 year.',
  },
  {
    id: 'p-1004',
    slug: 'ngk-laser-iridium-spark-plugs-6',
    name: 'NGK Laser Iridium Spark Plugs (Set of 6)',
    brand: 'NGK',
    category: 'Ignition',
    quality: 'OEM',
    fitment: 'guaranteed',
    partNumber: '97968',
    price: 89.99,
    rating: 4.9,
    reviewCount: 156,
    image: 'part-spark-plugs',
    stock: 18,
    summary: 'Pre-gapped, set of six.',
    description: ['Long-life iridium plugs as fitted at the factory.'],
    features: ['Pre-gapped', 'Iridium centre electrode'],
    specs: [{ label: 'Quantity', value: '6' }],
    oemReferences: ['12 12 0 039 664'],
    warranty: '1 year.',
  },
  {
    id: 'p-1005',
    slug: 'bilstein-b6-performance-shock',
    name: 'Bilstein B6 Performance Shock Absorber',
    brand: 'Bilstein',
    category: 'Suspension',
    quality: 'Aftermarket',
    fitment: 'universal',
    partNumber: '24-264488',
    price: 185,
    rating: 4.7,
    reviewCount: 42,
    image: 'part-shock',
    stock: 6,
    summary: 'Sold individually.',
    description: ['Monotube gas-pressure damper for sharper response without a harsher ride.'],
    features: ['Monotube design', 'Direct fit for standard springs'],
    specs: [{ label: 'Position', value: 'Rear' }],
    oemReferences: [],
    warranty: 'Lifetime limited.',
  },
  {
    id: 'p-1006',
    slug: 'liqui-moly-leichtlauf-5w40-5l',
    name: 'Liqui Moly Leichtlauf High Tech 5W-40 (5L)',
    brand: 'Liqui Moly',
    category: 'Filters & Fluids',
    quality: 'Genuine',
    fitment: 'guaranteed',
    partNumber: '2332',
    price: 45.99,
    rating: 4.9,
    reviewCount: 340,
    image: 'part-oil',
    stock: 40,
    summary: '5 litre container.',
    description: ['Fully synthetic engine oil with BMW Longlife-01 and Porsche A40 approvals.'],
    features: ['BMW LL-01', 'Porsche A40', 'MB 229.5'],
    specs: [{ label: 'Volume', value: '5 L' }],
    oemReferences: [],
    warranty: 'Not applicable.',
  },
  {
    id: 'p-1007',
    slug: 'bosch-wiper-blade-set',
    name: 'Bosch Aerotwin Wiper Blade Set',
    brand: 'Bosch',
    category: 'Engine Components',
    quality: 'OEM',
    fitment: 'guaranteed',
    partNumber: 'A979S',
    price: 42.5,
    rating: 4.6,
    reviewCount: 98,
    image: 'part-wipers',
    stock: 25,
    summary: 'Driver and passenger blades.',
    description: ['Flat-blade design for even pressure and quiet wiping.'],
    features: ['Pre-installed adapter'],
    specs: [{ label: 'Length', value: '600 / 475 mm' }],
    oemReferences: ['61 61 2 458 052'],
    warranty: '1 year.',
  },
  {
    id: 'p-1008',
    slug: 'mahle-cabin-air-filter-carbon',
    name: 'Mahle Activated Carbon Cabin Filter',
    brand: 'Mahle',
    category: 'Filters & Fluids',
    quality: 'Genuine',
    fitment: 'guaranteed',
    partNumber: 'LAK 1179/S',
    price: 39.99,
    rating: 4.7,
    reviewCount: 64,
    image: 'part-cabin-filter',
    stock: 30,
    summary: 'Set of two.',
    description: ['Removes pollen, dust and odours before they reach the cabin.'],
    features: ['Activated carbon layer'],
    specs: [{ label: 'Quantity', value: '2' }],
    oemReferences: ['64 11 9 237 555'],
    warranty: '1 year.',
  },
  {
    id: 'p-1009',
    slug: 'textar-brake-wear-sensor',
    name: 'Textar Brake Wear Sensor',
    brand: 'Textar',
    category: 'Brakes & Rotors',
    quality: 'OEM',
    fitment: 'guaranteed',
    partNumber: '98053400',
    price: 24.5,
    rating: 4.8,
    reviewCount: 77,
    image: 'part-wear-sensor',
    stock: 50,
    summary: 'Replace with every pad change.',
    description: ['Factory-length wear sensor that warns before pads reach their limit.'],
    features: ['Correct connector and length'],
    specs: [{ label: 'Position', value: 'Front' }],
    oemReferences: ['34 35 6 890 789'],
    warranty: '1 year.',
  },
  {
    id: 'p-1010',
    slug: 'pierburg-water-pump',
    name: 'Pierburg Electric Water Pump',
    brand: 'Pierburg',
    category: 'Engine Components',
    quality: 'OEM',
    fitment: 'guaranteed',
    partNumber: '7.02851.20.8',
    price: 549,
    compareAt: 620,
    rating: 4.6,
    reviewCount: 31,
    image: 'part-water-pump',
    stock: 3,
    summary: 'Includes bolts and seal.',
    description: ['Original-equipment electric coolant pump.'],
    features: ['Includes seal and bolts'],
    specs: [{ label: 'Type', value: 'Electric' }],
    oemReferences: ['11 51 8 635 089'],
    warranty: '2 years.',
  },
  {
    id: 'p-1011',
    slug: 'kw-v3-coilover-kit',
    name: 'KW V3 Coilover Kit',
    brand: 'KW',
    category: 'Suspension',
    quality: 'Aftermarket',
    fitment: 'guaranteed',
    partNumber: '35220093',
    price: 3299,
    rating: 4.9,
    reviewCount: 19,
    image: 'part-coilovers',
    stock: 2,
    summary: 'Complete kit, four corners.',
    description: ['Independent rebound and compression adjustment for road and track.'],
    features: ['Stainless steel bodies', 'Adjustable rebound and compression'],
    specs: [{ label: 'Lowering', value: '15 to 40 mm' }],
    oemReferences: [],
    warranty: '2 years.',
  },
  {
    id: 'p-1012',
    slug: 'bosch-ignition-coil',
    name: 'Bosch Ignition Coil',
    brand: 'Bosch',
    category: 'Ignition',
    quality: 'Genuine',
    fitment: 'guaranteed',
    partNumber: '0221504470',
    price: 64.99,
    rating: 4.7,
    reviewCount: 52,
    image: 'part-ignition-coil',
    stock: 12,
    summary: 'Sold individually.',
    description: ['Pencil coil as fitted at the factory.'],
    features: ['Factory specification'],
    specs: [{ label: 'Quantity', value: '1' }],
    oemReferences: ['12 13 8 657 273'],
    warranty: '2 years.',
  },
];

export function findPart(slugOrId: string): Part | undefined {
  return PARTS.find((p) => p.slug === slugOrId || p.id === slugOrId);
}

/** Bought together with the given part (simple rule for the sample data). */
export function relatedParts(part: Part, count = 2): Part[] {
  return PARTS.filter((p) => p.id !== part.id && p.category === part.category).slice(0, count);
}

export const VEHICLE_YEARS = Array.from({ length: 15 }, (_, i) => String(2025 - i));
export const VEHICLE_MAKES: Record<string, string[]> = {
  Audi: ['A4', 'A6', 'Q5', 'Q7', 'RS6 Avant'],
  BMW: ['M3 Competition', 'M340i', 'X5', '530i'],
  'Mercedes-Benz': ['C 63 AMG', 'E 350', 'GLE 450'],
  Porsche: ['911 Carrera', 'Cayenne', 'Macan', 'Boxster'],
  Volkswagen: ['Golf R', 'Tiguan', 'Atlas'],
};

// Services ---------------------------------------------------------------------

export interface Service {
  id: string;
  category: string;
  name: string;
  text: string;
  duration: string;
  priceFrom: number;
  badge?: 'Popular' | 'Recommended';
  icon: 'oil' | 'filter' | 'battery' | 'scan' | 'gauge' | 'brake' | 'snow' | 'bolt' | 'wrench';
}

export const SERVICE_CATEGORIES = [
  { id: 'maintenance', name: 'Maintenance' },
  { id: 'diagnostics', name: 'Diagnostics' },
  { id: 'performance', name: 'Performance' },
  { id: 'brakes', name: 'Brakes & Suspension' },
  { id: 'climate', name: 'AC & Climate' },
  { id: 'electrical', name: 'Electrical' },
] as const;

export const SERVICES: Service[] = [
  { id: 's-oil', category: 'maintenance', name: 'Synthetic Oil Service', text: 'Premium synthetic oil change, OEM filter replacement and a multi-point inspection.', duration: '45 to 60 mins', priceFrom: 129.99, badge: 'Popular', icon: 'oil' },
  { id: 's-filters', category: 'maintenance', name: 'Filter Replacement Package', text: 'Engine air filter and cabin microfilter with OEM parts to keep performance and air quality up.', duration: '30 mins', priceFrom: 89.99, icon: 'filter' },
  { id: 's-battery', category: 'maintenance', name: 'Battery Service & Coding', text: 'Battery health test, replacement if needed, and ECU registration and coding for modern vehicles.', duration: '45 mins', priceFrom: 249.99, icon: 'battery' },
  { id: 's-diag', category: 'diagnostics', name: 'Computer Diagnostic Scan', text: 'Full OBD and module scan with dealer-level tools, with a written report of every fault found.', duration: '60 mins', priceFrom: 120, badge: 'Popular', icon: 'scan' },
  { id: 's-electrical-diag', category: 'diagnostics', name: 'Electrical Fault Tracing', text: 'Wiring and module fault tracing for intermittent warnings and dead circuits.', duration: '1 to 3 hours', priceFrom: 180, icon: 'bolt' },
  { id: 's-tune', category: 'performance', name: 'ECU Performance Tune', text: 'Custom calibration with before and after logs, tested on the road.', duration: '3 to 4 hours', priceFrom: 899, icon: 'gauge' },
  { id: 's-exhaust', category: 'performance', name: 'Exhaust Upgrade Fitting', text: 'Supply and fit of cat-back and valved exhaust systems.', duration: '2 to 3 hours', priceFrom: 450, icon: 'wrench' },
  { id: 's-brakes', category: 'brakes', name: 'Brake Pad & Rotor Service', text: 'Pads, rotors, sensors and a brake fluid flush with OEM or performance parts.', duration: '2 hours', priceFrom: 420, badge: 'Popular', icon: 'brake' },
  { id: 's-alignment', category: 'brakes', name: 'Four-Wheel Alignment', text: 'Laser alignment to factory or performance specification.', duration: '60 mins', priceFrom: 149, icon: 'gauge' },
  { id: 's-ac', category: 'climate', name: 'AC Regas & Leak Test', text: 'Recover, vacuum and recharge with UV leak detection.', duration: '60 mins', priceFrom: 179, icon: 'snow' },
  { id: 's-coding', category: 'electrical', name: 'Module Coding & Retrofits', text: 'Coding for retrofitted options, lights and comfort features.', duration: '1 to 2 hours', priceFrom: 150, icon: 'bolt' },
];

export const MILESTONE_SERVICE = {
  /** Booking links use ?service=milestone; the booking page lists it as a selectable service. */
  id: 'milestone',
  name: 'Comprehensive Milestone Service (30k / 60k / 90k)',
  text: 'Complete manufacturer-recommended milestone service: all fluids (brake, coolant, transmission), spark plugs, filters, a comprehensive diagnostic and a road test.',
  duration: '3 to 5 hours',
  priceNote: 'Varies by model',
  includes: ['Fluid flush', 'Spark plugs', 'Full filters', 'Multi-point inspection'],
};

/** Everything the booking form offers: the catalogue plus the milestone service. */
export const BOOKABLE_SERVICES: Service[] = [
  ...SERVICES,
  {
    id: MILESTONE_SERVICE.id,
    category: 'maintenance',
    name: 'Milestone Service (30k / 60k / 90k)',
    text: 'Manufacturer-recommended milestone service with fluids, plugs, filters and a full inspection.',
    duration: MILESTONE_SERVICE.duration,
    priceFrom: 599,
    badge: 'Recommended',
    icon: 'wrench',
  },
];

export const SERVICE_FAQ = [
  { q: 'Do you use OEM parts?', a: 'Yes. We use Original Equipment Manufacturer (OEM) or OES parts for all services, so quality and compatibility match your vehicle. Performance parts are used only when you ask for them.' },
  { q: 'Will servicing my car here void my dealer warranty?', a: 'No. Canadian consumer law lets you service your vehicle at an independent shop. We follow the manufacturer schedule and record every service, so your warranty stays intact.' },
  { q: 'Do you offer loaner vehicles?', a: 'Loaner vehicles are available for longer repairs on request, subject to availability. Ask when you book.' },
];

// People ------------------------------------------------------------------------

export interface Technician {
  id: string;
  name: string;
  role: string;
  image: string;
  specialties: string[];
  makes: string[];
  languages: string[];
  years: number;
  rating: number;
  jobs: number;
  bio: string;
  certifications: string[];
}

export const TECHNICIANS: Technician[] = [
  { id: 't-1', name: 'Marcus Weber', role: 'Master Technician', image: 'tech-1', specialties: ['Engine', 'Diagnostics'], makes: ['Porsche', 'Audi'], languages: ['English', 'German'], years: 18, rating: 4.9, jobs: 2140, bio: 'Factory-trained on Porsche flat-six engines; leads our engine rebuild bay.', certifications: ['Porsche Certified Technician', 'ASE Master'] },
  { id: 't-2', name: 'Sarah Jenkins', role: 'Diagnostics Lead', image: 'tech-2', specialties: ['Diagnostics', 'Electrical'], makes: ['BMW', 'Mini'], languages: ['English', 'French'], years: 11, rating: 4.9, jobs: 1580, bio: 'Tracks down the electrical faults other shops give up on.', certifications: ['BMW Master Technician'] },
  { id: 't-3', name: 'David Chen', role: 'Performance Specialist', image: 'tech-3', specialties: ['Performance', 'Suspension'], makes: ['Mercedes-AMG', 'BMW M'], languages: ['English', 'Mandarin'], years: 9, rating: 4.8, jobs: 960, bio: 'Calibrations, exhausts and suspension set-ups for road and track.', certifications: ['AMG Performance Certified'] },
  { id: 't-4', name: 'Elena Rodriguez', role: 'EV and Hybrid Expert', image: 'tech-4', specialties: ['EV & Hybrid', 'Electrical'], makes: ['Volkswagen', 'Audi e-tron', 'Porsche Taycan'], languages: ['English', 'Spanish'], years: 7, rating: 4.9, jobs: 720, bio: 'High-voltage certified for battery, motor and charging repairs.', certifications: ['High Voltage Level 3'] },
  { id: 't-5', name: 'Klaus Mueller', role: 'Senior Technician', image: 'tech-5', specialties: ['Brakes', 'Maintenance'], makes: ['BMW', 'Porsche'], languages: ['English', 'German'], years: 14, rating: 4.8, jobs: 1890, bio: 'Brakes, servicing and pre-purchase inspections.', certifications: ['ASE Certified'] },
  { id: 't-6', name: 'Michael Chen', role: 'Senior Service Advisor', image: 'advisor-1', specialties: ['Customer Care'], makes: ['All makes'], languages: ['English', 'Cantonese'], years: 10, rating: 4.9, jobs: 3200, bio: 'Your point of contact from booking to pickup.', certifications: [] },
];

// Reviews -----------------------------------------------------------------------

export interface Review {
  id: string;
  author: string;
  avatar?: string;
  verified: 'Verified Repair' | 'Verified Purchase';
  car: string;
  serviceType: 'Maintenance & Oil Change' | 'Brake Service' | 'Engine Diagnostics' | 'Parts Purchase';
  rating: number;
  daysAgo: number;
  title: string;
  body: string;
  helpful: number;
  featured?: boolean;
  photos?: string[];
  response?: string;
}

export const REVIEW_SUMMARY = {
  average: 4.8,
  total: 1264,
  distribution: { 5: 1091, 4: 128, 3: 38, 2: 15, 1: 12 } as Record<1 | 2 | 3 | 4 | 5, number>,
  categories: [
    { label: 'Quality of Service', score: 4.9 },
    { label: 'Value for Money', score: 4.6 },
    { label: 'Customer Support', score: 4.8 },
  ],
};

export const REVIEWS: Review[] = [
  { id: 'r-1', author: 'Sarah Jenkins', verified: 'Verified Repair', car: '2022 Porsche 911 Carrera', serviceType: 'Brake Service', rating: 5, daysAgo: 2, featured: true, title: 'Exceptional service for my Porsche', body: 'I brought my 911 in for its annual maintenance and some minor brake work. The digital tracking system is a game-changer: I could see exactly what they were doing and approve work instantly. The technician even sent a video explaining the brake pad wear.', helpful: 24, response: 'Thank you for the wonderful review, Sarah. We are thrilled you enjoyed the digital tracking. The team is always happy to keep that 911 running perfectly. See you next time.' },
  { id: 'r-2', author: 'Marcus T.', verified: 'Verified Purchase', car: 'OEM BMW Parts', serviceType: 'Parts Purchase', rating: 4, daysAgo: 7, title: 'Fast shipping, exact fit', body: 'Ordered a new set of spark plugs and ignition coils for my M3. Parts arrived in 2 days and were genuine OEM as described. Four stars only because the packaging was slightly damaged, though the parts inside were fine.', helpful: 8 },
  { id: 'r-3', author: 'David R.', verified: 'Verified Repair', car: '2019 Audi Q7', serviceType: 'Engine Diagnostics', rating: 5, daysAgo: 14, title: 'Honest diagnostics saved me thousands', body: 'Another shop told me I needed a completely new transmission. These guys ran their diagnostics, found a faulty sensor, replaced it, and the car runs like new. Honesty and transparency are rare in this industry.', helpful: 42, photos: ['review-1', 'review-2'] },
  { id: 'r-4', author: 'Priya N.', verified: 'Verified Repair', car: '2021 BMW X5', serviceType: 'Maintenance & Oil Change', rating: 5, daysAgo: 21, title: 'Quick, clean and well explained', body: 'Oil service and inspection done in under an hour. The inspection report had photos of everything they checked.', helpful: 11 },
  { id: 'r-5', author: 'Tom B.', verified: 'Verified Repair', car: '2018 Mercedes C 63', serviceType: 'Brake Service', rating: 5, daysAgo: 30, title: 'Brakes feel brand new', body: 'Rotors and pads replaced with OEM parts. Approved the estimate from my phone and picked up the same afternoon.', helpful: 6 },
  { id: 'r-6', author: 'Lisa M.', verified: 'Verified Repair', car: '2020 Porsche Macan', serviceType: 'Engine Diagnostics', rating: 3, daysAgo: 45, title: 'Good work, took longer than quoted', body: 'The repair itself was good, but it took a day longer than the original estimate because a part was back-ordered. They kept me updated though.', helpful: 3, response: 'Thanks for the feedback, Lisa. We are sorry about the delay and have added a back-order check to our quoting so this does not happen again.' },
  { id: 'r-7', author: 'Ahmed K.', verified: 'Verified Purchase', car: 'Brembo Pads', serviceType: 'Parts Purchase', rating: 5, daysAgo: 60, title: 'Right part, first time', body: 'The vehicle selector made sure I got the right pads. Fitment was perfect.', helpful: 4 },
  { id: 'r-8', author: 'Grace L.', verified: 'Verified Repair', car: '2017 Volkswagen Golf R', serviceType: 'Maintenance & Oil Change', rating: 4, daysAgo: 75, title: 'Reliable and friendly', body: 'Third service here. Consistent, friendly and fairly priced.', helpful: 2 },
];

// Repair case -------------------------------------------------------------------

export type StepState = 'done' | 'current' | 'upcoming';

export interface RepairCase {
  trackingId: string;
  contact: string;
  workOrder: string;
  vehicle: string;
  plate: string;
  droppedOff: string;
  status: 'In Progress' | 'Ready for Pickup' | 'Awaiting Approval';
  progress: number;
  advisor: { name: string; role: string; image: string; phone: string };
  timeline: { title: string; time: string; note: string; state: StepState }[];
  notes: { author: string; role: string; time: string; text: string }[];
  lineItems: {
    id: string;
    title: string;
    text: string;
    price: number;
    parts?: number;
    labour?: string;
    state: 'completed' | 'in-progress' | 'needs-approval' | 'pending';
  }[];
  media: { image: string; label: string; video?: boolean }[];
  messages: { from: 'advisor' | 'customer'; text: string; time: string }[];
}

export const REPAIR_CASES: RepairCase[] = [
  {
    trackingId: 'EW-82734-615',
    contact: 'john.doe@example.com',
    workOrder: '438',
    vehicle: '2024 BMW M3 Competition',
    plate: 'XYZ 1234',
    droppedOff: 'Oct 18, 2026',
    status: 'In Progress',
    progress: 65,
    advisor: { name: 'Michael Chen', role: 'Senior Service Advisor', image: 'advisor-1', phone: '(555) 123-4567' },
    timeline: [
      { title: 'Vehicle Checked In', time: 'Oct 18, 8:30 AM', note: 'Vehicle received and initial walkaround completed by your service advisor.', state: 'done' },
      { title: 'Diagnostics Completed', time: 'Oct 18, 10:15 AM', note: 'Full system scan and mechanical inspection finished. Estimate sent.', state: 'done' },
      { title: 'Estimate Approved', time: 'Oct 18, 11:40 AM', note: 'You approved the repairs. Parts ordered and allocated.', state: 'done' },
      { title: 'Repair In Progress', time: 'Current status', note: 'Replacing front brake pads and rotors. Performing brake fluid flush.', state: 'current' },
      { title: 'Quality Assurance', time: 'Pending', note: 'Road test and final inspection.', state: 'upcoming' },
      { title: 'Ready for Pickup', time: 'Estimated Oct 18, 5:00 PM', note: 'We will text you when it is ready.', state: 'upcoming' },
    ],
    notes: [
      { author: 'Klaus M.', role: 'Master Tech', time: '2 hours ago', text: 'Front brake pads are at 2 mm (minimum safe is 3 mm). Rotors show significant grooving and need replacement. Rear brakes are fine (60% remaining). Proceeding with the approved front brake service.' },
      { author: 'Klaus M.', role: 'Master Tech', time: '1 hour ago', text: 'Noticed the rear tires are worn down to the wear bars (2/32"). Recommend replacing both rear tires before winter.' },
    ],
    lineItems: [
      { id: 'li-1', title: 'Comprehensive Diagnostic Scan', text: 'Full OBD-II system scan, battery test and visual multi-point inspection.', price: 120, state: 'completed' },
      { id: 'li-2', title: 'Front Brake Pad & Rotor Replacement', text: 'OEM pads, drilled rotors, wear sensors and a brake fluid flush.', price: 680, parts: 520, labour: '2.0 hrs', state: 'in-progress' },
      { id: 'li-3', title: 'Rear Tire Replacement', text: 'Rear tires are at 2/32". Recommend replacing with Michelin Pilot Sport 4S.', price: 540, parts: 480, labour: '0.5 hrs', state: 'needs-approval' },
    ],
    media: [
      { image: 'inspection-1', label: 'Inspection video', video: true },
      { image: 'inspection-2', label: 'Worn brake pad' },
      { image: 'inspection-3', label: 'Grooved rotor' },
      { image: 'inspection-4', label: 'Rear tire wear' },
    ],
    messages: [
      { from: 'advisor', text: 'Hi John, we have completed the initial inspection. The front brakes definitely need replacement as you suspected. I have sent over the work order for your approval.', time: '10:20 AM' },
      { from: 'customer', text: 'Thanks Michael, I just approved the brake service. How long will that take?', time: '10:45 AM' },
      { from: 'advisor', text: 'Great, thanks. The technician is starting on it now and it should take about 2 hours. Also, please check the new recommendation regarding your rear tires when you have a moment.', time: '10:52 AM' },
    ],
  },
];

export function findRepairCase(trackingId: string): RepairCase | undefined {
  const id = trackingId.trim().toUpperCase();
  return REPAIR_CASES.find((c) => c.trackingId === id);
}

// Garage --------------------------------------------------------------------------

export const GARAGE_VEHICLES = [
  { id: 'v-1', name: '2024 BMW M3 Competition', plate: 'XYZ 1234', vin: 'WBS43AY0XRFR12345', image: 'garage-car', mileage: '18,420 km', nextService: 'Oil service in 2,400 km', health: 'Repair in progress', activeCase: 'EW-82734-615' },
  { id: 'v-2', name: '2019 Porsche Macan S', plate: 'ABC 9876', vin: 'WP1AB2A57KLB34567', image: 'garage-car-2', mileage: '64,100 km', nextService: 'Brake fluid due Jan 2027', health: 'Healthy', activeCase: null },
];

export const GARAGE_HISTORY = [
  { date: 'Oct 18, 2026', vehicle: '2024 BMW M3 Competition', service: 'Front brakes, diagnostics', total: 800, invoice: 'INV-2026-0438', status: 'In progress' },
  { date: 'May 02, 2026', vehicle: '2024 BMW M3 Competition', service: 'Synthetic oil service', total: 129.99, invoice: 'INV-2026-0211', status: 'Paid' },
  { date: 'Mar 14, 2026', vehicle: '2019 Porsche Macan S', service: 'Milestone service 60k', total: 1240, invoice: 'INV-2026-0145', status: 'Paid' },
];
