// site/js/auth.js
// Shared auth helpers for Mayorcity B&F AI, built on Supabase Auth.
//
// Students sign in with NAME + MATRIC NUMBER + PASSWORD. Supabase Auth requires an
// email internally, so each matric number is mapped to a private, never-shown
// "<matric>@mayorcity.local" address — students never see or type this.
//
// Matric number rule: 9 digits total, with "812" or "813" as the middle three digits.
// Examples that PASS:  230812122, 240812001, 250812421, 260812412
// Examples that FAIL:  230811122 (wrong middle), 23081212 (too short)
const MATRIC_REGEX = /^\d{3}(812|813)\d{3}$/;

function isValidMatric(matric) {
  return MATRIC_REGEX.test(String(matric || "").trim());
}

function matricToEmail(matric) {
  return `${String(matric).trim().toLowerCase()}@mayorcity.local`;
}

// Friendlier error text for the handful of cases students will actually hit.
function friendlyAuthError(err, context) {
  const msg = (err && err.message) || "";
  if (/already registered|already exists/i.test(msg)) {
    return "That matric number is already registered. Try logging in instead.";
  }
  if (/duplicate key value/i.test(msg) && /matric_number/i.test(msg)) {
    return "That matric number is already registered. Try logging in instead.";
  }
  if (/invalid login credentials/i.test(msg)) {
    return "Matric number or password is incorrect.";
  }
  if (/password/i.test(msg) && /(at least|6 characters|weak)/i.test(msg)) {
    return "Password must be at least 6 characters.";
  }
  if (/network|fetch/i.test(msg)) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return msg || `Something went wrong while ${context}. Please try again.`;
}

// ---------- Sign up ----------
// Creates the Supabase Auth user, then creates their profiles row (name + matric).
// If the profile insert fails after the auth user was created (e.g. duplicate matric
// slipped past a race condition), we still surface a clear error to the student.
async function signUpStudent(name, matric, password) {
  const cleanName = String(name || "").trim();
  const cleanMatric = String(matric || "").trim();

  if (!cleanName) return { error: "Please enter your name." };
  if (!isValidMatric(cleanMatric)) {
    return { error: "That matric number doesn't look right. Please double check it." };
  }
  if (!password || password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  const email = matricToEmail(cleanMatric);

  const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
    email,
    password
  });
  if (signUpError) return { error: friendlyAuthError(signUpError, "signing up") };

  const user = signUpData && signUpData.user;
  if (!user) {
    return { error: "Sign-up didn't complete. Please try again." };
  }

  const { error: profileError } = await supabaseClient
    .from("profiles")
    .insert({ id: user.id, name: cleanName, matric_number: cleanMatric });

  if (profileError) {
    return { error: friendlyAuthError(profileError, "finishing sign-up") };
  }

  return { data: { user } };
}

// ---------- Sign in ----------
async function signInStudent(matric, password) {
  const cleanMatric = String(matric || "").trim();
  if (!isValidMatric(cleanMatric)) {
    return { error: "That matric number doesn't look right. Please double check it." };
  }
  if (!password) return { error: "Please enter your password." };

  const email = matricToEmail(cleanMatric);
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return { error: friendlyAuthError(error, "logging in") };
  return { data };
}

// ---------- Sign out ----------
async function signOutStudent() {
  await supabaseClient.auth.signOut();
}

// ---------- Session helpers ----------
async function getCurrentSession() {
  const { data } = await supabaseClient.auth.getSession();
  return data && data.session;
}

async function getCurrentProfile() {
  const session = await getCurrentSession();
  if (!session) return null;
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("name, matric_number")
    .eq("id", session.user.id)
    .single();
  if (error) return null;
  return data;
}

// Call on the chat page (index.html): redirects to welcome.html if not logged in.
async function requireSession() {
  const session = await getCurrentSession();
  if (!session) {
    window.location.replace("welcome.html");
    return null;
  }
  return session;
}

// Call on login.html / signup.html: bounce straight to the app if already logged in.
async function redirectIfLoggedIn() {
  const session = await getCurrentSession();
  if (session) {
    window.location.replace("index.html");
  }
}
