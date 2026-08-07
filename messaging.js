// ============================================================
// King of Math — Messaging & Data Module (Supabase)
// حمّل ده بعد مكتبة supabase-js في صفحتك:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
// <script src="messaging.js"></script>
// ============================================================

const SUPABASE_URL = "https://swwxjkvniywcmpeybote.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_MBIBPs59XjTDr7shthCBYw_KxezHl_V";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- تحويل بين شكل بيانات الواجهة (JS) وشكل جدول Supabase ----------
function dbToStudent(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    school: row.school || '',
    city: row.city || '',
    grade: row.grade || '',
    group: row.group_name || '',
    studentPhone: row.student_phone || '',
    parentPhone: row.parent_phone || '',
    examScore: Number(row.exam_score) || 0,
    examTotal: Number(row.exam_total) || 100,
    improvement: Number(row.improvement) || 0,
    commitment: Number(row.commitment) || 0,
    waMode: row.wa_mode || 'number',
    waLink: row.wa_link || '',
    classId: row.class_id || null,
  };
}

function studentToDb(s) {
  const row = {};
  if (s.code !== undefined) row.code = s.code;
  if (s.name !== undefined) row.name = s.name;
  if (s.school !== undefined) row.school = s.school;
  if (s.city !== undefined) row.city = s.city;
  if (s.grade !== undefined) row.grade = s.grade;
  if (s.group !== undefined) row.group_name = s.group;
  if (s.studentPhone !== undefined) row.student_phone = s.studentPhone;
  if (s.parentPhone !== undefined) row.parent_phone = s.parentPhone;
  if (s.examScore !== undefined) row.exam_score = s.examScore;
  if (s.examTotal !== undefined) row.exam_total = s.examTotal;
  if (s.improvement !== undefined) row.improvement = s.improvement;
  if (s.commitment !== undefined) row.commitment = s.commitment;
  if (s.waMode !== undefined) row.wa_mode = s.waMode;
  if (s.waLink !== undefined) row.wa_link = s.waLink;
  if (s.classId !== undefined) row.class_id = s.classId || null;
  return row;
}

function dbToClass(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, capacity: Number(row.capacity) || 8 };
}

function genCode() {
  // كود دخول قصير سهل الإملاء: 6 أرقام
  return String(Math.floor(100000 + Math.random() * 900000));
}

const KOM = {
  currentStudent: null,   // شكل الواجهة (dbToStudent)
  isAdmin: false,
  _channels: [],

  // ----------------------------------------------------------
  // تسجيل دخول الطالب (كود + اسم، بدون تعقيد)
  // ----------------------------------------------------------
  async studentLogin(code, name) {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      const { error: anonErr } = await supabase.auth.signInAnonymously();
      if (anonErr) throw anonErr;
    }

    const { data, error } = await supabase.rpc("login_student", {
      p_code: code.trim(),
      p_name: name.trim(),
    });
    if (error) throw error;

    const student = dbToStudent(data);
    this.currentStudent = student;
    localStorage.setItem("kom_student_code", code.trim());
    localStorage.setItem("kom_student_name", name.trim());
    return student;
  },

  async tryAutoLogin() {
    const code = localStorage.getItem("kom_student_code");
    const name = localStorage.getItem("kom_student_name");
    if (code && name) {
      try {
        return await this.studentLogin(code, name);
      } catch (e) {
        localStorage.removeItem("kom_student_code");
        localStorage.removeItem("kom_student_name");
        return null;
      }
    }
    return null;
  },

  // إعادة جلب بيانات الطالب الحالي (بعد أي تحديث)
  async refreshCurrentStudent() {
    if (!this.currentStudent) return null;
    const { data, error } = await supabase
      .from("students")
      .select("*")
      .eq("id", this.currentStudent.id)
      .single();
    if (error) throw error;
    this.currentStudent = dbToStudent(data);
    return this.currentStudent;
  },

  // ----------------------------------------------------------
  // تسجيل دخول / خروج الأدمن
  // ----------------------------------------------------------
  async adminLogin(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.isAdmin = true;
    return data;
  },

  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  async logout() {
    await supabase.auth.signOut();
    this.currentStudent = null;
    this.isAdmin = false;
    localStorage.removeItem("kom_student_code");
    localStorage.removeItem("kom_student_name");
  },

  // ----------------------------------------------------------
  // رسايل
  // ----------------------------------------------------------
  async sendPublicMessage(body) {
    const { error } = await supabase.from("messages").insert({
      scope: "public",
      sender: "admin",
      body,
    });
    if (error) throw error;
  },

  async sendPrivateMessage(studentId, body, sender = "admin") {
    const { error } = await supabase.from("messages").insert({
      scope: "private",
      student_id: studentId,
      sender,
      body,
    });
    if (error) throw error;
  },

  async fetchPublicMessages(limit = 100) {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("scope", "public")
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw error;
    return data;
  },

  async fetchPrivateMessages(studentId, limit = 200) {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("scope", "private")
      .eq("student_id", studentId)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw error;
    return data;
  },

  // ----------------------------------------------------------
  // Realtime
  // ----------------------------------------------------------
  subscribePublicChat(onMessage) {
    const channel = supabase
      .channel("public-chat")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: "scope=eq.public" },
        (payload) => onMessage(payload.new)
      )
      .subscribe();
    this._channels.push(channel);
    return channel;
  },

  subscribePrivateChat(studentId, onMessage) {
    const channel = supabase
      .channel(`private-chat-${studentId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `student_id=eq.${studentId}` },
        (payload) => { if (payload.new.scope === 'private') onMessage(payload.new); }
      )
      .subscribe();
    this._channels.push(channel);
    return channel;
  },

  // كل الرسايل الخاصة (لكل الطلاب) — يستخدمها الأدمن عشان يعرف فيه رسالة جديدة من أي طالب
  subscribeAllPrivateChats(onMessage) {
    const channel = supabase
      .channel("admin-all-private")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: "scope=eq.private" },
        (payload) => onMessage(payload.new)
      )
      .subscribe();
    this._channels.push(channel);
    return channel;
  },

  subscribeStudentUpdates(studentId, onUpdate) {
    const channel = supabase
      .channel(`student-updates-${studentId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "students", filter: `id=eq.${studentId}` },
        (payload) => onUpdate(dbToStudent(payload.new))
      )
      .subscribe();
    this._channels.push(channel);
    return channel;
  },

  // realtime عام لأي تغيير في الطلاب/الفصول (يستخدمه الأدمن عشان يترفريش لو فيه أكتر من جهاز)
  subscribeAdminData({ onStudentsChange, onClassesChange } = {}) {
    const channel = supabase
      .channel("admin-data")
      .on("postgres_changes", { event: "*", schema: "public", table: "students" }, (payload) => {
        if (onStudentsChange) onStudentsChange(payload);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "classes" }, (payload) => {
        if (onClassesChange) onClassesChange(payload);
      })
      .subscribe();
    this._channels.push(channel);
    return channel;
  },

  // ياخد باله من الاشتراك السابق ويقفله قبل ما يفتح شات جديد (عشان منعملش دبلكيشن)
  subscribeChat(type, studentId, onMessage) {
    this.unsubscribeChat();
    this._chatChannel =
      type === 'public'
        ? this.subscribePublicChat(onMessage)
        : this.subscribePrivateChat(studentId, onMessage);
    return this._chatChannel;
  },
  unsubscribeChat() {
    if (this._chatChannel) {
      supabase.removeChannel(this._chatChannel);
      this._channels = this._channels.filter((c) => c !== this._chatChannel);
      this._chatChannel = null;
    }
  },

  unsubscribeAll() {
    this._channels.forEach((ch) => supabase.removeChannel(ch));
    this._channels = [];
  },

  // ----------------------------------------------------------
  // أدوات الأدمن: الطلاب
  // ----------------------------------------------------------
  async adminListStudents() {
    const { data, error } = await supabase.from("students").select("*").order("name");
    if (error) throw error;
    return data.map(dbToStudent);
  },

  async adminAddStudent(student) {
    const row = studentToDb(student);
    if (!row.code) row.code = genCode();
    // لو الكود مكرر بالصدفة، جرّب تاني كام مرة
    for (let i = 0; i < 5; i++) {
      const { data, error } = await supabase.from("students").insert(row).select().single();
      if (!error) return dbToStudent(data);
      if (error.code === '23505' && !student.code) { row.code = genCode(); continue; }
      throw error;
    }
    throw new Error('تعذر توليد كود فريد للطالب، حاول تاني');
  },

  async adminUpdateStudent(studentId, updates) {
    const row = studentToDb(updates);
    const { data, error } = await supabase
      .from("students")
      .update(row)
      .eq("id", studentId)
      .select()
      .single();
    if (error) throw error;
    return dbToStudent(data);
  },

  async adminDeleteStudent(studentId) {
    const { error } = await supabase.from("students").delete().eq("id", studentId);
    if (error) throw error;
  },

  async adminBulkAddStudents(students) {
    const rows = students.map((s) => {
      const row = studentToDb(s);
      if (!row.code) row.code = genCode();
      return row;
    });
    const { data, error } = await supabase.from("students").insert(rows).select();
    if (error) throw error;
    return data.map(dbToStudent);
  },

  // ----------------------------------------------------------
  // أدوات الأدمن: الفصول
  // ----------------------------------------------------------
  async adminListClasses() {
    const { data, error } = await supabase.from("classes").select("*").order("name");
    if (error) throw error;
    return data.map(dbToClass);
  },

  async adminAddClass(name, capacity = 8) {
    const { data, error } = await supabase.from("classes").insert({ name, capacity }).select().single();
    if (error) throw error;
    return dbToClass(data);
  },

  async adminUpdateClass(classId, updates) {
    const { data, error } = await supabase.from("classes").update(updates).eq("id", classId).select().single();
    if (error) throw error;
    return dbToClass(data);
  },

  async adminDeleteClass(classId) {
    const { error } = await supabase.from("classes").delete().eq("id", classId);
    if (error) throw error;
  },

  // يمسح كل الطلاب والفصول (بدون الرسايل) — يُستخدم في "بدء من جديد"
  async adminWipeAll() {
    const { data: stu } = await supabase.from("students").select("id");
    if (stu && stu.length) {
      const { error } = await supabase.from("students").delete().in("id", stu.map((s) => s.id));
      if (error) throw error;
    }
    const { data: cls } = await supabase.from("classes").select("id");
    if (cls && cls.length) {
      const { error } = await supabase.from("classes").delete().in("id", cls.map((c) => c.id));
      if (error) throw error;
    }
  },

  // يمسح كل حاجة موجودة ويستورد نسخة احتياطية (يولّد ids/كودات جديدة، يحافظ على ربط الفصول)
  async adminRestoreAll(students, classes) {
    await this.adminWipeAll();
    const oldIdToNewId = {};
    const createdClasses = [];
    for (const c of (classes || [])) {
      const created = await this.adminAddClass(c.name, c.capacity || 8);
      oldIdToNewId[c.id] = created.id;
      createdClasses.push(created);
    }
    const rows = (students || []).map((s) => {
      const row = studentToDb(s);
      delete row.code; // نولّد كود جديد لتفادي أي تعارض
      row.class_id = s.classId ? (oldIdToNewId[s.classId] || null) : null;
      row.code = genCode();
      return row;
    });
    let createdStudents = [];
    if (rows.length) {
      const { data, error } = await supabase.from("students").insert(rows).select();
      if (error) throw error;
      createdStudents = data.map(dbToStudent);
    }
    return { students: createdStudents, classes: createdClasses };
  },

  async adminReplaceAllClasses(classesWithMembers) {
    // classesWithMembers: [{id?, name, capacity, memberIds:[studentId,...]}]
    // يستخدم في التوزيع التلقائي: يمسح الفصول القديمة وينشئ جديدة ويحدّث class_id للطلاب
    const { data: oldClasses, error: e1 } = await supabase.from("classes").select("id");
    if (e1) throw e1;
    if (oldClasses && oldClasses.length) {
      const { error: eDel } = await supabase.from("classes").delete().in("id", oldClasses.map((c) => c.id));
      if (eDel) throw eDel;
    }
    const created = [];
    for (const cls of classesWithMembers) {
      const { data, error } = await supabase.from("classes").insert({ name: cls.name, capacity: cls.capacity }).select().single();
      if (error) throw error;
      created.push({ id: data.id, name: data.name, capacity: data.capacity, memberIds: cls.memberIds });
    }
    // نفضّي class_id لكل الطلاب الأول
    const { error: eClear } = await supabase.from("students").update({ class_id: null }).not("id", "is", null);
    if (eClear) throw eClear;
    for (const cls of created) {
      if (cls.memberIds.length) {
        const { error: eUpd } = await supabase.from("students").update({ class_id: cls.id }).in("id", cls.memberIds);
        if (eUpd) throw eUpd;
      }
    }
    return created.map(dbToClass);
  },
};

window.KOM = KOM;
