import express, { Request, Response } from 'express';
import PollController from '../controllers/pollController';
import { 
  validateCreatePoll, 
  validatePollId, 
  validatePollFilters,
  validateSearch,
  validateUpdatePollStatus,
  validateVoteOperation,
  handleValidationErrors,
  validatePollAccess,
  canUserVote,
  canUserRemoveVote
} from '../middlewares/pollValidation';
import { AuthRequest } from '../middlewares/auth'; 
import authenticateUser from '../middlewares/auth';

const router = express.Router();

// AUTHENTICATION: Apply authentication middleware to all routes
// Uncomment when deploying with authentication
// router.use(authenticateUser);

// FOR LOCALHOST TESTING: Skip authentication middleware
// Comment out this line when deploying
router.use((req, res, next) => {
  console.log('Skipping authentication for localhost testing');
  next();
});

// @route   POST /api/polls
// @desc    Create a new poll
// @access  Private (authenticated students only)
router.post('/', 
  validateCreatePoll,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      // AUTHENTICATION: When deploying, uncomment this check
      /*
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required to create polls'
        });
      }
      */

      // FOR LOCALHOST TESTING: Mock user in request
      if (!(req as any).user) {
        (req as any).user = {
          _id: 'test-user-123',
          id: 'test-user-123',
          name: 'Test User',
          email: 'test@example.com'
        };
      }

      await PollController.createPoll(req as AuthRequest, res);

    } catch (error: any) {
      console.error('Error in create poll route:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while creating poll',
        error: error.message
      });
    }
  }
);

// @route   GET /api/polls
// @desc    Get all polls with optional filtering
// @access  Private
router.get('/', 
  validatePollFilters,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      // FOR LOCALHOST TESTING: Mock user in request
      if (!(req as any).user) {
        (req as any).user = {
          _id: 'test-user-123',
          id: 'test-user-123',
          name: 'Test User',
          email: 'test@example.com'
        };
      }

      await PollController.getAllPolls(req as AuthRequest, res);

    } catch (error: any) {
      console.error('Error in get polls route:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while fetching polls',
        error: error.message
      });
    }
  }
);

// @route   GET /api/polls/trending
// @desc    Get trending polls (7 or more votes)
// @access  Private
router.get('/trending', 
  async (req: Request, res: Response) => {
    try {
      // FOR LOCALHOST TESTING: Mock user in request
      if (!(req as any).user) {
        (req as any).user = {
          _id: '507f1f77bcf86cd799439011', // Valid ObjectId format
          id: '507f1f77bcf86cd799439011',
          name: 'Test User',
          email: 'test@example.com'
        };
      }

      await PollController.getTrendingPolls(req as AuthRequest, res);

    } catch (error: any) {
      console.error('Error in get trending polls route:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while fetching trending polls',
        error: error.message
      });
    }
  }
);

// @route   GET /api/polls/stats
// @desc    Get poll statistics for dashboard
// @access  Private
router.get('/stats', 
  async (req: Request, res: Response) => {
    try {
      // FOR LOCALHOST TESTING: Mock user in request
      if (!(req as any).user) {
        (req as any).user = {
          _id: 'test-user-123',
          id: 'test-user-123',
          name: 'Test User',
          email: 'test@example.com'
        };
      }

      await PollController.getPollStats(req as AuthRequest, res);

    } catch (error: any) {
      console.error('Error in get poll stats route:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while fetching poll statistics',
        error: error.message
      });
    }
  }
);

// @route   POST /api/polls/:id/vote
// @desc    Cast a vote on a poll
// @access  Private
router.post('/:id/vote', 
  validatePollId,
  handleValidationErrors,
  // AUTHENTICATION: Uncomment when deploying with authentication
  // validatePollAccess,
  // canUserVote,
  async (req: Request, res: Response) => {
    try {
      // FOR LOCALHOST TESTING: Mock user in request
      if (!(req as any).user) {
        (req as any).user = {
          _id: '507f1f77bcf86cd799439011', // Valid ObjectId format
          id: '507f1f77bcf86cd799439011',
          name: 'Test User',
          email: 'test@example.com'
        };
      }

      await PollController.voteOnPoll(req as AuthRequest, res);

    } catch (error: any) {
      console.error('Error in vote on poll route:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while voting on poll',
        error: error.message
      });
    }
  }
);

// @route   DELETE /api/polls/:id/vote
// @desc    Remove a vote from a poll (only by the voter)
// @access  Private
router.delete('/:id/vote', 
  validatePollId,
  handleValidationErrors,
  // AUTHENTICATION: Uncomment when deploying with authentication
  // validatePollAccess,
  // canUserRemoveVote,
  async (req: Request, res: Response) => {
    try {
      // FOR LOCALHOST TESTING: Mock user in request
      if (!(req as any).user) {
        (req as any).user = {
          _id: '507f1f77bcf86cd799439011', // Valid ObjectId format
          id: '507f1f77bcf86cd799439011',
          name: 'Test User',
          email: 'test@example.com'
        };
      }

      await PollController.removeVote(req as AuthRequest, res);

    } catch (error: any) {
      console.error('Error in remove vote route:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while removing vote',
        error: error.message
      });
    }
  }
);

// @route   GET /api/polls/:id
// @desc    Get single poll details
// @access  Private
router.get('/:id', 
  validatePollId,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      // FOR LOCALHOST TESTING: Mock user in request
      if (!(req as any).user) {
        (req as any).user = {
          _id: 'test-user-123',
          id: 'test-user-123',
          name: 'Test User',
          email: 'test@example.com'
        };
      }

      await PollController.getPollById(req as AuthRequest, res);

    } catch (error: any) {
      console.error('Error in get poll by ID route:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while fetching poll',
        error: error.message
      });
    }
  }
);

// @route   PUT /api/polls/:id/status
// @desc    Update poll status (for admin/tutor use)
// @access  Private (Admin/Tutor only)
router.put('/:id/status', 
  validateUpdatePollStatus,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      // FOR LOCALHOST TESTING: Mock user in request
      if (!(req as any).user) {
        (req as any).user = {
          _id: 'test-user-123',
          id: 'test-user-123',
          name: 'Test User',
          email: 'test@example.com'
        };
      }

      await PollController.updatePollStatus(req as AuthRequest, res);

    } catch (error: any) {
      console.error('Error in update poll status route:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while updating poll status',
        error: error.message
      });
    }
  }
);

// @route   DELETE /api/polls/:id
// @desc    Delete a poll (only creator can delete)
// @access  Private
router.delete('/:id', 
  validatePollId,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      // FOR LOCALHOST TESTING: Mock user in request
      if (!(req as any).user) {
        (req as any).user = {
          _id: 'test-user-123',
          id: 'test-user-123',
          name: 'Test User',
          email: 'test@example.com'
        };
      }

      await PollController.deletePoll(req as AuthRequest, res);

    } catch (error: any) {
      console.error('Error in delete poll route:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while deleting poll',
        error: error.message
      });
    }
  }
);

// @route   POST /api/polls/check-scheduling
// @desc    Check and update polls that should be scheduled
// @access  Private (Admin only)
router.post('/check-scheduling', 
  async (req: Request, res: Response) => {
    try {
      // FOR LOCALHOST TESTING: Mock user in request
      if (!(req as any).user) {
        (req as any).user = {
          _id: 'test-user-123',
          id: 'test-user-123',
          name: 'Test User',
          email: 'test@example.com'
        };
      }

      await PollController.checkSchedulingEligibility(req as AuthRequest, res);

    } catch (error: any) {
      console.error('Error in check scheduling route:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while checking scheduling eligibility',
        error: error.message
      });
    }
  }
);

export default router;