import { useMemo, useState } from 'react';
import FeatureSuite from './FeatureSuite.jsx';

const DEFAULT_PROFILE = { deviceSensitivity: 70, locationSensitivity: 60, timeSensitivity: 45, failedAttemptTolerance: 2 };
const DEFAULT_CONTEXT = { recognisedDevice: true, familiarLocation: true, unusualTime: false, failedAttempts: 0 };
const INITIAL_EVENTS = [
  { id: 1, name: 'Successful sign-in', context: 'Recognised device · Home', risk: 12, decision: 'Allowed' },
  { id: 2, name: 'Step-up verification', context: 'New browser · Home', risk: 38, decision: 'Step-up' },
  { id: 3, name: 'Successful sign-in', context: 'Recognised device · Home', risk: 9, decision: 'Allowed' },
  { id: 4, name: 'Failed password', context: 'Unknown device · New region', risk: 72, decision: 'Challenge' },
];

function loadProfile() {
  try {
    const value = localStorage.getItem('passguard-profile');
    return value ? { ...DEFAULT_PROFILE, ...JSON.parse(value) } : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}
const clamp = (n) => Math.max(0, Math.min(100, n));

function assessRisk(profile, context) {
  const factors = [
    {
      key: 'device', name: 'Device familiarity',
      description: context.recognisedDevice ? 'Recognised device reduces risk' : 'New device compared with profile',
      points: context.recognisedDevice ? -Math.round(7 * profile.deviceSensitivity / 100) : Math.round(8 + 28 * profile.deviceSensitivity / 100),
    },
    {
      key: 'location', name: 'Location deviation',
      description: context.familiarLocation ? 'Familiar sign-in region' : 'Unfamiliar sign-in region',
      points: context.familiarLocation ? -Math.round(4 * profile.locationSensitivity / 100) : Math.round(8 + 26 * profile.locationSensitivity / 100),
    },
    {
      key: 'time', name: 'Time anomaly',
      description: context.unusualTime ? 'Outside usual activity hours' : 'Within expected activity hours',
      points: context.unusualTime ? Math.round(4 + 18 * profile.timeSensitivity / 100) : 0,
    },
    {
      key: 'failures', name: 'Failed attempts',
      description: context.failedAttempts + ' recent failure(s) · tolerance ' + profile.failedAttemptTolerance,
      points: Math.max(0, context.failedAttempts - profile.failedAttemptTolerance) * 9,
    },
  ];
  return { score: clamp(18 + factors.reduce((sum, factor) => sum + factor.points, 0)), factors };
}

function classify(score) {
  if (score < 30) return { band: 'LOW RISK', title: 'Access allowed', message: 'This sign-in is consistent with the user profile. Continue with standard authentication.', action: 'Allowed', tone: 'safe' };
  if (score < 60) return { band: 'ELEVATED', title: 'Step-up verification', message: 'Some signals differ from the usual baseline. Request an additional verification step.', action: 'Step-up', tone: 'watch' };
  if (score < 80) return { band: 'HIGH RISK', title: 'Verify before access', message: 'Several signals are unusual. Require stronger verification and consider rate limiting.', action: 'Challenge', tone: 'danger' };
  return { band: 'CRITICAL', title: 'Temporarily restrict', message: 'The combined signals are highly unusual. Restrict this attempt and alert the user.', action: 'Restrict', tone: 'danger' };
}

function Metric({ label, value, suffix = '', note }) {
  return <article className="metric-card"><div className="metric-label">{label}</div><div className="metric-value">{value}<span className="metric-suffix">{suffix}</span></div><div className="metric-note">{note}</div></article>;
}

function Slider({ id, label, value, min = 0, max = 100, suffix = '%', onChange }) {
  return (
    <div className="control">
      <div className="control-heading"><label htmlFor={id}>{label}</label><output htmlFor={id}>{value}{suffix}</output></div>
      <input className="range-input" id={id} type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function Toggle({ title, hint, checked, onChange }) {
  return (
    <label className="toggle-row">
      <span><span className="toggle-title">{title}</span><span className="toggle-hint">{hint}</span></span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export default function App() {
  const [profile, setProfile] = useState(loadProfile);
  const [context, setContext] = useState(DEFAULT_CONTEXT);
  const [events, setEvents] = useState(INITIAL_EVENTS);
  const [eventCount, setEventCount] = useState(24);
  const [challengeCount, setChallengeCount] = useState(3);
  const [toast, setToast] = useState('');

  const { score, factors } = useMemo(() => assessRisk(profile, context), [profile, context]);
  const decision = classify(score);
  const strongest = [...factors].sort((a, b) => Math.abs(b.points) - Math.abs(a.points))[0];

  function notify(message) {
    setToast(message);
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => setToast(''), 2200);
  }
  function changeProfile(key, value) {
    setProfile((current) => ({ ...current, [key]: value }));
  }
  function changeContext(key, value) {
    setContext((current) => ({ ...current, [key]: value }));
  }
  function saveProfile() {
    try {
      localStorage.setItem('passguard-profile', JSON.stringify(profile));
      notify('Personal risk profile saved in this browser.');
    } catch {
      notify('Browser storage is unavailable.');
    }
  }
  function recordSignIn(name, nextContext = context, nextScore = score) {
    const result = classify(nextScore);
    const label = [
      nextContext.recognisedDevice ? 'Recognised device' : 'New device',
      nextContext.familiarLocation ? 'Familiar region' : 'New region',
    ].join(' · ');
    setEvents((current) => [{ id: Date.now(), name, context: label, risk: nextScore, decision: result.action }, ...current].slice(0, 8));
    setEventCount((n) => n + 1);
    if (nextScore >= 30) setChallengeCount((n) => n + 1);
    notify('Evaluation complete · ' + result.band);
  }
  function simulateSignIn() {
    const options = [
      { recognisedDevice: true, familiarLocation: true, unusualTime: false, failedAttempts: 0 },
      { recognisedDevice: false, familiarLocation: true, unusualTime: false, failedAttempts: 1 },
      { recognisedDevice: false, familiarLocation: false, unusualTime: true, failedAttempts: 3 },
      { recognisedDevice: true, familiarLocation: false, unusualTime: false, failedAttempts: 5 },
    ];
    const sample = options[Math.floor(Math.random() * options.length)];
    setContext(sample);
    recordSignIn('Synthetic sign-in', sample, assessRisk(profile, sample).score);
  }
  function resetDemo() {
    setProfile({ ...DEFAULT_PROFILE });
    setContext({ ...DEFAULT_CONTEXT });
    setEvents(INITIAL_EVENTS);
    setEventCount(24);
    setChallengeCount(3);
    localStorage.removeItem('passguard-profile');
    notify('Demo reset to its default profile.');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">P</span><span>PassGuard <span className="brand-muted">/ LAB</span></span></div>
        <div className="sidebar-group">
          <div className="sidebar-label">WORKSPACE</div>
          <a className="nav-link active" href="#overview"><span>▦</span> Overview</a>
          <a className="nav-link" href="#profile"><span>◎</span> Risk profile</a>
          <a className="nav-link" href="#activity"><span>⌁</span> Activity</a>
        </div>
        <div className="sidebar-footer">ADAPTIVE AUTHENTICATION<br /><span>React presentation prototype</span></div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="breadcrumbs">PassGuard <span>/</span> Overview</div>
          <div className="user-chip"><span className="avatar">D</span> Demo profile</div>
        </header>

        <section className="page-heading">
          <div><div className="eyebrow">SECURITY OVERVIEW</div><h1>Adaptive access, at a glance.</h1><p>Evaluate each sign-in against the user's normal behaviour.</p></div>
          <button className="button button-quiet" onClick={resetDemo}>Reset demo</button>
        </section>

        <section className="metrics-grid" aria-label="Security metrics">
          <Metric label="Current risk" value={score} suffix=" / 100" note={<><span className={'note-dot ' + decision.tone} />{decision.band.toLowerCase()}</>} />
          <Metric label="Baseline confidence" value="76" suffix="%" note="Illustrative demo profile" />
          <Metric label="Events evaluated" value={eventCount} note="Synthetic activity stream" />
          <Metric label="Step-up challenges" value={challengeCount} note="Risk-triggered responses" />
        </section>

        <div className="dashboard-grid">
          <div className="primary-column">
            <section className="panel">
              <div className="panel-heading"><h2>Live risk evaluation</h2><span className={'risk-badge ' + decision.tone}>{decision.band}</span></div>
              <div className="score-overview">
                <div className="risk-gauge" style={{ '--score': score + '%' }} role="img" aria-label={'Risk score ' + score + ' out of 100'}>
                  <div className="gauge-inner"><div className="gauge-number">{score}</div><div className="gauge-caption">RISK SCORE</div></div>
                </div>
                <div className="decision-summary">
                  <h3>{decision.title}</h3><p>{decision.message}</p>
                  <div className="score-track"><span style={{ width: score + '%' }} /></div>
                  <div className="score-scale"><span>0 · Trusted</span><span>100 · High risk</span></div>
                </div>
              </div>
              <div className="section-divider" />
              <div className="subheading"><h2>Score explanation</h2><span>PERSONALISED SIGNALS</span></div>
              <div className="factor-list">
                {factors.map((factor) => (
                  <div className="factor-row" key={factor.key}>
                    <div><div className="factor-name">{factor.name}</div><div className="factor-description">{factor.description}</div></div>
                    <div className={'factor-points ' + (factor.points < 0 ? 'negative' : '')}>{factor.points > 0 ? '+' : ''}{factor.points}</div>
                  </div>
                ))}
              </div>
              <div className="insight-box"><strong>Profile insight:</strong>{' '}
                {score < 30
                  ? 'Familiar context and the current personal tolerance keep this sign-in low risk.'
                  : strongest.name + ' is the strongest contributor (' + (strongest.points > 0 ? '+' : '') + strongest.points + ' points). Profile sensitivity changes its impact.'}
              </div>
            </section>

            <section className="panel" id="activity">
              <div className="panel-heading"><h2>Recent activity</h2><button className="button button-quiet" onClick={simulateSignIn}>＋ Simulate sign-in</button></div>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>EVENT</th><th>CONTEXT</th><th>RISK</th><th>DECISION</th></tr></thead>
                  <tbody>{events.slice(0, 5).map((event) => (
                    <tr key={event.id}>
                      <td><span className="event-name">{event.name}</span><span className="event-time">Demo event · just now</span></td>
                      <td>{event.context}</td>
                      <td><span className={'score-pill ' + (event.risk >= 60 ? 'high' : event.risk >= 30 ? 'medium' : '')}>{event.risk}</span></td>
                      <td>{event.decision}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
          </div>

          <div className="secondary-column">
            <section className="panel" id="profile">
              <div className="panel-heading"><h2>Personal risk profile</h2><span className="muted-label">ADJUST SENSITIVITY</span></div>
              <div className="control-stack">
                <Slider id="device-sensitivity" label="Device sensitivity" value={profile.deviceSensitivity} onChange={(v) => changeProfile('deviceSensitivity', v)} />
                <Slider id="location-sensitivity" label="Location sensitivity" value={profile.locationSensitivity} onChange={(v) => changeProfile('locationSensitivity', v)} />
                <Slider id="time-sensitivity" label="Time sensitivity" value={profile.timeSensitivity} onChange={(v) => changeProfile('timeSensitivity', v)} />
                <Slider id="failed-tolerance" label="Usual failed-attempt tolerance" value={profile.failedAttemptTolerance} min={0} max={6} suffix=" attempts" onChange={(v) => changeProfile('failedAttemptTolerance', v)} />
              </div>
              <div className="section-divider" />
              <div className="subheading"><h2>Sign-in context</h2><span>TEST INPUTS</span></div>
              <div className="toggle-stack">
                <Toggle title="Recognised device" hint="Seen in this profile before" checked={context.recognisedDevice} onChange={(v) => changeContext('recognisedDevice', v)} />
                <Toggle title="Familiar location" hint="Matches the usual region" checked={context.familiarLocation} onChange={(v) => changeContext('familiarLocation', v)} />
                <Toggle title="Unusual sign-in time" hint="Outside normal activity hours" checked={context.unusualTime} onChange={(v) => changeContext('unusualTime', v)} />
              </div>
              <Slider id="failed-attempts" label="Recent failed attempts" value={context.failedAttempts} min={0} max={10} suffix=" attempts" onChange={(v) => changeContext('failedAttempts', v)} />
              <div className="button-row">
                <button className="button button-quiet" onClick={saveProfile}>Save profile</button>
                <button className="button button-primary" onClick={() => recordSignIn('Sign-in evaluated')}>Evaluate</button>
              </div>
              <p className="helper-copy">Profile settings are saved in this browser for the demo. Risk scoring currently runs in the frontend only.</p>
            </section>

            <section className="panel">
              <div className="panel-heading"><h2>Risk trend</h2><span className="muted-label">RECENT DEMO EVENTS</span></div>
              <div className="chart" aria-label="Recent risk scores">
                {events.slice(0, 8).slice().reverse().map((event) => (
                  <div className="chart-column" key={event.id} title={'Risk ' + event.risk}><span style={{ height: Math.max(5, event.risk) + '%' }} /></div>
                ))}
              </div>
              <div className="chart-labels"><span>Earlier</span><span>Latest</span></div>
            </section>
          </div>
        </div>
        <FeatureSuite
          profile={profile}
          context={context}
          score={score}
          decision={decision}
          factors={factors}
          scoreForContext={(nextContext, nextProfile = profile) => assessRisk(nextProfile, nextContext).score}
          onConfirmContext={(nextContext) => setContext(nextContext)}
          onImportProfile={(nextProfile) => {
            setProfile(nextProfile);
            localStorage.setItem('passguard-profile', JSON.stringify(nextProfile));
          }}
          onClearProfile={() => {
            setProfile({ ...DEFAULT_PROFILE });
            localStorage.removeItem('passguard-profile');
          }}
        />
        <footer className="page-footnote">Educational prototype · Transparent illustrative scoring · Synthetic events only</footer>
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
