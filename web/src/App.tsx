import type { ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { useAuth } from './auth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Patients from './pages/Patients';
import PatientDetail from './pages/PatientDetail';
import Reception from './pages/Reception';
import Nursing from './pages/Nursing';
import DoctorQueue from './pages/DoctorQueue';
import VisitDetail from './pages/VisitDetail';
import Consultation from './pages/Consultation';
import Laboratory from './pages/Laboratory';
import Pharmacy from './pages/Pharmacy';
import Billing from './pages/Billing';
import InvoiceDetail from './pages/InvoiceDetail';
import Payments from './pages/Payments';
import Finance from './pages/Finance';
import Services from './pages/Services';
import Staff from './pages/Staff';
import Medications from './pages/Medications';
import Settings from './pages/Settings';
import Audit from './pages/Audit';
import Account from './pages/Account';
import PrintPage from './pages/PrintPage';

function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="loading" style={{ minHeight: '60vh' }}>
        Loading your workspace…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function Guard({ perm, children }: { perm: string; children: ReactNode }) {
  const { has } = useAuth();
  if (!has(perm)) {
    return (
      <div className="card">
        <div className="empty">
          <h3>Access restricted</h3>
          <p>Your role does not include permission for this section. Ask an administrator if you need access.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={!loading && user ? <Navigate to="/" replace /> : <Login />}
      />
      <Route element={<RequireAuth />}>
        <Route path="/print/invoice/:invoiceId" element={<PrintPage />} />
        <Route path="/print/receipt/:invoiceId/:paymentId" element={<PrintPage />} />
        <Route path="/print/consultation/:visitId" element={<PrintPage />} />
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="reception" element={<Guard perm="visits.manage"><Reception /></Guard>} />
          <Route path="patients" element={<Guard perm="patients.view"><Patients /></Guard>} />
          <Route path="patients/:id" element={<Guard perm="patients.view"><PatientDetail /></Guard>} />
          <Route path="nursing" element={<Guard perm="vitals.manage"><Nursing /></Guard>} />
          <Route path="doctor" element={<Guard perm="consultation.manage"><DoctorQueue /></Guard>} />
          <Route path="visits/:id" element={<VisitDetail />} />
          <Route
            path="consultation/:id"
            element={<Guard perm="consultation.manage"><Consultation /></Guard>}
          />
          <Route path="laboratory" element={<Guard perm="labs.manage"><Laboratory /></Guard>} />
          <Route path="pharmacy" element={<Guard perm="prescriptions.dispense"><Pharmacy /></Guard>} />
          <Route path="billing" element={<Guard perm="billing.view"><Billing /></Guard>} />
          <Route path="billing/:id" element={<Guard perm="billing.view"><InvoiceDetail /></Guard>} />
          <Route path="payments" element={<Guard perm="finance.view"><Payments /></Guard>} />
          <Route path="finance" element={<Guard perm="finance.view"><Finance /></Guard>} />
          <Route path="services" element={<Guard perm="admin.manage"><Services /></Guard>} />
          <Route path="staff" element={<Guard perm="admin.manage"><Staff /></Guard>} />
          <Route path="medications" element={<Guard perm="medications.manage"><Medications /></Guard>} />
          <Route path="settings" element={<Guard perm="admin.manage"><Settings /></Guard>} />
          <Route path="audit" element={<Guard perm="admin.manage"><Audit /></Guard>} />
          <Route path="account" element={<Account />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
