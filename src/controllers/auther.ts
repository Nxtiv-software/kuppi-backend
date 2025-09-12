const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
import { Request, Response } from "express";
import User from "../models/user";
import { ObjectId } from "mongodb";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET + "_refresh";

// Create access token (short-lived)
function createAccessToken(userId: ObjectId, email: string): string {
  const token = jwt.sign(
    { 
      _id: userId.toString(), // Keep _id for compatibility with your auth middleware
      email,
      iat: Math.floor(Date.now() / 1000), // Issued at time
      type: 'access'
    }, 
    JWT_SECRET, 
    {
      expiresIn: '1h', // 1 hour
    }
  );
  
  // Debug: Decode and log token info
  const decoded = jwt.decode(token);
  console.log('Access token created:', {
    email,
    issuedAt: new Date(decoded.iat * 1000).toISOString(),
    expiresAt: new Date(decoded.exp * 1000).toISOString(),
    validFor: '1 hour'
  });
  
  return token;
}

// Create refresh token (long-lived)
function createRefreshToken(userId: ObjectId, email: string): string {
  const token = jwt.sign(
    { 
      _id: userId.toString(),
      email,
      iat: Math.floor(Date.now() / 1000),
      type: 'refresh'
    }, 
    JWT_REFRESH_SECRET, 
    {
      expiresIn: '7d', // 7 days
    }
  );
  
  // Debug: Decode and log token info
  const decoded = jwt.decode(token);
  console.log('Refresh token created:', {
    email,
    issuedAt: new Date(decoded.iat * 1000).toISOString(),
    expiresAt: new Date(decoded.exp * 1000).toISOString(),
    validFor: '7 days'
  });
  
  return token;
}

export async function addUser(req: Request, res: Response) {
  const { name, email, password } = req.body;
  console.log('Received registration request for:', email);

  try {
    const checkExistingUser = await User.findOne({ email });

    if (checkExistingUser) {
      return res.status(400).json({ 
        success: false,
        message: 'User already exists with this email address' 
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({ name, email, password: hashedPassword });
    console.log('User created successfully:', user._id, user.name);

    // Generate both tokens
    console.log('Creating tokens for new user at:', new Date().toISOString());
    const accessToken = createAccessToken(user._id, user.email);
    const refreshToken = createRefreshToken(user._id, user.email);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: { 
        id: user._id.toString(), 
        name: user.name, 
        email: user.email 
      },
      accessToken,
      refreshToken,
      // Keep 'token' for backward compatibility
      token: accessToken
    });
  } catch (err: any) {
    console.error('Registration Error:', err.message);
    res.status(400).json({ 
      success: false,
      message: 'Failed to create user account', 
      error: err.message 
    });
  }
}

export async function userLogin(req: Request, res: Response) {
  const { email, password } = req.body;
  console.log('Login attempt for:', email, 'at:', new Date().toISOString());

  try {
    const user = await User.findOne({ email });

    if (!user) {
      console.log('Login failed: User not found -', email);
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      console.log('Login failed: Invalid password -', email);
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    // Generate both tokens
    console.log('Creating fresh tokens for login at:', new Date().toISOString());
    const accessToken = createAccessToken(user._id, user.email);
    const refreshToken = createRefreshToken(user._id, user.email);

    console.log('Login successful for:', email);

    res.json({
      success: true,
      message: 'Login successful',
      user: { 
        id: user._id.toString(), 
        name: user.name, 
        email: user.email 
      },
      accessToken,
      refreshToken,
      // Keep 'token' for backward compatibility
      token: accessToken
    });
  } catch (err: any) {
    console.error('Login error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Login failed due to server error', 
      error: err.message 
    });
  }
}

// Optional: Add a logout function to handle token invalidation
export async function userLogout(req: Request, res: Response) {
  try {
    // Log the logout attempt
    const authHeader = req.header("Authorization");
    const token = authHeader?.split(" ")[1];
    
    if (token) {
      try {
        const decoded = jwt.decode(token);
        console.log('Logout request from:', decoded?.email, 'at:', new Date().toISOString());
      } catch (e) {
        console.log('Logout request with invalid token at:', new Date().toISOString());
      }
    }
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (err: any) {
    console.error('Logout error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Logout failed', 
      error: err.message 
    });
  }
}