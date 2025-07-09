require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();
const PORT = process.env.PORT || 5000;


// Middleware
app.use(cors({
    origin: 'http://127.0.0.1:5500',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Database connection
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '1203',
    database: process.env.DB_NAME || 'mentor_mentee_management',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};
const db = mysql.createPool(dbConfig);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || '1234567890';

// Test database connection
async function testConnection() {
    try {
        const connection = await db.getConnection();
        console.log('Successfully connected to the database');
        connection.release();
    } catch (err) {
        console.error('Database connection failed:', err);
        process.exit(1);
    }
}
testConnection();

// Authentication middleware
const authenticate = (roles = []) => {
    return async (req, res, next) => {
        console.log('Authentication middleware triggered');
        const token = req.header('Authorization')?.replace('Bearer ', '');
        console.log('Token from Header:', token);

        if (!token) {
            console.log('No token provided');
            return res.status(401).json({ success: false, message: 'No token, authorization denied' });
        }

        try {
            console.log('Verifying token...');
            const decoded = jwt.verify(token, JWT_SECRET);
            console.log('Decoded JWT:', decoded);

            const [users] = await db.query('SELECT * FROM users WHERE id = ?', [decoded.user.id]);
            if (!users.length) {
                return res.status(401).json({ success: false, message: 'User not found' });
            }

            req.user = users[0];

            // If role-based check
            if (roles.length && !roles.includes(req.user.role)) {
                return res.status(403).json({ success: false, message: 'Access forbidden: insufficient role' });
            }

            next(); // ✅ PROCEED TO NEXT MIDDLEWARE / ROUTE
        } catch (err) {
            console.error('Detailed auth error:', err);
            res.status(401).json({ 
                success: false, 
                message: 'Token is not valid',
                error: err.message 
            });
        }
    };
};

// Helper function for database transactions
async function executeTransaction(queries) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        
        const results = [];
        for (const { query, params } of queries) {
            const [result] = await connection.query(query, params);
            results.push(result);
        }
        
        await connection.commit();
        return results;
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

// Routes
// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'Server is running' });
});

// User Registration
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, role, full_name, department, roll_number, batch_year, mentor_id, designation, specialization } = req.body;

        // Validate required fields
        if (!username || !email || !password || !role) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields: username, email, password, role' 
            });
        }

        const validRoles = ['student', 'mentor', 'placement_officer'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ 
                success: false, 
                message: `Invalid role. Must be one of: ${validRoles.join(', ')}` 
            });
        }

        // Check if user already exists
        const [existingUser] = await db.query(
            'SELECT * FROM users WHERE email = ? OR username = ?', 
            [email, username]
        );
        
        if (existingUser.length) {
            return res.status(400).json({ 
                success: false, 
                message: 'User already exists with this email or username' 
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        let query, values;

        if (role === 'mentor') {
            query = `
                INSERT INTO users (username, email, password, role, full_name, department, designation, specialization)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            values = [username, email, hashedPassword, role, full_name || null, department || null, designation || null, specialization || null];
        } else if (role === 'student') {
            query = `
                INSERT INTO users (username, email, password, role, full_name, department, roll_number, batch_year, mentor_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            values = [
                username,
                email,
                hashedPassword,
                role,
                full_name || null,
                department || null,
                roll_number || null,
                batch_year || null,
                mentor_id || null];
                }

                const [result] = await db.query(query, values);

                res.status(201).json({ 
                    success: true,
                    message: 'User registered successfully',
                    data: {
                        id: result.insertId,
                        username,
                        email,
                        role,
                        department,
                        roll_number,
                        designation,
                        specialization
                    }
                });
        } catch (err) {
            console.error('Registration error:', err);
        
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ 
                success: false, 
                message: 'User already exists with this email or username' 
            });
        }
        
        res.status(500).json({ 
            success: false,
            message: 'Registration failed',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});


// User Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and password are required' 
            });
        }

        // Check if user exists
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (!users.length) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }

        const user = users[0];

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }

        // Create JWT payload
        const payload = {
            user: {
                id: user.id,
                role: user.role,
                username: user.username
            }
        };

        // Sign token
        const token = jwt.sign(payload, process.env.JWT_SECRET || '1234567890', { expiresIn: '7d' });

        // Omit password from response
        const { password: _, ...userWithoutPassword } = user;

        res.json({ 
            success: true,
            token,
            user: userWithoutPassword
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ 
            success: false,
            message: 'Login failed',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

// Get current user profile
app.get('/api/profile', authenticate(), async (req, res) => {
    try {
        const userId = req.user.id;

        // Get all profile info from 'users' table
        const [users] = await db.query(
            `SELECT id, username, email, role, full_name, department, 
                    roll_number, batch_year, current_cgpa, placement_status, 
                    mentor_id, designation, specialization, created_at 
             FROM users 
             WHERE id = ?`, 
            [userId]
        );

        if (!users.length) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        const user = users[0];

        res.json({
            success: true,
            data: user
        });

    } catch (err) {
        console.error('Profile error:', err);
        res.status(500).json({ 
            success: false,
            message: 'Failed to fetch profile',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

//change passwords
// Change password route
app.post('/api/change-password', authenticate(), async (req, res) => {
    try {
        const { current_password, new_password } = req.body;

        // Ensure new passwords meet security requirements (e.g., length, complexity)
        if (new_password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 6 characters long'
            });
        }

        // Get the user details from the database using the authenticated user's ID
        const userId = req.user.id;

        const [users] = await db.query('SELECT id, password FROM users WHERE id = ?', [userId]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = users[0];

        // Verify the current password matches the stored password
        const isCurrentPasswordValid = await bcrypt.compare(current_password, user.password);
        
        if (!isCurrentPasswordValid) {
            return res.status(400).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Hash the new password
        const hashedNewPassword = await bcrypt.hash(new_password, 10);

        // Update the user's password in the database
        await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedNewPassword, userId]);

        // Respond with success
        res.json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (err) {
        console.error('Error changing password:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to change password',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});


// Task Management Endpoints
// Create task (Mentor only)
app.post('/api/tasks', authenticate(['mentor']), async (req, res) => {
    try {
        const { title, description, deadline, student_ids } = req.body; // ✅ Use student_ids (array)
        const mentor_id = req.user.id;
        // Validate input
        if (!title || !description || !deadline || !Array.isArray(student_ids) || student_ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Missing or invalid fields: title, description, deadline, student_ids[]'
            });
        }

        const taskIds = [];

        for (const student_id of student_ids) {
            // Verify student belongs to the mentor
            const [students] = await db.query(
                'SELECT id FROM users WHERE id = ? AND role = "student" AND mentor_id = ?',
                [student_id, mentor_id]
            );

            if (!students.length) continue; // Skip invalid

            // Insert into tasks table (if needed: you can de-dupe by title/deadline if desired)
            const [result] = await db.query(
                'INSERT INTO tasks (title, description, mentor_id, student_id, deadline) VALUES (?, ?, ?, ?, ?)',
                [title, description, mentor_id, student_id, deadline]
            );

            taskIds.push(result.insertId);
        }

        if (taskIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid students found or task creation failed'
            });
        }

        res.status(201).json({
            success: true,
            message: 'Tasks created successfully',
            task_ids: taskIds
        });

    } catch (err) {
        console.error('Create task error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to create tasks',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

// Get tasks for current mentor
app.get('/api/tasks', authenticate(['mentor','student']), async (req, res) => {
    try {
        const mentor_id = req.user.id;

        const [tasks] = await db.query(`
            SELECT 
                t.id, 
                t.title, 
                t.description, 
                t.deadline,
                t.created_at,
                COUNT(ta.id) AS assigned_count,
                SUM(CASE WHEN ta.status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
                GROUP_CONCAT(u.full_name SEPARATOR ', ') AS assigned_students
            FROM tasks t
            LEFT JOIN tasks ta ON t.id = ta.id
            LEFT JOIN users u ON ta.student_id = u.id
            WHERE t.mentor_id = ?
            GROUP BY t.id
            ORDER BY t.deadline ASC
        `, [mentor_id]);

        res.json({ 
            success: true,
            data: tasks
        });
    } catch (err) {
        console.error('Get tasks error:', err);
        res.status(500).json({ 
            success: false,
            message: 'Failed to fetch tasks',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

// Get task details
app.get('/api/tasks/:id', authenticate(['mentor']), async (req, res) => {
    try {
        const task_id = req.params.id;
        const mentor_id = req.user.id;

        // Verify task belongs to this mentor
        const [tasks] = await db.query(`
            SELECT id FROM tasks WHERE id = ? AND mentor_id = ?
        `, [task_id, mentor_id]);

        if (!tasks.length) {
            return res.status(404).json({ 
                success: false, 
                message: 'Task not found or not authorized' 
            });
        }

        // Get task details with assignments
        const [taskDetails] = await db.query(`
            SELECT 
                t.id, t.title, t.description, t.deadline, t.created_at,
                u.id AS student_id, 
                u.full_name, 
                u.roll_number,
                ta.status,
                ta.completed_at,
                ta.remarks
            FROM tasks t
            JOIN task_assignments ta ON t.id = ta.task_id
            JOIN users u ON ta.student_id = u.id
            WHERE t.id = ?
        `, [task_id]);

        if (!taskDetails.length) {
            return res.status(404).json({ 
                success: false, 
                message: 'No assignments found for this task' 
            });
        }

        // Format response
        const response = {
            id: taskDetails[0].id,
            title: taskDetails[0].title,
            description: taskDetails[0].description,
            deadline: taskDetails[0].deadline,
            created_at: taskDetails[0].created_at,
            assigned_students: taskDetails.map(detail => ({
                student_id: detail.student_id,
                full_name: detail.full_name,
                roll_number: detail.roll_number,
                status: detail.status || 'pending',
                completed_at: detail.completed_at,
                remarks: detail.remarks
            }))
        };

        res.json({ 
            success: true,
            data: response
        });

    } catch (err) {
        console.error('Get task details error:', err);
        res.status(500).json({ 
            success: false,
            message: 'Failed to fetch task details',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});
// Mentor Dashboard Data Endpoint
app.get('/api/dashboard/mentor', authenticate(['mentor']), async (req, res) => {
    console.log('Dashboard endpoint hit');
    try {
        const mentorId = req.user.id;
        console.log(`Fetching dashboard for mentor ID: ${mentorId}`);
        // Query for task statistics
        const [taskStats] = await db.query(`
            SELECT 
                COUNT(*) AS total_tasks, 
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks
            FROM tasks 
            WHERE mentor_id = ?
        `, [mentorId]);

        // Query for student statistics
        const [studentStats] = await db.query(`
            SELECT 
                COUNT(*) AS total_students,
                SUM(CASE WHEN placement_status = 'accepted' THEN 1 ELSE 0 END) AS students_with_placements
            FROM users 
            WHERE role = 'student' AND mentor_id = ?
        `, [mentorId]);

        res.json({
            success: true,
            taskStats,
            studentStats
        });
    } catch (err) {
        console.error('Error fetching dashboard data for mentor:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to load mentor dashboard data',
            error: err.message
        });
    }
});

//Student dashboard Data Endpoint
app.get('/api/dashboard/student', authenticate(['student', 'placement_officer']), async (req, res) => {
    try {
        const studentId = req.user.id;

        // Query for task statistics
        const [taskStats] = await db.query(`
            SELECT 
                COUNT(*) AS total_tasks, 
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks
            FROM tasks 
            WHERE student_id = ?
        `, [studentId]);

        // Query for placement statistics
        const [placementStats] = await db.query(`
            SELECT 
                COUNT(*) AS total_applications,
                SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted_offers,
                SUM(CASE WHEN status = 'offered' THEN 1 ELSE 0 END) AS pending_offers
            FROM student_applications 
            WHERE student_id = ?
        `, [studentId]);

        res.json({
            success: true,
            taskStats,
            placementStats
        });
    } catch (err) {
        console.error('Error fetching student dashboard data:', err);
        res.status(500).json({ success: false, message: 'Failed to load student dashboard data' });
    }
});

// Placement Endpoints
// Get all placement updates
app.post('/api/placement-updates', authenticate(['mentor', 'placement_officer']), async (req, res) => {
    try {
        const { title, description, application_link, is_important = false } = req.body;
        const mentor_id = req.user.id;

        // Validate required fields
        if (!title || !description || !application_link) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields' 
            });
        }

        const [result] = await db.query(
            'INSERT INTO placements (mentor_id, title, description, application_link, is_important, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
            [mentor_id, title, description, application_link, is_important]
        );

        res.status(201).json({ 
            success: true,
            message: 'Placement opportunity created successfully',
            data: {
                placement_id: result.insertId
            }
        });
    } catch (err) {
        console.error('Create placement error:', err);
        res.status(500).json({ 
            success: false,
            message: 'Failed to create placement opportunity',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});


// Get all students for a mentor
app.get('/api/students', authenticate(['mentor']), async (req, res) => {
    console.log('GET /api/students endpoint hit'); // Log for debugging
    try {
        const mentorId = req.user.id; // Get the mentor ID from the authenticated user
        console.log(`Fetching students for mentor ID: ${mentorId}`); // Debugging log
        
        const [students] = await db.query(`
            SELECT id AS user_id, username, full_name, email, roll_number, department, placement_status, created_at
            FROM users
            where role = 'student' and mentor_id = ?
            ORDER BY created_at DESC;
        `, [mentorId]);

        console.log(`Found ${students.length} students`); // Debugging log
        
        res.json({ success: true, data: students });
    } catch (err) {
        console.error('Error fetching students:', err); // Log errors
        res.status(500).json({ success: false, message: 'Failed to fetch students' });
    }
});

app.get('/api/mentors', authenticate(['admin', 'placement_officer', 'mentor']), async (req, res) => {
    try {
        const [mentors] = await db.query(
            "SELECT id AS user_id, full_name, email, department, designation, specialization FROM users WHERE role = 'mentor'"
        );

        res.json(mentors);
    } catch (err) {
        console.error('Error fetching mentors:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch mentors' });
    }
});

// Create placement opportunity (Mentor or Placement Officer)
app.post('/api/placements', authenticate(['mentor', 'placement_officer']), async (req, res) => {
    try {
        // Destructure the request body
        const { 
            title, 
            description, 
            link, // or application_link if that's your column name
            is_important = false 
        } = req.body;

        const mentor_id = req.user.id;

        // Check for required fields
        if (!company_name || !description) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields' 
            });
        }

        // Insert the placement record into the database
        const [result] = await db.query(
            'INSERT INTO placements (mentor_id, title, description, application_link, is_important, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
            [mentor_id, title, description, link || null, is_important] // Use application_link
        );

        res.status(201).json({ 
            success: true,
            message: 'Placement opportunity created successfully',
            data: {
                placement_id: result.insertId
            }
        });
    } catch (err) {
        console.error('Create placement error:', err);
        res.status(500).json({ 
            success: false,
            message: 'Failed to create placement opportunity',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

// Get all placement opportunities
app.get('/api/placements', authenticate(), async (req, res) => {
    try {
        const [placements] = await db.query(`
            SELECT p.*, u.username as mentor_username, u.full_name as mentor_name
            FROM placements p
            JOIN users u ON p.mentor_id = u.id
            ORDER BY p.due_date ASC
        `);

        res.json({ 
            success: true,
            data: placements
        });
    } catch (err) {
        console.error('Get placements error:', err);
        res.status(500).json({ 
            success: false,
            message: 'Failed to fetch placement opportunities',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

// Apply for placement (Student only)
app.post('/api/placements/:id/apply', authenticate(['student']), async (req, res) => {
    try {
        const placementId = req.params.id;
        const studentId = req.user.id;

        // Check if placement exists
        const [placements] = await db.query('SELECT * FROM placements WHERE id = ?', [placementId]);
        if (!placements.length) {
            return res.status(404).json({ 
                success: false, 
                message: 'Placement opportunity not found' 
            });
        }

        // Check if already applied
        const [existingApplications] = await db.query(
            'SELECT * FROM student_applications WHERE student_id = ? AND placement_id = ?',
            [studentId, placementId]
        );
        
        if (existingApplications.length) {
            return res.status(400).json({ 
                success: false, 
                message: 'You have already applied for this placement' 
            });
        }

        const [result] = await db.query(
            'INSERT INTO student_applications (student_id, placement_id) VALUES (?, ?)',
            [studentId, placementId]
        );

        res.status(201).json({ 
            success: true,
            message: 'Application submitted successfully',
            data: {
                application_id: result.insertId
            }
        });
    } catch (err) {
        console.error('Apply for placement error:', err);
        
        if (err.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid placement ID' 
            });
        }
        
        res.status(500).json({ 
            success: false,
            message: 'Failed to submit application',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});
app.post('/api/placement-status', authenticate(['mentor', 'placement_officer', 'student']), async (req, res) => {
    const {
        student_id,
        placement_id,
        job_title,
        status,
        application_date,
        offer_date,
        salary,
        notes
    } = req.body;

    // Basic validation
    if (!student_id || !placement_id || !status) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    try {
        const [result] = await db.query(
            `INSERT INTO student_applications 
            (student_id, placement_id, job_title, status, application_date, offer_date, salary, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                student_id,
                placement_id,
                job_title || null,
                status,
                application_date || null,
                offer_date || null,
                salary || null,
                notes || null
            ]
        );

        res.json({ success: true, message: 'Placement status added', id: result.insertId });
    } catch (err) {
        console.error('Error adding placement status:', err);
        res.status(500).json({ success: false, message: 'Failed to add placement status' });
    }
});

//Placement status
app.get('/api/placement-status', authenticate(['student', 'mentor', 'placement_officer']), async (req, res) => {
    try {
        const { student_id } = req.query;

        let query = `
    SELECT 
        sa.id,
        u.full_name AS student_name,
        u.roll_number,
        u.department,
        p.title,
        sa.job_title,
        sa.status,
        sa.application_date,
        sa.offer_date,
        sa.salary,
        sa.notes
    FROM student_applications sa
    JOIN users u ON sa.student_id = u.id
    JOIN placements p ON sa.placement_id = p.id
`;

        const params = [];
        if (student_id) {
            query += ` WHERE sa.student_id = ?`;
            params.push(student_id);
        }

        const [statuses] = await db.query(query, params);

        res.json({ success: true, data: statuses });
    } catch (err) {
        console.error('Error fetching placement statuses:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch placement statuses' });
    }
});

// DELETE a placement (opportunity/post) by ID
app.delete('/api/placement-status/:id', authenticate(['mentor', 'placement_officer']), async (req, res) => {
    const placementId = req.params.id;

    try {
        const [result] = await db.query('DELETE FROM placements WHERE id = ?', [placementId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Placement not found' });
        }

        res.json({ success: true, message: 'Placement deleted successfully' });
    } catch (err) {
        console.error('Error deleting placement:', err);
        res.status(500).json({ success: false, message: 'Failed to delete placement' });
    }
});

//Placement Updates
app.get('/api/placement-updates', authenticate(['student', 'mentor', 'placement_officer']), async (req, res) => {
    try {
        const [updates] = await db.query(`
            SELECT p.*, u.username AS posted_by_name
            FROM placements p
            JOIN users u ON p.mentor_id = u.id
            ORDER BY p.created_at DESC
        `);

        res.json({ success: true, data: updates });
    } catch (err) {
        console.error('Error fetching placement updates:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch placement updates' });
    }
});

app.delete('/api/placement-updates/:id', authenticate(['mentor', 'placement_officer']), async (req, res) => {
    const updateId = req.params.id;

    try {
        const [result] = await db.query('DELETE FROM placements WHERE id = ?', [updateId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Placement update not found' });
        }

        res.json({ success: true, message: 'Placement update deleted successfully' });
    } catch (err) {
        console.error('Error deleting placement update:', err);
        res.status(500).json({ success: false, message: 'Failed to delete placement update' });
    }
});
// Get my applications (Student only)
app.get('/api/my-applications', authenticate(['student']), async (req, res) => {
    try {
        const studentId = req.user.id;

        const [applications] = await db.query(`
            SELECT sa.*, p.company_name, p.position, p.due_date, 
                   u.username as mentor_username, u.full_name as mentor_name
            FROM student_applications sa
            JOIN placements p ON sa.placement_id = p.id
            JOIN users u ON p.mentor_id = u.id
            WHERE sa.student_id = ?
            ORDER BY sa.id DESC
        `, [studentId]);

        res.json({ 
            success: true,
            data: applications
        });
    } catch (err) {
        console.error('Get applications error:', err);
        res.status(500).json({ 
            success: false,
            message: 'Failed to fetch applications',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});
 
// Update application status (Mentor only)
app.patch('/api/applications/:id/status', authenticate(['mentor']), async (req, res) => {
    try {
        const applicationId = req.params.id;
        const mentorId = req.user.id;
        const { status, feedback } = req.body;

        if (!status || !['applied', 'in_progress', 'completed', 'rejected'].includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid status. Must be one of: applied, in_progress, completed, rejected' 
            });
        }

        // Verify the mentor owns the placement for this application
        const [applications] = await db.query(`
            SELECT sa.* 
            FROM student_applications sa
            JOIN placements p ON sa.placement_id = p.id
            WHERE sa.id = ? AND p.mentor_id = ?
        `, [applicationId, mentorId]);

        if (!applications.length) {
            return res.status(404).json({ 
                success: false, 
                message: 'Application not found or you are not authorized to update it' 
            });
        }

        const [result] = await db.query(
            'UPDATE student_applications SET status = ?, feedback = ? WHERE id = ?',
            [status, feedback || null, applicationId]
        );

        res.json({ 
            success: true,
            message: 'Application status updated successfully'
        });
    } catch (err) {
        console.error('Update application status error:', err);
        res.status(500).json({ 
            success: false,
            message: 'Failed to update application status',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

//meetings
app.get('/api/meetings', authenticate(['student', 'mentor']), async (req, res) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;

        let query = '';
        let params = [];

        if (role === 'student') {
            query = `
                SELECT m.*, u.username AS organizer_name
                FROM meetings m
                JOIN users u ON m.organizer_id = u.id
                WHERE m.id IN (
                    SELECT meeting_id FROM meeting_participants WHERE participant_id = ?
                )
                ORDER BY m.scheduled_time ASC
            `;
            params = [userId];
        } else if (role === 'mentor') {
            query = `
                SELECT m.*, u.username AS organizer_name
                FROM meetings m
                JOIN users u ON m.organizer_id = u.id
                WHERE m.organizer_id = ?
                ORDER BY m.scheduled_time ASC
            `;
            params = [userId];
        } else {
            return res.status(403).json({ success: false, message: 'Unauthorized access' });
        }

        console.log('SQL Query:', query);
        console.log('Parameters:', params);

        const [meetings] = await db.query(query, params);

        res.json({ success: true, data: meetings });
    } catch (err) {
        console.error('Error fetching meetings:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch meetings' });
    }
});

app.post('/api/meetings', authenticate(['mentor', 'placement_officer']), async (req, res) => {
    try {
        const {
            title,
            description,
            scheduled_time,
            duration_minutes,
            teams_meeting_link,
            participant_ids
        } = req.body;

        const organizer_id = req.user.id;  // Assuming `req.user.id` is the logged-in user (mentor or placement officer)

        // Validate required fields
        if (!title || !scheduled_time || !participant_ids || participant_ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: title, scheduled time, or participants.'
            });
        }

        // Insert the meeting into the database
        const [result] = await db.query(
            'INSERT INTO meetings (organizer_id, title, description, scheduled_time, duration_minutes, teams_meeting_link) VALUES (?, ?, ?, ?, ?, ?)',
            [organizer_id, title, description || null, scheduled_time, duration_minutes || null, teams_meeting_link || null]
        );

        const meeting_id = result.insertId;

        // Now insert the meeting participants into the meeting_participants table
        const participantValues = participant_ids.map(participant_id => [meeting_id, participant_id]);
        if (participantValues.length > 0) {
            await db.query(
                'INSERT INTO meeting_participants (meeting_id, participant_id) VALUES ?',
                [participantValues]
            );
        }

        // Respond with success
        res.status(201).json({
            success: true,
            message: 'Meeting scheduled successfully',
            data: {
                meeting_id: meeting_id
            }
        });
    } catch (err) {
        console.error('Error scheduling meeting:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to schedule meeting',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

app.put('/api/meetings/attendance', authenticate(['student', 'mentor']), async (req, res) => {
    const { meetingId, status } = req.body;
    const participantId = req.user.id; // assuming user ID from JWT

    if (!['attending', 'declined', 'pending'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    try {
        const [result] = await db.query(
            `UPDATE meeting_participants 
             SET attendance_status = ? 
             WHERE meeting_id = ? AND participant_id = ?`,
            [status, meetingId, participantId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Record not found' });
        }

        res.json({ success: true, message: 'Attendance updated successfully' });
    } catch (err) {
        console.error('Error updating attendance:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

//Placement-officer Dashboard
app.get('/api/dashboard/placement-officer', authenticate(['placement_officer']), async (req, res) => {
    try {
        // Query for placement statistics
        const [placementStats] = await db.query(`
            SELECT 
                COUNT(*) AS total_students,
                SUM(CASE WHEN placement_status = 'accepted' THEN 1 ELSE 0 END) AS placed_students,
                ROUND(SUM(CASE WHEN placement_status = 'accepted' THEN 1 ELSE 0 END) / COUNT(*) * 100, 2) AS placement_percentage,
                ROUND(AVG(CASE WHEN placement_status = 'accepted' THEN salary ELSE NULL END), 2) AS avg_salary
            FROM users
            LEFT JOIN student_applications ON users.id = student_applications.student_id
            WHERE users.role = 'student'
        `);

        // Query for department-wise placement statistics
        const [deptStats] = await db.query(`
            SELECT 
                department,
                COUNT(*) AS total_students,
                SUM(CASE WHEN placement_status = 'accepted' THEN 1 ELSE 0 END) AS placed_students
            FROM users
            WHERE role = 'student'
            GROUP BY department
        `);

        res.json({
            success: true,
            placementStats,
            deptStats
        });
    } catch (err) {
        console.error('Error fetching placement officer dashboard data:', err);
        res.status(500).json({ success: false, message: 'Failed to load dashboard data' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        success: false,
        message: 'Endpoint not found' 
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

