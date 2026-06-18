const TYPE_LABELS = {
  single: "单选题",
  multiple: "多选题",
  judge: "判断题",
  short: "简答题",
  comprehensive: "综合题",
};

const STORE_KEY = "es-study-progress-v1";
const bank = window.QUESTION_BANK || { meta: {}, questions: [] };
const questions = bank.questions || [];

let progress = loadProgress();
let app = {
  view: "dashboard",
  typeFilter: "all",
  order: "sequential",
  queue: questions.map((q) => q.id),
  current: 0,
  selected: [],
  subjectiveDraft: "",
  checked: null,
  completedReview: null,
  submittedReview: null,
  exam: null,
};

const main = document.querySelector("#main");

function loadProgress() {
  try {
    return {
      attempts: {},
      wrong: {},
      exams: [],
      self: {},
      activeReview: null,
      reviewSessions: [],
      reviewDrafts: {},
      activeExam: null,
      ...(JSON.parse(localStorage.getItem(STORE_KEY)) || {}),
    };
  } catch {
    return { attempts: {}, wrong: {}, exams: [], self: {}, activeReview: null, reviewSessions: [], reviewDrafts: {}, activeExam: null };
  }
}

function saveProgress() {
  localStorage.setItem(STORE_KEY, JSON.stringify(progress));
}

function byId(id) {
  return questions.find((q) => q.id === id);
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function currentQuestion() {
  return byId(app.queue[app.current]) || questions[0];
}

function isObjective(question) {
  return ["single", "multiple", "judge"].includes(question.type);
}

function normalizeAnswer(answer) {
  if (answer === "正确") return "A";
  if (answer === "错误") return "B";
  return Array.isArray(answer) ? [...answer].sort().join("") : String(answer || "");
}

function selectedAnswer(question) {
  if (question.type === "multiple") return [...app.selected].sort();
  return app.selected[0] || "";
}

function grade(question, answer) {
  if (!isObjective(question)) return null;
  return normalizeAnswer(answer) === normalizeAnswer(question.answer);
}

function recordAttempt(question, correct) {
  const item = progress.attempts[question.id] || { total: 0, correct: 0 };
  item.total += 1;
  if (correct) item.correct += 1;
  item.lastAt = new Date().toISOString();
  progress.attempts[question.id] = item;
  if (!correct) {
    progress.wrong[question.id] = {
      count: (progress.wrong[question.id]?.count || 0) + 1,
      lastAt: item.lastAt,
    };
  } else if (progress.wrong[question.id]) {
    progress.wrong[question.id].resolvedAt = item.lastAt;
  }
  saveProgress();
}

function makeReviewSession(sourceQuestions = questions, source = "practice") {
  const filtered = sourceQuestions.filter((q) => app.typeFilter === "all" || q.type === app.typeFilter);
  const queue = (app.order === "random" ? shuffle(filtered) : filtered).map((q) => q.id);
  return {
    id: `review-${Date.now()}`,
    source,
    typeFilter: app.typeFilter,
    order: app.order,
    queue,
    current: 0,
    answered: {},
    answers: {},
    subjective: {},
    revealed: {},
    submitted: false,
    startedAt: new Date().toISOString(),
    lastAt: new Date().toISOString(),
    status: "active",
  };
}

function reviewDraftKey(source = "practice", typeFilter = app.typeFilter, order = app.order) {
  return `${source}:${typeFilter}:${order}`;
}

function stashActiveReview() {
  const session = progress.activeReview;
  if (!session || session.submitted) return;
  progress.reviewDrafts = progress.reviewDrafts || {};
  session.current = app.current;
  session.lastAt = new Date().toISOString();
  progress.reviewDrafts[reviewDraftKey(session.source, session.typeFilter, session.order)] = session;
  saveProgress();
}

function activePracticeSession() {
  return progress.activeReview || app.submittedReview;
}

function applyReviewSession(session) {
  app.typeFilter = session.typeFilter || "all";
  app.order = session.order || "sequential";
  app.queue = session.queue?.length ? session.queue : questions.map((q) => q.id);
  app.current = Math.min(session.current || 0, app.queue.length - 1);
  app.selected = [];
  app.subjectiveDraft = "";
  app.checked = null;
  app.completedReview = null;
  app.submittedReview = null;
}

function saveActiveReview() {
  if (!progress.activeReview || app.exam) return;
  progress.activeReview.current = app.current;
  progress.activeReview.lastAt = new Date().toISOString();
  saveProgress();
}

function saveActiveExam() {
  if (!app.exam) return;
  progress.activeExam = app.exam;
  saveProgress();
}

function savePracticeAnswer(question) {
  const session = progress.activeReview;
  if (!session || session.submitted) return;
  if (isObjective(question)) {
    const answer = selectedAnswer(question);
    if (Array.isArray(answer) ? answer.length : answer) {
      session.answers[question.id] = answer;
      session.answered[question.id] = { at: new Date().toISOString() };
    } else {
      delete session.answers[question.id];
      delete session.answered[question.id];
    }
  } else {
    session.subjective[question.id] = app.subjectiveDraft;
    if (app.subjectiveDraft.trim() || session.revealed?.[question.id]) {
      session.answered[question.id] = { at: new Date().toISOString() };
    } else {
      delete session.answered[question.id];
    }
  }
  session.current = app.current;
  session.lastAt = new Date().toISOString();
  saveProgress();
}

function loadPracticeAnswer(question) {
  const session = activePracticeSession();
  if (!session) return;
  const saved = session.answers?.[question.id];
  app.selected = Array.isArray(saved) ? saved : saved ? [saved] : [];
  app.subjectiveDraft = session.subjective?.[question.id] || "";
  app.checked = session.submitted || session.revealed?.[question.id] ? { correct: isObjective(question) ? grade(question, saved) : null } : null;
}

function reviewSummary(session, status) {
  const answeredEntries = Object.entries(session.answered || {});
  const objectiveEntries = answeredEntries.filter(([id]) => isObjective(byId(id)));
  const correct = objectiveEntries.filter(([, item]) => item.correct === true).length;
  return {
    id: session.id,
    status,
    source: session.source,
    typeFilter: session.typeFilter,
    order: session.order,
    queue: session.queue || [],
    current: session.current || 0,
    answers: session.answers || {},
    subjective: session.subjective || {},
    answeredMap: session.answered || {},
    total: session.queue.length,
    answered: answeredEntries.length,
    objectiveTotal: objectiveEntries.length,
    correct,
    accuracy: objectiveEntries.length ? Math.round((correct / objectiveEntries.length) * 100) : null,
    startedAt: session.startedAt,
    endedAt: new Date().toISOString(),
  };
}

function completeActiveReviewIfReady() {
  const session = progress.activeReview;
  if (!session) return false;
  const answeredCount = Object.keys(session.answered || {}).length;
  if (answeredCount < session.queue.length) return false;
  progress.reviewSessions.unshift(reviewSummary(session, "completed"));
  progress.reviewSessions = progress.reviewSessions.slice(0, 50);
  progress.activeReview = null;
  saveProgress();
  return true;
}

function abandonActiveReview() {
  const session = progress.activeReview;
  if (!session) return;
  progress.reviewSessions.unshift(reviewSummary(session, "abandoned"));
  progress.reviewSessions = progress.reviewSessions.slice(0, 50);
  if (progress.reviewDrafts) delete progress.reviewDrafts[reviewDraftKey(session.source, session.typeFilter, session.order)];
  progress.activeReview = null;
  saveProgress();
  app.selected = [];
  app.checked = null;
  setView("dashboard");
}

function submitActiveReview() {
  const session = progress.activeReview;
  if (!session) return;
  const answeredCount = Object.keys(session.answered || {}).length;
  if (answeredCount < session.queue.length) return;
  session.queue.map(byId).forEach((question) => {
    if (!question) return;
    const answer = session.answers?.[question.id];
    const correct = isObjective(question) ? grade(question, answer) : null;
    session.answered[question.id] = {
      ...(session.answered[question.id] || {}),
      correct,
      submittedAt: new Date().toISOString(),
    };
    if (isObjective(question)) recordAttempt(question, correct);
  });
  session.submitted = true;
  session.status = "completed";
  session.endedAt = new Date().toISOString();
  const summary = reviewSummary(session, "completed");
  progress.reviewSessions.unshift(summary);
  progress.reviewSessions = progress.reviewSessions.slice(0, 50);
  if (progress.reviewDrafts) delete progress.reviewDrafts[reviewDraftKey(session.source, session.typeFilter, session.order)];
  progress.activeReview = null;
  app.submittedReview = session;
  app.completedReview = summary;
  saveProgress();
  render();
}

function revealCurrentAnswer() {
  const session = progress.activeReview;
  const question = currentQuestion();
  if (!session || !question) return;
  if (isObjective(question) && !app.selected.length) {
    alert("请先选择答案，再提前看解析。");
    return;
  }
  savePracticeAnswer(question);
  session.revealed = session.revealed || {};
  session.revealed[question.id] = new Date().toISOString();
  session.current = app.current;
  session.lastAt = new Date().toISOString();
  saveProgress();
  app.checked = { correct: isObjective(question) ? grade(question, session.answers?.[question.id]) : null };
  render();
}

function hasUnsubmittedReviewWork() {
  const session = progress.activeReview;
  return Boolean(session && !session.submitted && Object.keys(session.answered || {}).length);
}

function confirmPracticeSwitch() {
  if (!hasUnsubmittedReviewWork()) return true;
  return confirm("当前专项练习还没有提交，已作答内容会先保存为草稿；切回这个题型时可以继续。确定切换吗？");
}

function openReviewSession(sessionId) {
  const session = (progress.reviewSessions || []).find((item) => item.id === sessionId);
  if (!session) return;
  if (!session.queue?.length) {
    alert("这条旧记录没有保存题目明细，只能在列表中查看概要。");
    return;
  }
  if (session.status === "abandoned") {
    if (progress.activeReview && !confirmPracticeSwitch()) return;
    stashActiveReview();
    const answeredCount = Object.keys(session.answeredMap || {}).length;
    const nextIndex = session.queue.findIndex((id) => !session.answeredMap?.[id]);
    progress.activeReview = {
      id: `review-${Date.now()}`,
      source: session.source || "practice",
      typeFilter: session.typeFilter || "all",
      order: session.order || "sequential",
      queue: session.queue,
      current: nextIndex >= 0 ? nextIndex : Math.min(answeredCount, session.queue.length - 1),
      answered: session.answeredMap || {},
      answers: session.answers || {},
      subjective: session.subjective || {},
      revealed: {},
      submitted: false,
      startedAt: session.startedAt || new Date().toISOString(),
      lastAt: new Date().toISOString(),
      status: "active",
    };
    progress.reviewSessions = progress.reviewSessions.filter((item) => item.id !== sessionId);
    saveProgress();
    applyReviewSession(progress.activeReview);
    setView("practice");
    return;
  }
  const review = {
    ...session,
    queue: session.queue || [],
    answers: session.answers || {},
    subjective: session.subjective || {},
    revealed: {},
    submitted: true,
  };
  app.typeFilter = review.typeFilter || "all";
  app.order = review.order || "sequential";
  app.queue = review.queue;
  app.current = 0;
  app.selected = [];
  app.subjectiveDraft = "";
  app.checked = null;
  app.completedReview = null;
  app.submittedReview = review;
  setView("practice");
}

function deleteReviewSession(sessionId) {
  const session = (progress.reviewSessions || []).find((item) => item.id === sessionId);
  if (!session) return;
  if (!confirm("确定删除这条复习记录吗？不会删除题库和其它学习记录。")) return;
  progress.reviewSessions = progress.reviewSessions.filter((item) => item.id !== sessionId);
  saveProgress();
  render();
}

function resumeReview() {
  if (!progress.activeReview) return startPractice();
  applyReviewSession(progress.activeReview);
  setView("practice");
}

function statSummary() {
  const attempts = Object.values(progress.attempts);
  const totalDone = attempts.reduce((sum, item) => sum + item.total, 0);
  const totalCorrect = attempts.reduce((sum, item) => sum + item.correct, 0);
  const activeWrong = Object.entries(progress.wrong).filter(([, value]) => !value.resolvedAt).length;
  return {
    totalDone,
    totalCorrect,
    accuracy: totalDone ? Math.round((totalCorrect / totalDone) * 100) : 0,
    activeWrong,
    lastExam: progress.exams[0]?.score ?? "--",
  };
}

function setView(view) {
  app.view = view;
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === view);
  });
  render();
}

function startPractice(sourceQuestions = questions, options = {}) {
  const source = sourceQuestions === questions ? "practice" : "wrong";
  const { recordAbandoned = true, restoreDraft = false } = options;
  if (progress.activeReview && recordAbandoned) {
    progress.reviewSessions.unshift(reviewSummary(progress.activeReview, "abandoned"));
    progress.reviewSessions = progress.reviewSessions.slice(0, 50);
  } else if (progress.activeReview && !recordAbandoned) {
    stashActiveReview();
  }
  const key = reviewDraftKey(source);
  const draft = restoreDraft ? progress.reviewDrafts?.[key] : null;
  progress.activeReview = draft || makeReviewSession(sourceQuestions, source);
  saveProgress();
  applyReviewSession(progress.activeReview);
  app.view = "practice";
  setView("practice");
}

function render() {
  if (!questions.length) {
    main.innerHTML = `<section class="panel full-width empty">没有读取到题库，请先生成 questions.json。</section>`;
    return;
  }
  if (app.view === "practice") return renderPractice();
  if (app.view === "wrong") return renderWrong();
  if (app.view === "exam") return renderExam();
  if (app.view === "stats") return renderStats();
  if (app.view === "data") return renderData();
  renderDashboard();
}

function renderDashboard() {
  const stats = statSummary();
  const active = progress.activeReview;
  const activeQuestion = active ? byId(active.queue?.[active.current || 0]) : null;
  const recentReviews = (progress.reviewSessions || []).slice(0, 5);
  const typeCards = Object.entries(bank.meta.typeCounts || {})
    .map(([type, count]) => `<div class="type-card"><span class="muted">${TYPE_LABELS[type]}</span><strong>${count}</strong></div>`)
    .join("");
  main.innerHTML = `
    <section class="full-width">
      <div class="metrics">
        ${metric("题库总量", questions.length)}
        ${metric("已练习", stats.totalDone)}
        ${metric("正确率", `${stats.accuracy}%`)}
        ${metric("待复习错题", stats.activeWrong)}
      </div>
    </section>
    <section class="panel">
      <h2>今天从哪里开始？</h2>
      <p class="muted">建议先做专项练习，再用错题本回补，最后进入模拟考试检验掌握度。</p>
      ${active ? `
        <div class="answer-box">
          <strong>继续上次学习</strong>
          <p class="muted">上次停在第 ${(active.current || 0) + 1} / ${active.queue.length} 题${activeQuestion ? `：${escapeHtml(activeQuestion.question.slice(0, 42))}` : ""}</p>
        </div>
      ` : ""}
      <div class="actions">
        ${active ? `<button class="primary-action" data-action="resume-review">继续学习</button>` : `<button class="primary-action" data-action="practice">开始练习</button>`}
        ${active ? `<button class="danger-action" data-action="abandon-review">放弃本轮</button>` : ""}
        <button class="ghost-action" data-action="wrong">复习错题</button>
        <button class="ghost-action" data-action="start-exam">模拟考试</button>
      </div>
      ${recentReviews.length ? `
        <div class="answer-box">
          <strong>最近复习记录</strong>
          <div class="progress-list">${recentReviews.map(reviewRow).join("")}</div>
        </div>
      ` : ""}
    </section>
    <aside class="side-panel">
      <h3>题型覆盖</h3>
      <div class="type-grid">${typeCards}</div>
      <div class="answer-box">
        <strong>数据位置</strong>
        <p class="muted">题库在 questions.json，学习记录保存在当前浏览器 localStorage，可在“数据”里导出。</p>
      </div>
    </aside>
  `;
}

function metric(label, value) {
  return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;
}

function reviewRow(session) {
  const status = session.status === "completed" ? "完整复习" : "中途放弃";
  const statusClass = session.status === "completed" ? "status-good" : "status-warn";
  const score = session.accuracy === null ? "主观题自评" : `客观题正确率 ${session.accuracy}%`;
  const openLabel = session.status === "completed" ? "查看" : "继续";
  return `
    <div class="list-row">
      <strong class="${statusClass}">${status} · ${session.answered} / ${session.total} 题</strong>
      <span class="muted">${score} · ${new Date(session.endedAt).toLocaleString()}</span>
      <div class="actions">
        <button class="small-action" data-action="open-review-session" data-session-id="${session.id}">${openLabel}</button>
        <button class="small-action danger-action" data-action="delete-review-session" data-session-id="${session.id}">删除</button>
      </div>
    </div>
  `;
}

function renderPractice() {
  if (!app.queue.length && !app.submittedReview) startPractice();
  const question = currentQuestion();
  loadPracticeAnswer(question);
  main.innerHTML = `
    <section class="question-panel">
      ${practiceToolbar()}
      ${renderQuestion(question)}
      ${renderPracticeActions(question)}
      ${renderCompletedReviewNotice()}
    </section>
    <aside class="side-panel">
      ${renderSideInfo(question)}
    </aside>
  `;
}

function practiceToolbar() {
  const answered = Object.keys(progress.activeReview?.answered || {}).length;
  return `
    <div class="toolbar">
      <div>
        <h2>专项练习</h2>
        <p class="muted">第 ${app.current + 1} / ${app.queue.length} 题 · 已完成 ${answered} 题</p>
      </div>
      <div class="filter-row">
        <select class="select" data-control="type">
          <option value="all">全部题型</option>
          ${Object.entries(TYPE_LABELS).map(([value, label]) => `<option value="${value}" ${app.typeFilter === value ? "selected" : ""}>${label}</option>`).join("")}
        </select>
        <select class="select" data-control="order">
          <option value="sequential" ${app.order === "sequential" ? "selected" : ""}>顺序刷题</option>
          <option value="random" ${app.order === "random" ? "selected" : ""}>随机练习</option>
        </select>
        <button class="ghost-action" data-action="reset-practice">重新开始</button>
        ${progress.activeReview ? `<button class="danger-action" data-action="abandon-review">放弃本轮</button>` : ""}
      </div>
    </div>
  `;
}

function renderQuestion(question, mode = "practice") {
  const result = app.checked;
  return `
    <article>
      <div class="question-meta">
        <span class="chip">${TYPE_LABELS[question.type]}</span>
        ${question.tags.map((tag) => `<span class="chip">${tag}</span>`).join("")}
      </div>
      <div class="question-text">${escapeHtml(question.question)}</div>
      ${isObjective(question) ? renderOptions(question) : renderSubjective(question)}
      ${result ? renderAnswerBox(question, result) : ""}
    </article>
  `;
}

function renderOptions(question) {
  const entries = question.type === "judge" ? Object.entries(question.options) : Object.entries(question.options);
  return `<div class="options">
    ${entries.map(([key, value]) => {
      const selected = app.selected.includes(key);
      const checked = app.checked;
      const correctKeys = Array.isArray(question.answer) ? question.answer : [question.answer];
      const classes = ["option"];
      if (selected) classes.push("is-selected");
      if (checked && correctKeys.includes(key)) classes.push("is-correct");
      if (checked && selected && !correctKeys.includes(key)) classes.push("is-wrong");
      return `<button class="${classes.join(" ")}" data-option="${key}">
        <span class="option-key">${key}</span><span>${escapeHtml(value)}</span>
      </button>`;
    }).join("")}
  </div>`;
}

function renderSubjective(question) {
  return `
    <label class="muted" for="subjective-answer">你的答案</label>
    <textarea id="subjective-answer" class="textarea" data-control="subjective" placeholder="先自己写，再查看参考答案。">${escapeHtml(app.subjectiveDraft)}</textarea>
  `;
}

function renderPracticeActions(question) {
  if (!question) return "";
  const session = activePracticeSession();
  const answered = Object.keys(session?.answered || {}).length;
  const total = session?.queue?.length || app.queue.length;
  const submitted = Boolean(session?.submitted);
  const revealed = Boolean(session?.revealed?.[question.id]);
  const canSubmit = answered === total && total > 0 && !submitted;
  return `
    <div class="actions">
      <button class="ghost-action" data-action="prev" ${app.current === 0 ? "disabled" : ""}>上一题</button>
      ${!submitted && !revealed ? `<button class="ghost-action" data-action="reveal-answer">提前看解析</button>` : ""}
      ${submitted ? `<button class="ghost-action" disabled>已提交，正在复盘</button>` : `<button class="primary-action" data-action="submit-review" ${canSubmit ? "" : "disabled"}>提交本轮</button>`}
      <button class="ghost-action" data-action="next">下一题</button>
    </div>
    ${!submitted && !canSubmit ? `<p class="muted">还有 ${Math.max(0, total - answered)} 题未作答，全部完成后统一提交并显示解析。</p>` : ""}
  `;
}

function renderCompletedReviewNotice() {
  if (!app.completedReview) return "";
  const score = app.completedReview.accuracy === null ? "本轮以主观题自评为主" : `客观题正确率 ${app.completedReview.accuracy}%`;
  return `
    <div class="answer-box">
      <h3>本轮完整复习已记录</h3>
      <p>${score}，共完成 ${app.completedReview.answered} / ${app.completedReview.total} 题。刷新页面后会从新一轮开始。</p>
      <div class="actions">
        <button class="primary-action" data-action="practice">开始新一轮</button>
        <button class="ghost-action" data-view="stats">查看复习记录</button>
      </div>
    </div>
  `;
}

function renderAnswerBox(question, result) {
  if (!isObjective(question)) {
    return `
      <div class="answer-box">
        <h3>参考答案</h3>
        <div class="reference-answer">${formatSubjectiveAnswer(question.referenceAnswer || question.answer)}</div>
        ${selfButtons(question)}
      </div>
    `;
  }
  const rawAnswer = Array.isArray(question.answer) ? question.answer.join("") : question.answer;
  const answer = question.type === "judge" ? `${rawAnswer}（${question.options?.[rawAnswer] || question.referenceAnswer || ""}）` : rawAnswer;
  const className = result.correct === false ? "answer-box is-wrong" : "answer-box";
  return `
    <div class="${className}">
      <h3>${result.correct === null ? "参考答案" : result.correct ? "回答正确" : "回答错误"}</h3>
      <p><strong>正确答案：</strong>${escapeHtml(answer)}</p>
      <p><strong>解析：</strong>${escapeHtml(question.explanation)}</p>
      ${question.memoryTip ? `<p><strong>记忆方法：</strong>${escapeHtml(question.memoryTip)}</p>` : ""}
    </div>
  `;
}

function formatSubjectiveAnswer(answer) {
  const lines = String(answer || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return "<p>暂无参考答案。</p>";
  const compact = lines
    .map((line) => line.replace(/^[-•]\s*/, ""))
    .filter((line, index, array) => array.indexOf(line) === index);
  return `<ol>${compact.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ol>`;
}

function selfButtons(question) {
  const value = progress.self[question.id] || "";
  return `<div class="actions">
    ${["已掌握", "不确定", "未掌握"].map((label) => `<button class="small-action ${value === label ? "primary-action" : ""}" data-self="${label}">${label}</button>`).join("")}
  </div>`;
}

function renderSideInfo(question) {
  const attempt = progress.attempts[question.id];
  const wrong = progress.wrong[question.id];
  return `
    <h3>本题状态</h3>
    <div class="progress-list">
      <div class="list-row"><span class="muted">练习次数</span><strong>${attempt?.total || 0}</strong></div>
      <div class="list-row"><span class="muted">答对次数</span><strong>${attempt?.correct || 0}</strong></div>
      <div class="list-row"><span class="muted">错题记录</span><strong>${wrong && !wrong.resolvedAt ? `待复习 ${wrong.count} 次` : "暂无"}</strong></div>
    </div>
  `;
}

function renderWrong() {
  const wrongIds = Object.entries(progress.wrong)
    .filter(([, item]) => !item.resolvedAt)
    .map(([id]) => id);
  main.innerHTML = `
    <section class="panel full-width">
      <div class="toolbar">
        <div>
          <h2>错题本</h2>
          <p class="muted">只显示仍未重新答对的题目。</p>
        </div>
        <button class="primary-action" data-action="practice-wrong" ${wrongIds.length ? "" : "disabled"}>开始错题练习</button>
      </div>
      ${wrongIds.length ? `<div class="wrong-list">${wrongIds.map((id) => wrongRow(byId(id))).join("")}</div>` : `<div class="empty">还没有待复习错题。</div>`}
    </section>
  `;
}

function wrongRow(question) {
  if (!question) return "";
  const item = progress.wrong[question.id];
  return `<div class="list-row">
    <strong>${TYPE_LABELS[question.type]} · ${escapeHtml(question.question.slice(0, 90))}</strong>
    <span class="muted">错误 ${item.count} 次 · ${question.tags.join("、")}</span>
  </div>`;
}

function renderExam() {
  if (!app.exam && progress.activeExam) {
    app.exam = progress.activeExam;
  }
  if (!app.exam) {
    main.innerHTML = `
      <section class="panel full-width">
        <h2>模拟考试</h2>
        <p class="muted">随机抽题，客观题自动评分；简答和综合题交卷后查看参考答案并自评。</p>
        <div class="filter-row">
          <select class="select" data-control="exam-size">
            <option value="30">30 题</option>
            <option value="50">50 题</option>
            <option value="all">全部题目</option>
          </select>
          <select class="select" data-control="exam-minutes">
            <option value="45">45 分钟</option>
            <option value="60">60 分钟</option>
            <option value="90">90 分钟</option>
          </select>
          <button class="primary-action" data-action="begin-exam">开始考试</button>
        </div>
      </section>
    `;
    return;
  }
  const exam = app.exam;
  const question = byId(exam.ids[exam.index]);
  main.innerHTML = `
    <section class="question-panel">
      <div class="exam-header">
        <strong>第 ${exam.index + 1} / ${exam.ids.length} 题</strong>
        <span class="muted">${exam.submitted ? "已交卷" : `剩余 ${formatTime(remainingSeconds(exam))}`}</span>
        <button class="danger-action" data-action="submit-exam">${exam.submitted ? "查看报告" : "交卷"}</button>
      </div>
      ${renderExamQuestion(question)}
      <div class="actions">
        <button class="ghost-action" data-action="exam-prev" ${exam.index === 0 ? "disabled" : ""}>上一题</button>
        <button class="ghost-action" data-action="exam-next" ${exam.index === exam.ids.length - 1 ? "disabled" : ""}>下一题</button>
      </div>
    </section>
    <aside class="side-panel">${renderExamSide()}</aside>
  `;
}

function renderExamQuestion(question) {
  const saved = app.exam.answers[question.id];
  app.selected = Array.isArray(saved) ? saved : saved ? [saved] : [];
  app.subjectiveDraft = app.exam.subjective[question.id] || "";
  app.checked = app.exam.submitted ? { correct: grade(question, saved) } : null;
  return renderQuestion(question, "exam");
}

function renderExamSide() {
  const exam = app.exam;
  if (exam.submitted) return examReport(exam);
  const answered = exam.ids.filter((id) => exam.answers[id] || exam.subjective[id]).length;
  return `
    <h3>考试进度</h3>
    <div class="bar"><span style="width:${Math.round((answered / exam.ids.length) * 100)}%"></span></div>
    <p class="muted">${answered} / ${exam.ids.length} 题已作答</p>
  `;
}

function examReport(exam) {
  const objective = exam.ids.map(byId).filter(isObjective);
  const correct = objective.filter((q) => grade(q, exam.answers[q.id])).length;
  const score = objective.length ? Math.round((correct / objective.length) * 100) : 0;
  return `
    <h3>考试报告</h3>
    <div class="metric"><span>客观题得分</span><strong>${score}</strong></div>
    <p class="muted">客观题 ${correct} / ${objective.length}。主观题请根据参考答案自评。</p>
    <button class="ghost-action" data-action="finish-exam">结束考试</button>
  `;
}

function renderStats() {
  const rows = Object.entries(TYPE_LABELS).map(([type, label]) => {
    const ids = questions.filter((q) => q.type === type).map((q) => q.id);
    const attempts = ids.map((id) => progress.attempts[id]).filter(Boolean);
    const done = attempts.reduce((sum, item) => sum + item.total, 0);
    const correct = attempts.reduce((sum, item) => sum + item.correct, 0);
    const rate = done ? Math.round((correct / done) * 100) : 0;
    return `<div class="list-row"><strong>${label}</strong><div class="bar"><span style="width:${rate}%"></span></div><span class="muted">${done} 次练习 · 正确率 ${rate}%</span></div>`;
  }).join("");
  const reviews = progress.reviewSessions || [];
  main.innerHTML = `
    <section class="panel">
      <h2>学习统计</h2>
      <div class="progress-list">${rows}</div>
    </section>
    <aside class="side-panel">
      <h3>复习记录</h3>
      ${reviews.length ? `<div class="progress-list">${reviews.slice(0, 12).map(reviewRow).join("")}</div>` : `<div class="empty">还没有完整复习记录。</div>`}
    </aside>
  `;
}

function renderData() {
  main.innerHTML = `
    <section class="panel full-width">
      <h2>数据管理</h2>
      <p class="muted">题库随网页部署，学习记录保存在本浏览器。换设备前请导出记录。</p>
      <div class="actions">
        <button class="primary-action" data-action="export-progress">导出学习记录</button>
        <label class="ghost-action">导入学习记录<input hidden type="file" accept="application/json" data-control="import-progress"></label>
        <button class="danger-action" data-action="clear-progress">清空学习记录</button>
      </div>
      <div class="answer-box"><strong>题库文件</strong><p class="muted">${bank.meta.source} · 共 ${questions.length} 题</p></div>
    </section>
  `;
}

function checkCurrent() {
  const question = currentQuestion();
  let correct = null;
  if (isObjective(question)) {
    const answer = selectedAnswer(question);
    correct = grade(question, answer);
    recordAttempt(question, correct);
    app.checked = { correct };
  } else {
    app.checked = { correct: null };
  }
  if (progress.activeReview && progress.activeReview.queue.includes(question.id)) {
    progress.activeReview.answered[question.id] = {
      correct,
      at: new Date().toISOString(),
    };
    progress.activeReview.current = app.current;
    progress.activeReview.lastAt = new Date().toISOString();
    if (completeActiveReviewIfReady()) {
      app.completedReview = progress.reviewSessions[0];
    }
    saveProgress();
  }
  render();
}

function moveQuestion(delta) {
  app.current = Math.max(0, Math.min(app.queue.length - 1, app.current + delta));
  app.selected = [];
  app.subjectiveDraft = "";
  app.checked = null;
  saveActiveReview();
  render();
}

function beginExam() {
  const sizeValue = document.querySelector('[data-control="exam-size"]')?.value || "30";
  const minutes = Number(document.querySelector('[data-control="exam-minutes"]')?.value || 45);
  const ids = shuffle(questions).slice(0, sizeValue === "all" ? questions.length : Number(sizeValue)).map((q) => q.id);
  app.exam = {
    ids,
    index: 0,
    answers: {},
    subjective: {},
    startedAt: Date.now(),
    minutes,
    submitted: false,
  };
  saveActiveExam();
  render();
}

function submitExam() {
  const exam = app.exam;
  if (!exam || exam.submitted) return;
  exam.submitted = true;
  const objective = exam.ids.map(byId).filter(isObjective);
  const correct = objective.filter((q) => grade(q, exam.answers[q.id])).length;
  const score = objective.length ? Math.round((correct / objective.length) * 100) : 0;
  objective.forEach((q) => recordAttempt(q, grade(q, exam.answers[q.id])));
  progress.exams.unshift({ score, total: objective.length, correct, at: new Date().toISOString() });
  progress.exams = progress.exams.slice(0, 20);
  progress.activeExam = exam;
  saveProgress();
  render();
}

function remainingSeconds(exam) {
  return Math.max(0, exam.minutes * 60 - Math.floor((Date.now() - exam.startedAt) / 1000));
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = String(seconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function exportProgress() {
  const blob = new Blob([JSON.stringify(progress, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "es-study-progress.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-view]");
  if (nav) return setView(nav.dataset.view);

  const option = event.target.closest("[data-option]");
  if (option) {
    const key = option.dataset.option;
    const question = app.exam ? byId(app.exam.ids[app.exam.index]) : currentQuestion();
    if (app.exam?.submitted) return;
    if (!app.exam && activePracticeSession()?.submitted) return;
    if (question.type === "multiple") {
      app.selected = app.selected.includes(key) ? app.selected.filter((item) => item !== key) : [...app.selected, key];
    } else {
      app.selected = [key];
    }
    if (app.exam) {
      app.exam.answers[question.id] = selectedAnswer(question);
      saveActiveExam();
    }
    if (!app.exam) savePracticeAnswer(question);
    app.checked = null;
    render();
    return;
  }

  const self = event.target.closest("[data-self]");
  if (self) {
    progress.self[currentQuestion().id] = self.dataset.self;
    saveProgress();
    render();
    return;
  }

  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  if (action === "open-review-session") {
    openReviewSession(event.target.closest("[data-session-id]")?.dataset.sessionId);
    return;
  }
  if (action === "delete-review-session") {
    deleteReviewSession(event.target.closest("[data-session-id]")?.dataset.sessionId);
    return;
  }
  if (action === "practice") startPractice();
  if (action === "resume-review") resumeReview();
  if (action === "abandon-review" && confirm("确定放弃当前这一轮复习吗？本次会记录为中途放弃。")) abandonActiveReview();
  if (action === "wrong") setView("wrong");
  if (action === "reset-practice") startPractice();
  if (action === "check") checkCurrent();
  if (action === "reveal-answer") revealCurrentAnswer();
  if (action === "submit-review") submitActiveReview();
  if (action === "prev") moveQuestion(-1);
  if (action === "next") moveQuestion(1);
  if (action === "practice-wrong") {
    const wrongQuestions = Object.entries(progress.wrong).filter(([, item]) => !item.resolvedAt).map(([id]) => byId(id)).filter(Boolean);
    startPractice(wrongQuestions);
  }
  if (action === "start-exam") setView("exam");
  if (action === "begin-exam") beginExam();
  if (action === "exam-prev" && app.exam) {
    app.exam.index -= 1;
    saveActiveExam();
    render();
  }
  if (action === "exam-next" && app.exam) {
    app.exam.index += 1;
    saveActiveExam();
    render();
  }
  if (action === "submit-exam") submitExam();
  if (action === "finish-exam") {
    app.exam = null;
    progress.activeExam = null;
    saveProgress();
    setView("dashboard");
  }
  if (action === "export-progress") exportProgress();
  if (action === "clear-progress" && confirm("确认清空本浏览器里的学习记录？")) {
    progress = { attempts: {}, wrong: {}, exams: [], self: {}, activeReview: null, reviewSessions: [], reviewDrafts: {}, activeExam: null };
    saveProgress();
    render();
  }
});

document.addEventListener("change", async (event) => {
  const control = event.target.dataset.control;
  if (control === "type") {
    const previous = app.typeFilter;
    if (!confirmPracticeSwitch()) {
      event.target.value = previous;
      return;
    }
    app.typeFilter = event.target.value;
    startPractice(questions, { recordAbandoned: false, restoreDraft: true });
  }
  if (control === "order") {
    const previous = app.order;
    if (!confirmPracticeSwitch()) {
      event.target.value = previous;
      return;
    }
    app.order = event.target.value;
    startPractice(questions, { recordAbandoned: false, restoreDraft: true });
  }
  if (control === "import-progress") {
    const file = event.target.files?.[0];
    if (!file) return;
    progress = JSON.parse(await file.text());
    saveProgress();
    render();
  }
});

document.addEventListener("input", (event) => {
  if (event.target.dataset.control !== "subjective") return;
  const text = event.target.value;
  if (app.exam) {
    const question = byId(app.exam.ids[app.exam.index]);
    app.exam.subjective[question.id] = text;
    saveActiveExam();
  } else {
    app.subjectiveDraft = text;
    savePracticeAnswer(currentQuestion());
  }
});

setInterval(() => {
  if (app.view === "exam" && app.exam && !app.exam.submitted) render();
}, 1000);

document.querySelector('[data-action="start-exam"]').addEventListener("click", () => setView("exam"));
render();
