import { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult, ValidationError } from 'express-validator';

// Validation rules for creating a poll
export const validateCreatePoll = [
  body('title')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Title must be between 5 and 200 characters'),
  
  body('subject')
    .isIn(['combined-maths', 'physics', 'chemistry'])
    .withMessage('Invalid subject selected'),
  
  body('chapter')
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('Chapter must be between 3 and 200 characters'),
  
  body('description')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  
  body('preferredDate')
    .isISO8601()
    .withMessage('Invalid date format')
    .custom((value) => {
      const date = new Date(value);
      const now = new Date();
      if (date <= now) {
        throw new Error('Preferred date must be in the future');
      }
      return true;
    }),
  
  body('timeSlot')
    .isIn(['morning', 'afternoon', 'evening'])
    .withMessage('Invalid time slot selected'),
  
  body('maxStudents')
    .isInt({ min: 5, max: 50 })
    .withMessage('Max students must be between 5 and 50'),
];

// Validation rules for poll ID parameter
export const validatePollId = [
  param('id')
    .isMongoId()
    .withMessage('Invalid poll ID format'),
];

// Validation rules for filtering polls
export const validatePollFilters = [
  query('subject')
    .optional()
    .isIn(['all', 'combined-maths', 'physics', 'chemistry'])
    .withMessage('Invalid subject filter'),
  
  query('status')
    .optional()
    .isIn(['all', 'active', 'completed', 'scheduled'])
    .withMessage('Invalid status filter'),
  
  query('date')
    .optional()
    .isIn(['all', 'today', 'week', 'month'])
    .withMessage('Invalid date filter'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
];

// Validation rules for search
export const validateSearch = [
  query('q')
    .isLength({ min: 2, max: 100 })
    .withMessage('Search query must be between 2 and 100 characters'),
  
  query('subject')
    .optional()
    .isIn(['all', 'combined-maths', 'physics', 'chemistry'])
    .withMessage('Invalid subject filter'),

  query('status')
    .optional()
    .isIn(['all', 'active', 'completed', 'scheduled'])
    .withMessage('Invalid status filter'),
];

// Validation rules for updating poll status
export const validateUpdatePollStatus = [
  param('id')
    .isMongoId()
    .withMessage('Invalid poll ID format'),
  body('status')
    .isIn(['active', 'completed', 'scheduled'])
    .withMessage('Invalid status value'),
  body('scheduledDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid date format'),
  body('tutor')
    .optional()
    .isMongoId()
    .withMessage('Invalid tutor ID format'),
];

// Middleware to handle validation errors
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map((error: any) => ({
        field: error.param,
        message: error.msg,
        value: error.value || null
      }))
    });
  }
  
  next();
};

// Custom validation for checking if poll exists and is accessible
export const validatePollAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const Poll = require('../models/Poll').default;
    const pollId = req.params.id;
    
    const poll = await Poll.findById(pollId);
    
    if (!poll) {
      return res.status(404).json({
        success: false,
        message: 'Poll not found'
      });
    }
    
    (req as any).poll = poll;
    next();
    
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Error validating poll access',
      error: error.message
    });
  }
};

// Validation for vote-related operations
export const validateVoteOperation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid poll ID format'),
];

// Custom middleware to check if user can vote on poll
export const canUserVote = async (req: any, res: Response, next: NextFunction) => {
  try {
    // FOR LOCALHOST TESTING: Skip vote validation
    // Uncomment when deploying with authentication
    /*
    const poll = req.poll;
    const userId = req.user.id;
    
    if (poll.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'This poll is no longer active for voting'
      });
    }
    
    const hasVoted = poll.votes.some((vote: any) => vote.toString() === userId);
    if (hasVoted) {
      return res.status(400).json({
        success: false,
        message: 'You have already voted on this poll'
      });
    }
    */
    
    next();
    
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Error checking vote eligibility',
      error: error.message
    });
  }
};

// Custom middleware to check if user can remove vote
export const canUserRemoveVote = async (req: any, res: Response, next: NextFunction) => {
  try {
    // FOR LOCALHOST TESTING: Skip vote removal validation
    // Uncomment when deploying with authentication
    /*
    const poll = req.poll;
    const userId = req.user.id;
    
    if (poll.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove vote from a non-active poll'
      });
    }
    
    const hasVoted = poll.votes.some((vote: any) => vote.toString() === userId);
    if (!hasVoted) {
      return res.status(400).json({
        success: false,
        message: 'You have not voted on this poll'
      });
    }
    */
    
    next();
    
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Error checking vote removal eligibility',
      error: error.message
    });
  }
};

// Custom middleware to check if user is poll creator
export const isPollCreator = async (req: any, res: Response, next: NextFunction) => {
  try {
    // FOR LOCALHOST TESTING: Skip creator validation
    // Uncomment when deploying with authentication
    /*
    const poll = req.poll;
    const userId = req.user.id;
    
    if (poll.creator.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to perform this action on this poll'
      });
    }
    */
    
    next();
    
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Error checking poll ownership',
      error: error.message
    });
  }
};

// Custom middleware to check if user is admin or tutor
export const isAdminOrTutor = async (req: any, res: Response, next: NextFunction) => {
  try {
    // FOR LOCALHOST TESTING: Skip role validation
    // Uncomment when deploying with authentication
    /*
    const user = req.user;
    
    if (!user.role || !['admin', 'tutor'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to perform this action'
      });
    }
    */
    
    next();
    
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Error checking user role',
      error: error.message
    });
  }
};