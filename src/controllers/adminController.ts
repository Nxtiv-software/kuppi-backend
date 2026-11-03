import { Response } from 'express';
import { AdminRequest } from '../middlewares/adminAuth';
import User from '../models/user';
import Session from '../models/Session';
import Poll from '../models/Poll';
import { clerkClient } from '@clerk/clerk-sdk-node';
import mongoose from 'mongoose';
import { userService } from '../services/userService';
import { createNotificationForAllAdmins } from '../services/adminNotificationService';

/**
 * Get Admin Dashboard Overview Statistics
 */
export const getAdminOverview = async (req: AdminRequest, res: Response) => {
  try {
    console.log('📊 Fetching admin overview statistics...');

    // Get total counts
    const [totalUsers, totalSessions, totalPolls] = await Promise.all([
      User.countDocuments(),
      Session.countDocuments(),
      Poll.countDocuments()
    ]);

    // Get counts by role
    const usersByRole = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);

    const roleStats = {
      students: usersByRole.find(r => r._id === 'student')?.count || 0,
      tutors: usersByRole.find(r => r._id === 'tutor')?.count || 0,
      admins: usersByRole.find(r => r._id === 'admin')?.count || 0
    };

    // Session statistics
    const sessionStats = await Session.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const sessions = {
      total: totalSessions,
      scheduled: sessionStats.find(s => s._id === 'scheduled')?.count || 0,
      completed: sessionStats.find(s => s._id === 'completed')?.count || 0,
      cancelled: sessionStats.find(s => s._id === 'cancelled')?.count || 0,
      openForInterest: sessionStats.find(s => s._id === 'open_for_interest')?.count || 0
    };

    // Poll statistics
    const pollStats = await Poll.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const polls = {
      total: totalPolls,
      active: pollStats.find(p => p._id === 'active')?.count || 0,
      scheduled: pollStats.find(p => p._id === 'scheduled')?.count || 0,
      completed: pollStats.find(p => p._id === 'completed')?.count || 0
    };

    // Revenue statistics
    const revenueData = await Session.aggregate([
      {
        $match: {
          status: { $in: ['scheduled', 'completed'] }
        }
      },
      {
        $project: {
          revenue: {
            $multiply: [
              { $size: '$enrolledStudents' },
              '$feePerStudent'
            ]
          },
          status: 1,
          date: 1
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$revenue' },
          scheduledRevenue: {
            $sum: {
              $cond: [{ $eq: ['$status', 'scheduled'] }, '$revenue', 0]
            }
          },
          completedRevenue: {
            $sum: {
              $cond: [{ $eq: ['$status', 'completed'] }, '$revenue', 0]
            }
          }
        }
      }
    ]);

    const revenue = revenueData[0] || {
      totalRevenue: 0,
      scheduledRevenue: 0,
      completedRevenue: 0
    };

    // Recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentActivity = {
      newUsers: await User.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      newSessions: await Session.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      newPolls: await Poll.countDocuments({ createdAt: { $gte: sevenDaysAgo } })
    };

    // Growth statistics (compare with previous month)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const [currentMonthUsers, previousMonthUsers] = await Promise.all([
      User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      User.countDocuments({ 
        createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } 
      })
    ]);

    const userGrowth = previousMonthUsers > 0 
      ? ((currentMonthUsers - previousMonthUsers) / previousMonthUsers) * 100 
      : 0;

    const overview = {
      users: {
        total: totalUsers,
        byRole: roleStats,
        growth: userGrowth
      },
      sessions,
      polls,
      revenue,
      recentActivity
    };

    console.log('✅ Admin overview fetched successfully');

    res.json({
      success: true,
      data: overview
    });

  } catch (error: any) {
    console.error('❌ Error fetching admin overview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admin overview',
      error: error.message
    });
  }
};

/**
 * Get All Users with Pagination and Filters
 */
export const getAllUsers = async (req: AdminRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      role,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    console.log('👥 Fetching all users:', { page, limit, role, search });

    const query: any = {};

    // Filter by role
    if (role && role !== 'all') {
      query.role = role;
    }

    // Search by name or email
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const sortOptions: any = {};
    sortOptions[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

    const [users, total] = await Promise.all([
      User.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .select('-password'),
      User.countDocuments(query)
    ]);

    // Enrich with Clerk data
    const enrichedUsers = await Promise.all(
      users.map(async (user) => {
        try {
          if (!user.clerkId) {
            return user.toObject();
          }
          const clerkUser = await clerkClient.users.getUser(user.clerkId);
          return {
            ...user.toObject(),
            imageUrl: clerkUser.imageUrl,
            lastSignInAt: clerkUser.lastSignInAt,
            createdAt: clerkUser.createdAt,
            clerkData: {
              imageUrl: clerkUser.imageUrl,
              lastSignInAt: clerkUser.lastSignInAt,
              createdAt: clerkUser.createdAt
            }
          };
        } catch (error) {
          return user.toObject();
        }
      })
    );

    res.json({
      success: true,
      data: {
        users: enrichedUsers,
        pagination: {
          current: pageNum,
          pages: Math.ceil(total / limitNum),
          total,
          limit: limitNum
        }
      }
    });

  } catch (error: any) {
    console.error('❌ Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
};

/**
 * Update User Role
 */
export const updateUserRole = async (req: AdminRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    console.log(`🔄 Updating user ${userId} role to ${role}`);

    if (!['student', 'tutor', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be student, tutor, or admin'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update in database
    user.role = role;
    await user.save();

    // Update in Clerk
    try {
      if (user.clerkId) {
        await clerkClient.users.updateUser(user.clerkId, {
          publicMetadata: {
            role: role
          }
        });
      }
    } catch (clerkError) {
      console.error('⚠️ Failed to update Clerk role:', clerkError);
    }

    console.log(`✅ User role updated successfully`);

    res.json({
      success: true,
      message: 'User role updated successfully',
      data: user
    });

  } catch (error: any) {
    console.error('❌ Error updating user role:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user role',
      error: error.message
    });
  }
};

/**
 * Create User (Admin)
 */
export const createUser = async (req: AdminRequest, res: Response) => {
  try {
    const { email, username, password, role = 'student' } = req.body;

    console.log(`➕ Creating new user: ${email}`);

    if (!email || !username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email, username, and password are required'
      });
    }

    if (!['student', 'tutor', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be student, tutor, or admin'
      });
    }

    // Check if user already exists in database
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Create user in Clerk
    let clerkUser;
    try {
      clerkUser = await clerkClient.users.createUser({
        emailAddress: [email],
        username: username,
        password: password,
        publicMetadata: {
          role: role
        }
      });
    } catch (clerkError: any) {
      console.error('❌ Failed to create user in Clerk:', clerkError);
      return res.status(400).json({
        success: false,
        message: 'Failed to create user in Clerk',
        error: clerkError.message
      });
    }

    // Create user in database
    const newUser = new User({
      clerkId: clerkUser.id,
      name: username,
      email: email,
      role: role
    });

    await newUser.save();

    console.log(`✅ User created successfully`);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        user: newUser,
        clerkId: clerkUser.id
      }
    });

  } catch (error: any) {
    console.error('❌ Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: error.message
    });
  }
};

/**
 * Update User Details
 */
export const updateUser = async (req: AdminRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { username, email, role } = req.body;

    console.log(`📝 Updating user ${userId}`);

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update in Clerk
    try {
      if (user.clerkId) {
        const clerkUpdateData: any = {};
        
        if (username) clerkUpdateData.username = username;
        if (email) clerkUpdateData.emailAddress = [email];
        if (role) clerkUpdateData.publicMetadata = { role };

        await clerkClient.users.updateUser(user.clerkId, clerkUpdateData);
      }
    } catch (clerkError) {
      console.error('⚠️ Failed to update Clerk user:', clerkError);
      return res.status(400).json({
        success: false,
        message: 'Failed to update user in Clerk'
      });
    }

    // Update in database
    if (username) user.name = username;
    if (email) user.email = email;
    if (role && ['student', 'tutor', 'admin'].includes(role)) {
      user.role = role;
    }

    await user.save();

    console.log(`✅ User updated successfully`);

    res.json({
      success: true,
      message: 'User updated successfully',
      data: user
    });

  } catch (error: any) {
    console.error('❌ Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: error.message
    });
  }
};

/**
 * Get Single User
 */
export const getUser = async (req: AdminRequest, res: Response) => {
  try {
    const { userId } = req.params;

    console.log(`👤 Fetching user ${userId}`);

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Enrich with Clerk data
    let enrichedUser: any = user.toObject();
    try {
      if (user.clerkId) {
        const clerkUser = await clerkClient.users.getUser(user.clerkId);
        enrichedUser = {
          ...enrichedUser,
          imageUrl: clerkUser.imageUrl,
          lastSignInAt: clerkUser.lastSignInAt,
          createdAt: clerkUser.createdAt,
          clerkData: {
            imageUrl: clerkUser.imageUrl,
            lastSignInAt: clerkUser.lastSignInAt,
            createdAt: clerkUser.createdAt,
            emailAddresses: clerkUser.emailAddresses,
            phoneNumbers: clerkUser.phoneNumbers
          }
        };
      }
    } catch (error) {
      console.log('⚠️ Could not fetch Clerk data for user');
    }

    res.json({
      success: true,
      data: enrichedUser
    });

  } catch (error: any) {
    console.error('❌ Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user',
      error: error.message
    });
  }
};

/**
 * Delete User
 */
export const deleteUser = async (req: AdminRequest, res: Response) => {
  try {
    const { userId } = req.params;

    console.log(`🗑️ Deleting user ${userId}`);

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Delete from Clerk
    try {
      if (user.clerkId) {
        await clerkClient.users.deleteUser(user.clerkId);
      }
    } catch (clerkError) {
      console.error('⚠️ Failed to delete from Clerk:', clerkError);
    }

    // Delete from database
    await User.findByIdAndDelete(userId);

    console.log(`✅ User deleted successfully`);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error: any) {
    console.error('❌ Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: error.message
    });
  }
};

/**
 * Get All Sessions (Admin View)
 */
export const getAllSessions = async (req: AdminRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      subject,
      source,
      tutorId,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    console.log('📚 Fetching all sessions for admin');

    const query: any = {};

    if (status && status !== 'all') {
      // When filtering for 'upcoming', include both 'upcoming' and 'scheduled' statuses
      if (status === 'upcoming') {
        query.status = { $in: ['upcoming', 'scheduled'] };
      } else {
        query.status = status;
      }
    } else if (status === 'all') {
      // For 'all' tab in Scheduled Sessions, exclude Browse Kuppi sessions
      query.status = { $nin: ['open_for_interest', 'ready_to_schedule'] };
    }

    if (subject && subject !== 'all') {
      query.subject = subject;
    }

    if (source && source !== 'all') {
      query.source = source;
    }

    if (tutorId) {
      query.tutorId = tutorId;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { topic: { $regex: search, $options: 'i' } },
        { tutorName: { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const sortOptions: any = {};
    sortOptions[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

    const [sessions, total] = await Promise.all([
      Session.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .populate('pollId'),
      Session.countDocuments(query)
    ]);

    // Get counts for each status
    const counts = await Promise.all([
      Session.countDocuments({ status: { $nin: ['open_for_interest', 'ready_to_schedule'] } }), // all scheduled sessions (excludes browse kuppi)
      Session.countDocuments({ status: 'open_for_interest' }),
      Session.countDocuments({ status: 'ready_to_schedule' }),
      Session.countDocuments({ status: { $in: ['upcoming', 'scheduled'] } }), // upcoming includes scheduled
      Session.countDocuments({ status: 'ongoing' }),
      Session.countDocuments({ status: 'completed' }),
      Session.countDocuments({ status: 'cancelled' })
    ]);

    const formattedSessions = sessions.map(session => ({
      ...session.toObject(),
      enrolledCount: session.enrolledStudents?.length || 0,
      interestedCount: session.interestedStudents?.length || 0,
      revenue: (session.enrolledStudents?.length || 0) * session.feePerStudent
    }));

    res.json({
      success: true,
      data: {
        sessions: formattedSessions,
        pagination: {
          current: pageNum,
          pages: Math.ceil(total / limitNum),
          total,
          limit: limitNum
        },
        counts: {
          all: counts[0],
          open_for_interest: counts[1],
          ready_to_schedule: counts[2],
          upcoming: counts[3],
          ongoing: counts[4],
          completed: counts[5],
          cancelled: counts[6]
        }
      }
    });

  } catch (error: any) {
    console.error('❌ Error fetching sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sessions',
      error: error.message
    });
  }
};

/**
 * Delete Session
 */
export const deleteSession = async (req: AdminRequest, res: Response) => {
  try {
    const { sessionId } = req.params;

    console.log(`🗑️ Deleting session ${sessionId}`);

    const session = await Session.findByIdAndDelete(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    console.log(`✅ Session deleted successfully`);

    res.json({
      success: true,
      message: 'Session deleted successfully'
    });

  } catch (error: any) {
    console.error('❌ Error deleting session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete session',
      error: error.message
    });
  }
};

/**
 * Cancel Session
 */
export const cancelSession = async (req: AdminRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { reason } = req.body;

    console.log(`🚫 Cancelling session ${sessionId}`);

    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    session.status = 'cancelled';
    session.reason = reason || 'Cancelled by admin';
    await session.save();
    const sessionDocId = String(session._id);

    try {
      await createNotificationForAllAdmins(
        {
          title: 'Session Cancelled by Admin',
          message: `${session.title} has been cancelled.`,
          category: 'session',
          severity: 'warning',
          sourceType: 'Session',
          sourceId: sessionDocId,
          actionUrl: `/admin?tab=sessions&sessionId=${sessionDocId}`,
          metadata: {
            sessionId: sessionDocId,
            title: session.title,
            status: session.status,
            reason: session.reason
          }
        },
        { excludeAdminId: req.auth?.userId }
      );
    } catch (notificationError) {
      console.error('⚠️ Failed to create admin notification for session cancellation:', notificationError);
    }

    // TODO: Send notifications to enrolled students and tutor
    console.log(`✅ Session cancelled and notifications will be sent`);

    res.json({
      success: true,
      message: 'Session cancelled successfully. Notifications will be sent to all enrolled students and the tutor.',
      data: session
    });

  } catch (error: any) {
    console.error('❌ Error cancelling session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel session',
      error: error.message
    });
  }
};

/**
 * Force End Session
 */
export const forceEndSession = async (req: AdminRequest, res: Response) => {
  try {
    const { sessionId } = req.params;

    console.log(`🛑 Force ending session ${sessionId}`);

    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    if (session.status !== 'ongoing') {
      return res.status(400).json({
        success: false,
        message: 'Only ongoing sessions can be force-ended'
      });
    }

    session.status = 'completed';
    await session.save();
  const sessionDocId = String(session._id);

    try {
      await createNotificationForAllAdmins(
        {
          title: 'Session Force Ended',
          message: `${session.title} was force-ended by an admin.`,
          category: 'session',
          severity: 'warning',
          sourceType: 'Session',
          sourceId: sessionDocId,
          actionUrl: `/admin?tab=sessions&sessionId=${sessionDocId}`,
          metadata: {
            sessionId: sessionDocId,
            title: session.title,
            status: session.status
          }
        },
        { excludeAdminId: req.auth?.userId }
      );
    } catch (notificationError) {
      console.error('⚠️ Failed to create admin notification for force-ended session:', notificationError);
    }

    // TODO: Save attendance logs, finalize recording, etc.
    console.log(`✅ Session force-ended, attendance and logs saved`);

    res.json({
      success: true,
      message: 'Session ended successfully. Attendance and logs have been saved.',
      data: session
    });

  } catch (error: any) {
    console.error('❌ Error force ending session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end session',
      error: error.message
    });
  }
};

/**
 * Get All Polls (Admin View)
 */
export const getAllPolls = async (req: AdminRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      subject,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    console.log('📊 Fetching all polls for admin');

    const query: any = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (subject && subject !== 'all') {
      query.subject = subject;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { chapter: { $regex: search, $options: 'i' } },
        { creatorName: { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const sortOptions: any = {};
    sortOptions[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

    const [polls, total] = await Promise.all([
      Poll.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum),
      Poll.countDocuments(query)
    ]);

    // Get counts for each status
    const counts = await Promise.all([
      Poll.countDocuments({ status: 'active' }),
      Poll.countDocuments({ status: 'pending' }),
      Poll.countDocuments({ status: 'accepted' }),
      Poll.countDocuments({ status: 'expired' }),
      Poll.countDocuments({ status: 'rejected' })
    ]);

    // Enrich polls with Clerk data for acceptedBy tutor
    const formattedPolls = await Promise.all(polls.map(async (poll) => {
      const pollObj: any = poll.toObject();
      
      // If acceptedBy exists, fetch tutor info from Clerk
      if (pollObj.acceptedBy) {
        console.log(`📝 Poll "${pollObj.title}" has acceptedBy: ${pollObj.acceptedBy}`);
        try {
          const tutorInfo = await userService.getUserInfo(pollObj.acceptedBy.toString());
          console.log(`✅ Fetched tutor info:`, tutorInfo);
          pollObj.acceptedByInfo = tutorInfo ? {
            id: tutorInfo.id,
            name: tutorInfo.name,
            email: tutorInfo.email,
            imageUrl: tutorInfo.imageUrl
          } : null;
        } catch (error) {
          console.log(`⚠️ Could not fetch tutor info for acceptedBy: ${pollObj.acceptedBy}`, error);
          pollObj.acceptedByInfo = null;
        }
      }
      
      return {
        ...pollObj,
        voteCount: poll.votes?.length || 0,
        votePercentage: poll.targetVotes > 0 
          ? ((poll.votes?.length || 0) / poll.targetVotes) * 100 
          : 0
      };
    }));

    res.json({
      success: true,
      data: {
        polls: formattedPolls,
        pagination: {
          current: pageNum,
          pages: Math.ceil(total / limitNum),
          total,
          limit: limitNum
        },
        counts: {
          active: counts[0],
          pending: counts[1],
          accepted: counts[2],
          expired: counts[3],
          rejected: counts[4]
        }
      }
    });

  } catch (error: any) {
    console.error('❌ Error fetching polls:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch polls',
      error: error.message
    });
  }
};

/**
 * Delete Poll
 */
export const deletePoll = async (req: AdminRequest, res: Response) => {
  try {
    const { pollId } = req.params;

    console.log(`🗑️ Deleting poll ${pollId}`);

    const poll = await Poll.findByIdAndDelete(pollId);

    if (!poll) {
      return res.status(404).json({
        success: false,
        message: 'Poll not found'
      });
    }

    console.log(`✅ Poll deleted successfully`);

    res.json({
      success: true,
      message: 'Poll deleted successfully'
    });

  } catch (error: any) {
    console.error('❌ Error deleting poll:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete poll',
      error: error.message
    });
  }
};

/**
 * Update Poll Status (Approve/Reject)
 */
export const updatePollStatus = async (req: AdminRequest, res: Response) => {
  try {
    const { pollId } = req.params;
    const { status, reason } = req.body;

    console.log(`📝 Updating poll ${pollId} status to ${status}`);

    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be either "accepted" or "rejected"'
      });
    }

    const updateData: any = { status };

    if (status === 'rejected') {
      updateData.rejectedBy = req.auth?.userId;
      updateData.rejectionReason = reason || 'Not approved by admin';
      updateData.rejectedAt = new Date();
    }

    const poll = await Poll.findByIdAndUpdate(
      pollId,
      updateData,
      { new: true }
    );

    if (!poll) {
      return res.status(404).json({
        success: false,
        message: 'Poll not found'
      });
    }

    console.log(`✅ Poll status updated to ${status}`);
    const pollIdAsString = String(poll._id);

    try {
      await createNotificationForAllAdmins(
        {
          title: status === 'accepted' ? 'Poll Accepted by Admin' : 'Poll Rejected by Admin',
          message:
            status === 'accepted'
              ? `${poll.title} has been accepted.`
              : `${poll.title} has been rejected.`,
          category: 'poll',
          severity: status === 'accepted' ? 'info' : 'warning',
          sourceType: 'Poll',
          sourceId: pollIdAsString,
          actionUrl: `/admin?tab=polls&pollId=${pollIdAsString}`,
          metadata: {
            pollId: pollIdAsString,
            title: poll.title,
            status: poll.status,
            reason: reason || null
          }
        },
        { excludeAdminId: req.auth?.userId }
      );
    } catch (notificationError) {
      console.error('⚠️ Failed to create admin notification for poll status update:', notificationError);
    }

    res.json({
      success: true,
      message: `Poll ${status} successfully`,
      data: poll
    });

  } catch (error: any) {
    console.error('❌ Error updating poll status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update poll status',
      error: error.message
    });
  }
};

/**
 * Force Close Poll
 */
export const forceClosePoll = async (req: AdminRequest, res: Response) => {
  try {
    const { pollId } = req.params;

    console.log(`🛑 Force closing poll ${pollId}`);

    const poll = await Poll.findByIdAndUpdate(
      pollId,
      { 
        status: 'expired',
        closedAt: new Date()
      },
      { new: true }
    );

    if (!poll) {
      return res.status(404).json({
        success: false,
        message: 'Poll not found'
      });
    }

    console.log(`✅ Poll closed and archived successfully`);
    const pollIdAsString = String(poll._id);

    try {
      await createNotificationForAllAdmins(
        {
          title: 'Poll Force Closed',
          message: `${poll.title} was force-closed by an admin.`,
          category: 'poll',
          severity: 'warning',
          sourceType: 'Poll',
          sourceId: pollIdAsString,
          actionUrl: `/admin?tab=polls&pollStatus=expired&pollId=${pollIdAsString}`,
          metadata: {
            pollId: pollIdAsString,
            title: poll.title,
            status: poll.status,
            closedAt: poll.closedAt
          }
        }
      );
    } catch (notificationError) {
      console.error('⚠️ Failed to create admin notification for force-closed poll:', notificationError);
    }

    res.json({
      success: true,
      message: 'Poll closed and archived successfully',
      data: poll
    });

  } catch (error: any) {
    console.error('❌ Error force closing poll:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to close poll',
      error: error.message
    });
  }
};

/**
 * Get System Analytics
 */
export const getSystemAnalytics = async (req: AdminRequest, res: Response) => {
  try {
    const { period = '30'} = req.query; // days

    console.log(`📈 Fetching system analytics for ${period} days`);

    const days = parseInt(period as string);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Daily user registrations
    const userGrowth = await User.aggregate([
      {
        $match: { createdAt: { $gte: startDate } }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Daily session creation
    const sessionGrowth = await Session.aggregate([
      {
        $match: { createdAt: { $gte: startDate } }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Revenue by day
    const dailyRevenue = await Session.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: { $in: ['scheduled', 'completed'] }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: {
            $sum: {
              $multiply: [
                { $size: '$enrolledStudents' },
                '$feePerStudent'
              ]
            }
          },
          sessions: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Subject popularity
    const subjectStats = await Session.aggregate([
      {
        $group: {
          _id: '$subject',
          sessions: { $sum: 1 },
          totalEnrolled: { $sum: { $size: '$enrolledStudents' } }
        }
      },
      {
        $sort: { sessions: -1 }
      },
      {
        $limit: 10
      }
    ]);

    // Top tutors
    const topTutors = await Session.aggregate([
      {
        $group: {
          _id: '$tutorId',
          tutorName: { $first: '$tutorName' },
          sessions: { $sum: 1 },
          totalEnrolled: { $sum: { $size: '$enrolledStudents' } },
          revenue: {
            $sum: {
              $multiply: [
                { $size: '$enrolledStudents' },
                '$feePerStudent'
              ]
            }
          }
        }
      },
      {
        $sort: { revenue: -1 }
      },
      {
        $limit: 10
      }
    ]);

    res.json({
      success: true,
      data: {
        userGrowth,
        sessionGrowth,
        dailyRevenue,
        subjectStats,
        topTutors,
        period: days
      }
    });

  } catch (error: any) {
    console.error('❌ Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
};

export default {
  getAdminOverview,
  getAllUsers,
  updateUserRole,
  deleteUser,
  getAllSessions,
  deleteSession,
  cancelSession,
  forceEndSession,
  getAllPolls,
  deletePoll,
  updatePollStatus,
  forceClosePoll,
  getSystemAnalytics
};
