# PassGuard — Adaptive Authentication Lab

PassGuard is an educational adaptive-authentication prototype. It combines a Flask authentication and event-simulation backend with a lightweight, interactive dashboard for demonstrating personalised risk scoring.

## Project structure

```text
Passguard/
├── app.py                  # Flask authentication and simulation backend
├── requirements.txt        # Python dependencies
├── frontend/
│   └── index.html          # Responsive adaptive-risk dashboard
├── .env.example            # Environment configuration example
├── .gitignore
└── README.md
```

## Run locally

1. Create and activate a virtual environment.
2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Set a persistent Flask secret in your environment. For PowerShell:

   ```powershell
   $env:PASSGUARD_SECRET = "replace-with-a-long-random-secret"
   ```

   For macOS/Linux:

   ```bash
   export PASSGUARD_SECRET="replace-with-a-long-random-secret"
   ```

4. Start the application:

   ```bash
   python app.py
   ```

5. Open http://127.0.0.1:5000/register, create a lab account, and log in.
6. Open the Adaptive UI link in the navigation, or visit http://127.0.0.1:5000/presentation.

The SQLite database is created locally as passguard.db.

## Backend prototype

The Flask application currently provides:
- User registration and login with Argon2 password hashing.
- Session-based authentication and CSRF checks on POST forms.
- A local login-attempt tracker with temporary restrictions.
- An event log and dashboard for authentication outcomes.
- Synthetic scenarios for normal activity, repeated guessing, password spraying, and low-rate suspicious patterns.

## Adaptive-risk presentation UI

The frontend provides:
- User-adjustable sensitivity for device, location, and sign-in time.
- A configurable tolerance for recent failed attempts.
- Test inputs for recognising devices, familiar locations, unusual times, and failed attempts.
- A live illustrative score with a factor-by-factor explanation.
- Example access decisions and synthetic activity visualisation.
- Browser-local profile persistence through localStorage.

**Integration status:** The presentation UI is currently a standalone demonstration served by Flask at /presentation. Its score calculation is client-side and is not yet connected to the backend's authentication decisions or stored user profiles.

## Limitations and safety

This is an educational local prototype, not a production authentication or intrusion-detection system. Rate limiting and temporary blocks are held in memory and reset when the process restarts. The risk weights and thresholds are illustrative, not empirically validated. Simulation events are synthetic and are not evidence of real attack detection.

Do not expose this application publicly or use it to protect real accounts without a security review, persistent rate limiting, validated risk logic, and additional production controls.

## Source attribution

The initial Flask authentication prototype and its dependency list were brought over from [ITCS_PassGuard-Lab](https://github.com/MehakD-08/ITCS_PassGuard-Lab). The adaptive-risk dashboard and the /presentation route were added for this repository.
