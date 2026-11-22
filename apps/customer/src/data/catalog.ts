/**
 * Sample data for the parts of the customer site that are not connected yet,
 * one export per future database table or API resource: reviews and repair
 * cases (later phases replace these with calls in src/api/). Services, team
 * and parts come from src/api/catalogue; the garage from src/api/vehicles.
 * The vehicle lists and the service FAQ are fixed content.
 *
 * Image names refer to public/images/<name>.(png|jpg|webp); missing files
 * show a placeholder (see components/Photo).
 */

export const VEHICLE_YEARS = Array.from({ length: 15 }, (_, i) => String(2025 - i));
export const VEHICLE_MAKES: Record<string, string[]> = {
  Audi: ['A4', 'A6', 'Q5', 'Q7', 'RS6 Avant'],
  BMW: ['M3 Competition', 'M340i', 'X5', '530i'],
  'Mercedes-Benz': ['C 63 AMG', 'E 350', 'GLE 450'],
  Porsche: ['911 Carrera', 'Cayenne', 'Macan', 'Boxster'],
  Volkswagen: ['Golf R', 'Tiguan', 'Atlas'],
};

// Services ---------------------------------------------------------------------

export const SERVICE_FAQ = [
  { q: 'Do you use OEM parts?', a: 'Yes. We use Original Equipment Manufacturer (OEM) or OES parts for all services, so quality and compatibility match your vehicle. Performance parts are used only when you ask for them.' },
  { q: 'Will servicing my car here void my dealer warranty?', a: 'No. Canadian consumer law lets you service your vehicle at an independent shop. We follow the manufacturer schedule and record every service, so your warranty stays intact.' },
  { q: 'Do you offer loaner vehicles?', a: 'Loaner vehicles are available for longer repairs on request, subject to availability. Ask when you book.' },
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

