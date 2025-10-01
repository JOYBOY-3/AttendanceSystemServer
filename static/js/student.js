/*

document.addEventListener('DOMContentLoaded', () => {
  const views = {
    login: document.getElementById('student-login-view'),
    dashboard: document.getElementById('student-dashboard-view'),
    detail: document.getElementById('course-detail-view'),
  };
  function showView(viewName) {
    Object.values(views).forEach((view) => (view.style.display = 'none'));
    if (views[viewName]) views[viewName].style.display = 'block';
  }

  const loginButton = document.getElementById('student-login-button');
  loginButton.addEventListener('click', async () => {
    const university_roll_no =
      document.getElementById('univ-roll-no-input').value;
    const password = document.getElementById('student-password-input').value;
    const loginMessage = document.getElementById('student-login-message');
    loginMessage.textContent = 'Logging in...';

    try {
      const response = await fetch('/api/student/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ university_roll_no, password }),
      });
      const data = await response.json();
      if (response.ok) {
        sessionStorage.setItem('studentToken', data.token);
        sessionStorage.setItem('studentName', data.student_name);
        loadDashboard();
      } else {
        loginMessage.textContent = data.message || 'Login failed.';
      }
    } catch (error) {
      loginMessage.textContent = 'An error occurred.';
    }
  });

  document
    .getElementById('student-logout-button')
    .addEventListener('click', () => {
      sessionStorage.clear();
      document.getElementById('univ-roll-no-input').value = '';
      document.getElementById('student-password-input').value = '';
      showView('login');
    });

  async function loadDashboard() {
    document.getElementById(
      'welcome-message'
    ).textContent = `Welcome, ${sessionStorage.getItem('studentName')}!`;
    const token = sessionStorage.getItem('studentToken');

    const response = await fetch('/api/student/dashboard', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401) {
      showView('login');
      return;
    }

    const data = await response.json();

    document.getElementById('overall-percentage').textContent =
      data.overall_percentage;
    const coursesContainer = document.getElementById('courses-container');
    coursesContainer.innerHTML = '';

    if (data.courses.length === 0) {
      coursesContainer.innerHTML =
        '<p>You are not yet enrolled in any courses.</p>';
    } else {
      data.courses.forEach((course) => {
        const courseCard = document.createElement('div');
        courseCard.className = 'course-card';
        courseCard.innerHTML = `
                    <h4>${course.course_name}</h4>
                    <p>
                        Present: <strong>${course.present_count}</strong> | 
                        Absent: <strong>${course.absent_count}</strong> | 
                        Total: <strong>${course.total_sessions}</strong>
                    </p>
                    <p><b>${course.percentage}% Attendance</b></p>
                    <button class="view-details-btn" data-course-id="${course.course_id}">View Details</button>
                `;
        coursesContainer.appendChild(courseCard);
      });
    }
    showView('dashboard');
  }

  document
    .getElementById('courses-container')
    .addEventListener('click', (event) => {
      if (event.target.classList.contains('view-details-btn')) {
        loadCourseDetails(event.target.dataset.courseId);
      }
    });

  async function loadCourseDetails(courseId) {
    const token = sessionStorage.getItem('studentToken');
    const response = await fetch(`/api/student/course/${courseId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401) {
      showView('login');
      return;
    }

    const data = await response.json();

    document.getElementById('detail-course-name').textContent =
      data.course_name;
    document.getElementById('detail-present-count').textContent =
      data.present_count;
    document.getElementById('detail-absent-count').textContent =
      data.total_sessions - data.present_count;
    document.getElementById('detail-total-classes').textContent =
      data.total_sessions;
    document.getElementById('detail-percentage').textContent = data.percentage;

    const logBody = document.getElementById('attendance-log-body');
    logBody.innerHTML = '';
    data.log.forEach((entry) => {
      const row = document.createElement('tr');
      const startTime = new Date(entry.date).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      const endTime = entry.end_time
        ? new Date(entry.end_time).toLocaleTimeString('en-IN', {
            timeStyle: 'short',
          })
        : 'Ongoing';
      const fullTime = `${startTime} - ${endTime}`;

      row.innerHTML = `
                <td>${fullTime}</td>
                <td>${
                  entry.status === 'Present' ? '✅ Present' : '❌ Absent'
                }</td>
            `;
      logBody.appendChild(row);
    });
    showView('detail');
  }

  document
    .getElementById('back-to-dashboard-button')
    .addEventListener('click', loadDashboard);

  // Check if user is already logged in from a previous session
  if (sessionStorage.getItem('studentToken')) {
    loadDashboard();
  } else {
    showView('login');
  }
});



*/
