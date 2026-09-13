const requireRole = (allowedRole) => {
  return (req, res, next) => {
    const userRole = (req.student && req.student.role)
      || (req.user && req.user.role)
      || (req.college && req.college.role);

    if (!userRole) {
      return res.status(403).json({
        status: 'error',
        message: 'Forbidden: Access denied'
      });
    }

    const roles = Array.isArray(allowedRole) ? allowedRole : [allowedRole];

    if (!roles.includes(userRole)) {
      return res.status(403).json({
        status: 'error',
        message: 'Forbidden: Access denied'
      });
    }

    next();
  };
};

module.exports = requireRole;
