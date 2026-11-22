import { Route, Routes } from 'react-router-dom';
import { PRIVACY, TERMS } from '@eurowerken/shared';
import { SiteLayout } from '@/components/layout/SiteLayout';
import { BookPage } from '@/pages/BookPage';
import { CartPage } from '@/pages/CartPage';
import { ComingSoonPage } from '@/pages/ComingSoonPage';
import { ExpertsPage } from '@/pages/ExpertsPage';
import { GaragePage } from '@/pages/GaragePage';
import { HomePage } from '@/pages/HomePage';
import { LegalPage } from '@/pages/LegalPage';
import { PartDetailsPage } from '@/pages/parts/PartDetailsPage';
import { PartsShopPage } from '@/pages/parts/PartsShopPage';
import { ReviewsPage } from '@/pages/ReviewsPage';
import { RootPage } from '@/pages/RootPage';
import { ServicesPage } from '@/pages/ServicesPage';
import { SiteNotFound } from '@/pages/SiteNotFound';
import { CaseDetailsPage } from '@/pages/track/CaseDetailsPage';
import { TrackPage } from '@/pages/track/TrackPage';

export default function App() {
  return (
    <Routes>
      <Route index element={<RootPage />} />
      <Route path="terms" element={<LegalPage doc={TERMS} standalone />} />
      <Route path="privacy" element={<LegalPage doc={PRIVACY} standalone />} />

      {/* Each workshop's public site: /<slug>/... */}
      <Route path=":slug" element={<SiteLayout />}>
        <Route index element={<HomePage />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="experts" element={<ExpertsPage />} />
        <Route path="parts" element={<PartsShopPage />} />
        <Route path="parts/:partSlug" element={<PartDetailsPage />} />
        <Route path="cart" element={<CartPage />} />
        <Route path="book" element={<BookPage />} />
        <Route path="track" element={<TrackPage />} />
        <Route path="track/:caseId" element={<CaseDetailsPage />} />
        <Route path="reviews" element={<ReviewsPage />} />
        <Route path="garage" element={<GaragePage />} />
        <Route path="terms" element={<LegalPage doc={TERMS} />} />
        <Route path="privacy" element={<LegalPage doc={PRIVACY} />} />
        <Route path="*" element={<ComingSoonPage title="Page not found" />} />
      </Route>

      <Route path="*" element={<SiteNotFound />} />
    </Routes>
  );
}
