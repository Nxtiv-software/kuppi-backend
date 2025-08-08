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

// Apply authentication middleware to all routes
router.use(authenticateUser);

// @route   POST /api/polls
// @desc    Create a new poll
// @access  Private (authenticated students only)
router.post('/', 
  validateCreatePoll,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const {
        title,
        subject,
        chapter,
        description,
        preferredDate,
        timeSlot,
        maxStudents
      } = req.body;

      const Poll = require('../models/Poll').default;
      
      const newPoll = new Poll({
        title,
        subject,
        chapter,
        description,
        preferredDate: new Date(preferredDate),
        timeSlot,
        maxStudents: parseInt(maxStudents.toString()),
        creator: (req as any).user.id
      });

      const savedPoll = await newPoll.save();
      await savedPoll.populate('creator', 'name email');

      res.status(201).json({
        success: true,
        message: 'Poll created successfully',
        data: savedPoll
      });

    } catch (error: any) {
      console.error('Error creating poll:', error);
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
      const { subject, status, date, page = 1, limit = 10 } = req.query;
      const Poll = require('../models/Poll').default;
      
      let query: any = {};
      
      if (subject && subject !== 'all') {
        query.subject = subject;
      }
      
      if (status && status !== 'all') {
        query.status = status;
      }
      
      if (date && date !== 'all') {
        const now = new Date();
        switch (date) {
          case 'today':
            query.createdAt = {
              $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
              $lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
            };
            break;
          case 'week':
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            query.createdAt = { $gte: weekAgo };
            break;
          case 'month':
            const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1);
            query.createdAt = { $gte: monthAgo };
            break;
        }
      }

      const pageNum = parseInt(page.toString());
      const limitNum = parseInt(limit.toString());
      const skip = (pageNum - 1) * limitNum;

      const polls = await Poll.find(query)
        .populate('creator', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum);

      const total = await Poll.countDocuments(query);

      const pollsWithUserData = polls.map((poll: any) => {
        const hasVoted = poll.votes.includes((req as any).user.id);
        return {
          ...poll.toObject(),
          voteCount: poll.votes.length,
          hasVoted
        };
      });

      res.json({
        success: true,
        data: {
          polls: pollsWithUserData,
          pagination: {
            current: pageNum,
            pages: Math.ceil(total / limitNum),
            total
          }
        }
      });

    } catch (error: any) {
      console.error('Error fetching polls:', error);
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
      const Poll = require('../models/Poll').default;
      const trendingPolls = await Poll.getTrendingPolls()
        .populate('creator', 'name email');

      res.json({
        success: true,
        data: trendingPolls
      });

    } catch (error: any) {
      console.error('Error fetching trending polls:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while fetching trending polls',
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
  validatePollAccess,
  canUserVote,
  (req: Request, res: Response) => PollController.voteOnPoll(req as AuthRequest, res)
);

// @route   DELETE /api/polls/:id/vote
// @desc    Remove a vote from a poll (only by the voter)
// @access  Private
router.delete('/:id/vote', 
  validatePollId,
  handleValidationErrors,
  validatePollAccess,
  canUserRemoveVote,
  (req: Request, res: Response) => PollController.removeVote(req as AuthRequest, res)
);

// @route   GET /api/polls/:id
// @desc    Get single poll details
// @access  Private
router.get('/:id', 
  validatePollId,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const Poll = require('../models/Poll').default;
      const pollId = req.params.id;

      const poll = await Poll.findById(pollId)
        .populate('creator', 'name email')
        .populate('tutor', 'name email')
        .populate('votes', 'name email');

      if (!poll) {
        return res.status(404).json({
          success: false,
          message: 'Poll not found'
        });
      }

      const hasVoted = poll.votes.some((vote: any) => vote._id.toString() === (req as any).user.id);

      res.json({
        success: true,
        data: {
          ...poll.toObject(),
          voteCount: poll.votes.length,
          hasVoted
        }
      });

    } catch (error: any) {
      console.error('Error fetching poll:', error);
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
  (req: Request, res: Response) => PollController.updatePollStatus(req as AuthRequest, res)
);

// @route   DELETE /api/polls/:id
// @desc    Delete a poll (only creator can delete)
// @access  Private
router.delete('/:id', 
  validatePollId,
  handleValidationErrors,
  (req: Request, res: Response) => PollController.deletePoll(req as AuthRequest, res)
);

// @route   POST /api/polls/check-scheduling
// @desc    Check and update polls that should be scheduled
// @access  Private (Admin only)
router.post('/check-scheduling', (req: Request, res: Response) => PollController.checkSchedulingEligibility(req as AuthRequest, res));

export default router;