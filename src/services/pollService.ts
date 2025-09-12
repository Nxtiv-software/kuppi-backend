import Poll, { IPoll } from '../models/Poll';
import mongoose from 'mongoose';

export class PollService {
  
  /**
   * Create a new poll
   */
  static async createPoll(pollData: any, creatorId: string): Promise<IPoll> {
    const newPoll = new Poll({
      ...pollData,
      preferredDate: new Date(pollData.preferredDate),
      maxStudents: parseInt(pollData.maxStudents.toString()),
      creator: creatorId
    });

    const savedPoll = await newPoll.save();
    return await savedPoll.populate('creator', 'name email');
  }

  /**
   * Get polls with filtering and pagination
   */
  static async getPolls(filters: any, pagination: any, userId: string) {
    const { subject, status, date } = filters;
    const { page = 1, limit = 10 } = pagination;
    
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
      // Handle both string and ObjectId votes
      const hasVoted = poll.votes.some((vote: any) => vote.toString() === userId);
      return {
        ...poll.toObject(),
        voteCount: poll.votes.length,
        hasVoted
      };
    });

    return {
      polls: pollsWithUserData,
      pagination: {
        current: pageNum,
        pages: Math.ceil(total / limitNum),
        total
      }
    };
  }

  /**
   * Get trending polls
   */
  static async getTrendingPolls() {
    const trendingPolls = await Poll.find({})
      .sort({ votes: -1 })
      .limit(5)
      .populate('creator', 'name email');

    return trendingPolls;
  }

  /**
   * Cast a vote on a poll
   */
  static async voteOnPoll(pollId: string, userId: string): Promise<IPoll> {
    const poll = await Poll.findById(pollId);
    
    if (!poll) {
      throw new Error('Poll not found');
    }

    // Check if user has already voted (handle both string and ObjectId comparison)
    const hasVoted = poll.votes.some(vote => vote.toString() === userId);
    if (hasVoted) {
      throw new Error('You have already voted on this poll');
    }

    // For Clerk user IDs, store as string directly
    poll.votes.push(userId as any);
    return await poll.save();
  }

  /**
   * Remove a vote from a poll
   */
  static async removeVote(pollId: string, userId: string): Promise<IPoll> {
    const poll = await Poll.findById(pollId);
    
    if (!poll) {
      throw new Error('Poll not found');
    }

    const voteIndex = poll.votes.findIndex(vote => vote.toString() === userId);
    if (voteIndex === -1) {
      throw new Error('You have not voted on this poll');
    }

    poll.votes.splice(voteIndex, 1);
    return await poll.save();
  }

  /**
   * Update poll status
   */
  static async updatePollStatus(pollId: string, updateData: any): Promise<IPoll> {
    const poll = await Poll.findById(pollId);
    
    if (!poll) {
      throw new Error('Poll not found');
    }

    const { status, scheduledDate, tutor } = updateData;
    
    const updateFields: any = { status };
    
    if (scheduledDate) {
      updateFields.scheduledDate = new Date(scheduledDate);
    }
    
    if (tutor) {
      updateFields.tutor = tutor;
    }

    const updatedPoll = await Poll.findByIdAndUpdate(
      pollId,
      updateFields,
      { new: true }
    ).populate('creator', 'name email').populate('tutor', 'name email');

    if (!updatedPoll) {
      throw new Error('Failed to update poll');
    }

    return updatedPoll;
  }

  /**
   * Delete a poll (only creator can delete)
   */
  static async deletePoll(pollId: string, userId: string) {
    const poll = await Poll.findById(pollId);
    
    if (!poll) {
      throw new Error('Poll not found');
    }

    if (poll.creator.toString() !== userId) {
      throw new Error('You are not authorized to delete this poll');
    }

    if (poll.status === 'scheduled' || poll.votes.length > 0) {
      throw new Error('Cannot delete poll that has votes or is scheduled');
    }

    await Poll.findByIdAndDelete(pollId);
    return { message: 'Poll deleted successfully' };
  }

  /**
   * Get polls that are about to expire (for notifications)
   */
  static async getExpiringPolls(hoursUntilExpiry: number = 24) {
    const expiryTime = new Date();
    expiryTime.setHours(expiryTime.getHours() + hoursUntilExpiry);

    const expiringPolls = await Poll.find({
      status: 'active',
      preferredDate: { $lte: expiryTime },
      $expr: { $lt: [{ $size: '$votes' }, '$targetVotes'] }
    }).populate('creator', 'name email');

    return expiringPolls;
  }

  /**
   * Get popular subjects based on poll creation and voting
   */
  static async getPopularSubjects(limit: number = 5) {
    const popularSubjects = await Poll.aggregate([
      {
        $group: {
          _id: '$subject',
          pollCount: { $sum: 1 },
          totalVotes: { $sum: { $size: '$votes' } },
          averageVotes: { $avg: { $size: '$votes' } }
        }
      },
      {
        $addFields: {
          popularityScore: {
            $add: [
              { $multiply: ['$pollCount', 0.3] },
              { $multiply: ['$totalVotes', 0.7] }
            ]
          }
        }
      },
      { $sort: { popularityScore: -1 } },
      { $limit: limit },
      {
        $project: {
          subject: '$_id',
          pollCount: 1,
          totalVotes: 1,
          averageVotes: { $round: ['$averageVotes', 1] },
          popularityScore: { $round: ['$popularityScore', 1] },
          _id: 0
        }
      }
    ]);

    return popularSubjects;
  }
}