import jwt from 'jsonwebtoken';

export const auth = (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) return res.status(401).json({ message: 'No token, authorization denied' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    req.userId = decoded.id; // backward compatibility for routes using req.userId
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};
