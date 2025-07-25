// const jwt = require('jsonwebtoken');
// const JWT_SECRETe= process.env.JWT_SECRET

// exports.verifyToken = (req, res, next) => {
//   const authHeader = req.headers.authorization;
//   if (!authHeader || !authHeader.startsWith('Bearer '))
//     return res.status(401).json({ message: 'Unauthorized' });

//   const token = authHeader.split(' ')[1];
//   try {
//     const decoded = jwt.verify(token, JWT_SECRETe);
//     req.user = decoded
    
//     req.user = {
//   userId: decoded.id,
//   email: decoded.email,
//   role: decoded.role,  
//   // role:decoded.role ,// or type if you're using 'type' in the token

//   code: porter.farmer_code || porter.porter_.id
// }

//     next();
//   } catch (err) {
//     console.error(err);
//     res.status(403).json({ message: 'Invalid token' });
//   }
// }

const jwt = require('jsonwebtoken');

exports.verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Contains { id, email, role }
    next();
  } catch (err) {
    res.status(403).json({ message: 'Invalid token', error: err.message });
  }
};

exports.authorizeRoles=(...allowedRoles)=>{
    return(req,res,next)=>{
        if(!req.user|| !allowedRoles.includes(req.user.role)){
            return res.status(403).json({message:"Access denied: Insuficient Permissions"})
        }
        next()
    }
}


