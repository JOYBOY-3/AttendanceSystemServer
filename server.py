# =================================================================
#   A.R.I.S.E. Server - Definitive Version
#   Part 1: Foundation, Helpers, Page Routes, and Core Admin API
# =================================================================



from flask import Flask, jsonify, request, render_template
import sqlite3
import datetime
import jwt
import hashlib
from functools import wraps

from openpyxl import Workbook
from openpyxl.styles import Font, Alignment
import io
from flask import send_file


# --- App Initialization ---
app = Flask(__name__)
# IMPORTANT: In a real production app, this should be a long, random, secret key
# stored securely as an environment variable, not in the code.
app.config['SECRET_KEY'] = 'a-very-long-and-super-secret-key-for-sih2025'

# --- Database & Token Helper Functions ---

def get_db_connection():
    """Establishes a connection to the SQLite database."""
    # check_same_thread=False is needed because Flask can handle requests in different threads.
    conn = sqlite3.connect('attendance.db', check_same_thread=False)
    # This makes the database return rows that can be accessed by column name.
    conn.row_factory = sqlite3.Row
    # Enable foreign key support
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

# This is a "decorator" that we can add to our routes to protect them.
# It checks for a valid JSON Web Token (JWT) in the request's Authorization header.
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            # The token is expected to be in the format "Bearer <token>"
            token = request.headers['Authorization'].split(" ")[1]
        
        if not token:
            return jsonify({'message': 'Authorization Token is missing!'}), 401
        
        try:
            # Decode the token using our secret key to verify its authenticity
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            # The decoded data (e.g., admin_id or student_id) is passed to the route
        except jwt.ExpiredSignatureError:
            return jsonify({'message': 'Token has expired!'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'message': 'Token is invalid!'}), 401
        
        return f(data, *args, **kwargs)
    return decorated

# =================================================================
#   HTML Page Serving Routes
# =================================================================
# These functions simply return the HTML files for our interfaces.

@app.route('/')
def teacher_page_redirect():
    # The main page will be the Teacher Login
    return render_template('teacher.html') # Points to the prototype for now

@app.route('/admin-login')
def admin_login_page():
    return render_template('admin-login.html')

@app.route('/admin')
def admin_page():
    return render_template('admin.html') # The JS on this page will handle token security

@app.route('/student')
def student_page():
    return render_template('student.html') # Points to the prototype for now

# =================================================================
#   ADMIN API ENDPOINTS (Part 1)
# =================================================================

@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    """Handles the administrator's login request."""
    data = request.get_json()
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({"message": "Username and password are required"}), 400

    hashed_password = hashlib.sha256(data['password'].encode('utf-8')).hexdigest()
    conn = get_db_connection()
    admin = conn.execute("SELECT id FROM admins WHERE username = ? AND password = ?", 
                           (data['username'], hashed_password)).fetchone()
    conn.close()
    
    if admin:
        # If login is successful, create a token that expires in 8 hours
        token = jwt.encode({
            'admin_id': admin['id'], 
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=8)
        }, app.config['SECRET_KEY'], algorithm="HS256")
        return jsonify({'token': token})
    
    return jsonify({"message": "Invalid credentials"}), 401

# --- Semester Management API (Full CRUD) ---
@app.route('/api/admin/semesters', methods=['GET', 'POST'])
@token_required
def manage_semesters(user_data):
    conn = get_db_connection()
    if request.method == 'GET':
        semesters_cursor = conn.execute("SELECT * FROM semesters ORDER BY id DESC").fetchall()
        semesters = [dict(row) for row in semesters_cursor]
        conn.close()
        return jsonify(semesters)
    
    if request.method == 'POST':
        data = request.get_json()
        conn.execute("INSERT INTO semesters (semester_name) VALUES (?)", (data['semester_name'],))
        conn.commit()
        conn.close()
        return jsonify({"status": "success", "message": "Semester added."}), 201

@app.route('/api/admin/semesters/<int:id>', methods=['PUT', 'DELETE'])
@token_required
def manage_single_semester(user_data, id):
    conn = get_db_connection()
    if request.method == 'PUT':
        data = request.get_json()
        conn.execute("UPDATE semesters SET semester_name = ? WHERE id = ?", (data['semester_name'], id))
        conn.commit()
    elif request.method == 'DELETE':
        conn.execute("DELETE FROM semesters WHERE id = ?", (id,))
        conn.commit()
    conn.close()
    return jsonify({"message": "Operation successful."})

# --- Teacher Management API (Full CRUD) ---
@app.route('/api/admin/teachers', methods=['GET', 'POST'])
@token_required
def manage_teachers(user_data):
    conn = get_db_connection()
    if request.method == 'GET':
        teachers_cursor = conn.execute("SELECT * FROM teachers ORDER BY teacher_name").fetchall()
        teachers = [dict(row) for row in teachers_cursor]
        conn.close()
        return jsonify(teachers)
    
    if request.method == 'POST':
        data = request.get_json()
        conn.execute("INSERT INTO teachers (teacher_name, pin) VALUES (?, ?)", (data['teacher_name'], data['pin']))
        conn.commit()
        conn.close()
        return jsonify({"status": "success", "message": "Teacher added."}), 201

@app.route('/api/admin/teachers/<int:id>', methods=['PUT', 'DELETE'])
@token_required
def manage_single_teacher(user_data, id):
    conn = get_db_connection()
    if request.method == 'PUT':
        data = request.get_json()
        if 'pin' in data and data['pin']: # Only update PIN if provided
             conn.execute("UPDATE teachers SET teacher_name = ?, pin = ? WHERE id = ?", (data['teacher_name'], data['pin'], id))
        else:
             conn.execute("UPDATE teachers SET teacher_name = ? WHERE id = ?", (data['teacher_name'], id))
        conn.commit()
    elif request.method == 'DELETE':
        conn.execute("DELETE FROM teachers WHERE id = ?", (id,))
        conn.commit()
    conn.close()
    return jsonify({"message": "Operation successful."})

# --- Student Management API (Full CRUD) ---
@app.route('/api/admin/students', methods=['GET', 'POST'])
@token_required
def manage_students(user_data):
    conn = get_db_connection()
    if request.method == 'GET':
        students_cursor = conn.execute("SELECT * FROM students ORDER BY student_name").fetchall()
        students = [dict(row) for row in students_cursor]
        conn.close()
        return jsonify(students)
    
    if request.method == 'POST':
        data = request.get_json()
        hashed_password = hashlib.sha256(data['password'].encode('utf-8')).hexdigest()
        try:
            conn.execute("INSERT INTO students (student_name, university_roll_no, enrollment_no, email1, email2, password) VALUES (?, ?, ?, ?, ?, ?)",
                         (data['student_name'], data['university_roll_no'], data['enrollment_no'], data['email1'], data['email2'], hashed_password))
            conn.commit()
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({"status": "error", "message": "Student with that University Roll No or Enrollment No already exists."}), 409
        conn.close()
        return jsonify({"status": "success", "message": "Student added."}), 201

@app.route('/api/admin/students/<int:id>', methods=['PUT', 'DELETE'])
@token_required
def manage_single_student(user_data, id):
    conn = get_db_connection()
    if request.method == 'PUT':
        data = request.get_json()
        # Check if a new password was provided
        if 'password' in data and data['password']:
            hashed_password = hashlib.sha256(data['password'].encode('utf-8')).hexdigest()
            conn.execute("""UPDATE students SET student_name = ?, university_roll_no = ?, 
                            enrollment_no = ?, email1 = ?, email2 = ?, password = ? WHERE id = ?""",
                         (data['student_name'], data['university_roll_no'], data['enrollment_no'], data['email1'], data['email2'], hashed_password, id))
        else: # Update without changing the password
            conn.execute("""UPDATE students SET student_name = ?, university_roll_no = ?, 
                            enrollment_no = ?, email1 = ?, email2 = ? WHERE id = ?""",
                         (data['student_name'], data['university_roll_no'], data['enrollment_no'], data['email1'], data['email2'], id))
        conn.commit()
    elif request.method == 'DELETE':
        conn.execute("DELETE FROM students WHERE id = ?", (id,))
        conn.commit()
    conn.close()
    return jsonify({"message": "Operation successful."})

# END OF PART 1




# START OF PART 2

# =================================================================
#   ADMIN API ENDPOINTS (Part 2 - Advanced)
# =================================================================

# --- Course Management API (Full CRUD) ---
@app.route('/api/admin/courses', methods=['GET', 'POST'])
@token_required
def manage_courses(user_data):
    conn = get_db_connection()
    if request.method == 'GET':
        courses_cursor = conn.execute("SELECT * FROM courses ORDER BY course_name").fetchall()
        courses = [dict(row) for row in courses_cursor]
        conn.close()
        return jsonify(courses)
    
    if request.method == 'POST':
        data = request.get_json()
        conn.execute("""INSERT INTO courses (course_name, batchcode, default_duration_minutes, semester_id, teacher_id) 
                        VALUES (?, ?, ?, ?, ?)""",
                     (data['course_name'], data['batchcode'], data['default_duration_minutes'], data['semester_id'], data['teacher_id']))
        conn.commit()
        conn.close()
        return jsonify({"status": "success", "message": "Course added."}), 201

# This is a special "view" endpoint that joins tables to get human-readable names
# for the main display table in the UI.
@app.route('/api/admin/courses-view', methods=['GET'])
@token_required
def get_courses_view(user_data):
    conn = get_db_connection()
    query = """
        SELECT c.id, c.course_name, c.batchcode, s.semester_name, t.teacher_name 
        FROM courses c
        LEFT JOIN semesters s ON c.semester_id = s.id
        LEFT JOIN teachers t ON c.teacher_id = t.id
        ORDER BY c.course_name
    """
    courses_cursor = conn.execute(query).fetchall()
    courses = [dict(row) for row in courses_cursor]
    conn.close()
    return jsonify(courses)

@app.route('/api/admin/courses/<int:id>', methods=['GET', 'PUT', 'DELETE'])
@token_required
def manage_single_course(user_data, id):
    conn = get_db_connection()
    if request.method == 'GET':
        course = conn.execute("SELECT * FROM courses WHERE id = ?", (id,)).fetchone()
        conn.close()
        if course is None:
            return jsonify({"message": "Course not found"}), 404
        return jsonify(dict(course))

    if request.method == 'PUT':
        data = request.get_json()
        conn.execute("""UPDATE courses SET course_name = ?, batchcode = ?, default_duration_minutes = ?, 
                        semester_id = ?, teacher_id = ? WHERE id = ?""",
                     (data['course_name'], data['batchcode'], data['default_duration_minutes'], data['semester_id'], data['teacher_id'], id))
        conn.commit()
    elif request.method == 'DELETE':
        conn.execute("DELETE FROM courses WHERE id = ?", (id,))
        conn.commit()
    conn.close()
    return jsonify({"message": "Operation successful."})

# --- Course Enrollment API ---
@app.route('/api/admin/enrollments/<int:course_id>', methods=['GET', 'POST'])
@token_required
def manage_enrollments(user_data, course_id):
    conn = get_db_connection()
    if request.method == 'GET':
        enrolled_cursor = conn.execute("""
            SELECT s.id as student_id, s.student_name, s.university_roll_no, e.class_roll_id
            FROM students s JOIN enrollments e ON s.id = e.student_id
            WHERE e.course_id = ? """, (course_id,)).fetchall()
        enrolled = [dict(row) for row in enrolled_cursor]
        
        available_cursor = conn.execute("""
            SELECT id, student_name, university_roll_no FROM students
            WHERE id NOT IN (SELECT student_id FROM enrollments WHERE course_id = ?)
        """, (course_id,)).fetchall()
        available = [dict(row) for row in available_cursor]
        
        conn.close()
        return jsonify({"enrolled": enrolled, "available": available})

    if request.method == 'POST':
        enrollment_data = request.get_json()
        conn.execute('BEGIN TRANSACTION')
        try:
            conn.execute("DELETE FROM enrollments WHERE course_id = ?", (course_id,))
            for student in enrollment_data:
                conn.execute("INSERT INTO enrollments (student_id, course_id, class_roll_id) VALUES (?, ?, ?)",
                             (student['student_id'], course_id, student['class_roll_id']))
            conn.commit()
        except Exception as e:
            conn.rollback()
            conn.close()
            return jsonify({"status": "error", "message": f"Database error: {e}"}), 500
        conn.close()
        return jsonify({"status": "success", "message": "Enrollments updated successfully."})

# --- Enrollment Roster API (The Brilliant Feature) ---
@app.route('/api/admin/enrollment-roster/<int:semester_id>', methods=['GET'])
@token_required
def get_enrollment_roster(user_data, semester_id):
    conn = get_db_connection()
    # This is a complex query that aggregates data for the roster view.
    # It finds all students enrolled in any course within the selected semester.
    # GROUP_CONCAT is a powerful SQLite function that joins multiple course codes into a single string.
    query = """
        SELECT
            s.student_name,
            s.university_roll_no,
            MIN(e.class_roll_id) as primary_class_roll_id,
            GROUP_CONCAT(c.batchcode) as enrolled_courses
        FROM students s
        JOIN enrollments e ON s.id = e.student_id
        JOIN courses c ON e.course_id = c.id
        WHERE c.semester_id = ?
        GROUP BY s.id, s.student_name, s.university_roll_no
        ORDER BY primary_class_roll_id
    """
    roster_cursor = conn.execute(query, (semester_id,)).fetchall()
    roster = [dict(row) for row in roster_cursor]
    conn.close()
    return jsonify(roster)


# =================================================================
#   TEACHER API ENDPOINTS (Fully Functional)
# =================================================================

#This cod eis fo rgetting the batch code and sending it to teacher.js login part to show BATCHCODE FIELD in dropdown in the login page of teacher interface 
@app.route('/api/teacher/batchcodes', methods=['GET'])
def get_batchcodes():
    """Returns all batch codes for the teacher login dropdown."""
    conn = get_db_connection()
    batchcodes = [row['batchcode'] for row in conn.execute("SELECT batchcode FROM courses ORDER BY batchcode").fetchall()]
    conn.close()
    return jsonify(batchcodes)


# Teacher Login API 
@app.route('/api/teacher/login', methods=['POST'])
def teacher_login():
    """
    Handles the teacher's initial login.
    Verifies the batchcode and PIN.
    Returns the course name and ID for the setup screen.
    """
    data = request.get_json()
    batchcode = data.get('batchcode')
    pin = data.get('pin')
    conn = get_db_connection()
    course = conn.execute(
        "SELECT id, course_name, teacher_id, default_duration_minutes FROM courses WHERE batchcode = ?", 
        (batchcode,)
    ).fetchone()
    
    if not course:
        conn.close()
        return jsonify({"status": "error", "message": "Invalid Batch Code"}), 404
        
    teacher = conn.execute("SELECT pin FROM teachers WHERE id = ?", (course['teacher_id'],)).fetchone()
    
    if not teacher or teacher['pin'] != pin:
        conn.close()
        return jsonify({"status": "error", "message": "Invalid PIN"}), 401
    
    conn.close()
    return jsonify({
        "status": "success", 
        "course_name": course['course_name'], 
        "course_id": course['id'], 
        "default_duration": course['default_duration_minutes']
    })

@app.route('/api/teacher/start-session', methods=['POST'])
def teacher_start_session():
    """
    Starts a new session after the teacher has confirmed all setup details.
    Deactivates any old sessions and creates the new one.
    Returns the initial list of unmarked students for the live dashboard.
    """
    data = request.get_json()
    conn = get_db_connection()
    
    # Deactivate any other active sessions to be safe.
    conn.execute("UPDATE sessions SET is_active = 0, end_time = ? WHERE is_active = 1", (datetime.datetime.now(),))
    
    # Calculate start and end times
    start_time = datetime.datetime.fromisoformat(data['start_datetime'])
    end_time = start_time + datetime.timedelta(minutes=int(data['duration_minutes']))

    # Create the new session record
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO sessions (course_id, start_time, end_time, is_active, session_type) VALUES (?, ?, ?, 1, ?)",
        (data['course_id'], start_time, end_time, data['session_type'])
    )
    session_id = cursor.lastrowid
    conn.commit()
    
    # Get the list of all students enrolled in this course for the UI
    students_cursor = conn.execute("""
        SELECT e.class_roll_id, s.student_name, s.university_roll_no
        FROM enrollments e 
        JOIN students s ON e.student_id = s.id 
        WHERE e.course_id = ? 
        ORDER BY e.class_roll_id
    """, (data['course_id'],)).fetchall()
    
    students = [dict(row) for row in students_cursor]
    conn.close()
    
    return jsonify({
        "status": "success", 
        "message": "Session Started", 
        "students": students, 
        "session_id": session_id
    })

@app.route('/api/teacher/manual-override', methods=['POST'])
def manual_override():
    """Handles the teacher's request to manually mark a student present."""
    data = request.get_json()
    conn = get_db_connection()
    
    # Ensure the session is still active
    session = conn.execute("SELECT id FROM sessions WHERE id = ? AND is_active = 1", (data['session_id'],)).fetchone()
    if not session:
        conn.close()
        return jsonify({"status": "error", "message": "Session is not active or has ended"}), 400

    # Find the student's main ID from their university roll number
    student = conn.execute("SELECT id FROM students WHERE university_roll_no = ?", (data['univ_roll_no'],)).fetchone()
    if not student:
        conn.close()
        return jsonify({"status": "error", "message": "Student not found"}), 404

    # Insert the attendance record with the override flag and reason
    conn.execute(
        "INSERT INTO attendance_records (session_id, student_id, override_method, manual_reason) VALUES (?, ?, 'teacher_manual', ?)",
        (session['id'], student['id'], data['reason'])
    )
    conn.commit()
    conn.close()
    
    return jsonify({"status": "success", "message": "Attendance marked manually"})



# =================================================================
#   TEACHER API ENDPOINTS (Session Management)
# =================================================================

@app.route('/api/teacher/session/<int:session_id>/end', methods=['POST'])
def end_session(session_id):
    """Ends the currently active session."""
    conn = get_db_connection()
    conn.execute("UPDATE sessions SET is_active = 0, end_time = ? WHERE id = ? AND is_active = 1", 
                 (datetime.datetime.now(), session_id))
    conn.commit()
    conn.close()
    return jsonify({"status": "success", "message": "Session has been ended."})

@app.route('/api/teacher/session/<int:session_id>/extend', methods=['POST'])
def extend_session(session_id):
    """Adds 10 minutes to the end time of the active session."""
    conn = get_db_connection()
    session = conn.execute("SELECT end_time FROM sessions WHERE id = ? AND is_active = 1", (session_id,)).fetchone()
    if session:
        current_end_time = datetime.datetime.fromisoformat(session['end_time'])
        new_end_time = current_end_time + datetime.timedelta(minutes=10)
        conn.execute("UPDATE sessions SET end_time = ? WHERE id = ?", (new_end_time, session_id))
        conn.commit()
    conn.close()
    return jsonify({"status": "success", "new_end_time": new_end_time.isoformat()})

@app.route('/api/teacher/session/<int:session_id>/status', methods=['GET'])
def get_live_session_status(session_id):
    """
    Provides a real-time status update for the live dashboard.
    Returns the list of students who have been marked present.
    The frontend will use this to calculate who is left.
    """
    conn = get_db_connection()
    records_cursor = conn.execute("""
        SELECT s.university_roll_no 
        FROM attendance_records ar
        JOIN students s ON ar.student_id = s.id
        WHERE ar.session_id = ?
    """, (session_id,)).fetchall()
    
    marked_students = [row['university_roll_no'] for row in records_cursor]
    conn.close()
    
    return jsonify({"marked_students": marked_students})

@app.route('/api/teacher/report/<int:session_id>', methods=['GET'])
def get_session_report(session_id):
    """
    Generates the complete, final attendance report matrix for a given session's course.
    """
    conn = get_db_connection()
    
    # First, get the course ID from the session ID
    course = conn.execute("SELECT course_id FROM sessions WHERE id = ?", (session_id,)).fetchone()
    if not course:
        conn.close()
        return jsonify({"error": "Session not found"}), 404
    course_id = course['course_id']

    # Get all students enrolled in this course
    students_cursor = conn.execute("""
        SELECT s.id, s.student_name, s.university_roll_no, s.enrollment_no, e.class_roll_id
        FROM students s
        JOIN enrollments e ON s.id = e.student_id
        WHERE e.course_id = ? ORDER BY e.class_roll_id
    """, (course_id,)).fetchall()
    students = [dict(row) for row in students_cursor]

    # Get all sessions for this course, up to and including the current one
    sessions_cursor = conn.execute("""
        SELECT id, start_time FROM sessions 
        WHERE course_id = ? AND start_time <= (SELECT start_time FROM sessions WHERE id = ?)
        ORDER BY start_time
    """, (course_id, session_id)).fetchall()
    sessions = [dict(row) for row in sessions_cursor]

    # Get all attendance records for these sessions
    session_ids = [s['id'] for s in sessions]
    if not session_ids:
        # Handle case with no sessions
        return jsonify({"students": students, "sessions": sessions, "records": {}})

    placeholders = ','.join('?' for _ in session_ids)
    records_cursor = conn.execute(f"""
        SELECT session_id, student_id FROM attendance_records
        WHERE session_id IN ({placeholders})
    """, session_ids).fetchall()
    
    # Create a fast lookup set for presence check: (session_id, student_id)
    present_set = set((rec['session_id'], rec['student_id']) for rec in records_cursor)
    
    conn.close()

    # Structure the data for the frontend
    report_data = {
        "students": students,
        "sessions": sessions,
        "present_set": list(present_set) # Convert set to list for JSON
    }
    
    return jsonify(report_data)


# =================================================================
#   TEACHER API ENDPOINTS (Export)
# =================================================================

@app.route('/api/teacher/report/export/<int:session_id>')
def export_session_report(session_id):
    """
    Generates a .xlsx Excel file of the attendance report and sends it for download.
    """
    # This logic re-uses the get_session_report logic, but formats it into an Excel sheet
    # (For brevity, the data fetching is duplicated. In a large app, this would be refactored)
    conn = get_db_connection()
    course = conn.execute("SELECT c.course_name FROM sessions s JOIN courses c ON s.course_id = c.id WHERE s.id = ?", (session_id,)).fetchone()
    course_id = conn.execute("SELECT course_id FROM sessions WHERE id = ?", (session_id,)).fetchone()['course_id']
    students = [dict(row) for row in conn.execute("SELECT s.id, s.student_name, s.university_roll_no, s.enrollment_no, e.class_roll_id FROM students s JOIN enrollments e ON s.id = e.student_id WHERE e.course_id = ? ORDER BY e.class_roll_id", (course_id,)).fetchall()]
    sessions = [dict(row) for row in conn.execute("SELECT id, start_time FROM sessions WHERE course_id = ? AND start_time <= (SELECT start_time FROM sessions WHERE id = ?) ORDER BY start_time", (course_id, session_id)).fetchall()]
    session_ids = [s['id'] for s in sessions]
    present_set = set()
    if session_ids:
        placeholders = ','.join('?' for _ in session_ids)
        records_cursor = conn.execute(f"SELECT session_id, student_id FROM attendance_records WHERE session_id IN ({placeholders})", session_ids).fetchall()
        present_set = set((rec['session_id'], rec['student_id']) for rec in records_cursor)
    conn.close()

    # --- Create Excel Workbook in Memory ---
    wb = Workbook()
    ws = wb.active
    ws.title = "Attendance Report"

    # Header Row
    headers = ["Class Roll ID", "Student Name", "University Roll No."] + [datetime.datetime.fromisoformat(s['start_time']).strftime('%d-%b-%Y') for s in sessions]
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.alignment = Alignment(horizontal='center')

    # Data Rows
    for student in students:
        row_data = [student['class_roll_id'], student['student_name'], student['university_roll_no']]
        for session in sessions:
            if (session['id'], student['id']) in present_set:
                row_data.append("P")
            else:
                row_data.append("A")
        ws.append(row_data)

    # Save to an in-memory stream
    in_memory_file = io.BytesIO()
    wb.save(in_memory_file)
    in_memory_file.seek(0) # Move cursor to the beginning of the stream

    return send_file(
        in_memory_file,
        as_attachment=True,
        download_name=f"Attendance_Report_{course['course_name']}_{datetime.date.today()}.xlsx",
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )


# =================================================================
#   DEVICE API ENDPOINTS (For Live Status)
# =================================================================

# We will use a simple global variable to store the last heartbeat
# In a real multi-device system, this would be a dictionary or a database table
last_device_heartbeat = {}

@app.route('/api/device/heartbeat', methods=['POST'])
def device_heartbeat():
    """Receives a status update from the Smart Scanner device."""
    global last_device_heartbeat
    data = request.get_json()
    # In a multi-device system, you would use data['macAddress'] as a key
    last_device_heartbeat = data 
    # print("Received heartbeat:", data) # Uncomment for debugging
    return jsonify({"status": "ok"})

@app.route('/api/teacher/device-status', methods=['GET'])
def get_device_status():
    """Provides the last known device status to the Teacher Dashboard."""
    return jsonify(last_device_heartbeat)







# END OF PART 2








# START OF PART 3

# =================================================================
#   STUDENT API ENDPOINTS (Placeholder)
# =================================================================
# In our Admin-first build, these will be simple placeholders.

@app.route('/api/student/login', methods=['POST'])
def student_login():
    data = request.get_json()
    univ_roll_no = data.get('university_roll_no'); password = data.get('password')
    hashed_password = hashlib.sha256(password.encode('utf-8')).hexdigest()
    conn = get_db_connection()
    student = conn.execute("SELECT id, student_name FROM students WHERE university_roll_no = ? AND password = ?", (univ_roll_no, hashed_password)).fetchone()
    conn.close()
    if student:
        token = jwt.encode({'student_id': student['id'], 'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=1)}, app.config['SECRET_KEY'], algorithm="HS256")
        return jsonify({'token': token, 'student_name': student['student_name']})
    return jsonify({"message": "Invalid credentials"}), 401

@app.route('/api/student/dashboard', methods=['GET'])
@token_required
def get_student_dashboard(user_data):
    student_id = user_data['student_id']
    conn = get_db_connection()
    courses_cursor = conn.execute("SELECT c.id as course_id, c.course_name FROM courses c JOIN enrollments e ON c.id = e.course_id WHERE e.student_id = ?", (student_id,)).fetchall()
    
    courses_data = []
    total_present_overall = 0
    total_sessions_overall = 0

    for course in courses_cursor:
        sessions_cursor = conn.execute("SELECT id FROM sessions WHERE course_id = ?", (course['course_id'],)).fetchall()
        session_ids = [s['id'] for s in sessions_cursor]
        total_sessions = len(session_ids)
        
        if total_sessions > 0:
            present_cursor = conn.execute(f"SELECT COUNT(id) as present_count FROM attendance_records WHERE student_id = ? AND session_id IN ({','.join(['?']*len(session_ids))})", [student_id] + session_ids)
            present_count = present_cursor.fetchone()['present_count']
        else:
            present_count = 0
        
        percentage = (present_count / total_sessions * 100) if total_sessions > 0 else 0
        total_present_overall += present_count
        total_sessions_overall += total_sessions
        
        courses_data.append({
            "course_id": course['course_id'], 
            "course_name": course['course_name'], 
            "percentage": round(percentage), 
            "present_count": present_count, 
            "absent_count": total_sessions - present_count, 
            "total_sessions": total_sessions
        })
        
    conn.close()
    overall_percentage = (total_present_overall / total_sessions_overall * 100) if total_sessions_overall > 0 else 0
    return jsonify({"overall_percentage": round(overall_percentage), "courses": courses_data})

@app.route('/api/student/course/<int:course_id>', methods=['GET'])
@token_required
def get_course_details(user_data, course_id):
    student_id = user_data['student_id']
    conn = get_db_connection()
    course = conn.execute("SELECT course_name FROM courses WHERE id = ?", (course_id,)).fetchone()
    sessions = conn.execute("SELECT id, start_time, end_time FROM sessions WHERE course_id = ? ORDER BY start_time DESC", (course_id,)).fetchall()
    
    attendance_log = []
    present_count = 0
    for session in sessions:
        record = conn.execute("SELECT id FROM attendance_records WHERE session_id = ? AND student_id = ?", (session['id'], student_id)).fetchone()
        status = "Present" if record else "Absent"
        if record: present_count += 1
        attendance_log.append({"date": session['start_time'], "end_time": session['end_time'], "status": status})

    total_sessions = len(sessions)
    percentage = (present_count / total_sessions * 100) if total_sessions > 0 else 0
    conn.close()
    
    return jsonify({
        "course_name": course['course_name'], "present_count": present_count, "absent_count": total_sessions - present_count,
        "total_sessions": total_sessions, "percentage": round(percentage), "log": attendance_log
    })



# =================================================================
#   DEVICE API ENDPOINTS (Fully Functional)
# =================================================================

# This endpoint is polled by the ESP32 device to know if it should
# be in 'ATTENDANCE_MODE' or 'AWAITING_SESSION' mode.
@app.route('/api/session-status', methods=['GET'])
def get_session_status():
    """Checks for an active session and returns its status and name."""
    conn = get_db_connection()
    # Find the most recent active session
    session_data = conn.execute("""
        SELECT s.id, c.batchcode 
        FROM sessions s
        JOIN courses c ON s.course_id = c.id
        WHERE s.is_active = 1 
        ORDER BY s.start_time DESC 
        LIMIT 1
    """).fetchone()
    conn.close()

    if session_data:
        # If a session is active, send back its status and the batchcode for display
        return jsonify({
            "isSessionActive": True,
            "sessionName": session_data['batchcode']
        })
    else:
        # If no session is active, tell the device to remain idle
        return jsonify({
            "isSessionActive": False,
            "sessionName": ""
        })

# This is the main endpoint for the Smart Scanner to record attendance.
@app.route('/api/mark-attendance-by-roll-id', methods=['POST'])
def mark_attendance_by_roll_id():
    """
    Receives a confirmed Class Roll ID from the device and performs
    the final, critical server-side validation before marking attendance.
    """
    data = request.get_json()
    class_roll_id = data.get('class_roll_id')
    
    conn = get_db_connection()
    # 1. Find the currently active session.
    active_session = conn.execute("SELECT id, course_id FROM sessions WHERE is_active = 1").fetchone()
    
    if not active_session:
        conn.close()
        return jsonify({"status": "error", "message": "No Active Session"}), 400

    # 2. CRITICAL CHECK: Verify that the student with this Class Roll ID is
    #    actually enrolled in the currently active course.
    enrollment = conn.execute("""
        SELECT student_id 
        FROM enrollments 
        WHERE course_id = ? AND class_roll_id = ?
    """, (active_session['course_id'], class_roll_id)).fetchone()
    
    if not enrollment:
        conn.close()
        # This is the specific error message for the "right student, wrong class" problem.
        return jsonify({"status": "not_enrolled", "message": "Not Enrolled\nin Course"})

    student_id = enrollment['student_id']

    # 3. CRITICAL CHECK: Verify this is not a duplicate scan.
    existing_record = conn.execute("""
        SELECT id FROM attendance_records 
        WHERE session_id = ? AND student_id = ?
    """, (active_session['id'], student_id)).fetchone()

    if existing_record:
        conn.close()
        return jsonify({"status": "duplicate", "message": "Already Marked"})
    
    # 4. If all checks pass, insert the new attendance record.
    conn.execute("INSERT INTO attendance_records (session_id, student_id, override_method) VALUES (?, ?, ?)",
                 (active_session['id'], student_id, 'biometric'))
    conn.commit()
    conn.close()
    
    return jsonify({"status": "success", "message": "Marked"})





# =================================================================
#   Main Execution Block
# =================================================================
if __name__ == '__main__':
    # host='0.0.0.0' makes the server accessible from other devices on your network
    app.run(host='0.0.0.0', port=5000, debug=True)

# END OF PART 3









