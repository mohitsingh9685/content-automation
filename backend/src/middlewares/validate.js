function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body || {});
    if (!result.success) {
      const err = new Error('Invalid request body payload');
      err.statusCode = 400;
      err.details = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      return next(err);
    }
    req.validatedBody = result.data;
    return next();
  };
}

function validateIdParam(paramName = 'id') {
  return (req, res, next) => {
    const raw = req.params[paramName];
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      const err = new Error(`Invalid numeric parameter '${paramName}': ${raw}`);
      err.statusCode = 400;
      return next(err);
    }
    req.numericId = parsed;
    return next();
  };
}

module.exports = {
  validateBody,
  validateIdParam,
};
