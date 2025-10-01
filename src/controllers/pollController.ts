import { Request, Response } from 'express';
import Poll, { IPoll } from '../models/Poll';
import { AuthRequest } from '../middlewares/auth';
import mongoose from 'mongoose';
import User from '../models/user';
import { userService } from '../services/userService';

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
      // Use Clerk authentication - get userId from req.auth
      const userId = (req as any).auth?.userId || req.user?.id || req.user?._id;

      console.log('🗳️ ===== VOTING DEBUG =====');
      console.log('🗳️ Poll ID:', pollId);
      console.log('🗳️ User ID:', userId);
      console.log('🗳️ Auth source:', (req as any).auth ? 'Clerk' : 'Legacy');
      console.log('🗳️ req.auth:', (req as any).auth);
      console.log('🗳️ req.user:', req.user);

      if (!mongoose.Types.ObjectId.isValid(pollId)) {
        console.log('❌ Invalid poll ID format');
        res.status(400).json({
          success: false,
          message: 'Invalid poll ID'
        });
        return;
      }

      // For Clerk user IDs, we don't need to validate as ObjectId
      if (!userId) {
        console.log('❌ No user ID found in request');
        console.log('❌ req.auth:', (req as any).auth);
        console.log('❌ req.user:', req.user);
        res.status(400).json({
          success: false,
          message: 'User ID required for voting'
        });
        return;
      }

      console.log('🔍 Looking for poll with ID:', pollId);
      const poll = await Poll.findById(pollId);
      
      if (!poll) {
        console.log('❌ Poll not found in database');
        res.status(404).json({
          success: false,
          message: 'Poll not found'
        });
        return;
      }

      console.log('✅ Poll found:', poll.title);
      console.log('📊 Poll status:', poll.status);
      console.log('📊 Current votes:', poll.votes);
      console.log('📊 Target votes:', poll.targetVotes);

      if (poll.status !== 'active') {
        console.log('❌ Poll is not active, status:', poll.status);
        res.status(400).json({
          success: false,
          message: 'This poll is no longer active for voting'
        });
        return;
      }

      // Check if user has already voted (handle both ObjectId and string user IDs)
      const hasAlreadyVoted = poll.votes.some(voteId => {
        const voteIdString = voteId.toString();
        const userIdString = userId.toString();
        console.log(`🔍 Comparing vote: "${voteIdString}" with user: "${userIdString}"`);
        return voteIdString === userIdString;
      });

      console.log('🔍 Has already voted:', hasAlreadyVoted);

      if (hasAlreadyVoted) {
        console.log('❌ User has already voted');
        res.status(400).json({
          success: false,
          message: 'You have already voted on this poll'
        });
        return;
      }

      // Add vote (store as string for Clerk user IDs)
      console.log('✅ Adding vote for user:', userId);
      poll.votes.push(userId as any);
      console.log('✅ Vote added. Total votes:', poll.votes.length, '/', poll.targetVotes);
      
      // Note: Poll status stays 'active' to allow more votes
      // Poll becomes 'scheduled' only when tutor accepts and schedules it
      // When poll reaches ≥50% votes, it appears in tutor session requests
      const votePercentage = (poll.votes.length / poll.targetVotes) * 100;
      console.log('📊 Vote percentage:', votePercentage.toFixed(1) + '%');
      
      if (votePercentage >= 50) {
        console.log('🎯 Poll reached 50%+ votes - now eligible for session requests');
      }
      
      await poll.save();
      console.log('💾 Poll saved successfully');
      console.log('🗳️ ===== VOTING SUCCESS =====');

      res.json({
        success: true,
        message: 'Vote recorded successfully',
        data: {
          pollId: poll._id,
          voteCount: poll.votes.length,
          status: poll.status, // Should remain 'active'
          votePercentage: votePercentage,
          eligibleForScheduling: votePercentage >= 50
        }
      });

    } catch (error: any) {
      console.error('❌ ===== VOTING ERROR =====');
      console.error('❌ Error voting on poll:', error);
      console.error('❌ Error stack:', error.stack);
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
      // Use Clerk authentication - get userId from req.auth
      const userId = (req as any).auth?.userId || req.user?.id || req.user?._id;

      console.log('🗑️ ===== REMOVE VOTE DEBUG =====');
      console.log('🗑️ Poll ID:', pollId);
      console.log('🗑️ User ID:', userId);
      console.log('🗑️ User ID type:', typeof userId);

      if (!mongoose.Types.ObjectId.isValid(pollId)) {
        console.log('❌ Invalid poll ID');
        res.status(400).json({
          success: false,
          message: 'Invalid poll ID'
        });
        return;
      }

      // Validate userId exists
      if (!userId) {
        console.log('❌ No user ID provided');
        res.status(400).json({
          success: false,
          message: 'User ID is required for vote removal'
        });
        return;
      }

      const poll = await Poll.findById(pollId);
      
      if (!poll) {
        console.log('❌ Poll not found');
        res.status(404).json({
          success: false,
          message: 'Poll not found'
        });
        return;
      }

      console.log('✅ Poll found:', poll.title);
      console.log('📊 Current votes:', poll.votes);
      console.log('📊 Poll status:', poll.status);

      if (poll.status !== 'active' && poll.status !== 'scheduled') {
        console.log('❌ Poll not active or scheduled, status:', poll.status);
        res.status(400).json({
          success: false,
          message: 'Cannot remove vote from this poll'
        });
        return;
      }

      // Handle both ObjectId and string user IDs for vote comparison
      const voteIndex = poll.votes.findIndex(voteId => {
        const voteIdString = voteId.toString();
        const userIdString = userId.toString();
        console.log(`🔍 Comparing vote: "${voteIdString}" with user: "${userIdString}"`);
        // Handle both ObjectId and string comparisons
        if (mongoose.Types.ObjectId.isValid(userId) && mongoose.Types.ObjectId.isValid(voteId)) {
          return voteId.toString() === new mongoose.Types.ObjectId(userId).toString();
        }
        // For string user IDs (like Clerk IDs), compare directly
        return voteIdString === userIdString;
      });

      console.log('🔍 Vote index found:', voteIndex);
      if (voteIndex === -1) {
        console.log('❌ User has not voted on this poll');
        res.status(400).json({
          success: false,
          message: 'You have not voted on this poll'
        });
        return;
      }

      console.log('✅ Removing vote at index:', voteIndex);
      poll.votes.splice(voteIndex, 1);
      console.log('✅ Vote removed. Remaining votes:', poll.votes.length);
      
      // If poll was scheduled but now has less than target votes, make it active again
      if ((poll.status as string) === 'scheduled' && poll.votes.length < poll.targetVotes) {
        console.log('📊 Poll status changed from scheduled to active');
        poll.status = 'active';
      }
      
      await poll.save();
      console.log('💾 Poll saved successfully');
      console.log('🗑️ ===== REMOVE VOTE SUCCESS =====');

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
      // Use Clerk authentication - get userId from req.auth
      const userId = (req as any).auth?.userId || req.user?.id || req.user?._id;

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

      // Use Clerk authentication - get userId from req.auth
      const userId = (req as any).auth?.userId || req.user?.id || req.user?._id;

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

      // Get creator information from Clerk if not provided
      let finalCreatorName = creatorName;
      if (!finalCreatorName && userId) {
        try {
          const userInfo = await userService.getUserInfo(userId);
          finalCreatorName = userInfo?.name || 'Anonymous User';
        } catch (error) {
          console.log('Could not fetch user info for creator name:', error);
          finalCreatorName = 'Anonymous User';
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
        targetVotes: parseInt(maxStudents.toString()), // Users can vote until 100% (maxStudents)
        creator: creatorValue,
        createdBy: userId, // Always store the authenticated user ID
        creatorName: finalCreatorName // Store the resolved creator name
      });

      const savedPoll = await newPoll.save();
      
      // Return clean poll data without exposing raw user IDs
      const cleanPollResponse = {
        _id: savedPoll._id,
        title: savedPoll.title,
        subject: savedPoll.subject,
        chapter: savedPoll.chapter,
        description: savedPoll.description,
        preferredDate: savedPoll.preferredDate,
        timeSlot: savedPoll.timeSlot,
        maxStudents: savedPoll.maxStudents,
        targetVotes: savedPoll.targetVotes,
        status: savedPoll.status,
        createdAt: savedPoll.createdAt,
        updatedAt: savedPoll.updatedAt,
        voteCount: 0,
        creatorName: finalCreatorName,
        creatorInfo: {
          name: finalCreatorName
        }
      };

      res.status(201).json({
        success: true,
        message: 'Poll created successfully',
        data: cleanPollResponse
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
      // Use Clerk authentication - get userId from req.auth
      const userId = (req as any).auth?.userId || req.user?.id || req.user?._id;
      
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
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum);

      const total = await Poll.countDocuments(query);

      // Get all unique user IDs from polls
      const userIds = new Set<string>();
      polls.forEach(poll => {
        if (poll.creator) userIds.add(poll.creator.toString());
        if (poll.createdBy) userIds.add(poll.createdBy);
        if (poll.acceptedBy) userIds.add(poll.acceptedBy.toString());
        poll.votes.forEach((vote: any) => userIds.add(vote.toString()));
      });

      // Fetch user information for all users
      const usersMap = await userService.getUsersInfo(Array.from(userIds));

      const pollsWithUserData = polls.map((poll: any) => {
        const hasVoted = poll.votes.some((voteId: any) => voteId.toString() === userId);
        
        // Get creator information
        const creatorId = poll.createdBy || poll.creator?.toString();
        const creatorInfo = creatorId ? usersMap.get(creatorId) : null;
        
        // Get acceptor information
        const acceptorId = poll.acceptedBy?.toString();
        const acceptorInfo = acceptorId ? usersMap.get(acceptorId) : null;

        // Clean poll object without exposing raw user IDs
        const cleanPoll = {
          _id: poll._id,
          title: poll.title,
          subject: poll.subject,
          chapter: poll.chapter,
          description: poll.description,
          preferredDate: poll.preferredDate,
          timeSlot: poll.timeSlot,
          maxStudents: poll.maxStudents,
          targetVotes: poll.targetVotes,
          status: poll.status,
          scheduledDate: poll.scheduledDate,
          sessionId: poll.sessionId,
          createdAt: poll.createdAt,
          updatedAt: poll.updatedAt,
          voteCount: poll.votes.length,
          hasVoted,
          // Always provide clean creator information
          creatorName: creatorInfo ? creatorInfo.name : (poll.creatorName || 'Anonymous User'),
          creatorEmail: creatorInfo ? creatorInfo.email : null,
          creatorInfo: creatorInfo ? {
            id: creatorInfo.id,
            name: creatorInfo.name,
            email: creatorInfo.email,
            firstName: creatorInfo.firstName,
            lastName: creatorInfo.lastName
          } : {
            name: poll.creatorName || 'Anonymous User',
            email: null
          },
          // Clean acceptor information (tutor who accepted)
          acceptorName: acceptorInfo ? acceptorInfo.name : null,
          acceptorInfo: acceptorInfo ? {
            id: acceptorInfo.id,
            name: acceptorInfo.name,
            email: acceptorInfo.email,
            firstName: acceptorInfo.firstName,
            lastName: acceptorInfo.lastName
          } : null,
          // Provide clean vote information without exposing user IDs
          votersCount: poll.votes.length,
          // Don't expose raw votes array with user IDs
        };

        return cleanPoll;
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
      // Use Clerk authentication - get userId from req.auth
      const userId = (req as any).auth?.userId || req.user?.id || req.user?._id;

      // Use the static method from the Poll model
      const trendingPolls = await Poll.getTrendingPolls();

      // Get all unique user IDs from trending polls
      const userIds = new Set<string>();
      trendingPolls.forEach((poll: any) => {
        if (poll.creator) userIds.add(poll.creator.toString());
        if (poll.createdBy) userIds.add(poll.createdBy);
        if (poll.acceptedBy) userIds.add(poll.acceptedBy.toString());
        poll.votes.forEach((vote: any) => userIds.add(vote.toString()));
      });

      // Fetch user information for all users
      const usersMap = await userService.getUsersInfo(Array.from(userIds));

      // Add hasVoted field and user data for each poll
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

        // Get creator information
        const creatorId = poll.createdBy || poll.creator?.toString();
        const creatorInfo = creatorId ? usersMap.get(creatorId) : null;
        
        // Get acceptor information
        const acceptorId = poll.acceptedBy?.toString();
        const acceptorInfo = acceptorId ? usersMap.get(acceptorId) : null;
        
        // Return clean poll data without exposing raw user IDs
        return {
          _id: poll._id,
          title: poll.title,
          subject: poll.subject,
          chapter: poll.chapter,
          description: poll.description,
          preferredDate: poll.preferredDate,
          timeSlot: poll.timeSlot,
          maxStudents: poll.maxStudents,
          targetVotes: poll.targetVotes,
          status: poll.status,
          scheduledDate: poll.scheduledDate,
          sessionId: poll.sessionId,
          createdAt: poll.createdAt,
          updatedAt: poll.updatedAt,
          voteCount: poll.votes?.length || 0,
          hasVoted,
          // Always provide clean creator information
          creatorName: creatorInfo ? creatorInfo.name : (poll.creatorName || 'Anonymous User'),
          creatorEmail: creatorInfo ? creatorInfo.email : null,
          creatorInfo: creatorInfo ? {
            id: creatorInfo.id,
            name: creatorInfo.name,
            email: creatorInfo.email,
            firstName: creatorInfo.firstName,
            lastName: creatorInfo.lastName
          } : {
            name: poll.creatorName || 'Anonymous User',
            email: null
          },
          // Clean acceptor information (tutor who accepted)
          acceptorName: acceptorInfo ? acceptorInfo.name : null,
          acceptorInfo: acceptorInfo ? {
            id: acceptorInfo.id,
            name: acceptorInfo.name,
            email: acceptorInfo.email,
            firstName: acceptorInfo.firstName,
            lastName: acceptorInfo.lastName
          } : null,
          // Provide clean vote information without exposing user IDs
          votersCount: poll.votes?.length || 0
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
      // Use Clerk authentication - get userId from req.auth
      const userId = (req as any).auth?.userId || req.user?.id || req.user?._id;

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

      const hasVoted = poll.votes.some((voteId: any) => voteId.toString() === userId.toString());

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