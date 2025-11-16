interface DataromaScreenerStep {
  key: string;
  label: string;
  status: 'complete' | 'running' | 'pending';
}

const statusClass = (status: DataromaScreenerStep['status']) => {
  switch (status) {
    case 'complete':
      return 'step-pill complete';
    case 'running':
      return 'step-pill running';
    default:
      return 'step-pill';
  }
};

interface DataromaScreenerStepperProps {
  steps: DataromaScreenerStep[];
}

const DataromaScreenerStepper = ({ steps }: DataromaScreenerStepperProps) => {
  return (
    <ol className="dataroma-screener-stepper">
      {steps.map((step, index) => (
        <li key={step.key}>
          <div className={statusClass(step.status)}>
            <span className="step-index">{index + 1}</span>
            <span>{step.label}</span>
          </div>
        </li>
      ))}
    </ol>
  );
};

export default DataromaScreenerStepper;
