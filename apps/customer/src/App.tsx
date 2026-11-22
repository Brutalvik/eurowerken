import { Route, Routes } from 'react-router-dom';
import { PRIVACY, TERMS } from '@eurowerken/shared';
import { SiteLayout } from '@/components/layout/SiteLayout';
import { ComingSoonPage } from '@/pages/ComingSoonPage';
import { HomePage } from '@/pages/HomePage';
import { LegalPage } from '@/pages/LegalPage';
import { RootPage } from '@/pages/RootPage';
import { SiteNotFound } from '@/pages/SiteNotFound';

/** Sections still to build; each gets its own page in a later round. */
const COMING = [
  ['services', 'Services'],
  ['experts', 'Our Experts'],
  ['parts', 'Parts Shop'],
  ['parts/:partId', 'Part Details'],
  ['cart', 'Cart & Checkout'],
  ['book', 'Book Appointment'],
  ['track', 'Repair Tracking'],
  ['track/:caseId', 'Repair Case Details'],
  ['reviews', 'Reviews'],
  ['garage', 'Customer Garage'],
] as const;

export default function App() {
  return (
    <Routes>
      <Route index element={<RootPage />} />
      <Route path="terms" element={<LegalPage doc={TERMS} standalone />} />
      <Route path="privacy" element={<LegalPage doc={PRIVACY} standalone />} />

      {/* Each workshop's public site: /<slug>/... */}
      <Route path=":slug" element={<SiteLayout />}>
        <Route index element={<HomePage />} />
        {COMING.map(([path, title]) => (
          <Route key={path} path={path} element={<ComingSoonPage title={title} />} />
        ))}
        <Route path="terms" element={<LegalPage doc={TERMS} />} />
        <Route path="privacy" element={<LegalPage doc={PRIVACY} />} />
        <Route path="*" element={<ComingSoonPage title="Page not found" />} />
      </Route>

      <Route path="*" element={<SiteNotFound />} />
    </Routes>
  );
}
