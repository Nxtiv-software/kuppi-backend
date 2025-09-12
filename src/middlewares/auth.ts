import { Request, Response, NextFunction } from "express";
import User from "../models/user";

const dotenv = require("dotenv");
dotenv.config();
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;

interface JwtPayload {
  _id: string;
  email: string;
}

export interface AuthRequest extends Request {
  user: {
    id: string;
    _id: string;
    name: string;
    email: string;
    password: string;
  };
}

async function authenticateUser(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // FOR LOCALHOST TESTING: Skip authentication and use mock user
    // Comment out this block when deploying with authentication
    const mockUser = {
      _id: '507f1f77bcf86cd799439011', // Valid ObjectId format
      id: '507f1f77bcf86cd799439011',
      name: 'Test User',
      email: 'test@example.com',
      password: 'hashed-password'
    };
    (req as any).user = mockUser;
    console.log("Skipping authentication for localhost testing");
    next();
    return;
    
    // AUTHENTICATION: Uncomment below code when deploying with authentication
    /*
    const authHeader = req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer")) {
      return res.status(401).json({ 
        error: "Authorization header missing or invalid format",
        message: "Please provide a valid Bearer token"
      });
    }

    const token = authHeader?.split(" ")[1];
    
    if (!token) {
      return res.status(401).json({ 
        error: "Token not provided",
        message: "Authorization token is required"
      });
    }

    try {
      const decodedInfo = jwt.verify(token, JWT_SECRET as string) as JwtPayload;
      
      const user = await User.findById(decodedInfo._id);
      console.log("Authenticated user:", user?.name || user?.email);

      if (!user) {
        return res.status(401).json({ 
          error: "User not found",
          message: "The user associated with this token no longer exists"
        });
      }

      (req as any).user = user;
      next();
      
    } catch (jwtError: any) {
      if (jwtError.name === 'TokenExpiredError') {
        console.log('Token expired at:', jwtError.expiredAt);
        return res.status(401).json({ 
          error: "Token expired",
          expiredAt: jwtError.expiredAt,
          message: "Your session has expired. Please login again to continue.",
          code: "TOKEN_EXPIRED"
        });
      } else if (jwtError.name === 'JsonWebTokenError') {
        console.log('Invalid token:', jwtError.message);
        return res.status(401).json({ 
          error: "Invalid token",
          message: "The provided token is invalid. Please login again.",
          code: "TOKEN_INVALID"
        });
      } else if (jwtError.name === 'NotBeforeError') {
        return res.status(401).json({ 
          error: "Token not active",
          message: "Token is not active yet",
          code: "TOKEN_NOT_ACTIVE"
        });
      } else {
        console.error('JWT verification error:', jwtError);
        return res.status(401).json({ 
          error: "Token verification failed",
          message: "Unable to verify token. Please login again.",
          code: "TOKEN_VERIFICATION_FAILED"
        });
      }
    }
    */
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({ 
      error: "Internal server error during authentication",
      message: "Something went wrong while verifying your credentials"
    });
  }
}

// Create an alias for backward compatibility with poll files
const authenticateToken = authenticateUser;

// Export both the original function and the alias
export default authenticateUser;
export { authenticateToken };