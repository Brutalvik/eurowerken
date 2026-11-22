import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { PRIVACY, TERMS } from '@eurowerken/shared';
import { RequireCustomer } from '@/auth/RequireCustomer';
import { SiteLayout } from '@/components/layout/SiteLayout';
import { AccountPage } from '@/pages/account/AccountPage';
import { LoginPage } from '@/pages/account/LoginPage';
import { RegisterPage } from '@/pages/account/RegisterPage';
import { ResetPasswordPage } from '@/pages/account/ResetPasswordPage';
const BookPage = lazy(() => import('@/pages/BookPage').then((m) => ({ default: m.BookPage })));
const CartPage = lazy(() => import('@/pages/CartPage').then((m) => ({ default: m.CartPage })));
import { ComingSoonPage } from '@/pages/ComingSoonPage';
const ExpertsPage = lazy(() => import('@/pages/ExpertsPage').then((m) => ({ default: m.ExpertsPage })));
const GaragePage = lazy(() => import('@/pages/GaragePage').then((m) => ({ default: m.GaragePage })));
import { HomePage } from '@/pages/HomePage';
import { LegalPage } from '@/pages/LegalPage';
const PartDetailsPage = lazy(() => import('@/pages/parts/PartDetailsPage').then((m) => ({ default: m.PartDetailsPage })));
const PartsShopPage = lazy(() => import('@/pages/parts/PartsShopPage').then((m) => ({ default: m.PartsShopPage })));
const ReviewsPage = lazy(() => import('@/pages/ReviewsPage').then((m) => ({ default: m.ReviewsPage })));
import { RootPage } from '@/pages/RootPage';
const ServicesPage = lazy(() => import('@/pages/ServicesPage').then((m) => ({ default: m.ServicesPage })));
import { SiteNotFound } from '@/pages/SiteNotFound';
const CaseDetailsPage = lazy(() => import('@/pages/track/CaseDetailsPage').then((m) => ({ default: m.CaseDetailsPage })));
const TrackPage = lazy(() => import('@/pages/track/TrackPage').then((m) => ({ default: m.TrackPage })));

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
