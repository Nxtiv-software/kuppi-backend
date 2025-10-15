// controllers/sessionController.ts
import { Request, Response } from 'express';
import Session from '../models/Session';
import Poll from '../models/Poll';
import User from '../models/user';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../middlewares/clerkAuth';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { userService } from '../services/userService';

// Get session requests for tutor (polls with >50% votes)
export const getSessionRequests = async (req: Request, res: Response) => {
  try {
    // Get tutor ID from authenticated user or URL parameter for testing
    const tutorId = (req as AuthenticatedRequest).auth?.userId || req.params.tutorId || 'temp_tutor_id';

    console.log('Getting session requests for tutor:', tutorId);
    
    // 🔍 Debug: Check all polls first
    const allPolls = await Poll.find({}).select('title voteCount targetVotes votes status acceptedBy');
    console.log('🔍 DEBUG: All polls in database:');
    allPolls.forEach(poll => {
      const votePercentage = poll.targetVotes ? (poll.votes.length / poll.targetVotes) * 100 : 0;
      console.log(`  - ${poll.title}: ${poll.votes.length}/${poll.targetVotes} votes (${votePercentage.toFixed(1)}%) - status: ${poll.status || 'active'}`);
    });

    // Find polls with vote percentage > 50% that don't have sessions yet
    const polls = await Poll.aggregate([
      {
        $addFields: {
          voteCount: { $size: '$votes' },
          votePercentage: {
            $cond: {
              if: { $eq: ['$targetVotes', 0] },
              then: 0,
              else: { $multiply: [{ $divide: [{ $size: '$votes' }, '$targetVotes'] }, 100] }
            }
          }
        }
      },
      {
        $match: {
          votePercentage: { $gte: 50 },
          subject: { $exists: true },
          status: { $nin: ['accepted', 'scheduled'] }, // Exclude accepted and scheduled polls
          acceptedBy: { $exists: false }, // Exclude polls that have been accepted by any tutor
          declinedBy: { $ne: tutorId } // Exclude polls declined by this tutor
        }
      },
      {
        $lookup: {
          from: 'sessions',
          localField: '_id',
          foreignField: 'pollId',
          as: 'session'
        }
      },
      {
        $match: {
          'session.0': { $exists: false } // No session exists for this poll
        }
      },
      {
        $sort: { createdAt: -1 }
      }
    ]);

    // Get user information for poll creators and voters
    const userIds = new Set<string>();
    polls.forEach(poll => {
      if (poll.creator) userIds.add(poll.creator.toString());
      if (poll.createdBy) userIds.add(poll.createdBy);
      poll.votes.forEach((vote: any) => userIds.add(vote.toString()));
    });

    const usersMap = await userService.getUsersInfo(Array.from(userIds));

    // Format the response to match frontend expectations
    const sessionRequests = polls.map(poll => {
      // Get creator information
      const creatorId = poll.createdBy || poll.creator?.toString();
      const creatorInfo = creatorId ? usersMap.get(creatorId) : null;

      // Get voters information
      const votersInfo = poll.votes.map((voterId: any) => {
        const voterInfo = usersMap.get(voterId.toString());
        return voterInfo ? {
          id: voterInfo.id,
          name: voterInfo.name,
          email: voterInfo.email
        } : {
          id: voterId.toString(),
          name: `User ${voterId.toString().slice(-6)}`,
          email: 'Unknown email'
        };
      });

      return {
        _id: poll._id,
        title: poll.title,
        subject: poll.subject,
        topic: poll.chapter, // Using chapter as topic
        chapter: poll.chapter, // Also include chapter field
        description: poll.description,
        preferredDate: poll.preferredDate, // ✅ Include preferred date from poll
        timeSlot: poll.timeSlot, // ✅ Include time slot from poll
        maxStudents: poll.maxStudents, // ✅ Include max students from poll
        voteCount: poll.voteCount,
        totalVotes: poll.targetVotes,
        votePercentage: Math.round(poll.votePercentage),
        createdAt: poll.createdAt,
        voters: poll.votes || [],
        votersInfo: votersInfo, // Add detailed voter info
        // Frontend expects 'creator' field
        creator: creatorInfo ? {
          id: creatorInfo.id,
          name: creatorInfo.name,
          email: creatorInfo.email,
          firstName: creatorInfo.firstName,
          lastName: creatorInfo.lastName
        } : {
          id: creatorId || 'unknown',
          name: poll.creatorName || 'Unknown User',
          email: 'Unknown email'
        },
        // Keep creatorInfo for backward compatibility
        creatorInfo: creatorInfo ? {
          id: creatorInfo.id,
          name: creatorInfo.name,
          email: creatorInfo.email,
          firstName: creatorInfo.firstName,
          lastName: creatorInfo.lastName
        } : {
          id: creatorId || 'unknown',
          name: poll.creatorName || 'Unknown User',
          email: 'Unknown email'
        }
      };
    });

    console.log(`📊 Found ${sessionRequests.length} session requests`);
    if (sessionRequests.length > 0) {
      console.log('🔍 First session request sample:', {
        title: sessionRequests[0].title,
        preferredDate: sessionRequests[0].preferredDate,
        timeSlot: sessionRequests[0].timeSlot,
        maxStudents: sessionRequests[0].maxStudents
      });
    }

    res.status(200).json({
      success: true,
      data: sessionRequests
    });
  } catch (error) {
    console.error('Error fetching session requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch session requests',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Accept a session request
export const acceptSessionRequest = async (req: Request, res: Response) => {
  try {
    console.log('Accept session request called for pollId:', req.params.pollId);
    console.log('Request body:', req.body);
    
    const { pollId } = req.params;
    // Get tutor ID from authenticated user or body for testing
    const tutorId = (req as AuthenticatedRequest).auth?.userId || req.body.tutorId || 'temp_tutor_id';
    const tutorName = req.body.tutorName || 'Test Tutor';
    const tutorEmail = req.body.tutorEmail || 'tutor@test.com';

    console.log('Tutor details:', { tutorId, tutorName, tutorEmail });

    // Check if poll exists and has >50% votes
    console.log('Finding poll with ID:', pollId);
    const poll = await Poll.findById(pollId);
    if (!poll) {
      console.log('Poll not found');
      return res.status(404).json({
        success: false,
        message: 'Poll not found'
      });
    }

    console.log('Poll found:', poll.title);
    console.log('Vote count:', poll.votes.length, 'Target votes:', poll.targetVotes);

    const votePercentage = poll.targetVotes > 0 ? (poll.votes.length / poll.targetVotes) * 100 : 0;
    console.log('Vote percentage:', votePercentage);
    
    if (votePercentage < 50) {
      console.log('Vote threshold not met');
      return res.status(400).json({
        success: false,
        message: 'Poll does not meet the 50% vote threshold'
      });
    }

    // Check if session already exists for this poll
    console.log('Checking for existing session...');
    const existingSession = await Session.findOne({ pollId });
    if (existingSession) {
      console.log('Session already exists');
      return res.status(400).json({
        success: false,
        message: 'Session already exists for this poll'
      });
    }

    // Mark the poll as accepted by this tutor and hide from all tutors
    console.log('Updating poll status...');
    const updateData: any = {
      status: 'accepted',
      acceptedBy: tutorId
    };
    
    await Poll.findByIdAndUpdate(pollId, updateData);

    console.log('Session request accepted successfully');
    res.status(200).json({
      success: true,
      message: 'Session request accepted successfully'
    });
  } catch (error) {
    console.error('Error accepting session request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept session request',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Decline a session request
export const declineSessionRequest = async (req: Request, res: Response) => {
  try {
    const { pollId } = req.params;
    const { reason } = req.body;
    
    // Get tutor ID from authenticated user
    const tutorId = (req as AuthenticatedRequest).auth?.userId || req.body.tutorId || 'temp_tutor_id';

    console.log('Declining session request for pollId:', pollId, 'by tutor:', tutorId);

    // Check if poll exists
    const poll = await Poll.findById(pollId);
    if (!poll) {
      return res.status(404).json({
        success: false,
        message: 'Poll not found'
      });
    }

    // Add tutor to declinedBy array if not already present
    if (!poll.declinedBy?.includes(tutorId)) {
      await Poll.findByIdAndUpdate(pollId, {
        $addToSet: { declinedBy: tutorId }
      });
      console.log('Added tutor to declinedBy list');
    } else {
      console.log('Tutor already in declinedBy list');
    }

    res.status(200).json({
      success: true,
      message: 'Session request declined successfully'
    });
  } catch (error) {
    console.error('Error declining session request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to decline session request',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Schedule a session
export const scheduleSession = async (req: Request, res: Response) => {
  try {
    const { pollId } = req.params;
    const {
      tutorName = 'Test Tutor',
      tutorEmail = 'tutor@test.com',
      date,
      time,
      duration,
      feePerStudent,
      maxStudents,
      meetingLink,
      materials,
      notes
    } = req.body;

    // Get tutor ID from authenticated user or body for testing
    const tutorId = (req as AuthenticatedRequest).auth?.userId || req.body.tutorId || 'temp_tutor_id';

    // Validate required fields
    if (!date || !time || !duration || feePerStudent === undefined || !maxStudents) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: date, time, duration, feePerStudent, maxStudents'
      });
    }

    // Check if poll exists
    const poll = await Poll.findById(pollId);
    if (!poll) {
      return res.status(404).json({
        success: false,
        message: 'Poll not found'
      });
    }

    // Check if session already exists
    const existingSession = await Session.findOne({ pollId });
    if (existingSession) {
      return res.status(400).json({
        success: false,
        message: 'Session already scheduled for this poll'
      });
    }

    console.log('Scheduling session for poll:', pollId);
    console.log('Poll details:', {
      title: poll.title,
      subject: poll.subject,
      voters: poll.votes,
      voterCount: poll.votes?.length || 0,
      maxStudents: poll.maxStudents // Log the poll's maxStudents for debugging
    });

    // Create the session - inherit maxStudents from poll, not from request body
    const actualMaxStudents = poll.maxStudents || Number(maxStudents); // Use poll's maxStudents, fallback to request body
    console.log(`📊 Setting session maxStudents: ${actualMaxStudents} (from poll: ${poll.maxStudents}, from request: ${maxStudents})`);
    
    const session = new Session({
      pollId,
      tutorId,
      tutorName,
      tutorEmail,
      subject: poll.subject,
      topic: poll.chapter,
      title: poll.title,
      description: poll.description,
      date: new Date(date),
      time,
      duration: Number(duration),
      feePerStudent: Number(feePerStudent),
      maxStudents: actualMaxStudents, // ✅ Use poll's maxStudents instead of request body
      enrolledStudents: poll.votes || [], // Auto-enroll all voters
      status: 'upcoming', // Explicitly set status
      meetingLink,
      materials: materials || [],
      notes
    });

    await session.save();
    
    console.log('Session created successfully:', {
      sessionId: session._id,
      enrolledStudents: session.enrolledStudents,
      enrolledCount: session.enrolledStudents.length
    });

    // Update poll status
    await Poll.findByIdAndUpdate(pollId, { 
      status: 'scheduled',
      sessionId: session._id
    });
    
    console.log('Poll status updated to scheduled');

    res.status(201).json({
      success: true,
      message: 'Session scheduled successfully',
      data: {
        ...session.toObject(),
        enrolledStudentsCount: session.enrolledStudents.length
      }
    });
  } catch (error) {
    console.error('Error scheduling session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to schedule session',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get scheduled sessions for a tutor
export const getMyScheduledSessions = async (req: Request, res: Response) => {
  try {
    // Get tutor ID from authenticated user or parameters for testing
    const tutorId = (req as AuthenticatedRequest).auth?.userId || req.params.tutorId || 'temp_tutor_id';

    // Reduced logging - only log every 10th call or if it's been more than 5 minutes
    const now = Date.now();
    const lastLogKey = `schedule_log_${tutorId}`;
    const lastLog = (global as any)[lastLogKey] || 0;
    
    if (now - lastLog > 300000) { // 5 minutes
      console.log('📅 Getting scheduled sessions for tutor:', tutorId);
      (global as any)[lastLogKey] = now;
    }

    const sessions = await Session.find({ tutorId })
      .sort({ date: 1 });

    // Only log count changes or first call
    const countKey = `session_count_${tutorId}`;
    const lastCount = (global as any)[countKey] || -1;
    if (sessions.length !== lastCount) {
      console.log(`📅 Found ${sessions.length} scheduled sessions for tutor`);
      (global as any)[countKey] = sessions.length;
    }

    // Format the response to include all necessary data for frontend
    const formattedSessions = await Promise.all(sessions.map(async (session) => {
      // Get enrolled students information
      const studentIds = session.enrolledStudents || [];
      const studentsInfo = studentIds.length > 0 ? await userService.getUsersInfo(studentIds.map(id => id.toString())) : new Map();
      
      const enrolledStudentsWithInfo = studentIds.map(studentId => {
        const studentInfo = studentsInfo.get(studentId.toString());
        return studentInfo ? {
          id: studentInfo.id,
          name: studentInfo.name,
          email: studentInfo.email,
          firstName: studentInfo.firstName,
          lastName: studentInfo.lastName
        } : {
          id: studentId.toString(),
          name: `Student ${studentId.toString().slice(-6)}`,
          email: 'Unknown email'
        };
      });

      return {
        _id: session._id,
        pollId: session.pollId,
        title: session.title,
        subject: session.subject,
        topic: session.topic,
        description: session.description,
        date: session.date,
        time: session.time,
        duration: session.duration,
        feePerStudent: session.feePerStudent,
        maxStudents: session.maxStudents,
        // Provide clean student count instead of raw IDs
        currentStudents: enrolledStudentsWithInfo.length,
        enrolledStudentsCount: enrolledStudentsWithInfo.length,
        // Provide clean student information without exposing raw user IDs
        enrolledStudentsInfo: enrolledStudentsWithInfo,
        status: session.status,
        meetingLink: session.meetingLink,
        materials: session.materials,
        attachments: session.attachments || [], // Include attachments
        announcements: session.announcements || [], // Include announcements
        notes: session.notes,
        tutorName: session.tutorName,
        tutorEmail: session.tutorEmail,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      };
    }));

    res.status(200).json({
      success: true,
      data: formattedSessions,
      count: formattedSessions.length
    });
  } catch (error) {
    console.error('Error fetching scheduled sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch scheduled sessions',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get sessions for a student (polls they voted on)
export const getMySessionsAsStudent = async (req: Request, res: Response) => {
  try {
    console.log('📚 getMySessionsAsStudent called');
    
    // Get student ID from authenticated user or parameters for testing
    const studentIdParam = (req as AuthenticatedRequest).auth?.userId || 
                          req.params.studentId || 
                          req.query.studentId || 
                          req.headers['x-user-id'] || 
                          'temp_student_id';
    
    const studentId = typeof studentIdParam === 'string' ? studentIdParam : String(studentIdParam);

    console.log('📚 Getting sessions for student:', studentId);

    // Method 1: Find sessions where student is directly enrolled
    const directlyEnrolledSessions = await Session.find({
      enrolledStudents: { $in: [studentId] }
    }).sort({ date: 1 });

    console.log('📚 Found directly enrolled sessions:', directlyEnrolledSessions.length);

    // Method 2: Find polls that this student voted on, then find sessions from those polls
    let pollBasedSessions: any[] = [];
    
    // Look for polls where the student's ID is in the votes array
    const pollsVotedOn = await Poll.find({
      votes: { $in: [studentId] }
    }).select('_id title description subject chapter');
    
    console.log('📊 Found polls voted on:', pollsVotedOn.length);
    
    if (pollsVotedOn.length > 0) {
      const pollIds = pollsVotedOn.map((poll: any) => poll._id.toString());
      
      pollBasedSessions = await Session.find({
        pollId: { $in: pollIds }
      }).sort({ date: 1 });
      
      console.log('🗳️ Found poll-based sessions:', pollBasedSessions.length);
    }

    // Method 3: Find tutor-created sessions where student showed interest and session got scheduled
    const interestedScheduledSessions = await Session.find({
      interestedStudents: { $in: [studentId] },
      status: { $in: ['scheduled', 'completed'] },
      pollId: { $exists: false } // Only tutor-created sessions
    }).sort({ date: 1 });
    
    console.log('🎯 Found interested scheduled sessions:', interestedScheduledSessions.length);

    // Combine and deduplicate sessions
    const allSessionsMap = new Map();
    
    // Add directly enrolled sessions
    directlyEnrolledSessions.forEach((session: any) => {
      allSessionsMap.set(session._id.toString(), session);
    });
    
    // Add poll-based sessions (this will overwrite if already present, which is fine)
    pollBasedSessions.forEach(session => {
      allSessionsMap.set(session._id.toString(), session);
    });

    // Add interested scheduled sessions
    interestedScheduledSessions.forEach((session: any) => {
      allSessionsMap.set(session._id.toString(), session);
    });

    const sessions = Array.from(allSessionsMap.values()).sort((a: any, b: any) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    console.log('📚 Total unique sessions found for student:', sessions.length);

    // Format sessions for student dashboard
    const formattedSessions = await Promise.all(sessions.map(async (session: any) => {
      // Get poll details if available
      const poll = pollsVotedOn.find((p: any) => p._id.toString() === session.pollId);
      
      // Get tutor information from Clerk
      const tutorInfo = await userService.getUserInfo(session.tutorId.toString());
      
      return {
        _id: session._id,
        title: session.title,
        subject: session.subject,
        topic: session.topic,
        description: session.description,
        date: session.date,
        time: session.time,
        duration: session.duration,
        feePerStudent: session.feePerStudent,
        maxStudents: session.maxStudents,
        currentStudents: session.enrolledStudents ? session.enrolledStudents.length : 0,
        status: session.status,
        meetingLink: session.meetingLink,
        materials: session.materials,
        attachments: session.attachments || [],
        announcements: session.announcements || [],
        notes: session.notes,
        // Clean tutor information without exposing raw IDs
        tutorName: tutorInfo?.name || session.tutorName || 'Anonymous Tutor',
        tutorEmail: tutorInfo?.email || session.tutorEmail,
        tutorInfo: tutorInfo ? {
          name: tutorInfo.name,
          email: tutorInfo.email,
          firstName: tutorInfo.firstName,
          lastName: tutorInfo.lastName,
          imageUrl: tutorInfo.imageUrl
        } : {
          name: session.tutorName || 'Anonymous Tutor',
          email: session.tutorEmail
        },
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        pollDetails: poll ? {
          title: poll.title,
          description: poll.description,
          subject: poll.subject,
          chapter: poll.chapter
        } : null
      };
    }));

    console.log('Formatted sessions for student dashboard:', formattedSessions.length);

    res.status(200).json({
      success: true,
      sessions: formattedSessions,
      message: `Found ${formattedSessions.length} scheduled sessions for student`
    });
  } catch (error) {
    console.error('Error fetching student sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student sessions',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get accepted session requests that need scheduling (for tutor's dashboard)
export const getAcceptedSessions = async (req: Request, res: Response) => {
  try {
    // Get tutor ID from authenticated user
    const tutorId = (req as AuthenticatedRequest).auth?.userId || req.params.tutorId || 'temp_tutor_id';

    console.log('Getting accepted sessions for tutor:', tutorId);

    // Find polls that this tutor has accepted but haven't been scheduled yet
    const acceptedPolls = await Poll.find({
      acceptedBy: tutorId,
      status: 'accepted'
    }).sort({ createdAt: -1 });

    // Check which ones don't have sessions yet
    const pollsWithoutSessions = [];
    for (const poll of acceptedPolls) {
      const existingSession = await Session.findOne({ pollId: poll._id });
      if (!existingSession) {
        pollsWithoutSessions.push(poll);
      }
    }

    // Get creator information for all polls
    const userIds = new Set<string>();
    pollsWithoutSessions.forEach(poll => {
      if (poll.creator) userIds.add(poll.creator.toString());
      if (poll.createdBy) userIds.add(poll.createdBy);
    });

    const usersMap = await userService.getUsersInfo(Array.from(userIds));

    // Format the response
    const acceptedSessions = pollsWithoutSessions.map(poll => {
      // Get creator information
      const creatorId = poll.createdBy || poll.creator?.toString();
      const creatorInfo = creatorId ? usersMap.get(creatorId) : null;

      return {
        _id: poll._id,
        title: poll.title,
        subject: poll.subject,
        topic: poll.chapter,
        description: poll.description,
        voteCount: poll.votes.length,
        totalVotes: poll.targetVotes,
        votePercentage: poll.targetVotes > 0 ? Math.round((poll.votes.length / poll.targetVotes) * 100) : 0,
        preferredDate: poll.preferredDate,
        timeSlot: poll.timeSlot,
        maxStudents: poll.maxStudents,
        voters: poll.votes,
        createdAt: poll.createdAt,
        acceptedAt: poll.updatedAt,
        // Add creator information for frontend
        creator: creatorInfo ? {
          id: creatorInfo.id,
          name: creatorInfo.name,
          email: creatorInfo.email,
          firstName: creatorInfo.firstName,
          lastName: creatorInfo.lastName
        } : {
          id: creatorId || 'unknown',
          name: poll.creatorName || 'Unknown User',
          email: 'Unknown email'
        }
      };
    });

    res.status(200).json({
      success: true,
      data: acceptedSessions,
      message: `Found ${acceptedSessions.length} accepted sessions awaiting scheduling`
    });
  } catch (error) {
    console.error('Error fetching accepted sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch accepted sessions',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/attachments');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow common file types
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|ppt|pptx|xls|xlsx|txt|zip|rar/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only allowed file types are permitted!'));
    }
  }
});

// Add meeting link to a session
export const addMeetingLink = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { meetingLink } = req.body;
    const tutorId = (req as AuthenticatedRequest).auth?.userId;

    console.log('🔗 Adding meeting link to session:', sessionId);
    console.log('🔗 Tutor ID:', tutorId);
    console.log('🔗 Meeting Link:', meetingLink);

    if (!meetingLink || !meetingLink.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Meeting link is required'
      });
    }

    // Validate URL format
    const urlPattern = /^https?:\/\/.+/;
    if (!urlPattern.test(meetingLink.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid meeting link (must start with http:// or https://)'
      });
    }

    // Find session and verify tutor ownership
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    if (session.tutorId.toString() !== tutorId) {
      return res.status(403).json({
        success: false,
        message: 'You can only add meeting links to your own sessions'
      });
    }

    // Update session with meeting link
    session.meetingLink = meetingLink.trim();
    await session.save();

    console.log('✅ Meeting link added successfully');

    res.status(200).json({
      success: true,
      message: 'Meeting link added successfully',
      data: {
        sessionId: session._id,
        meetingLink: session.meetingLink
      }
    });
  } catch (error) {
    console.error('❌ Error adding meeting link:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add meeting link',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Add attachment to a session
export const addSessionAttachment = [
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { description } = req.body;
      const tutorId = (req as AuthenticatedRequest).auth?.userId;
      const file = req.file;

      console.log('📎 Adding attachment to session:', sessionId);
      console.log('📎 Tutor ID:', tutorId);
      console.log('📎 File:', file?.originalname);
      console.log('📎 Description:', description);

      if (!file) {
        return res.status(400).json({
          success: false,
          message: 'File is required'
        });
      }

      // Find session and verify tutor ownership
      const session = await Session.findById(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          message: 'Session not found'
        });
      }

      if (session.tutorId.toString() !== tutorId) {
        return res.status(403).json({
          success: false,
          message: 'You can only add attachments to your own sessions'
        });
      }

      // Create attachment object
      const attachment = {
        fileName: file.filename,
        originalName: file.originalname,
        description: description || '',
        uploadedAt: new Date(),
        fileSize: file.size,
        mimeType: file.mimetype
      };

      // Initialize attachments array if it doesn't exist
      if (!session.attachments) {
        session.attachments = [];
      }

      // Add attachment to session
      session.attachments.push(attachment);
      await session.save();

      console.log('✅ Attachment added successfully');

      res.status(200).json({
        success: true,
        message: 'Attachment added successfully',
        data: {
          sessionId: session._id,
          attachment: attachment
        }
      });
    } catch (error) {
      console.error('❌ Error adding attachment:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to add attachment',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
];

// Add announcement to a session
export const addSessionAnnouncement = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;
    const tutorId = (req as AuthenticatedRequest).auth?.userId;

    console.log('📢 Adding announcement to session:', sessionId);
    console.log('📢 Tutor ID:', tutorId);
    console.log('📢 Message:', message);

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Announcement message is required'
      });
    }

    // Find session and verify tutor ownership
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    if (session.tutorId.toString() !== tutorId) {
      return res.status(403).json({
        success: false,
        message: 'You can only add announcements to your own sessions'
      });
    }

    // Create announcement object
    const announcement = {
      message: message.trim(),
      addedAt: new Date()
    };

    // Initialize announcements array if it doesn't exist
    if (!session.announcements) {
      session.announcements = [];
    }

    // Add announcement to session
    session.announcements.push(announcement);
    await session.save();

    console.log('✅ Announcement added successfully');

    res.status(200).json({
      success: true,
      message: 'Announcement added successfully',
      data: {
        sessionId: session._id,
        announcement: announcement
      }
    });
  } catch (error) {
    console.error('❌ Error adding announcement:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add announcement',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Download attachment from a session
export const downloadAttachment = async (req: Request, res: Response) => {
  try {
    const { sessionId, fileName } = req.params;
    const userId = (req as AuthenticatedRequest).auth?.userId;

    console.log('📥 Download request for file:', fileName);
    console.log('📥 Session ID:', sessionId);
    console.log('📥 User ID:', userId);

    // Find session
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Check if user is authorized (tutor or enrolled student)
    const isAuthorized = session.tutorId.toString() === userId || 
                        session.enrolledStudents.some((id: any) => id.toString() === userId);

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to download attachments from this session'
      });
    }

    // Find attachment
    const attachment = session.attachments?.find(att => att.fileName === fileName);
    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: 'Attachment not found'
      });
    }

    // File path
    const filePath = path.join(__dirname, '../../uploads/attachments', fileName);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found on server'
      });
    }

    // Set appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.originalName}"`);
    res.setHeader('Content-Type', attachment.mimeType);

    // Send file
    res.sendFile(filePath);

    console.log('✅ File sent successfully');
  } catch (error) {
    console.error('❌ Error downloading attachment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download attachment',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get available sessions for browsing (scheduled sessions with available spots)
export const getAvailableSessions = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).auth?.userId;
    const { subject, level, page = 1, limit = 10 } = req.query;

    console.log('📡 Fetching available sessions for browsing...');

    let query: any = {
      $or: [
        { status: 'upcoming', date: { $gte: new Date() } }, // Poll-based scheduled sessions
        { status: 'open_for_interest' }, // Tutor-created sessions open for interest
        { status: 'ready_to_schedule' }, // Tutor-created sessions ready to schedule but still accepting interest
        { status: 'scheduled', date: { $gte: new Date() } } // Scheduled sessions not yet completed
      ]
    };

    // If user is authenticated, we'll filter sessions based on their participation
    const userParticipationFilter = userId ? {
      $and: [
        // Don't show sessions where user is already enrolled
        { enrolledStudents: { $ne: userId } },
        // For scheduled tutor-created sessions, don't show if user showed interest (they'll see it in My Sessions)
        {
          $or: [
            { status: { $ne: 'scheduled' } }, // Show all non-scheduled sessions
            { interestedStudents: { $not: { $in: [userId] } } }, // Or scheduled sessions where user didn't show interest
            { pollId: { $exists: true } } // Or poll-based sessions (different logic)
          ]
        }
      ]
    } : {};

    // Combine the base query with user participation filter
    if (userId) {
      query = { $and: [query, userParticipationFilter] };
    }

    // Add subject filter if specified
    if (subject && subject !== 'all') {
      query.subject = subject;
    }

    const pageNum = parseInt(page.toString());
    const limitNum = parseInt(limit.toString());
    const skip = (pageNum - 1) * limitNum;

    // Get sessions that still have available spots
    const sessions = await Session.aggregate([
      {
        $match: query
      },
      {
        $addFields: {
          enrolledCount: { $size: '$enrolledStudents' },
          availableSpots: { $subtract: ['$maxStudents', { $size: '$enrolledStudents' }] },
          isFullyBooked: { $gte: [{ $size: '$enrolledStudents' }, '$maxStudents'] }
        }
      },
      {
        $match: {
          isFullyBooked: false // Only sessions with available spots
        }
      },
      {
        $lookup: {
          from: 'polls',
          localField: 'pollId',
          foreignField: '_id',
          as: 'poll'
        }
      },
      {
        $sort: { date: 1, createdAt: -1 }
      },
      {
        $skip: skip
      },
      {
        $limit: limitNum
      }
    ]);

    const total = await Session.countDocuments({
      ...query,
      $expr: { $lt: [{ $size: '$enrolledStudents' }, '$maxStudents'] }
    });

    // Get user information for tutors
    const tutorIds = sessions.map(session => session.tutorId).filter(id => id);
    const tutorsMap = await userService.getUsersInfo(tutorIds);

    // Format the response
    const formattedSessions = sessions.map(session => {
      const tutorInfo = tutorsMap.get(session.tutorId);
      const poll = session.poll?.[0];
      
      // Determine session source
      const source = session.pollId ? 'poll_based' : 'tutor_created';
      
      // Check if current user is already enrolled or has shown interest
      const isEnrolled = userId && session.enrolledStudents.some((studentId: any) => 
        studentId.toString() === userId.toString()
      );
      
      const hasShownInterest = userId && session.interestedStudents?.some((studentId: any) => 
        studentId.toString() === userId.toString()
      );

      return {
        id: session._id,
        title: session.title,
        subject: session.subject,
        topic: session.topic,
        description: session.description,
        instructor: tutorInfo?.name || session.tutorName || 'Smart Tutor',
        tutorId: session.tutorId,
        date: session.date,
        time: session.time,
        duration: session.duration,
        price: session.feePerStudent,
        enrolled: session.enrolledCount || session.enrolledStudents?.length || 0,
        maxStudents: session.maxStudents,
        availableSpots: Math.max(0, session.maxStudents - (session.enrolledStudents?.length || 0)),
        status: session.status,
        source, // 'poll_based' or 'tutor_created'
        isEnrolled,
        hasShownInterest,
        interestedStudents: session.interestedStudents || [],
        minStudents: session.minStudents || 1,
        pollId: session.pollId,
        // Add some mock data for UI consistency
        rating: 4.5 + Math.random() * 0.5,
        reviews: Math.floor(Math.random() * 200) + 50,
        level: poll?.targetVotes > 15 ? 'advanced' : 
               poll?.targetVotes > 10 ? 'intermediate' : 
               poll ? 'beginner' :
               // For tutor-created sessions, determine level by maxStudents or use intermediate as default
               session.maxStudents > 50 ? 'beginner' :
               session.maxStudents > 20 ? 'intermediate' : 'advanced',
        tags: [
          session.topic, 
          session.subject.replace('-', ' '),
          source === 'tutor_created' ? 'Tutor Session' : 'Community Request',
          session.maxStudents === 999 ? 'Unlimited' : `Max ${session.maxStudents}`
        ].filter(Boolean),
        createdAt: session.createdAt
      };
    });

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
    console.error('❌ Error fetching available sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available sessions',
      error: error.message
    });
  }
};

// Join a session (enroll in a scheduled session)
export const joinSession = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = (req as AuthenticatedRequest).auth?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    console.log(`📝 User ${userId} attempting to join session ${sessionId}`);

    // Find the session
    const session = await Session.findById(sessionId);
    if (!session) {
      console.log(`❌ Session ${sessionId} not found`);
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    console.log(`📋 Session found: ${session.title}, status: ${session.status}, enrolled: ${session.enrolledStudents.length}/${session.maxStudents}`);

    // Check if session is available for enrollment
    if (session.status !== 'upcoming' && session.status !== 'scheduled') {
      console.log(`❌ Session ${sessionId} is not available for enrollment (status: ${session.status})`);
      return res.status(400).json({
        success: false,
        message: `Session is not available for enrollment (current status: ${session.status})`
      });
    }

    // Check if session is in the future (only for scheduled sessions)
    if (session.date && new Date(session.date) <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot join past sessions'
      });
    }

    // Check if user is already enrolled
    const isAlreadyEnrolled = session.enrolledStudents.some((studentId: any) => 
      studentId.toString() === userId.toString()
    );

    console.log(`🔍 Checking if user ${userId} is already enrolled: ${isAlreadyEnrolled}`);

    if (isAlreadyEnrolled) {
      console.log(`❌ User ${userId} is already enrolled in session ${sessionId}`);
      return res.status(400).json({
        success: false,
        message: 'You are already enrolled in this session'
      });
    }

    // Check if session has available spots
    if (session.enrolledStudents.length >= session.maxStudents) {
      return res.status(400).json({
        success: false,
        message: 'Session is fully booked'
      });
    }

    // Add user to enrolled students
    session.enrolledStudents.push(userId);
    await session.save();

    console.log(`✅ User ${userId} successfully joined session ${sessionId}`);

    res.json({
      success: true,
      message: 'Successfully joined the session',
      data: {
        sessionId: session._id,
        enrolledCount: session.enrolledStudents.length,
        availableSpots: session.maxStudents - session.enrolledStudents.length
      }
    });

  } catch (error: any) {
    console.error('❌ Error joining session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to join session',
      error: error.message
    });
  }
};

// Create a new session by tutor
export const createTutorSession = async (req: Request, res: Response) => {
  try {
    const tutorId = (req as AuthenticatedRequest).auth?.userId;
    
    if (!tutorId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const {
      title,
      subject,
      topic,
      description,
      duration,
      feePerStudent,
      maxStudents,
      minStudents,
      schedulingNote,
      tutorName,
      tutorEmail
    } = req.body;

    console.log('🚀 Creating tutor session with data:', { 
      title, 
      subject, 
      topic, 
      tutorId, 
      tutorEmail,
      feePerStudent,
      maxStudents,
      minStudents 
    });

    // Validation
    if (!title || !subject || !topic || !description || !feePerStudent) {
      console.log('❌ Validation failed - missing required fields');
      return res.status(400).json({
        success: false,
        message: 'Required fields missing: title, subject, topic, description, feePerStudent'
      });
    }

    if (maxStudents < 1 || (minStudents && minStudents < 1)) {
      console.log('❌ Validation failed - invalid student limits');
      return res.status(400).json({
        success: false,
        message: 'Student limits must be positive numbers'
      });
    }

    // Create session
    const sessionData = {
      title,
      subject,
      topic,
      description,
      duration: parseFloat(duration) || 2,
      feePerStudent: parseFloat(feePerStudent),
      maxStudents: parseInt(maxStudents) || 20,
      minStudents: parseInt(minStudents) || 1,
      tutorId,
      tutorName: tutorName || 'Anonymous Tutor',
      tutorEmail: tutorEmail || '',
      status: 'open_for_interest',
      interestedStudents: [],
      enrolledStudents: [],
      schedulingNote,
      createdAt: new Date(),
      isScheduled: false,
      source: 'tutor_created' // Mark as tutor-created vs poll-based
    };

    console.log('📝 Creating session with processed data:', sessionData);

    const session = new Session(sessionData);
    await session.save();

    console.log(`✅ Tutor session created successfully: ${session._id}`);

    res.status(201).json({
      success: true,
      message: 'Session created successfully',
      data: session
    });

  } catch (error: any) {
    console.error('❌ Error creating tutor session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create session',
      error: error.message
    });
  }
};

// Get tutor's created sessions
export const getTutorCreatedSessions = async (req: Request, res: Response) => {
  try {
    const tutorId = (req as AuthenticatedRequest).auth?.userId;
    
    if (!tutorId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    console.log('Fetching created sessions for tutor:', tutorId);

    // Find sessions created by this tutor, excluding completed sessions
    const sessions = await Session.find({
      tutorId,
      source: 'tutor_created', // Only tutor-created sessions, not poll-based
      status: { $ne: 'completed' } // Exclude completed sessions
    })
    .lean();

    console.log(`Found ${sessions.length} active tutor-created sessions (excluding completed)`);

    // Sort sessions by priority:
    // 1. ready_to_schedule (highest priority)
    // 2. scheduled (with upcoming dates first)
    // 3. open_for_interest (newest first)
    const sortedSessions = sessions.sort((a, b) => {
      // Define status priority
      const statusPriority: Record<string, number> = {
        'ready_to_schedule': 1,
        'scheduled': 2,
        'open_for_interest': 3
      };

      const aPriority = statusPriority[a.status] || 4;
      const bPriority = statusPriority[b.status] || 4;

      // If different status priorities, sort by priority
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      // If same status, apply secondary sorting
      if (a.status === 'scheduled' && b.status === 'scheduled') {
        // For scheduled sessions, sort by date (upcoming first)
        if (a.date && b.date) {
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        }
        // If one has date and other doesn't, prioritize the one with date
        if (a.date && !b.date) return -1;
        if (!a.date && b.date) return 1;
      }

      // For same status or no specific sorting, sort by creation time (newest first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    res.json({
      success: true,
      data: sortedSessions
    });

  } catch (error: any) {
    console.error('❌ Error fetching tutor created sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch created sessions',
      error: error.message
    });
  }
};

// Show interest in a tutor-created session
export const showInterestInSession = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = (req as AuthenticatedRequest).auth?.userId;

    console.log(`👋 User ${userId} showing interest in session ${sessionId}`);

    // Validate sessionId format
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      console.log(`❌ Invalid sessionId format: ${sessionId}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid session ID format'
      });
    }

    if (!userId) {
      console.log(`❌ No userId found in request`);
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    // Find the session
    const session = await Session.findById(sessionId);
    if (!session) {
      console.log(`❌ Session ${sessionId} not found`);
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    console.log(`📋 Session found: ${session.title}, status: ${session.status}, current interested: ${session.interestedStudents?.length || 0}`);

    // Check if session is open for interest
    if (session.status !== 'open_for_interest' && session.status !== 'ready_to_schedule') {
      console.log(`❌ Session ${sessionId} is not accepting interest (status: ${session.status})`);
      return res.status(400).json({
        success: false,
        message: `Session is not accepting interest (current status: ${session.status})`
      });
    }

    // Check if user already showed interest
    const hasAlreadyShownInterest = session.interestedStudents?.some((studentId: any) => 
      studentId.toString() === userId.toString()
    );

    console.log(`🔍 Checking if user ${userId} already showed interest: ${hasAlreadyShownInterest}`);
    console.log(`📊 Current interested students: ${JSON.stringify(session.interestedStudents)}`);

    if (hasAlreadyShownInterest) {
      console.log(`❌ User ${userId} has already shown interest in session ${sessionId}`);
      return res.status(400).json({
        success: false,
        message: 'You have already shown interest in this session'
      });
    }

    // Add user to interested students
    if (!session.interestedStudents) {
      session.interestedStudents = [];
    }
    session.interestedStudents.push(userId);

    // Check if minimum interest threshold is met
    const interestedCount = session.interestedStudents.length;
    const minStudents = session.minStudents || 1;
    const maxStudents = session.maxStudents || 20;

    // For unlimited sessions (high maxStudents like 999), keep status as open_for_interest
    // Only change to ready_to_schedule for limited sessions when minimum is met
    const isUnlimitedSession = maxStudents >= 100; // Consider sessions with 100+ max as unlimited
    
    if (interestedCount >= minStudents && session.status === 'open_for_interest' && !isUnlimitedSession) {
      session.status = 'ready_to_schedule';
      console.log(`✅ Session ${sessionId} is now ready to schedule (${interestedCount}/${minStudents} interested)`);
    } else if (isUnlimitedSession) {
      console.log(`📢 Unlimited session ${sessionId} staying open for interest (${interestedCount} students interested)`);
    }

    await session.save();

    console.log(`✅ User ${userId} successfully showed interest in session ${sessionId}`);

    res.json({
      success: true,
      message: 'Successfully showed interest in the session',
      data: {
        sessionId: session._id,
        interestedCount: session.interestedStudents.length,
        minStudents: session.minStudents,
        status: session.status,
        readyToSchedule: session.status === 'ready_to_schedule'
      }
    });

  } catch (error: any) {
    console.error('❌ Error showing interest in session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to show interest in session',
      error: error.message
    });
  }
};

// Schedule a tutor-created session when ready
export const scheduleTutorSession = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const tutorId = (req as AuthenticatedRequest).auth?.userId;
    const { date, time } = req.body;

    if (!tutorId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!date || !time) {
      return res.status(400).json({
        success: false,
        message: 'Date and time are required'
      });
    }

    console.log(`📅 Tutor ${tutorId} scheduling session ${sessionId}`);

    // Find the session
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Verify tutor owns this session
    if (session.tutorId.toString() !== tutorId) {
      return res.status(403).json({
        success: false,
        message: 'You can only schedule your own sessions'
      });
    }

    // Check if session is ready to schedule
    if (session.status !== 'ready_to_schedule') {
      return res.status(400).json({
        success: false,
        message: 'Session is not ready to schedule. Need more interested students.'
      });
    }

    // Update session with schedule
    session.date = new Date(date);
    session.time = time;
    session.status = 'scheduled';
    session.isScheduled = true;
    
    // Move interested students to enrolled students
    if (session.interestedStudents && session.interestedStudents.length > 0) {
      session.enrolledStudents = [...session.interestedStudents];
    }

    await session.save();

    console.log(`✅ Session ${sessionId} scheduled successfully for ${date} at ${time}`);

    res.json({
      success: true,
      message: 'Session scheduled successfully',
      data: {
        sessionId: session._id,
        date: session.date,
        time: session.time,
        status: session.status,
        enrolledStudents: session.enrolledStudents.length
      }
    });

  } catch (error: any) {
    console.error('❌ Error scheduling tutor session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to schedule session',
      error: error.message
    });
  }
};

// Mark session as completed
export const markSessionCompleted = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const tutorId = (req as AuthenticatedRequest).auth?.userId;

    if (!tutorId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    console.log(`✅ Tutor ${tutorId} marking session ${sessionId} as completed`);

    // Find the session
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Verify tutor owns this session
    if (session.tutorId.toString() !== tutorId) {
      return res.status(403).json({
        success: false,
        message: 'You can only complete your own sessions'
      });
    }

    // Check if session is scheduled/upcoming
    if (session.status !== 'scheduled' && session.status !== 'upcoming') {
      return res.status(400).json({
        success: false,
        message: 'Only scheduled sessions can be marked as completed'
      });
    }

    // Update session status
    session.status = 'completed';
    await session.save();

    console.log(`✅ Session ${sessionId} marked as completed`);

    res.json({
      success: true,
      message: 'Session marked as completed successfully',
      data: {
        sessionId: session._id,
        status: session.status
      }
    });

  } catch (error: any) {
    console.error('❌ Error marking session as completed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark session as completed',
      error: error.message
    });
  }
};
