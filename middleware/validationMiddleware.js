const { validationResult } = require('express-validator');

const validateRequest = (req, res, next) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) {
        next();
        return;
    }

    const firstError = errors.array({ onlyFirstError: true })[0];
    res.status(400).json({
        message: firstError?.msg || 'Input tidak valid.',
    });
};

module.exports = validateRequest;
