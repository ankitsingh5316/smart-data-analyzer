const { isStrongPassword } = require('../utils/passwords');

function field(fieldName, message) {
  return { field: fieldName, message };
}

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validateSignup(body) {
  const errors = [];
  const name = String(body.name || '').trim();
  const email = cleanEmail(body.email);
  const password = String(body.password || '');
  if (name.length < 2 || name.length > 120) {
    errors.push(field('name', 'Name must be between 2 and 120 characters.'));
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    errors.push(field('email', 'Enter a valid email address.'));
  }
  if (!isStrongPassword(password)) {
    errors.push(field('password', 'Use at least 8 characters with a letter and a number.'));
  }
  return { errors, value: { name, email, password } };
}

function validateVerifyOtp(body) {
  const errors = [];
  const email = cleanEmail(body.email);
  const otp = String(body.otp || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push(field('email', 'Enter a valid email address.'));
  }
  if (!/^\d{6}$/.test(otp)) {
    errors.push(field('otp', 'Enter the 6-digit code.'));
  }
  return { errors, value: { email, otp } };
}

function validateLogin(body) {
  const errors = [];
  const email = cleanEmail(body.email);
  const password = String(body.password || '');
  if (!email) errors.push(field('email', 'Enter your email address.'));
  if (!password) errors.push(field('password', 'Enter your password.'));
  return { errors, value: { email, password } };
}

function validateForgot(body) {
  const errors = [];
  const email = cleanEmail(body.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push(field('email', 'Enter the email on your account.'));
  }
  return { errors, value: { email } };
}

function validateReset(body) {
  const errors = [];
  const email = cleanEmail(body.email);
  const token = String(body.token || '').trim();
  const password = String(body.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push(field('email', 'Enter the email on your account.'));
  }
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    errors.push(field('token', 'This reset link is invalid.'));
  }
  if (!isStrongPassword(password)) {
    errors.push(field('password', 'Use at least 8 characters with a letter and a number.'));
  }
  return { errors, value: { email, token, password } };
}

function validateProfile(body) {
  const errors = [];
  const name = String(body.name || '').trim();
  const email = cleanEmail(body.email);
  if (name.length < 2 || name.length > 120) {
    errors.push(field('name', 'Name must be between 2 and 120 characters.'));
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    errors.push(field('email', 'Enter a valid email address.'));
  }
  return { errors, value: { name, email } };
}

function validatePasswordChange(body) {
  const errors = [];
  const currentPassword = String(body.currentPassword || '');
  const newPassword = String(body.newPassword || '');
  if (!currentPassword) errors.push(field('currentPassword', 'Enter your current password.'));
  if (!isStrongPassword(newPassword)) {
    errors.push(field('newPassword', 'Use at least 8 characters with a letter and a number.'));
  }
  if (currentPassword && currentPassword === newPassword) {
    errors.push(field('newPassword', 'Choose a password that is different from the current one.'));
  }
  return { errors, value: { currentPassword, newPassword } };
}

function validatePreferences(body) {
  const errors = [];
  const pageSize = Number(body.defaultPageSize);
  if (![10, 25, 50, 100].includes(pageSize)) {
    errors.push(field('defaultPageSize', 'Choose a page size of 10, 25, 50, or 100.'));
  }
  return {
    errors,
    value: {
      defaultPageSize: pageSize,
      trimWhitespace: Boolean(body.trimWhitespace),
      treatEmptyAsNull: Boolean(body.treatEmptyAsNull)
    }
  };
}

module.exports = {
  validateSignup,
  validateVerifyOtp,
  validateLogin,
  validateForgot,
  validateReset,
  validateProfile,
  validatePasswordChange,
  validatePreferences
};
