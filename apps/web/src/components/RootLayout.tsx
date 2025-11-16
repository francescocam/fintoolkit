import { PropsWithChildren } from 'react';
import { Link, NavLink } from 'react-router-dom';

const RootLayout = ({ children }: PropsWithChildren) => {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>
            <Link to="/" className="logo-link">
              FinToolkit
            </Link>
          </h1>
          <p className="app-subtitle">Explore investment opportunities</p>
        </div>
        <div className="app-header-actions">
          <NavLink to="/settings" className={({ isActive }) => (isActive ? 'settings-link active' : 'settings-link')}>
            Settings
          </NavLink>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
};

export default RootLayout;
