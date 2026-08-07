// ============================================================
// King of Math — Messaging Module
// حمّل ده بعد مكتبة supabase-js في صفحتك:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
// <script src="messaging.js"></script>
// ============================================================

const SUPABASE_URL = "https://swwxjkvniywcmpeybote.supabase.co";
const SUPABASE_ANON_KEY = "PASTE_YOUR_ANON_PUBLIC_KEY_HERE"; // من Project Settings -> API

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const KOM = {
  currentStudent: null,   // { id, name, code, class_id, grades, ... }
  isAdmin: false,
  _channels: [],

  // ----------------------------------------------------------
  // تسجيل دخول الطالب (كود + اسم، بدون تعقيد)
  // ----------------------------------------------------------
  async studentLogin(code, name) {
    // أول حاجة: لازم يكون فيه session (حتى anonymous) عشان auth.uid() يشتغل
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

    this.currentStudent = data;
    localStorage.setItem("kom_student_code", code.trim());
    localStorage.setItem("kom_student_name", name.trim());
    return data;
  },

  // إعادة تسجيل الدخول تلقائيًا لو الطالب فاتح التطبيق قبل كده (PWA)
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

  // ----------------------------------------------------------
  // تسجيل دخول الأدمن (إيميل وباسورد حقيقيين من Supabase Auth)
  // ----------------------------------------------------------
  async adminLogin(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.isAdmin = true;
    return data;
  },

  async logout() {
    await supabase.auth.signOut();
    this.currentStudent = null;
    this.isAdmin = false;
    localStorage.removeItem("kom_student_code");
    localStorage.removeItem("kom_student_name");
  },

  // ----------------------------------------------------------
  // إرسال رسالة عامة (الأدمن بس، حسب الـ RLS)
  // ----------------------------------------------------------
  async sendPublicMessage(body) {
    const { error } = await supabase.from("messages").insert({
      scope: "public",
      sender: "admin",
      body,
    });
    if (error) throw error;
  },

  // إرسال رسالة خاصة (من الأدمن لطالب معيّن، أو من الطالب لنفسه)
  async sendPrivateMessage(studentId, body, sender = "admin") {
    const { error } = await supabase.from("messages").insert({
      scope: "private",
      student_id: studentId,
      sender,
      body,
    });
    if (error) throw error;
  },

  // ----------------------------------------------------------
  // جلب سجل الرسايل
  // ----------------------------------------------------------
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
  // Realtime: استقبال فوري لأي رسالة جديدة
  // onMessage(msg) هيتنفذ لأي رسالة جديدة تخص الشات ده
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
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `student_id=eq.${studentId}`,
        },
        (payload) => onMessage(payload.new)
      )
      .subscribe();
    this._channels.push(channel);
    return channel;
  },

  // Realtime لأي تعديل في بيانات/درجات الطالب (يترفريش فورًا عند الطالب)
  subscribeStudentUpdates(studentId, onUpdate) {
    const channel = supabase
      .channel(`student-updates-${studentId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "students", filter: `id=eq.${studentId}` },
        (payload) => onUpdate(payload.new)
      )
      .subscribe();
    this._channels.push(channel);
    return channel;
  },

  unsubscribeAll() {
    this._channels.forEach((ch) => supabase.removeChannel(ch));
    this._channels = [];
  },

  // ----------------------------------------------------------
  // أدوات الأدمن: إدارة الطلاب/الفصول
  // ----------------------------------------------------------
  async adminListStudents() {
    const { data, error } = await supabase.from("students").select("*").order("name");
    if (error) throw error;
    return data;
  },

  async adminAddStudent({ name, code, class_id }) {
    const { data, error } = await supabase
      .from("students")
      .insert({ name, code, class_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async adminUpdateStudent(studentId, updates) {
    const { data, error } = await supabase
      .from("students")
      .update(updates)
      .eq("id", studentId)
      .select()
      .single();
    if (error) throw error;
    return data; // أي طالب متصل realtime هيستقبل التحديث ده فورًا
  },

  async adminListClasses() {
    const { data, error } = await supabase.from("classes").select("*").order("name");
    if (error) throw error;
    return data;
  },

  async adminAddClass(name) {
    const { data, error } = await supabase.from("classes").insert({ name }).select().single();
    if (error) throw error;
    return data;
  },
};

window.KOM = KOM;
