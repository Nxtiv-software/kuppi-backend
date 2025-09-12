import express, { Request, Response } from 'express';
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;

const refreshRouter = express.Router();

// Add this to your .env file: JWT_REFRESH_SECRET=your_refresh_secret_here_different_from_jwt_secret
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET + "_refresh";

// Refresh token endpoint
refreshRouter.post('/refresh-token', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({ 
        error: 'Refresh token required',
        message: 'Please provide a refresh token'
      });
    }

    try {
      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as any;
      
      // Generate new access token
      const newAccessToken = jwt.sign(
        { _id: decoded._id, email: decoded.email },
        JWT_SECRET,
        { expiresIn: '1h' } // 1 hour expiration
      );

      // Optionally generate new refresh token
      const newRefreshToken = jwt.sign(
        { _id: decoded._id, email: decoded.email },
        JWT_REFRESH_SECRET,
        { expiresIn: '7d' } // 7 days expiration
      );

      res.json({ 
        success: true,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        message: 'Token refreshed successfully'
      });
    } catch (jwtError: any) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          error: 'Refresh token expired',
          message: 'Your session has completely expired. Please login again.',
          code: 'REFRESH_TOKEN_EXPIRED'
        });
      } else {
        return res.status(401).json({ 
          error: 'Invalid refresh token',
          message: 'The refresh token is invalid. Please login again.',
          code: 'REFRESH_TOKEN_INVALID'
        });
      }
    }
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ 
      error: 'Failed to refresh token',
      message: 'Something went wrong while refreshing your token'
    });
  }
});

export default refreshRouter;