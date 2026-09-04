/**
 * Role Authorization Middleware Factory
 * Takes a role string (or array of roles) and rejects the request with 403
 * if req.college.role doesn't match.
 * 
 * @param {string|string[]} allowedRole - The required role string or array of allowed roles
 * @returns {Function} Express middleware handler
 */
const requireRole = (allowedRole) => {
  return (req, res, next) => {
    if (!req.college || !req.college.role) {
      return res.status(403).json({
        status: 'error',
        message: 'Forbidden: Access denied'
      });
    }

    const roles = Array.isArray(allowedRole) ? allowedRole : [allowedRole];

    if (!roles.includes(req.college.role)) {
      return res.status(403).json({
        status: 'error',
        message: 'Forbidden: Access denied'
      });
    }

    next();
  };
};

module.exports = requireRole;
