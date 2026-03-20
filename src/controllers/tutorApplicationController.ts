import { Request, Response } from 'express';
import { clerkClient } from '@clerk/clerk-sdk-node';
import TutorApplication from '../models/TutorApplication';
import User from '../models/user';

const resolveEmailFromClerk = async (clerkId: string): Promise<string | null> => {
  try {
    const clerkUser = await clerkClient.users.getUser(clerkId);
    const primaryEmail = clerkUser.emailAddresses.find(
      (email) => email.id === clerkUser.primaryEmailAddressId
    )?.emailAddress;

    if (primaryEmail) return primaryEmail;

    const fallbackEmail = clerkUser.emailAddresses?.[0]?.emailAddress;
    return fallbackEmail || null;
  } catch (error) {
    console.error('⚠️ Failed to resolve email from Clerk for user:', clerkId, error);
    return null;
  }
};

/**
 * POST /api/tutor-applications
 * Submit a new tutor application (public — user may or may not be signed in)
 */
export const submitTutorApplication = async (req: Request, res: Response) => {
  try {
    const {
      fullName,
      nicNumber,
      dateOfBirth,
      phone,
      district,
      city,
      bio,
      languages,
      qualification,
      university,
      fieldOfStudy,
      graduationYear,
      alStream,
      alResults,
      subjects,
      grades,
      experienceYears,
      experienceDescription,
      teachingType,
      availableDays,
      availability,
      linkedin,
      certificateLink,
    } = req.body;

    // Required field validation
    if (
      !fullName ||
      !nicNumber ||
      !dateOfBirth ||
      !phone ||
      !district ||
      !city ||
      !qualification ||
      !teachingType
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Required fields are missing: fullName, nicNumber, dateOfBirth, phone, district, city, qualification, teachingType',
      });
    }

    if (!languages || languages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one language must be selected',
      });
    }

    // Grab clerkId from auth middleware if present
    const clerkId = (req as any).auth?.userId || (req as any).userId || null;

    // Prevent duplicate pending applications for the same user
    if (clerkId) {
      const existingPending = await TutorApplication.findOne({
        userId: clerkId,
        status: 'pending',
      });
      if (existingPending) {
        return res.status(400).json({
          success: false,
          message: 'You already have a pending tutor application',
        });
      }
    }

    let resolvedEmail: string | undefined;

    if (clerkId) {
      const clerkEmail = await resolveEmailFromClerk(clerkId);
      if (clerkEmail) {
        resolvedEmail = clerkEmail;
      } else {
        const userRecord = await User.findOne({ clerkId }).select('email');
        resolvedEmail = userRecord?.email || undefined;
      }
    }

    if (!resolvedEmail && req.body?.email) {
      resolvedEmail = req.body.email;
    }

    const application = await TutorApplication.create({
      userId: clerkId,
      email: resolvedEmail,
      fullName,
      nicNumber,
      dateOfBirth,
      phone,
      district,
      city,
      bio,
      languages,
      qualification,
      university,
      fieldOfStudy,
      graduationYear: graduationYear ? Number(graduationYear) : undefined,
      alStream,
      alResults,
      subjects: subjects || [],
      grades: grades || [],
      experienceYears: experienceYears ? Number(experienceYears) : 0,
      experienceDescription,
      teachingType,
      availableDays: availableDays || [],
      availability,
      linkedin,
      certificateLink,
      status: 'pending',
    });

    console.log(`✅ New tutor application submitted by ${fullName} (${clerkId || 'unauthenticated'})`);

    res.status(201).json({
      success: true,
      message: 'Tutor application submitted successfully',
      data: application,
    });
  } catch (error: any) {
    console.error('❌ Error submitting tutor application:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit tutor application',
      error: error.message,
    });
  }
};

/**
 * GET /api/tutor-applications/my
 * Get the current user's latest application (must be authenticated)
 */
export const getMyApplication = async (req: Request, res: Response) => {
  try {
    const clerkId = (req as any).auth?.userId || (req as any).userId;
    if (!clerkId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const application = await TutorApplication.findOne({ userId: clerkId }).sort({ createdAt: -1 });

    if (!application) {
      return res.status(404).json({ success: false, message: 'No application found' });
    }

    if (application.userId) {
      const clerkEmail = await resolveEmailFromClerk(application.userId);

      if (clerkEmail && application.email !== clerkEmail) {
        application.email = clerkEmail;
        await application.save();
      } else if (!clerkEmail) {
        const linkedUser = await User.findOne({ clerkId: application.userId }).select('email');
        if (linkedUser?.email && application.email !== linkedUser.email) {
          application.email = linkedUser.email;
          await application.save();
        }
      }
    }

    res.json({ success: true, data: application });
  } catch (error: any) {
    console.error('❌ Error fetching application:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch application',
      error: error.message,
    });
  }
};

/**
 * GET /api/tutor-applications
 * Admin: get all applications (optionally filtered by status)
 */
export const getAllApplications = async (req: Request, res: Response) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query: any = {};
    if (status && status !== 'all') query.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [applications, total] = await Promise.all([
      TutorApplication.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      TutorApplication.countDocuments(query),
    ]);

    await Promise.all(
      applications.map(async (application) => {
        if (application.userId) {
          const clerkEmail = await resolveEmailFromClerk(application.userId);

          if (clerkEmail && application.email !== clerkEmail) {
            application.email = clerkEmail;
            await application.save();
          } else if (!clerkEmail) {
            const linkedUser = await User.findOne({ clerkId: application.userId }).select('email');
            if (linkedUser?.email && application.email !== linkedUser.email) {
              application.email = linkedUser.email;
              await application.save();
            }
          }
        }
      })
    );

    res.json({
      success: true,
      data: applications,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch (error: any) {
    console.error('❌ Error fetching applications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch applications',
      error: error.message,
    });
  }
};

/**
 * PATCH /api/tutor-applications/:applicationId/approve
 * Admin: approve an application → sets user role to tutor in DB + Clerk
 */
export const approveApplication = async (req: Request, res: Response) => {
  try {
    const { applicationId } = req.params;

    const application = await TutorApplication.findById(applicationId);
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    application.status = 'approved';
    await application.save();

    // Update user role in MongoDB and Clerk
    if (application.userId) {
      const user = await User.findOne({ clerkId: application.userId });
      if (user) {
        user.role = 'tutor';
        await user.save();
        console.log(`✅ User ${user.email} role updated to tutor in DB`);
      }

      try {
        await clerkClient.users.updateUser(application.userId, {
          publicMetadata: { role: 'tutor' },
        });
        console.log(`✅ Clerk metadata updated to tutor for userId: ${application.userId}`);
      } catch (clerkErr) {
        console.error('⚠️ Failed to update Clerk role metadata:', clerkErr);
      }
    }

    res.json({
      success: true,
      message: 'Application approved. User role updated to tutor.',
      data: application,
    });
  } catch (error: any) {
    console.error('❌ Error approving application:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve application',
      error: error.message,
    });
  }
};

/**
 * PATCH /api/tutor-applications/:applicationId/reject
 * Admin: reject an application
 */
export const rejectApplication = async (req: Request, res: Response) => {
  try {
    const { applicationId } = req.params;
    const { adminNote } = req.body;

    const application = await TutorApplication.findById(applicationId);
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    application.status = 'rejected';
    if (adminNote) application.adminNote = adminNote;
    await application.save();

    res.json({
      success: true,
      message: 'Application rejected',
      data: application,
    });
  } catch (error: any) {
    console.error('❌ Error rejecting application:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject application',
      error: error.message,
    });
  }
};

/**
 * DELETE /api/tutor-applications/:applicationId
 * Admin: delete an application (approved/rejected applications are deletable)
 */
export const deleteApplication = async (req: Request, res: Response) => {
  try {
    const { applicationId } = req.params;

    const application = await TutorApplication.findById(applicationId);
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    if (!['rejected', 'approved'].includes(application.status)) {
      return res.status(400).json({
        success: false,
        message: 'Only approved or rejected applications can be deleted',
      });
    }

    await TutorApplication.findByIdAndDelete(applicationId);

    res.json({
      success: true,
      message: 'Application deleted successfully',
    });
  } catch (error: any) {
    console.error('❌ Error deleting application:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete application',
      error: error.message,
    });
  }
};

/**
 * PATCH /api/tutor-applications/:applicationId/email
 * Admin: manually correct application email for legacy/mismatched records
 */
export const updateApplicationEmail = async (req: Request, res: Response) => {
  try {
    const { applicationId } = req.params;
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Valid email is required',
      });
    }

    const application = await TutorApplication.findById(applicationId);
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    application.email = email.trim().toLowerCase();
    await application.save();

    res.json({
      success: true,
      message: 'Application email updated successfully',
      data: application,
    });
  } catch (error: any) {
    console.error('❌ Error updating application email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update application email',
      error: error.message,
    });
  }
};
