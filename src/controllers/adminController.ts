import { Response } from 'express';
import { AdminRequest } from '../middlewares/adminAuth';
import User from '../models/user';
import Session from '../models/Session';
import Poll from '../models/Poll';
import { clerkClient } from '@clerk/clerk-sdk-node';
import mongoose from 'mongoose';

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
        enrichedUser.clerkData = {
          imageUrl: clerkUser.imageUrl,
          lastSignInAt: clerkUser.lastSignInAt,
          createdAt: clerkUser.createdAt,
          emailAddresses: clerkUser.emailAddresses,
          phoneNumbers: clerkUser.phoneNumbers
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
      query.status = status;
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

    const formattedPolls = polls.map(poll => ({
      ...poll.toObject(),
      voteCount: poll.votes?.length || 0,
      votePercentage: poll.targetVotes > 0 
        ? ((poll.votes?.length || 0) / poll.targetVotes) * 100 
        : 0
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
  getAllPolls,
  deletePoll,
  getSystemAnalytics
};
