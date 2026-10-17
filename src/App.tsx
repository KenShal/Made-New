import { lazy, Suspense } from 'react';
import { BrowserRouter, HashRouter, MemoryRouter, Route, Routes, useLocation, Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { CartDrawer } from '@/components/CartDrawer';
import { DemoBanner } from '@/components/DemoBanner';
import { RouteFocus } from '@/components/RouteFocus';
import { RequireRole } from '@/components/RequireRole';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Container } from '@/components/ui';
import { AuthProvider } from '@/state/auth';
import { CartProvider } from '@/state/cart';
import { ToastProvider } from '@/state/toast';
import { MotionPreferenceProvider } from '@/state/motion';
import Home from '@/pages/Home';
import Shop from '@/pages/Shop';
import ProductPage from '@/pages/Product';
import CartPage from '@/pages/Cart';
import { CampaignPage, CampaignsPage, DiscoverPage } from '@/pages/Campaigns';
import HowItWorksPage from '@/pages/HowItWorks';
import { LoginPage, RegisterPage } from '@/pages/Auth';
import { CheckoutDemo, CheckoutReturn } from '@/pages/Checkout';
import Legal from '@/pages/Legal';

// Creator and admin areas are code-split so shoppers never download charts or admin code.
const CreatorArea = lazy(() => import('@/creator/CreatorArea'));
const AdminArea = lazy(() => import('@/admin/AdminArea'));

function NotFound() {
  return (
    <Container className="py-32">
      <p className="font-display text-[0.7rem] font-bold uppercase tracking-editorial text-crimson">404</p>
      <h1 className="mt-3 font-display text-5xl font-extrabold tracking-tight">This page has been made new. Or it never existed.</h1>
      <Link to="/" className="mt-8 inline-block underline underline-offset-4">Back to home</Link>
    </Container>
  );
}

function Shell() {
  const location = useLocation();
  // Transition between top-level sections only; nested workspace navigation stays instant.
  const key = location.pathname.split('/').slice(0, location.pathname.startsWith('/shop/') ? 3 : 2).join('/');
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:bg-ink focus:px-4 focus:py-2 focus:text-white">Skip to content</a>
      <DemoBanner />
      <Header />
      <RouteFocus />
      <main id="main" tabIndex={-1} className="flex-1">
        <ErrorBoundary>
          <Suspense fallback={<div className="min-h-[60vh]" aria-busy="true" />}>
            <AnimatePresence mode="wait" initial={false}>
              <Routes location={location} key={key}>
                <Route path="/" element={<Home />} />
                <Route path="/shop" element={<Shop />} />
                <Route path="/shop/:productSlug" element={<ProductPage />} />
                <Route path="/collections/:collectionSlug" element={<Shop />} />
                <Route path="/discover" element={<DiscoverPage />} />
                <Route path="/campaigns" element={<CampaignsPage />} />
                <Route path="/campaigns/:campaignSlug" element={<CampaignPage />} />
                <Route path="/how-it-works" element={<HowItWorksPage />} />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/checkout/demo" element={<CheckoutDemo />} />
                <Route path="/checkout/return" element={<CheckoutReturn />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/legal/:doc" element={<Legal />} />
                <Route path="/creator/*" element={<RequireRole roles={['shopper', 'creator']}><CreatorArea /></RequireRole>} />
                <Route path="/admin/*" element={<RequireRole roles={['admin', 'reviewer', 'finance']}><AdminArea /></RequireRole>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AnimatePresence>
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
      <CartDrawer />
    </div>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionPreferenceProvider>
      <ToastProvider>
        <AuthProvider>
          <CartProvider>{children}</CartProvider>
        </AuthProvider>
      </ToastProvider>
    </MotionPreferenceProvider>
  );
}

// Embedded previews (e.g. a hosted demo frame) can't rely on the page URL, so they route in memory.
// Static hosts without a fallback to index.html (GitHub Pages) use hash URLs; embedded demos use memory.
const ROUTERS = { memory: MemoryRouter, hash: HashRouter } as const;
const Router = ROUTERS[import.meta.env.VITE_PUBLIC_ROUTER as keyof typeof ROUTERS] ?? BrowserRouter;

export default function App() {
  return (
    <Router>
      <Providers>
        <Shell />
      </Providers>
    </Router>
  );
}

