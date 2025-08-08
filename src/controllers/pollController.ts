import { Request, Response } from 'express';
import Poll, { IPoll } from '../models/Poll';
import { AuthRequest } from '../middlewares/auth';
import mongoose from 'mongoose';

// Interface for poll statistics
interface PollStats {
  totalPolls: number;
  activePolls: number;
  scheduledPolls: number;
  completedPolls: number;
  totalVotes: number;
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
        votes: { $size: { $gte: 7 } } // Updated to 7 votes for trending
      });

      for (const poll of eligiblePolls) {
        if (poll.checkScheduling()) {
          await poll.save();
        }
      }

      res.json({
        success: true,
        message: 'Scheduling eligibility checked',
        data: eligiblePolls.map(poll => poll._id)
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
      const userId = req.user.id;

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

      if (poll.votes.some(voteId => voteId.toString() === userId)) {
        res.status(400).json({
          success: false,
          message: 'You have already voted on this poll'
        });
        return;
      }

      poll.votes.push(new mongoose.Types.ObjectId(userId));
      await poll.save();

      res.json({
        success: true,
        message: 'Vote recorded successfully',
        data: {
          pollId: poll._id,
          voteCount: poll.votes.length
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
      const userId = req.user.id;

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

      const voteIndex = poll.votes.findIndex(voteId => voteId.toString() === userId);
      if (voteIndex === -1) {
        res.status(400).json({
          success: false,
          message: 'You have not voted on this poll'
        });
        return;
      }

      poll.votes.splice(voteIndex, 1);
      await poll.save();

      res.json({
        success: true,
        message: 'Vote removed successfully',
        data: {
          pollId: poll._id,
          voteCount: poll.votes.length
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
      const userId = req.user.id;

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
      if (poll.creator.toString() !== userId) {
        res.status(403).json({
          success: false,
          message: 'You are not authorized to delete this poll'
        });
        return;
      }

      // Don't allow deletion if poll is scheduled or has votes
      if (poll.status === 'scheduled' || poll.votes.length > 0) {
        res.status(400).json({
          success: false,
          message: 'Cannot delete poll that has votes or is scheduled'
        });
        return;
      }

      await Poll.findByIdAndDelete(pollId);

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
}

export default PollController;