// =================================================================
//   A.R.I.S.E. Admin Panel - Definitive JavaScript File v1.3
//   - Adds full support for the "Enrollment Roster" feature.
// =================================================================
document.addEventListener('DOMContentLoaded', () => {
  // --- 1. SECURITY & INITIAL SETUP ---
  // This is the first thing that runs. It checks for a security token.
  // If it's missing, it immediately redirects to the login page.
  const token = localStorage.getItem('adminToken');
  if (!token && window.location.pathname !== '/admin-login') {
    window.location.href = '/admin-login';
    return;
  }

  // --- 2. GLOBAL STATE ---
  // These variables act as the page's short-term memory.
  let currentEditId = null;
  let currentEntity = 'semesters';

  // --- 3. DOM ELEMENT REFERENCES ---
  // We get references to all important HTML elements once at the start for efficiency.
  const mainTabs = document.querySelectorAll('.tab-button');
  const manageSubTabs = document.querySelectorAll('#manage .sub-tab-button');
  const viewSubTabs = document.querySelectorAll('#view .sub-tab-button');
  const logoutButton = document.getElementById('logout-button');

  // --- References to all the FORMS ---
  const forms = {
    semesters: document.getElementById('semester-form'),
    teachers: document.getElementById('teacher-form'),
    students: document.getElementById('student-form'),
    courses: document.getElementById('course-form'),
  };

  // --- References to all the TABLE BODIES ---
  // --- THIS IS THE PRIMARY FIX FOR THE "VIEW DATA" BUG ---
  // The keys in this object now use hyphens (e.g., 'view-students') to exactly
  // match the `data-subtab` attributes in the HTML file, solving the mismatch.
  const tableBodies = {
    semesters: document.getElementById('semesters-table-body'),
    teachers: document.getElementById('teachers-table-body'),
    students: document.getElementById('students-table-body'),
    courses: document.getElementById('courses-table-body'),
    'view-students': document.getElementById('view-students-table-body'),
    'view-semesters': document.getElementById('view-semesters-table-body'),
    'view-teachers': document.getElementById('view-teachers-table-body'),
    'view-courses': document.getElementById('view-courses-table-body'),
    // --- NEW: References for the Enrollment Roster feature ---
    'enrollment-roster': document.getElementById(
      'enrollment-roster-table-body'
    ),
  };

  // --- NEW: Reference to the semester selector for the roster ---
  const rosterSemesterSelect = document.getElementById(
    'select-roster-semester'
  );

  // --- Modal Elements for the "Are you sure?" pop-up ---
  const modal = document.getElementById('confirmation-modal');
  const modalText = document.getElementById('modal-text');
  const modalConfirmButton = document.getElementById('modal-confirm-button');
  const modalCancelButton = document.getElementById('modal-cancel-button');
  let deleteCallback = null;

  // --- 4. API HELPER ---
  // This is a powerful, centralized object for all communication with the server.
  // It automatically includes the security token in every request.
  const api = {
    get: async (endpoint) => {
      const response = await fetch(`/api/admin/${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) window.location.href = '/admin-login';
      return response.json();
    },
    post: (endpoint, body) => api.request('POST', endpoint, body),
    put: (endpoint, id, body) => api.request('PUT', `${endpoint}/${id}`, body),
    delete: (endpoint, id) => api.request('DELETE', `${endpoint}/${id}`),
    request: async (method, endpoint, body = null) => {
      const options = { method, headers: { Authorization: `Bearer ${token}` } };
      if (body) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
      }
      const response = await fetch(`/api/admin/${endpoint}`, options);
      if (response.status === 401) window.location.href = '/admin-login';
      return response;
    },
  };

  // --- 5. TAB SWITCHING LOGIC ---
  // This function handles the visual switching of main tabs and sub-tabs.
  function switchTab(tabGroup, button) {
    tabGroup.forEach((btn) => btn.classList.remove('active'));
    button.classList.add('active');
    const contentContainer = button.closest('.tab-content, .container');
    contentContainer
      .querySelectorAll(':scope > .tab-content')
      .forEach((content) => content.classList.remove('active'));
    const contentId = button.dataset.tab || button.dataset.subtab;
    const activeContent = document.getElementById(contentId);
    if (activeContent) activeContent.classList.add('active');
  }

  mainTabs.forEach((tab) =>
    tab.addEventListener('click', () => {
      switchTab(mainTabs, tab);
      const firstSubTab = document.querySelector(
        `#${tab.dataset.tab} .sub-tab-button`
      );
      if (firstSubTab) firstSubTab.click();
    })
  );

  manageSubTabs.forEach((subTab) =>
    subTab.addEventListener('click', () => {
      switchTab(manageSubTabs, subTab);
      currentEntity = subTab.dataset.subtab;
      loadDataForCurrentTab();
    })
  );

  viewSubTabs.forEach((subTab) =>
    subTab.addEventListener('click', () => {
      switchTab(viewSubTabs, subTab);
      loadDataForViewTab(subTab.dataset.subtab);
    })
  );

  // --- Logout and Modal Listeners ---
  logoutButton.addEventListener('click', () => {
    localStorage.removeItem('adminToken');
    window.location.href = '/admin-login';
  });

  function showConfirmationModal(message, onConfirm) {
    modalText.textContent = message;
    deleteCallback = onConfirm;
    modal.classList.add('active');
    document.body.classList.add('modal-open');
  }
  function hideConfirmationModal() {
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');
  }
  modalCancelButton.addEventListener('click', hideConfirmationModal);
  modalConfirmButton.addEventListener('click', () => {
    if (deleteCallback) deleteCallback();
    hideConfirmationModal();
  });

  // END OF PART 1

  // START OF PART 2

  // --- 6. DATA LOADING & RENDERING ---
  // This function acts as a "router". Based on the currently active sub-tab,
  // it decides which specific data-loading function to call.
  async function loadDataForCurrentTab() {
    resetForm(currentEntity);
    if (currentEntity === 'courses') {
      await Promise.all([loadCourses(), populateCourseFormDropdowns()]);
    } else if (currentEntity === 'enrollments') {
      await populateEnrollmentCourseDropdown();
      const enrollmentUI = document.getElementById('enrollment-ui');
      if (enrollmentUI) enrollmentUI.style.display = 'none';
    } else if (currentEntity === 'teachers') {
      await loadTeachers();
    } else if (currentEntity === 'students') {
      await loadStudents();
    } else if (currentEntity === 'semesters') {
      await loadSemesters();
    }
  }

  // --- NEW: Function specifically for the Enrollment Roster ---
  async function loadEnrollmentRoster(semesterId) {
    const tbody = tableBodies['enrollment-roster'];
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4">Loading roster...</td></tr>`;

    // Call our new, powerful API endpoint
    const rosterData = await api.get(`enrollment-roster/${semesterId}`);

    tbody.innerHTML = '';
    if (rosterData.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4">No students enrolled in this semester.</td></tr>`;
      return;
    }

    rosterData.forEach((item) => {
      const row = document.createElement('tr');
      row.innerHTML = `
            <td>${item.primary_class_roll_id}</td>
            <td>${item.student_name}</td>
            <td>${item.university_roll_no}</td>
            <td>${item.enrolled_courses}</td>
        `;
      tbody.appendChild(row);
    });
  }

  // This function populates the read-only tables in the "View Data" tab.
  async function loadDataForViewTab(viewEntity) {
    // --- THIS IS THE KEY CHANGE ---
    // The "router" for the view tab now knows about our new roster.
    if (viewEntity === 'enrollment-roster') {
      // If the roster tab is clicked, we populate its semester dropdown
      // and wait for the user to select a semester.
      await populateRosterSemesterDropdown();
      tableBodies[
        'enrollment-roster'
      ].innerHTML = `<tr><td colspan="4">Please select a semester above to view the roster.</td></tr>`;
    } else {
      const entity = viewEntity.replace('view-', '');
      const items = await api.get(
        entity === 'courses' ? 'courses-view' : entity
      );
      const tbody = tableBodies[viewEntity];
      if (!tbody) return;
      tbody.innerHTML = '';

      // --- SORT BY ID ASCENDING ---
      items.sort((a, b) => a.id - b.id);

      items.forEach((item) => {
        const row = document.createElement('tr');
        let cells = '';
        if (entity === 'semesters')
          cells = `<td>${item.id}</td><td>${item.semester_name}</td>`;
        if (entity === 'teachers')
          cells = `<td>${item.id}</td><td>${item.teacher_name}</td><td>${item.pin}</td>`;
        if (entity === 'students')
          cells = `<td>${item.id}</td><td>${item.student_name}</td><td>${
            item.university_roll_no
          }</td><td>${item.enrollment_no}</td><td>${item.email1 || ''}<br>${
            item.email2 || ''
          }</td>`;
        if (entity === 'courses')
          cells = `<td>${item.id}</td><td>${item.course_name}</td><td>${
            item.batchcode
          }</td><td>${item.semester_name || 'N/A'}</td><td>${
            item.teacher_name || 'N/A'
          }</td>`;
        row.innerHTML = cells;
        tbody.appendChild(row);
      });
    }
  }

  // --- 7. FORM HANDLING & EVENT DELEGATION---
  function resetForm(entity) {
    if (forms[entity]) {
      forms[entity].reset();
      const idField = forms[entity].querySelector('input[type="hidden"]');
      if (idField) idField.value = '';
      const submitButton = forms[entity].querySelector('button[type="submit"]');
      if (submitButton) {
        const entityName = entity.charAt(0).toUpperCase() + entity.slice(1, -1);
        submitButton.textContent = `Add ${entityName}`;
        submitButton.className = 'button-primary';
      }
      if (entity === 'students') {
        document.getElementById('student-password').placeholder =
          'Initial/New Password';
      }
      if (entity === 'teachers') {
        document.getElementById('teacher-pin').placeholder = 'Initial/New PIN';
      }
      currentEditId = null;
    }
  }

  document.getElementById('manage').addEventListener('click', (e) => {
    const target = e.target;
    if (target.matches('.edit-btn')) {
      const id = target.dataset.id;
      const entity = target.closest('.tab-content').id;
      const row = target.closest('tr');
      populateFormForEdit(entity, id, row);
    }
    if (target.matches('.delete-btn')) {
      const id = target.dataset.id;
      const entity = target.closest('.tab-content').id;
      showConfirmationModal(
        `Are you sure you want to delete this ${entity.slice(0, -1)} (#${id})?`,
        async () => {
          await api.delete(entity, id);
          loadDataForCurrentTab();
        }
      );
    }
  });

  function populateFormForEdit(entity, id, row) {
    currentEditId = id;
    const form = forms[entity];
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.textContent = `Update ${
      entity.charAt(0).toUpperCase() + entity.slice(1, -1)
    }`;
    submitButton.className = 'button-secondary';
    const cells = row.querySelectorAll('td');
    if (entity === 'semesters') {
      form.querySelector('#semester-name').value = cells[1].textContent;
    }
    if (entity === 'teachers') {
      form.querySelector('#teacher-name').value = cells[1].textContent;
      form.querySelector('#teacher-pin').value = '';
      form.querySelector('#teacher-pin').placeholder =
        'Leave blank to keep unchanged';
    }
    if (entity === 'students') {
      form.querySelector('#student-name').value = cells[1].textContent;
      form.querySelector('#student-univ-roll').value = cells[2].textContent;
      form.querySelector('#student-enroll-no').value = cells[3].textContent;
      const emails = cells[4].innerHTML.split('<br>');
      form.querySelector('#student-email1').value = emails[0];
      form.querySelector('#student-email2').value = emails[1] || '';
      form.querySelector('#student-password').placeholder =
        'Leave blank to keep unchanged';
    }
    if (entity === 'courses') {
      api.get(`courses/${id}`).then((course) => {
        form.querySelector('#course-name').value = course.course_name;
        form.querySelector('#batchcode').value = course.batchcode;
        form.querySelector('#default-duration').value =
          course.default_duration_minutes;
        form.querySelector('#select-semester').value = course.semester_id;
        form.querySelector('#select-teacher').value = course.teacher_id;
      });
    }
    form.querySelector('input[type="hidden"]').value = id;
  }

  // =================================================================
  //   8. SPECIFIC MANAGEMENT LOGIC FOR EACH SUB-TAB (Unchanged)
  // =================================================================
  // --- SEMESTER MANAGEMENT ---
  const semesterForm = forms.semesters;
  const semesterTableBody = tableBodies.semesters;

  async function loadSemesters() {
    const semesters = await api.get('semesters');
    semesterTableBody.innerHTML = '';
    semesters.forEach((item) => {
      const row = document.createElement('tr');
      row.innerHTML = `<td>${item.id}</td><td>${item.semester_name}</td><td class="actions-cell"><button class="button-secondary edit-btn" data-id="${item.id}">Edit</button><button class="button-danger delete-btn" data-id="${item.id}">Delete</button></td>`;
      semesterTableBody.appendChild(row);
    });
  }
  semesterForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      semester_name: document.getElementById('semester-name').value,
    };
    if (currentEditId) {
      await api.put('semesters', currentEditId, body);
    } else {
      await api.post('semesters', body);
    }
    resetForm('semesters');
    loadSemesters();
  });

  // --- TEACHER MANAGEMENT ---
  const teacherForm = forms.teachers;
  const teacherTableBody = tableBodies.teachers;
  async function loadTeachers() {
    const teachers = await api.get('teachers');
    teacherTableBody.innerHTML = '';
    teachers.forEach((item) => {
      const row = document.createElement('tr');
      row.innerHTML = `<td>${item.id}</td><td>${item.teacher_name}</td><td class="actions-cell"><button class="button-secondary edit-btn" data-id="${item.id}">Edit</button><button class="button-danger delete-btn" data-id="${item.id}">Delete</button></td>`;
      teacherTableBody.appendChild(row);
    });
  }
  teacherForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      teacher_name: document.getElementById('teacher-name').value,
      pin: document.getElementById('teacher-pin').value,
    };
    if (currentEditId) {
      if (!body.pin) delete body.pin;
      await api.put('teachers', currentEditId, body);
    } else {
      if (!body.pin) {
        alert('PIN is required for new teachers.');
        return;
      }
      await api.post('teachers', body);
    }
    resetForm('teachers');
    loadTeachers();
  });

  // --- STUDENT MANAGEMENT ---
  const studentForm = forms.students;
  const studentTableBody = tableBodies.students;

  async function loadStudents() {
    const students = await api.get('students');
    studentTableBody.innerHTML = '';
    // Sort students by id DESCENDING so newest is first
    students.sort((a, b) => b.id - a.id);
    students.forEach((item) => {
      const row = document.createElement('tr');
      row.innerHTML = `<td>${item.id}</td><td>${item.student_name}</td><td>${
        item.university_roll_no
      }</td><td>${item.enrollment_no}</td><td>${item.email1 || ''}<br>${
        item.email2 || ''
      }</td><td class="actions-cell"><button class="button-secondary edit-btn" data-id="${
        item.id
      }">Edit</button><button class="button-danger delete-btn" data-id="${
        item.id
      }">Delete</button></td>`;
      studentTableBody.appendChild(row); // Use appendChild, not insertBefore
    });
  }
  studentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      student_name: document.getElementById('student-name').value,
      university_roll_no: document.getElementById('student-univ-roll').value,
      enrollment_no: document.getElementById('student-enroll-no').value,
      email1: document.getElementById('student-email1').value,
      email2: document.getElementById('student-email2').value,
      password: document.getElementById('student-password').value,
    };
    if (currentEditId && !body.password) {
      delete body.password;
    }
    if (currentEditId) {
      await api.put('students', currentEditId, body);
    } else {
      if (!body.password) {
        alert('Password is required for new students.');
        return;
      }
      await api.post('students', body);
    }
    resetForm('students');
    loadStudents();
  });

  // END OF PART 2

  // START OF PART 3

  // =================================================================
  // --- 8. SPECIFIC MANAGEMENT LOGIC FOR EACH SUB-TAB (ADVANCED) ---
  // =================================================================

  // --- Course Management ---
  const courseForm = forms.courses;
  const courseTableBody = tableBodies.courses;

  async function loadCourses() {
    const courses = await api.get('courses-view');
    courseTableBody.innerHTML = '';
    // Sort courses by id DESCENDING so newest is first
    courses.sort((a, b) => b.id - a.id);
    courses.forEach((item) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${item.id}</td>
        <td>${item.course_name}</td>
        <td>${item.batchcode}</td>
        <td>${item.semester_name || 'N/A'}</td>
        <td>${item.teacher_name || 'N/A'}</td>
        <td class="actions-cell">
          <button class="button-secondary edit-btn" data-id="${
            item.id
          }">Edit</button>
          <button class="button-danger delete-btn" data-id="${
            item.id
          }">Delete</button>
      </td>
    `;
      courseTableBody.appendChild(row); // Use appendChild, not insertBefore
    });
  }

  // This function fetches Semesters and Teachers from the server and populates the dropdowns
  // in the "Add/Edit Course" form. This is the "intelligent UI" feature.
  async function populateCourseFormDropdowns() {
    const [semesters, teachers] = await Promise.all([
      api.get('semesters'),
      api.get('teachers'),
    ]);
    const semesterSelect = document.getElementById('select-semester');
    const teacherSelect = document.getElementById('select-teacher');
    semesterSelect.innerHTML =
      '<option value="">-- Select a Semester --</option>';
    teacherSelect.innerHTML =
      '<option value="">-- Select a Teacher --</option>';
    semesters.forEach(
      (s) =>
        (semesterSelect.innerHTML += `<option value="${s.id}">${s.semester_name}</option>`)
    );
    teachers.forEach(
      (t) =>
        (teacherSelect.innerHTML += `<option value="${t.id}">${t.teacher_name}</option>`)
    );
  }

  courseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      course_name: document.getElementById('course-name').value,
      batchcode: document.getElementById('batchcode').value,
      default_duration_minutes:
        document.getElementById('default-duration').value,
      semester_id: document.getElementById('select-semester').value,
      teacher_id: document.getElementById('select-teacher').value,
    };
    if (currentEditId) {
      await api.put('courses', currentEditId, body);
    } else {
      await api.post('courses', body);
    }
    resetForm('courses');
    loadCourses();
    populateEnrollmentCourseDropdown(); // Repopulate enrollment dropdown in case a new course was added
  });

  // --- COURSE ENROLLMENT MANAGEMENT (Fully Functional) ---
  const enrollmentCourseSelect = document.getElementById(
    'select-enrollment-course'
  );
  const availableStudentsList = document.getElementById(
    'available-students-list'
  );
  const enrolledStudentsTbody = document.getElementById(
    'enrolled-students-table-body'
  );
  const enrollButton = document.getElementById('enroll-button');
  const unenrollButton = document.getElementById('unenroll-button');
  const saveEnrollmentsButton = document.getElementById(
    'save-enrollments-button'
  );
  let availableStudentsData = [];
  let enrolledStudentsData = [];

  async function populateEnrollmentCourseDropdown() {
    const courses = await api.get('courses');
    const currentVal = enrollmentCourseSelect.value;
    enrollmentCourseSelect.innerHTML =
      '<option value="">-- Select a Course --</option>';
    courses.forEach(
      (c) =>
        (enrollmentCourseSelect.innerHTML += `<option value="${c.id}">${c.course_name} (${c.batchcode})</option>`)
    );
    enrollmentCourseSelect.value = currentVal;
  }

  enrollmentCourseSelect.addEventListener('change', async () => {
    const courseId = enrollmentCourseSelect.value;
    const uiContainer = document.getElementById('enrollment-ui');
    if (!courseId) {
      uiContainer.style.display = 'none';
      return;
    }
    uiContainer.style.display = 'grid';
    const { enrolled, available } = await api.get(`enrollments/${courseId}`);
    availableStudentsData = available;
    enrolledStudentsData = enrolled;
    renderEnrollmentLists();
  });

  function renderEnrollmentLists() {
    availableStudentsList.innerHTML = '';
    enrolledStudentsTbody.innerHTML = '';

    availableStudentsData
      .sort((a, b) => a.student_name.localeCompare(b.student_name))
      .forEach((student) => {
        const div = document.createElement('div');
        div.textContent = `${student.student_name} (${student.university_roll_no})`;
        div.dataset.id = student.id;
        availableStudentsList.appendChild(div);
      });

    enrolledStudentsData
      .sort((a, b) => (a.class_roll_id || 9999) - (b.class_roll_id || 9999))
      .forEach((student) => {
        const row = document.createElement('tr');
        row.dataset.studentId = student.student_id;
        row.innerHTML = `<td>${
          student.student_name
        }</td><td><input type="number" class="class-roll-id-input" value="${
          student.class_roll_id || ''
        }" min="1"></td>`;
        enrolledStudentsTbody.appendChild(row);
      });
  }

  availableStudentsList.addEventListener('click', (e) => {
    if (e.target.tagName === 'DIV') {
      e.target.classList.toggle('selected');
    }
  });

  // NEW: Add click listener to the enrolled table for selection
  enrolledStudentsTbody.addEventListener('click', (e) => {
    // Find the closest parent 'TR' (table row) element
    const row = e.target.closest('tr');
    if (row) {
      row.classList.toggle('selected');
    }
    // --- FIX: Directly apply styles for instant visual feedback ---
    if (row.classList.contains('selected')) {
      row.style.backgroundColor = '#005a9c'; // Corresponds to --primary-color
      row.style.color = 'white';
    } else {
      // Reset styles to default
      row.style.backgroundColor = '';
      row.style.color = '';
    }
  });

  enrollButton.addEventListener('click', () => {
    const selectedStudents = Array.from(
      availableStudentsList.querySelectorAll('.selected')
    );
    selectedStudents.forEach((div) => {
      const studentId = parseInt(div.dataset.id);
      const student = availableStudentsData.find((s) => s.id === studentId);
      if (student) {
        enrolledStudentsData.push({
          ...student,
          student_id: student.id,
          class_roll_id: null,
        });
        availableStudentsData = availableStudentsData.filter(
          (s) => s.id !== studentId
        );
      }
    });
    renderEnrollmentLists();
  });

  // NEW: Fully functional unenroll logic
  unenrollButton.addEventListener('click', () => {
    const selectedRows = Array.from(
      enrolledStudentsTbody.querySelectorAll('.selected')
    );
    selectedRows.forEach((row) => {
      const studentId = parseInt(row.dataset.studentId);
      const student = enrolledStudentsData.find(
        (s) => s.student_id === studentId
      );
      if (student) {
        // Add the student back to the available list
        // We need all fields, so let's find the original full student object
        const fullStudentData = {
          id: student.student_id,
          student_name: student.student_name,
          university_roll_no: student.university_roll_no,
        };
        availableStudentsData.push(fullStudentData);
        // Remove the student from the enrolled list
        enrolledStudentsData = enrolledStudentsData.filter(
          (s) => s.student_id !== studentId
        );
      }
    });
    renderEnrollmentLists();
  });

  saveEnrollmentsButton.addEventListener('click', async () => {
    const courseId = enrollmentCourseSelect.value;
    if (!courseId) return;
    const finalEnrollments = [];
    const rollIds = new Set();
    let hasError = false;

    enrolledStudentsTbody.querySelectorAll('tr').forEach((row) => {
      const classRollIdInput = row.querySelector('.class-roll-id-input');
      const classRollId = parseInt(classRollIdInput.value);

      if (!classRollId || classRollId <= 0) {
        alert(
          `Error: Student ${row.cells[0].textContent} must have a valid, positive Class Roll ID.`
        );
        hasError = true;
      }
      if (rollIds.has(classRollId)) {
        alert(
          `Error: Duplicate Class Roll ID #${classRollId}. IDs must be unique for this course.`
        );
        hasError = true;
      }
      rollIds.add(classRollId);

      finalEnrollments.push({
        student_id: parseInt(row.dataset.studentId),
        class_roll_id: classRollId,
      });
    });

    if (hasError) return;

    const response = await api.post(
      `enrollments/${courseId}`,
      finalEnrollments
    );
    if (response.ok) {
      alert('Enrollments saved successfully!');
    } else {
      const error = await response.json();
      alert(`Failed to save enrollments: ${error.message}`);
    }
  });

  // --- NEW: Logic for the Enrollment Roster ---
  async function populateRosterSemesterDropdown() {
    const semesters = await api.get('semesters');
    rosterSemesterSelect.innerHTML =
      '<option value="">-- Select a Semester to View Roster --</option>';
    semesters.forEach((s) => {
      rosterSemesterSelect.innerHTML += `<option value="${s.id}">${s.semester_name}</option>`;
    });
  }

  rosterSemesterSelect.addEventListener('change', () => {
    const semesterId = rosterSemesterSelect.value;
    if (semesterId) {
      loadEnrollmentRoster(semesterId);
    } else {
      tableBodies[
        'enrollment-roster'
      ].innerHTML = `<tr><td colspan="4">Please select a semester above to view the roster.</td></tr>`;
    }
  });

  // --- 9. LOGOUT & MODAL LOGIC ---
  // This handles the logout button and the confirmation pop-up for delete actions.
  logoutButton.addEventListener('click', () => {
    localStorage.removeItem('adminToken');
    window.location.href = '/admin-login';
  });

  // --- 10. ENROLLMENT ID CALCULATOR ---
  // This is the logic for the helpful utility in the "Tools" tab.
  const calcRollIdInput = document.getElementById('calc-roll-id');
  const slot1Result = document.getElementById('slot1-result');
  const slot2Result = document.getElementById('slot2-result');
  const calcSlotIdInput = document.getElementById('calc-slot-id');
  const rollIdResult = document.getElementById('roll-id-result');

  calcRollIdInput.addEventListener('input', () => {
    const rollId = parseInt(calcRollIdInput.value);
    if (rollId > 0) {
      slot1Result.textContent = (rollId - 1) * 2 + 1;
      slot2Result.textContent = (rollId - 1) * 2 + 2;
    } else {
      slot1Result.textContent = '--';
      slot2Result.textContent = '--';
    }
  });

  calcSlotIdInput.addEventListener('input', () => {
    const slotId = parseInt(calcSlotIdInput.value);
    if (slotId > 0) {
      rollIdResult.textContent = Math.floor((slotId - 1) / 2) + 1;
    } else {
      rollIdResult.textContent = '--';
    }
  });

  // --- 11. INITIALIZATION ---
  // This is the main function that runs when the page first loads. It sets up the default
  // view and pre-loads all the necessary data from the server.
  function initialize() {
    // Programmatically click the "Manage Data" tab to set the initial view.
    document.querySelector('.tab-button[data-tab="manage"]').click();
  }

  initialize();
  hideConfirmationModal();
});
// END OF PART 3
