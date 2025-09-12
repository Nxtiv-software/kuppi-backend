import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Extend Request interface to include auth property
export interface AuthenticatedRequest extends Request {
  auth: {
    userId: string;
  };
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Reduced logging for frequent calls
    const now = Date.now();
    const logKey = `auth_log_${req.path}`;
    const lastLog = (global as any)[logKey] || 0;
    
    const shouldLog = now - lastLog > 60000; // Only log every minute per endpoint
    
    if (shouldLog) {
      console.log('🔐 Auth middleware called for:', req.method, req.path);
      console.log('🔐 Authorization header:', req.headers.authorization ? 'Present' : 'Missing');
      (global as any)[logKey] = now;
    }
    
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ No valid auth header found');
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const token = authHeader.split(' ')[1];
    
    if (shouldLog) {
      console.log('🎫 Token found, length:', token.length);
      console.log('🎫 Token preview:', token.substring(0, 50) + '...');
    }
    
    // Decode JWT token without verification to get user ID
    // Clerk JWTs have the user ID in the 'sub' field
    try {
      const decoded = jwt.decode(token) as any;
      
      if (shouldLog) {
        console.log('🔍 Decoded token:', JSON.stringify(decoded, null, 2));
      }
      
      if (!decoded) {
        console.log('❌ Token could not be decoded');
        return res.status(401).json({
          success: false,
          message: 'Invalid token format'
        });
      }

      // Clerk tokens have the user ID in the 'sub' field
      const userId = decoded.sub;
      if (!userId) {
        console.log('❌ No user ID found in token. Available fields:', Object.keys(decoded));
        return res.status(401).json({
          success: false,
          message: 'Invalid token - no user ID'
        });
      }

      if (shouldLog) {
        console.log('✅ Authenticated user:', userId);
      }

      // Add user info to request
      (req as AuthenticatedRequest).auth = {
        userId: userId
      };

      next();
    } catch (decodeError) {
      console.error('❌ JWT decode error:', decodeError);
      return res.status(401).json({
        success: false,
        message: 'Invalid token format'
      });
    }
  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};
