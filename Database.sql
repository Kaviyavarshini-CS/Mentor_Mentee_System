-- Create the database
CREATE DATABASE IF NOT EXISTS mentor_mentee_management;
USE mentor_mentee_management;

-- Users table (for all roles: students, mentors, placement officers)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('student', 'mentor', 'placement_officer') NOT NULL,
    full_name VARCHAR(100),
    department VARCHAR(100),
    roll_number VARCHAR(20),
    batch_year INT,
    current_cgpa DECIMAL(3,2),
    placement_status ENUM('applied', 'interview', 'offered', 'accepted', 'rejected'),
    mentor_id INT,
    designation VARCHAR(100),
    specialization VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (mentor_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Tasks table
CREATE TABLE tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    mentor_id INT NOT NULL,
    student_id INT NOT NULL,
    due_date DATETIME,
    status ENUM('pending', 'in_progress', 'completed') DEFAULT 'pending',
    remarks TEXT,
    completed_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (mentor_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT NOT NULL,
    student_id INT NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    completed_at DATETIME,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Placements table (for placement opportunities/updates)
CREATE TABLE placements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mentor_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    company_name VARCHAR(100),
    position VARCHAR(100),
    application_link VARCHAR(255),
    is_important BOOLEAN DEFAULT FALSE,
    due_date DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (mentor_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Student applications table
CREATE TABLE student_applications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    placement_id INT NOT NULL,
    job_title VARCHAR(100),
    status ENUM('applied', 'interview', 'offered', 'accepted', 'rejected') DEFAULT 'applied',
    application_date DATE,
    offer_date DATE,
    salary DECIMAL(10,2),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (placement_id) REFERENCES placements(id) ON DELETE CASCADE
);

-- Meetings table
CREATE TABLE meetings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    organizer_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    scheduled_time DATETIME NOT NULL,
    duration_minutes INT,
    teams_meeting_link VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (organizer_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Meeting participants table
CREATE TABLE meeting_participants (
    meeting_id INT NOT NULL,
    participant_id INT NOT NULL,
    attendance_status ENUM('pending', 'attending', 'declined') DEFAULT 'pending',
    PRIMARY KEY (meeting_id, participant_id),
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Notifications table
CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    related_entity_type ENUM('task', 'placement', 'meeting'),
    related_entity_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Password reset tokens
CREATE TABLE password_reset_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Insert initial roles (for reference)
INSERT INTO users (username, email, password, role, full_name) VALUES 
('admin', 'admin@mentorhub.edu', '$2a$10$xJwL5v5Jz5UZJz5UZJz5Ue', 'placement_officer', 'Admin User');

-- Insert some mentors
INSERT INTO users (username, email, password, role, full_name, department, designation, specialization) VALUES 
('mentor1', 'mentor1@mentorhub.edu', '$2a$10$xJwL5v5Jz5UZJz5UZJz5Ue', 'mentor', 'Dr. Smith', 'Computer Science', 'Professor', 'Artificial Intelligence'),
('mentor2', 'mentor2@mentorhub.edu', '$2a$10$xJwL5v5Jz5UZJz5UZJz5Ue', 'mentor', 'Prof. Johnson', 'Electrical Engineering', 'Associate Professor', 'Power Systems');

-- Insert some students
INSERT INTO users (username, email, password, role, full_name, department, roll_number, batch_year, mentor_id) VALUES 
('student1', 'student1@mentorhub.edu', '$2a$10$xJwL5v5Jz5UZJz5UZJz5Ue', 'student', 'Alice Johnson', 'Computer Science', 'CS2021001', 2021, 2),
('student2', 'student2@mentorhub.edu', '$2a$10$xJwL5v5Jz5UZJz5UZJz5Ue', 'student', 'Bob Smith', 'Electrical Engineering', 'EE2021002', 2021, 3),
('student3', 'student3@mentorhub.edu', '$2a$10$xJwL5v5Jz5UZJz5UZJz5Ue', 'student', 'Charlie Brown', 'Computer Science', 'CS2021003', 2021, 2);

-- Insert some tasks
INSERT INTO tasks (title, description, mentor_id, student_id, due_date, status) VALUES 
('Research Paper', 'Write a research paper on machine learning algorithms', 2, 4, '2023-12-15 23:59:59', 'pending'),
('Lab Report', 'Submit lab report for circuit analysis', 3, 5, '2023-12-10 23:59:59', 'in_progress'),
('Project Proposal', 'Prepare project proposal for approval', 2, 6, '2023-12-05 23:59:59', 'completed');

-- Insert some placement opportunities
INSERT INTO placements (mentor_id, title, description, company_name, position, application_link, is_important, due_date) VALUES 
(2, 'Google Internship', 'Summer internship opportunity at Google', 'Google', 'Software Engineering Intern', 'https://careers.google.com', TRUE, '2023-12-31 23:59:59'),
(3, 'Microsoft Full-time', 'Full-time position at Microsoft', 'Microsoft', 'Software Developer', 'https://careers.microsoft.com', FALSE, '2024-01-15 23:59:59');

-- Insert some student applications
INSERT INTO student_applications (student_id, placement_id, job_title, status, application_date, offer_date, salary) VALUES 
(4, 1, 'Software Engineering Intern', 'interview', '2023-11-01', NULL, NULL),
(5, 2, 'Software Developer', 'offered', '2023-11-05', '2023-11-20', 85000.00),
(6, 1, 'Software Engineering Intern', 'accepted', '2023-11-02', '2023-11-15', 7500.00);

-- Insert some meetings
INSERT INTO meetings (organizer_id, title, description, scheduled_time, duration_minutes, teams_meeting_link) VALUES 
(2, 'Research Guidance', 'Monthly research guidance meeting', '2023-12-05 14:00:00', 60, 'https://teams.microsoft.com/l/meetup-join/123'),
(3, 'Project Discussion', 'Discussion about final year projects', '2023-12-10 10:00:00', 90, 'https://teams.microsoft.com/l/meetup-join/456');

-- Insert meeting participants
INSERT INTO meeting_participants (meeting_id, participant_id, attendance_status) VALUES 
(1, 4, 'attending'),
(1, 6, 'pending'),
(2, 5, 'attending');

desc users;
desc tasks;
desc task_assignments ;
desc placements;
desc student_applications;
desc meetings;
desc meeting_participants;

select *from users;
select *from tasks;
select * from task_assignments;
select *from placements;
select * from student_applications;
select *from meetings;
select *from meeting_participants;

INSERT INTO tasks (title, description, mentor_id, student_id, deadline) VALUES ('Leetcode Day-1', 'Problem - 121', 14, 15, '2023-12-15 23:59:59');

ALTER TABLE tasks
RENAME COLUMN due_date TO deadline;
ALTER TABLE student_applications 
ADD COLUMN company_name VARCHAR(100) AFTER placement_id;
ALTER TABLE student_applications 
MODIFY COLUMN placement_id INT NULL,
ADD COLUMN company_name VARCHAR(100) AFTER placement_id;

DELETE FROM users;
DELETE FROM tasks;
DELETE FROM task_assignments;
DELETE FROM placements;
DELETE FROM student_applications;
DELETE FROM meetings;

SET SQL_SAFE_UPDATES = 0;
SET SQL_SAFE_UPDATES = 1;

UPDATE tasks
SET status = 'completed'
WHERE id = 17;
UPDATE meeting_participants
SET attendance_status = 'declined'
WHERE participant_id = 20;

INSERT INTO student_applications (student_id, placement_id, company_name, job_title, status, application_date, offer_date,salary, notes, created_at, updated_at) 
VALUES (20, 9, 'Infosys', 'Junior Data Analyst', 'offered', '2025-04-10', '2025-05-01', 75000.00, 'Strong interview performance.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

SHOW COLUMNS FROM placements;
