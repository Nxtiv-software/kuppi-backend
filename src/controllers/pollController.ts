import { Request, Response } from 'express';
import Poll, { IPoll } from '../models/Poll';
import { AuthRequest } from '../middlewares/auth';
import mongoose from 'mongoose';
import User from '../models/user';

// Interface for poll statistics
interface PollStats {
  totalPolls: number;
  activePolls: number;
  scheduledPolls: number;
  completedPolls: number;
  totalVotes: number;
}

// Interface for Clerk user data
interface ClerkUserData {
  id: string;
  primaryEmailAddressId: string;
  emailAddresses: Array<{
    id: string;
    emailAddress: string;
  }>;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
}

export class PollController {
  
  /**
   * Get poll statistics for dashboard
   */
  static async getPollStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const stats = await Poll.aggregate([
        {
          $group: {
            _id: null,
            totalPolls: { $sum: 1 },
            activePolls: {
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
            },
            scheduledPolls: {
              $sum: { $cond: [{ $eq: ['$status', 'scheduled'] }, 1, 0] }
            },
            completedPolls: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            },
            totalVotes: { $sum: { $size: '$votes' } }
          }
        }
      ]);

      const pollStats: PollStats = stats[0] || {
        totalPolls: 0,
        activePolls: 0,
        scheduledPolls: 0,
        completedPolls: 0,
        totalVotes: 0
      };

      res.json({
        success: true,
        data: pollStats
      });

    } catch (error: any) {
      console.error('Error fetching poll stats:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while fetching poll statistics',
        error: error.message
      });
    }
  }

  /**
   * Get polls by subject with vote counts
   */
  static async getPollsBySubject(req: AuthRequest, res: Response): Promise<void> {
    try {
      const subjectStats = await Poll.aggregate([
        {
          $group: {
            _id: '$subject',
            pollCount: { $sum: 1 },
            totalVotes: { $sum: { $size: '$votes' } },
            activePolls: {
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
            }
          }
        },
        {
          $project: {
            subject: '$_id',
            pollCount: 1,
            totalVotes: 1,
            activePolls: 1,
            _id: 0
          }
        },
        { $sort: { totalVotes: -1 } }
      ]);

      res.json({
        success: true,
        data: subjectStats
      });

    } catch (error: any) {
      console.error('Error fetching polls by subject:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while fetching polls by subject',
        error: error.message
      });
    }
  }

  /**
   * Check and update polls that should be scheduled
   */
  static async checkSchedulingEligibility(req: AuthRequest, res: Response): Promise<void> {
    try {
      const eligiblePolls = await Poll.find({
        status: 'active',
        $expr: { $gte: [{ $size: '$votes' }, 7] } // Updated to use $expr for dynamic comparison
      });

      const updatedPolls = [];
      for (const poll of eligiblePolls) {
        if (poll.checkScheduling()) {
          await poll.save();
          updatedPolls.push(poll._id);
        }
      }

      res.json({
        success: true,
        message: 'Scheduling eligibility checked',
        data: {
          checkedPolls: eligiblePolls.length,
          updatedPolls: updatedPolls
        }
      });

    } catch (error: any) {
      console.error('Error checking scheduling eligibility:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while checking scheduling eligibility',
        error: error.message
      });
    }
  }

  /**
   * Cast a vote on a poll
   */
  static async voteOnPoll(req: AuthRequest, res: Response): Promise<void> {
    try {
      const pollId = req.params.id;
      const userId = req.user?.id || req.user?._id;

      if (!mongoose.Types.ObjectId.isValid(pollId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid poll ID'
        });
        return;
      }

      // Validate userId is a valid ObjectId for voting
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid user ID for voting'
        });
        return;
      }

      const poll = await Poll.findById(pollId);
      
      if (!poll) {
        res.status(404).json({
          success: false,
          message: 'Poll not found'
        });
        return;
      }

      if (poll.status !== 'active') {
        res.status(400).json({
          success: false,
          message: 'This poll is no longer active for voting'
        });
        return;
      }

      // Check if user has already voted (handle ObjectId comparison properly)
      const userObjectId = new mongoose.Types.ObjectId(userId);
      if (poll.votes.some(voteId => voteId.toString() === userObjectId.toString())) {
        res.status(400).json({
          success: false,
          message: 'You have already voted on this poll'
        });
        return;
      }

      poll.votes.push(userObjectId);
      
      // Check if poll should be scheduled after this vote
      if (poll.votes.length >= poll.targetVotes && poll.status === 'active') {
        poll.status = 'scheduled';
      }
      
      await poll.save();

      res.json({
        success: true,
        message: 'Vote recorded successfully',
        data: {
          pollId: poll._id,
          voteCount: poll.votes.length,
          status: poll.status,
          isNowScheduled: poll.status === 'scheduled' && poll.votes.length === poll.targetVotes
        }
      });

    } catch (error: any) {
      console.error('Error voting on poll:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while voting on poll',
        error: error.message
      });
    }
  }

  /**
   * Remove a vote from a poll (only by the voter)
   */
  static async removeVote(req: AuthRequest, res: Response): Promise<void> {
    try {
      const pollId = req.params.id;
      const userId = req.user?.id || req.user?._id;

      if (!mongoose.Types.ObjectId.isValid(pollId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid poll ID'
        });
        return;
      }

      // Validate userId is a valid ObjectId for vote removal
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid user ID for vote removal'
        });
        return;
      }

      const poll = await Poll.findById(pollId);
      
      if (!poll) {
        res.status(404).json({
          success: false,
          message: 'Poll not found'
        });
        return;
      }

      if (poll.status !== 'active' && poll.status !== 'scheduled') {
        res.status(400).json({
          success: false,
          message: 'Cannot remove vote from this poll'
        });
        return;
      }

      // Handle ObjectId comparison properly
      const userObjectId = new mongoose.Types.ObjectId(userId);
      const voteIndex = poll.votes.findIndex(voteId => voteId.toString() === userObjectId.toString());
      if (voteIndex === -1) {
        res.status(400).json({
          success: false,
          message: 'You have not voted on this poll'
        });
        return;
      }

      poll.votes.splice(voteIndex, 1);
      
      // If poll was scheduled but now has less than target votes, make it active again
      if ((poll.status as string) === 'scheduled' && poll.votes.length < poll.targetVotes) {
        poll.status = 'active';
      }
      
      await poll.save();

      res.json({
        success: true,
        message: 'Vote removed successfully',
        data: {
          pollId: poll._id,
          voteCount: poll.votes.length,
          status: poll.status
        }
      });

    } catch (error: any) {
      console.error('Error removing vote:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while removing vote',
        error: error.message
      });
    }
  }

  /**
   * Delete a poll
   */
  static async deletePoll(req: AuthRequest, res: Response): Promise<void> {
    try {
      const pollId = req.params.id;
      const userId = req.user?.id || req.user?._id;

      if (!mongoose.Types.ObjectId.isValid(pollId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid poll ID'
        });
        return;
      }

      const poll = await Poll.findById(pollId);
      
      if (!poll) {
        res.status(404).json({
          success: false,
          message: 'Poll not found'
        });
        return;
      }

      // Check if user is the creator of the poll
      const isCreator = poll.creator.toString() === userId || 
                       poll.creator === userId || 
                       poll.createdBy === userId;
      
      if (!isCreator) {
        res.status(403).json({
          success: false,
          message: 'You are not authorized to delete this poll. Only the poll creator can delete it.'
        });
        return;
      }

      console.log(`User ${userId} attempting to delete poll ${pollId} with ${poll.votes.length} votes`);

      // Only allow deletion if poll has 3 votes or fewer and is not scheduled
      if (poll.status === 'scheduled') {
        res.status(400).json({
          success: false,
          message: 'Cannot delete poll that is already scheduled'
        });
        return;
      }

      if (poll.votes.length > 3) {
        res.status(400).json({
          success: false,
          message: `Cannot delete poll with ${poll.votes.length} votes. Polls can only be deleted if they have 3 votes or fewer.`
        });
        return;
      }

      await Poll.findByIdAndDelete(pollId);
      
      console.log(`Poll ${pollId} with ${poll.votes.length} votes successfully deleted by user ${userId}`);

      res.json({
        success: true,
        message: 'Poll deleted successfully'
      });

    } catch (error: any) {
      console.error('Error deleting poll:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while deleting poll',
        error: error.message
      });
    }
  }

  /**
   * Update poll status (for admin/tutor use)
   */
  static async updatePollStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const pollId = req.params.id;
      const { status, scheduledDate, tutor } = req.body;

      if (!mongoose.Types.ObjectId.isValid(pollId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid poll ID'
        });
        return;
      }

      const poll = await Poll.findById(pollId);
      
      if (!poll) {
        res.status(404).json({
          success: false,
          message: 'Poll not found'
        });
        return;
      }

      const updateData: any = { status };
      
      if (scheduledDate) {
        updateData.scheduledDate = new Date(scheduledDate);
      }
      
      if (tutor) {
        updateData.tutor = tutor;
      }

      const updatedPoll = await Poll.findByIdAndUpdate(
        pollId,
        updateData,
        { new: true }
      ).populate('creator', 'name email').populate('tutor', 'name email');

      res.json({
        success: true,
        message: 'Poll status updated successfully',
        data: updatedPoll
      });

    } catch (error: any) {
      console.error('Error updating poll status:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while updating poll status',
        error: error.message
      });
    }
  }

  /**
   * Create a new poll
   */
  static async createPoll(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        title,
        subject,
        chapter,
        description,
        preferredDate,
        timeSlot,
        maxStudents,
        createdBy,
        creatorName
      } = req.body;

      const userId = req.user?.id || req.user?._id;

      // Validation
      if (!title || !subject || !chapter || !description || !preferredDate || !timeSlot || !maxStudents) {
        res.status(400).json({
          success: false,
          message: 'All fields are required'
        });
        return;
      }

      if (parseInt(maxStudents.toString()) < 1 || parseInt(maxStudents.toString()) > 50) {
        res.status(400).json({
          success: false,
          message: 'Max students must be between 1 and 50'
        });
        return;
      }

      const selectedDate = new Date(preferredDate);
      if (selectedDate <= new Date()) {
        res.status(400).json({
          success: false,
          message: 'Preferred date must be in the future'
        });
        return;
      }

      // Determine creator value - prefer createdBy from body, then userId from auth
      let creatorValue = createdBy || userId;
      
      // Try to convert to ObjectId if it looks like one, otherwise keep as string
      if (mongoose.Types.ObjectId.isValid(creatorValue)) {
        try {
          creatorValue = new mongoose.Types.ObjectId(creatorValue);
        } catch (error) {
          // Keep as string if conversion fails
        }
      }

      const newPoll = new Poll({
        title: title.trim(),
        subject,
        chapter: chapter.trim(),
        description: description.trim(),
        preferredDate: selectedDate,
        timeSlot,
        maxStudents: parseInt(maxStudents.toString()),
        creator: creatorValue,
        createdBy: createdBy, // Store the original string ID if provided
        creatorName: creatorName // Store the creator name if provided
      });

      const savedPoll = await newPoll.save();
      
      // Try to populate creator info if it's a valid ObjectId
      let populatedPoll = savedPoll;
      if (mongoose.Types.ObjectId.isValid(savedPoll.creator)) {
        try {
          populatedPoll = await savedPoll.populate('creator', 'name email');
        } catch (populateError) {
          // If populate fails, use the saved poll as is
          console.log('Failed to populate creator, using saved poll as is');
        }
      }

      res.status(201).json({
        success: true,
        message: 'Poll created successfully',
        data: populatedPoll
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

  /**
   * Get all polls with filtering and pagination
   */
  static async getAllPolls(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { subject, status, date, page = 1, limit = 10 } = req.query;
      const userId = req.user?.id || req.user?._id;
      
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
        const hasVoted = poll.votes.some((voteId: any) => voteId.toString() === userId);
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

  /**
   * Get trending polls (7 or more votes)
   */
  static async getTrendingPolls(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || req.user?._id;

      // Use the static method from the Poll model
      const trendingPolls = await Poll.getTrendingPolls();

      // Add hasVoted field for each poll if user is authenticated
      const pollsWithVoteStatus = trendingPolls.map((poll: any) => {
        let hasVoted = false;
        
        if (userId && poll.votes) {
          // Check if user has voted (handle both ObjectId and string user IDs)
          hasVoted = poll.votes.some((voteId: any) => {
            if (mongoose.Types.ObjectId.isValid(userId) && mongoose.Types.ObjectId.isValid(voteId)) {
              return voteId.toString() === userId.toString();
            }
            return voteId.toString() === userId.toString();
          });
        }
        
        return {
          ...poll,
          hasVoted
        };
      });

      res.json({
        success: true,
        data: pollsWithVoteStatus
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

  /**
   * Get a single poll by ID
   */
  static async getPollById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const pollId = req.params.id;
      const userId = req.user?.id || req.user?._id;

      if (!mongoose.Types.ObjectId.isValid(pollId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid poll ID'
        });
        return;
      }

      const poll = await Poll.findById(pollId)
        .populate('creator', 'name email')
        .populate('tutor', 'name email')
        .populate('votes', 'name email');

      if (!poll) {
        res.status(404).json({
          success: false,
          message: 'Poll not found'
        });
        return;
      }

      const hasVoted = poll.votes.some((vote: any) => vote._id.toString() === userId);

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

  /**
   * Sync user with Clerk (for creating polls with Clerk users who might not be in DB yet)
   */
  static syncUserWithClerk = async (clerkUserId: string, clerkUserData: ClerkUserData) => {
    try {
      let user = await User.findOne({ clerkId: clerkUserId });
      
      if (!user) {
        // Create user from Clerk data
        user = await (User as any).findOrCreateFromClerk(clerkUserData);
      }
      
      return user;
    } catch (error) {
      console.error('Error syncing user with Clerk:', error);
      throw error;
    }
  };
}

export default PollController;