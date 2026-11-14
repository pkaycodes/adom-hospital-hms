import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Boxes,
  ClipboardList,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  Pill,
  ReceiptText,
  ScrollText,
  Settings as SettingsIcon,
  Stethoscope,
  Tags,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { initials } from '../format';

type NavItem = {
  to: string;
  label: string;
  icon: typeof Activity;
  perm?: string;
  adminOnly?: boolean;
  badge?: 'nursing' | 'doctor' | 'labs' | 'rx' | 'payment';
};

const SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard.view' }],
  },
  {
    label: 'Front desk',
    items: [
      { to: '/reception', label: 'Reception', icon: ClipboardList, perm: 'visits.manage' },
      { to: '/patients', label: 'Patients', icon: Users, perm: 'patients.view' },
    ],
  },
  {
    label: 'Clinical',
    items: [
      { to: '/nursing', label: 'Nursing queue', icon: Activity, perm: 'vitals.manage', badge: 'nursing' },
      {
        to: '/doctor',
        label: 'Doctor queue',
        icon: Stethoscope,
        perm: 'consultation.manage',
        badge: 'doctor',
      },
      { to: '/laboratory', label: 'Laboratory', icon: FlaskConical, perm: 'labs.manage', badge: 'labs' },
      {
        to: '/pharmacy',
        label: 'Pharmacy',
        icon: Pill,
        perm: 'prescriptions.dispense',
        badge: 'rx',
      },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/billing', label: 'Billing', icon: ReceiptText, perm: 'billing.view', badge: 'payment' },
      { to: '/payments', label: 'Transactions', icon: Wallet, perm: 'finance.view' },
      { to: '/finance', label: 'Finance reports', icon: TrendingUp, perm: 'finance.view' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/services', label: 'Services & prices', icon: Tags, adminOnly: true },
      { to: '/medications', label: 'Medicine inventory', icon: Boxes, perm: 'medications.manage' },
      { to: '/staff', label: 'Staff accounts', icon: UserCog, adminOnly: true },
      { to: '/audit', label: 'Audit log', icon: ScrollText, adminOnly: true },
      { to: '/settings', label: 'Hospital settings', icon: SettingsIcon, adminOnly: true },
    ],
  },
];

export default function Layout() {
  const { user, logout, has } = useAuth();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [hospital, setHospital] = useState<string>('Hospital Management');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setOpen(false);
    let alive = true;
    api<{ settings: { name: string; logo_url?: string | null } }>('/settings')
      .then((d) => {
        if (alive) {
          setHospital(d.settings.name);
          setLogoUrl(d.settings.logo_url || null);
        }
      })
      .catch(() => {});
    api<any>('/dashboard')
      .then((d) => {
        if (alive) setCounts(d.stats);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [location.pathname]);

  const badgeValue = (key?: NavItem['badge']) => {
    if (!key) return undefined;
    if (key === 'nursing') return counts.awaiting_nursing;
    if (key === 'doctor') return (counts.awaiting_doctor || 0) + (counts.consulting || 0);
    if (key === 'labs') return counts.pending_labs;
    if (key === 'rx') return counts.pending_rx;
    if (key === 'payment') return counts.awaiting_payment;
    return undefined;
  };

  const visible = (item: NavItem) => {
    if (item.adminOnly) return user?.role === 'admin';
    return !item.perm || has(item.perm);
  };

  const today = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Accra',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date());

  return (
    <div className="app-shell">
      {open && <div className="sidebar-scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-logo">
            {logoUrl ? <img src={logoUrl} alt="" /> : 'AM'}
          </div>
          <div className="brand-text">
            <div className="brand-name">{hospital}</div>
            <div className="brand-sub">Hospital Management</div>
          </div>
        </div>
        <nav className="nav">
          {SECTIONS.map((section) => {
            const items = section.items.filter(visible);
            if (!items.length) return null;
            return (
              <div key={section.label}>
                <div className="nav-section">{section.label}</div>
                {items.map((item) => {
                  const Icon = item.icon;
                  const badge = badgeValue(item.badge);
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                    >
                      <Icon size={16} />
                      {item.label}
                      {!!badge && <span className="nav-badge">{badge}</span>}
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <span>GHS · Africa/Accra</span>
          <span>v1.0</span>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn menu-btn"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={19} />
          </button>
          <div className="topbar-title">
            <strong>{hospital}</strong> · Health records
          </div>
          <div className="topbar-spacer" />
          <div className="topbar-date">{today}</div>
          <NavLink to="/account" className="user-chip" title="My account">
            <span className="avatar">{initials(user?.full_name)}</span>
            <span className="user-meta">
              <div className="user-name">{user?.full_name}</div>
              <div className="user-role">{user?.role_label}</div>
            </span>
          </NavLink>
          <button
            type="button"
            className="icon-btn"
            title="Sign out"
            aria-label="Sign out"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            <LogOut size={17} />
          </button>
          {open && (
            <button
              type="button"
              className="icon-btn menu-btn"
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          )}
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
