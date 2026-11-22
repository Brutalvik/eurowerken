import { Route, Routes } from 'react-router-dom';
import { PRIVACY, TERMS } from '@eurowerken/shared';
import { RequireCustomer } from '@/auth/RequireCustomer';
import { SiteLayout } from '@/components/layout/SiteLayout';
import { AccountPage } from '@/pages/account/AccountPage';
import { LoginPage } from '@/pages/account/LoginPage';
import { RegisterPage } from '@/pages/account/RegisterPage';
import { ResetPasswordPage } from '@/pages/account/ResetPasswordPage';
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
        <Route
          path="garage"
          element={
            <RequireCustomer>
              <GaragePage />
            </RequireCustomer>
          }
        />
        <Route
          path="account"
          element={
            <RequireCustomer>
              <AccountPage />
            </RequireCustomer>
          }
        />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="terms" element={<LegalPage doc={TERMS} />} />
        <Route path="privacy" element={<LegalPage doc={PRIVACY} />} />
        <Route path="*" element={<ComingSoonPage title="Page not found" />} />
      </Route>

      <Route path="*" element={<SiteNotFound />} />
    </Routes>
  );
}
