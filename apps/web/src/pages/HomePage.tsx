import { useNavigate } from 'react-router-dom';

const HomePage = () => {
  const navigate = useNavigate();

  const featureChips: Array<{ label: string; onClick?: () => void }> = [
    { label: 'Dataroma screener', onClick: () => navigate('/dataroma-screener') },
    { label: 'app feature 2' },
    { label: 'app feature 3' },
    { label: 'app feature ...' },
  ];

  return (
    <section className="home-page">
      <header className="home-hero">
        <h2>Dashboard</h2>
        <p>Jump back into a flow or explore what's coming next.</p>
      </header>
      <div className="feature-chip-grid">
        {featureChips.map((feature) => (
          <button
            key={feature.label}
            type="button"
            className="feature-chip"
            onClick={feature.onClick}
            disabled={!feature.onClick}
          >
            {feature.label}
          </button>
        ))}
      </div>
    </section>
  );
};

export default HomePage;
