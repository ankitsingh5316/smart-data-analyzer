const authService = require('../services/authService');

async function signup(req, res) {
  const data = await authService.requestSignupOtp(req.body);
  const message = data.delivered
    ? 'We emailed a 6-digit code. Enter it to finish creating the account.'
    : 'Enter the 6-digit code to finish creating the account.';
  res.status(202).json({ success: true, message, data });
}

async function verifySignup(req, res) {
  const data = await authService.verifySignupOtp(req.body);
  res.status(201).json({ success: true, message: 'Account created.', data });
}

async function login(req, res) {
  const data = await authService.login(req.body);
  res.json({ success: true, message: 'Signed in.', data });
}

async function me(req, res) {
  const data = await authService.getProfile(req.user.id);
  res.json({ success: true, message: 'Profile loaded.', data });
}

async function updateProfile(req, res) {
  const data = await authService.updateProfile(req.user.id, req.body);
  res.json({ success: true, message: 'Profile updated.', data });
}

async function changePassword(req, res) {
  await authService.changePassword(req.user.id, req.body);
  res.json({ success: true, message: 'Password updated.' });
}

async function updatePreferences(req, res) {
  const data = await authService.updatePreferences(req.user.id, req.body);
  res.json({ success: true, message: 'Preferences saved.', data });
}

async function forgotPassword(req, res) {
  const data = await authService.forgotPassword(req.body);
  res.json({
    success: true,
    message: 'If that email has an account, a reset link is ready.',
    data
  });
}

async function resetPassword(req, res) {
  await authService.resetPassword(req.body);
  res.json({ success: true, message: 'Password reset. You can sign in with the new password.' });
}

module.exports = {
  signup,
  verifySignup,
  login,
  me,
  updateProfile,
  changePassword,
  updatePreferences,
  forgotPassword,
  resetPassword
};
