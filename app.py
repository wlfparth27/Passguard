import os
import random
import secrets
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from functools import wraps

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from flask import Flask, flash, jsonify, redirect, render_template_string, request, send_from_directory, session, url_for
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func

app = Flask(__name__)
app.config.update(
    SECRET_KEY=os.environ.get('PASSGUARD_SECRET', secrets.token_hex(32)),
    SQLALCHEMY_DATABASE_URI='sqlite:///' + os.path.join(os.path.dirname(__file__), 'passguard.db'),
    SQLALCHEMY_TRACK_MODIFICATIONS=False,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
)
db = SQLAlchemy(app)
ph = PasswordHasher()

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

class Event(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    username = db.Column(db.String(50), nullable=False)
    source = db.Column(db.String(50), nullable=False)
    outcome = db.Column(db.String(30), nullable=False)
    pattern = db.Column(db.String(50), nullable=False)
    risk = db.Column(db.Integer, nullable=False)
    action = db.Column(db.String(50), nullable=False)
    synthetic = db.Column(db.Boolean, default=False)

# In-memory rate limiting for a single-process local demonstration.
attempts = defaultdict(deque)
blocks = {}

PAGE = '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>PassGuard | Adaptive Authentication Lab</title><style>
:root{font-family:Inter,Segoe UI,Arial,sans-serif;color:#e8eefb;background:#0b1220}*{box-sizing:border-box}body{margin:0;background:#0b1220}header{padding:20px 6%;border-bottom:1px solid #27364e;display:flex;justify-content:space-between;align-items:center;background:#101b2e}.brand{font-size:23px;font-weight:800;letter-spacing:-.5px}.brand span{color:#47c8bd}.tag{font-size:12px;color:#9ab0c8;border:1px solid #34465e;border-radius:30px;padding:7px 12px}main{max-width:1150px;margin:36px auto;padding:0 20px}h1{font-size:34px;margin:0 0 8px}h2{font-size:19px;margin:0 0 18px}p,.muted{color:#a3b5ce}nav{display:flex;gap:10px;flex-wrap:wrap;margin:24px 0}a,button{cursor:pointer}nav a,.button{background:#21334b;color:#edf6ff;border:1px solid #39516c;text-decoration:none;padding:10px 16px;border-radius:9px;font-weight:600;font-size:14px}nav a:hover,.button:hover{background:#2a4a64}.primary{background:#17a99c;border-color:#17a99c;color:#071a21}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.card,.panel{background:#142238;border:1px solid #2b405a;border-radius:14px;padding:23px}.card strong{font-size:32px;display:block;margin:10px 0 3px}.card small{color:#a7bad0}.panels{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:20px}.panel{margin-top:18px}.panels .panel{margin-top:0}input,select{width:100%;padding:12px;border-radius:8px;border:1px solid #3a506c;background:#0d1828;color:white;margin:7px 0 15px}label{font-size:13px;color:#b5c7dc}table{width:100%;border-collapse:collapse;font-size:13px}td,th{text-align:left;padding:11px 9px;border-bottom:1px solid #2b3e56}th{color:#9eb6d1}td{color:#dce9f6}.pill{display:inline-block;border-radius:30px;padding:5px 10px;font-size:11px;font-weight:700;background:#25435b}.high{background:#623540;color:#ffb6b6}.low{background:#184e49;color:#83e2cc}.mid{background:#5b4a2a;color:#f4d58a}.notice{background:#233e4c;border:1px solid #386f78;padding:12px 15px;border-radius:9px;margin:12px 0}.bar{height:12px;background:#293a52;border-radius:9px;overflow:hidden;margin:9px 0 20px}.fill{height:100%;background:#22b8a9}.hint{font-size:12px;color:#93a9c1}.inline{display:flex;gap:10px;align-items:center}.inline input{margin:0}.inline button{white-space:nowrap}footer{text-align:center;color:#718ba9;font-size:12px;margin:45px 0 20px}@media(max-width:850px){.grid,.panels{grid-template-columns:1fr 1fr}}@media(max-width:570px){.grid,.panels{grid-template-columns:1fr}h1{font-size:27px}}
</style></head><body><header><div class="brand">⬡ Pass<span>Guard</span></div><span class="tag">LOCAL SECURITY LAB</span></header><main>
<h1>{{ title }}</h1><p>{{ subtitle }}</p>
<nav><a href="{{ url_for('dashboard') }}">Dashboard</a><a href="{{ url_for('simulator') }}">Simulation Lab</a><a href="{{ url_for('presentation') }}">Adaptive UI</a>{% if session.get('user_id') %}<a href="{{ url_for('logout') }}">Logout ({{ session.get('username') }})</a>{% else %}<a href="{{ url_for('login') }}">Login</a><a href="{{ url_for('register') }}">Register</a>{% endif %}</nav>
{% for msg in get_flashed_messages() %}<div class="notice">{{ msg }}</div>{% endfor %}
{{ content|safe }}
</main><footer>PassGuard • Adaptive Authentication Detection Prototype • Synthetic experiments only</footer></body></html>'''

def render(title, subtitle, content, **context):
    body = render_template_string(content, **context)
    return render_template_string(PAGE, title=title, subtitle=subtitle, content=body)

def require_login(fn):
    @wraps(fn)
    def inner(*args, **kwargs):
        if not session.get('user_id'):
            flash('Log in to access the security dashboard.')
            return redirect(url_for('login'))
        return fn(*args, **kwargs)
    return inner

def csrf_token():
    if 'csrf' not in session:
        session['csrf'] = secrets.token_urlsafe(24)
    return session['csrf']

@app.before_request
def verify_csrf():
    if request.method == 'POST' and not secrets.compare_digest(request.form.get('csrf', ''), session.get('csrf', '')):
        return 'Invalid form token. Refresh the page and try again.', 400

app.jinja_env.globals['csrf_token'] = csrf_token

def score_from_events(source, username, now):
    since = now - timedelta(minutes=2)
    recent = Event.query.filter(Event.timestamp >= since, Event.source == source, Event.synthetic.is_(False)).all()
    failures = sum(e.outcome == 'FAILED' for e in recent)
    distinct = len({e.username for e in recent})
    velocity = len(recent)
    failure_score = min(100, failures * 15)
    velocity_score = min(100, velocity * 12)
    username_score = min(100, max(0, distinct - 1) * 25)
    history_score = min(100, sum(e.risk >= 60 for e in recent) * 20)
    risk = round(.30 * failure_score + .25 * velocity_score + .25 * username_score + .20 * history_score)
    pattern = 'MULTI_ACCOUNT' if distinct >= 4 else 'REPEATED_FAILURES' if failures >= 4 else 'NORMAL'
    return risk, pattern

def record(username, source, outcome, risk, pattern, action, synthetic=False, timestamp=None):
    db.session.add(Event(username=username, source=source, outcome=outcome, risk=risk, pattern=pattern, action=action, synthetic=synthetic, timestamp=timestamp or datetime.now(timezone.utc)))
    db.session.commit()

FORM = '''<div class="panel" style="max-width:500px"><h2>{{ heading }}</h2><form method="post"><input type="hidden" name="csrf" value="{{ csrf_token() }}"><label>Username</label><input name="username" minlength="3" maxlength="50" required autocomplete="username" pattern="[A-Za-z0-9_]+"><label>Password</label><input type="password" name="password" minlength="8" required autocomplete="{{ autocomplete }}"><button class="button primary" type="submit">{{ heading }}</button></form><p class="hint">Use test credentials only. Do not reuse personal passwords.</p></div>'''

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get('username', '').strip().lower()
        password = request.form.get('password', '')
        if not (3 <= len(username) <= 50 and username.replace('_','').isalnum() and len(password) >= 8):
            flash('Use a valid username and a password of at least 8 characters.')
        elif User.query.filter_by(username=username).first():
            flash('Username is already taken.')
        else:
            db.session.add(User(username=username, password_hash=ph.hash(password)))
            db.session.commit()
            flash('Account created. You can now log in.')
            return redirect(url_for('login'))
    return render('Create a test account', 'Register an account for your controlled authentication laboratory.', FORM, heading='Register', autocomplete='new-password')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username', '').strip().lower()
        password = request.form.get('password', '')
        source = request.remote_addr or 'local'
        now = datetime.now(timezone.utc)
        risk, pattern = score_from_events(source, username, now)
        key = (source, username)
        if blocks.get(key, datetime.min.replace(tzinfo=timezone.utc)) > now:
            record(username, source, 'BLOCKED', max(risk, 80), pattern, 'TEMP_RESTRICTION')
            flash('Login temporarily restricted. Try again shortly.')
            return redirect(url_for('login'))
        user = User.query.filter_by(username=username).first()
        valid = False
        if user:
            try:
                valid = ph.verify(user.password_hash, password)
            except (VerificationError, InvalidHashError):
                valid = False
        if valid:
            attempts.pop(key, None)
            session.clear()
            session['user_id'] = user.id
            session['username'] = user.username
            record(username, source, 'SUCCESS', risk, pattern, 'ALLOW')
            return redirect(url_for('dashboard'))
        q = attempts[key]
        q.append(now)
        while q and (now - q[0]).total_seconds() > 120:
            q.popleft()
        risk = max(risk, min(100, len(q) * 15))
        action = 'MONITOR'
        if len(q) >= 5:
            blocks[key] = now + timedelta(seconds=60)
            action = 'TEMP_RESTRICTION'
        elif len(q) >= 3:
            action = 'ELEVATED_MONITORING'
        record(username, source, 'FAILED', risk, 'REPEATED_FAILURES' if len(q) >= 4 else pattern, action)
        flash('Invalid username or password.')
        return redirect(url_for('login'))
    return render('Secure authentication', 'Login attempts are monitored and scored by the adaptive engine.', FORM, heading='Login', autocomplete='current-password')

@app.route('/logout')
def logout():
    session.clear()
    flash('Logged out.')
    return redirect(url_for('login'))

DASH = '''<div class="grid"><div class="card"><small>Total Events</small><strong>{{ total }}</strong><small>Recorded lab activity</small></div><div class="card"><small>Failed Attempts</small><strong>{{ failed }}</strong><small>Authentication failures</small></div><div class="card"><small>High Risk</small><strong>{{ high }}</strong><small>Risk score ≥ 60</small></div><div class="card"><small>Restrictions</small><strong>{{ blocked }}</strong><small>Temporarily restricted events</small></div></div>
<div class="panels"><div class="panel"><h2>Detection overview</h2><p>Adaptive scoring considers recent failure counts, request velocity, accounts targeted, and suspicious history.</p><p><span class="pill low">LOW &lt;30</span> <span class="pill mid">MEDIUM 30–59</span> <span class="pill high">HIGH ≥60</span></p><p class="hint">The scoring weights are demonstration defaults, not validated production thresholds.</p></div><div class="panel"><h2>Experiment controls</h2><p>Generate labeled synthetic activity, compare scenarios, and inspect the resulting security events.</p><a class="button primary" href="{{ url_for('simulator') }}">Open simulation lab</a></div></div>
<div class="panel"><h2>Recent authentication events</h2><div style="overflow:auto"><table><tr><th>Time (UTC)</th><th>Account</th><th>Source</th><th>Outcome</th><th>Pattern</th><th>Risk</th><th>Response</th></tr>{% for e in events %}<tr><td>{{ e.timestamp.strftime('%H:%M:%S') }}</td><td>{{ e.username }}</td><td>{{ e.source }}</td><td>{{ e.outcome }}{% if e.synthetic %} (sim){% endif %}</td><td>{{ e.pattern }}</td><td><span class="pill {% if e.risk >= 60 %}high{% elif e.risk >= 30 %}mid{% else %}low{% endif %}">{{ e.risk }}</span></td><td>{{ e.action }}</td></tr>{% endfor %}</table></div></div>'''

@app.route('/')
@app.route('/dashboard')
@require_login
def dashboard():
    total = db.session.query(func.count(Event.id)).scalar() or 0
    failed = Event.query.filter_by(outcome='FAILED').count()
    high = Event.query.filter(Event.risk >= 60).count()
    blocked = Event.query.filter_by(action='TEMP_RESTRICTION').count()
    events = Event.query.order_by(Event.timestamp.desc(), Event.id.desc()).limit(30).all()
    return render('Security dashboard', 'Monitor authentication activity, risk scores, and defensive responses.', DASH, total=total, failed=failed, high=high, blocked=blocked, events=events)

SIM = '''<div class="panels"><div class="panel"><h2>Generate a scenario</h2><form method="post"><input type="hidden" name="csrf" value="{{ csrf_token() }}"><label>Scenario</label><select name="scenario"><option value="normal">Normal login behavior</option><option value="guessing">Repeated guessing pattern</option><option value="spraying">Multi-account / spraying pattern</option><option value="slow">Low-rate suspicious pattern</option></select><label>Number of events (5–100)</label><input type="number" name="count" min="5" max="100" value="30" required><button class="button primary" type="submit">Generate synthetic events</button></form><p class="hint">No real login requests are sent. Synthetic events are labeled and stored separately.</p></div><div class="panel"><h2>Risk classification</h2><p>LOW: below 30 → Allow / monitor</p><p>MEDIUM: 30–59 → Increased monitoring</p><p>HIGH: 60–79 → Rate-limit / verify</p><p>CRITICAL: 80–100 → Restrict and alert</p><p class="hint">This simulator illustrates the scoring model, not a measured detection accuracy.</p></div></div>{% if result %}<div class="panel"><h2>Simulation completed</h2><p>Scenario: <b>{{ result.name }}</b> | Events: <b>{{ result.count }}</b> | Average risk: <b>{{ result.average }}</b></p><div class="bar"><div class="fill" style="width:{{ result.average }}%"></div></div><p>High-risk events: <b>{{ result.high }}</b></p><a class="button" href="{{ url_for('dashboard') }}">Inspect events on dashboard</a></div>{% endif %}'''

@app.route('/simulator', methods=['GET', 'POST'])
@require_login
def simulator():
    result = None
    if request.method == 'POST':
        scenario = request.form.get('scenario', 'normal')
        if scenario not in {'normal', 'guessing', 'spraying', 'slow'}:
            return 'Invalid scenario', 400
        try:
            count = int(request.form.get('count', '30'))
        except ValueError:
            return 'Invalid event count', 400
        if not 5 <= count <= 100:
            return 'Event count must be between 5 and 100', 400
        randomizer = random.Random(secrets.randbits(64))
        now = datetime.now(timezone.utc)
        risks = []
        for i in range(count):
            if scenario == 'normal':
                username, source = f'lab_user_{i%5}', 'sim-normal'
                risk = randomizer.randint(2, 22)
                outcome = 'FAILED' if i % 9 == 0 else 'SUCCESS'
                pattern = 'NORMAL'
                action = 'ALLOW'
                ts = now - timedelta(seconds=(count-i)*18)
            elif scenario == 'guessing':
                username, source = 'lab_target', 'sim-guessing'
                risk = min(100, 15 + i * 4)
                outcome, pattern = 'FAILED', 'REPEATED_FAILURES'
                action = 'TEMP_RESTRICTION' if risk >= 80 else 'RATE_LIMIT' if risk >= 60 else 'MONITOR'
                ts = now - timedelta(seconds=(count-i)*2)
            elif scenario == 'spraying':
                username, source = f'lab_user_{i%12}', 'sim-spraying'
                risk = min(100, 20 + i * 3)
                outcome, pattern = 'FAILED', 'MULTI_ACCOUNT'
                action = 'TEMP_RESTRICTION' if risk >= 80 else 'RATE_LIMIT' if risk >= 60 else 'MONITOR'
                ts = now - timedelta(seconds=(count-i)*3)
            else:
                username, source = f'lab_user_{i%3}', 'sim-slow'
                risk = min(85, 12 + i)
                outcome, pattern = 'FAILED', 'LOW_RATE_PATTERN'
                action = 'MONITOR' if risk < 60 else 'REVIEW'
                ts = now - timedelta(minutes=(count-i)*4)
            db.session.add(Event(timestamp=ts, username=username, source=source, outcome=outcome, pattern=pattern, risk=risk, action=action, synthetic=True))
            risks.append(risk)
        db.session.commit()
        result = {'name': scenario.upper(), 'count': count, 'average': round(sum(risks)/len(risks), 1), 'high': sum(r >= 60 for r in risks)}
    return render('Controlled simulation lab', 'Reproduce authentication patterns using synthetic event records.', SIM, result=result)


@app.route('/presentation')
def presentation():
    """Serve the standalone adaptive-risk presentation UI."""
    return send_from_directory(os.path.join(app.root_path, 'frontend'), 'index.html')

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(host='127.0.0.1', port=5000, debug=False)
