// =================================================================
//   A.R.I.S.E. Teacher Dashboard - Definitive JavaScript File v1.0
//   Part 1: Element References, View Management, and Login Logic
// =================================================================
document.addEventListener('DOMContentLoaded', () => {
  // --- 1. GLOBAL STATE & REFERENCES ---
  // This object holds references to all the different "screens" or "views" of the UI.
  const views = {
    login: document.getElementById('login-view'),
    setup: document.getElementById('setup-view'),
    type: document.getElementById('type-view'),
    liveOffline: document.getElementById('live-offline-view'),
    report: document.getElementById('report-view'),
  };

  // This object will store important data for the current session.
  let sessionState = {
    courseId: null,
    sessionId: null,
    allStudents: [], // The full list of students for the course
    liveUpdateInterval: null, // A handle to the timer for live updates
  };

  // Get references to all the interactive elements on the page.
  const loginButton = document.getElementById('login-button');
  const batchcodeInput = document.getElementById('batchcode-input');
  const pinInput = document.getElementById('pin-input');
  const loginMessage = document.getElementById('login-message');

  const setupCourseName = document.getElementById('setup-course-name');
  const sessionDateInput = document.getElementById('session-date-input');
  const durationInput = document.getElementById('duration-input');
  const confirmSetupButton = document.getElementById('confirm-setup-button');

  const startOfflineButton = document.getElementById('start-offline-button');
  const startOnlineButton = document.getElementById('start-online-button');

  const liveCourseName = document.getElementById('live-course-name');
  const attendanceCountSpan = document.getElementById('attendance-count');
  const totalStudentsSpan = document.getElementById('total-students');
  const deviceStatusText = document.getElementById('device-status-text');
  const searchInput = document.getElementById('search-input');
  const unmarkedStudentsTbody = document.querySelector(
    '#unmarked-students-table tbody'
  );
  const extendSessionButton = document.getElementById('extend-session-button');
  const endSessionButton = document.getElementById('end-session-button');

  const reportCourseName = document.getElementById('report-course-name');
  const exportExcelButton = document.getElementById('export-excel-button');
  const newSessionButton = document.getElementById('new-session-button');
  const reportTable = document.getElementById('report-table');

  // Populate batchcode dropdown
  async function loadBatchCodes() {
    try {
      const response = await fetch('/api/teacher/batchcodes');
      const batchcodes = await response.json();
      batchcodeInput.innerHTML =
        '<option value="">-- Select Batch Code --</option>';

      batchcodes.forEach((code) => {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = code;
        batchcodeInput.appendChild(option);
      });
    } catch (err) {
      batchcodeInput.innerHTML = '<option value="">(Failed to load)</option>';
    }
  }
  loadBatchCodes();

  batchcodeInput.addEventListener('change', () => {
    loginButton.disabled = !batchcodeInput.value || !pinInput.value;
  });
  pinInput.addEventListener('input', () => {
    loginButton.disabled = !batchcodeInput.value || !pinInput.value;
  });

  // Initially disable the login button
  loginButton.disabled = true;

  // --- 2. VIEW MANAGEMENT ---
  // A simple function to hide all views and show only the one we want.
  // This is the core of our single-page application navigation.
  function showView(viewName) {
    Object.values(views).forEach((view) => {
      if (view) view.style.display = 'none';
    });
    if (views[viewName]) {
      views[viewName].style.display = 'block';
    }
  }

  // --- 3. LOGIN WORKFLOW ---
  loginButton.addEventListener('click', async () => {
    const batchcode = batchcodeInput.value.trim();
    const pin = pinInput.value.trim();

    if (!batchcode || !pin) {
      loginMessage.textContent = 'Please enter both Batch Code and PIN.';
      return;
    }

    loginMessage.textContent = 'Logging in...';
    loginButton.disabled = true;

    try {
      const response = await fetch('/api/teacher/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchcode, pin }),
      });

      const data = await response.json();

      if (response.ok) {
        // Login successful!
        loginMessage.textContent = '';
        sessionState.courseId = data.course_id;
        setupCourseName.textContent = data.course_name;
        durationInput.value = data.default_duration;

        // Set date to today by default
        sessionDateInput.value = new Date().toISOString().split('T')[0];
        validateSetupForm(); // Enable button if valid

        showView('setup'); // Move to the next stage
      } else {
        loginMessage.textContent = data.message || 'Login failed.';
      }
    } catch (error) {
      console.error('Login error:', error);
      loginMessage.textContent = 'An error occurred. Is the server running?';
    } finally {
      loginButton.disabled = false;
    }
  });

  // START OF PART 2

  // --- 4. SESSION SETUP & START WORKFLOW ---

  // This function checks if the date and duration are valid.
  // It enables/disables the 'Confirm & Next' button.
  function validateSetupForm() {
    const isValid =
      sessionDateInput.value &&
      durationInput.value &&
      parseInt(durationInput.value) > 0;
    confirmSetupButton.disabled = !isValid;
  }
  sessionDateInput.addEventListener('input', validateSetupForm);
  durationInput.addEventListener('input', validateSetupForm);

  confirmSetupButton.addEventListener('click', () => {
    // Move to the session type selection screen
    showView('type');
  });

  startOfflineButton.addEventListener('click', () => {
    startSession('offline');
  });

  startOnlineButton.addEventListener('click', () => {
    // For now, this is a placeholder. In the future, it would have its own flow.
    alert(
      'Online session functionality will be implemented in a future module.'
    );
    // startSession('online');
  });

  async function startSession(sessionType) {
    // We combine the date and current time for an accurate start timestamp.
    const sessionDate = sessionDateInput.value;
    const now = new Date();
    const start_time = new Date(
      `${sessionDate}T${now.toTimeString().split(' ')[0]}`
    ).toISOString();
    const duration_minutes = durationInput.value;

    try {
      const response = await fetch('/api/teacher/start-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: sessionState.courseId,
          start_datetime: start_time,
          duration_minutes,
          session_type: sessionType,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Session started successfully on the server!
        sessionState.sessionId = data.session_id;
        sessionState.allStudents = data.students;

        // Now, prepare and show the live dashboard
        liveCourseName.textContent = setupCourseName.textContent;
        totalStudentsSpan.textContent = sessionState.allStudents.length;
        searchInput.value = ''; // <-- ADD THIS LINE TO CLEAR THE SEARCH BOX
        renderUnmarkedStudents(sessionState.allStudents); // Initially, all students are unmarked

        startLiveUpdates(); // Start polling the server for status
        showView('liveOffline');
      } else {
        alert(`Error starting session: ${data.message}`);
      }
    } catch (error) {
      console.error('Start session error:', error);
      alert('A network error occurred while starting the session.');
    }
  }

  // --- 5. LIVE DASHBOARD WORKFLOW (OFFLINE) ---

  function startLiveUpdates() {
    // Clear any old timer to prevent duplicates
    if (sessionState.liveUpdateInterval) {
      clearInterval(sessionState.liveUpdateInterval);
    }
    // Run once immediately to get initial data
    updateLiveStatus();
    // Then, poll the server every 5 seconds for new data
    sessionState.liveUpdateInterval = setInterval(() => {
      updateLiveStatus();
    }, 5000); // 5000 milliseconds = 5 seconds
  }

  function stopLiveUpdates() {
    if (sessionState.liveUpdateInterval) {
      clearInterval(sessionState.liveUpdateInterval);
      sessionState.liveUpdateInterval = null;
    }
  }

  async function updateLiveStatus() {
    if (!sessionState.sessionId) return;

    try {
      // Fetch the list of students who have already been marked present
      const statusResponse = await fetch(
        `/api/teacher/session/${sessionState.sessionId}/status`
      );
      const statusData = await statusResponse.json();

      // ...existing code...
      if (statusResponse.ok) {
        // FIX: Use the array directly, not .map()
        const markedUnivRollNos = new Set(statusData.marked_students);

        const unmarkedStudents = sessionState.allStudents.filter(
          (s) => !markedUnivRollNos.has(s.university_roll_no)
        );

        renderUnmarkedStudents(unmarkedStudents);
        attendanceCountSpan.textContent = markedUnivRollNos.size;
      }

      // Fetch the device's last known status
      const deviceResponse = await fetch('/api/teacher/device-status');
      const deviceData = await deviceResponse.json();

      if (deviceResponse.ok && deviceData.mac_address) {
        // Format the device status string for the widget
        const strength =
          deviceData.wifi_strength > -67
            ? 'Strong'
            : deviceData.wifi_strength > -80
            ? 'Okay'
            : 'Weak';
        deviceStatusText.innerHTML = `✅ Online (${strength})<br>🔋 ${deviceData.battery}% | 📝 Q: ${deviceData.queue_count} | 🔄 S: ${deviceData.sync_count}`;
      } else {
        deviceStatusText.textContent = `❌ Offline / No Data`;
      }
    } catch (error) {
      console.error('Error updating live status:', error);
      deviceStatusText.textContent = '❌ Error fetching status...';
    }
  }

  function renderUnmarkedStudents(students) {
    unmarkedStudentsTbody.innerHTML = '';
    const searchTerm = searchInput.value.toLowerCase();

    students
      .filter(
        (s) =>
          s.student_name.toLowerCase().includes(searchTerm) ||
          s.class_roll_id.toString().includes(searchTerm)
      )
      .forEach((student) => {
        const row = document.createElement('tr');
        row.innerHTML = `
                        <td>${student.class_roll_id}</td>
                        <td>${student.student_name}</td>
                        <td>${student.university_roll_no}</td>
                        <td><button class="manual-mark-btn" data-univ-roll="${student.university_roll_no}">Mark Manually</button></td>
                    `;
        unmarkedStudentsTbody.appendChild(row);
      });
  }

  searchInput.addEventListener('input', () => {
    // Re-render the table based on the search term, without fetching from server again
    updateLiveStatus();
  });

  // END OF PART 2

  // START OF PART 3

  // Event Delegation for the "Mark Manually" buttons within the table
  unmarkedStudentsTbody.addEventListener('click', async (event) => {
    if (event.target.classList.contains('manual-mark-btn')) {
      const univ_roll_no = event.target.dataset.univRoll;
      const reason = prompt(
        'Please provide a brief reason for this manual entry:'
      );

      if (reason && reason.trim() !== '') {
        try {
          const response = await fetch('/api/teacher/manual-override', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: sessionState.sessionId,
              univ_roll_no,
              reason,
            }),
          });
          if (response.ok) {
            // Immediately update the UI for a responsive feel
            updateLiveStatus();
          } else {
            const errorData = await response.json();
            alert(`Failed to mark attendance: ${errorData.message}`);
          }
        } catch (error) {
          console.error('Manual override error:', error);
          alert('A network error occurred.');
        }
      }
    }
  });

  // --- 6. SESSION CONTROL & REPORTING ---
  endSessionButton.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to end this session?')) return;

    stopLiveUpdates();
    await fetch(`/api/teacher/session/${sessionState.sessionId}/end`, {
      method: 'POST',
    });
    loadReport(sessionState.sessionId);
  });

  extendSessionButton.addEventListener('click', async () => {
    const response = await fetch(
      `/api/teacher/session/${sessionState.sessionId}/extend`,
      {
        method: 'POST',
      }
    );
    if (response.ok) {
      alert('Session extended by 10 minutes.');
    } else {
      alert('Failed to extend session.');
    }
  });

  async function loadReport(sessionId) {
    try {
      const response = await fetch(`/api/teacher/report/${sessionId}`);
      const data = await response.json();

      if (response.ok) {
        renderReportTable(data);
        reportCourseName.textContent = liveCourseName.textContent;
        showView('report');
      } else {
        alert('Failed to load report.');
      }
    } catch (error) {
      console.error('Report loading error:', error);
    }
  }

  function renderReportTable(data) {
    reportTable.innerHTML = ''; // Clear previous report

    const thead = document.createElement('thead');
    let headerHtml =
      '<tr><th>Class Roll</th><th>Name</th><th>Univ. Roll No.</th>';
    // Sort sessions by date to ensure they are in chronological order
    const sortedSessions = data.sessions.sort(
      (a, b) => new Date(a.start_time) - new Date(b.start_time)
    );

    sortedSessions.forEach((session) => {
      const dt = new Date(session.start_time);
      const day = dt.getDate().toString().padStart(2, '0');
      const month = dt.toLocaleString('en-GB', { month: 'short' });
      const hour = dt.getHours().toString().padStart(2, '0');
      const minute = dt.getMinutes().toString().padStart(2, '0');
      const dateTime = `${day} ${month} - ${hour}:${minute}`;
      headerHtml += `<th>${dateTime}</th>`;
    });
    headerHtml += '</tr>';
    thead.innerHTML = headerHtml;
    reportTable.appendChild(thead);

    const tbody = document.createElement('tbody');
    // Use a Set for highly efficient lookups (faster than searching an array every time)
    const presentSet = new Set(
      data.present_set.map((p) => `${p[0]}_${p[1]}`) // <-- FIX: use array indices
    );

    data.students.forEach((student) => {
      let rowHtml = `<td>${student.class_roll_id}</td><td>${student.student_name}</td><td>${student.university_roll_no}</td>`;
      sortedSessions.forEach((session) => {
        if (presentSet.has(`${session.id}_${student.id}`)) {
          rowHtml += '<td><span title="Present">✅</span></td>';
        } else {
          rowHtml += '<td><span title="Absent">❌</span></td>';
        }
      });
      rowHtml += '</tr>';
      tbody.innerHTML += rowHtml;
    });
    reportTable.appendChild(tbody);

    // --- Auto-Scrolling Feature ---

    // Find the container that has the horizontal scrollbar
    const tableContainer = document.querySelector(
      '.responsive-table-container'
    );
    const dateHeaders = thead.querySelectorAll('th');
    // Find the last date column (assuming first 3 columns are roll, name, univ. roll)
    const lastDateColIndex = dateHeaders.length - 1;
    if (lastDateColIndex > 2) {
      const lastDateTh = dateHeaders[lastDateColIndex];
      // Use getBoundingClientRect for accurate position
      const containerRect = tableContainer.getBoundingClientRect();
      const thRect = lastDateTh.getBoundingClientRect();
      // Scroll so the last date column is visible
      tableContainer.scrollLeft +=
        thRect.left + tableContainer.scrollLeft - containerRect.left - 40; // 40px padding
    }
  }

  exportExcelButton.addEventListener('click', () => {
    // This simply opens the download link. The browser handles the download.
    window.open(`/api/teacher/report/export/${sessionState.sessionId}`);
  });

  newSessionButton.addEventListener('click', () => {
    // Reset the state and go back to the beginning
    sessionState = {
      courseId: null,
      sessionId: null,
      allStudents: [],
      liveUpdateInterval: null,
    };
    loginMessage.textContent = '';
    batchcodeInput.value = '';
    pinInput.value = '';
    showView('login');
  });

  // --- INITIALIZATION ---
  // Start the application by showing the login screen.
  showView('login');
});
// END OF PART 3
