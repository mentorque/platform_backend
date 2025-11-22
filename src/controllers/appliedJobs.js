const prisma = require('../utils/prisma');

/**
 * Get or create user in PostgreSQL database
 * Syncs with Firebase user
 */
async function getOrCreateUser(firebaseUid, email, fullName = null) {
  try {
    // Try to find existing user
    let user = await prisma.user.findUnique({
      where: { firebaseUid },
    });

    if (!user) {
      // Create new user
      console.log(`Creating new user for Firebase UID: ${firebaseUid}`);
      user = await prisma.user.create({
        data: {
          firebaseUid,
          email,
          fullName,
        },
      });
      console.log(`✅ User created: ${user.email}`);
    }

    return user;
  } catch (error) {
    console.error('Error in getOrCreateUser:', error);
    throw error;
  }
}

// Get all applied jobs for the authenticated user
const getAppliedJobs = async (req, res) => {
  try {
    const { uid, email } = req.user;
    console.log('📋 Fetching jobs for Firebase UID:', uid);

    // Get or create user in database
    const user = await getOrCreateUser(uid, email);
    console.log('📋 Database user ID:', user.id);

    const jobs = await prisma.appliedJob.findMany({
      where: { userId: user.id },
      orderBy: { appliedDate: 'desc' }
    });

    console.log(`✅ Found ${jobs.length} jobs`);
    console.log('📋 Jobs details:', jobs.map(job => ({ id: job.id, title: job.title, type: job.type, appliedDate: job.appliedDate })));

    res.json({ jobs });
  } catch (error) {
    console.error('Error fetching applied jobs:', error);
    res.status(500).json({ error: 'Failed to fetch applied jobs' });
  }
};

// Create a new applied job entry
const createAppliedJob = async (req, res) => {
  try {
    const { uid, email } = req.user;
    const { id, title, company, location, url, appliedText, appliedDate, status, type } = req.body;

    // Get or create user in database
    const user = await getOrCreateUser(uid, email);
    const userId = user.id;

    // Validate required fields
    if (!id || !title) {
      return res.status(400).json({ 
        error: 'Missing required fields: id and title are required' 
      });
    }

    // Validate status if provided
    if (status) {
      const validStatuses = ['Applied', 'In Progress', 'Got Call Back', 'Received Offer', 'Rejected'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
          error: 'Invalid status. Must be one of: Applied, In Progress, Got Call Back, Received Offer, Rejected' 
        });
      }
    }

    // Note: Removed duplicate URL check to allow manual entries with same URLs

    // Create the applied job
    const job = await prisma.appliedJob.create({
      data: {
        id,
        userId,
        title,
        company: company || null,
        location: location || null,
        url: url || '#',
        appliedText: appliedText || null,
        appliedDate: appliedDate ? new Date(appliedDate) : new Date(),
        status: status || 'Applied',
        type: type || 'Website',
        updatedAt: new Date()
      }
    });

    console.log('✅ Created job:', { id: job.id, title: job.title, type: job.type, userId: job.userId });
    res.status(201).json({ job });
  } catch (error) {
    console.error('Error creating applied job:', error);
    res.status(500).json({ error: 'Failed to create applied job' });
  }
};

// Update job status
const updateJobStatus = async (req, res) => {
  try {
    const { uid, email } = req.user;
    const { jobId } = req.params;
    const { status } = req.body;

    // Get user from database
    const user = await getOrCreateUser(uid, email);
    const userId = user.id;

    console.log('📝 Update job status request:', { firebaseUid: uid, dbUserId: userId, jobId, status });

    // Validate status
    const validStatuses = ['Applied', 'In Progress', 'Got Call Back', 'Received Offer', 'Rejected'];
    if (!validStatuses.includes(status)) {
      console.log('❌ Invalid status:', status);
      return res.status(400).json({ 
        error: 'Invalid status. Must be one of: Applied, In Progress, Got Call Back, Received Offer, Rejected' 
      });
    }

    // Check if job exists and belongs to user
    const existingJob = await prisma.appliedJob.findUnique({
      where: { id: jobId }
    });

    console.log('🔍 Existing job:', existingJob ? `Found (userId: ${existingJob.userId})` : 'Not found');
    console.log('🔍 Comparing userIds:');
    console.log('  - req.user.id:', userId, '(type:', typeof userId, ')');
    console.log('  - existingJob.userId:', existingJob?.userId, '(type:', typeof existingJob?.userId, ')');
    console.log('  - Are equal?', existingJob?.userId === userId);

    if (!existingJob) {
      console.log('❌ Job not found');
      return res.status(404).json({ error: 'Job not found' });
    }

    if (existingJob.userId !== userId) {
      console.log('❌ Unauthorized - job belongs to different user');
      console.log('❌ This should NOT happen - userId mismatch detected!');
      return res.status(403).json({ error: 'Unauthorized to update this job' });
    }

    console.log('✅ Updating job status from', existingJob.status, 'to', status);

    // Update the status
    const updatedJob = await prisma.appliedJob.update({
      where: { id: jobId },
      data: { 
        status,
        updatedAt: new Date()
      }
    });

    console.log('✅ Job updated successfully:', updatedJob.status);

    res.json({ job: updatedJob });
  } catch (error) {
    console.error('❌ Error updating job status:', error);
    res.status(500).json({ error: 'Failed to update job status' });
  }
};

// Delete an applied job
const deleteAppliedJob = async (req, res) => {
  try {
    const { uid, email } = req.user;
    const { jobId } = req.params;

    // Get user from database
    const user = await getOrCreateUser(uid, email);
    const userId = user.id;

    // Check if job exists and belongs to user
    const existingJob = await prisma.appliedJob.findUnique({
      where: { id: jobId }
    });

    if (!existingJob) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (existingJob.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized to delete this job' });
    }

    // Delete the job
    await prisma.appliedJob.delete({
      where: { id: jobId }
    });

    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Error deleting applied job:', error);
    res.status(500).json({ error: 'Failed to delete applied job' });
  }
};

module.exports = {
  getAppliedJobs,
  createAppliedJob,
  updateJobStatus,
  deleteAppliedJob
};

