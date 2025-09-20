document.addEventListener('DOMContentLoaded', function() {
// Show/hide role-specific fields on registration form
const roleSelect = document.getElementById('registerRole');
const studentFields = document.getElementById('studentFields');
const mentorFields = document.getElementById('mentorFields');

roleSelect.addEventListener('change', function() {
    // Hide all role-specific fields first
    document.querySelectorAll('.role-fields').forEach(field => {
        field.style.display = 'none';
    });
    
    // Show fields based on selected role
    if (this.value === 'student') {
        studentFields.style.display = 'block';
    } else if (this.value === 'mentor') {
        mentorFields.style.display = 'block';
    }
});

// Login form submission
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch('http://140.245.241.117/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Save token to localStorage
            localStorage.setItem('mentorhub_token', data.token);
            
            // Redirect based on role
            if (data.user.role === 'student') {
                window.location.href = 'student-dashboard.html';
            } else if (data.user.role === 'mentor') {
                window.location.href = 'mentor-dashboard.html';
            } else if (data.user.role === 'placement_officer') {
                window.location.href = 'placement-dashboard.html';
            }
        } else {
            alert(data.message || 'Login failed');
        }
    } catch (err) {
        console.error('Login error:', err);
        alert('An error occurred during login');
    }
});

// Register form submission
document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const role = document.getElementById('registerRole').value;
    const fullName = document.getElementById('registerFullName').value;
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;

    
    if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
    }
    
    // Prepare registration data based on role
    const registrationData = {
        username,
        email,
        password,
        role,
        full_name: fullName
    };
    
    // Add role-specific data
    if (role === 'student') {
        registrationData.roll_number = document.getElementById('registerRollNumber').value;
        registrationData.department = document.getElementById('registerDepartment').value;
        registrationData.batch_year = document.getElementById('registerBatchYear').value;
        registrationData.mentor_id = document.getElementById('registerMentorId').value;
    } else if (role === 'mentor') {
        registrationData.department = document.getElementById('registerMentorDepartment').value;
        registrationData.designation = document.getElementById('registerDesignation').value;
        registrationData.specialization = document.getElementById('registerSpecialization').value;
    }
    
    try {
        const response = await fetch('http://140.245.241.117/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(registrationData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('Registration successful! Please login.');
            // Switch to login tab
            document.getElementById('login-tab').click();
            // Clear form
            this.reset();
            studentFields.style.display = 'none';
            mentorFields.style.display = 'none';
        } else {
            alert(data.message || 'Registration failed');
        }
    } catch (err) {
        console.error('Registration error:', err);
        alert('An error occurred during registration');
    }
});
});