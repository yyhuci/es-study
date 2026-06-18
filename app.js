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
      ...(JSON.parse(localStorage.getItem(STORE_KEY)) || {}),
    };
  } catch {
    return { attempts: {}, wrong: {}, exams: [], self: {} };
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

function startPractice(sourceQuestions = questions) {
  const filtered = sourceQuestions.filter((q) => app.typeFilter === "all" || q.type === app.typeFilter);
  app.queue = (app.order === "random" ? shuffle(filtered) : filtered).map((q) => q.id);
  app.current = 0;
  app.selected = [];
  app.subjectiveDraft = "";
  app.checked = null;
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
      <div class="actions">
        <button class="primary-action" data-action="practice">开始练习</button>
        <button class="ghost-action" data-action="wrong">复习错题</button>
        <button class="ghost-action" data-action="start-exam">模拟考试</button>
      </div>
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

function renderPractice() {
  if (!app.queue.length) startPractice();
  const question = currentQuestion();
  main.innerHTML = `
    <section class="question-panel">
      ${practiceToolbar()}
      ${renderQuestion(question)}
      ${renderPracticeActions(question)}
    </section>
    <aside class="side-panel">
      ${renderSideInfo(question)}
    </aside>
  `;
}

function practiceToolbar() {
  return `
    <div class="toolbar">
      <div>
        <h2>专项练习</h2>
        <p class="muted">第 ${app.current + 1} / ${app.queue.length} 题</p>
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
  const canCheck = isObjective(question) ? app.selected.length > 0 : true;
  return `
    <div class="actions">
      <button class="ghost-action" data-action="prev" ${app.current === 0 ? "disabled" : ""}>上一题</button>
      <button class="primary-action" data-action="check" ${canCheck ? "" : "disabled"}>${isObjective(question) ? "检查答案" : "查看参考答案"}</button>
      <button class="ghost-action" data-action="next">下一题</button>
    </div>
  `;
}

function renderAnswerBox(question, result) {
  const answer = Array.isArray(question.answer) ? question.answer.join("") : question.answer;
  const className = result.correct === false ? "answer-box is-wrong" : "answer-box";
  return `
    <div class="${className}">
      <h3>${result.correct === null ? "参考答案" : result.correct ? "回答正确" : "回答错误"}</h3>
      <p><strong>正确答案：</strong>${escapeHtml(answer)}</p>
      ${question.referenceAnswer && !isObjective(question) ? `<div class="reference-answer">${escapeHtml(question.referenceAnswer)}</div>` : ""}
      <p><strong>解析：</strong>${escapeHtml(question.explanation)}</p>
      ${!isObjective(question) ? selfButtons(question) : ""}
    </div>
  `;
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
  main.innerHTML = `<section class="panel full-width"><h2>学习统计</h2><div class="progress-list">${rows}</div></section>`;
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
  if (isObjective(question)) {
    const answer = selectedAnswer(question);
    const correct = grade(question, answer);
    recordAttempt(question, correct);
    app.checked = { correct };
  } else {
    app.checked = { correct: null };
  }
  render();
}

function moveQuestion(delta) {
  app.current = Math.max(0, Math.min(app.queue.length - 1, app.current + delta));
  app.selected = [];
  app.subjectiveDraft = "";
  app.checked = null;
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
    if (question.type === "multiple") {
      app.selected = app.selected.includes(key) ? app.selected.filter((item) => item !== key) : [...app.selected, key];
    } else {
      app.selected = [key];
    }
    if (app.exam) app.exam.answers[question.id] = selectedAnswer(question);
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
  if (action === "practice") startPractice();
  if (action === "wrong") setView("wrong");
  if (action === "reset-practice") startPractice();
  if (action === "check") checkCurrent();
  if (action === "prev") moveQuestion(-1);
  if (action === "next") moveQuestion(1);
  if (action === "practice-wrong") {
    const wrongQuestions = Object.entries(progress.wrong).filter(([, item]) => !item.resolvedAt).map(([id]) => byId(id)).filter(Boolean);
    app.queue = wrongQuestions.map((q) => q.id);
    app.current = 0;
    app.selected = [];
    app.checked = null;
    setView("practice");
  }
  if (action === "start-exam") setView("exam");
  if (action === "begin-exam") beginExam();
  if (action === "exam-prev" && app.exam) {
    app.exam.index -= 1;
    render();
  }
  if (action === "exam-next" && app.exam) {
    app.exam.index += 1;
    render();
  }
  if (action === "submit-exam") submitExam();
  if (action === "finish-exam") {
    app.exam = null;
    setView("dashboard");
  }
  if (action === "export-progress") exportProgress();
  if (action === "clear-progress" && confirm("确认清空本浏览器里的学习记录？")) {
    progress = { attempts: {}, wrong: {}, exams: [], self: {} };
    saveProgress();
    render();
  }
});

document.addEventListener("change", async (event) => {
  const control = event.target.dataset.control;
  if (control === "type") {
    app.typeFilter = event.target.value;
    startPractice();
  }
  if (control === "order") {
    app.order = event.target.value;
    startPractice();
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
  } else {
    app.subjectiveDraft = text;
  }
});

setInterval(() => {
  if (app.view === "exam" && app.exam && !app.exam.submitted) render();
}, 1000);

document.querySelector('[data-action="start-exam"]').addEventListener("click", () => setView("exam"));
render();
