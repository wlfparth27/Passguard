# PassGuard — Adaptive Authentication Lab

PassGuard is an educational adaptive-authentication prototype with a Flask authentication/simulation backend and a React + Vite presentation frontend.

## Structure

- `app.py` — Flask authentication and simulation prototype.
- `requirements.txt` — Python dependencies.
- `frontend/` — React + Vite application.
- `frontend/src/App.jsx` — interactive adaptive-risk dashboard.
- `frontend/src/App.css` — responsive presentation styling.

## Run the React frontend

Requires Node.js 20.19+.

```bash
cd frontend
npm install
npm run dev
```

Create a production build with `npm run build`. The compiled app is written to `frontend/dist`.

## Deploy the frontend to Vercel

Import `wlfparth27/Passguard` into Vercel and set:

- **Root Directory:** `frontend`
- **Framework Preset:** Vite
- **Install Command:** `npm install`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

Vercel will deploy the React frontend only. The Flask application at the repository root is a separate backend and is not included in this static frontend deployment. The current React risk calculation runs in the browser and stores the demo profile in localStorage. To make authentication genuinely adaptive, deploy the Flask API separately on a Python-capable host and connect the React app to it using an API base URL.

## Run the Flask prototype locally

From the repository root:

```bash
python -m venv .venv
pip install -r requirements.txt
```

Set a persistent secret before starting:

PowerShell:
```powershell
$env:PASSGUARD_SECRET = "replace-with-a-long-random-secret"
```

macOS/Linux:
```bash
export PASSGUARD_SECRET="replace-with-a-long-random-secret"
```

Then run `python app.py`. Register at http://127.0.0.1:5000/register and log in.

To serve the compiled React build through Flask locally, run `npm run build` inside `frontend`, then open http://127.0.0.1:5000/presentation. For frontend development, run the Vite server and Flask in separate terminals.

## Features

### Flask prototype
- User registration and login with Argon2 password hashing.
- Session-based authentication and CSRF checks on POST forms.
- In-memory login-attempt tracking and temporary restrictions.
- Authentication event dashboard.
- Synthetic normal, guessing, spraying, and low-rate scenarios.

### React presentation UI
- Personal sensitivity settings for device, location, and sign-in time.
- User-defined tolerance for failed attempts.
- Sign-in context controls for device, location, time, and failures.
- Live score recalculation and factor-by-factor explanation.
- Illustrative access decisions, event history, and risk trend.
- Browser-local profile persistence.

## Limitations

This is an educational prototype, not a production authentication or intrusion-detection system. The React dashboard currently demonstrates its own illustrative scoring model; it does not call the Flask authentication engine or enforce access decisions. Backend rate limits and temporary blocks are held in memory and reset when the process restarts. Risk weights and thresholds are not empirically validated. Synthetic events are not evidence of real attack detection.


## Distinctive user-facing features

- **User-taught baseline:** explicitly confirmed sign-ins add device, region and time context to the browser-local profile.
- **Counterfactual explanations:** the dashboard estimates which context change would reduce the score most.
- **Personalisation impact:** compares a user's configured profile against a neutral reference profile.
- **Portable profile and decision receipt:** users can export/import profile settings and export a JSON explanation of a risk decision.
- **Local-first controls:** users can remove their locally stored profile data.

These are demonstration features. The baseline feedback is not proof of identity, the risk calculation is not validated, and exported JSON is not a signed audit record.
