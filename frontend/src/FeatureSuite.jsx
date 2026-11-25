import { useMemo, useState } from 'react';
import './FeatureSuite.css';

const STARTER_BASELINE = {
  verifiedSessions: 3,
  knownDevices: 1,
  knownLocations: 1,
  usualTimeWindows: 2,
};

const NEUTRAL_PROFILE = {
  deviceSensitivity: 50,
  locationSensitivity: 50,
  timeSensitivity: 50,
  failedAttemptTolerance: 2,
};

function loadBaseline() {
  try {
    const stored = localStorage.getItem('passguard-baseline');
    return stored ? { ...STARTER_BASELINE, ...JSON.parse(stored) } : STARTER_BASELINE;
  } catch {
    return STARTER_BASELINE;
  }
}

function saveJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function makeCounterfactuals(profile, context, scoreForContext) {
  const options = [];
  const add = (key, label, explanation, nextContext) => {
    const reduction = scoreForContext(context, profile) - scoreForContext(nextContext, profile);
    if (reduction > 0) options.push({ key, label, explanation, reduction });
  };

  if (!context.recognisedDevice) {
    add('device', 'Use a recognised device', 'This removes the unfamiliar-device signal.', {
      ...context, recognisedDevice: true,
    });
  }
  if (!context.familiarLocation) {
    add('location', 'Use a familiar region', 'This removes the location-deviation signal.', {
      ...context, familiarLocation: true,
    });
  }
  if (context.unusualTime) {
    add('time', 'Sign in during a usual time window', 'This removes the time-anomaly signal.', {
      ...context, unusualTime: false,
    });
  }

  return options.sort((a, b) => b.reduction - a.reduction).slice(0, 3);
}

function isValidProfile(profile) {
  return profile
    && ['deviceSensitivity', 'locationSensitivity', 'timeSensitivity'].every(
      (key) => Number.isFinite(profile[key]) && profile[key] >= 0 && profile[key] <= 100,
    )
    && Number.isFinite(profile.failedAttemptTolerance)
    && profile.failedAttemptTolerance >= 0
    && profile.failedAttemptTolerance <= 6;
}

export default function FeatureSuite({
  profile,
  context,
  score,
  decision,
  factors,
  scoreForContext,
  onConfirmContext,
  onImportProfile,
  onClearProfile,
}) {
  const [baseline, setBaseline] = useState(loadBaseline);
  const [feedbackCount, setFeedbackCount] = useState(0);
  const [feedbackMessage, setFeedbackMessage] = useState('');

  const counterfactuals = useMemo(
    () => makeCounterfactuals(profile, context, scoreForContext),
    [profile, context, scoreForContext],
  );
  const neutralScore = scoreForContext(context, NEUTRAL_PROFILE);
  const personalisationDelta = score - neutralScore;
  const baselineProgress = Math.min(100, baseline.verifiedSessions * 10);

  function confirmSignIn() {
    const nextBaseline = {
      ...baseline,
      verifiedSessions: baseline.verifiedSessions + 1,
      knownDevices: baseline.knownDevices + (context.recognisedDevice ? 0 : 1),
      knownLocations: baseline.knownLocations + (context.familiarLocation ? 0 : 1),
      usualTimeWindows: baseline.usualTimeWindows + (context.unusualTime ? 1 : 0),
      updatedAt: new Date().toISOString(),
    };
    setBaseline(nextBaseline);
    localStorage.setItem('passguard-baseline', JSON.stringify(nextBaseline));
    onConfirmContext({
      ...context,
      recognisedDevice: true,
      familiarLocation: true,
      unusualTime: false,
    });
    setFeedbackMessage('Confirmed context added to this browser’s baseline.');
  }

  function flagSignIn() {
    setFeedbackCount((count) => count + 1);
    setFeedbackMessage('Feedback saved locally. No automatic trust was granted.');
  }

  function exportProfile() {
    saveJson('passguard-personal-profile.json', {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      profile,
      baseline,
    });
    setFeedbackMessage('Portable profile exported.');
  }

  async function importProfile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (
        payload.schemaVersion !== 1
        || !isValidProfile(payload.profile)
        || !payload.baseline
        || !['verifiedSessions', 'knownDevices', 'knownLocations', 'usualTimeWindows'].every(
          (key) => Number.isInteger(payload.baseline[key]) && payload.baseline[key] >= 0,
        )
      ) {
        throw new Error('This is not a valid PassGuard profile export.');
      }
      const nextBaseline = { ...STARTER_BASELINE, ...payload.baseline };
      onImportProfile(payload.profile);
      setBaseline(nextBaseline);
      localStorage.setItem('passguard-baseline', JSON.stringify(nextBaseline));
      setFeedbackMessage('Profile imported successfully.');
    } catch (error) {
      setFeedbackMessage(error.message || 'Could not import this profile.');
    } finally {
      event.target.value = '';
    }
  }

  function deleteProfile() {
    localStorage.removeItem('passguard-baseline');
    onClearProfile();
    setBaseline({ ...STARTER_BASELINE, verifiedSessions: 0, knownDevices: 0, knownLocations: 0, usualTimeWindows: 0 });
    setFeedbackMessage('Saved profile and baseline settings cleared from this browser.');
  }

  function exportDecisionReceipt() {
    saveJson('passguard-decision-receipt.json', {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      riskScore: score,
      riskBand: decision.band,
      recommendedAction: decision.action,
      factorBreakdown: factors,
      personalisationDeltaVsNeutral: personalisationDelta,
      signInContext: context,
      profile,
      baseline,
      note: 'Educational explanation only. This JSON is not cryptographically signed and is not a tamper-proof backend audit record.',
    });
    setFeedbackMessage('Decision receipt exported.');
  }

  return (
    <section className="feature-suite" aria-label="PassGuard differentiating features">
      <div className="feature-suite-heading">
        <div>
          <div className="feature-eyebrow">BEYOND A SINGLE RISK SCORE</div>
          <h2>Personal, explainable, portable.</h2>
          <p>PassGuard gives users visibility and control over how their personal baseline shapes an authentication decision.</p>
        </div>
        <span className="privacy-chip">LOCAL-FIRST PROFILE</span>
      </div>

      <div className="feature-grid">
        <article className="feature-card">
          <div className="feature-card-top">
            <div><span className="feature-index">01</span><h3>Teach your baseline</h3></div>
            <span className="feature-state">USER-LED</span>
          </div>
          <p className="feature-copy">
            Confirm a sign-in that is genuinely yours. Its device, region and time context are added to this browser’s personal baseline.
          </p>
          <div className="baseline-metrics">
            <div><strong>{baseline.verifiedSessions}</strong><span>Confirmed sessions</span></div>
            <div><strong>{baseline.knownDevices}</strong><span>Known devices</span></div>
            <div><strong>{baseline.knownLocations}</strong><span>Known regions</span></div>
          </div>
          <div className="learning-progress">
            <div><span>Sample collection</span><b>{baselineProgress}%</b></div>
            <div className="learning-track"><span style={{ width: baselineProgress + '%' }} /></div>
            <small>Illustrative progress toward 10 confirmed sessions</small>
          </div>
          <div className="feature-actions">
            <button className="feature-button feature-primary" onClick={confirmSignIn}>This sign-in was me</button>
            <button className="feature-button" onClick={flagSignIn}>Flag as suspicious</button>
          </div>
          {feedbackMessage && <p className="feature-feedback" role="status">{feedbackMessage}</p>}
          <p className="feature-footnote">User feedback is not identity proof. This only updates the local demo profile, not server-side authentication.</p>
        </article>

        <article className="feature-card">
          <div className="feature-card-top">
            <div><span className="feature-index">02</span><h3>What-if explanations</h3></div>
            <span className="feature-state">COUNTERFACTUAL</span>
          </div>
          <p className="feature-copy">
            Don’t just show a score. Show which change in context would reduce it, with the estimated difference.
          </p>
          <div className="impact-summary">
            <div><span>Personal score</span><strong>{score}</strong></div>
            <div className="impact-divider">vs</div>
            <div><span>Neutral profile</span><strong>{neutralScore}</strong></div>
          </div>
          <div className="personal-impact">
            Personalisation effect
            <b className={personalisationDelta <= 0 ? 'impact-negative' : 'impact-positive'}>
              {personalisationDelta > 0 ? '+' : ''}{personalisationDelta} points
            </b>
          </div>
          <div className="counterfactual-list">
            {counterfactuals.length ? counterfactuals.map((item) => (
              <div className="counterfactual-item" key={item.key}>
                <div><strong>{item.label}</strong><span>{item.explanation}</span></div>
                <b>−{item.reduction}</b>
              </div>
            )) : (
              <div className="feature-empty">No single context change is needed to lower this sign-in’s risk.</div>
            )}
          </div>
        </article>

        <article className="feature-card">
          <div className="feature-card-top">
            <div><span className="feature-index">03</span><h3>Privacy & portability</h3></div>
            <span className="feature-state">USER-OWNED</span>
          </div>
          <p className="feature-copy">
            Your risk preferences and learned baseline stay in this browser. Export or import the profile instead of locking it to one installation.
          </p>
          <div className="privacy-callout">
            <span className="privacy-lock">◈</span>
            <div><strong>Stored on this device</strong><span>No cloud sync is performed by this prototype.</span></div>
          </div>
          <div className="privacy-actions">
            <button className="feature-button" onClick={exportProfile}>Export profile JSON</button>
            <label className="feature-button file-button">
              Import profile JSON
              <input type="file" accept="application/json,.json" onChange={importProfile} />
            </label>
            <button className="feature-button" onClick={exportDecisionReceipt}>Export decision receipt</button>
            <button className="feature-button feature-danger" onClick={deleteProfile}>Delete local profile</button>
          </div>
          <p className="feature-footnote">Receipts and profile exports are plain JSON, not cryptographically signed or tamper-proof.</p>
          <p className="feature-feedback" role="status">{feedbackCount ? feedbackCount + ' suspicious sign-in report(s) recorded in this session.' : 'No suspicious sign-ins flagged in this session.'}</p>
        </article>
      </div>
    </section>
  );
}
