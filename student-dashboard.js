document.addEventListener('DOMContentLoaded', function() {
// Check authentication
const token = localStorage.getItem('mentorhub_token');
if (!token) {
    window.location.href = 'index.html';
    return;
}

let currentUser = null;

// Logout button
document.getElementById('logoutBtn').addEventListener('click', function() {
    localStorage.removeItem('mentorhub_token');
    window.location.href = 'index.html';
});

// Load dashboard data
async function loadDashboardData() {
    try {
        // Load profile first to get user info
        await loadProfile();
        
        // Load all dashboard data
        const [dashboardRes, tasksRes, meetingsRes, placementRes] = await Promise.all([
            fetch('http://127.0.0.1:80/api/dashboard/student', {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            }),
            fetch('http://127.0.0.1:80/api/tasks', {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            }),
            fetch('http://127.0.0.1:80/api/meetings', {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            }),
            fetch('http://127.0.0.1:80/api/placement-updates', {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            })
        ]);
        
        if (!dashboardRes.ok) console.error('Dashboard API failed:', dashboardRes.statusText);
        if (!tasksRes.ok) console.error('Tasks API failed:', tasksRes.statusText);
        if (!meetingsRes.ok) console.error('Meetings API failed:', meetingsRes.statusText);
        if (!placementRes.ok) console.error('Placement Updates API failed:', placementRes.statusText);

        
        const dashboardData = await dashboardRes.json();
        const tasksJson = await tasksRes.json();
        const tasksData = tasksJson.data || []; // fallback to empty array to avoid breaking

        const meetingsData = (await meetingsRes.json()).data || [];

        const placementData = await placementRes.json();
        
        // Update stats
        document.getElementById('totalTasks').textContent = dashboardData.taskStats.total_tasks;
        document.getElementById('completedTasks').textContent = dashboardData.taskStats.completed_tasks;
        document.getElementById('applications').textContent = dashboardData.placementStats.total_applications;
        document.getElementById('offers').textContent = dashboardData.placementStats.accepted_offers + dashboardData.placementStats.pending_offers;
        
        // Populate recent tasks table
        const recentTasksTable = document.getElementById('recentTasksTable').querySelector('tbody');
        recentTasksTable.innerHTML = '';
        
        tasksData.slice(0, 5).forEach(task => {
            const row = document.createElement('tr');
            row.className = `task-status-${task.student_status}`;
            
            row.innerHTML = `
                <td>${task.title}</td>
                <td>${task.mentor_name}</td>
                <td>${new Date(task.deadline).toLocaleString()}</td>
                <td><span class="badge ${getStatusBadgeClass(task.student_status)}">${formatStatus(task.student_status)}</span></td>
                <td>
                    <button class="btn btn-sm btn-outline-primary update-task-btn" data-task-id="${task.id}">
                        Update Status
                    </button>
                </td>
            `;
            
            recentTasksTable.appendChild(row);
        });
        
        // Populate upcoming meetings table
        const upcomingMeetingsTable = document.getElementById('upcomingMeetingsTable').querySelector('tbody');
        upcomingMeetingsTable.innerHTML = '';
        
        meetingsData.filter(m => new Date(m.scheduled_time) > new Date())
            .slice(0, 5)
            .forEach(meeting => {
                const row = document.createElement('tr');
                
                row.innerHTML = `
                    <td>${meeting.title}</td>
                    <td>${meeting.organizer_name}</td>
                    <td>${new Date(meeting.scheduled_time).toLocaleString()}</td>
                    <td><span class="badge ${getAttendanceBadgeClass(meeting.my_status)}">${formatAttendanceStatus(meeting.my_status)}</span></td>
                    <td>
                        ${meeting.teams_meeting_link ? `
                            <a href="${meeting.teams_meeting_link}" class="btn btn-sm btn-success me-1" target="_blank">
                                Join
                            </a>
                        ` : ''}
                        <button class="btn btn-sm btn-outline-primary update-attendance-btn" data-meeting-id="${meeting.id}">
                            RSVP
                        </button>
                    </td>
                `;
                
                upcomingMeetingsTable.appendChild(row);
            });
        
        // Load tasks for tasks tab
        loadTasks();
        
        // Load meetings for meetings tab
        loadMeetings();
        
        // Load placement data
        loadPlacementData();
        
        // Add event listeners for task status updates
        document.querySelectorAll('.update-task-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const taskId = this.getAttribute('data-task-id');
                openTaskStatusModal(taskId);
            });
        });
        
        // Add event listeners for meeting attendance updates
        document.querySelectorAll('.update-attendance-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const meetingId = this.getAttribute('data-meeting-id');
                openMeetingAttendanceModal(meetingId);
            });
        });
        
    } catch (err) {
        console.error('Error loading dashboard data:', err);
        alert('Failed to load dashboard data');
    }
}

// Load profile data
async function loadProfile() {
    try {
        const response = await fetch('http://127.0.0.1:80/api/profile', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to load profile');
        }
        
        const result = await response.json();
        const data = result.data; // <-- fix here
        currentUser = data;
        
        // Populate profile form
        document.getElementById('profileFullName').value = data.full_name;
        document.getElementById('profileEmail').value = data.email;
        
        if (data.student_info) {
            document.getElementById('profileRollNumber').value = data.student_info.roll_number;
            document.getElementById('profileDepartment').value = data.student_info.department;
            document.getElementById('profileBatchYear').value = data.student_info.batch_year;
        }
        
    } catch (err) {
        console.error('Error loading profile:', err);
        alert('Failed to load profile data');
    }
}

// Load tasks
async function loadTasks(filter = 'all') {
    try {
        const response = await fetch('http://127.0.0.1:80/api/tasks', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to load tasks');
        }
        
        const { data: tasks } = await response.json(); // Destructure the response
        
        const taskList = document.getElementById('taskList');
        taskList.innerHTML = '';
        
        const filteredTasks = filter === 'all' ? tasks : 
                            tasks.filter(t => t.status === filter); // Use status instead of student_status
        
        filteredTasks.forEach(task => {
            const taskCard = document.createElement('div');
            taskCard.className = `col-md-6 col-lg-4 mb-4 task-card task-status-${task.status}`; // Use status
            
            taskCard.innerHTML = `
                <div class="card h-100">
                    <div class="card-body">
                        <h5 class="card-title">${task.title}</h5>
                        <p class="card-text text-muted">${task.description || 'No description'}</p>
                        <div class="mb-2">
                            <span class="badge ${getStatusBadgeClass(task.status)}">${formatStatus(task.status)}</span>
                            ${task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed' ? 
                                '<span class="badge bg-danger ms-1">Overdue</span>' : ''}
                        </div>
                        <p class="card-text"><small class="text-muted">Mentor: ${task.mentor_name || task.mentor_username}</small></p>
                        <p class="card-text"><small class="text-muted">Deadline: ${new Date(task.due_date).toLocaleString()}</small></p>
                        ${task.remarks ? `<p class="card-text"><small>Remarks: ${task.remarks}</small></p>` : ''}
                    </div>
                    <div class="card-footer bg-transparent">
                        <button class="btn btn-sm btn-outline-primary update-task-btn" data-task-id="${task.id}">
                            Update Status
                        </button>
                    </div>
                </div>
            `;
            
            taskList.appendChild(taskCard);
            
            // Add event listener to the button
            taskCard.querySelector('.update-task-btn').addEventListener('click', function() {
                const taskId = this.getAttribute('data-task-id');
                openTaskStatusModal(taskId);
            });
        });
        
    } catch (err) {
        console.error('Error loading tasks:', err);
        alert('Failed to load tasks');
    }
}

// Load meetings
async function loadMeetings(filter = 'upcoming') {
    try {
        const response = await fetch('http://127.0.0.1:80/api/meetings', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }

        });
        
        if (!response.ok) {
            throw new Error('Failed to load meetings');
        }
        //const result = await response.json(); // <-- This is the key line
        const meetings = (await response.json()).data || [];
        const meetingList = document.getElementById('meetingList');
        meetingList.innerHTML = '';
        
        const now = new Date();
        const filteredMeetings = filter === 'all' ? meetings : 
                                filter === 'upcoming' ? meetings.filter(m => new Date(m.scheduled_time) > now) :
                                meetings.filter(m => new Date(m.scheduled_time) <= now);
        
        filteredMeetings.forEach(meeting => {
            const meetingCard = document.createElement('div');
            meetingCard.className = 'col-md-6 col-lg-4 mb-4';
            
            meetingCard.innerHTML = `
                <div class="card h-100">
                    <div class="card-body">
                        <h5 class="card-title">${meeting.title}</h5>
                        <p class="card-text text-muted">${meeting.description || 'No description'}</p>
                        <div class="mb-2">
                            <span class="badge ${getAttendanceBadgeClass(meeting.my_status)}">${formatAttendanceStatus(meeting.my_status)}</span>
                        </div>
                        <p class="card-text"><small class="text-muted">Organizer: ${meeting.organizer_name}</small></p>
                        <p class="card-text"><small class="text-muted">Time: ${new Date(meeting.scheduled_time).toLocaleString()}</small></p>
                        <p class="card-text"><small class="text-muted">Duration: ${meeting.duration_minutes} minutes</small></p>
                    </div>
                    <div class="card-footer bg-transparent">
                        ${meeting.teams_meeting_link ? `
                            <a href="${meeting.teams_meeting_link}" class="btn btn-sm btn-success me-1" target="_blank">
                                Join Meeting
                            </a>
                        ` : ''}
                        <button class="btn btn-sm btn-outline-primary update-attendance-btn" data-meeting-id="${meeting.id}">
                            Update RSVP
                        </button>
                    </div>
                </div>
            `;
            
            meetingList.appendChild(meetingCard);
            
            // Add event listener to the button
            meetingCard.querySelector('.update-attendance-btn').addEventListener('click', function() {
                const meetingId = this.getAttribute('data-meeting-id');
                openMeetingAttendanceModal(meetingId);
            });
        });
        
    } catch (err) {
        console.error('Error loading meetings:', err);
        alert('Failed to load meetings');
    }
}

// Load placement data
async function loadPlacementData() {
    try {
        const [updatesRes, statusRes] = await Promise.all([
            fetch('http://127.0.0.1:80/api/placement-updates', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }),
            fetch('http://127.0.0.1:80/api/placement-status', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            })
        ]);
        
        if (!updatesRes.ok || !statusRes.ok) {
            throw new Error('Failed to load placement data');
        }
        
        const updates = (await updatesRes.json()).data || [];
        const status = (await statusRes.json()).data || [];
        
        // Populate placement updates
        const updatesList = document.getElementById('placementUpdatesList');
        updatesList.innerHTML = '';
        
        updates.slice(0, 5).forEach(update => {
            const updateItem = document.createElement('a');
            updateItem.className = `list-group-item list-group-item-action ${update.is_important ? 'list-group-item-warning' : ''}`;
            updateItem.innerHTML = `
                <div class="d-flex w-100 justify-content-between">
                    <h6 class="mb-1">${update.title}</h6>
                    <small>${new Date(update.created_at).toLocaleDateString()}</small>
                </div>
                <p class="mb-1">${update.description}</p>
                ${update.link ? `<small><a href="${update.link}" target="_blank">More info</a></small>` : ''}
            `;
            
            updatesList.appendChild(updateItem);
        });
        
        // Populate placement status table
        const statusTable = document.getElementById('placementStatusTable').querySelector('tbody');
        statusTable.innerHTML = '';
        
        status.forEach(item => {
            const row = document.createElement('tr');
            
            row.innerHTML = `
                <td>${item.company_name}</td>
                <td>${item.job_title}</td>
                <td><span class="badge ${getPlacementStatusBadgeClass(item.status)}">${formatPlacementStatus(item.status)}</span></td>
                <td>${item.application_date ? new Date(item.application_date).toLocaleDateString() : '-'}</td>
                <td>${item.offer_date ? new Date(item.offer_date).toLocaleDateString() : '-'}</td>
                <td>${item.salary ? item.salary.toLocaleString() : '-'}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary edit-placement-btn" data-placement-id="${item.id}">
                        Edit
                    </button>
                </td>
            `;
            
            statusTable.appendChild(row);
        });
        
    } catch (err) {
        console.error('Error loading placement data:', err);
        alert('Failed to load placement data');
    }
}


async function loadPlacementDropdown() {
    try {
        const response = await fetch('http://127.0.0.1:80/api/placements', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to load placements');

        const data = await response.json();

        const placementSelect = document.getElementById('placementId');
        placementSelect.innerHTML = '<option value="">Select Company</option>'; // Reset

        data.placements.forEach(p => {
            const option = document.createElement('option');
            option.value = p.placement_id;
            option.textContent = p.company_name;
            placementSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading placements:', error);
        alert('Failed to load placement list');
    }
}

// Open task status modal
async function openTaskStatusModal(taskId) {
    try {
        const response = await fetch(`http://127.0.0.1:80/api/tasks/${taskId}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to load task details');
        }
        
        const task = await response.json();
        
        document.getElementById('taskId').value = taskId;
        document.getElementById('taskStatus').value = task.status;
        document.getElementById('taskRemarks').value = task.remarks || '';
        
        const modal = new bootstrap.Modal(document.getElementById('taskStatusModal'));
        modal.show();
        
    } catch (err) {
        console.error('Error opening task status modal:', err);
        alert('Failed to load task details');
    }
}

// Open meeting attendance modal
async function openMeetingAttendanceModal(meetingId) {
    try {
        const response = await fetch(`http://127.0.0.1:80/api/meetings/`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to load meeting details');
        }
        
        const meeting = await response.json();
        
        document.getElementById('meetingId').value = meetingId;
        document.getElementById('attendanceStatus').value = meeting.attendance_status || 'pending';
        
        const modal = new bootstrap.Modal(document.getElementById('meetingAttendanceModal'));
        modal.show();
        
    } catch (err) {
        console.error('Error opening meeting attendance modal:', err);
        alert('Failed to load meeting details');
    }
}

// Save task status
document.getElementById('saveTaskStatus').addEventListener('click', async function() {
    const taskId = document.getElementById('taskId').value;
    const status = document.getElementById('taskStatus').value;
    const remarks = document.getElementById('taskRemarks').value;
    
    try {
        const response = await fetch(`http://127.0.0.1:80/api/tasks/${taskId}/status`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status, remarks })
        });
        
        if (!response.ok) {
            throw new Error('Failed to update task status');
        }
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('taskStatusModal'));
        modal.hide();
        
        // Reload data
        loadDashboardData();
        loadTasks();
        
    } catch (err) {
        console.error('Error updating task status:', err);
        alert('Failed to update task status');
    }
});

// Save meeting attendance
document.getElementById('saveAttendanceStatus').addEventListener('click', async function() {
    const meetingId = document.getElementById('meetingId').value;
    const status = document.getElementById('attendanceStatus').value;
    
    try {
        const response = await fetch(`http://127.0.0.1:80/api/meetings/attendance`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status })
        });
        
        if (!response.ok) {
            throw new Error('Failed to update attendance status');
        }
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('meetingAttendanceModal'));
        modal.hide();
        
        // Reload data
        loadDashboardData();
        loadMeetings();
        
    } catch (err) {
        console.error('Error updating attendance status:', err);
        alert('Failed to update attendance status');
    }
});


// Call this when the modal is shown
document.getElementById('addPlacementModal').addEventListener('show.bs.modal', async () => {
    try {
        const response = await fetch('/api/placements', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const placements = await response.json();
        
        const select = document.getElementById('placementSelect');
        select.innerHTML = '<option value="">Select a company</option>' + 
            placements.map(p => `<option value="${p.id}">${p.company_name}</option>`).join('');
    } catch (err) {
        console.error('Error loading placements:', err);
    }
});
// Save placement status
document.getElementById('savePlacementStatus').addEventListener('click', async function() {
    const placementId = document.getElementById('placementId').value;
    const jobTitle = document.getElementById('placementJobTitle').value;
    const status = document.getElementById('placementStatus').value;
    const applicationDate = document.getElementById('placementApplicationDate').value;
    const offerDate = document.getElementById('placementOfferDate').value;
    const salary = document.getElementById('placementSalary').value;
    const notes = document.getElementById('placementNotes').value;
    
    try {
        const response = await fetch('http://127.0.0.1:80/api/placement-status', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                student_id: currentUser.id,
                placement_id: parseInt(placementId),
                job_title: jobTitle,
                status,
                application_date: applicationDate || null,
                offer_date: offerDate || null,
                salary: salary ? parseFloat(salary) : null,
                notes
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to add placement status');
        }
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('addPlacementModal'));
        modal.hide();
        
        // Reset form
        document.getElementById('placementStatusForm').reset();
        
        // Reload data
        loadPlacementData();
        loadDashboardData();
        
    } catch (err) {
        console.error('Error adding placement status:', err);
        alert('Failed to add placement status');
    }
});

// Update profile
document.getElementById('profileForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const fullName = document.getElementById('profileFullName').value;
    const email = document.getElementById('profileEmail').value;
    const rollNumber = document.getElementById('profileRollNumber').value;
    const department = document.getElementById('profileDepartment').value;
    const batchYear = document.getElementById('profileBatchYear').value;
    
    try {
        // Update user info
        const response = await fetch('http://127.0.0.1:80/api/profile', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                full_name: fullName,
                email,
                roll_number: rollNumber,
                department,
                batch_year: batchYear
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to update profile');
        }
        
        alert('Profile updated successfully');
        loadProfile();
        
    } catch (err) {
        console.error('Error updating profile:', err);
        alert('Failed to update profile');
    }
});

// Change password
document.getElementById('passwordForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;
    
    if (newPassword !== confirmNewPassword) {
        alert('New passwords do not match');
        return;
    }
    
    try {
        const response = await fetch('http://127.0.0.1:80/api/change-password', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to change password');
        }
        
        alert('Password changed successfully');
        this.reset();
        
    } catch (err) {
        console.error('Error changing password:', err);
        alert('Failed to change password');
    }
});

// Task filter buttons
document.querySelectorAll('.filter-task').forEach(btn => {
    btn.addEventListener('click', function() {
        const status = this.getAttribute('data-status');
        loadTasks(status);
        
        // Update active button
        document.querySelectorAll('.filter-task').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
    });
});

// Meeting filter buttons
document.querySelectorAll('.filter-meeting').forEach(btn => {
    btn.addEventListener('click', function() {
        const status = this.getAttribute('data-status');
        loadMeetings(status);
        
        // Update active button
        document.querySelectorAll('.filter-meeting').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
    });
});

// Helper functions
function formatStatus(status) {
    return status.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
}

function getStatusBadgeClass(status) {
    switch(status) {
        case 'completed': return 'bg-success';
        case 'in_progress': return 'bg-info';
        default: return 'bg-warning text-dark';
    }
}

function formatAttendanceStatus(status) {
    switch(status) {
        case 'attending': return 'Attending';
        case 'declined': return 'Declined';
        default: return 'Pending';
    }
}

function getAttendanceBadgeClass(status) {
    switch(status) {
        case 'attending': return 'bg-success';
        case 'declined': return 'bg-danger';
        default: return 'bg-warning text-dark';
    }
}

function formatPlacementStatus(status) {
    return status.charAt(0).toUpperCase() + status.slice(1);
}

function getPlacementStatusBadgeClass(status) {
    switch(status) {
        case 'accepted': return 'bg-success';
        case 'offered': return 'bg-primary';
        case 'interview': return 'bg-info text-dark';
        case 'rejected': return 'bg-danger';
        default: return 'bg-secondary';
    }
}

// Initialize dashboard
loadDashboardData();
});