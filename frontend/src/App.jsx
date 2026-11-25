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
      key: 'device', name: 'Device familiarity', shortName: 'Device signal',
      description: context.recognisedDevice ? 'Recognised device reduces risk' : 'New device compared with profile',
      points: context.recognisedDevice ? -Math.round(7 * profile.deviceSensitivity / 100) : Math.round(8 + 28 * profile.deviceSensitivity / 100),
    },
    {
      key: 'location', name: 'Location deviation', shortName: 'Location signal',
      description: context.familiarLocation ? 'Familiar sign-in region' : 'Unfamiliar sign-in region',
      points: context.familiarLocation ? -Math.round(4 * profile.locationSensitivity / 100) : Math.round(8 + 26 * profile.locationSensitivity / 100),
    },
    {
      key: 'time', name: 'Time anomaly', shortName: 'Time signal',
      description: context.unusualTime ? 'Outside usual activity hours' : 'Within expected activity hours',
      points: context.unusualTime ? Math.round(4 + 18 * profile.timeSensitivity / 100) : 0,
    },
    {
      key: 'failures', name: 'Failed attempts', shortName: 'Attempt signal',
      description: context.failedAttempts + ' recent failure(s) · tolerance ' + profile.failedAttemptTolerance,
      points: Math.max(0, context.failedAttempts - profile.failedAttemptTolerance) * 9,
    },
  ];
  return { score: clamp(18 + factors.reduce((sum, factor) => sum + factor.points, 0)), factors };
}

function classify(score) {
  if (score < 30) return { band: 'LOW RISK', title: 'Access allowed', message: 'This sign-in is consistent with the current profile. Continue with standard authentication.', action: 'Allowed', tone: 'safe' };
  if (score < 60) return { band: 'ELEVATED', title: 'Step-up verification', message: 'Some signals differ from the usual baseline. Request an additional verification step.', action: 'Step-up', tone: 'watch' };
  if (score < 80) return { band: 'HIGH RISK', title: 'Verify before access', message: 'Several signals are unusual. Require stronger verification and consider rate limiting.', action: 'Challenge', tone: 'danger' };
  return { band: 'CRITICAL', title: 'Temporarily restrict', message: 'The combined signals are highly unusual. Restrict this attempt and alert the user.', action: 'Restrict', tone: 'danger' };
}

function Metric({ label, value, suffix = '', note, icon, tone = 'mint', trend }) {
  return (
    <article className={'metric-card metric-' + tone}>
      <div className="metric-topline"><span className="metric-label">{label}</span><span className="metric-icon">{icon}</span></div>
      <div className="metric-value">{value}<span className="metric-suffix">{suffix}</span></div>
      <div className="metric-bottom"><span className="metric-note">{note}</span>{trend && <span className="metric-trend">{trend}</span>}</div>
    </article>
  );
}

function Slider({ id, label, value, min = 0, max = 100, suffix = '%', onChange }) {
  return (
    <div className="control">
      <div className="control-heading"><label htmlFor={id}>{label}</label><output htmlFor={id}>{value}{suffix}</output></div>
      <input className="range-input" id={id} type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <div className="range-scale"><span>{min}{suffix}</span><span>{max}{suffix}</span></div>
    </div>
  );
}

function Toggle({ title, hint, checked, onChange }) {
  return (
    <label className="toggle-row">
      <span><span className="toggle-title">{title}</span><span className="toggle-hint">{hint}</span></span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true"><span /></span>
    </label>
  );
}

function RiskGauge({ score, tone }) {
  const circumference = 326.73;
  const dash = circumference * score / 100;
  const stroke = tone === 'safe' ? '#5ce0c0' : tone === 'watch' ? '#ffbf69' : '#ff718a';
  return (
    <div className="risk-gauge" role="img" aria-label={'Risk score ' + score + ' out of 100'}>
      <svg viewBox="0 0 140 140" aria-hidden="true">
        <defs><filter id="gaugeGlow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
        <circle className="gauge-track" cx="70" cy="70" r="52" />
        <circle className="gauge-progress" cx="70" cy="70" r="52" stroke={stroke} strokeDasharray={dash + ' ' + circumference} filter="url(#gaugeGlow)" />
      </svg>
      <div className="gauge-inner"><div className="gauge-number">{score}</div><div className="gauge-caption">RISK INDEX</div></div>
      <span className="gauge-orbit orbit-one" /><span className="gauge-orbit orbit-two" />
    </div>
  );
}

function RiskTrendChart({ events }) {
  const history = events.slice(0, 8).slice().reverse();
  const chartEvents = history.length ? history : [{ id: 'empty', risk: 0, name: 'No events' }];
  const points = chartEvents.map((event, index) => ({
    x: 42 + (index * 536) / Math.max(chartEvents.length - 1, 1),
    y: 143 - event.risk * 1.12,
    event,
  }));
  const linePath = points.map((point, index) => (index === 0 ? 'M ' : 'L ') + point.x + ' ' + point.y).join(' ');
  const areaPath = linePath + ' L ' + points[points.length - 1].x + ' 150 L ' + points[0].x + ' 150 Z';
  return (
    <div className="trend-chart-wrap">
      <div className="chart-legend"><span><i className="legend-line" />Risk score</span><span><i className="legend-dot" />Decision event</span></div>
      <svg className="trend-chart" viewBox="0 0 620 184" role="img" aria-label="Risk score trend for the latest synthetic sign-in events">
        <defs>
          <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#67e8d0" stopOpacity=".25" /><stop offset="100%" stopColor="#67e8d0" stopOpacity="0" /></linearGradient>
          <linearGradient id="trendStroke" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stopColor="#8b83ff" /><stop offset="100%" stopColor="#61e5d0" /></linearGradient>
        </defs>
        {[31, 87, 143].map((y) => <g key={y}><line x1="42" y1={y} x2="578" y2={y} className="chart-gridline" /><text x="26" y={y + 3} className="chart-axis-label" textAnchor="end">{Math.round((143 - y) / 1.12)}</text></g>)}
        <path d={areaPath} fill="url(#trendFill)" />
        <path d={linePath} className="trend-line" />
        {points.map((point, index) => (
          <g key={point.event.id}>
            <circle cx={point.x} cy={point.y} r="8" className="chart-point-halo" />
            <circle cx={point.x} cy={point.y} r="4" className="chart-point" />
            <title>{point.event.name}: {point.event.risk}/100</title>
          </g>
        ))}
        <text x="42" y="173" className="chart-axis-label">EARLIER</text>
        <text x="578" y="173" className="chart-axis-label" textAnchor="end">LATEST</text>
      </svg>
      <div className="trend-foot"><span>{chartEvents.length} recent events plotted</span><span>Illustrative · browser session</span></div>
    </div>
  );
}

function SignalBreakdown({ factors }) {
  return (
    <div className="signal-breakdown">
      {factors.map((factor) => {
        const magnitude = Math.abs(factor.points);
        const width = magnitude === 0 ? 2 : Math.min(100, magnitude / 36 * 100);
        return (
          <div className="signal-row" key={factor.key}>
            <div className="signal-copy"><span>{factor.shortName}</span><b className={factor.points < 0 ? 'signal-protective' : factor.points > 0 ? 'signal-risky' : ''}>{factor.points > 0 ? '+' : ''}{factor.points}</b></div>
            <div className="signal-track"><span className={factor.points < 0 ? 'protective' : factor.points > 0 ? 'risky' : 'neutral'} style={{ width: width + '%' }} /></div>
          </div>
        );
      })}
    </div>
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
    notify.timer = window.setTimeout(() => setToast(''), 2400);
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
      <div className="ambient ambient-a" /><div className="ambient ambient-b" /><div className="ambient ambient-c" />
      <aside className="sidebar">
        <a className="brand" href="#overview" aria-label="PassGuard home"><span className="brand-mark"><span>P</span></span><span className="brand-name">PASS<span>GUARD</span><small>IDENTITY INTELLIGENCE</small></span></a>
        <div className="sidebar-group">
          <div className="sidebar-label">WORKSPACE</div>
          <a className="nav-link active" href="#overview"><span className="nav-glyph">◈</span> Overview</a>
          <a className="nav-link" href="#profile"><span className="nav-glyph">◎</span> Risk profile</a>
          <a className="nav-link" href="#activity"><span className="nav-glyph">⌁</span> Activity stream</a>
          <a className="nav-link" href="#intelligence"><span className="nav-glyph">✳</span> Intelligence layer</a>
        </div>
        <div className="sidebar-system">
          <span className="system-pulse" /><div><b>LOCAL ENGINE</b><small>Running in preview mode</small></div>
          <span className="system-version">v1.0</span>
        </div>
        <div className="sidebar-footer"><span className="footer-orb" />Built for clarity. Designed for trust.<small>PASSGUARD LAB · EDUCATIONAL PROTOTYPE</small></div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="breadcrumbs"><span className="crumb-dash">/</span> COMMAND CENTRE <span className="crumb-divider">/</span> OVERVIEW</div>
          <div className="topbar-right"><span className="environment-chip"><i /> DEMO ENVIRONMENT</span><div className="user-chip"><span className="avatar">P</span><span><b>Personal workspace</b><small>Local profile</small></span><span className="chevron">⌄</span></div></div>
        </header>

        <section className="page-heading">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-rule" /> ADAPTIVE AUTHENTICATION <span className="eyebrow-live"><i /> LIVE PREVIEW</span></div>
            <h1>Identity security.<br /><span>Without the guesswork.</span></h1>
            <p>Every sign-in tells a story. PassGuard reads the signals, explains the risk, and makes the next step visible.</p>
          </div>
          <div className="hero-actions"><button className="button button-quiet" onClick={resetDemo}><span>↺</span> Reset demo</button><button className="button button-primary" onClick={simulateSignIn}><span>＋</span> Run simulation</button></div>
          <div className="hero-index"><span>01</span><i /> SECURITY OVERVIEW</div>
        </section>

        <section className="metrics-grid" aria-label="Security metrics">
          <Metric label="Current risk index" value={score} suffix="/100" icon="◉" note={<><span className={'note-dot ' + decision.tone} />{decision.band.toLowerCase()}</>} tone="mint" trend="LIVE" />
          <Metric label="Baseline confidence" value="76" suffix="%" icon="⌁" note="Illustrative demo profile" tone="violet" trend="PROFILE" />
          <Metric label="Events evaluated" value={eventCount} icon="⌗" note="Synthetic activity stream" tone="blue" trend="SESSION" />
          <Metric label="Step-up challenges" value={challengeCount} icon="⛨" note="Risk-triggered responses" tone="amber" trend="POLICY" />
        </section>

        <div className="dashboard-grid">
          <div className="primary-column">
            <section className="panel risk-panel">
              <div className="panel-heading"><div><span className="panel-kicker">01 / DECISION ENGINE</span><h2>Live risk evaluation</h2></div><span className={'risk-badge ' + decision.tone}><i />{decision.band}</span></div>
              <div className="score-overview">
                <RiskGauge score={score} tone={decision.tone} />
                <div className="decision-summary">
                  <div className="decision-overline">RECOMMENDED ACTION</div>
                  <h3>{decision.title}</h3><p>{decision.message}</p>
                  <div className="score-track"><span className={decision.tone} style={{ width: score + '%' }} /></div>
                  <div className="score-scale"><span>0 <b>Trusted</b></span><span><b>High risk</b> 100</span></div>
                  <div className="decision-foot"><span className="decision-status"><i />Decision ready</span><span>Rule-based preview</span></div>
                </div>
              </div>
              <div className="risk-thresholds"><span className="threshold-safe"><i /> 0–29 · Allow</span><span className="threshold-watch"><i /> 30–59 · Step-up</span><span className="threshold-danger"><i /> 60+ · Challenge / restrict</span></div>
              <div className="section-divider" />
              <div className="subheading"><div><span className="panel-kicker">SIGNAL ANALYSIS</span><h2>What moved the score?</h2></div><span className="subtle-caption">POINT CONTRIBUTION</span></div>
              <SignalBreakdown factors={factors} />
              <div className="insight-box"><span className="insight-spark">✳</span><div><strong>Profile insight</strong><p>{score < 30 ? 'Familiar context and the current personal tolerance keep this sign-in low risk.' : strongest.name + ' is the strongest contributor (' + (strongest.points > 0 ? '+' : '') + strongest.points + ' points). Profile sensitivity changes its impact.'}</p></div></div>
            </section>

            <section className="panel activity-panel" id="activity">
              <div className="panel-heading"><div><span className="panel-kicker">02 / EVENT TELEMETRY</span><h2>Recent activity</h2></div><button className="button button-quiet button-small" onClick={simulateSignIn}>＋ Simulate sign-in</button></div>
              <div className="activity-head"><span>EVENT</span><span>CONTEXT</span><span>RISK</span><span>DECISION</span></div>
              <div className="activity-list">{events.slice(0, 5).map((event) => (
                <div className="activity-row" key={event.id}>
                  <div className="activity-event"><span className={'event-icon ' + (event.risk >= 60 ? 'event-danger' : event.risk >= 30 ? 'event-watch' : 'event-safe')}>{event.risk >= 60 ? '!' : event.risk >= 30 ? '↗' : '✓'}</span><span><b>{event.name}</b><small>Demo event · recent</small></span></div>
                  <span className="activity-context">{event.context}</span>
                  <span className={'activity-risk ' + (event.risk >= 60 ? 'high' : event.risk >= 30 ? 'medium' : '')}>{event.risk}<small>/100</small></span>
                  <span className={'activity-decision ' + (event.risk >= 60 ? 'danger' : event.risk >= 30 ? 'watch' : 'safe')}>{event.decision}</span>
                </div>
              ))}</div>
              <div className="activity-foot"><span><i /> Activity stream connected to local simulation</span><span>Showing {Math.min(events.length, 5)} of {events.length} recent events</span></div>
            </section>
          </div>

          <div className="secondary-column">
            <section className="panel profile-panel" id="profile">
              <div className="panel-heading"><div><span className="panel-kicker">03 / PERSONALISATION</span><h2>Risk profile</h2></div><span className="profile-live">EDITABLE</span></div>
              <p className="panel-intro">Tune how strongly each signal influences this user's risk score.</p>
              <div className="control-stack">
                <Slider id="device-sensitivity" label="Device sensitivity" value={profile.deviceSensitivity} onChange={(v) => changeProfile('deviceSensitivity', v)} />
                <Slider id="location-sensitivity" label="Location sensitivity" value={profile.locationSensitivity} onChange={(v) => changeProfile('locationSensitivity', v)} />
                <Slider id="time-sensitivity" label="Time sensitivity" value={profile.timeSensitivity} onChange={(v) => changeProfile('timeSensitivity', v)} />
                <Slider id="failed-tolerance" label="Failed-attempt tolerance" value={profile.failedAttemptTolerance} min={0} max={6} suffix=" attempts" onChange={(v) => changeProfile('failedAttemptTolerance', v)} />
              </div>
              <div className="section-divider" />
              <div className="subheading"><div><span className="panel-kicker">CONTEXT INPUTS</span><h2>Sign-in signals</h2></div><span className="subtle-caption">TEST CONTROLS</span></div>
              <div className="toggle-stack">
                <Toggle title="Recognised device" hint="Seen in this profile before" checked={context.recognisedDevice} onChange={(v) => changeContext('recognisedDevice', v)} />
                <Toggle title="Familiar location" hint="Matches the usual region" checked={context.familiarLocation} onChange={(v) => changeContext('familiarLocation', v)} />
                <Toggle title="Unusual sign-in time" hint="Outside normal activity hours" checked={context.unusualTime} onChange={(v) => changeContext('unusualTime', v)} />
              </div>
              <Slider id="failed-attempts" label="Recent failed attempts" value={context.failedAttempts} min={0} max={10} suffix=" attempts" onChange={(v) => changeContext('failedAttempts', v)} />
              <div className="button-row"><button className="button button-quiet" onClick={saveProfile}>Save profile</button><button className="button button-primary" onClick={() => recordSignIn('Sign-in evaluated')}>Evaluate sign-in <span>→</span></button></div>
              <p className="helper-copy"><span>◈</span> Settings are stored in this browser. This preview's risk calculation runs on the frontend.</p>
            </section>

            <section className="panel trend-panel">
              <div className="panel-heading"><div><span className="panel-kicker">04 / BEHAVIOURAL PULSE</span><h2>Risk over time</h2></div><span className="chart-period">LAST 8 EVENTS <i>⌄</i></span></div>
              <RiskTrendChart events={events} />
            </section>

            <section className="insight-mini">
              <div className="mini-orbit"><span>✳</span></div>
              <div><b>Make every decision legible.</b><p>See the score, the signals behind it, and the next-best action in one place.</p></div>
              <span className="mini-arrow">↗</span>
            </section>
          </div>
        </div>

        <div id="intelligence">
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
        </div>
        <footer className="page-footnote"><span>PASSGUARD LAB</span> · Educational prototype · Transparent illustrative scoring · Synthetic events only <span className="footnote-right">DESIGNED FOR EXPLAINABILITY <i>✳</i></span></footer>
      </main>
      {toast && <div className="toast" role="status"><span>✳</span>{toast}</div>}
    </div>
  );
}
