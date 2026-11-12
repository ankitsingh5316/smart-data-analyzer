const { AppError } = require('../utils/AppError');

function validateBody(parser) {
  return (req, res, next) => {
    const { errors, value } = parser(req.body || {});
    if (errors.length) {
      next(new AppError('Please correct the highlighted fields.', 400, errors));
      return;
    }
    req.body = value;
    next();
  };
}

module.exports = { validateBody };
