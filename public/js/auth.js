// Sign-in flows.
//   Customers: work email -> 6-digit code (no password, no project code).
//   FLO staff: email + password, forgot password, set new password from a
//   recovery or invite link.
import { supabase, configured } from './supabase.js';
import { loadProfile, loadProject } from './data.js';

const NEUTRAL_OTP = "If this email is registered, we've sent a 6-digit code. It expires in 10 minutes.";
const NEUTRAL_RESET = "If this email is registered, we've sent a link to reset your password.";
const INACTIVE = 'Your account is not active. Contact your FLO Customer Success Manager.';
const NETWORK = "We couldn't reach the sign-in service. Check your connection and try again.";
const COOLDOWN_SECONDS = 60;

// Read the URL hash before supabase-js consumes it (recovery and invite links).
const hash = new URLSearchParams(location.hash.slice(1));
let needPassword = ['recovery', 'invite'].includes(hash.get('type'));
const isInvite = hash.get('type') === 'invite';
const linkError = hash.get('error_description');

let hooks = { onSignedIn() {}, onSignedOut() {} };
let otpEmail = '';
let resendTimer = null;
let currentUserId = null;

const $ = id => document.getElementById(id);
const VIEWS = ['vEmail', 'vCode', 'vStaff', 'vForgot', 'vNewPw'];

function show(view) {
  VIEWS.forEach(v => $(v).classList.toggle('hid', v !== view));
  const sw = $('bModeSwitch');
  sw.parentElement.classList.toggle('hid', view === 'vNewPw');
  sw.textContent = view === 'vEmail' || view === 'vCode' ? 'FLO staff sign in' : 'Customer sign in';
  sw.dataset.to = view === 'vEmail' || view === 'vCode' ? 'vStaff' : 'vEmail';
}

function msg(kind, text) {
  $('lErr').classList.toggle('on', kind === 'err');
  $('lInfo').classList.toggle('on', kind === 'info');
  if (kind === 'err') $('lErr').textContent = text;
  if (kind === 'info') $('lInfo').textContent = text;
}
const clearMsg = () => msg(null);

async function withBusy(form, fn) {
  const btn = form.querySelector('button[type="submit"]');
  if (btn.classList.contains('busy')) return;
  btn.classList.add('busy');
  try { await fn(); } finally { btn.classList.remove('busy'); }
}

const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const isNetworkError = e => e && (e.name === 'AuthRetryableFetchError' || e.status === 0);

// ---------------------------------------------------------------------------
// Customer: email code
// ---------------------------------------------------------------------------

async function requestCode(email) {
  // Unknown emails return an error from Supabase (sign-ups are off). We ignore
  // it on purpose so the screen never reveals who is a customer.
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (isNetworkError(error)) throw error;
}

function startResendCooldown() {
  const b = $('bResend');
  let left = COOLDOWN_SECONDS;
  clearInterval(resendTimer);
  b.disabled = true;
  b.textContent = `Resend code (${left}s)`;
  resendTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(resendTimer);
      b.disabled = false;
      b.textContent = 'Resend code';
    } else {
      b.textContent = `Resend code (${left}s)`;
    }
  }, 1000);
}

const otpBoxes = () => [...document.querySelectorAll('#otp input')];
const otpValue = () => otpBoxes().map(b => b.value).join('');
function clearOtp() { otpBoxes().forEach(b => { b.value = ''; }); }

function wireOtp() {
  const boxes = otpBoxes();
  const fill = (digits, start) => {
    for (let k = 0; k < digits.length && start + k < boxes.length; k++) boxes[start + k].value = digits[k];
    boxes[Math.min(start + digits.length, boxes.length - 1)].focus();
  };
  const maybeSubmit = () => { if (/^\d{6}$/.test(otpValue())) $('fCode').requestSubmit(); };
  boxes.forEach((b, i) => {
    b.addEventListener('input', () => {
      const d = b.value.replace(/\D/g, '');
      if (d.length > 1) { fill(d, i); } else { b.value = d; if (d && i < boxes.length - 1) boxes[i + 1].focus(); }
      maybeSubmit();
    });
    b.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !b.value && i > 0) { e.preventDefault(); boxes[i - 1].value = ''; boxes[i - 1].focus(); }
      if (e.key === 'ArrowLeft' && i > 0) boxes[i - 1].focus();
      if (e.key === 'ArrowRight' && i < boxes.length - 1) boxes[i + 1].focus();
    });
    b.addEventListener('paste', e => {
      const d = (e.clipboardData.getData('text') || '').replace(/\D/g, '');
      if (!d) return;
      e.preventDefault();
      fill(d, i);
      maybeSubmit();
    });
    b.addEventListener('focus', () => b.select());
  });
}

// ---------------------------------------------------------------------------
// Session -> profile -> app
// ---------------------------------------------------------------------------

async function handleSession(session) {
  if (!session) return;
  if (needPassword) { showNewPassword(); return; }
  if (currentUserId === session.user.id) return;
  currentUserId = session.user.id;

  let profile = null, project = null;
  try {
    profile = await loadProfile(session.user.id);
    if (profile && profile.active && profile.project_id) project = await loadProject(profile.project_id);
  } catch (e) {
    console.error(e);
  }

  if (!profile || !profile.active || (profile.role !== 'admin' && !project)) {
    currentUserId = null;
    await supabase.auth.signOut({ scope: 'local' });
    show(profile && profile.role === 'admin' ? 'vStaff' : 'vEmail');
    msg('err', INACTIVE);
    return;
  }

  clearMsg();
  hooks.onSignedIn({
    id: profile.user_id,
    name: profile.full_name || profile.email,
    email: profile.email,
    role: profile.role,
    project_id: profile.project_id
  }, project);
}

function showNewPassword() {
  $('lNewPwTitle').textContent = isInvite ? 'Set your password' : 'Set a new password';
  show('vNewPw');
  $('nP').focus();
}

function resetLoginUi() {
  clearMsg();
  clearOtp();
  ['lE', 'sE', 'sP', 'fE', 'nP', 'nP2'].forEach(id => { $(id).value = ''; });
  show('vEmail');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) await supabase.auth.signOut({ scope: 'local' });
}

export function initAuth(h) {
  hooks = h;
  wireOtp();

  $('bModeSwitch').addEventListener('click', e => { clearMsg(); show(e.currentTarget.dataset.to || 'vStaff'); });
  $('bOtherEmail').addEventListener('click', () => { clearMsg(); clearOtp(); show('vEmail'); $('lE').focus(); });
  $('bForgot').addEventListener('click', () => { clearMsg(); $('fE').value = $('sE').value; show('vForgot'); });
  $('bBackStaff').addEventListener('click', () => { clearMsg(); show('vStaff'); });

  $('fEmail').addEventListener('submit', e => {
    e.preventDefault();
    const email = $('lE').value.trim().toLowerCase();
    if (!validEmail(email)) { msg('err', 'Enter a valid email address.'); return; }
    withBusy(e.target, async () => {
      try { await requestCode(email); } catch { msg('err', NETWORK); return; }
      otpEmail = email;
      $('lCodeEmail').textContent = email;
      clearOtp();
      show('vCode');
      msg('info', NEUTRAL_OTP);
      startResendCooldown();
      otpBoxes()[0].focus();
    });
  });

  $('bResend').addEventListener('click', async () => {
    if (!otpEmail) return;
    startResendCooldown();
    try { await requestCode(otpEmail); } catch { msg('err', NETWORK); return; }
    clearOtp();
    msg('info', NEUTRAL_OTP);
    otpBoxes()[0].focus();
  });

  $('fCode').addEventListener('submit', e => {
    e.preventDefault();
    const token = otpValue();
    if (!/^\d{6}$/.test(token)) { msg('err', 'Enter the 6-digit code from your email.'); return; }
    withBusy(e.target, async () => {
      const { data, error } = await supabase.auth.verifyOtp({ email: otpEmail, token, type: 'email' });
      if (error) {
        msg('err', isNetworkError(error) ? NETWORK : 'That code is not valid or has expired. Check it or request a new one.');
        clearOtp();
        otpBoxes()[0].focus();
        return;
      }
      await handleSession(data.session);
    });
  });

  $('fStaff').addEventListener('submit', e => {
    e.preventDefault();
    const email = $('sE').value.trim().toLowerCase(), password = $('sP').value;
    if (!validEmail(email) || !password) { msg('err', 'Enter your email and password.'); return; }
    withBusy(e.target, async () => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        msg('err', isNetworkError(error) ? NETWORK : /banned/i.test(error.message) ? INACTIVE : 'Incorrect email or password.');
        return;
      }
      $('sP').value = '';
      await handleSession(data.session);
    });
  });

  $('fForgot').addEventListener('submit', e => {
    e.preventDefault();
    const email = $('fE').value.trim().toLowerCase();
    if (!validEmail(email)) { msg('err', 'Enter a valid email address.'); return; }
    withBusy(e.target, async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/` });
      if (isNetworkError(error)) { msg('err', NETWORK); return; }
      msg('info', NEUTRAL_RESET);
    });
  });

  $('fNewPw').addEventListener('submit', e => {
    e.preventDefault();
    const p1 = $('nP').value, p2 = $('nP2').value;
    if (p1.length < 10) { msg('err', 'Use at least 10 characters.'); return; }
    if (p1 !== p2) { msg('err', "The two passwords don't match."); return; }
    withBusy(e.target, async () => {
      const { error } = await supabase.auth.updateUser({ password: p1 });
      if (error) { msg('err', error.message || 'Could not save the password. Try again.'); return; }
      needPassword = false;
      $('nP').value = $('nP2').value = '';
      const { data: { session } } = await supabase.auth.getSession();
      await handleSession(session);
    });
  });

  if (!configured) {
    document.body.classList.remove('booting');
    msg('err', 'Sign-in is not set up yet. Add SUPABASE_URL and SUPABASE_ANON_KEY in Netlify and redeploy.');
    document.querySelectorAll('.lcard button').forEach(b => { b.disabled = true; });
    return;
  }

  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  if (linkError) { show('vStaff'); msg('err', 'That link is invalid or has expired. Request a new one.'); }

  const booted = () => document.body.classList.remove('booting');
  setTimeout(booted, 4000);

  supabase.auth.onAuthStateChange((event, session) => {
    // Never await Supabase calls inside this callback; defer instead.
    if (event === 'PASSWORD_RECOVERY') needPassword = true;
    if (event === 'SIGNED_OUT') {
      setTimeout(() => {
        const wasIn = currentUserId !== null;
        currentUserId = null;
        if (wasIn) { resetLoginUi(); hooks.onSignedOut(); }
      }, 0);
      return;
    }
    if (event === 'INITIAL_SESSION') {
      setTimeout(async () => {
        if (session) {
          await handleSession(session);
        } else if (needPassword) {
          needPassword = false;
          show('vStaff');
          msg('err', 'That link is invalid or has expired. Request a new one.');
        }
        booted();
      }, 0);
      return;
    }
    if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && session) {
      setTimeout(() => handleSession(session), 0);
    }
  });
}
