const requireRole = (allowedRole) => {
  return (req, res, next) => {
    const roles = Array.isArray(allowedRole) ? allowedRole : [allowedRole];

    if (!req.college || !roles.includes(req.college.role)) {
      return res.status(403).json({
        status: 'error',
        message: 'Forbidden: Access denied'
      });
    }

    next();
  };
};

module.exports = requireRole;
