document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    const token = localStorage.getItem('mentorhub_token');
    if (!token) {
        window.location.href = 'index.html';
        return;
    }
    
    let currentUser = null;
    let placementChart = null;
    
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
            const [dashboardRes, tasksRes, updatesRes, studentsRes] = await Promise.all([
                fetch('http://127.0.0.1:5000/api/dashboard/mentor', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }),
                fetch('http://127.0.0.1:5000/api/tasks', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }),
                fetch('http://127.0.0.1:5000/api/placement-updates', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }),
                fetch('http://127.0.0.1:5000/api/students', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }).catch(err => {
                    console.error('Failed to fetch students:', err);
                    return { ok: false, status: 404 };
                })
            ]);
            
            console.log('Dashboard Response:', dashboardRes.status);
            console.log('Tasks Response:', tasksRes.status);
            console.log('Placement Updates Response:', updatesRes.status);
            console.log('Students Response:', studentsRes.status);

            if (!dashboardRes.ok || !tasksRes.ok || !updatesRes.ok || !studentsRes.ok) {
                const dashboardError = await dashboardRes.text();
                console.error('Dashboard error details:', dashboardError);
                throw new Error(`Failed to load dashboard data: ${dashboardError}`);
            }
            
            const dashboardData = await dashboardRes.json();
            const tasksData = await tasksRes.json();
            const updatesData = await updatesRes.json();
            const studentsData = await studentsRes.json();
            
            console.log('Dashboard Data:', dashboardData);
            console.log('Tasks Data:', tasksData);
            console.log('Placement Updates Data:', updatesData);
            console.log('Students Data:', studentsData);

            // Update stats
            
            document.getElementById('totalTasks').textContent = dashboardData.taskStats.total_tasks;
            document.getElementById('completedTasks').textContent = dashboardData.taskStats.completed_tasks;
            document.getElementById('totalStudents').textContent = dashboardData.studentStats.total_students;
            document.getElementById('placedStudents').textContent = 
                dashboardData.studentStats.students_with_placements > 0 ? 
                Math.round((dashboardData.studentStats.students_with_placements / dashboardData.studentStats.total_students) * 100) + '%' : '0%';
            
            // Populate recent tasks table
            const tasksArray = tasksData.tasks || tasksData.data || tasksData;
            if (!Array.isArray(tasksData.tasks) || tasksData.tasks.length === 0) {
                console.warn("No tasks found.");
                return;
            }
            
            const recentTasksTable = document.getElementById('recentTasksTable').querySelector('tbody');
            recentTasksTable.innerHTML = '';
            if (Array.isArray(tasksArray) && tasksArray.length > 0) {
                tasksArray.slice(0, 5).forEach(task => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${task.title}</td>
                        <td>${task.assigned_count || task.student_id ? 1 : 0} students</td>
                        <td>${task.deadline ? new Date(task.deadline).toLocaleString() : '-'}</td>
                        <td>
                            <span class="badge ${task.completed_count === task.assigned_count ? 'bg-success' : 
                                task.completed_count > 0 ? 'bg-info' : 'bg-warning text-dark'}">
                                ${task.completed_count || 0}/${task.assigned_count || (task.student_id ? 1 : 0)} completed
                            </span>
                        </td>
                        <td>
                            <button class="btn btn-sm btn-outline-primary view-task-btn" data-task-id="${task.id}">
                                View
                            </button>
                        </td>
                    `;
                    recentTasksTable.appendChild(row);
                });
            } else {
                console.warn("No tasks found in response:", tasksData);
                // Add a "no tasks" row
                const row = document.createElement('tr');
                row.innerHTML = '<td colspan="5" class="text-center">No tasks found</td>';
                recentTasksTable.appendChild(row);
            }
            // Populate placement updates list
            const updatesList = document.getElementById('placementUpdatesList');
            updatesList.innerHTML = '';
            
            updatesData.data.slice(0, 3).forEach(update => {
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
            
            // Create placement chart
            createPlacementChart(studentsData);
            
            // Load tasks for tasks tab
            loadTasks();
            
            // Load placement data for placement tab
            loadPlacementData();
            
            // Load students for students tab
            loadStudents();
            
            // Load meetings for meetings tab
            loadMeetings();
            
            // Add event listeners for view task buttons
            document.querySelectorAll('.view-task-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const taskId = this.getAttribute('data-task-id');
                    viewTaskDetails(taskId);
                });
            });
            
        } catch (err) {
            console.error('Detailed error loading dashboard:', err);
            alert(`Error: ${err.message}`);
        }
    }
    
    // Create placement chart
    function createPlacementChart(students) {
        const ctx = document.getElementById('placementChart').getContext('2d');
        if (!ctx) return;
        // Count placement status
        const statusCounts = {
            placed: 0,
            unplaced: 0
        };
        
        students.forEach(student => {
            if (student.placement_status === 'accepted') {
                statusCounts.placed++;
            } else {
                statusCounts.unplaced++;
            }
        });
        
        if (placementChart) {
            placementChart.destroy();
        }
        
        placementChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Placed', 'Unplaced'],
                datasets: [{
                    data: [statusCounts.placed, statusCounts.unplaced],
                    backgroundColor: ['#28a745', '#dc3545'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }
    
    // Load profile data
    async function loadProfile() {
        try {
            const response = await fetch('http://127.0.0.1:5000/api/profile', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to load profile');
            }
            
            const data = await response.json();
            currentUser = data;
            
            // Populate profile form
            document.getElementById('profileFullName').value = data.full_name;
            document.getElementById('profileEmail').value = data.email;
            
            if (data.mentor_info) {
                document.getElementById('profileDepartment').value = data.mentor_info.department;
                document.getElementById('profileDesignation').value = data.mentor_info.designation;
                document.getElementById('profileSpecialization').value = data.mentor_info.specialization || '';
            }
            
        } catch (err) {
            console.error('Error loading profile:', err);
            alert('Failed to load profile data');
        }
    }
    
    // Load tasks
    async function loadTasks(filter = 'all') {
        try {
            const response = await fetch('http://127.0.0.1:5000/api/tasks', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to load tasks');
            }
            
            const { data: tasks } = await response.json();
            const tasksTable = document.getElementById('tasksTable').querySelector('tbody');
            tasksTable.innerHTML = '';
            
            tasks.forEach(task => {
                const row = document.createElement('tr');
                
                row.innerHTML = `
                    <td>${task.title}</td>
                    <td>${task.description || '-'}</td>
                    <td>${task.deadline ? new Date(task.deadline).toLocaleString() : '-'}</td>
                    <td>${task.assigned_count} students</td>
                    <td>
                        <span class="badge ${task.completed_count === task.assigned_count ? 'bg-success' : 
                            task.completed_count > 0 ? 'bg-info' : 'bg-warning text-dark'}">
                            ${task.completed_count}/${task.assigned_count} completed
                        </span>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary view-task-btn" data-task-id="${task.id}">
                            View
                        </button>
                    </td>
                `;
                
                tasksTable.appendChild(row);
                
                // Add event listener to the button
                row.querySelector('.view-task-btn').addEventListener('click', function() {
                    const taskId = this.getAttribute('data-task-id');
                    viewTaskDetails(taskId);
                });
            });
            
        } catch (err) {
            console.error('Error loading tasks:', err);
            alert('Failed to load tasks');
        }
    }
    
    // View task details
    async function viewTaskDetails(taskId) {
        try {
            const response = await fetch(`http://127.0.0.1:5000/api/tasks/${taskId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to load task details');
            }
            
            const task = await response.json();
            
            // Populate task details
            document.getElementById('taskModalTitle').textContent = task.title;
            document.getElementById('taskModalDescription').textContent = task.description || 'No description';
            document.getElementById('taskModalDeadline').textContent = task.deadline ? new Date(task.deadline).toLocaleString() : 'No deadline';
            document.getElementById('taskModalStatus').innerHTML = `
                <span class="badge ${task.completed_count === task.assigned_count ? 'bg-success' : 
                    task.completed_count > 0 ? 'bg-info' : 'bg-warning text-dark'}">
                    ${task.completed_count}/${task.assigned_count} completed
                </span>
            `;
            
            // Populate assigned students
            const studentsTable = document.getElementById('taskStudentsTable').querySelector('tbody');
            studentsTable.innerHTML = '';
            
            task.assigned_students.forEach(student => {
                const row = document.createElement('tr');
                
                row.innerHTML = `
                    <td>${student.full_name}</td>
                    <td>${student.roll_number}</td>
                    <td><span class="badge ${getStatusBadgeClass(student.status)}">${formatStatus(student.status)}</span></td>
                    <td>${student.completed_at ? new Date(student.completed_at).toLocaleString() : '-'}</td>
                    <td>${student.remarks || '-'}</td>
                `;
                
                studentsTable.appendChild(row);
            });
            
            const modal = new bootstrap.Modal(document.getElementById('viewTaskModal'));
            modal.show();
            
        } catch (err) {
            console.error('Error viewing task details:', err);
            alert('Failed to load task details');
        }
    }
    
    // Load placement data
    async function loadPlacementData() {
        try {
            const [updatesRes, statusRes] = await Promise.all([
                fetch('http://127.0.0.1:5000/api/placement-updates', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }),
                fetch('http://127.0.0.1:5000/api/placement-status', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                })
            ]);
            
            if (!updatesRes.ok || !statusRes.ok) {
                throw new Error('Failed to load placement data');
            }
            
            const updates = await updatesRes.json();
            const status = await statusRes.json();
            
            // Populate placement updates table
            const updatesTable = document.getElementById('placementUpdatesTable').querySelector('tbody');
            updatesTable.innerHTML = '';
            
            updates.forEach(update => {
                const row = document.createElement('tr');
                
                row.innerHTML = `
                    <td>${update.title}</td>
                    <td>${update.description || '-'}</td>
                    <td>${update.posted_by_name}</td>
                    <td>${new Date(update.created_at).toLocaleDateString()}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-danger delete-update-btn" data-update-id="${update.id}">
                            Delete
                        </button>
                    </td>
                `;
                
                updatesTable.appendChild(row);
                
                // Add event listener to delete button
                row.querySelector('.delete-update-btn').addEventListener('click', function() {
                    const updateId = this.getAttribute('data-update-id');
                    if (confirm('Are you sure you want to delete this update?')) {
                        deletePlacementUpdate(updateId);
                    }
                });
            });
            
            // Populate placement status table
            const statusTable = document.getElementById('placementStatusTable').querySelector('tbody');
            statusTable.innerHTML = '';
            
            status.forEach(item => {
                const row = document.createElement('tr');
                
                row.innerHTML = `
                    <td>${item.student_name}</td>
                    <td>${item.roll_number}</td>
                    <td>${item.company_name}</td>
                    <td>${item.job_title}</td>
                    <td><span class="badge ${getPlacementStatusBadgeClass(item.status)}">${formatPlacementStatus(item.status)}</span></td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary edit-placement-btn" data-placement-id="${item.id}">
                            Edit
                        </button>
                        <button class="btn btn-sm btn-outline-danger delete-placement-btn" data-placement-id="${item.id}">
                            Delete
                        </button>
                    </td>
                `;
                
                statusTable.appendChild(row);
                
                // Add event listeners to buttons
                row.querySelector('.edit-placement-btn').addEventListener('click', function() {
                    const placementId = this.getAttribute('data-placement-id');
                    editPlacementStatus(placementId);
                });
                
                row.querySelector('.delete-placement-btn').addEventListener('click', function() {
                    const placementId = this.getAttribute('data-placement-id');
                    if (confirm('Are you sure you want to delete this placement status?')) {
                        deletePlacementStatus(placementId);
                    }
                });
            });
            
        } catch (err) {
            console.error('Error loading placement data:', err);
            alert('Failed to load placement data');
        }
    }
    
    // Load students
    async function loadStudents() {
        try {
            const response = await fetch('http://127.0.0.1:5000/api/students', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to load students');
            }
            
            const students = await response.json();
            const studentsTable = document.getElementById('studentsTable').querySelector('tbody');
            studentsTable.innerHTML = '';
            
            students.forEach(student => {
                const row = document.createElement('tr');
                
                row.innerHTML = `
                    <td>${student.full_name}</td>
                    <td>${student.roll_number}</td>
                    <td>${student.department}</td>
                    <td>${student.batch_year}</td>
                    <td>${student.current_cgpa || '-'}</td>
                    <td>
                        <span class="badge ${student.placement_status === 'accepted' ? 'bg-success' : 'bg-secondary'}">
                            ${student.placement_status === 'accepted' ? 'Placed' : 'Unplaced'}
                        </span>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary view-student-btn" data-student-id="${student.user_id}">
                            View
                        </button>
                    </td>
                `;
                
                studentsTable.appendChild(row);
                
                // Add event listener to view button
                row.querySelector('.view-student-btn').addEventListener('click', function() {
                    const studentId = this.getAttribute('data-student-id');
                    // You can implement a modal to view student details
                    alert(`View student ${studentId}`);
                });
            });
            
        } catch (err) {
            console.error('Error loading students:', err);
            alert('Failed to load students');
        }
    }
    
    // Load meetings
    async function loadMeetings(filter = 'upcoming') {
        try {
            const response = await fetch('http://127.0.0.1:5000/api/meetings', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to load meetings');
            }
            
            const meetings = await response.json();
            const meetingsTable = document.getElementById('meetingsTable').querySelector('tbody');
            meetingsTable.innerHTML = '';
            
            const now = new Date();
            const filteredMeetings = filter === 'all' ? meetings : 
                                    filter === 'upcoming' ? meetings.filter(m => new Date(m.scheduled_time) > now) :
                                    meetings.filter(m => new Date(m.scheduled_time) <= now);
            
            filteredMeetings.forEach(meeting => {
                const row = document.createElement('tr');
                
                row.innerHTML = `
                    <td>${meeting.title}</td>
                    <td>${meeting.description || '-'}</td>
                    <td>${new Date(meeting.scheduled_time).toLocaleString()}</td>
                    <td>${meeting.participant_count} participants</td>
                    <td>
                        ${meeting.teams_meeting_link ? `
                            <a href="${meeting.teams_meeting_link}" class="btn btn-sm btn-success me-1" target="_blank">
                                Join
                            </a>
                        ` : ''}
                        <button class="btn btn-sm btn-outline-primary view-meeting-btn" data-meeting-id="${meeting.id}">
                            View
                        </button>
                        <button class="btn btn-sm btn-outline-danger delete-meeting-btn" data-meeting-id="${meeting.id}">
                            Delete
                        </button>
                    </td>
                `;
                
                meetingsTable.appendChild(row);
                
                // Add event listeners to buttons
                row.querySelector('.view-meeting-btn').addEventListener('click', function() {
                    const meetingId = this.getAttribute('data-meeting-id');
                    viewMeetingDetails(meetingId);
                });
                
                row.querySelector('.delete-meeting-btn').addEventListener('click', function() {
                    const meetingId = this.getAttribute('data-meeting-id');
                    if (confirm('Are you sure you want to delete this meeting?')) {
                        deleteMeeting(meetingId);
                    }
                });
            });
            
        } catch (err) {
            console.error('Error loading meetings:', err);
            alert('Failed to load meetings');
        }
    }
    
    // View meeting details
    async function viewMeetingDetails(meetingId) {
        try {
            const response = await fetch(`http://127.0.0.1:5000/api/meetings/${meetingId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to load meeting details');
            }
            
            const meeting = await response.json();
            
            // You can implement a modal to show meeting details and participants
            alert(`Meeting: ${meeting.title}\nTime: ${new Date(meeting.scheduled_time).toLocaleString()}\nParticipants: ${meeting.participant_count}`);
            
        } catch (err) {
            console.error('Error viewing meeting details:', err);
            alert('Failed to load meeting details');
        }
    }
    
    // Delete meeting
    async function deleteMeeting(meetingId) {
        try {
            const response = await fetch(`http://127.0.0.1:5000/api/meetings/${meetingId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to delete meeting');
            }
            
            // Reload meetings
            loadMeetings();
            
        } catch (err) {
            console.error('Error deleting meeting:', err);
            alert('Failed to delete meeting');
        }
    }
    
    // Delete placement update
    async function deletePlacementUpdate(updateId) {
        try {
            
            const response = await fetch(`http://127.0.0.1:5000/api/placement-updates/${updateId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to delete placement update');
            }
            
            // Reload placement data
            loadPlacementData();
            
        } catch (err) {
            console.error('Error deleting placement update:', err);
            alert('Failed to delete placement update');
        }
    }
    
    // Edit placement status
    async function editPlacementStatus(placementId) {
        try {
            const response = await fetch(`http://127.0.0.1:5000/api/placement-status/${placementId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to load placement status');
            }
            
            const status = await response.json();
            
            // You can implement a modal to edit placement status
            alert(`Edit placement status for ${status.company_name}`);
            
        } catch (err) {
            console.error('Error editing placement status:', err);
            alert('Failed to load placement status');
        }
        statusCounts.placed = students.filter(student => 
        student.placement_status && student.placement_status === 'accepted'
        ).length;
        statusCounts.unplaced = students.length - statusCounts.placed;
    }
    
    // Delete placement status
    async function deletePlacementStatus(placementId) {
        try {
            const response = await fetch(`http://127.0.0.1:5000/api/placement-status/${placementId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to delete placement status');
            }
            
            // Reload placement data
            loadPlacementData();
            
        } catch (err) {
            console.error('Error deleting placement status:', err);
            alert('Failed to delete placement status');
        }
    }
    
    // Create task
    document.getElementById('saveTaskBtn').addEventListener('click', async function() {
        const title = document.getElementById('taskTitle').value;
        const description = document.getElementById('taskDescription').value;
        const deadline = document.getElementById('taskDeadline').value;
        const studentIds = Array.from(document.getElementById('taskStudents').selectedOptions).map(opt => opt.value);
        
        try {
            const response = await fetch('http://127.0.0.1:5000/api/tasks', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title,
                    description,
                    deadline,
                    student_ids: studentIds
                })
            });
            
            if (!response.ok) {
                throw new Error('Failed to create task');
            }
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('createTaskModal'));
            modal.hide();
            
            // Reset form
            document.getElementById('createTaskForm').reset();
            
            // Reload tasks
            loadTasks();
            loadDashboardData();
            
        } catch (err) {
            console.error('Error creating task:', err);
            alert('Failed to create task');
        }
    });
    
    // Post placement update
    document.getElementById('saveUpdateBtn').addEventListener('click', async function() {
        const title = document.getElementById('updateTitle').value;
        const description = document.getElementById('updateDescription').value;
        const link = document.getElementById('updateLink').value;
        const isImportant = document.getElementById('updateImportant').checked;
        
        try {
            // In your frontend code where you post updates:
                const isImportant = document.getElementById('updateImportant').checked;
                const response = await fetch('http://127.0.0.1:5000/api/placement-updates', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title,
                    description,
                    link,
                    is_important: isImportant
                })
            });
            if (!response.ok) {
                throw new Error('Failed to post placement update');
            }
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('addPlacementUpdateModal'));
            modal.hide();
            
            // Reset form
            document.getElementById('placementUpdateForm').reset();
            
            // Reload placement data
            loadPlacementData();
            loadDashboardData();
            
        } catch (err) {
            console.error('Error posting placement update:', err);
            alert('Failed to post placement update');
        }
    });
    
    // Add placement status
    document.getElementById('savePlacementStatusBtn').addEventListener('click', async function() {
        const studentId = document.getElementById('placementStudent').value;
        const company = document.getElementById('placementCompany').value;
        const jobTitle = document.getElementById('placementJobTitle').value;
        const status = document.getElementById('placementStatus').value;
        const applicationDate = document.getElementById('placementApplicationDate').value;
        const offerDate = document.getElementById('placementOfferDate').value;
        const salary = document.getElementById('placementSalary').value;
        const notes = document.getElementById('placementNotes').value;
        
        try {
            const response = await fetch('http://127.0.0.1:5000/api/placement-status', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    student_id: studentId,
                    company_name: company,
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
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('addPlacementStatusModal'));
            modal.hide();
            
            // Reset form
            document.getElementById('placementStatusForm').reset();
            
            // Reload placement data
            loadPlacementData();
            
        } catch (err) {
            console.error('Error adding placement status:', err);
            alert('Failed to add placement status');
        }
    });
    
    // Schedule meeting
    document.getElementById('saveMeetingBtn').addEventListener('click', async function() {
        const title = document.getElementById('meetingTitle').value;
        const description = document.getElementById('meetingDescription').value;
        const dateTime = document.getElementById('meetingDateTime').value;
        const duration = document.getElementById('meetingDuration').value;
        const teamsLink = document.getElementById('meetingTeamsLink').value;
        const participantIds = Array.from(document.getElementById('meetingParticipants').selectedOptions).map(opt => opt.value);
        
        try {
            const response = await fetch('http://127.0.0.1:5000/api/meetings', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title,
                    description,
                    scheduled_time: dateTime,
                    duration_minutes: duration,
                    teams_meeting_link: teamsLink,
                    participant_ids: participantIds
                })
            });
            
            if (!response.ok) {
                throw new Error('Failed to schedule meeting');
            }
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('scheduleMeetingModal'));
            modal.hide();
            
            // Reset form
            document.getElementById('scheduleMeetingForm').reset();
            
            // Reload meetings
            loadMeetings();
            
        } catch (err) {
            console.error('Error scheduling meeting:', err);
            alert('Failed to schedule meeting');
        }
    });
    
    // Update profile
    document.getElementById('profileForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const fullName = document.getElementById('profileFullName').value;
        const email = document.getElementById('profileEmail').value;
        const department = document.getElementById('profileDepartment').value;
        const designation = document.getElementById('profileDesignation').value;
        const specialization = document.getElementById('profileSpecialization').value;
        
        try {
            const response = await fetch('http://127.0.0.1:5000/api/profile', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    full_name: fullName,
                    email,
                    department,
                    designation,
                    specialization
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
            const response = await fetch('http://127.0.0.1:5000/api/change-password', {
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
    
    // Load students for task assignment when modal is shown
    document.getElementById('createTaskModal').addEventListener('show.bs.modal', async function() {
        try {
            const response = await fetch('http://127.0.0.1:5000/api/students', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to load students');
            }
            
            const { data: students } = await response.json();
            const studentsSelect = document.getElementById('taskStudents');
            studentsSelect.innerHTML = '';
            
            students.forEach(student => {
                const option = document.createElement('option');
                option.value = student.user_id;
                option.textContent = `${student.full_name} (${student.roll_number})`;
                studentsSelect.appendChild(option);
            });
            
        } catch (err) {
            console.error('Error loading students:', err);
            alert('Failed to load students for task assignment');
        }
    });
    
    // Load students for placement status when modal is shown
    document.getElementById('addPlacementStatusModal').addEventListener('show.bs.modal', async function() {
        try {
            const response = await fetch('http://127.0.0.1:5000/api/students', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to load students');
            }
            
            const students = await response.json();
            const studentSelect = document.getElementById('placementStudent');
            studentSelect.innerHTML = '';
            
            students.forEach(student => {
                const option = document.createElement('option');
                option.value = student.user_id;
                option.textContent = `${student.full_name} (${student.roll_number})`;
                studentSelect.appendChild(option);
            });
            
        } catch (err) {
            console.error('Error loading students:', err);
            alert('Failed to load students for placement status');
        }
    });
    
    // Load students and mentors for meeting participants when modal is shown
    document.getElementById('scheduleMeetingModal').addEventListener('show.bs.modal', async function() {
        try {
            const [studentsRes, mentorsRes] = await Promise.all([
                fetch('http://127.0.0.1:5000/api/students', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }),
                fetch('http://127.0.0.1:5000/api/mentors', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                })
            ]);
            
            if (!studentsRes.ok || !mentorsRes.ok) {
                throw new Error('Failed to load participants');
            }
            
            const students = await studentsRes.json();
            const mentors = await mentorsRes.json();
            const participantsSelect = document.getElementById('meetingParticipants');
            participantsSelect.innerHTML = '';
            
            // Add students
            students.forEach(student => {
                const option = document.createElement('option');
                option.value = student.user_id;
                option.textContent = `Student: ${student.full_name} (${student.roll_number})`;
                participantsSelect.appendChild(option);
            });
            
            // Add mentors (excluding current user)
            mentors.forEach(mentor => {
                if (mentor.user_id !== currentUser.id) {
                    const option = document.createElement('option');
                    option.value = mentor.user_id;
                    option.textContent = `Mentor: ${mentor.full_name}`;
                    participantsSelect.appendChild(option);
                }
            });
            
        } catch (err) {
            console.error('Error loading participants:', err);
            alert('Failed to load meeting participants');
        }
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