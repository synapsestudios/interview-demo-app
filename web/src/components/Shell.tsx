import { NavLink } from 'react-router-dom';
import { Agency } from '../api';

export type Mode = 'admin' | 'agency';

export function Shell({
  mode,
  onModeChange,
  agencies,
  agencyId,
  onAgencyChange,
  children,
}: {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  agencies: Agency[];
  agencyId: string;
  onAgencyChange: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="shell">
      <header className="masthead">
        <div className="masthead-brand">
          <span className="wordmark">Arbiter</span>
          <span className="tagline">Screening &amp; Assessment System</span>
          <span className="volume">Vol. III · № 04</span>
        </div>
        <div className="masthead-meta">
          <div className="mode-toggle" role="tablist" aria-label="View mode">
            <button
              role="tab"
              aria-selected={mode === 'admin'}
              className={mode === 'admin' ? 'active' : ''}
              onClick={() => onModeChange('admin')}
            >
              Editorial
            </button>
            <button
              role="tab"
              aria-selected={mode === 'agency'}
              className={mode === 'agency' ? 'active' : ''}
              onClick={() => onModeChange('agency')}
            >
              Field
            </button>
          </div>
          {mode === 'admin' ? (
            <nav className="nav-links">
              <NavLink to="/admin/templates" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                Instruments
              </NavLink>
            </nav>
          ) : (
            <nav className="nav-links">
              <NavLink to="/agency/screenings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                Casefiles
              </NavLink>
              <NavLink to="/agency/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                Compendium
              </NavLink>
            </nav>
          )}
          {mode === 'agency' && (
            <>
              <span className="agency-label">Agency</span>
              <select
                className="agency-select"
                value={agencyId}
                onChange={(e) => onAgencyChange(e.target.value)}
                aria-label="Select agency"
              >
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </header>
      <div className="main">{children}</div>
      <footer className="colophon">
        <span>ARBITER/screening — prototype build · composed in Fraunces &amp; IBM Plex</span>
        <span>API · :3001</span>
      </footer>
    </div>
  );
}
