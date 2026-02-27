import { Resend } from 'resend';
import User from '../models/user';

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

/**
 * Send email using Resend
 */
export const sendEmail = async (options: EmailOptions): Promise<boolean> => {
  try {
    const { to, subject, html } = options;

    // Convert single email to array for consistent handling
    const recipients = Array.isArray(to) ? to : [to];

    console.log(`📧 Sending email to ${recipients.length} recipient(s): ${subject}`);

    const { data, error } = await resend.emails.send({
      from: 'Kuppi <onboarding@resend.dev>',
      to: recipients,
      subject,
      html
    });

    if (error) {
      console.error('❌ Email send error:', error);
      return false;
    }

    console.log('✅ Email sent successfully:', data);
    return true;

  } catch (error) {
    console.error('❌ Failed to send email:', error);
    return false;
  }
};

/**
 * Get all student emails from database
 */
export const getAllStudentEmails = async (): Promise<string[]> => {
  try {
    console.log('📧 Fetching all student emails from database...');
    const students = await User.find({ role: 'student' }).select('email');
    console.log(`📧 Found ${students.length} students in database`);
    const emails = students.map(student => student.email).filter(email => email);
    console.log(`📧 Valid emails: ${emails.length}`, emails);
    return emails;
  } catch (error) {
    console.error('❌ Failed to fetch student emails:', error);
    return [];
  }
};

/**
 * Get all tutor emails from database (optionally filtered by subject)
 */
export const getTutorEmails = async (subject?: string): Promise<string[]> => {
  try {
    const query: any = { role: 'tutor' };
    
    // If subject is provided, filter tutors by subject (if your User model has a subjects field)
    // For now, we'll get all tutors regardless of subject
    const tutors = await User.find(query).select('email');
    return tutors.map(tutor => tutor.email).filter(email => email);
  } catch (error) {
    console.error('❌ Failed to fetch tutor emails:', error);
    return [];
  }
};

/**
 * Get emails of users who voted on a poll
 */
export const getVoterEmails = async (voterIds: (string | any)[]): Promise<string[]> => {
  try {
    // Convert ObjectIds to strings for query
    const voterIdStrings = voterIds.map(id => id.toString());
    
    // Query by clerkId (since voters use Clerk authentication)
    const voters = await User.find({ 
      clerkId: { $in: voterIdStrings } 
    }).select('email');

    console.log(`📧 Found ${voters.length} voter emails from ${voterIds.length} voter IDs`);
    
    return voters.map(voter => voter.email).filter(email => email);
  } catch (error) {
    console.error('❌ Failed to fetch voter emails:', error);
    return [];
  }
};

/**
 * Send poll created notification to all students
 */
export const sendPollCreatedEmail = async (pollData: {
  title: string;
  subject: string;
  chapter: string;
  description: string;
  preferredDate: Date;
  timeSlot: string;
  creatorName: string;
}): Promise<boolean> => {
  try {
    console.log('📧 ===== SENDING POLL CREATED EMAIL =====');
    console.log('📧 Poll:', pollData.title);
    
    const allStudentEmails = await getAllStudentEmails();

    if (allStudentEmails.length === 0) {
      console.log('⚠️ No student emails found - cannot send poll created email');
      return false;
    }

    // 🔧 TESTING MODE: Only send to account owner due to FREE tier limitation
    const studentEmails = allStudentEmails.filter(email => email === 'nxtivsoftware@gmail.com');
    
    if (studentEmails.length === 0) {
      console.log('⚠️ Account owner not in student list - cannot send test email');
      return false;
    }

    console.log(`📧 TESTING MODE: Sending poll created email to account owner only (${studentEmails.length} recipients)`);
    console.log(`📧 Would normally notify ${allStudentEmails.length} students:`, allStudentEmails);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .poll-info { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
          .info-row { margin: 10px 0; }
          .label { font-weight: bold; color: #667eea; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; color: #888; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🗳️ New Session Poll Created!</h1>
          </div>
          <div class="content">
            <p>Hello Student,</p>
            <p><strong>${pollData.creatorName}</strong> has created a new study session poll. Cast your vote to help make it happen!</p>
            
            <div class="poll-info">
              <h2>${pollData.title}</h2>
              <div class="info-row"><span class="label">Subject:</span> ${pollData.subject}</div>
              <div class="info-row"><span class="label">Chapter:</span> ${pollData.chapter}</div>
              <div class="info-row"><span class="label">Description:</span> ${pollData.description}</div>
              <div class="info-row"><span class="label">Preferred Date:</span> ${new Date(pollData.preferredDate).toLocaleDateString()}</div>
              <div class="info-row"><span class="label">Time Slot:</span> ${pollData.timeSlot}</div>
            </div>

            <p>Vote now to show your interest! When this poll reaches 50% votes, tutors will be notified to schedule the session.</p>

            <a href="http://localhost:5173/student-dashboard" class="button">Vote Now →</a>

            <div class="footer">
              <p>Kuppi - Smart Tutor Platform</p>
              <p>You're receiving this because you're a registered student.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return await sendEmail({
      to: studentEmails,
      subject: `🗳️ New Poll: ${pollData.title}`,
      html
    });

  } catch (error) {
    console.error('❌ Failed to send poll created email:', error);
    return false;
  }
};

/**
 * Send poll threshold notification to all tutors
 */
export const sendPollThresholdEmail = async (pollData: {
  title: string;
  subject: string;
  chapter: string;
  description: string;
  voteCount: number;
  targetVotes: number;
  preferredDate: Date;
  timeSlot: string;
  pollId: string;
}): Promise<boolean> => {
  try {
    const allTutorEmails = await getTutorEmails(pollData.subject);

    if (allTutorEmails.length === 0) {
      console.log('⚠️ No tutor emails found');
      return false;
    }

    // 🔧 TESTING MODE: Only send to account owner due to FREE tier limitation  
    const tutorEmails = allTutorEmails.filter(email => email === 'nxtivsoftware@gmail.com');
    
    if (tutorEmails.length === 0) {
      console.log('⚠️ Account owner not in tutor list - would normally notify:', allTutorEmails);
      console.log('📧 Skipping tutor threshold email (account owner is not a tutor)');
      return false;
    }

    console.log(`📧 TESTING MODE: Sending threshold email to account owner only (${tutorEmails.length} recipients)`);
    console.log(`📧 Would normally notify ${allTutorEmails.length} tutors:`, allTutorEmails);

    const votePercentage = Math.round((pollData.voteCount / pollData.targetVotes) * 100);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .poll-info { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f5576c; }
          .info-row { margin: 10px 0; }
          .label { font-weight: bold; color: #f5576c; }
          .badge { display: inline-block; background: #f5576c; color: white; padding: 5px 15px; border-radius: 20px; font-weight: bold; }
          .button { display: inline-block; background: #f5576c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; color: #888; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎯 Session Request Ready!</h1>
            <p><span class="badge">${votePercentage}% Votes Reached</span></p>
          </div>
          <div class="content">
            <p>Hello Tutor,</p>
            <p>A poll has reached the threshold and is ready for you to schedule a session!</p>
            
            <div class="poll-info">
              <h2>${pollData.title}</h2>
              <div class="info-row"><span class="label">Subject:</span> ${pollData.subject}</div>
              <div class="info-row"><span class="label">Chapter:</span> ${pollData.chapter}</div>
              <div class="info-row"><span class="label">Description:</span> ${pollData.description}</div>
              <div class="info-row"><span class="label">Votes:</span> ${pollData.voteCount} / ${pollData.targetVotes} students</div>
              <div class="info-row"><span class="label">Preferred Date:</span> ${new Date(pollData.preferredDate).toLocaleDateString()}</div>
              <div class="info-row"><span class="label">Time Slot:</span> ${pollData.timeSlot}</div>
            </div>

            <p><strong>${pollData.voteCount} students</strong> are interested in this session. Review the request and schedule the session if you're available!</p>

            <a href="http://localhost:5173/tutor-dashboard" class="button">View Session Request →</a>

            <div class="footer">
              <p>Kuppi - Smart Tutor Platform</p>
              <p>You're receiving this because you're a registered tutor for ${pollData.subject}.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return await sendEmail({
      to: tutorEmails,
      subject: `🎯 New Session Request: ${pollData.title} (${votePercentage}% votes)`,
      html
    });

  } catch (error) {
    console.error('❌ Failed to send poll threshold email:', error);
    return false;
  }
};

/**
 * Send session scheduled notification to voters only
 */
export const sendSessionScheduledEmail = async (sessionData: {
  title: string;
  subject: string;
  topic: string;
  description: string;
  date: Date;
  time: string;
  duration: number;
  feePerStudent: number;
  tutorName: string;
  meetingLink?: string;
  voterIds: (string | any)[];
}): Promise<boolean> => {
  try {
    const allVoterEmails = await getVoterEmails(sessionData.voterIds);

    if (allVoterEmails.length === 0) {
      console.log('⚠️ No voter emails found');
      return false;
    }

    // 🔧 TESTING MODE: Only send to account owner due to FREE tier limitation  
    const voterEmails = allVoterEmails.filter(email => email === 'nxtivsoftware@gmail.com');
    
    if (voterEmails.length === 0) {
      console.log('⚠️ Account owner not in voter list - would normally notify:', allVoterEmails);
      console.log('📧 Skipping session notification (account owner is not a voter)');
      return false;
    }

    console.log(`📧 TESTING MODE: Sending session notification to account owner only (${voterEmails.length} recipients)`);
    console.log(`📧 Would normally notify ${allVoterEmails.length} voters:`, allVoterEmails);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .session-info { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #11998e; }
          .info-row { margin: 10px 0; }
          .label { font-weight: bold; color: #11998e; }
          .highlight { background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .button { display: inline-block; background: #11998e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; color: #888; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Session Scheduled!</h1>
            <p>Your voted poll is now a confirmed session</p>
          </div>
          <div class="content">
            <p>Great news! The session you voted for has been scheduled.</p>
            
            <div class="session-info">
              <h2>${sessionData.title}</h2>
              <div class="info-row"><span class="label">Tutor:</span> ${sessionData.tutorName}</div>
              <div class="info-row"><span class="label">Subject:</span> ${sessionData.subject}</div>
              <div class="info-row"><span class="label">Topic:</span> ${sessionData.topic}</div>
              <div class="info-row"><span class="label">Description:</span> ${sessionData.description}</div>
            </div>

            <div class="highlight">
              <div class="info-row"><span class="label">📅 Date:</span> ${new Date(sessionData.date).toLocaleDateString()}</div>
              <div class="info-row"><span class="label">🕐 Time:</span> ${sessionData.time}</div>
              <div class="info-row"><span class="label">⏱️ Duration:</span> ${sessionData.duration} hours</div>
              <div class="info-row"><span class="label">💰 Fee:</span> Rs. ${sessionData.feePerStudent}</div>
            </div>

            ${sessionData.meetingLink ? `
              <div class="info-row">
                <span class="label">🔗 Meeting Link:</span> 
                <a href="${sessionData.meetingLink}">${sessionData.meetingLink}</a>
              </div>
            ` : ''}

            <p>You've been automatically enrolled because you voted for this poll. View all session details in your dashboard.</p>

            <a href="http://localhost:5173/student-dashboard" class="button">View Session Details →</a>

            <div class="footer">
              <p>Kuppi - Smart Tutor Platform</p>
              <p>You're receiving this because you voted for this session.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return await sendEmail({
      to: voterEmails,
      subject: `✅ Session Scheduled: ${sessionData.title}`,
      html
    });

  } catch (error) {
    console.error('❌ Failed to send session scheduled email:', error);
    return false;
  }
};

/**
 * Send notification to all students when tutor creates a new session
 */
export const sendTutorSessionCreatedEmail = async (sessionData: {
  title: string;
  subject: string;
  topic: string;
  description: string;
  duration: number;
  feePerStudent: number;
  tutorName: string;
  expectedDate?: Date;
  expectedTime?: string;
  maxStudents: number;
  minStudents?: number;
}): Promise<boolean> => {
  try {
    console.log('📧 ===== SENDING TUTOR SESSION CREATED EMAIL =====');
    console.log('📧 Session:', sessionData.title);
    
    const allStudentEmails = await getAllStudentEmails();

    if (allStudentEmails.length === 0) {
      console.log('⚠️ No student emails found - cannot send session created email');
      return false;
    }

    // 🔧 TESTING MODE: Only send to account owner due to FREE tier limitation
    const studentEmails = allStudentEmails.filter(email => email === 'nxtivsoftware@gmail.com');
    
    if (studentEmails.length === 0) {
      console.log('⚠️ Account owner not in student list - cannot send test email');
      return false;
    }

    console.log(`📧 TESTING MODE: Sending session created email to account owner only (${studentEmails.length} recipients)`);
    console.log(`📧 Would normally notify ${allStudentEmails.length} students:`, allStudentEmails);

    const dateInfo = sessionData.expectedDate && sessionData.expectedTime 
      ? `<div class="info-row"><span class="label">Expected Date:</span> ${new Date(sessionData.expectedDate).toLocaleDateString()} at ${sessionData.expectedTime}</div>`
      : `<div class="info-row"><span class="label">Scheduling:</span> To be scheduled based on student interest</div>`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .session-info { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
          .info-row { margin: 10px 0; }
          .label { font-weight: bold; color: #667eea; }
          .badge { display: inline-block; background: #667eea; color: white; padding: 5px 15px; border-radius: 20px; font-size: 12px; margin: 5px 0; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; color: #888; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📚 New Session Available!</h1>
            <p>A tutor has created a new study session</p>
          </div>
          <div class="content">
            <p>Hello Student,</p>
            <p><strong>${sessionData.tutorName}</strong> has created a new study session that you might be interested in!</p>
            
            <div class="session-info">
              <h2>${sessionData.title}</h2>
              <div class="info-row"><span class="label">Tutor:</span> ${sessionData.tutorName}</div>
              <div class="info-row"><span class="label">Subject:</span> ${sessionData.subject}</div>
              <div class="info-row"><span class="label">Topic:</span> ${sessionData.topic}</div>
              <div class="info-row"><span class="label">Description:</span> ${sessionData.description}</div>
              <div class="info-row"><span class="label">Duration:</span> ${sessionData.duration} hours</div>
              <div class="info-row"><span class="label">Fee:</span> Rs. ${sessionData.feePerStudent}</div>
              ${dateInfo}
              <div class="info-row">
                <span class="label">Capacity:</span> 
                ${sessionData.maxStudents >= 100 
                  ? '<span class="badge">Unlimited Seats</span>' 
                  : sessionData.minStudents 
                    ? `Minimum ${sessionData.minStudents} students required` 
                    : `Maximum ${sessionData.maxStudents} students`}
              </div>
            </div>

            <p>Show your interest now to help this session get scheduled! The tutor will schedule the session once enough students show interest.</p>

            <a href="http://localhost:5173/student-dashboard" class="button">View Session →</a>

            <div class="footer">
              <p>Kuppi - Smart Tutor Platform</p>
              <p>You're receiving this because you're a registered student.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return await sendEmail({
      to: studentEmails,
      subject: `📚 New Session: ${sessionData.title} by ${sessionData.tutorName}`,
      html
    });

  } catch (error) {
    console.error('❌ Failed to send tutor session created email:', error);
    return false;
  }
};

/**
 * Send notification to interested students when tutor schedules their created session
 */
export const sendTutorSessionScheduledEmail = async (sessionData: {
  title: string;
  subject: string;
  topic: string;
  description: string;
  date: Date;
  time: string;
  duration: number;
  feePerStudent: number;
  tutorName: string;
  meetingLink?: string;
  interestedStudentIds: (string | any)[];
}): Promise<boolean> => {
  try {
    console.log('📧 ===== SENDING TUTOR SESSION SCHEDULED EMAIL =====');
    console.log('📧 Session:', sessionData.title);
    console.log('📧 Interested students:', sessionData.interestedStudentIds.length);
    
    const allInterestedEmails = await getVoterEmails(sessionData.interestedStudentIds);

    if (allInterestedEmails.length === 0) {
      console.log('⚠️ No interested student emails found');
      return false;
    }

    // 🔧 TESTING MODE: Only send to account owner due to FREE tier limitation  
    const interestedEmails = allInterestedEmails.filter(email => email === 'nxtivsoftware@gmail.com');
    
    if (interestedEmails.length === 0) {
      console.log('⚠️ Account owner not in interested list - would normally notify:', allInterestedEmails);
      console.log('📧 Skipping tutor session scheduled email (account owner not interested)');
      return false;
    }

    console.log(`📧 TESTING MODE: Sending scheduled notification to account owner only (${interestedEmails.length} recipients)`);
    console.log(`📧 Would normally notify ${allInterestedEmails.length} interested students:`, allInterestedEmails);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .session-info { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #11998e; }
          .info-row { margin: 10px 0; }
          .label { font-weight: bold; color: #11998e; }
          .highlight { background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .button { display: inline-block; background: #11998e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; color: #888; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Session Scheduled!</h1>
            <p>The session you showed interest in is now confirmed</p>
          </div>
          <div class="content">
            <p>Great news! The session you showed interest in has been scheduled by the tutor.</p>
            
            <div class="session-info">
              <h2>${sessionData.title}</h2>
              <div class="info-row"><span class="label">Tutor:</span> ${sessionData.tutorName}</div>
              <div class="info-row"><span class="label">Subject:</span> ${sessionData.subject}</div>
              <div class="info-row"><span class="label">Topic:</span> ${sessionData.topic}</div>
              <div class="info-row"><span class="label">Description:</span> ${sessionData.description}</div>
            </div>

            <div class="highlight">
              <div class="info-row"><span class="label">📅 Date:</span> ${new Date(sessionData.date).toLocaleDateString()}</div>
              <div class="info-row"><span class="label">🕐 Time:</span> ${sessionData.time}</div>
              <div class="info-row"><span class="label">⏱️ Duration:</span> ${sessionData.duration} hours</div>
              <div class="info-row"><span class="label">💰 Fee:</span> Rs. ${sessionData.feePerStudent}</div>
            </div>

            ${sessionData.meetingLink ? `
              <div class="info-row">
                <span class="label">🔗 Meeting Link:</span> 
                <a href="${sessionData.meetingLink}">${sessionData.meetingLink}</a>
              </div>
            ` : ''}

            <p>You've been automatically enrolled since you showed interest. View the session details and prepare for the session!</p>

            <a href="http://localhost:5173/student-dashboard" class="button">View Session Details →</a>

            <div class="footer">
              <p>Kuppi - Smart Tutor Platform</p>
              <p>You're receiving this because you showed interest in this session.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return await sendEmail({
      to: interestedEmails,
      subject: `✅ Session Scheduled: ${sessionData.title}`,
      html
    });

  } catch (error) {
    console.error('❌ Failed to send tutor session scheduled email:', error);
    return false;
  }
};

/**
 * Send notification to non-voting students when poll-based session has available spaces
 */
export const sendAvailableSpacesEmail = async (sessionData: {
  title: string;
  subject: string;
  topic: string;
  description: string;
  date: Date;
  time: string;
  duration: number;
  feePerStudent: number;
  tutorName: string;
  enrolledCount: number;
  maxStudents: number;
  availableSpots: number;
  voterIds: (string | any)[];
}): Promise<boolean> => {
  try {
    console.log('📧 ===== SENDING AVAILABLE SPACES EMAIL =====');
    console.log('📧 Session:', sessionData.title);
    console.log('📧 Available spots:', sessionData.availableSpots);
    
    // Get all student emails
    const allStudentEmails = await getAllStudentEmails();
    
    if (allStudentEmails.length === 0) {
      console.log('⚠️ No student emails found');
      return false;
    }

    // Get voter emails to exclude them
    const voterEmails = await getVoterEmails(sessionData.voterIds);
    const voterEmailSet = new Set(voterEmails);

    // Filter to get only non-voters
    const allNonVoterEmails = allStudentEmails.filter(email => !voterEmailSet.has(email));

    if (allNonVoterEmails.length === 0) {
      console.log('⚠️ No non-voter emails found');
      return false;
    }

    // 🔧 TESTING MODE: Only send to account owner due to FREE tier limitation  
    const nonVoterEmails = allNonVoterEmails.filter(email => email === 'nxtivsoftware@gmail.com');
    
    if (nonVoterEmails.length === 0) {
      console.log('⚠️ Account owner not in non-voter list - would normally notify:', allNonVoterEmails);
      console.log('📧 Skipping available spaces email (account owner voted or is not a student)');
      return false;
    }

    console.log(`📧 TESTING MODE: Sending available spaces email to account owner only (${nonVoterEmails.length} recipients)`);
    console.log(`📧 Would normally notify ${allNonVoterEmails.length} non-voting students:`, allNonVoterEmails);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .session-info { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f5576c; }
          .info-row { margin: 10px 0; }
          .label { font-weight: bold; color: #f5576c; }
          .badge { display: inline-block; background: #f5576c; color: white; padding: 8px 20px; border-radius: 20px; font-weight: bold; font-size: 16px; }
          .highlight { background: #fff3f3; padding: 15px; border-radius: 5px; margin: 15px 0; border: 2px solid #f5576c; }
          .button { display: inline-block; background: #f5576c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; color: #888; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎯 Spots Available!</h1>
            <p><span class="badge">${sessionData.availableSpots} Seats Left</span></p>
          </div>
          <div class="content">
            <p>Hello Student,</p>
            <p>A scheduled session still has available spots! Even though you didn't vote for this poll, you can still join this session.</p>
            
            <div class="session-info">
              <h2>${sessionData.title}</h2>
              <div class="info-row"><span class="label">Tutor:</span> ${sessionData.tutorName}</div>
              <div class="info-row"><span class="label">Subject:</span> ${sessionData.subject}</div>
              <div class="info-row"><span class="label">Topic:</span> ${sessionData.topic}</div>
              <div class="info-row"><span class="label">Description:</span> ${sessionData.description}</div>
            </div>

            <div class="highlight">
              <div class="info-row"><span class="label">📅 Date:</span> ${new Date(sessionData.date).toLocaleDateString()}</div>
              <div class="info-row"><span class="label">🕐 Time:</span> ${sessionData.time}</div>
              <div class="info-row"><span class="label">⏱️ Duration:</span> ${sessionData.duration} hours</div>
              <div class="info-row"><span class="label">💰 Fee:</span> Rs. ${sessionData.feePerStudent}</div>
              <div class="info-row"><span class="label">👥 Enrolled:</span> ${sessionData.enrolledCount} / ${sessionData.maxStudents} students</div>
              <div class="info-row"><span class="label">✨ Available:</span> <strong>${sessionData.availableSpots} spots remaining</strong></div>
            </div>

            <p><strong>Don't miss out!</strong> Join now before all spots are filled. This session is ready and waiting for you in Browse Kuppi.</p>

            <a href="http://localhost:5173/student-dashboard" class="button">Join Session →</a>

            <div class="footer">
              <p>Kuppi - Smart Tutor Platform</p>
              <p>You're receiving this because there are available spots in this scheduled session.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return await sendEmail({
      to: nonVoterEmails,
      subject: `🎯 ${sessionData.availableSpots} Spots Left: ${sessionData.title}`,
      html
    });

  } catch (error) {
    console.error('❌ Failed to send available spaces email:', error);
    return false;
  }
};

export default {
  sendEmail,
  getAllStudentEmails,
  getTutorEmails,
  getVoterEmails,
  sendPollCreatedEmail,
  sendPollThresholdEmail,
  sendSessionScheduledEmail,
  sendTutorSessionCreatedEmail,
  sendTutorSessionScheduledEmail,
  sendAvailableSpacesEmail
};
