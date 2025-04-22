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
app.use(cors());
app.use(bodyParser.json());
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
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

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
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ success: false, message: 'No token, authorization denied' });
        }

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const [users] = await db.query('SELECT * FROM users WHERE id = ?', [decoded.user.id]);
            
            if (!users.length) {
                return res.status(401).json({ success: false, message: 'User not found' });
            }

            const user = users[0];
            
            if (roles.length && !roles.includes(user.role)) {
                return res.status(403).json({ success: false, message: 'Unauthorized access' });
            }

            req.user = user;
            next();
        } catch (err) {
            res.status(401).json({ success: false, message: 'Token is not valid' });
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
app.get('http://localhost:5000/api/health', (req, res) => {
    res.json({ success: true, message: 'Server is running' });
});

// User Registration
app.post('http://localhost:5000/api/register', async (req, res) => {
    try {
        const { username, email, password, role, full_name } = req.body;
        
        // Validate required fields
        if (!username || !email || !password || !role) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields: username, email, password, role' 
            });
        }

        // Validate role
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

        // Create user
        const [result] = await db.query(
            'INSERT INTO users (username, email, password, role, full_name) VALUES (?, ?, ?, ?, ?)',
            [username, email, hashedPassword, role, full_name || null]
        );

        res.status(201).json({ 
            success: true,
            message: 'User registered successfully',
            data: {
                id: result.insertId,
                username,
                email,
                role
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
app.post('http://localhost:5000/api/login', async (req, res) => {
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
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

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
app.get('http://localhost:5000/api/profile', authenticate(), async (req, res) => {
    try {
        const userId = req.user.id;
        
        const [users] = await db.query(
            'SELECT id, username, email, role, full_name, created_at FROM users WHERE id = ?', 
            [userId]
        );
        
        if (!users.length) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        res.json({ 
            success: true,
            data: users[0]
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

// Task Management Endpoints

// Create task (Mentor only)
app.post('http://localhost:5000/api/tasks', authenticate(['mentor']), async (req, res) => {
    try {
        const { title, description, student_id, due_date } = req.body;
        const mentor_id = req.user.id;

        if (!title || !description || !student_id || !due_date) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields: title, description, student_id, due_date' 
            });
        }

        // Verify student exists
        const [students] = await db.query('SELECT * FROM users WHERE id = ? AND role = "student"', [student_id]);
        if (!students.length) {
            return res.status(400).json({ 
                success: false, 
                message: 'Student not found' 
            });
        }

        const [result] = await db.query(
            'INSERT INTO tasks (title, description, mentor_id, student_id, due_date) VALUES (?, ?, ?, ?, ?)',
            [title, description, mentor_id, student_id, due_date]
        );

        res.status(201).json({ 
            success: true,
            message: 'Task created successfully',
            data: {
                task_id: result.insertId
            }
        });
    } catch (err) {
        console.error('Create task error:', err);
        
        if (err.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid student or mentor ID' 
            });
        }
        
        res.status(500).json({ 
            success: false,
            message: 'Failed to create task',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

// Get tasks for current user
app.get('http://localhost:5000/api/tasks', authenticate(), async (req, res) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;

        let query = '';
        let params = [];

        if (role === 'student') {
            query = `
                SELECT t.*, u.username as mentor_username, u.full_name as mentor_name
                FROM tasks t
                JOIN users u ON t.mentor_id = u.id
                WHERE t.student_id = ?
                ORDER BY t.due_date ASC
            `;
            params = [userId];
        } else if (role === 'mentor') {
            query = `
                SELECT t.*, u.username as student_username, u.full_name as student_name
                FROM tasks t
                JOIN users u ON t.student_id = u.id
                WHERE t.mentor_id = ?
                ORDER BY t.due_date ASC
            `;
            params = [userId];
        } else {
            return res.status(403).json({ 
                success: false, 
                message: 'Unauthorized access' 
            });
        }

        const [tasks] = await db.query(query, params);

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

// Update task status (Student only)
app.patch('http://localhost:5000/api/tasks/:id/status', authenticate(['student']), async (req, res) => {
    try {
        const taskId = req.params.id;
        const studentId = req.user.id;
        const { status } = req.body;

        if (!status || !['pending', 'in_progress', 'completed'].includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid status. Must be one of: pending, in_progress, completed' 
            });
        }

        const [result] = await db.query(
            'UPDATE tasks SET status = ? WHERE id = ? AND student_id = ?',
            [status, taskId, studentId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Task not found or not assigned to you' 
            });
        }

        res.json({ 
            success: true,
            message: 'Task status updated successfully'
        });
    } catch (err) {
        console.error('Update task status error:', err);
        res.status(500).json({ 
            success: false,
            message: 'Failed to update task status',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

// Placement Endpoints

// Create placement opportunity (Mentor or Placement Officer)
app.post('http://localhost:5000/api/placements', authenticate(['mentor', 'placement_officer']), async (req, res) => {
    try {
        const { company_name, position, description, application_link, due_date } = req.body;
        const mentor_id = req.user.id;

        if (!company_name || !position || !description || !due_date) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields: company_name, position, description, due_date' 
            });
        }

        const [result] = await db.query(
            'INSERT INTO placements (company_name, position, description, mentor_id, application_link, due_date) VALUES (?, ?, ?, ?, ?, ?)',
            [company_name, position, description, mentor_id, application_link || null, due_date]
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
app.get('http://localhost:5000/api/placements', authenticate(), async (req, res) => {
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
app.post('http://localhost:5000/api/placements/:id/apply', authenticate(['student']), async (req, res) => {
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

// Get my applications (Student only)
app.get('http://localhost:5000/api/my-applications', authenticate(['student']), async (req, res) => {
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
app.patch('http://localhost:5000/api/applications/:id/status', authenticate(['mentor']), async (req, res) => {
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