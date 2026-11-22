/**
 * Sample content for the home page until these come from the database
 * (services catalogue, technicians, reviews are later ERP-managed tables).
 */
export const HERO_STATS = [
  { value: '4.9', label: 'Average rating' },
  { value: '12k+', label: 'Repairs completed' },
  { value: '3 yr', label: 'Parts warranty' },
];

export const SERVICES = [
  {
    image: 'service-diagnostics',
    title: 'Advanced Diagnostics',
    text: 'Dealer-level scan tools read every module, so we find the real fault before replacing anything.',
  },
  {
    image: 'service-tuning',
    title: 'Performance Tuning',
    text: 'ECU calibration, intake and exhaust upgrades, tested on the road and documented for you.',
  },
  {
    image: 'service-maintenance',
    title: 'Scheduled Maintenance',
    text: 'Factory-schedule servicing with OEM fluids and filters that keeps your warranty intact.',
  },
  {
    image: 'service-repairs',
    title: 'Major Repairs',
    text: 'Engine, transmission and suspension work by technicians who specialise in your make.',
  },
];

export const GARAGE_FEATURES = [
  { title: 'Vehicle Management', text: 'Every car you own, with its service history, reminders and documents in one place.' },
  { title: 'Transparent Tracking', text: 'Follow each repair live, with technician notes, photos and video from the bay.' },
  { title: 'Digital Invoicing', text: 'Approve estimates line by line and pay invoices online when the work is done.' },
];

export const TECHNICIANS = [
  { image: 'tech-1', name: 'Marcus Weber', role: 'Master Technician', tags: ['Porsche', 'Audi'] },
  { image: 'tech-2', name: 'Sarah Jenkins', role: 'Diagnostics Lead', tags: ['BMW', 'Mini'] },
  { image: 'tech-3', name: 'David Chen', role: 'Performance Specialist', tags: ['Mercedes-AMG'] },
  { image: 'tech-4', name: 'Elena Rodriguez', role: 'EV and Hybrid Expert', tags: ['VW', 'Audi e-tron'] },
];

export const TESTIMONIALS = [
  {
    quote: 'I could watch the repair in real time and approve the extra work from my phone. No surprises on the invoice.',
    name: 'James P.',
    car: '2021 BMW M340i',
  },
  {
    quote: 'They found an electrical fault two other shops missed. Clear explanation, fair price, car back the same day.',
    name: 'Priya N.',
    car: '2019 Audi Q7',
  },
  {
    quote: 'Genuine parts, a proper warranty and a team that actually knows Porsches. Booking took two minutes.',
    name: 'Daniel K.',
    car: '2018 Porsche 911 Carrera',
  },
];
