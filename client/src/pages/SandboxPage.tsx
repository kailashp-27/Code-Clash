import { Sandbox } from '../components/Sandbox';

/** The standalone IDE / Sandbox — mapped to /ide */
const SandboxPage = () => (
  <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <Sandbox />
  </div>
);

export default SandboxPage;
