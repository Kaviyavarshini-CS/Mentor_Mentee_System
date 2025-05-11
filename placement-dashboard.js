document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    const token = localStorage.getItem('mentorhub_token');
    if (!token) {
        window.location.href = 'index.html';
        return;
    }
    
    let currentUser = null;
    let placementDeptChart = null;
    let currentPlacementId = null;
    
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
            const [dashboardRes, updatesRes, statusRes] = await Promise.all([
                fetch('http://127.0.0.1:5000/api/dashboard/placement-officer', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }),
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
            
            if (!dashboardRes.ok || !updatesRes.ok || !statusRes.ok) {
                throw new Error('Failed to load dashboard data');
            }
            
            const dashboardData = await dashboardRes.json();
            const updatesData = await updatesRes.json();
            const statusData = await statusRes.json();
            
            // Update stats
            document.getElementById('totalStudents').textContent = dashboardData.placementStats.total_students;
            document.getElementById('placedStudents').textContent = dashboardData.placementStats.placed_students;
            document.getElementById('placementRate').textContent = dashboardData.placementStats.placement_percentage + '%';
            document.getElementById('avgSalary').textContent = dashboardData.placementStats.avg_salary ? 
                '$' + dashboardData.placementStats.avg_salary.toLocaleString() : '-';
            
            // Create department chart
            createDeptChart(dashboardData.deptStats);
            
            // Populate recent placements table
            const recentPlacementsTable = document.getElementById('recentPlacementsTable').querySelector('tbody');
            recentPlacementsTable.innerHTML = '';
            
            statusData
                .filter(item => item.status === 'accepted')
                .sort((a, b) => new Date(b.offer_date) - new Date(a.offer_date))
                .slice(0, 5)
                .forEach(item => {
                    const row = document.createElement('tr');
                    
                    row.innerHTML = `
                        <td>${item.student_name}</td>
                        <td>${item.roll_number}</td>
                        <td>${item.company_name}</td>
                        <td>${item.job_title}</td>
                        <td>${item.offer_date ? new Date(item.offer_date).toLocaleDateString() : '-'}</td>
                        <td>${item.salary ? '$' + item.salary.toLocaleString() : '-'}</td>
                    `;
                    
                    recentPlacementsTable.appendChild(row);
                });
            
            // Load placement data for placement tab
            loadPlacementData();
            
            // Load students for students tab
            loadStudents();
            
            // Load meetings for meetings tab
            loadMeetings();
            
        } catch (err) {
            console.error('Error loading dashboard data:', err);
            alert('Failed to load dashboard data');
        }
    }
    
    // Create department chart
    function createDeptChart(deptStats) {
        const ctx = document.getElementById('placementDeptChart').getContext('2d');
        
        const departments = deptStats.map(dept => dept.department);
        const placed = deptStats.map(dept => dept.placed_students);
        const unplaced = deptStats.map(dept => dept.total_students - dept.placed_students);
        
        if (placementDeptChart) {
            placementDeptChart.destroy();
        }
        
        placementDeptChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: departments,
                datasets: [
                    {
                        label: 'Placed Students',
                        data: placed,
                        backgroundColor: '#28a745'
                    },
                    {
                        label: 'Unplaced Students',
                        data: unplaced,
                        backgroundColor: '#dc3545'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        stacked: true
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true
                    }
                }
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
            
        } catch (err) {
            console.error('Error loading profile:', err);
            alert('Failed to load profile data');
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
                fetch('/api/placement-status', {
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
                    <td>${item.department}</td>
                    <td>${item.company_name}</td>
                    <td>${item.job_title}</td>
                    <td><span class="badge ${getPlacementStatusBadgeClass(item.status)}">${formatPlacementStatus(item.status)}</span></td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary view-placement-btn" data-placement-id="${item.id}">
                            View
                        </button>
                        <button class="btn btn-sm btn-outline-danger delete-placement-btn" data-placement-id="${item.id}">
                            Delete
                        </button>
                    </td>
                `;
                
                statusTable.appendChild(row);
                
                // Add event listeners to buttons
                row.querySelector('.view-placement-btn').addEventListener('click', function() {
                    const placementId = this.getAttribute('data-placement-id');
                    viewPlacementDetails(placementId);
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
    
    // View placement details
    async function viewPlacementDetails(placementId) {
        try {
            const response = await fetch(`http://127.0.0.1:5000/api/placement-status/${placementId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to load placement details');
            }
            
            const placement = await response.json();
            currentPlacementId = placementId;
            
            // Populate modal
            document.getElementById('placementStudentName').textContent = placement.student_name;
            document.getElementById('placementRollNumber').textContent = placement.roll_number;
            document.getElementById('placementDepartment').textContent = placement.department;
            document.getElementById('placementCompanyName').textContent = placement.company_name;
            document.getElementById('placementJobTitleName').textContent = placement.job_title;
            document.getElementById('placementStatusText').innerHTML = `
                <span class="badge ${getPlacementStatusBadgeClass(placement.status)}">
                    ${formatPlacementStatus(placement.status)}
                </span>
            `;
            document.getElementById('placementAppDate').textContent = placement.application_date ? 
                new Date(placement.application_date).toLocaleDateString() : '-';
            document.getElementById('placementOfferDateText').textContent = placement.offer_date ? 
                new Date(placement.offer_date).toLocaleDateString() : '-';
            document.getElementById('placementSalaryText').textContent = placement.salary ? 
                '$' + placement.salary.toLocaleString() : '-';
            document.getElementById('placementUpdatedBy').textContent = placement.updated_by_name;
            document.getElementById('placementNotesText').textContent = placement.notes || 'No notes';
            
            const modal = new bootstrap.Modal(document.getElementById('viewPlacementModal'));
            modal.show();
            
        } catch (err) {
            console.error('Error viewing placement details:', err);
            alert('Failed to load placement details');
        }
    }
    
    // Edit placement button in modal
    document.getElementById('editPlacementBtn').addEventListener('click', function() {
        if (currentPlacementId) {
            editPlacementStatus(currentPlacementId);
        }
    });
    
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
            
            // Close view modal
            const viewModal = bootstrap.Modal.getInstance(document.getElementById('viewPlacementModal'));
            viewModal.hide();
            
            // Open edit modal
            const editModal = new bootstrap.Modal(document.getElementById('addPlacementStatusModal'));
            
            // Populate form
            document.getElementById('placementStudent').value = status.student_id;
            document.getElementById('placementCompany').value = status.company_name;
            document.getElementById('placementJobTitle').value = status.job_title;
            document.getElementById('placementStatus').value = status.status;
            document.getElementById('placementApplicationDate').value = status.application_date || '';
            document.getElementById('placementOfferDate').value = status.offer_date || '';
            document.getElementById('placementSalary').value = status.salary || '';
            document.getElementById('placementNotes').value = status.notes || '';
            
            // Change modal title
            document.querySelector('#addPlacementStatusModal .modal-title').textContent = 'Edit Placement Status';
            
            // Change save button text
            document.getElementById('savePlacementStatusBtn').textContent = 'Update';
            
            // Store placement ID in a data attribute
            document.getElementById('savePlacementStatusBtn').setAttribute('data-placement-id', placementId);
            
            editModal.show();
            
        } catch (err) {
            console.error('Error editing placement status:', err);
            alert('Failed to load placement status');
        }
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
            loadDashboardData();
            
        } catch (err) {
            console.error('Error deleting placement status:', err);
            alert('Failed to delete placement status');
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
    
    // Load students
    async function loadStudents(searchTerm = '') {
        try {
            const url = searchTerm ? 
                `/api/students?search=${encodeURIComponent(searchTerm)}` : 
                '/api/students';
                
            const response = await fetch(url, {
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
                    viewStudentDetails(studentId);
                });
            });
            
        } catch (err) {
            console.error('Error loading students:', err);
            alert('Failed to load students');
        }
    }
    
    // View student details
    async function viewStudentDetails(studentId) {
        try {
            const [studentRes, placementRes] = await Promise.all([
                fetch(`http://127.0.0.1:5000/api/students/${studentId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }),
                fetch(`http://127.0.0.1:5000/api/placement-status?student_id=${studentId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                })
            ]);
            
            if (!studentRes.ok || !placementRes.ok) {
                throw new Error('Failed to load student details');
            }
            
            const student = await studentRes.json();
            const placements = await placementRes.json();
            
            // You can implement a modal to show student details and placement history
            let message = `Student: ${student.full_name}\nRoll No.: ${student.roll_number}\nDepartment: ${student.department}\n\n`;
            
            if (placements.length > 0) {
                message += "Placement History:\n";
                placements.forEach((placement, index) => {
                    message += `\n${index + 1}. ${placement.company_name} (${placement.job_title}) - ${formatPlacementStatus(placement.status)}\n`;
                    if (placement.offer_date) {
                        message += `   Offer Date: ${new Date(placement.offer_date).toLocaleDateString()}\n`;
                    }
                    if (placement.salary) {
                        message += `   Salary: $${placement.salary.toLocaleString()}\n`;
                    }
                });
            } else {
                message += "No placement records found.";
            }
            
            alert(message);
            
        } catch (err) {
            console.error('Error viewing student details:', err);
            alert('Failed to load student details');
        }
    }
    
    // Search students
    document.getElementById('searchStudentBtn').addEventListener('click', function() {
        const searchTerm = document.getElementById('studentSearch').value;
        loadStudents(searchTerm);
    });
    
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
    
    // Post placement update
    document.getElementById('saveUpdateBtn').addEventListener('click', async function() {
        const title = document.getElementById('updateTitle').value;
        const description = document.getElementById('updateDescription').value;
        const link = document.getElementById('updateLink').value;
        const isImportant = document.getElementById('updateImportant').checked;
        
        try {
            const response = await fetch('/api/placement-updates', {
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
            
        } catch (err) {
            console.error('Error posting placement update:', err);
            alert('Failed to post placement update');
        }
    });
    
    // Add/Edit placement status
    document.getElementById('savePlacementStatusBtn').addEventListener('click', async function() {
        const studentId = document.getElementById('placementStudent').value;
        const company = document.getElementById('placementCompany').value;
        const jobTitle = document.getElementById('placementJobTitle').value;
        const status = document.getElementById('placementStatus').value;
        const applicationDate = document.getElementById('placementApplicationDate').value;
        const offerDate = document.getElementById('placementOfferDate').value;
        const salary = document.getElementById('placementSalary').value;
        const notes = document.getElementById('placementNotes').value;
        
        const placementId = this.getAttribute('data-placement-id');
        const isEdit = !!placementId;
        
        try {
            const url = isEdit ? `/api/placement-status/${placementId}` : '/api/placement-status';
            const method = isEdit ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method,
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
                throw new Error(isEdit ? 'Failed to update placement status' : 'Failed to add placement status');
            }
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('addPlacementStatusModal'));
            modal.hide();
            
            // Reset form
            document.getElementById('placementStatusForm').reset();
            this.removeAttribute('data-placement-id');
            document.querySelector('#addPlacementStatusModal .modal-title').textContent = 'Add Placement Status';
            this.textContent = 'Save';
            
            // Reload placement data
            loadPlacementData();
            loadDashboardData();
            
        } catch (err) {
            console.error(`Error ${isEdit ? 'updating' : 'adding'} placement status:`, err);
            alert(`Failed to ${isEdit ? 'update' : 'add'} placement status`);
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
            const response = await fetch('/api/meetings', {
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
        
        try {
            const response = await fetch('http://127.0.0.1:5000/api/profile', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    full_name: fullName,
                    email
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
                fetch('/api/mentors', {
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
            
            // Add mentors
            mentors.forEach(mentor => {
                const option = document.createElement('option');
                option.value = mentor.user_id;
                option.textContent = `Mentor: ${mentor.full_name}`;
                participantsSelect.appendChild(option);
            });
            
        } catch (err) {
            console.error('Error loading participants:', err);
            alert('Failed to load meeting participants');
        }
    });
    
    // Helper functions
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