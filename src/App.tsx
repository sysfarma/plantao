/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FirebaseProvider } from './components/FirebaseProvider';
import PublicLayout from './layouts/PublicLayout';
import AdminLayout from './layouts/AdminLayout';
import PharmacyLayout from './layouts/PharmacyLayout';

import Home from './pages/Home';
import OnCall from './pages/OnCall';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Profile from './pages/Profile';

import AdminDashboard from './pages/admin/Dashboard';
import PharmacyDashboard from './pages/pharmacy/Dashboard';
import Pricing from './pages/pharmacy/Pricing';
import FutureShifts from './pages/FutureShifts';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import Contact from './pages/Contact';

export default function App() {
  return (
    <ErrorBoundary>
      <FirebaseProvider>
        <Router>
          <Routes>
            {/* Public Routes */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/plantao" element={<OnCall />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/perfil" element={<Profile />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/proximos-plantoes" element={<FutureShifts />} />
          <Route path="/termos" element={<Terms />} />
          <Route path="/privacidade" element={<Privacy />} />
          <Route path="/contato" element={<Contact />} />
        </Route>

        {/* Admin Routes */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
        </Route>

        {/* Pharmacy Routes */}
        <Route path="/pharmacy" element={<PharmacyLayout />}>
          <Route index element={<PharmacyDashboard />} />
          <Route path="pricing" element={<Pricing />} />
        </Route>
      </Routes>
    </Router>
      </FirebaseProvider>
    </ErrorBoundary>
  );
}
