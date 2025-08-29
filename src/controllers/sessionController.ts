// controllers/sessionController.ts
import { Request, Response } from 'express';
import Session from '../models/Session';
import Poll from '../models/Poll';
import User from '../models/user';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../middlewares/clerkAuth';

// Get session requests for tutor (polls with >50% votes)
export const getSessionRequests = async (req: Request, res: Response) => {
  try {
    // Get tutor ID from authenticated user or URL parameter for testing
    const tutorId = (req as AuthenticatedRequest).auth?.userId || req.params.tutorId || 'temp_tutor_id';

    console.log('Getting session requests for tutor:', tutorId);

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

    // Format the response to match frontend expectations
    const sessionRequests = polls.map(poll => ({
      _id: poll._id,
      title: poll.title,
      subject: poll.subject,
      topic: poll.chapter, // Using chapter as topic
      description: poll.description,
      voteCount: poll.voteCount,
      totalVotes: poll.targetVotes,
      votePercentage: Math.round(poll.votePercentage),
      createdAt: poll.createdAt,
      voters: poll.votes || []
    }));

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
      voterCount: poll.votes?.length || 0
    });

    // Create the session
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
      maxStudents: Number(maxStudents),
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
    const formattedSessions = sessions.map(session => ({
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
      enrolledStudents: session.enrolledStudents,
      currentStudents: session.enrolledStudents?.length || 0,
      status: session.status,
      meetingLink: session.meetingLink,
      materials: session.materials,
      notes: session.notes,
      tutorName: session.tutorName,
      tutorEmail: session.tutorEmail,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
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
    console.log('📚 Auth object:', (req as AuthenticatedRequest).auth);
    
    // Get student ID from authenticated user or parameters for testing
    const studentIdParam = (req as AuthenticatedRequest).auth?.userId || 
                          req.params.studentId || 
                          req.query.studentId || 
                          req.headers['x-user-id'] || 
                          'temp_student_id';
    
    const studentId = typeof studentIdParam === 'string' ? studentIdParam : String(studentIdParam);

    console.log('📚 Getting sessions for student:', studentId);
    console.log('📚 Student ID source:', (req as AuthenticatedRequest).auth?.userId ? 'AUTH' : 'FALLBACK');

    // For Clerk user IDs (which are strings), we need to handle them differently
    // Clerk user IDs are not MongoDB ObjectIds, so we need to store them as strings in our polls
    
    // Step 1: Find polls that this student voted on
    let pollsVotedOn: any[] = [];
    
    console.log('🔍 Looking for polls voted on by student:', studentId);
    
    // Look for polls where the student's ID is in the votes array
    pollsVotedOn = await Poll.find({
      votes: { $in: [studentId] }
    }).select('_id title description subject chapter');
    
    console.log('📊 Found polls (string approach):', pollsVotedOn.length);
    
    // If no polls found with string comparison and it looks like an ObjectId, try ObjectId
    if (pollsVotedOn.length === 0 && mongoose.Types.ObjectId.isValid(studentId)) {
      try {
        const objectId = new mongoose.Types.ObjectId(studentId);
        pollsVotedOn = await Poll.find({
          votes: objectId
        }).select('_id title description subject chapter');
        
        console.log('📊 Found polls (ObjectId approach):', pollsVotedOn.length);
      } catch (err) {
        console.log('❌ ObjectId conversion failed:', err);
      }
    }

    // Step 2: Find sessions created from these polls
    let sessions: any[] = [];
    if (pollsVotedOn.length > 0) {
      // Convert ObjectIds to strings for comparison
      const pollIds = pollsVotedOn.map(poll => poll._id.toString());
      
      console.log('🔍 Looking for sessions with poll IDs (as strings):', pollIds);
      
      // First, let's try to find ANY sessions to see what's in the database
      const allSessions = await Session.find({});
      console.log('📋 All sessions in database:', allSessions.length);
      allSessions.forEach(session => {
        console.log(`📋 Session ${session._id}: pollId=${session.pollId}, status=${session.status}`);
      });
      
      // Find sessions using string poll IDs
      sessions = await Session.find({
        pollId: { $in: pollIds }
        // Remove status filter to find all sessions regardless of status
      })
      .sort({ createdAt: -1 });
      
      console.log('📚 Found sessions with string pollId filter:', sessions.length);
      
      // If we found sessions, populate the poll data manually
      if (sessions.length > 0) {
        for (let session of sessions) {
          const poll = pollsVotedOn.find(p => p._id.toString() === session.pollId);
          if (poll) {
            session = { ...session.toObject(), pollData: poll };
          }
        }
      }
      
      // Log session details for debugging
      sessions.forEach(session => {
        console.log(`📚 Session: ${session._id}, Status: ${session.status}, PollId: ${session.pollId}`);
      });
    }

    console.log('Total sessions found for student:', sessions.length);

    // Format sessions for student dashboard
    const formattedSessions = sessions.map(session => {
      // Use pollData if available (manually populated), otherwise try pollId
      const pollDetails = session.pollData || session.pollId;
      
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
        notes: session.notes,
        tutorName: session.tutorName,
        tutorEmail: session.tutorEmail,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        pollDetails: pollDetails ? {
          title: pollDetails.title,
          description: pollDetails.description,
          subject: pollDetails.subject,
          chapter: pollDetails.chapter
        } : null
      };
    });

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

    // Format the response
    const acceptedSessions = pollsWithoutSessions.map(poll => ({
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
      acceptedAt: poll.updatedAt
    }));

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
