import { PropsWithChildren } from 'react';
import { NavLink } from 'react-router-dom';

const RootLayout = ({ children }: PropsWithChildren) => {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>FinToolkit</h1>
          <p className="app-subtitle">Explore opportunities across data providers</p>
        </div>
        <nav>
          <NavLink to="/wizard" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Wizard
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Settings
          </NavLink>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
};

export default RootLayout;
