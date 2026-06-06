import { formatDateTime as formatDateTimeValue, formatLongDate as formatLongDateValue, formatMonthName, moneyFormatter } from "./src/modules/formatters.js";
import { canRoleAction, canRoleRecordAction } from "./src/modules/permissions.js";
import { nextOfficialNumber, periodKey, previewPeriodCode, reservePreviewedPeriodCode, syncCounterFromCode } from "./src/modules/numberingService.js";
import { exportClientStatementPdf, exportGenericPdf, exportInvoicePdf, exportQuotationPdf, exportReceiptPdf, exportReportExcel } from "./src/modules/exportBackendService.js";
import { accountName as lookupAccountName, clientName as lookupClientName, clientSnapshotFromEntry as buildClientSnapshot, projectLabel as lookupProjectLabel, quotationClientName as lookupQuotationClientName, serviceName as lookupServiceName, supplierName as lookupSupplierName } from "./src/modules/clientProjectUtils.js";
import { buildDashboardModel, inPeriod as isDateInPeriod, selectedPeriod as resolveSelectedPeriod } from "./src/modules/dashboardUtils.js";
import { decorateResponsiveTables, filterTableRows, miniReportTable as renderMiniReportTable, tableHtml as renderTableHtml } from "./src/modules/tableUtils.js";
import { auditChangeRows, auditOptions, filterAuditEntries, formatAuditValue as formatAuditDisplayValue, parseAuditValue, summarizeAuditEntry } from "./src/modules/auditUtils.js";
import { backupCountRows, backupCounts, backupFilename, createBackupEnvelope, parseBackupText } from "./src/modules/backupRecovery.js";
import { buildFrontendPdfBlob } from "./src/modules/frontendPdfExport.js";
import { buildFrontendExcelBlob } from "./src/modules/frontendExcelExport.js";
import { templateForPayload } from "./src/modules/documentTemplates.js";
import { validateExcelBlob, validatePdfBlob } from "./src/modules/exportValidation.js";

(async function () {
  const money = moneyFormatter;
  const qs = (selector, scope = document) => scope.querySelector(selector);
  const qsa = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

  let state = await CGM.load();
  let isSaving = false;
  let appError = window.CGMDatabaseError || "";
  let activePortal = "";
  let activeView = "dashboard";
  let quickFabOpen = false;
  let dashboardFilter = {
    mode: "month",
    month: CGM.today().slice(0, 7),
    quarter: `${new Date(CGM.today()).getFullYear()}-Q${Math.floor(new Date(CGM.today()).getMonth() / 3) + 1}`,
    year: String(new Date(CGM.today()).getFullYear()),
  };
  let auditFilters = { action: "", module: "", fromDate: "", toDate: "" };

  const sensitiveTypes = ["invoice", "payment", "receipt", "expense", "supplierBill", "supplierPayment", "journal", "cashTransaction", "settings"];
  let pendingConfirmAction = null;

  function currentUser() {
    return state.users.find((user) => user.id === state.currentUserId) || state.users[0] || { name: "System", role: "Super Admin" };
  }

  function can(action) {
    return canRoleAction(currentUser().role, action);
  }

  function canRecordAction(typeName, action, record = null) {
    return canRoleRecordAction(currentUser().role, action, CGM.statusOf(record, "active"));
  }

  function requirePermission(typeName, action, record = null) {
    if (canRecordAction(typeName, action, record)) return true;
    notify("Action restricted", `Your current role (${currentUser().role}) cannot ${action.replaceAll("-", " ")} ${title(typeName)} records.`, "error");
    return false;
  }

  function addAudit(action, recordType, recordId, beforeValue, afterValue, reason = "") {
    const user = currentUser();
    state.auditLog = state.auditLog || [];
    const entry = {
      id: CGM.uid(),
      at: new Date().toISOString(),
      userId: user.id,
      userName: user.name,
      role: user.role,
      recordType,
      recordId,
      action,
      oldValue: compactJson(beforeValue),
      newValue: compactJson(afterValue),
      reason,
    };
    state.auditLog.unshift(entry);
    return entry;
  }

  function compactJson(value) {
    if (value === undefined) return "";
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }

  async function save(audit = null) {
    if (isSaving) {
      notify("Save already in progress", "Please wait for the current save to finish before trying again.", "warning");
      return false;
    }
    const auditEntry = audit?.action ? addAudit(audit.action, audit.recordType, audit.recordId, audit.before, audit.after, audit.reason) : null;
    isSaving = true;
    appError = "";
    render();
    try {
      await CGM.save(state);
      if (audit?.action) notify("Saved successfully", `${title(audit.recordType || "record")} changes have been saved.`, "success");
      return true;
    } catch (error) {
      console.error("Supabase save failed", error);
      appError = userMessageForError(error, "save");
      if (auditEntry) state.auditLog = (state.auditLog || []).filter((entry) => entry.id !== auditEntry.id);
      notify("Save failed", appError, "error");
      return false;
    } finally {
      isSaving = false;
      render();
    }
  }

  function notify(titleText, message = "", tone = "success") {
    let host = qs("#toastHost");
    if (!host) {
      host = document.createElement("div");
      host.id = "toastHost";
      host.className = "toast-host";
      document.body.appendChild(host);
    }
    const toast = document.createElement("article");
    toast.className = `toast ${tone}`;
    toast.innerHTML = `<strong>${esc(titleText)}</strong>${message ? `<span>${esc(message)}</span>` : ""}`;
    host.appendChild(toast);
    setTimeout(() => toast.classList.add("show"), 20);
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 220);
    }, 4200);
  }

  function userMessageForError(error, area = "general") {
    const raw = String(error?.message || error || "");
    console.info(`CGM ${area} technical detail:`, error);
    if (/foreign key|_fkey|violates foreign key constraint|projects_client_id|invoices_project_id/i.test(raw)) {
      if (/quotation/i.test(area)) return "Quotation could not be saved because the linked client or project information is incomplete. Review the quotation details and try again.";
      if (/invoice|transfer/i.test(area)) return "Invoice could not be completed because the linked client or project record was not saved correctly. Please check the quotation details and try again.";
      return "This record could not be saved because linked client or project information is incomplete. Please review the details and try again.";
    }
    if (/fetch|network|failed to fetch|load failed/i.test(raw)) return "The business database or export service could not be reached. Check your connection and try again.";
    if (/duplicate|unique|already exists/i.test(raw)) return "This record number already exists. Refresh the app and try again so a safe new number can be reserved.";
    if (/permission|row level security|rls|unauthorized|403/i.test(raw)) return "Your current login or database permissions do not allow this action.";
    if (/VITE_EXPORT_API_BASE_URL|Export backend URL/i.test(raw)) return "The export backend is not configured. Add VITE_EXPORT_API_BASE_URL before using professional exports.";
    if (/VITE_SUPABASE|supabase/i.test(raw)) return "Supabase is not configured correctly. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.";
    if (area === "restore") return "The selected backup could not be restored. Confirm it is a Civil-Gineer Masta backup file and try again.";
    if (area === "export") return "The professional export could not be generated. Please try again after checking the export backend.";
    return raw || "The action could not be completed. Please try again.";
  }

  function openPortal(portal) {
    activePortal = portal;
    qs("#landingView").hidden = true;
    qs("#appShell").hidden = false;
    document.body.dataset.portal = portal;
    qsa(".nav-item").forEach((button) => {
      button.hidden = Boolean(button.dataset.portal) && button.dataset.portal !== portal;
    });
    setView(portal === "bookkeeping" ? "bookDashboard" : "dashboard");
  }

  function showLanding() {
    activePortal = "";
    qs("#appShell").hidden = true;
    qs("#landingView").hidden = false;
    if (window.lucide) lucide.createIcons();
  }

  function accountOptions(types = []) {
    return state.accounts
      .filter((account) => !types.length || types.includes(account.type) || types.includes(account.category))
      .map((account) => `<option value="${account.id}">${account.code} - ${esc(account.name)}</option>`)
      .join("");
  }

  function clientOptions(selected = "") {
    return state.clients.map((client) => `<option value="${client.id}" ${client.id === selected ? "selected" : ""}>${esc(client.name)}</option>`).join("");
  }

  function supplierOptions(selected = "") {
    return state.suppliers.map((supplier) => `<option value="${supplier.id}" ${supplier.id === selected ? "selected" : ""}>${esc(supplier.name)}</option>`).join("");
  }

  function serviceOptions(selected = "") {
    return (state.services || []).map((service) => `<option value="${service.id}" ${service.id === selected ? "selected" : ""}>${esc(service.name)}</option>`).join("");
  }

  function projectOptions(selected = "") {
    const options = [`<option value="">Create / unassigned project</option>`];
    options.push(...(state.projects || []).map((project) => `<option value="${project.id}" ${project.id === selected ? "selected" : ""}>${esc(project.code)} - ${esc(project.name)}</option>`));
    return options.join("");
  }

  function settings() {
    state.settings = { ...CGM.defaultSettings(), ...(state.settings || {}) };
    state.settings.companyProfile = { ...CGM.defaultSettings().companyProfile, ...(state.settings.companyProfile || {}) };
    state.settings.documentSettings = { ...CGM.defaultSettings().documentSettings, ...(state.settings.documentSettings || {}) };
    state.settings.presets = { ...CGM.defaultSettings().presets, ...(state.settings.presets || {}) };
    state.settings.preferences = { ...CGM.defaultSettings().preferences, ...(state.settings.preferences || {}) };
    return state.settings;
  }

  function signatorySnapshot(profile) {
    if (!profile) return null;
    return {
      id: profile.id,
      name: profile.name || "",
      title: profile.title || "Authorised Signatory",
      signatureImage: profile.signatureImage || "",
    };
  }

  function defaultDocumentSignatories(includeApproved = true) {
    const config = settings().documentSignatories;
    const prepared = config.profiles.find((profile) => profile.id === config.preparedById && profile.active !== false);
    const approved = config.profiles.find((profile) => profile.id === config.approvedById && profile.active !== false);
    return {
      preparedBy: signatorySnapshot(prepared),
      approvedBy: includeApproved ? signatorySnapshot(approved) : null,
    };
  }

  function activeItems(items, includeArchived = false) {
    return (items || []).filter((item) => includeArchived || CGM.isActiveRecord(item));
  }

  function statusBadge(record, fallback = "active") {
    return badge(record?.status || fallback);
  }

  function amountDueInvoice(invoice) {
    return Math.max(0, CGM.documentTotal(invoice) - CGM.invoicePaid(state, invoice.id));
  }

  function actionButtons(typeName, item, options = {}) {
    const status = CGM.statusOf(item, options.fallbackStatus || "active");
    const isInactive = !CGM.isActiveRecord(item);
    const preview = options.document && canRecordAction(typeName, "preview", item)
      ? rowAction("secondary-button", `data-preview-document="${typeName}" data-id="${item.id}"`, "eye", "Preview")
      : "";
    const download = options.document && canRecordAction(typeName, "export", item)
      ? rowAction("secondary-button", `data-export-document="${typeName}" data-id="${item.id}" data-format="pdf"`, "file-down", "PDF")
      : "";
    const restore = isInactive && canRecordAction(typeName, "restore", item) ? rowAction("secondary-button", `data-record-restore="${typeName}" data-id="${item.id}"`, "rotate-ccw", "Restore") : "";
    const voidLabel = ["invoice", "payment", "receipt"].includes(typeName) ? "Void" : "Archive";
    const voidButton = isInactive || !canRecordAction(typeName, voidLabel.toLowerCase(), item) ? "" : rowAction("danger-button", `data-record-void="${typeName}" data-id="${item.id}"`, "ban", voidLabel);
    const duplicate = options.duplicate && canRecordAction(typeName, "create", item) ? rowAction("secondary-button", `data-record-duplicate="${typeName}" data-id="${item.id}"`, "copy", "Duplicate") : "";
    const edit = canRecordAction(typeName, "edit", item) ? rowAction("secondary-button", `data-record-edit="${typeName}" data-id="${item.id}"`, "pencil", "Edit") : "";
    const history = status === "archived" ? `<span class="muted">Archived</span>` : "";
    const content = `
      ${edit}
      ${duplicate}
      ${preview}
      ${download}
      ${voidButton}
      ${restore}
      ${history}
    `;
    return options.wrap === false ? content : `<div class="row-actions">${content}</div>`;
  }

  function restoreState(snapshot) {
    state = snapshot;
    isSaving = false;
    render();
  }

  async function saveOrRollback(snapshot, audit) {
    const saved = await save(audit);
    if (!saved) restoreState(snapshot);
    return saved;
  }

  function rowAction(className, attrs, icon, label) {
    return `<button class="${className} compact-action" ${attrs} title="${esc(label)}" aria-label="${esc(label)}"><i data-lucide="${icon}"></i><span class="action-text">${esc(label)}</span></button>`;
  }

  function setView(view) {
    activeView = view;
    quickFabOpen = false;
    qsa(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view && (!button.dataset.portal || button.dataset.portal === activePortal)));
    qsa(".view").forEach((section) => section.classList.toggle("active", section.id === `${view}View`));
    qs("#pageTitle").textContent = title(view);
    qs("#workspaceLabel").textContent = activePortal === "bookkeeping" ? "Front-office bookkeeping" : "Accounting management";
    const workspacePill = qs("#workspacePill");
    if (workspacePill) {
      workspacePill.textContent = activePortal === "bookkeeping" ? "Bookkeeping / Admin" : "Accounting Management";
      workspacePill.dataset.workspace = activePortal;
    }
    qs(".sidebar").classList.remove("open");
    render();
  }

  function render() {
    renderBookkeepingPortal();
    renderDashboard();
    renderAccounts();
    renderClients();
    renderSuppliers();
    renderSales();
    renderExpenses();
    renderProjects();
    renderCashbook();
    renderLedger();
    renderJournals();
    renderReports();
    renderSettings();
    renderAudit();
    renderHelp();
    renderDataStatus();
    bindItemEditors();
    decorateTables();
    renderQuickFab();
    if (window.lucide) lucide.createIcons();
  }

  function quickActionsForView() {
    if (activePortal === "bookkeeping") {
      return [
        ["quote", "New Quote", "file-plus-2", "capture"],
        ["invoice", "New Invoice", "file-text", "capture"],
        ["receipt", "Receipt", "receipt", "capture"],
        ["expense", "Expense", "wallet-cards", "capture"],
      ];
    }
    if (activePortal === "management" && activeView === "dashboard") {
      return [
        ["clients", "Add Client", "user-plus"],
        ["sales", "Sales", "file-text"],
        ["expenses", "Expense", "wallet-cards"],
        ["reports", "Reports", "chart-column"],
      ];
    }
    return [];
  }

  function renderQuickFab() {
    const fab = qs("#quickFab");
    const menu = qs("#quickFabMenu");
    const toggle = qs("#quickFabToggle");
    if (!fab || !menu || !toggle) return;
    const actions = quickActionsForView();
    fab.hidden = !activePortal || !actions.length;
    fab.classList.toggle("open", quickFabOpen && actions.length > 0);
    toggle.setAttribute("aria-expanded", String(quickFabOpen && actions.length > 0));
    menu.innerHTML = actions.map(([target, label, icon, mode]) => `<button class="quick-fab-item" ${mode === "capture" ? `data-book-capture="${target}"` : `data-go-view="${target}"`}><i data-lucide="${icon}"></i><span>${esc(label)}</span></button>`).join("");
  }

  function openBookkeepingCapture(kind) {
    const targets = {
      quote: ["bookQuoteForm", "clientName"],
      invoice: ["bookInvoiceForm", "clientName"],
      receipt: ["bookReceiptForm", "invoiceId"],
      expense: ["bookExpenseForm", "vendor"],
    };
    const target = targets[kind];
    if (!target) return;
    if (activePortal !== "bookkeeping" || activeView !== "bookDashboard") setView("bookDashboard");
    setTimeout(() => {
      const form = qs(`#${target[0]}`);
      if (!form) return;
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      form.classList.add("form-focus-pulse");
      setTimeout(() => form.classList.remove("form-focus-pulse"), 1200);
      qs(`[name="${target[1]}"]`, form)?.focus?.();
    }, 80);
  }

  function closeQuickFab() {
    if (!quickFabOpen) return;
    quickFabOpen = false;
    renderQuickFab();
    if (window.lucide) lucide.createIcons();
  }

  function renderDataStatus() {
    let status = qs("#dataStatus");
    if (!status) {
      status = document.createElement("div");
      status.id = "dataStatus";
      status.className = "data-status";
      qs(".topbar")?.appendChild(status);
    }
    status.hidden = !isSaving && !appError;
    status.className = `data-status ${appError ? "error" : ""}`;
    status.textContent = appError || (isSaving ? "Saving to Supabase..." : "");
  }

  function decorateTables() {
    decorateResponsiveTables(document);
  }

  function renderDashboard() {
    const d = dashboardModel();
    qs("#dashboardView").innerHTML = `
      <section class="panel dashboard-period">
        <div>
          <p class="eyebrow">Today</p>
          <h2>${formatLongDate(CGM.today())}</h2>
          <p class="muted">${d.period.label} | Financial year ${d.financialYear}</p>
        </div>
        <div class="period-controls">
          <label class="field">View
            <select id="dashboardMode">
              <option value="month" ${dashboardFilter.mode === "month" ? "selected" : ""}>Month</option>
              <option value="quarter" ${dashboardFilter.mode === "quarter" ? "selected" : ""}>Quarter</option>
              <option value="year" ${dashboardFilter.mode === "year" ? "selected" : ""}>Year</option>
            </select>
          </label>
          <label class="field ${dashboardFilter.mode === "month" ? "" : "hidden-control"}">Month
            <input id="dashboardMonth" type="month" value="${dashboardFilter.month}">
          </label>
          <label class="field ${dashboardFilter.mode === "quarter" ? "" : "hidden-control"}">Quarter
            <select id="dashboardQuarter">${quarterOptions()}</select>
          </label>
          <label class="field ${dashboardFilter.mode === "year" ? "" : "hidden-control"}">Year
            <select id="dashboardYear">${yearOptions()}</select>
          </label>
          <div class="export-actions dashboard-export">
            <button class="secondary-button" data-export-report="dashboard-summary" data-format="pdf"><i data-lucide="file-down"></i>Export PDF</button>
            <button class="secondary-button" data-export-report="dashboard-summary" data-format="excel"><i data-lucide="sheet"></i>Export Excel</button>
          </div>
        </div>
      </section>
      <div class="metrics-grid dashboard-grid">
        ${metric("Total invoiced this period", d.periodInvoiced)}
        ${metric("Payments received this period", d.periodPayments)}
        ${metric("Expenses this period", d.periodExpenses)}
        ${metric("Net cash this period", d.periodNetCash)}
        ${metric("Outstanding debtors", d.debtors)}
        ${metric("Creditors owing", d.creditors)}
        ${metric("Net profit/loss", d.netProfitLoss)}
        ${metric("Bank + cash balance", d.bankCashBalance)}
        ${metric("Overdue invoices", d.overdueCount, false)}
      </div>
      <div class="grid-two">
        <section class="panel">
          <div class="table-head"><div><h2>Business health</h2><p>Based on cash flow, overdue debtors, expense pressure, profit, and unpaid invoices.</p></div>${healthBadge(d.health)}</div>
          <div class="health-score"><strong>${d.health.score}/100</strong><span>${esc(d.health.status)}</span></div>
          ${miniReportTable("Decision summary", d.decisionRows, ["Area", "Summary"])}
        </section>
        <section class="panel">
          <div class="table-head"><div><h2>Alerts</h2><p>Practical issues that need management attention.</p></div></div>
          <div class="alert-list">${d.alerts.map((alert) => `<article class="alert-item ${alert.level}"><strong>${esc(alert.title)}</strong><p>${esc(alert.message)}</p></article>`).join("")}</div>
        </section>
      </div>
      <section class="panel">
        <div class="section-head"><div><h2>Record supplier bill</h2><p>Creates or finds the supplier record, then posts the bill to Creditors Control.</p></div></div>
        <form id="bookSupplierBillForm" class="form-grid">
          ${input("supplierName", "Supplier name", "text", true)}
          ${input("email", "Supplier email", "email")}
          ${input("phone", "Supplier phone")}
          ${input("date", "Bill date", "date", true, CGM.today())}
          ${input("dueDate", "Due date", "date", true, CGM.today())}
          ${input("amount", "Bill amount", "number", true, "", "0.01")}
          <label class="field full">Debit account<select name="accountId">${accountOptions(["Expenses", "Assets", "Cost of Sales"])}</select></label>
          <label class="field full">Description<textarea name="description"></textarea></label>
          <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="save"></i>Save supplier bill</button></div>
        </form>
      </section>
      <section class="panel">
        <div class="table-head"><div><h2>Growth and trend graphs</h2><p>Rolling monthly view from invoices, receipts, expenses, creditors, suppliers, and ledger-derived profit.</p></div></div>
        <div class="chart-grid">
          ${barChart("Monthly invoiced amount", d.trends, "invoiced", "positive")}
          ${barChart("Monthly payments received", d.trends, "payments", "positive")}
          ${barChart("Monthly expenses", d.trends, "expenses", "negative")}
          ${barChart("Monthly net cash", d.trends, "netCash", "cash")}
          ${barChart("Monthly profit/loss", d.trends, "profit", "profit")}
          ${groupedBarChart("Debtors vs creditors", d.trends, "debtors", "creditors")}
          ${lineChart("Cash flow trend", d.trends, "cashBalance")}
        </div>
      </section>
      <section class="panel">
        <div class="table-head">
          <div><h2>Accounting framework status</h2><p>Transactions post into the ledger from invoices, receipts, expenses, supplier bills, supplier payments, and journals.</p></div>
        </div>
        ${miniReportTable("Trial balance snapshot", trialRows())}
      </section>
    `;
    bindDashboardFilters();
  }

  function metric(label, value, isMoney = true) {
    return `<article class="metric-card"><span>${label}</span><strong>${isMoney ? money.format(value) : value}</strong></article>`;
  }

  function frontOfficeModel() {
    const month = CGM.today().slice(0, 7);
    const openQuotes = state.quotations.filter((quote) => CGM.isActiveRecord(quote) && !["approved", "invoiced"].includes(quote.status)).length;
    const approvedQuotes = state.quotations.filter((quote) => CGM.isActiveRecord(quote) && quote.status === "approved").length;
    const unpaidInvoices = state.invoices.filter((invoice) => CGM.isPostedInvoice(invoice) && CGM.invoiceStatus(state, invoice) !== "paid").reduce((sum, invoice) => sum + amountDueInvoice(invoice), 0);
    const monthReceipts = state.payments.filter((payment) => CGM.isActiveRecord(payment) && String(payment.date).startsWith(month)).reduce((sum, payment) => sum + CGM.toNumber(payment.amount), 0);
    const monthExpenses = state.expenses.filter((expense) => CGM.isActiveRecord(expense) && String(expense.date).startsWith(month)).reduce((sum, expense) => sum + CGM.toNumber(expense.amount), 0);
    const supplierBillsDue = state.supplierBills.filter((bill) => CGM.isActiveRecord(bill) && CGM.billStatus(state, bill) !== "paid" && (bill.dueDate || bill.date) <= CGM.today()).reduce((sum, bill) => sum + CGM.toNumber(bill.amount) - CGM.supplierBillPaid(state, bill.id), 0);
    const alerts = [];
    if (approvedQuotes) alerts.push({ level: "warning", title: "Approved quotes waiting", message: `${approvedQuotes} approved quotation(s) should be transferred to invoice when work is confirmed.` });
    if (unpaidInvoices) alerts.push({ level: "warning", title: "Payments to follow up", message: `${money.format(unpaidInvoices)} is unpaid on issued invoices.` });
    if (supplierBillsDue) alerts.push({ level: "warning", title: "Supplier bills due", message: `${money.format(supplierBillsDue)} is due to suppliers.` });
    if (!alerts.length) alerts.push({ level: "good", title: "Bookkeeping queue clear", message: "No urgent front-office items need action right now." });
    return { openQuotes, approvedQuotes, unpaidInvoices, monthReceipts, monthExpenses, supplierBillsDue, alerts };
  }

  function quotationWorkflowTable() {
    return `<div class="list-toolbar"><input data-table-search="quotationWorkflow" placeholder="Search quotations by number, client, project, service, or status"></div><div class="table-wrap"><table id="quotationWorkflow" class="workflow-table"><thead><tr><th>Quote</th><th>Client / prospect</th><th>Project</th><th>Service</th><th>Date</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      ${activeItems(state.quotations, true).map((quote) => `<tr>
        <td><strong>${quote.number}</strong><br><span class="muted">${esc(quote.notes || "")}</span></td>
        <td>${esc(quotationClientName(quote))}</td>
        <td>${esc(projectLabel(quote.projectId, quote.projectCode))}</td>
        <td>${esc(serviceName(quote.serviceId))}</td>
        <td>${quote.date}</td>
        <td>${money.format(CGM.documentTotal(quote))}</td>
        <td>${badge(quote.status || "draft")}</td>
        <td class="actions-cell"><div class="row-actions">
          ${rowAction("secondary-button", `data-quote-approve="${quote.id}" ${["approved", "invoiced"].includes(quote.status) ? "disabled" : ""}`, "check", "Approve")}
          ${rowAction("secondary-button", `data-quote-invoice="${quote.id}" ${quote.status !== "approved" ? "disabled" : ""}`, "file-text", "Transfer to invoice")}
          ${actionButtons("quotation", quote, { document: true, duplicate: true, wrap: false })}
        </div></td>
      </tr>`).join("")}
    </tbody></table></div>`;
  }

  function invoiceRegisterTable() {
    return `<div class="list-toolbar"><input data-table-search="bookInvoiceTable" placeholder="Search invoices by number, client, project, service, or status"></div><div class="table-wrap"><table id="bookInvoiceTable"><thead><tr><th>Date</th><th>Invoice</th><th>Client</th><th>Project</th><th>Service</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>
      ${activeItems(state.invoices, true).map((invoice) => `<tr><td>${invoice.date}</td><td>${invoice.number}</td><td>${esc(clientName(invoice.clientId))}</td><td>${esc(projectLabel(invoice.projectId, invoice.projectCode))}</td><td>${esc(serviceName(invoice.serviceId))}</td><td>${money.format(CGM.documentTotal(invoice))}</td><td>${badge(CGM.invoiceStatus(state, invoice))}</td><td>${actionButtons("invoice", invoice, { document: true, duplicate: true })}</td></tr>`).join("")}
    </tbody></table></div>`;
  }

  function receiptRegisterTable() {
    return `<div class="list-toolbar"><input data-table-search="bookReceiptTable" placeholder="Search receipts by number, client, project, service, account, or status"></div><div class="table-wrap"><table id="bookReceiptTable"><thead><tr><th>Date</th><th>Receipt</th><th>Client</th><th>Project</th><th>Service</th><th>Amount</th><th>Deposited to</th><th>Status</th><th></th></tr></thead><tbody>
      ${activeItems(state.payments, true).map((payment) => `<tr><td>${payment.date}</td><td>${payment.receiptNumber}</td><td>${esc(clientName(payment.clientId))}</td><td>${esc(projectLabel(payment.projectId, payment.projectCode))}</td><td>${esc(serviceName(payment.serviceId))}</td><td>${money.format(payment.amount)}</td><td>${esc(accountName(payment.bankAccountId))}</td><td>${statusBadge(payment, "paid")}</td><td>${actionButtons("payment", payment, { document: true })}</td></tr>`).join("")}
    </tbody></table></div>`;
  }

  function costRegisterTable() {
    const rows = [
      ...activeItems(state.expenses, true).map((expense) => ({ type: "expense", item: expense, date: expense.date, label: "Paid expense", party: expense.vendor || expense.category, amount: expense.amount, status: expense.status || "paid" })),
      ...activeItems(state.supplierBills, true).map((bill) => ({ type: "supplierBill", item: bill, date: bill.date, label: "Supplier bill", party: supplierName(bill.supplierId), amount: bill.amount, status: CGM.billStatus(state, bill) })),
    ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return `<div class="list-toolbar"><input data-table-search="bookCostTable" placeholder="Search expenses and supplier bills by party, project, service, amount, or status"></div><div class="table-wrap"><table id="bookCostTable"><thead><tr><th>Date</th><th>Type</th><th>Party</th><th>Project</th><th>Service</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map((row) => `<tr><td>${row.date}</td><td>${row.label}</td><td>${esc(row.party)}</td><td>${esc(projectLabel(row.item.projectId, row.item.projectCode))}</td><td>${esc(serviceName(row.item.serviceId))}</td><td>${money.format(row.amount)}</td><td>${badge(row.status)}</td><td>${actionButtons(row.type, row.item, { document: row.type === "supplierBill" })}</td></tr>`).join("")}
    </tbody></table></div>`;
  }

  function itemEditor(id, label = "Items", items = []) {
    const rows = items.length ? items.map((item) => itemRow(item)).join("") : itemRow();
    return `<div class="items-editor document-items" data-items-editor="${id}">
      <div class="item-editor-head">
        <div>
          <label>${esc(label)}</label>
          <p class="muted">Add each service or cost as a simple line: description, quantity, and rate.</p>
        </div>
        <button class="secondary-button" type="button" data-add-item="${id}"><i data-lucide="plus"></i>Add item</button>
      </div>
      <div class="item-grid item-grid-head"><span>Description</span><span>Service category</span><span>Qty</span><span>Rate</span><span>Total</span><span></span></div>
      <div class="item-rows">
        ${rows}
      </div>
      <div class="item-editor-total"><span>Document total</span><strong data-items-total="${id}">${money.format(0)}</strong></div>
    </div>`;
  }

  function itemRow(item = {}) {
    return `<div class="item-grid doc-item-row">
      <label class="item-cell item-description"><span>Description</span><input name="itemDescription" placeholder="Example: Architectural design service" value="${esc(item.description || "")}" required></label>
      <label class="item-cell item-service"><span>Service category</span><select name="itemServiceId" required>${serviceOptions(item.serviceId || "")}</select></label>
      <label class="item-cell"><span>Qty</span><input name="itemQty" type="number" min="0" step="0.01" value="${esc(item.qty || 1)}" required></label>
      <label class="item-cell"><span>Rate</span><input name="itemRate" type="number" min="0" step="0.01" placeholder="0.00" value="${esc(item.rate || "")}" required></label>
      <label class="item-cell item-total"><span>Total</span><output data-line-total>${money.format(CGM.lineTotal({ qty: item.qty || 1, rate: item.rate || 0 }))}</output></label>
      <button class="icon-button" type="button" data-remove-item aria-label="Remove item"><i data-lucide="trash-2"></i></button>
    </div>`;
  }

  function collectItems(form) {
    return qsa(".doc-item-row", form)
      .map((row) => ({
        description: qs('[name="itemDescription"]', row)?.value.trim() || "",
        serviceId: qs('[name="itemServiceId"]', row)?.value || "",
        qty: CGM.toNumber(qs('[name="itemQty"]', row)?.value),
        rate: CGM.toNumber(qs('[name="itemRate"]', row)?.value),
      }))
      .filter((item) => item.description && item.qty > 0);
  }

  function updateItemEditor(editor) {
    const items = collectItems(editor);
    qsa(".doc-item-row", editor).forEach((row) => {
      const qty = CGM.toNumber(qs('[name="itemQty"]', row)?.value);
      const rate = CGM.toNumber(qs('[name="itemRate"]', row)?.value);
      const line = qs("[data-line-total]", row);
      if (line) line.textContent = money.format(qty * rate);
    });
    const total = qs("[data-items-total]", editor);
    if (total) total.textContent = money.format(CGM.documentTotal({ items }));
  }

  function bindItemEditors(scope = document) {
    qsa("[data-items-editor]", scope).forEach(updateItemEditor);
  }

  function renderBookkeepingPortal() {
    qs("#bookDashboardView").innerHTML = `
      <section class="panel">
        <div class="table-head">
          <div>
            <h2>Bookkeeping entry portal</h2>
            <p>Capture day-to-day documents here. Approved quotations become invoices, and invoices, receipts, expenses, and supplier bills feed the accounting platform automatically.</p>
          </div>
        </div>
        <div class="workflow-strip">
          <span>1. Quote</span><i data-lucide="arrow-right"></i>
          <span>2. Approve</span><i data-lucide="arrow-right"></i>
          <span>3. Convert to invoice</span><i data-lucide="arrow-right"></i>
          <span>4. Record payment</span><i data-lucide="arrow-right"></i>
          <span>5. Ledger + reports update</span>
        </div>
      </section>
      <div class="grid-two">
        <section class="panel">
          <div class="section-head"><div><h2>Create quotation</h2><p>Pick the client, add the work items, then save. Each item carries its service category and the total is calculated for you.</p></div></div>
          <form id="bookQuoteForm" class="form-grid">
            <label class="field full">Existing client / prospect<select name="clientId"><option value="">Use new prospect details below</option>${clientOptions()}</select></label>
            ${input("clientName", "Client / prospect name", "text", false)}
            ${input("contact", "Contact person")}
            ${input("email", "Email", "email")}
            ${input("phone", "Phone")}
            ${input("date", "Quotation date", "date", true, CGM.today())}
            ${input("validUntil", "Valid until", "date", true, CGM.today())}
            <label class="field full">Existing project<select name="projectId">${projectOptions()}</select></label>
            ${generatedInput("projectCode", "Project code", suggestedProjectCode())}
            ${input("projectName", "Project name")}
            ${itemEditor("bookQuoteItems", "Quotation items")}
            <label class="field full">Address<textarea name="address"></textarea></label>
            <label class="field full">Notes<textarea name="notes"></textarea></label>
            <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="save"></i>Save quotation</button></div>
          </form>
        </section>
        <section class="panel">
          <div class="section-head"><div><h2>Quick invoice</h2><p>Create a client invoice from line items. Service categories on the items post to the correct income account.</p></div></div>
          <form id="bookInvoiceForm" class="form-grid">
            <label class="field full">Existing client<select name="clientId"><option value="">Use new client details below</option>${clientOptions()}</select></label>
            ${input("clientName", "Client name", "text", false)}
            ${input("email", "Client email", "email")}
            ${input("phone", "Client phone")}
            ${input("date", "Invoice date", "date", true, CGM.today())}
            ${input("dueDate", "Due date", "date", true, CGM.today())}
            <label class="field full">Existing project<select name="projectId">${projectOptions()}</select></label>
            ${generatedInput("projectCode", "Project code", suggestedProjectCode())}
            ${input("projectName", "Project name")}
            ${itemEditor("bookInvoiceItems", "Invoice items")}
            <label class="field full">Address<textarea name="address"></textarea></label>
            <label class="field full">Notes<textarea name="notes"></textarea></label>
            <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="file-plus-2"></i>Create invoice</button></div>
          </form>
        </section>
      </div>
      <div class="grid-two">
        <section class="panel">
          <div class="section-head"><div><h2>Record receipt / client payment</h2><p>Select the invoice, enter the amount received, and choose where the money was deposited.</p></div></div>
          <form id="bookReceiptForm" class="form-grid">
            <label class="field full">Invoice<select name="invoiceId" required>${openInvoiceOptions()}</select></label>
            ${input("date", "Payment date", "date", true, CGM.today())}
            ${input("amount", "Amount received", "number", true, "", "0.01")}
            ${input("method", "Method", "text", false, "Bank transfer")}
            ${input("reference", "Reference")}
            <label class="field full">Deposit to<select name="bankAccountId">${accountOptions(["Bank accounts", "Cash accounts"])}</select></label>
            <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="receipt"></i>Record receipt</button></div>
          </form>
        </section>
        <section class="panel">
          <div class="section-head"><div><h2>Record paid expense</h2><p>Add cost lines just like an order slip, then choose the project and payment account.</p></div></div>
          <form id="bookExpenseForm" class="form-grid">
            ${input("date", "Date", "date", true, CGM.today())}
            ${input("category", "Category", "text", true)}
            ${input("vendor", "Vendor")}
            <label class="field">Project<select name="projectId">${projectOptions()}</select></label>
            ${itemEditor("bookExpenseItems", "Expense items")}
            <label class="field">Paid from<select name="bankAccountId">${accountOptions(["Bank accounts", "Cash accounts"])}</select></label>
            <label class="field full">Notes<textarea name="description"></textarea></label>
            <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="save"></i>Save expense</button></div>
          </form>
        </section>
      </div>
      <section class="panel">
        <div class="table-head"><div><h2>Quotation workflow</h2><p>Approve a quotation, then transfer it into an invoice. The client account is created at invoice stage.</p></div></div>
        ${quotationWorkflowTable()}
      </section>
      <section class="panel">
        ${miniReportTable("Recent bookkeeping entries", recentBookkeepingRows(), ["Date", "Type", "Document", "Party", "Amount", "Accounting effect"])}
      </section>
    `;
    qs("#bookQuotationsView").innerHTML = `
      <section class="panel">
        <div class="table-head"><div><h2>Quotations</h2><p>Front-office quote register. Create and process quotes from the Bookkeeping Dashboard.</p></div></div>
        ${quotationWorkflowTable()}
      </section>
    `;
    qs("#bookInvoicesView").innerHTML = `
      <section class="panel">
        <div class="table-head"><div><h2>Invoices</h2><p>Invoices transferred from quotes or created directly. These post into Debtors Control and service income accounts.</p></div></div>
        ${invoiceRegisterTable()}
      </section>
    `;
    qs("#bookReceiptsView").innerHTML = `
      <section class="panel">
        <div class="table-head"><div><h2>Receipts</h2><p>Client payments captured by front office. These update Bank/Cash and Debtors Control.</p></div></div>
        ${receiptRegisterTable()}
      </section>
    `;
    qs("#bookExpensesView").innerHTML = `
      <section class="panel">
        <div class="section-head"><div><h2>Record supplier bill</h2><p>Creates or finds the supplier record, then posts the bill to Creditors Control by service and project.</p></div></div>
        <form id="bookSupplierBillForm" class="form-grid">
          ${input("supplierName", "Supplier name", "text", true)}
          ${input("email", "Supplier email", "email")}
          ${input("phone", "Supplier phone")}
          ${input("date", "Bill date", "date", true, CGM.today())}
          ${input("dueDate", "Due date", "date", true, CGM.today())}
          <label class="field">Project<select name="projectId">${projectOptions()}</select></label>
          <label class="field full">Debit account<select name="accountId">${accountOptions(["Expenses", "Assets", "Cost of Sales"])}</select></label>
          ${itemEditor("bookSupplierBillItems", "Supplier bill items")}
          <label class="field full">Description<textarea name="description"></textarea></label>
          <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="save"></i>Save supplier bill</button></div>
        </form>
      </section>
      <section class="panel">
        <div class="table-head"><div><h2>Expenses and supplier bills</h2><p>Front-office cost capture by project and service.</p></div></div>
        ${costRegisterTable()}
      </section>
    `;
    qs("#bookQuoteForm")?.addEventListener("submit", handleBookQuote);
    qs("#bookInvoiceForm")?.addEventListener("submit", handleBookInvoice);
    qs("#bookReceiptForm")?.addEventListener("submit", handleBookReceipt);
    qs("#bookExpenseForm")?.addEventListener("submit", handleBookExpense);
    qs("#bookSupplierBillForm")?.addEventListener("submit", handleBookSupplierBill);
  }

  function dashboardModel() {
    return buildDashboardModel({ state, cgm: CGM, filter: dashboardFilter, money, monthName, financialYearLabel });
  }

  function selectedPeriod() {
    return resolveSelectedPeriod(dashboardFilter, CGM.today(), monthName);
  }

  function inPeriod(dateValue, period) {
    return isDateInPeriod(dateValue, period);
  }

  function healthBadge(health) {
    return `<span class="health-badge ${health.tone}">${esc(health.status)}</span>`;
  }

  function bindDashboardFilters() {
    qs("#dashboardMode")?.addEventListener("change", (event) => {
      dashboardFilter.mode = event.target.value;
      renderDashboard();
      if (window.lucide) lucide.createIcons();
    });
    qs("#dashboardMonth")?.addEventListener("change", (event) => {
      dashboardFilter.month = event.target.value || CGM.today().slice(0, 7);
      renderDashboard();
      if (window.lucide) lucide.createIcons();
    });
    qs("#dashboardQuarter")?.addEventListener("change", (event) => {
      dashboardFilter.quarter = event.target.value;
      renderDashboard();
      if (window.lucide) lucide.createIcons();
    });
    qs("#dashboardYear")?.addEventListener("change", (event) => {
      dashboardFilter.year = event.target.value;
      renderDashboard();
      if (window.lucide) lucide.createIcons();
    });
  }

  function quarterOptions() {
    return availableYears().flatMap((year) => [1, 2, 3, 4].map((quarter) => {
      const value = `${year}-Q${quarter}`;
      return `<option value="${value}" ${value === dashboardFilter.quarter ? "selected" : ""}>Q${quarter} ${year}</option>`;
    })).join("");
  }

  function yearOptions() {
    return availableYears().map((year) => `<option value="${year}" ${String(year) === dashboardFilter.year ? "selected" : ""}>${year}</option>`).join("");
  }

  function availableYears() {
    const years = new Set([new Date(CGM.today()).getFullYear()]);
    [...state.invoices, ...state.payments, ...state.expenses, ...state.supplierBills, ...state.supplierPayments].forEach((item) => {
      if (item.date) years.add(Number(String(item.date).slice(0, 4)));
    });
    return [...years].sort((a, b) => b - a);
  }

  function formatLongDate(dateValue) {
    return formatLongDateValue(dateValue);
  }

  function financialYearLabel(date) {
    return `${date.getFullYear()} (Jan-Dec)`;
  }

  function monthName(date) {
    return formatMonthName(date);
  }

  function barChart(label, rows, key, tone = "neutral") {
    const max = Math.max(...rows.map((row) => Math.abs(row[key])), 1);
    return `<article class="chart-card"><h3>${esc(label)}</h3><div class="bar-chart">${rows.map((row) => {
      const height = Math.max(4, Math.round((Math.abs(row[key]) / max) * 96));
      const semantic = row[key] < 0 ? "negative" : tone;
      return `<span title="${esc(row.label)}: ${money.format(row[key])}" class="${esc(semantic)}" style="height:${height}px"></span>`;
    }).join("")}</div><div class="chart-labels">${rows.map((row) => `<small>${esc(row.label.split(" ")[0])}</small>`).join("")}</div></article>`;
  }

  function groupedBarChart(label, rows, keyA, keyB) {
    const max = Math.max(...rows.flatMap((row) => [Math.abs(row[keyA]), Math.abs(row[keyB])]), 1);
    return `<article class="chart-card"><h3>${esc(label)}</h3><div class="grouped-chart">${rows.map((row) => {
      const hA = Math.max(4, Math.round((Math.abs(row[keyA]) / max) * 96));
      const hB = Math.max(4, Math.round((Math.abs(row[keyB]) / max) * 96));
      return `<span><i class="series-a" title="Debtors ${money.format(row[keyA])}" style="height:${hA}px"></i><i class="series-b" title="Creditors ${money.format(row[keyB])}" style="height:${hB}px"></i></span>`;
    }).join("")}</div><p class="muted">Red: debtors risk | Gray: creditors</p></article>`;
  }

  function lineChart(label, rows, key) {
    const values = rows.map((row) => row[key]);
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const spread = max - min || 1;
    const points = rows.map((row, index) => {
      const x = 12 + index * (276 / Math.max(rows.length - 1, 1));
      const y = 112 - ((row[key] - min) / spread) * 92;
      return `${x},${y}`;
    }).join(" ");
    const stroke = values.some((value) => value < 0) ? "#d71920" : "#168a4a";
    return `<article class="chart-card"><h3>${esc(label)}</h3><svg class="line-chart" viewBox="0 0 304 128" role="img" aria-label="${esc(label)}"><polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="3"/><line x1="8" y1="112" x2="296" y2="112" stroke="#d8dde4"/></svg></article>`;
  }

  function renderAccounts() {
    const groups = groupBy(state.accounts, "type");
    qs("#accountsView").innerHTML = `
      <section class="panel">
        <div class="table-head"><div><h2>Chart of Accounts</h2><p>Core accounts for assets, liabilities, equity, income, expenses, cost of sales, debtor control, creditor control, bank accounts, and cash accounts.</p></div></div>
        ${Object.entries(groups).map(([group, accounts]) => `
          <h3>${esc(group)}</h3>
          <div class="table-wrap"><table><thead><tr><th>Code</th><th>Account</th><th>Category</th><th>Balance</th></tr></thead><tbody>
            ${accounts.map((account) => `<tr><td>${account.code}</td><td><strong>${esc(account.name)}</strong></td><td>${esc(account.category)}</td><td>${money.format(CGM.accountBalance(state, account.id))}</td></tr>`).join("")}
          </tbody></table></div>
        `).join("")}
      </section>
    `;
  }

  function renderClients() {
    qs("#clientsView").innerHTML = `
      <div class="grid-two">
        <section class="panel">
          <div class="section-head"><div><h2>Create client record</h2><p>Clients are the customer master records. Their balances roll up to the Debtors Control account.</p></div></div>
          <form id="clientForm" class="form-grid">
            ${input("name", "Client name", "text", true)}
            ${generatedInput("code", "Client code", suggestedClientCode())}
            ${input("contact", "Contact person")}
            ${input("email", "Email", "email")}
            ${input("phone", "Phone")}
            ${input("openingBalance", "Opening balance", "number", false, "0", "0.01")}
            <label class="field full">Address<textarea name="address"></textarea></label>
            <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="save"></i>Save client</button></div>
          </form>
        </section>
        <section class="panel">
          <div class="table-head"><div><h2>Debtor balances by client</h2><p>Client subledger balances reconcile to the Debtors Control account.</p></div></div>
          <div class="list-toolbar"><input data-table-search="clientsTable" placeholder="Search clients by name, code, contact, or status"></div>
          <div class="table-wrap"><table id="clientsTable"><thead><tr><th>Client</th><th>Contact</th><th>Status</th><th>Balance</th><th></th></tr></thead><tbody>
            ${activeItems(state.clients, true).map((client) => `<tr><td><strong>${esc(client.name)}</strong><br><span class="muted">${esc(client.number)} | ${esc(client.code || "")}</span></td><td>${esc(client.email || client.phone || "")}</td><td>${statusBadge(client)}</td><td>${money.format(CGM.clientStatement(state, client.id).balance)}</td><td><div class="row-actions">${rowAction("secondary-button", `data-statement="client" data-id="${client.id}"`, "file-text", "Statement")}${actionButtons("client", client, { wrap: false })}</div></td></tr>`).join("")}
          </tbody></table></div>
        </section>
      </div>
    `;
    qs("#clientForm")?.addEventListener("submit", handleClient);
  }

  function renderSuppliers() {
    qs("#suppliersView").innerHTML = `
      <div class="grid-two">
        <section class="panel">
          <div class="section-head"><div><h2>Create supplier record</h2><p>Suppliers are the vendor master records. Their balances roll up to the Creditors Control account.</p></div></div>
          <form id="supplierForm" class="form-grid">
            ${input("name", "Supplier name", "text", true)}
            ${input("contact", "Contact person")}
            ${input("email", "Email", "email")}
            ${input("phone", "Phone")}
            ${input("openingBalance", "Opening balance", "number", false, "0", "0.01")}
            <label class="field full">Address<textarea name="address"></textarea></label>
            <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="save"></i>Save supplier</button></div>
          </form>
        </section>
        <section class="panel">
          <div class="section-head"><div><h2>Record supplier bill</h2><p>Debit expense/asset, credit Creditors Control.</p></div></div>
          <form id="supplierBillForm" class="form-grid">
            <label class="field full">Supplier<select name="supplierId" required>${supplierOptions()}</select></label>
            ${input("date", "Bill date", "date", true, CGM.today())}
            ${input("dueDate", "Due date", "date", false, CGM.today())}
            <label class="field">Project<select name="projectId">${projectOptions()}</select></label>
            <label class="field">Debit account<select name="accountId">${accountOptions(["Expenses", "Assets", "Cost of Sales"])}</select></label>
            ${itemEditor("supplierBillItems", "Supplier bill items")}
            <label class="field full">Description<textarea name="description"></textarea></label>
            <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="save"></i>Save bill</button></div>
          </form>
        </section>
      </div>
      <section class="panel">
        <div class="table-head"><div><h2>Creditor balances by supplier</h2><p>Supplier subledger balances reconcile to the Creditors Control account.</p></div></div>
        <div class="list-toolbar"><input data-table-search="suppliersTable" placeholder="Search suppliers by name, contact, or status"></div>
        <div class="table-wrap"><table id="suppliersTable"><thead><tr><th>Supplier</th><th>Contact</th><th>Status</th><th>Amount owed</th><th></th></tr></thead><tbody>
          ${activeItems(state.suppliers, true).map((supplier) => `<tr><td><strong>${esc(supplier.name)}</strong><br><span class="muted">${supplier.number}</span></td><td>${esc(supplier.email || supplier.phone || "")}</td><td>${statusBadge(supplier)}</td><td>${money.format(CGM.supplierStatement(state, supplier.id).balance)}</td><td><div class="row-actions">${rowAction("secondary-button", `data-pay-supplier="${supplier.id}"`, "credit-card", "Pay")}${rowAction("secondary-button", `data-statement="supplier" data-id="${supplier.id}"`, "file-text", "Statement")}${actionButtons("supplier", supplier, { wrap: false })}</div></td></tr>`).join("")}
        </tbody></table></div>
      </section>
    `;
    qs("#supplierForm")?.addEventListener("submit", handleSupplier);
    qs("#supplierBillForm")?.addEventListener("submit", handleSupplierBill);
  }

  function renderSales() {
    qs("#salesView").innerHTML = `
      <div class="grid-two">
        <section class="panel">
          <div class="section-head"><div><h2>Create invoice</h2><p>Select the client, then add invoice items. Posting: Debit Debtors Control, Credit Sales/Income.</p></div></div>
          <form id="invoiceForm" class="form-grid">
            <label class="field full">Client<select name="clientId" required>${clientOptions()}</select></label>
            ${input("date", "Invoice date", "date", true, CGM.today())}
            ${input("dueDate", "Due date", "date", true, CGM.today())}
            ${generatedInput("projectCode", "Project code", suggestedProjectCode())}
            ${input("projectName", "Project name")}
            ${itemEditor("invoiceItems", "Invoice items")}
            <label class="field full">Notes<textarea name="notes"></textarea></label>
            <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="save"></i>Create invoice</button></div>
          </form>
        </section>
        <section class="panel">
          <div class="section-head"><div><h2>Record client payment</h2><p>Posting: Debit selected Bank or Cash account, Credit Debtors Control.</p></div></div>
          <form id="paymentForm" class="form-grid">
            <label class="field full">Invoice<select name="invoiceId" required>${state.invoices.map((invoice) => `<option value="${invoice.id}">${invoice.number} - ${esc(clientName(invoice.clientId))} - ${money.format(CGM.documentTotal(invoice) - CGM.invoicePaid(state, invoice.id))}</option>`).join("")}</select></label>
            ${input("date", "Payment date", "date", true, CGM.today())}
            ${input("amount", "Amount", "number", true, "", "0.01")}
            ${input("method", "Method", "text", false, "Bank transfer")}
            ${input("reference", "Reference")}
            <label class="field full">Deposit to<select name="bankAccountId">${accountOptions(["Bank accounts", "Cash accounts"])}</select></label>
            <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="receipt"></i>Record receipt</button></div>
          </form>
        </section>
      </div>
      <section class="panel">
        <div class="table-head"><div><h2>Invoices and receipts</h2><p>Invoice status is calculated from linked receipts.</p></div></div>
        <div class="list-toolbar"><input data-table-search="invoicesTable" placeholder="Search invoices by number, client, project, amount, or status"></div>
        <div class="table-wrap"><table id="invoicesTable"><thead><tr><th>Invoice</th><th>Client</th><th>Project</th><th>Total</th><th>Paid</th><th>Status</th><th></th></tr></thead><tbody>
          ${activeItems(state.invoices, true).map((invoice) => `<tr><td>${invoice.number}<br><span class="muted">Due ${invoice.dueDate}</span></td><td>${esc(clientName(invoice.clientId))}</td><td>${esc(projectLabel(invoice.projectId, invoice.projectCode))}</td><td>${money.format(CGM.documentTotal(invoice))}</td><td>${money.format(CGM.invoicePaid(state, invoice.id))}</td><td>${badge(CGM.invoiceStatus(state, invoice))}</td><td>${actionButtons("invoice", invoice, { document: true, duplicate: true })}</td></tr>`).join("")}
        </tbody></table></div>
      </section>
    `;
    qs("#invoiceForm")?.addEventListener("submit", handleInvoice);
    qs("#paymentForm")?.addEventListener("submit", handlePayment);
  }

  function renderExpenses() {
    qs("#expensesView").innerHTML = `
      <div class="grid-two">
        <section class="panel">
          <div class="section-head"><div><h2>Record paid expense</h2><p>Add expense items, then post: Debit Expense account, Credit selected Bank or Cash account.</p></div></div>
          <form id="expenseForm" class="form-grid">
            ${input("date", "Date", "date", true, CGM.today())}
            ${input("category", "Category", "text", true)}
            ${input("vendor", "Vendor")}
            <label class="field">Service<select name="serviceId">${serviceOptions()}</select></label>
            <label class="field">Project<select name="projectId">${projectOptions()}</select></label>
            ${itemEditor("expenseItems", "Expense items")}
            <label class="field">Paid from<select name="bankAccountId">${accountOptions(["Bank accounts", "Cash accounts"])}</select></label>
            <label class="field full">Notes<textarea name="description"></textarea></label>
            <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="save"></i>Save expense</button></div>
          </form>
        </section>
        <section class="panel">
          <div class="table-head"><div><h2>Expenses</h2><p>Paid costs are linked to bank/cash and can be edited or archived with audit history.</p></div></div>
          <div class="list-toolbar"><input data-table-search="expensesTable" placeholder="Search expenses by date, category, vendor, project, or status"></div>
          <div class="table-wrap"><table id="expensesTable"><thead><tr><th>Date</th><th>Category</th><th>Vendor</th><th>Amount</th><th>Status</th><th>Description</th><th></th></tr></thead><tbody>
            ${activeItems(state.expenses, true).map((e) => `<tr><td>${e.date}</td><td>${esc(e.category)}</td><td>${esc(e.vendor || "")}</td><td>${money.format(e.amount)}</td><td>${statusBadge(e, "paid")}</td><td>${esc(e.description || "")}</td><td>${actionButtons("expense", e)}</td></tr>`).join("")}
          </tbody></table></div>
        </section>
      </div>
    `;
    qs("#expenseForm")?.addEventListener("submit", handleExpense);
  }

  function renderProjects() {
    qs("#projectsView").innerHTML = `
      <section class="panel">
        <div class="table-head"><div><h2>Project records</h2><p>Client and project codes connect front-office documents to profitability and management reporting.</p></div></div>
        <div class="list-toolbar"><input data-table-search="projectsTable" placeholder="Search projects by code, client, service, location, or status"></div>
        <div class="table-wrap"><table id="projectsTable"><thead><tr><th>Project</th><th>Client</th><th>Service</th><th>Status</th><th>Income</th><th>Costs</th><th></th></tr></thead><tbody>
          ${activeItems(state.projects, true).map((project) => {
            const row = projectProfitRowsRaw(project);
            return `<tr><td><strong>${esc(project.code)}</strong><br><span class="muted">${esc(project.name)}</span></td><td>${esc(clientName(project.clientId))}</td><td>${esc(serviceName(project.serviceId))}</td><td>${statusBadge(project)}</td><td>${money.format(row.income)}</td><td>${money.format(row.costs)}</td><td>${actionButtons("project", project)}</td></tr>`;
          }).join("")}
        </tbody></table></div>
      </section>
      <section class="panel">
        <div class="table-head"><div><h2>Projects and service profitability</h2><p>Revenue and cost are pulled from invoices, expenses, supplier bills, and ledger tags.</p></div></div>
        ${miniReportTable("Project profitability", projectProfitRows(), ["Project", "Client", "Service", "Income", "Direct costs", "Profit / loss"])}
      </section>
      <section class="panel">
        ${miniReportTable("Service profitability", serviceProfitRows(), ["Service", "Income", "Direct costs", "Profit / loss"])}
      </section>
    `;
  }

  function renderCashbook() {
    qs("#cashbookView").innerHTML = `
      <div class="grid-two">
        <section class="panel">
          <div class="section-head"><div><h2>Transfer between bank and cash</h2><p>Use this for cash withdrawals, bank deposits, and movements between money accounts.</p></div></div>
          <form id="cashTransferForm" class="form-grid">
            ${input("date", "Date", "date", true, CGM.today())}
            ${input("amount", "Amount", "number", true, "", "0.01")}
            <label class="field">From account<select name="fromAccountId">${accountOptions(["Bank accounts", "Cash accounts"])}</select></label>
            <label class="field">To account<select name="toAccountId">${accountOptions(["Cash accounts", "Bank accounts"])}</select></label>
            ${input("reference", "Reference")}
            <label class="field full">Description<textarea name="description">Bank/cash transfer</textarea></label>
            <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="save"></i>Save transfer</button></div>
          </form>
        </section>
        <section class="panel">
          ${miniReportTable("Money account balances", state.accounts.filter((account) => CGM.isMoneyAccount(state, account.id)).map((account) => [account.code, account.name, account.category, money.format(CGM.accountBalance(state, account.id))]), ["Code", "Account", "Type", "Balance"])}
        </section>
      </div>
      ${reportPanel("Cashbook", "Money in, money out, transfers, deposits, withdrawals, and running bank/cash balance.", "cashbook", ["Date", "Source", "Description", "Money in", "Money out", "Balance"], cashbookRows())}
    `;
    qs("#cashTransferForm")?.addEventListener("submit", handleCashTransfer);
  }

  function renderLedger() {
    const rows = CGM.ledgerEntries(state).map((e) => [e.date, accountName(e.accountId), e.documentNumber, e.description, money.format(e.debit), money.format(e.credit)]);
    qs("#ledgerView").innerHTML = reportPanel("General Ledger", "Every integrated transaction posts to debit and credit ledger lines.", "general-ledger", ["Date", "Account", "Document", "Description", "Debit", "Credit"], rows);
  }

  function renderJournals() {
    qs("#journalsView").innerHTML = `
      <section class="panel">
        <div class="section-head"><div><h2>Manual journal entry</h2><p>Debits and credits must balance before saving.</p></div></div>
        <form id="journalForm" class="form-grid">
          ${input("date", "Journal date", "date", true, CGM.today())}
          ${input("memo", "Memo", "text", true)}
          <div class="items-editor">
            <label>Journal lines</label>
            ${[0, 1, 2, 3].map((i) => `<div class="journal-row item-row"><label class="field">Account<select name="accountId">${accountOptions()}</select></label>${input(`debit${i}`, "Debit", "number", false, "", "0.01")}${input(`credit${i}`, "Credit", "number", false, "", "0.01")}</div>`).join("")}
            <p class="muted" id="journalCheck">Debit and credit totals must match.</p>
          </div>
          <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="save"></i>Save balanced journal</button></div>
        </form>
      </section>
      <section class="panel">${miniReportTable("Saved journals", state.journalEntries.map((j) => [j.date, j.number, j.memo, money.format(j.lines.reduce((s, l) => s + CGM.toNumber(l.debit), 0))]), ["Date", "Number", "Memo", "Amount"])}</section>
    `;
    qs("#journalForm")?.addEventListener("submit", handleJournal);
  }

  function renderReports() {
    const reports = [
      ["Client statements", "client-statements", ["Client", "Balance"], statementSummaryRows("client")],
      ["Supplier statements", "supplier-statements", ["Supplier", "Balance"], statementSummaryRows("supplier")],
      ["Cashbook", "cashbook", ["Date", "Source", "Description", "Money in", "Money out", "Balance"], cashbookRows()],
      ["General ledger", "general-ledger", ["Date", "Account", "Description", "Debit", "Credit"], CGM.ledgerEntries(state).map((e) => [e.date, accountName(e.accountId), e.description, money.format(e.debit), money.format(e.credit)])],
      ["Trial balance", "trial-balance", ["Account", "Debit", "Credit"], trialRows()],
      ["Income statement", "income-statement", ["Line", "Amount"], incomeRows()],
      ["Balance sheet", "balance-sheet", ["Line", "Amount"], balanceRows()],
      ["Cash flow statement", "cash-flow", ["Section", "Inflows", "Outflows", "Net"], cashFlowRows()],
      ["Project profitability", "project-profitability", ["Project", "Client", "Service", "Income", "Direct costs", "Profit / loss"], projectProfitRows()],
      ["Service profitability", "service-profitability", ["Service", "Income", "Direct costs", "Profit / loss"], serviceProfitRows()],
      ["Debtors ageing report", "debtors-ageing", ["Bucket", "Amount"], ageingRows("debtors")],
      ["Creditors ageing report", "creditors-ageing", ["Bucket", "Amount"], ageingRows("creditors")],
    ];
    qs("#reportsView").innerHTML = reports.map(([name, key, headers, rows]) => reportPanel(name, "Exportable accounting report.", key, headers, rows)).join("");
  }

  function renderSettings() {
    const s = settings();
    if (!can("settings")) {
      qs("#settingsView").innerHTML = accessPanel("Settings", "Only Super Admin can change company, document, banking, preset, user, and app preference settings.");
      return;
    }
    const company = s.companyProfile;
    const doc = s.documentSettings;
    const signatories = s.documentSignatories;
    const presets = s.presets;
    qs("#settingsView").innerHTML = `
      <section class="panel">
        <div class="table-head">
          <div><h2>Company profile and document settings</h2><p>These details feed the app header, document previews, PDFs, statements, banking details, and default terms.</p></div>
          <span class="role-pill">${esc(currentUser().role)}</span>
        </div>
        <form id="settingsForm" class="form-grid settings-grid">
          ${input("company.name", "Company name", "text", true, company.name)}
          ${input("company.tradingName", "Trading name", "text", false, company.tradingName)}
          ${input("company.registrationNumber", "Registration number", "text", false, company.registrationNumber)}
          ${input("company.taxVatNumber", "Tax / VAT number", "text", false, company.taxVatNumber)}
          ${input("company.phone", "Phone", "text", false, company.phone)}
          ${input("company.alternatePhone", "Alternate phone", "text", false, company.alternatePhone)}
          ${input("company.email", "Email", "email", false, company.email)}
          ${input("company.website", "Website", "text", false, company.website)}
          ${input("company.logoPath", "Logo path", "text", false, company.logoPath)}
          ${input("company.letterhead", "Letterhead / tagline", "text", false, company.letterhead)}
          <label class="field full">Address<textarea name="company.address">${esc(company.address)}</textarea></label>
          <label class="field full">Default notes<textarea name="company.defaultNotes">${esc(company.defaultNotes)}</textarea></label>
          <label class="field full">Default terms and conditions<textarea name="company.defaultTerms">${esc(company.defaultTerms)}</textarea></label>
          <div class="settings-subsection full">
            <div class="section-head"><div><h3>Authorised document signatories</h3><p>Only these controlled profiles can be placed on client documents.</p></div></div>
            <div class="signatory-grid">
              ${signatories.profiles.map((profile) => `
                <article class="signatory-editor">
                  <div class="signatory-preview">
                    ${profile.signatureImage ? `<img src="${esc(profile.signatureImage)}" alt="${esc(profile.name)} signature">` : `<span>No signature uploaded</span>`}
                  </div>
                  ${input(`signatory.${profile.id}.name`, "Full name", "text", true, profile.name)}
                  ${input(`signatory.${profile.id}.title`, "Job title", "text", true, profile.title)}
                  <label class="field">Signature image
                    <input type="file" name="signatory.${profile.id}.signature" accept="image/png,image/jpeg,image/webp">
                  </label>
                  <label class="check-field"><input type="checkbox" name="signatory.${profile.id}.remove"> Remove uploaded signature</label>
                </article>
              `).join("")}
            </div>
            <div class="form-grid signatory-defaults">
              <label class="field">Default prepared by<select name="signatory.preparedById">${signatories.profiles.map((profile) => `<option value="${profile.id}" ${profile.id === signatories.preparedById ? "selected" : ""}>${esc(profile.name)}</option>`).join("")}</select></label>
              <label class="field">Default approved by<select name="signatory.approvedById">${signatories.profiles.map((profile) => `<option value="${profile.id}" ${profile.id === signatories.approvedById ? "selected" : ""}>${esc(profile.name)}</option>`).join("")}</select></label>
            </div>
          </div>
          ${input("bank.bank", "Bank", "text", false, company.bankingDetails.bank)}
          ${input("bank.accountHolder", "Account holder", "text", false, company.bankingDetails.accountHolder)}
          ${input("bank.accountType", "Account type", "text", false, company.bankingDetails.accountType)}
          ${input("bank.accountNumber", "Account number", "text", false, company.bankingDetails.accountNumber)}
          ${input("bank.branchName", "Branch name", "text", false, company.bankingDetails.branchName)}
          ${input("bank.branchCode", "Branch code", "text", false, company.bankingDetails.branchCode)}
          ${input("doc.invoicePrefix", "Invoice prefix", "text", true, doc.invoicePrefix)}
          ${input("doc.quotationPrefix", "Quotation prefix", "text", true, doc.quotationPrefix)}
          ${input("doc.receiptPrefix", "Receipt prefix", "text", true, doc.receiptPrefix)}
          ${input("doc.statementPrefix", "Statement prefix", "text", true, doc.statementPrefix)}
          ${input("doc.defaultPaymentTerms", "Default payment terms", "text", false, doc.defaultPaymentTerms)}
          ${input("doc.defaultPaymentTermsDays", "Payment terms days", "number", false, doc.defaultPaymentTermsDays || 7, "1")}
          ${input("doc.defaultQuotationValidityDays", "Quotation validity days", "number", false, doc.defaultQuotationValidityDays, "1")}
          <label class="field">VAT enabled<select name="doc.vatEnabled"><option value="false" ${!doc.vatEnabled ? "selected" : ""}>No</option><option value="true" ${doc.vatEnabled ? "selected" : ""}>Yes</option></select></label>
          ${input("doc.vatRate", "VAT percentage", "number", false, doc.vatRate, "0.01")}
          ${input("preferences.defaultWorkspace", "Default workspace", "text", false, s.preferences.defaultWorkspace)}
          ${input("preferences.dateFormat", "Date format", "text", false, s.preferences.dateFormat)}
          <label class="field full">Service categories<textarea name="presets.serviceCategories">${esc((presets.serviceCategories || []).join("\\n"))}</textarea></label>
          <label class="field full">Expense categories<textarea name="presets.expenseCategories">${esc((presets.expenseCategories || []).join("\\n"))}</textarea></label>
          <label class="field full">Payment methods<textarea name="presets.paymentMethods">${esc((presets.paymentMethods || []).join("\\n"))}</textarea></label>
          <label class="field full">Reason for settings change<textarea name="reason" required placeholder="Example: Updated official banking details from latest company invoice."></textarea></label>
          <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="save"></i>Save settings</button></div>
        </form>
      </section>
      <section class="panel">
        <div class="table-head"><div><h2>User and role settings</h2><p>Local role framework for future staff access and permissions.</p></div></div>
        <form id="userForm" class="form-grid">
          ${input("name", "Staff name", "text", true)}
          ${input("email", "Email", "email")}
          <label class="field">Role<select name="role">${["Super Admin", "Director", "Accountant", "Bookkeeper", "Site Engineer / Staff", "Viewer"].map((role) => `<option>${role}</option>`).join("")}</select></label>
          <label class="field">Active<select name="active"><option value="true">Active</option><option value="false">Inactive</option></select></label>
          <div class="actions full"><button class="secondary-button" type="submit"><i data-lucide="user-plus"></i>Add user</button></div>
        </form>
        ${tableHtml("usersTable", ["Name", "Email", "Role", "Status", "Session", ""], state.users.map((user) => [user.name, user.email || "", user.role, user.active ? "Active" : "Inactive", user.id === state.currentUserId ? "Current" : "", actionButtons("user", { ...user, status: user.active ? "active" : "archived" })]))}
        <div class="actions">
          <label class="field">Current test user<select id="currentUserSelect">${state.users.map((user) => `<option value="${user.id}" ${user.id === state.currentUserId ? "selected" : ""}>${esc(user.name)} - ${esc(user.role)}</option>`).join("")}</select></label>
        </div>
      </section>
      <section class="panel">
        <div class="table-head"><div><h2>Document template preview</h2><p>Shared layout for quotations, invoices, receipts, statements, reminders, supplier bills, and summaries.</p></div></div>
        ${documentPreview({ title: "INVOICE", number: `${doc.invoicePrefix}-0001`, clientName: "Sample Client", projectName: "Sample Project", rows: [["Consultation Fee", "1", "850.00", "850.00"], ["Project Design", "1", "5,000.00", "5,000.00"]], total: 5850 })}
      </section>
      <section class="panel">
        <div class="table-head"><div><h2>Data safety and recovery</h2><p>Use backup files before major changes. The browser also keeps a local recovery copy after successful saves.</p></div></div>
        <div class="backup-summary">
          ${miniReportTable("Current data snapshot", backupCountRows(backupCounts(state)), ["Area", "Records"])}
          <div class="safety-note">
            <strong>Recommended routine</strong>
            <p>Download a backup before restoring data, changing settings, or doing month-end review. Restore files are validated before they overwrite the current workspace.</p>
          </div>
        </div>
        <div class="actions">
          <button class="secondary-button" data-backup-json><i data-lucide="download"></i>Download backup</button>
          <button class="danger-button" data-restore-json><i data-lucide="upload"></i>Restore from backup</button>
        </div>
        <input id="restoreJsonInput" type="file" accept="application/json" hidden>
      </section>
    `;
    qs("#settingsForm")?.addEventListener("submit", handleSettingsSave);
    qs("#userForm")?.addEventListener("submit", handleUserSave);
    qs("#currentUserSelect")?.addEventListener("change", (event) => {
      const before = state.currentUserId;
      state.currentUserId = event.target.value;
      save({ action: "switch-current-user", recordType: "user", recordId: state.currentUserId, before, after: state.currentUserId, reason: "Testing role-based access" });
    });
    qs("#restoreJsonInput")?.addEventListener("change", restoreJsonBackup);
  }

  function renderAudit() {
    if (!can("audit")) {
      qs("#auditView").innerHTML = accessPanel("Audit Log", "Only Super Admin and Directors can view the full audit history.");
      return;
    }
    const allEntries = state.auditLog || [];
    const entries = filterAuditEntries(allEntries, auditFilters);
    const rows = entries.slice(0, 300).map((entry) => [
      formatDateTime(entry.at),
      entry.userName,
      entry.role,
      title(entry.action),
      `${title(entry.recordType)} ${entry.recordId || ""}`,
      auditSummary(entry),
      `<button class="secondary-button" data-audit-detail="${entry.id}"><i data-lucide="eye"></i>View</button>`,
    ]);
    const actionOptions = auditOptions(allEntries, "action");
    const moduleOptions = auditOptions(allEntries, "recordType");
    qs("#auditView").innerHTML = `
      <section class="panel">
        <div class="table-head"><div><h2>Audit trail</h2><p>Edits, archives, voids, settings changes, role changes, and financial adjustments are recorded for traceability.</p></div></div>
        <div class="audit-stats">
          ${metric("Audit entries", allEntries.length, false)}
          ${metric("Filtered results", entries.length, false)}
          ${metric("Settings changes", allEntries.filter((entry) => entry.recordType === "settings").length, false)}
          ${metric("Voids / archives", allEntries.filter((entry) => ["voided", "archived", "restore"].includes(entry.action)).length, false)}
        </div>
        <div class="list-toolbar audit-toolbar">
          <input data-table-search="auditTable" placeholder="Search audit log by user, action, module, record, or reason">
          <select data-audit-filter="action"><option value="">All actions</option>${actionOptions.map((action) => `<option value="${esc(action)}" ${auditFilters.action === action ? "selected" : ""}>${esc(title(action))}</option>`).join("")}</select>
          <select data-audit-filter="module"><option value="">All modules</option>${moduleOptions.map((module) => `<option value="${esc(module)}" ${auditFilters.module === module ? "selected" : ""}>${esc(title(module))}</option>`).join("")}</select>
          <input type="date" data-audit-filter="fromDate" value="${esc(auditFilters.fromDate)}" aria-label="Audit from date">
          <input type="date" data-audit-filter="toDate" value="${esc(auditFilters.toDate)}" aria-label="Audit to date">
          <button class="secondary-button" data-audit-clear><i data-lucide="x"></i>Clear</button>
        </div>
        ${tableHtml("auditTable", ["Date & time", "User", "Role", "Action", "Record", "Summary", ""], rows)}
      </section>
    `;
  }

  function auditSummary(entry) {
    return summarizeAuditEntry(entry, { moneyFormatter: money });
  }

  function parseJson(value) {
    return parseAuditValue(value);
  }

  function formatAuditValue(value) {
    return formatAuditDisplayValue(value, money);
  }

  function renderHelp() {
    const guides = [
      ["Getting started", "Choose Bookkeeping Portal for daily capture. Use Accounting Management for ledgers, statements, reports, settings, and approvals."],
      ["Creating clients", "Capture the client name, contact, email, phone, address, and opening balance if the client already owes money."],
      ["Creating quotations", "Add each service line with description, service category, quantity, and rate. Save as draft, then approve and transfer when accepted."],
      ["Converting quotations", "Approve the quotation first. Transfer creates the client account if needed, creates/links the project, and issues an invoice."],
      ["Recording payments", "Select the unpaid invoice, confirm the outstanding balance, enter the received amount, choose bank or cash, then save. Receipts are generated from payments."],
      ["Expenses and supplier bills", "Paid expenses reduce bank/cash immediately. Supplier bills create creditor balances until supplier payment is recorded."],
      ["Statements", "Use client or supplier statements to review opening balances, invoices/bills, receipts/payments, and balance carried forward."],
      ["Reports", "Use reports for trial balance, income statement, balance sheet, cash flow, debtors, creditors, and profitability review."],
      ["Users and roles", "Super Admin controls settings and users. Directors review and approve. Accountants manage financial records. Bookkeepers capture daily documents."],
      ["Backup and restore", "Keep local exports as backup while Supabase is the main database. Avoid reset/demo actions unless you have exported a backup."],
    ];
    qs("#helpView").innerHTML = `<section class="panel">
      <div class="table-head"><div><h2>Help and user guide</h2><p>Plain-language guidance for daily Civil-Gineer Masta business operations.</p></div></div>
      <div class="help-grid">${guides.map(([heading, text], index) => `<details class="help-card" ${index === 0 ? "open" : ""}><summary><i data-lucide="info"></i><span>${esc(heading)}</span></summary><p>${esc(text)}</p></details>`).join("")}</div>
    </section>
    <section class="panel">
      <div class="table-head"><div><h2>FAQ</h2><p>Quick answers for common office questions.</p></div></div>
      ${miniReportTable("", [
        ["Why can I not edit this record?", "Your current role may not allow editing issued or financial records."],
        ["Why is an invoice overdue?", "The due date has passed and the invoice is not fully paid."],
        ["Why do totals change after voiding?", "Voided/cancelled records stay in history but are excluded from active totals."],
        ["Why did a quotation create a client?", "Accepted quotations become invoices, and invoices need a debtor/client account."],
        ["What if Supabase is unavailable?", "Do not keep retrying rapidly. Check the data status message and use exports/backups until the connection is restored."],
      ], ["Question", "Answer"])}
    </section>`;
  }

  function accessPanel(titleText, message) {
    return `<section class="panel empty-panel"><img class="empty-logo" src="${esc(settings().companyProfile.logoPath)}" alt=""><h2>${esc(titleText)}</h2><p>${esc(message)}</p></section>`;
  }

  function reportPanel(titleText, subtitle, key, headers, rows) {
    return `<section class="panel">
      <div class="table-head"><div><h2>${esc(titleText)}</h2><p>${esc(subtitle)}</p></div><div class="export-actions"><button class="secondary-button" data-export-report="${key}" data-format="pdf"><i data-lucide="file-down"></i>Export PDF</button><button class="secondary-button" data-export-report="${key}" data-format="excel"><i data-lucide="sheet"></i>Export Excel</button></div></div>
      ${miniReportTable("", rows, headers)}
    </section>`;
  }

  function tableHtml(id, headers, rows) {
    return renderTableHtml({ id, headers, rows, escapeHtml: esc });
  }

  function miniReportTable(caption, rows, headers = ["Metric", "Value"]) {
    return renderMiniReportTable({ caption, rows, headers, escapeHtml: esc });
  }

  function documentPreview(doc) {
    const s = settings();
    const template = templateForPayload("invoice", {
      context: { settings: { companyProfile: s.companyProfile, documentSettings: s.documentSettings, documentSignatories: s.documentSignatories }, clients: [], projects: [], services: [] },
      document: {
        number: doc.number,
        date: CGM.today(),
        dueDate: defaultDueDate(CGM.today()),
        projectName: doc.projectName,
        clientSnapshot: { name: doc.clientName },
        items: doc.rows.map((row) => ({ description: row[0], qty: CGM.toNumber(row[1]), rate: CGM.toNumber(String(row[2]).replace(/,/g, "")) })),
        notes: s.companyProfile.defaultNotes,
        taxRate: s.documentSettings.vatEnabled ? CGM.toNumber(s.documentSettings.vatRate) : 0,
      },
    });
    return `<article class="document-preview professional-doc">
      <header>
        <div class="doc-brand">
          <img src="${esc(template.company.logoPath)}" alt="Civil-Gineer Masta logo">
          <div><h3>${esc(template.company.name)}</h3>${template.companyLines.map((line) => `<p>${esc(line)}</p>`).join("")}</div>
        </div>
        <div class="doc-title"><strong>${esc(template.title.toUpperCase())}</strong><span>${esc(template.number)}</span></div>
      </header>
      <p class="doc-tagline">${esc(template.tagline)}</p>
      <div class="doc-meta">
        <div><span>Bill To</span><strong>${esc(template.client.name)}</strong></div>
        <div><span>Project</span><strong>${esc(doc.projectName)}</strong></div>
        <div><span>Date</span><strong>${formatLongDate(CGM.today())}</strong></div>
      </div>
      ${miniReportTable("", template.items.map((item) => [item.description, item.service, item.qty, money.format(item.rate), money.format(item.amount)]), ["Description", "Service", "Qty", "Unit Cost", "Amount"])}
      <div class="doc-total"><span>Total</span><strong>${money.format(template.totals.at(-1)?.[1] || doc.total)}</strong></div>
      <div class="doc-two">
        <div><h3>Banking Details</h3><p>${template.bankingRows.map(([label, value]) => `${esc(label)}: ${esc(value)}`).join("<br>")}</p></div>
        <div><h3>Terms & Approval</h3><p>${esc(template.terms)}</p><div class="preview-signatures">${previewSignature(template.signatories?.preparedBy, template.preparedByTitle)}${previewSignature(template.signatories?.approvedBy, template.approvedByTitle)}</div></div>
      </div>
      <footer>${esc(template.footerText)}</footer>
    </article>`;
  }

  function previewSignature(signatory, label) {
    return `<div class="preview-signature"><strong>${esc(label || "Signatory")}</strong>${signatory?.signatureImage ? `<img src="${esc(signatory.signatureImage)}" alt="">` : `<span>${signatory ? "Signature not uploaded" : "Pending approval"}</span>`}${signatory ? `<b>${esc(signatory.name)}</b><small>${esc(signatory.title)}</small>` : ""}</div>`;
  }

  async function handleSettingsSave(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const before = structuredClone(settings());
    const nextSettings = structuredClone(settings());
    const company = nextSettings.companyProfile;
    const doc = nextSettings.documentSettings;
    const signatories = nextSettings.documentSignatories;
    const bank = company.bankingDetails;
    company.name = data["company.name"];
    company.tradingName = data["company.tradingName"];
    company.registrationNumber = data["company.registrationNumber"];
    company.taxVatNumber = data["company.taxVatNumber"];
    company.phone = data["company.phone"];
    company.alternatePhone = data["company.alternatePhone"];
    company.email = data["company.email"];
    company.website = data["company.website"];
    company.logoPath = normalizeLogoPath(data["company.logoPath"]);
    company.letterhead = data["company.letterhead"];
    company.address = data["company.address"];
    company.defaultNotes = data["company.defaultNotes"];
    company.defaultTerms = data["company.defaultTerms"];
    for (const profile of signatories.profiles) {
      profile.name = data[`signatory.${profile.id}.name`] || profile.name;
      profile.title = data[`signatory.${profile.id}.title`] || profile.title;
      if (data[`signatory.${profile.id}.remove`] === "on") {
        profile.signatureImage = "";
        profile.signatureRemoved = true;
      }
      const file = form.elements.namedItem(`signatory.${profile.id}.signature`)?.files?.[0];
      if (file?.size) {
        try {
          profile.signatureImage = await signatureImageDataUrl(file);
          profile.signatureRemoved = false;
        } catch (error) {
          notify("Signature not saved", `${profile.name}: ${error.message}`, "error");
          return;
        }
      }
    }
    signatories.preparedById = data["signatory.preparedById"];
    signatories.approvedById = data["signatory.approvedById"];
    const preparedProfile = signatories.profiles.find((profile) => profile.id === signatories.preparedById);
    const approvedProfile = signatories.profiles.find((profile) => profile.id === signatories.approvedById);
    company.preparedBy = preparedProfile?.name || "";
    company.preparedByTitle = preparedProfile?.title || "Prepared by";
    company.approvedBy = approvedProfile?.name || "";
    company.approvedByTitle = approvedProfile?.title || "Approved by";
    bank.bank = data["bank.bank"];
    bank.accountHolder = data["bank.accountHolder"];
    bank.accountType = data["bank.accountType"];
    bank.accountNumber = data["bank.accountNumber"];
    bank.branchName = data["bank.branchName"];
    bank.branchCode = data["bank.branchCode"];
    doc.invoicePrefix = data["doc.invoicePrefix"];
    doc.quotationPrefix = data["doc.quotationPrefix"];
    doc.receiptPrefix = data["doc.receiptPrefix"];
    doc.statementPrefix = data["doc.statementPrefix"];
    doc.defaultPaymentTerms = data["doc.defaultPaymentTerms"];
    doc.defaultPaymentTermsDays = CGM.toNumber(data["doc.defaultPaymentTermsDays"] || 7);
    doc.defaultQuotationValidityDays = CGM.toNumber(data["doc.defaultQuotationValidityDays"]);
    doc.vatEnabled = data["doc.vatEnabled"] === "true";
    doc.vatRate = CGM.toNumber(data["doc.vatRate"]);
    nextSettings.preferences.defaultWorkspace = data["preferences.defaultWorkspace"];
    nextSettings.preferences.dateFormat = data["preferences.dateFormat"];
    nextSettings.presets.serviceCategories = linesFromTextarea(data["presets.serviceCategories"]);
    nextSettings.presets.expenseCategories = linesFromTextarea(data["presets.expenseCategories"]);
    nextSettings.presets.paymentMethods = linesFromTextarea(data["presets.paymentMethods"]);
    state.settings = nextSettings;
    state.company = { ...state.company, ...company };
    await save({ action: "update-settings", recordType: "settings", recordId: "company-document-presets", before, after: nextSettings, reason: data.reason });
  }

  function handleUserSave(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const user = { id: CGM.uid(), name: data.name, email: data.email, role: data.role, active: data.active === "true" };
    state.users.unshift(user);
    save({ action: "create-user", recordType: "user", recordId: user.id, before: null, after: user, reason: "User added from settings" });
  }

  async function backupJson(reason = "Manual backup downloaded") {
    if (!requirePermission("settings", "settings")) return;
    const filename = backupFilename("cgm-backup");
    const counts = backupCounts(state);
    const saved = await save({ action: "create-backup", recordType: "backup", recordId: filename, before: null, after: { filename, counts }, reason });
    if (!saved) return;
    const envelope = createBackupEnvelope(state, { createdBy: currentUser().name, reason, source: "manual" });
    downloadBlob(new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" }), filename);
    notify("Backup created", "A validated local JSON backup has been downloaded.", "success");
  }

  function restoreJsonBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = parseBackupText(reader.result);
      } catch (error) {
        notify("Restore failed", error.message || "The selected file is not a valid Civil-Gineer Masta backup.", "error");
        event.target.value = "";
        return;
      }
      const metadata = parsed.metadata;
      const countRows = backupCountRows(metadata.counts);
      openConfirmModal({
        titleText: "Restore local backup",
        message: `This will overwrite the current app state and sync it to Supabase. Backup date: ${metadata.createdAt || "legacy file"}. A pre-restore safety backup will download first.`,
        confirmLabel: "Restore backup",
        tone: "danger",
        reasonRequired: true,
        onConfirm: async (reason) => {
          try {
            const before = structuredClone(state);
            const safetyFilename = backupFilename("cgm-pre-restore");
            const safetyEnvelope = createBackupEnvelope(before, { createdBy: currentUser().name, reason: "Automatic pre-restore safety backup", source: "pre-restore" });
            downloadBlob(new Blob([JSON.stringify(safetyEnvelope, null, 2)], { type: "application/json" }), safetyFilename);
            state = { ...CGM.initialState(), ...parsed.state };
            await save({ action: "restore-backup", recordType: "backup", recordId: file.name, before, after: state, reason });
            notify("Restore complete", "Backup restored and synced. Review dashboards, reports, and audit log before continuing.", "success");
          } catch (error) {
            notify("Restore failed", error.message || "The selected file is not a valid backup.", "error");
          } finally {
            event.target.value = "";
          }
        },
      });
      qs("#confirmActionForm .confirm-panel p").insertAdjacentHTML("afterend", `<div class="backup-restore-preview full">${miniReportTable("Backup contents", countRows, ["Area", "Records"])}${parsed.warnings.length ? `<p class="muted">${esc(parsed.warnings.join(" "))}</p>` : ""}</div>`);
      event.target.value = "";
    };
    reader.readAsText(file);
  }

  function linesFromTextarea(value) {
    return String(value || "").split(/\r?\n|,/).map((line) => line.trim()).filter(Boolean);
  }

  function normalizeLogoPath(value) {
    const path = String(value || "").trim();
    if (!path || path === "assets/logo.png" || path === "/assets/logo.png") return "/logo.png";
    return path;
  }

  async function signatureImageDataUrl(file) {
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) throw new Error("Use a PNG, JPEG, or WebP image.");
    if (file.size > 8 * 1024 * 1024) throw new Error("Signature image must be smaller than 8 MB.");
    const source = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("The signature image could not be read."));
      reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("The signature image is invalid."));
      img.src = source;
    });
    const scanScale = Math.min(1, 1600 / image.naturalWidth, 900 / image.naturalHeight);
    const scan = document.createElement("canvas");
    scan.width = Math.max(1, Math.round(image.naturalWidth * scanScale));
    scan.height = Math.max(1, Math.round(image.naturalHeight * scanScale));
    const scanContext = scan.getContext("2d", { willReadFrequently: true });
    scanContext.drawImage(image, 0, 0, scan.width, scan.height);
    const pixels = scanContext.getImageData(0, 0, scan.width, scan.height);
    let left = scan.width;
    let top = scan.height;
    let right = 0;
    let bottom = 0;
    for (let y = 0; y < scan.height; y += 1) {
      for (let x = 0; x < scan.width; x += 1) {
        const index = (y * scan.width + x) * 4;
        const visibleInk = pixels.data[index + 3] > 12 && Math.min(pixels.data[index], pixels.data[index + 1], pixels.data[index + 2]) < 242;
        if (!visibleInk) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    if (left > right || top > bottom) throw new Error("No visible signature could be detected.");
    const padding = 10;
    left = Math.max(0, left - padding);
    top = Math.max(0, top - padding);
    right = Math.min(scan.width - 1, right + padding);
    bottom = Math.min(scan.height - 1, bottom + padding);
    const cropWidth = right - left + 1;
    const cropHeight = bottom - top + 1;
    const scale = Math.min(1, 720 / cropWidth, 220 / cropHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(cropWidth * scale));
    canvas.height = Math.max(1, Math.round(cropHeight * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(scan, left, top, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
    const output = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < output.data.length; index += 4) {
      if (output.data[index] > 247 && output.data[index + 1] > 247 && output.data[index + 2] > 247) output.data[index + 3] = 0;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.putImageData(output, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    if (dataUrl.length > 300000) throw new Error("Crop the signature more tightly and upload it again.");
    return dataUrl;
  }

  async function handleClient(event) {
    event.preventDefault();
    if (!requirePermission("client", "create")) return;
    try {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const number = await officialNumber("clientNumber", "C", state.clients, "number", "client number");
      const code = await officialNumber("clientCode", "CL", state.clients, "code", "client code", { period: periodKey(CGM.today()) });
      const client = { ...data, id: CGM.uid(), number, code, openingBalance: CGM.toNumber(data.openingBalance), createdAt: CGM.today(), status: "active" };
      state.clients.unshift(client);
      save({ action: "create", recordType: "client", recordId: client.number, before: null, after: client });
    } catch (error) {
      numberingError("client", error);
    }
  }

  async function handleSupplier(event) {
    event.preventDefault();
    if (!requirePermission("supplier", "create")) return;
    try {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const supplier = { ...data, id: CGM.uid(), number: await officialNumber("supplier", "S", state.suppliers, "number", "supplier number"), openingBalance: CGM.toNumber(data.openingBalance), createdAt: CGM.today(), status: "active" };
      state.suppliers.unshift(supplier);
      save({ action: "create", recordType: "supplier", recordId: supplier.number, before: null, after: supplier });
    } catch (error) {
      numberingError("supplier", error);
    }
  }

  async function handleSupplierBill(event) {
    event.preventDefault();
    if (!requirePermission("supplierBill", "create")) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const items = collectItems(event.currentTarget);
    if (!items.length) {
      openModal("Supplier bill not saved", "<p>Add at least one supplier bill item with description, service category, quantity, and rate.</p>");
      return;
    }
    const serviceId = items[0]?.serviceId || data.serviceId;
    const service = CGM.serviceById(state, serviceId);
    let number;
    try {
      number = await officialNumber("supplierBill", docPrefix("supplierBillPrefix", "BILL"), state.supplierBills, "number", "supplier bill number");
    } catch (error) {
      numberingError("supplier bill", error);
      return;
    }
    const bill = { ...data, id: CGM.uid(), number, serviceId, items, amount: CGM.documentTotal({ items }), accountId: data.accountId || service?.costAccountId || "general_expenses", projectCode: projectLabel(data.projectId, ""), status: "issued" };
    state.supplierBills.unshift(bill);
    save({ action: "create", recordType: "supplierBill", recordId: bill.number, before: null, after: bill });
    openPostSaveActions("supplierBill", bill);
  }

  async function handleInvoice(event) {
    event.preventDefault();
    if (!requirePermission("invoice", "create")) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const items = collectItems(form);
    if (!items.length) {
      openModal("Invoice not saved", "<p>Add at least one invoice item with description, quantity, and rate.</p>");
      return;
    }
    const serviceId = items[0]?.serviceId || data.serviceId;
    let projectCode;
    let number;
    try {
      projectCode = await reserveProjectCode(data.projectCode);
      number = await officialNumber("invoice", docPrefix("invoicePrefix", "INV"), state.invoices, "number", "invoice number");
    } catch (error) {
      numberingError("invoice", error);
      return;
    }
    const beforeState = structuredClone(state);
    let project;
    try {
      project = await findOrCreateProject({ clientId: data.clientId, serviceId, projectCode, projectName: data.projectName });
    } catch (error) {
      notify("Invoice not saved", userMessageForError(error, "invoice"), "error");
      return;
    }
    const service = CGM.serviceById(state, serviceId);
    const invoice = { id: CGM.uid(), number, clientId: data.clientId, date: data.date, dueDate: data.dueDate, serviceId, projectId: project?.id || "", projectCode: project?.code || "", incomeAccountId: service?.incomeAccountId || "sales_income", notes: data.notes, items, discount: defaultDiscount(), taxRate: defaultTaxRate(), status: "issued", signatories: defaultDocumentSignatories(true) };
    state.invoices.unshift(invoice);
    if (!(await saveOrRollback(beforeState, { action: "create", recordType: "invoice", recordId: invoice.number, before: null, after: invoice }))) return;
    openPostSaveActions("invoice", invoice);
  }

  async function handlePayment(event) {
    event.preventDefault();
    if (!requirePermission("payment", "create")) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const invoice = state.invoices.find((item) => item.id === data.invoiceId);
    if (!invoice) {
      openModal("Receipt not saved", "<p>Select a valid unpaid invoice before recording payment.</p>");
      return;
    }
    const amount = CGM.toNumber(data.amount);
    const outstanding = amountDueInvoice(invoice);
    if (amount <= 0 || amount > outstanding + 0.01) {
      openModal("Check payment amount", `<p>The outstanding balance for ${esc(invoice.number)} is ${money.format(outstanding)}. Enter an amount greater than zero and not more than the outstanding balance.</p>`);
      return;
    }
    let receiptNumber;
    try {
      receiptNumber = await officialNumber("receipt", docPrefix("receiptPrefix", "RCT"), state.payments, "receiptNumber", "receipt number");
    } catch (error) {
      numberingError("receipt", error);
      return;
    }
    const beforeState = structuredClone(state);
    const payment = { ...data, id: CGM.uid(), clientId: invoice?.clientId || "", projectId: invoice?.projectId || "", projectCode: invoice?.projectCode || "", serviceId: invoice?.serviceId || "", amount, receiptNumber, status: "paid", signatories: structuredClone(invoice.signatories || defaultDocumentSignatories(true)) };
    state.payments.unshift(payment);
    if (!(await saveOrRollback(beforeState, { action: "create", recordType: "payment", recordId: payment.receiptNumber, before: null, after: payment }))) return;
    openPostSaveActions("payment", payment);
  }

  async function handleExpense(event) {
    event.preventDefault();
    if (!requirePermission("expense", "create")) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const items = collectItems(form);
    if (!items.length) {
      openModal("Expense not saved", "<p>Add at least one expense item with description, quantity, and rate.</p>");
      return;
    }
    const serviceId = items[0]?.serviceId || data.serviceId;
    const service = CGM.serviceById(state, serviceId);
    let reference;
    try {
      reference = await officialNumber("expense", "EXP", state.expenses, "reference", "expense reference");
    } catch (error) {
      numberingError("expense", error);
      return;
    }
    const beforeState = structuredClone(state);
    const expense = { ...data, id: CGM.uid(), reference, serviceId, projectCode: projectLabel(data.projectId, ""), amount: CGM.documentTotal({ items }), items, description: data.description || items.map((item) => item.description).join("; "), expenseAccountId: service?.costAccountId || "general_expenses", paymentMethod: "Paid", status: "paid" };
    state.expenses.unshift(expense);
    await saveOrRollback(beforeState, { action: "create", recordType: "expense", recordId: expense.reference || expense.id, before: null, after: expense });
  }

  async function handleBookQuote(event) {
    event.preventDefault();
    if (!requirePermission("quotation", "create")) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const items = collectItems(form);
    if (!items.length) {
      openModal("Quotation not saved", "<p>Add at least one quotation item with description, quantity, and rate.</p>");
      return;
    }
    let selectedClient = data.clientId ? state.clients.find((client) => client.id === data.clientId) : null;
    const selectedProject = data.projectId ? state.projects.find((project) => project.id === data.projectId) : null;
    if (data.clientId && !selectedClient) {
      openModal("Quotation not saved", "<p>Select a valid existing client or enter new prospect details.</p>");
      return;
    }
    if (data.projectId && !selectedProject) {
      openModal("Quotation not saved", "<p>Select a valid existing project or use the generated project code for a new project.</p>");
      return;
    }
    if (selectedProject?.clientId) {
      const projectClient = state.clients.find((client) => client.id === selectedProject.clientId);
      if (selectedClient && selectedClient.id !== selectedProject.clientId) {
        openModal("Quotation not saved", "<p>The selected project belongs to a different client. Choose the matching client or create a new project.</p>");
        return;
      }
      if (!selectedClient && projectClient) selectedClient = projectClient;
    }
    if (!selectedClient && !String(data.clientName || "").trim()) {
      openModal("Quotation not saved", "<p>Choose an existing client or enter a client/prospect name.</p>");
      return;
    }
    let number;
    let projectCode;
    try {
      number = await officialNumber("quotation", docPrefix("quotationPrefix", "QT"), state.quotations, "number", "quotation number");
      projectCode = selectedProject?.code || await reserveProjectCode(data.projectCode);
    } catch (error) {
      numberingError("quotation", error);
      return;
    }
    const beforeState = structuredClone(state);
    const quote = {
      id: CGM.uid(),
      number,
      clientId: selectedClient?.id || "",
      clientSnapshot: selectedClient || clientSnapshotFromEntry(data),
      date: data.date,
      validUntil: data.validUntil,
      serviceId: items[0]?.serviceId || data.serviceId,
      projectId: selectedProject?.id || "",
      projectCode,
      projectName: selectedProject?.name || data.projectName,
      status: "draft",
      notes: data.notes,
      items,
      discount: defaultDiscount(),
      taxRate: defaultTaxRate(),
      signatories: defaultDocumentSignatories(false),
      source: "bookkeeping",
    };
    state.quotations.unshift(quote);
    if (!(await saveOrRollback(beforeState, { action: "create-draft", recordType: "quotation", recordId: quote.number, before: null, after: quote }))) return;
    openPostSaveActions("quotation", quote);
  }

  async function handleBookInvoice(event) {
    event.preventDefault();
    if (!requirePermission("invoice", "create")) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const items = collectItems(form);
    if (!items.length) {
      openModal("Invoice not saved", "<p>Add at least one invoice item with description, quantity, and rate.</p>");
      return;
    }
    const beforeState = structuredClone(state);
    let client;
    const serviceId = items[0]?.serviceId || data.serviceId;
    let number;
    let projectCode;
    let selectedClient = data.clientId ? state.clients.find((client) => client.id === data.clientId) : null;
    const selectedProject = data.projectId ? state.projects.find((project) => project.id === data.projectId) : null;
    if (data.clientId && !selectedClient) {
      openModal("Invoice not saved", "<p>Select a valid existing client or enter new client details.</p>");
      return;
    }
    if (data.projectId && !selectedProject) {
      openModal("Invoice not saved", "<p>Select a valid existing project or use the generated project code for a new project.</p>");
      return;
    }
    if (selectedProject?.clientId) {
      const projectClient = state.clients.find((client) => client.id === selectedProject.clientId);
      if (selectedClient && selectedClient.id !== selectedProject.clientId) {
        openModal("Invoice not saved", "<p>The selected project belongs to a different client. Choose the matching client or create a new project.</p>");
        return;
      }
      if (!selectedClient && projectClient) selectedClient = projectClient;
    }
    if (!selectedClient && !String(data.clientName || "").trim()) {
      openModal("Invoice not saved", "<p>Choose an existing client or enter a client name.</p>");
      return;
    }
    try {
      client = selectedClient || await findOrCreateClient(clientSnapshotFromEntry(data));
      number = await officialNumber("invoice", docPrefix("invoicePrefix", "INV"), state.invoices, "number", "invoice number");
      projectCode = selectedProject?.code || await reserveProjectCode(data.projectCode);
    } catch (error) {
      restoreState(beforeState);
      numberingError("invoice", error);
      return;
    }
    let project;
    try {
      project = selectedProject || await findOrCreateProject({ clientId: client.id, serviceId, projectCode, projectName: data.projectName });
    } catch (error) {
      restoreState(beforeState);
      notify("Invoice not saved", userMessageForError(error, "invoice"), "error");
      return;
    }
    const service = CGM.serviceById(state, serviceId);
    const invoice = {
      id: CGM.uid(),
      number,
      clientId: client.id,
      date: data.date,
      dueDate: data.dueDate,
      serviceId,
      projectId: project?.id || "",
      projectCode: project?.code || "",
      incomeAccountId: service?.incomeAccountId || "sales_income",
      notes: data.notes,
      items,
      discount: defaultDiscount(),
      taxRate: defaultTaxRate(),
      status: "issued",
      signatories: defaultDocumentSignatories(true),
      source: "bookkeeping",
    };
    state.invoices.unshift(invoice);
    if (!(await saveOrRollback(beforeState, { action: "create", recordType: "invoice", recordId: invoice.number, before: null, after: invoice }))) return;
    openPostSaveActions("invoice", invoice);
  }

  async function handleBookReceipt(event) {
    event.preventDefault();
    if (!requirePermission("payment", "create")) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const invoice = state.invoices.find((item) => item.id === data.invoiceId);
    if (!invoice) return;
    const amount = CGM.toNumber(data.amount);
    const outstanding = amountDueInvoice(invoice);
    if (amount <= 0 || amount > outstanding + 0.01) {
      openModal("Check payment amount", `<p>The outstanding balance for ${esc(invoice.number)} is ${money.format(outstanding)}. Enter an amount greater than zero and not more than the outstanding balance.</p>`);
      return;
    }
    let receiptNumber;
    try {
      receiptNumber = await officialNumber("receipt", docPrefix("receiptPrefix", "RCT"), state.payments, "receiptNumber", "receipt number");
    } catch (error) {
      numberingError("receipt", error);
      return;
    }
    const beforeState = structuredClone(state);
    const payment = {
      ...data,
      id: CGM.uid(),
      clientId: invoice.clientId,
      projectId: invoice.projectId || "",
      projectCode: invoice.projectCode || "",
      serviceId: invoice.serviceId || "",
      amount,
      receiptNumber,
      status: "paid",
      signatories: structuredClone(invoice.signatories || defaultDocumentSignatories(true)),
      source: "bookkeeping",
    };
    state.payments.unshift(payment);
    if (!(await saveOrRollback(beforeState, { action: "create", recordType: "payment", recordId: payment.receiptNumber, before: null, after: payment }))) return;
    openPostSaveActions("payment", payment);
  }

  async function handleBookExpense(event) {
    event.preventDefault();
    if (!requirePermission("expense", "create")) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const items = collectItems(form);
    if (!items.length) {
      openModal("Expense not saved", "<p>Add at least one expense item with description, quantity, and rate.</p>");
      return;
    }
    const serviceId = items[0]?.serviceId || data.serviceId;
    const service = CGM.serviceById(state, serviceId);
    let reference;
    try {
      reference = await officialNumber("expense", "EXP", state.expenses, "reference", "expense reference");
    } catch (error) {
      numberingError("expense", error);
      return;
    }
    const beforeState = structuredClone(state);
    const expense = { ...data, id: CGM.uid(), reference, serviceId, projectCode: projectLabel(data.projectId, ""), amount: CGM.documentTotal({ items }), items, description: data.description || items.map((item) => item.description).join("; "), expenseAccountId: service?.costAccountId || "general_expenses", paymentMethod: "Paid", status: "paid", source: "bookkeeping" };
    state.expenses.unshift(expense);
    await saveOrRollback(beforeState, { action: "create", recordType: "expense", recordId: expense.reference || expense.id, before: null, after: expense });
  }

  async function handleBookSupplierBill(event) {
    event.preventDefault();
    if (!requirePermission("supplierBill", "create")) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const items = collectItems(form);
    if (!items.length) {
      openModal("Supplier bill not saved", "<p>Add at least one supplier bill item with description, service category, quantity, and rate.</p>");
      return;
    }
    const serviceId = items[0]?.serviceId || data.serviceId;
    const service = CGM.serviceById(state, serviceId);
    let supplier;
    let number;
    try {
      supplier = await findOrCreateSupplier({
        name: data.supplierName,
        email: data.email,
        phone: data.phone,
      });
      number = await officialNumber("supplierBill", docPrefix("supplierBillPrefix", "BILL"), state.supplierBills, "number", "supplier bill number");
    } catch (error) {
      numberingError("supplier bill", error);
      return;
    }
    const bill = {
      id: CGM.uid(),
      number,
      supplierId: supplier.id,
      date: data.date,
      dueDate: data.dueDate,
      serviceId,
      projectId: data.projectId,
      projectCode: projectLabel(data.projectId, ""),
      amount: CGM.documentTotal({ items }),
      items,
      accountId: data.accountId || service?.costAccountId || "general_expenses",
      description: data.description,
      status: "issued",
      source: "bookkeeping",
    };
    state.supplierBills.unshift(bill);
    save({ action: "create", recordType: "supplierBill", recordId: bill.number, before: null, after: bill });
    openPostSaveActions("supplierBill", bill);
  }

  async function handleCashTransfer(event) {
    event.preventDefault();
    if (!requirePermission("cashTransaction", "create")) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (data.fromAccountId === data.toAccountId) {
      openModal("Transfer not saved", "<p>Choose two different accounts for a bank/cash transfer.</p>");
      return;
    }
    let number;
    try {
      number = await officialNumber("cash", "CASH", state.cashTransactions, "number", "cash transaction number");
    } catch (error) {
      numberingError("cash transaction", error);
      return;
    }
    const transfer = {
      ...data,
      id: CGM.uid(),
      number,
      amount: CGM.toNumber(data.amount),
      status: "posted",
    };
    state.cashTransactions.unshift(transfer);
    save({ action: "create", recordType: "cashTransaction", recordId: transfer.number, before: null, after: transfer });
  }

  async function handleJournal(event) {
    event.preventDefault();
    if (!requirePermission("journal", "create")) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const rows = qsa(".journal-row", form).map((row) => ({
      accountId: qs('[name="accountId"]', row).value,
      debit: CGM.toNumber(qs('[name^="debit"]', row).value),
      credit: CGM.toNumber(qs('[name^="credit"]', row).value),
    })).filter((line) => line.debit || line.credit);
    const check = CGM.validateJournal(rows);
    if (!check.balanced || !rows.length) {
      qs("#journalCheck").textContent = `Not balanced: debits ${money.format(check.debit)} / credits ${money.format(check.credit)}`;
      return;
    }
    let number;
    try {
      number = await officialNumber("journal", "JNL", state.journalEntries, "number", "journal number");
    } catch (error) {
      numberingError("journal", error);
      return;
    }
    const journal = { id: CGM.uid(), number, date: data.date, memo: data.memo, lines: rows, status: "posted" };
    state.journalEntries.unshift(journal);
    save({ action: "create", recordType: "journal", recordId: journal.number, before: null, after: journal });
  }

  function openSupplierPayment(supplierId) {
    if (!requirePermission("supplierPayment", "create")) return;
    const supplier = state.suppliers.find((item) => item.id === supplierId);
    const bills = state.supplierBills.filter((bill) => bill.supplierId === supplierId && CGM.billStatus(state, bill) !== "paid");
    openModal("Pay supplier", `<form id="supplierPaymentForm" class="form-grid">
      <label class="field full">Bill<select name="billId">${bills.map((bill) => `<option value="${bill.id}">${bill.number} - ${money.format(bill.amount - CGM.supplierBillPaid(state, bill.id))}</option>`).join("")}</select></label>
      ${input("date", "Payment date", "date", true, CGM.today())}
      ${input("amount", "Amount", "number", true, "", "0.01")}
      ${input("reference", "Reference (auto if blank)", "text", false, "")}
      <label class="field full">Paid from<select name="bankAccountId">${accountOptions(["Bank accounts", "Cash accounts"])}</select></label>
      <div class="actions full"><button class="primary-button" type="submit">Save payment</button></div>
    </form>`);
    qs("#supplierPaymentForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const bill = state.supplierBills.find((item) => item.id === data.billId);
      const outstanding = bill ? Math.max(0, CGM.toNumber(bill.amount) - CGM.supplierBillPaid(state, bill.id)) : 0;
      const amount = CGM.toNumber(data.amount);
      if (!bill || amount <= 0 || amount > outstanding) {
        openModal("Payment not saved", `<p>Enter an amount greater than zero and not more than the outstanding supplier balance of ${money.format(outstanding)}.</p>`);
        return;
      }
      if (!data.reference) {
        try {
          data.reference = await officialNumber("supplierPayment", "SPAY", state.supplierPayments, "reference", "supplier payment reference");
        } catch (error) {
          numberingError("supplier payment", error);
          return;
        }
      }
      const payment = { ...data, id: CGM.uid(), supplierId, amount, status: "paid" };
      state.supplierPayments.unshift(payment);
      closeModal();
      save({ action: "create", recordType: "supplierPayment", recordId: payment.reference || payment.id, before: null, after: payment });
    });
  }

  function approveQuotation(id) {
    const quote = state.quotations.find((item) => item.id === id);
    if (!quote || quote.status === "invoiced") return;
    if (!["Super Admin", "Director"].includes(currentUser().role)) {
      notify("Approval restricted", "Only an authorised Director or Super Admin session can apply the approved-by signature.", "error");
      return;
    }
    if (!requirePermission("quotation", "edit", quote)) return;
    const before = structuredClone(quote);
    const prepared = quote.signatories?.preparedBy || defaultDocumentSignatories(false).preparedBy;
    const approved = defaultDocumentSignatories(true).approvedBy;
    state.quotations = state.quotations.map((item) => (item.id === id ? { ...item, status: "approved", signatories: { preparedBy: prepared, approvedBy: approved } } : item));
    save({ action: "approve", recordType: "quotation", recordId: quote.number, before, after: state.quotations.find((item) => item.id === id), reason: "Quotation approved for invoicing" });
  }

  async function transferQuotationToInvoice(id) {
    const quote = state.quotations.find((item) => item.id === id);
    if (!quote) return;
    if (!requirePermission("invoice", "create")) return;
    if (quote.invoiceId || quote.status === "invoiced") {
      openModal("Already transferred", "<p>This quotation has already been transferred to an invoice.</p>");
      return;
    }
    if (quote.status !== "approved") {
      openModal("Approval required", "<p>Approve the quotation before transferring it to an invoice.</p>");
      return;
    }
    const beforeState = structuredClone(state);
    let client;
    let project;
    let number;
    try {
      client = quote.clientId
        ? state.clients.find((item) => item.id === quote.clientId)
        : await findOrCreateClient(quote.clientSnapshot || { name: quotationClientName(quote) });
      if (!client) throw new Error("Linked quotation client was not found.");
      project = quote.projectId
        ? state.projects.find((item) => item.id === quote.projectId)
        : await findOrCreateProject({ clientId: client.id, serviceId: quote.serviceId, projectCode: quote.projectCode, projectName: quote.projectName || quote.items?.[0]?.description });
      if (quote.projectId && !project) throw new Error("Linked quotation project was not found.");
      number = await officialNumber("invoice", docPrefix("invoicePrefix", "INV"), state.invoices, "number", "invoice number");
    } catch (error) {
      restoreState(beforeState);
      notify("Invoice not created", userMessageForError(error, "transfer"), "error");
      return;
    }
    const service = CGM.serviceById(state, quote.serviceId);
    const invoice = {
      id: CGM.uid(),
      number,
      clientId: client.id,
      quotationId: quote.id,
      date: CGM.today(),
      dueDate: defaultDueDate(CGM.today()),
      serviceId: quote.serviceId,
      projectId: project?.id || "",
      projectCode: project?.code || quote.projectCode || "",
      incomeAccountId: service?.incomeAccountId || "sales_income",
      notes: `Transferred from quotation ${quote.number}. ${quote.notes || ""}`.trim(),
      items: quote.items || [],
      discount: quote.discount || defaultDiscount(),
      taxRate: quote.taxRate !== undefined ? quote.taxRate : defaultTaxRate(),
      status: "issued",
      signatories: structuredClone(quote.signatories || defaultDocumentSignatories(true)),
      source: "bookkeeping",
    };
    state.invoices.unshift(invoice);
    state.quotations = state.quotations.map((item) => (item.id === id ? { ...item, status: "invoiced", clientId: client.id, projectId: project?.id || "", projectCode: project?.code || quote.projectCode || "", invoiceId: invoice.id } : item));
    await saveOrRollback(beforeState, { action: "transfer-to-invoice", recordType: "quotation", recordId: quote.number, before: quote, after: { quote: state.quotations.find((item) => item.id === id), invoice }, reason: "Approved quotation converted to invoice" });
  }

  async function findOrCreateClient(snapshot) {
    const cleanName = String(snapshot.name || "").trim();
    const cleanEmail = String(snapshot.email || "").trim().toLowerCase();
    const existing = state.clients.find((client) => {
      const sameEmail = cleanEmail && String(client.email || "").toLowerCase() === cleanEmail;
      const sameName = cleanName && String(client.name || "").toLowerCase() === cleanName.toLowerCase();
      return sameEmail || sameName;
    });
    if (existing) return existing;
    const number = await officialNumber("clientNumber", "C", state.clients, "number", "client number");
    const code = snapshot.code || await officialNumber("clientCode", "CL", state.clients, "code", "client code", { period: periodKey(CGM.today()) });
    const client = {
      id: CGM.uid(),
      number,
      code,
      name: cleanName || "New client",
      contact: snapshot.contact || "",
      email: snapshot.email || "",
      phone: snapshot.phone || "",
      address: snapshot.address || "",
      openingBalance: 0,
      createdAt: CGM.today(),
      source: "bookkeeping",
    };
    state.clients.unshift(client);
    return client;
  }

  async function findOrCreateProject({ clientId, serviceId, projectCode, projectName }) {
    const cleanCode = String(projectCode || "").trim();
    const existing = state.projects.find((project) => cleanCode && String(project.code).toLowerCase() === cleanCode.toLowerCase());
    const validClient = clientId ? state.clients.find((client) => client.id === clientId) : null;
    if (clientId && !validClient) {
      throw new Error("Project could not be linked because the selected client record does not exist.");
    }
    if (existing) {
      if (validClient && existing.clientId && existing.clientId !== validClient.id) {
        throw new Error("This project code already belongs to a different client. Use a new project code for this client's project.");
      }
      if (validClient && !existing.clientId) existing.clientId = validClient.id;
      return existing;
    }
    if (!cleanCode && !projectName) return null;
    const code = cleanCode || await officialNumber("projectCode", "PRJ", state.projects, "code", "project code", { period: periodKey(CGM.today()) });
    const project = {
      id: CGM.uid(),
      code,
      name: projectName || cleanCode || "Unnamed project",
      clientId: validClient?.id || "",
      serviceId: serviceId || "",
      status: "active",
      createdAt: CGM.today(),
    };
    syncCounterFromCode(state, "project", project.code);
    state.projects.unshift(project);
    return project;
  }

  async function findOrCreateSupplier(snapshot) {
    const cleanName = String(snapshot.name || "").trim();
    const cleanEmail = String(snapshot.email || "").trim().toLowerCase();
    const existing = state.suppliers.find((supplier) => {
      const sameEmail = cleanEmail && String(supplier.email || "").toLowerCase() === cleanEmail;
      const sameName = cleanName && String(supplier.name || "").toLowerCase() === cleanName.toLowerCase();
      return sameEmail || sameName;
    });
    if (existing) return existing;
    const supplier = {
      id: CGM.uid(),
      number: await officialNumber("supplier", "S", state.suppliers, "number", "supplier number"),
      name: cleanName || "New supplier",
      contact: "",
      email: snapshot.email || "",
      phone: snapshot.phone || "",
      address: "",
      openingBalance: 0,
      createdAt: CGM.today(),
      source: "bookkeeping",
    };
    state.suppliers.unshift(supplier);
    return supplier;
  }

  function clientSnapshotFromEntry(data) {
    return buildClientSnapshot(data);
  }

  function quotationClientName(quote) {
    return lookupQuotationClientName(state, quote);
  }

  function openInvoiceOptions() {
    const openInvoices = state.invoices.filter((invoice) => CGM.isPostedInvoice(invoice) && CGM.invoiceStatus(state, invoice) !== "paid");
    if (!openInvoices.length) return `<option value="">No unpaid invoices available</option>`;
    return openInvoices.map((invoice) => `<option value="${invoice.id}">${invoice.number} - ${esc(clientName(invoice.clientId))} - ${money.format(CGM.documentTotal(invoice) - CGM.invoicePaid(state, invoice.id))}</option>`).join("");
  }

  function openPostSaveActions(typeName, record) {
    const isDocument = ["quotation", "invoice", "payment", "receipt"].includes(typeName);
    const registerView = typeName === "quotation" ? "bookQuotations" : typeName === "invoice" ? "bookInvoices" : ["payment", "receipt"].includes(typeName) ? "bookReceipts" : typeName === "supplierBill" ? "bookExpenses" : "bookDashboard";
    const recordId = record.id;
    openModal(`${title(typeName)} saved`, `<div class="success-panel">
      <i data-lucide="check-circle-2"></i>
      <div><h3>${esc(recordNumber(typeName, record))} saved successfully</h3><p>Choose the next action for this record.</p></div>
    </div>
    <div class="quick-actions-grid">
      ${isDocument ? `<button class="secondary-button" data-preview-document="${typeName === "receipt" ? "payment" : typeName}" data-id="${recordId}"><i data-lucide="eye"></i>Preview PDF</button>` : ""}
      ${isDocument ? `<button class="secondary-button" data-export-document="${typeName === "receipt" ? "payment" : typeName}" data-id="${recordId}" data-format="pdf"><i data-lucide="file-down"></i>Download PDF</button>` : ""}
      ${typeName === "invoice" ? `<button class="primary-button" data-go-view="sales"><i data-lucide="receipt"></i>Record Payment</button>` : ""}
      <button class="secondary-button" data-go-view="${registerView}"><i data-lucide="list"></i>View Register</button>
      <button class="secondary-button" data-modal-cancel><i data-lucide="plus"></i>Create Another</button>
      <button class="secondary-button" data-go-view="${activePortal === "management" ? "dashboard" : "bookDashboard"}"><i data-lucide="layout-dashboard"></i>Dashboard</button>
    </div>`);
  }

  function recentBookkeepingRows() {
    const rows = [
      ...activeItems(state.quotations).map((quote) => [quote.date, "Quotation", quote.number, quotationClientName(quote), money.format(CGM.documentTotal(quote)), quote.status === "invoiced" ? "Transferred to invoice" : "No ledger posting yet"]),
      ...state.invoices.filter(CGM.isPostedInvoice).map((invoice) => [invoice.date, "Invoice", invoice.number, clientName(invoice.clientId), money.format(CGM.documentTotal(invoice)), "Dr Debtors Control / Cr Income"]),
      ...activeItems(state.payments).map((payment) => [payment.date, "Receipt", payment.receiptNumber, clientName(payment.clientId), money.format(payment.amount), "Dr Bank/Cash / Cr Debtors Control"]),
      ...activeItems(state.expenses).map((expense) => [expense.date, "Expense", expense.reference || expense.category, expense.vendor || "", money.format(expense.amount), "Dr Expense / Cr Bank/Cash"]),
      ...activeItems(state.supplierBills).map((bill) => [bill.date, "Supplier bill", bill.number, supplierName(bill.supplierId), money.format(bill.amount), "Dr Expense/Asset / Cr Creditors Control"]),
    ];
    return rows.sort((a, b) => String(b[0]).localeCompare(String(a[0]))).slice(0, 12);
  }

  function openStatement(typeName, id) {
    const statement = typeName === "client" ? CGM.clientStatement(state, id) : CGM.supplierStatement(state, id);
    const name = statement.client?.name || statement.supplier?.name || "";
    const rows = statement.rows.map((row) => [row.date, row.type, row.number, money.format(row.debit), money.format(row.credit), money.format(row.balance)]);
    openModal(`${name} Statement`, `
      <div class="export-actions"><button class="secondary-button" data-export-statement="${typeName}" data-id="${id}" data-format="pdf">Export PDF</button><button class="secondary-button" data-export-statement="${typeName}" data-id="${id}" data-format="excel">Export Excel</button></div>
      ${miniReportTable("Statement of Account", rows, ["Date", "Type", "Number", "Invoices/Debits", "Payments/Credits", "Balance"])}
      <div class="total-line"><span>Balance carried forward</span><span>${money.format(statement.balance)}</span></div>
    `);
  }

  async function exportReport(key, format, statementType = "", statementId = "") {
    const report = getReport(key, statementType, statementId);
    if (format === "pdf" && statementType === "client") return await exportReliablePdf("client-statement", statementId, `${report.title}.pdf`);
    if (format === "excel") {
      await exportReliableExcel("report", { report, context: exportContext(), filename: `${report.title}.xlsx` }, `${report.title}.xlsx`);
      return;
    }
    await exportReliablePdf("report", "", `${report.title}.pdf`, { report, context: exportContext(), filename: `${report.title}.pdf` });
  }

  async function exportDocument(typeName, id, format = "pdf") {
    if (!requirePermission(typeName, "export")) return;
    const report = getDocumentReport(typeName, id);
    if (!report) return;
    if (format === "pdf" && ["quotation", "invoice", "receipt", "payment"].includes(typeName)) {
      await exportReliablePdf(typeName === "payment" ? "receipt" : typeName, id, `${report.title}.pdf`);
      return;
    }
    if (format === "excel") {
      await exportReliableExcel("report", { report, context: exportContext(), filename: `${report.title}.xlsx` }, `${report.title}.xlsx`);
      return;
    }
    await exportReliablePdf("report", "", `${report.title}.pdf`, { report, context: exportContext(), filename: `${report.title}.pdf` });
  }

  async function exportReliableExcel(kind, payload, filename) {
    const backendBlob = await getProfessionalExcelBlob(payload);
    if (backendBlob) {
      downloadBlob(backendBlob, filename);
      notify("Excel report ready", "Generated a formatted workbook with office-ready headings, filters, frozen headers, and totals.", "success");
      return true;
    }
    try {
      const blob = await buildFrontendExcelBlob(kind, payload);
      downloadBlob(blob, filename);
      notify("Excel ready", "Backend export unavailable. Generated using local office-ready export.", "warning");
      return true;
    } catch (error) {
      console.error("Local Excel export failed", error);
      notify("Excel not generated", "The workbook could not be generated. Please try again.", "error");
      return false;
    }
  }

  async function getProfessionalExcelBlob(payload) {
    try {
      const blob = await exportReportExcel({
        ...payload,
        report: {
          ...(payload.report || {}),
          generatedAt: new Date().toISOString(),
        },
      });
      const validation = await validateExcelBlob(blob);
      if (!validation.ok) throw new Error(validation.reason);
      return blob;
    } catch (error) {
      console.debug("Backend Excel export unavailable", error);
      return null;
    }
  }

  async function previewDocument(typeName, id) {
    if (!requirePermission(typeName, "preview")) return;
    const report = getDocumentReport(typeName, id);
    if (!report) return;
    const result = ["quotation", "invoice", "receipt", "payment"].includes(typeName)
      ? await getReliablePdfBlob(typeName === "payment" ? "receipt" : typeName, id, `${report.title}.pdf`)
      : null;
    if (!result?.blob) {
      notify("Preview unavailable", "The PDF could not be prepared from the backend or browser fallback.", "error");
      return;
    }
    const url = URL.createObjectURL(result.blob);
    openModal(`Preview ${report.title}`, `<div class="pdf-preview">
      <iframe src="${url}" title="${esc(report.title)} preview"></iframe>
      <div class="actions"><button class="primary-button" data-export-document="${typeName}" data-id="${id}" data-format="pdf"><i data-lucide="file-down"></i>Download PDF</button><button class="secondary-button" type="button" data-modal-cancel>Close</button></div>
    </div>`);
    qs("#modalBackdrop").dataset.previewUrl = url;
  }

  async function exportReliablePdf(kind, id, filename, directPayload = null) {
    const result = await getReliablePdfBlob(kind, id, filename, directPayload);
    if (!result?.blob) {
      notify("PDF not generated", "The document could not be generated from the backend or browser fallback.", "error");
      return false;
    }
    downloadBlob(result.blob, filename);
    notify(result.source === "backend" ? "Professional PDF ready" : "PDF ready", result.source === "backend" ? "Generated through the Civil-Gineer Masta export backend." : "Backend export unavailable. Generated using local office-ready export.", result.source === "backend" ? "success" : "warning");
    return true;
  }

  async function getReliablePdfBlob(kind, id, filename, directPayload = null) {
    const payload = directPayload || buildProfessionalExportPayload(kind, id, filename);
    if (!payload) return null;
    const backendBlob = await getProfessionalPdfBlob(kind, payload);
    if (backendBlob) return { blob: backendBlob, source: "backend" };
    const fallbackBlob = await buildFrontendPdfBlob(kind, payload);
    return fallbackBlob ? { blob: fallbackBlob, source: "browser" } : null;
  }

  async function getProfessionalPdfBlob(kind, payload) {
    try {
      let blob = null;
      if (kind === "quotation") blob = await exportQuotationPdf(payload);
      else if (kind === "invoice") blob = await exportInvoicePdf(payload);
      else if (kind === "receipt") blob = await exportReceiptPdf(payload);
      else if (kind === "client-statement") blob = await exportClientStatementPdf(payload);
      else if (kind === "report") blob = await exportGenericPdf({ documentType: "report", kind: "report", ...payload });
      if (!blob) return null;
      const validation = await validatePdfBlob(blob);
      if (!validation.ok) throw new Error(validation.reason);
      return blob;
    } catch (error) {
      console.debug("Backend PDF export unavailable", error);
      return null;
    }
  }

  function buildProfessionalExportPayload(kind, id, filename) {
    const context = exportContext();
    if (kind === "quotation") {
      const document = state.quotations.find((item) => item.id === id);
      return document ? { document, context, filename } : null;
    }
    if (kind === "invoice") {
      const invoice = state.invoices.find((item) => item.id === id);
      return invoice ? { document: { ...invoice, amountPaid: CGM.invoicePaid(state, invoice.id) }, context, filename } : null;
    }
    if (kind === "receipt") {
      const receipt = state.payments.find((item) => item.id === id);
      return receipt ? { receipt, context, filename } : null;
    }
    if (kind === "client-statement") {
      const statement = CGM.clientStatement(state, id);
      if (!statement?.client) return null;
      return {
        statement: {
          client: statement.client,
          rows: statement.rows,
          balance: statement.balance,
          openingBalance: statement.openingBalance || statement.client.openingBalance || 0,
          fromDate: "",
          toDate: CGM.today(),
          statementNumber: `${docPrefix("statementPrefix", "ST")}-${String((state.counters?.statement || 1)).padStart(4, "0")}`,
        },
        context,
        filename,
      };
    }
    return null;
  }

  function exportContext() {
    const currentSettings = settings();
    return {
      settings: {
        companyProfile: currentSettings.companyProfile,
        documentSignatories: currentSettings.documentSignatories,
        documentSettings: {
          ...currentSettings.documentSettings,
          currency: currentSettings.documentSettings.currency || "BWP",
          vatEnabled: !!currentSettings.documentSettings.vatEnabled,
          vatRate: CGM.toNumber(currentSettings.documentSettings.vatRate),
          defaultDiscount: CGM.toNumber(currentSettings.documentSettings.defaultDiscount),
        },
      },
      clients: activeItems(state.clients, true),
      projects: activeItems(state.projects, true),
      services: state.services || [],
      invoices: activeItems(state.invoices, true).map((invoice) => ({ ...invoice, amountPaid: CGM.invoicePaid(state, invoice.id) })),
      payments: activeItems(state.payments, true),
    };
  }

  function getReport(key, statementType, statementId) {
    if (statementType) {
      const s = statementType === "client" ? CGM.clientStatement(state, statementId) : CGM.supplierStatement(state, statementId);
      return { title: `${statementType === "client" ? s.client?.name : s.supplier?.name} Statement`, headers: ["Date", "Type", "Number", "Debit", "Credit", "Balance"], rows: s.rows.map((r) => [r.date, r.type, r.number, money.format(r.debit), money.format(r.credit), money.format(r.balance)]) };
    }
    const map = {
      "dashboard-summary": ["Dashboard Summary", ["Area", "Value"], dashboardSummaryRows()],
      "client-statements": ["Client Statements", ["Client", "Balance"], statementSummaryRows("client")],
      "supplier-statements": ["Supplier Statements", ["Supplier", "Balance"], statementSummaryRows("supplier")],
      cashbook: ["Cashbook", ["Date", "Source", "Description", "Money in", "Money out", "Balance"], cashbookRows()],
      "general-ledger": ["General Ledger", ["Date", "Account", "Document", "Description", "Debit", "Credit"], CGM.ledgerEntries(state).map((e) => [e.date, accountName(e.accountId), e.documentNumber, e.description, money.format(e.debit), money.format(e.credit)])],
      "trial-balance": ["Trial Balance", ["Account", "Debit", "Credit"], trialRows()],
      "income-statement": ["Income Statement", ["Line", "Amount"], incomeRows()],
      "balance-sheet": ["Balance Sheet", ["Line", "Amount"], balanceRows()],
      "cash-flow": ["Cash Flow Statement", ["Section", "Inflows", "Outflows", "Net"], cashFlowRows()],
      "project-profitability": ["Project Profitability", ["Project", "Client", "Service", "Income", "Direct costs", "Profit / loss"], projectProfitRows()],
      "service-profitability": ["Service Profitability", ["Service", "Income", "Direct costs", "Profit / loss"], serviceProfitRows()],
      "debtors-ageing": ["Debtors Ageing Report", ["Bucket", "Amount"], ageingRows("debtors")],
      "creditors-ageing": ["Creditors Ageing Report", ["Bucket", "Amount"], ageingRows("creditors")],
    };
    const item = map[key] || map["trial-balance"];
    return { title: item[0], headers: item[1], rows: item[2] };
  }

  function getDocumentReport(typeName, id) {
    const company = settings().companyProfile;
    const bank = company.bankingDetails;
    if (typeName === "quotation") {
      const quote = state.quotations.find((item) => item.id === id);
      if (!quote) return null;
      return documentReport("Quotation", quote.number, quotationClientName(quote), quote.projectName || projectLabel(quote.projectId, quote.projectCode), quote.date, quote.validUntil, quote.items, quote.notes);
    }
    if (typeName === "invoice") {
      const invoice = state.invoices.find((item) => item.id === id);
      if (!invoice) return null;
      return documentReport("Invoice", invoice.number, clientName(invoice.clientId), projectLabel(invoice.projectId, invoice.projectCode), invoice.date, invoice.dueDate, invoice.items, invoice.notes, CGM.invoicePaid(state, invoice.id));
    }
    if (typeName === "payment" || typeName === "receipt") {
      const payment = state.payments.find((item) => item.id === id);
      if (!payment) return null;
      return { title: `Receipt ${payment.receiptNumber}`, headers: ["Field", "Value"], rows: [["Company", company.name], ["Client", clientName(payment.clientId)], ["Receipt number", payment.receiptNumber], ["Date", payment.date], ["Amount paid", money.format(payment.amount)], ["Method", payment.method || ""], ["Reference", payment.reference || ""], ["Prepared by", company.preparedBy], ["Bank", `${bank.bank} | ${bank.accountNumber}`], ["Terms", company.defaultTerms]] };
    }
    if (typeName === "supplierBill") {
      const bill = state.supplierBills.find((item) => item.id === id);
      if (!bill) return null;
      return { title: `Supplier Bill ${bill.number}`, headers: ["Field", "Value"], rows: [["Supplier", supplierName(bill.supplierId)], ["Bill number", bill.number], ["Date", bill.date], ["Due date", bill.dueDate || ""], ["Description", bill.description || ""], ["Amount", money.format(bill.amount)], ["Status", title(CGM.billStatus(state, bill))]] };
    }
    return null;
  }

  function documentReport(kind, number, client, project, date, dueDate, items = [], notes = "", paid = 0) {
    const company = settings().companyProfile;
    const subtotal = (items || []).reduce((sum, item) => sum + CGM.lineTotal(item), 0);
    const total = CGM.documentTotal({ items });
    const rows = [
      ["Company", company.name],
      ["Client", client],
      ["Project / location", project || ""],
      [`${kind} number`, number],
      ["Date", date || ""],
      ["Due / valid until", dueDate || ""],
      ...items.map((item) => [item.description, `${item.qty || 1} x ${money.format(item.rate || 0)}`]),
      ["Subtotal", money.format(subtotal)],
      ["Amount paid", money.format(paid)],
      ["Balance due", money.format(Math.max(0, total - paid))],
      ["Total", money.format(total)],
      ["Payment terms", settings().documentSettings.defaultPaymentTerms],
      ["Notes", notes || company.defaultNotes],
      ["Banking details", `${company.bankingDetails.bank}, ${company.bankingDetails.accountHolder}, ${company.bankingDetails.accountNumber}, Branch ${company.bankingDetails.branchCode}`],
      ["Prepared by", company.preparedBy],
      ["Approved by", company.approvedBy || ""],
    ];
    return { title: `${kind} ${number}`, headers: ["Field", "Value"], rows };
  }

  function dashboardSummaryRows() {
    const d = dashboardModel();
    return [
      ["Today", formatLongDate(CGM.today())],
      ["Current period", d.period.label],
      ["Financial year", d.financialYear],
      ["Business health", `${d.health.status} (${d.health.score}/100)`],
      ["Total invoiced this period", money.format(d.periodInvoiced)],
      ["Payments received this period", money.format(d.periodPayments)],
      ["Expenses this period", money.format(d.periodExpenses)],
      ["Net cash this period", money.format(d.periodNetCash)],
      ["Outstanding debtors", money.format(d.debtors)],
      ["Creditors owing", money.format(d.creditors)],
      ["Net profit/loss", money.format(d.netProfitLoss)],
      ["Bank + cash balance", money.format(d.bankCashBalance)],
      ["Overdue invoices", `${d.overdueCount} (${money.format(d.overdueAmount)})`],
      ...d.alerts.map((alert) => [`Alert: ${alert.title}`, alert.message]),
      ...d.decisionRows.map((row) => [`Decision: ${row[0]}`, row[1]]),
    ];
  }

  function trialRows() {
    return CGM.trialBalance(state).map((row) => [`${row.code} - ${row.name}`, money.format(row.debit), money.format(row.credit)]);
  }

  function incomeRows() {
    const r = CGM.incomeStatement(state);
    return [["Income", money.format(r.income)], ["Cost of sales", money.format(r.costOfSales)], ["Gross profit", money.format(r.grossProfit)], ["Operating expenses", money.format(r.operatingExpenses)], ["Net profit/loss", money.format(r.netProfit)]];
  }

  function balanceRows() {
    const r = CGM.balanceSheet(state);
    return [["Assets", money.format(r.assets)], ["Liabilities", money.format(r.liabilities)], ["Equity including profit", money.format(r.equity)], ["Liabilities + Equity", money.format(r.totalLiabilitiesEquity)], ["Balance check difference", money.format(r.difference)]];
  }

  function cashFlowRows() {
    const r = CGM.cashFlow(state);
    return [["Operating", money.format(r.operating.inflows), money.format(r.operating.outflows), money.format(r.operating.net)], ["Investing", money.format(0), money.format(0), money.format(0)], ["Financing", money.format(0), money.format(0), money.format(0)], ["Net cash flow", "", "", money.format(r.netCashFlow)]];
  }

  function cashbookRows() {
    return CGM.cashbook(state).map((row) => [row.date, row.sourceType, row.description, money.format(row.moneyIn), money.format(row.moneyOut), money.format(row.balance)]);
  }

  function statementSummaryRows(typeName) {
    const list = typeName === "client" ? state.clients : state.suppliers;
    return list.map((item) => [item.name, money.format(typeName === "client" ? CGM.clientStatement(state, item.id).balance : CGM.supplierStatement(state, item.id).balance)]);
  }

  function ageingRows(typeName) {
    const buckets = typeName === "debtors"
      ? CGM.ageing(state.invoices.filter((invoice) => CGM.isPostedInvoice(invoice) && CGM.invoiceStatus(state, invoice) !== "paid"), (invoice) => invoice.dueDate, (invoice) => amountDueInvoice(invoice))
      : CGM.ageing(state.supplierBills.filter((bill) => CGM.isActiveRecord(bill) && CGM.billStatus(state, bill) !== "paid"), (bill) => bill.dueDate || bill.date, (bill) => CGM.toNumber(bill.amount) - CGM.supplierBillPaid(state, bill.id));
    return [["Current / 0-30", money.format(buckets.current)], ["31-60", money.format(buckets.d30)], ["61-90", money.format(buckets.d60)], ["90+", money.format(buckets.d90)]];
  }

  function input(name, label, type = "text", required = false, value = "", step = "") {
    return `<label class="field">${label}<input name="${name}" type="${type}" ${required ? "required" : ""} ${step ? `step="${step}"` : ""} value="${esc(value)}"></label>`;
  }

  function generatedInput(name, label, value) {
    return `<label class="field generated-field">${label}<input name="${name}" type="text" value="${esc(value)}" readonly><span>Auto-generated</span></label>`;
  }

  function badge(status) {
    const normalized = String(status || "active").toLowerCase().trim().replace(/\s+/g, "-");
    return `<span class="status ${normalized}">${title(normalized)}</span>`;
  }

  function title(value) {
    return String(value)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replaceAll("-", " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
  }

  function formatDateTime(value) {
    return formatDateTimeValue(value);
  }

  function filterTable(tableId, query) {
    filterTableRows(document, tableId, query);
  }

  function clientName(id) {
    return lookupClientName(state, id);
  }

  function accountName(id) {
    return lookupAccountName(state, id) || id;
  }

  function supplierName(id) {
    return lookupSupplierName(state, id);
  }

  function serviceName(id) {
    return lookupServiceName(state, id);
  }

  function projectLabel(projectId, fallback = "") {
    return lookupProjectLabel(state, projectId, fallback);
  }

  function suggestedProjectCode() {
    return previewPeriodCode(state, "project", "PRJ", CGM.today());
  }

  function suggestedClientCode() {
    return previewPeriodCode(state, "client", "CL", CGM.today());
  }

  async function reserveProjectCode(code) {
    const cleanCode = String(code || "").trim();
    if (!cleanCode) return await officialNumber("projectCode", "PRJ", state.projects, "code", "project code", { period: periodKey(CGM.today()) });
    const preview = previewPeriodCode(state, "project", "PRJ", CGM.today());
    if (cleanCode === preview) {
      return await officialNumber("projectCode", "PRJ", state.projects, "code", "project code", { period: periodKey(CGM.today()) });
    }
    if (state.projects.some((project) => String(project.code || "").toLowerCase() === cleanCode.toLowerCase())) {
      return await officialNumber("projectCode", "PRJ", state.projects, "code", "project code", { period: periodKey(CGM.today()) });
    }
    return reservePreviewedPeriodCode(state, "project", "PRJ", cleanCode, CGM.today());
  }

  async function officialNumber(key, prefix, records, field, label, options = {}) {
    return await nextOfficialNumber({ state, key, prefix, period: options.period || "", records, field, label });
  }

  function numberingError(label, error) {
    notify("Numbering failed", error.message || `Could not generate a safe ${label} number. Please try again.`, "error");
  }

  function docPrefix(key, fallback) {
    return settings().documentSettings?.[key] || fallback;
  }

  function defaultTaxRate() {
    const doc = settings().documentSettings;
    return doc.vatEnabled ? CGM.toNumber(doc.vatRate) : 0;
  }

  function defaultDiscount() {
    return CGM.toNumber(settings().documentSettings.defaultDiscount);
  }

  function addDays(dateValue, days) {
    const date = new Date(`${dateValue || CGM.today()}T00:00:00`);
    date.setDate(date.getDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
  }

  function defaultDueDate(fromDate = CGM.today()) {
    return addDays(fromDate, settings().documentSettings.defaultPaymentTermsDays || 7);
  }

  function projectProfitRows() {
    return activeItems(state.projects, true).map((project) => {
      const row = projectProfitRowsRaw(project);
      return [projectLabel(project.id), clientName(project.clientId), serviceName(project.serviceId), money.format(row.income), money.format(row.costs), money.format(row.profit)];
    });
  }

  function projectProfitRowsRaw(project) {
    const income = state.invoices.filter((invoice) => invoice.projectId === project.id && CGM.isPostedInvoice(invoice)).reduce((sum, invoice) => sum + CGM.documentTotal(invoice), 0);
    const paidExpenses = state.expenses.filter((expense) => expense.projectId === project.id && CGM.isActiveRecord(expense)).reduce((sum, expense) => sum + CGM.toNumber(expense.amount), 0);
    const supplierBills = state.supplierBills.filter((bill) => bill.projectId === project.id && CGM.isActiveRecord(bill)).reduce((sum, bill) => sum + CGM.toNumber(bill.amount), 0);
    return { income, costs: paidExpenses + supplierBills, profit: income - paidExpenses - supplierBills };
  }

  function serviceProfitRows() {
    return (state.services || []).map((service) => {
      const income = state.invoices.filter((invoice) => invoice.serviceId === service.id && CGM.isPostedInvoice(invoice)).reduce((sum, invoice) => sum + CGM.documentTotal(invoice), 0);
      const paidExpenses = state.expenses.filter((expense) => expense.serviceId === service.id && CGM.isActiveRecord(expense)).reduce((sum, expense) => sum + CGM.toNumber(expense.amount), 0);
      const supplierBills = state.supplierBills.filter((bill) => bill.serviceId === service.id && CGM.isActiveRecord(bill)).reduce((sum, bill) => sum + CGM.toNumber(bill.amount), 0);
      return [service.name, money.format(income), money.format(paidExpenses + supplierBills), money.format(income - paidExpenses - supplierBills)];
    });
  }

  function groupBy(items, key) {
    return items.reduce((groups, item) => {
      groups[item[key]] = groups[item[key]] || [];
      groups[item[key]].push(item);
      return groups;
    }, {});
  }

  function openModal(titleText, body) {
    qs("#modalTitle").textContent = titleText;
    qs("#modalBody").innerHTML = body;
    qs("#modalBackdrop").hidden = false;
    if (window.lucide) lucide.createIcons();
  }

  function closeModal() {
    const previewUrl = qs("#modalBackdrop").dataset.previewUrl;
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      delete qs("#modalBackdrop").dataset.previewUrl;
    }
    qs("#modalBackdrop").hidden = true;
    pendingConfirmAction = null;
  }

  function openConfirmModal({ titleText, message, confirmLabel = "Confirm", tone = "danger", reasonRequired = false, onConfirm }) {
    pendingConfirmAction = onConfirm;
    openModal(titleText, `<form id="confirmActionForm" class="form-grid">
      <div class="confirm-panel full ${esc(tone)}">
        <i data-lucide="${tone === "danger" ? "triangle-alert" : "info"}"></i>
        <p>${esc(message)}</p>
      </div>
      ${reasonRequired ? `<label class="field full">Reason for this action<textarea name="reason" required placeholder="Explain why this change is needed for the audit trail."></textarea></label>` : `<input type="hidden" name="reason" value="Confirmed by user">`}
      <div class="actions full">
        <button class="${tone === "danger" ? "danger-button" : "primary-button"}" type="submit">${esc(confirmLabel)}</button>
        <button class="secondary-button" type="button" data-modal-cancel>Cancel</button>
      </div>
    </form>`);
    qs("#confirmActionForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const action = pendingConfirmAction;
      pendingConfirmAction = null;
      closeModal();
      if (action) await action(data.reason || "Confirmed by user");
    });
  }

  function recordCollection(typeName) {
    const map = {
      client: "clients",
      supplier: "suppliers",
      project: "projects",
      quotation: "quotations",
      invoice: "invoices",
      payment: "payments",
      receipt: "payments",
      expense: "expenses",
      supplierBill: "supplierBills",
      supplierPayment: "supplierPayments",
      journal: "journalEntries",
      cashTransaction: "cashTransactions",
      user: "users",
    };
    return map[typeName];
  }

  function recordNumber(typeName, record) {
    return record?.number || record?.receiptNumber || record?.reference || record?.id || typeName;
  }

  function editableFieldConfig(typeName) {
    return {
      client: [["name", "Client name"], ["code", "Client code"], ["contact", "Contact person"], ["email", "Email"], ["phone", "Phone"], ["address", "Address", "textarea"], ["openingBalance", "Opening balance", "number"]],
      supplier: [["name", "Supplier name"], ["contact", "Contact person"], ["email", "Email"], ["phone", "Phone"], ["address", "Address", "textarea"], ["openingBalance", "Opening balance", "number"]],
      project: [["code", "Project code"], ["name", "Project name"], ["location", "Location"], ["status", "Status"], ["startDate", "Start date", "date"], ["expectedCompletionDate", "Expected completion", "date"], ["notes", "Notes", "textarea"]],
      quotation: [["date", "Date", "date"], ["validUntil", "Valid until", "date"], ["status", "Status"], ["projectCode", "Project code"], ["projectName", "Project name"], ["notes", "Notes", "textarea"], ["items", "Items JSON", "textarea-json"]],
      invoice: [["date", "Invoice date", "date"], ["dueDate", "Due date", "date"], ["status", "Status"], ["projectCode", "Project code"], ["notes", "Notes", "textarea"], ["items", "Items JSON", "textarea-json"], ["discount", "Discount", "number"], ["taxRate", "VAT / tax %", "number"]],
      payment: [["date", "Payment date", "date"], ["amount", "Amount", "number"], ["method", "Method"], ["reference", "Reference"], ["status", "Status"]],
      receipt: [["date", "Receipt date", "date"], ["amount", "Amount", "number"], ["method", "Method"], ["reference", "Reference"], ["status", "Status"]],
      expense: [["date", "Date", "date"], ["category", "Category"], ["vendor", "Vendor"], ["amount", "Amount", "number"], ["description", "Description", "textarea"], ["status", "Status"]],
      supplierBill: [["date", "Bill date", "date"], ["dueDate", "Due date", "date"], ["amount", "Amount", "number"], ["description", "Description", "textarea"], ["status", "Status"]],
      supplierPayment: [["date", "Payment date", "date"], ["amount", "Amount", "number"], ["reference", "Reference"], ["status", "Status"]],
      journal: [["date", "Journal date", "date"], ["memo", "Memo"], ["status", "Status"], ["lines", "Lines JSON", "textarea-json"]],
      cashTransaction: [["date", "Date", "date"], ["amount", "Amount", "number"], ["reference", "Reference"], ["description", "Description", "textarea"], ["status", "Status"]],
      user: [["name", "Staff name"], ["email", "Email"], ["role", "Role"], ["active", "Active"]],
    }[typeName] || [];
  }

  function openEditRecord(typeName, id) {
    const key = recordCollection(typeName);
    const record = state[key]?.find((item) => item.id === id);
    if (!record) return;
    if (!requirePermission(typeName, "edit", record)) return;
    if (["quotation", "invoice", "expense"].includes(typeName)) {
      openDocumentEditRecord(typeName, record);
      return;
    }
    if (typeName === "supplierBill") {
      openSupplierBillEdit(record);
      return;
    }
    if (typeName === "journal") {
      openJournalEdit(record);
      return;
    }
    const fields = editableFieldConfig(typeName);
    openModal(`Edit ${title(typeName)}`, `<form id="recordEditForm" class="form-grid">
      ${fields.map(([name, label, type = "text"]) => {
        const value = type === "textarea-json" ? JSON.stringify(record[name] || [], null, 2) : record[name] ?? "";
        if (type.startsWith("textarea")) return `<label class="field full">${esc(label)}<textarea name="${name}" ${type === "textarea-json" ? 'data-json="true"' : ""}>${esc(value)}</textarea></label>`;
        return input(name, label, type, false, value, type === "number" ? "0.01" : "");
      }).join("")}
      ${sensitiveTypes.includes(typeName) ? `<label class="field full">Reason for change<textarea name="_reason" required></textarea></label>` : `<input type="hidden" name="_reason" value="Routine record edit">`}
      <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="save"></i>Save changes</button></div>
    </form>`);
    qs("#recordEditForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const before = structuredClone(record);
      const data = Object.fromEntries(new FormData(form));
      let jsonError = "";
      fields.forEach(([name, , type = "text"]) => {
        if (type === "number") record[name] = CGM.toNumber(data[name]);
        else if (type === "textarea-json") {
          try {
            record[name] = JSON.parse(data[name] || "[]");
          } catch (error) {
            jsonError = `${name} must contain valid JSON.`;
          }
        } else record[name] = data[name];
      });
      if (jsonError) {
        openModal("JSON not saved", `<p>${esc(jsonError)}</p>`);
        return;
      }
      closeModal();
      save({ action: "edit", recordType: typeName, recordId: recordNumber(typeName, record), before, after: record, reason: data._reason });
    });
  }

  function openDocumentEditRecord(typeName, record) {
    const isQuote = typeName === "quotation";
    const isInvoice = typeName === "invoice";
    const isExpense = typeName === "expense";
    const editorId = `edit-${typeName}-${record.id}`;
    const statusOptions = ["draft", "pending-review", "approved", "issued", "sent", "accepted", "rejected", "partially-paid", "paid", "overdue", "cancelled", "voided", "archived"];
    const clientSnapshot = record.clientSnapshot || state.clients.find((client) => client.id === record.clientId) || {};
    openModal(`Edit ${title(typeName)}`, `<form id="documentEditForm" class="form-grid">
      ${isQuote ? `<div class="form-section full"><h3>Client details</h3><p>Update the client-facing details that appear on the quotation.</p></div>` : ""}
      ${isQuote ? input("clientName", "Client name", "text", true, clientSnapshot.name || "") : ""}
      ${isQuote ? input("clientContact", "Contact person", "text", false, clientSnapshot.contact || "") : ""}
      ${isQuote ? input("clientPhone", "Phone", "text", false, clientSnapshot.phone || "") : ""}
      ${isQuote ? input("clientEmail", "Email", "email", false, clientSnapshot.email || "") : ""}
      ${isQuote ? `<label class="field full">Client address<textarea name="clientAddress">${esc(clientSnapshot.address || "")}</textarea></label>` : ""}
      ${isInvoice ? `<div class="form-section full"><h3>Invoice details</h3><p>Choose the saved client and adjust the dates, status, project, and service lines.</p></div>` : ""}
      ${isInvoice ? `<label class="field full">Client<select name="clientId" required>${clientOptions(record.clientId)}</select></label>` : ""}
      ${isExpense ? `<div class="form-section full"><h3>Expense details</h3><p>Update the paid expense and keep each cost line linked to the right service category.</p></div>` : ""}
      ${isExpense ? input("date", "Date", "date", true, record.date || CGM.today()) : input("date", isQuote ? "Quotation date" : "Invoice date", "date", true, record.date || CGM.today())}
      ${isQuote ? input("validUntil", "Valid until", "date", false, record.validUntil || CGM.today()) : ""}
      ${isInvoice ? input("dueDate", "Due date", "date", false, record.dueDate || CGM.today()) : ""}
      ${isExpense ? input("category", "Expense category", "text", true, record.category || "") : ""}
      ${isExpense ? input("vendor", "Vendor / supplier", "text", false, record.vendor || "") : ""}
      ${isQuote ? `<label class="field">Status<input value="${esc(title(CGM.statusOf(record)))}" disabled><input type="hidden" name="status" value="${esc(CGM.statusOf(record))}"></label>` : `<label class="field">Status<select name="status">${statusOptions.map((status) => `<option value="${status}" ${CGM.statusOf(record) === status ? "selected" : ""}>${title(status)}</option>`).join("")}</select></label>`}
      ${!isExpense ? input("projectCode", "Project code", "text", false, record.projectCode || "") : `<label class="field">Project<select name="projectId">${projectOptions(record.projectId)}</select></label>`}
      ${!isExpense ? input("projectName", "Project name", "text", false, record.projectName || "") : ""}
      ${isInvoice ? input("discount", "Discount", "number", false, record.discount || 0, "0.01") : ""}
      ${isInvoice ? input("taxRate", "VAT / tax %", "number", false, record.taxRate || 0, "0.01") : ""}
      ${itemEditor(editorId, isExpense ? "Expense items" : isQuote ? "Quotation items" : "Invoice items", record.items || [])}
      <label class="field full">Notes<textarea name="notes">${esc(record.notes || record.description || "")}</textarea></label>
      <label class="field full">Reason for change<textarea name="_reason" required placeholder="Example: Corrected quantity or service category."></textarea></label>
      <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="save"></i>Save changes</button></div>
    </form>`);
    bindItemEditors(qs("#documentEditForm"));
    qs("#documentEditForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const before = structuredClone(record);
      const data = Object.fromEntries(new FormData(form));
      const items = collectItems(form);
      if (!items.length) {
        openModal(`${title(typeName)} not saved`, "<p>Add at least one line item with description, service category, quantity, and rate.</p>");
        return;
      }
      const serviceId = items[0]?.serviceId || data.serviceId || record.serviceId || "engineering";
      const service = CGM.serviceById(state, serviceId);
      record.date = data.date;
      record.status = data.status;
      record.serviceId = serviceId;
      record.items = items;
      if (isQuote) {
        record.clientSnapshot = {
          name: data.clientName,
          contact: data.clientContact,
          phone: data.clientPhone,
          email: data.clientEmail,
          address: data.clientAddress,
        };
        record.validUntil = data.validUntil;
        record.projectCode = data.projectCode;
        record.projectName = data.projectName;
        record.notes = data.notes;
      }
      if (isInvoice) {
        record.clientId = data.clientId;
        record.dueDate = data.dueDate;
        record.projectCode = data.projectCode;
        record.projectName = data.projectName;
        record.discount = CGM.toNumber(data.discount);
        record.taxRate = CGM.toNumber(data.taxRate);
        record.incomeAccountId = service?.incomeAccountId || record.incomeAccountId || "sales_income";
        record.notes = data.notes;
      }
      if (isExpense) {
        record.category = data.category;
        record.vendor = data.vendor;
        record.projectId = data.projectId;
        record.projectCode = projectLabel(data.projectId, "");
        record.amount = CGM.documentTotal({ items });
        record.expenseAccountId = service?.costAccountId || record.expenseAccountId || "general_expenses";
        record.description = data.notes || items.map((item) => item.description).join("; ");
      }
      closeModal();
      save({ action: "edit", recordType: typeName, recordId: recordNumber(typeName, record), before, after: record, reason: data._reason });
    });
  }

  function openSupplierBillEdit(record) {
    const editorId = `edit-supplier-bill-${record.id}`;
    openModal("Edit Supplier Bill", `<form id="supplierBillEditForm" class="form-grid">
      <label class="field full">Supplier<select name="supplierId" required>${supplierOptions(record.supplierId)}</select></label>
      ${input("date", "Bill date", "date", true, record.date || CGM.today())}
      ${input("dueDate", "Due date", "date", false, record.dueDate || CGM.today())}
      <label class="field">Project<select name="projectId">${projectOptions(record.projectId)}</select></label>
      <label class="field full">Debit account<select name="accountId">${accountOptions(["Expenses", "Assets", "Cost of Sales"])}</select></label>
      ${itemEditor(editorId, "Supplier bill items", record.items || [{ description: record.description || "Supplier bill", qty: 1, rate: record.amount || 0, serviceId: record.serviceId }])}
      <label class="field full">Description<textarea name="description">${esc(record.description || "")}</textarea></label>
      <label class="field full">Reason for change<textarea name="_reason" required placeholder="Example: Corrected supplier bill line item."></textarea></label>
      <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="save"></i>Save changes</button></div>
    </form>`);
    bindItemEditors(qs("#supplierBillEditForm"));
    qs("#supplierBillEditForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const before = structuredClone(record);
      const data = Object.fromEntries(new FormData(form));
      const items = collectItems(form);
      if (!items.length) {
        openModal("Supplier bill not saved", "<p>Add at least one supplier bill item.</p>");
        return;
      }
      record.supplierId = data.supplierId;
      record.date = data.date;
      record.dueDate = data.dueDate;
      record.serviceId = items[0]?.serviceId || data.serviceId;
      record.projectId = data.projectId;
      record.projectCode = projectLabel(data.projectId, "");
      record.accountId = data.accountId;
      record.items = items;
      record.amount = CGM.documentTotal({ items });
      record.description = data.description || items.map((item) => item.description).join("; ");
      closeModal();
      save({ action: "edit", recordType: "supplierBill", recordId: recordNumber("supplierBill", record), before, after: record, reason: data._reason });
    });
  }

  function openJournalEdit(record) {
    const lines = record.lines?.length ? record.lines : [{}, {}];
    openModal("Edit Journal", `<form id="journalEditForm" class="form-grid">
      ${input("date", "Journal date", "date", true, record.date || CGM.today())}
      ${input("memo", "Memo", "text", true, record.memo || "")}
      <div class="items-editor document-items full">
        <div class="item-editor-head"><div><label>Debit and credit lines</label><p class="muted">Each line must have an account and either debit or credit. Total debits must equal total credits.</p></div></div>
        ${lines.map((line, i) => `<div class="journal-row item-row"><label class="field">Account<select name="accountId">${accountOptions()}</select></label>${input(`debit${i}`, "Debit", "number", false, line.debit || "", "0.01")}${input(`credit${i}`, "Credit", "number", false, line.credit || "", "0.01")}</div>`).join("")}
        <p class="muted" id="journalEditCheck">Debit and credit totals must match.</p>
      </div>
      <label class="field full">Reason for change<textarea name="_reason" required></textarea></label>
      <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="save"></i>Save journal</button></div>
    </form>`);
    qsa(".journal-row", qs("#journalEditForm")).forEach((row, i) => {
      const select = qs('[name="accountId"]', row);
      if (select && lines[i]?.accountId) select.value = lines[i].accountId;
    });
    qs("#journalEditForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const rows = qsa(".journal-row", form).map((row) => ({
        accountId: qs('[name="accountId"]', row).value,
        debit: CGM.toNumber(qs('[name^="debit"]', row).value),
        credit: CGM.toNumber(qs('[name^="credit"]', row).value),
      })).filter((line) => line.debit || line.credit);
      const check = CGM.validateJournal(rows);
      if (!check.balanced || !rows.length) {
        qs("#journalEditCheck").textContent = `Not balanced: debits ${money.format(check.debit)} / credits ${money.format(check.credit)}`;
        return;
      }
      const before = structuredClone(record);
      const data = Object.fromEntries(new FormData(form));
      record.date = data.date;
      record.memo = data.memo;
      record.lines = rows;
      closeModal();
      save({ action: "edit", recordType: "journal", recordId: recordNumber("journal", record), before, after: record, reason: data._reason });
    });
  }

  function voidOrArchiveRecord(typeName, id) {
    const key = recordCollection(typeName);
    const record = state[key]?.find((item) => item.id === id);
    if (!record) return;
    const action = ["invoice", "payment", "receipt"].includes(typeName) ? "void" : "archive";
    if (!requirePermission(typeName, action, record)) return;
    openConfirmModal({
      titleText: `${title(action)} ${recordNumber(typeName, record)}`,
      message: `This will ${action} ${recordNumber(typeName, record)}. It will be excluded from active totals but kept in history for audit traceability.`,
      confirmLabel: title(action),
      tone: "danger",
      reasonRequired: sensitiveTypes.includes(typeName),
      onConfirm: async (reason) => {
        const before = structuredClone(record);
        record.status = ["invoice", "payment", "receipt"].includes(typeName) ? "voided" : "archived";
        if (typeName === "user") record.active = false;
        record.voidReason = reason;
        record.voidedAt = new Date().toISOString();
        record.voidedBy = currentUser().name;
        await save({ action: record.status, recordType: typeName, recordId: recordNumber(typeName, record), before, after: record, reason });
      },
    });
  }

  function restoreRecord(typeName, id) {
    const key = recordCollection(typeName);
    const record = state[key]?.find((item) => item.id === id);
    if (!record) return;
    if (!requirePermission(typeName, "restore", record)) return;
    openConfirmModal({
      titleText: `Restore ${recordNumber(typeName, record)}`,
      message: `This will return ${recordNumber(typeName, record)} to active history and may affect dashboards, reports, balances, and statements.`,
      confirmLabel: "Restore",
      tone: "info",
      reasonRequired: true,
      onConfirm: async (reason) => {
        const before = structuredClone(record);
        record.status = ["payment", "receipt"].includes(typeName) ? "paid" : typeName === "invoice" || typeName === "supplierBill" ? "issued" : "active";
        if (typeName === "user") record.active = true;
        await save({ action: "restore", recordType: typeName, recordId: recordNumber(typeName, record), before, after: record, reason });
      },
    });
  }

  async function duplicateRecord(typeName, id) {
    const key = recordCollection(typeName);
    const record = state[key]?.find((item) => item.id === id);
    if (!record) return;
    if (!requirePermission(typeName, "create", record)) return;
    const copy = structuredClone(record);
    copy.id = CGM.uid();
    copy.status = "draft";
    copy.date = CGM.today();
    if (["quotation", "invoice"].includes(typeName)) copy.signatories = defaultDocumentSignatories(typeName === "invoice");
    if (typeName === "quotation") {
      delete copy.invoiceId;
      delete copy.quotationId;
    }
    try {
      if (typeName === "quotation") copy.number = await officialNumber("quotation", docPrefix("quotationPrefix", "QT"), state.quotations, "number", "quotation number");
      if (typeName === "invoice") copy.number = await officialNumber("invoice", docPrefix("invoicePrefix", "INV"), state.invoices, "number", "invoice number");
      if (typeName === "supplierBill") copy.number = await officialNumber("supplierBill", docPrefix("supplierBillPrefix", "BILL"), state.supplierBills, "number", "supplier bill number");
    } catch (error) {
      numberingError(title(typeName), error);
      return;
    }
    state[key].unshift(copy);
    save({ action: "duplicate", recordType: typeName, recordId: recordNumber(typeName, copy), before: record, after: copy, reason: "Duplicated from existing record" });
  }

  function openAuditDetail(id) {
    const entry = (state.auditLog || []).find((item) => item.id === id);
    if (!entry) return;
    const changes = auditChangeRows(entry, { moneyFormatter: money });
    openModal("Audit detail", `
      ${miniReportTable("Change record", [
        ["Date & time", formatDateTime(entry.at)],
        ["User", `${entry.userName} (${entry.role})`],
        ["Action", title(entry.action)],
        ["Record", `${title(entry.recordType)} ${entry.recordId || ""}`],
        ["Summary", auditSummary(entry)],
        ["Reason", entry.reason || ""],
      ])}
      ${changes.length ? miniReportTable("Readable changes", changes, ["Field", "Change"]) : ""}
      <div class="grid-two audit-detail">
        <section><h3>Old value</h3><pre>${esc(prettyJson(entry.oldValue))}</pre></section>
        <section><h3>New value</h3><pre>${esc(prettyJson(entry.newValue))}</pre></section>
      </div>
    `);
  }

  function prettyJson(value) {
    if (!value) return "";
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch (error) {
      return value;
    }
  }

  function downloadBlob(blob, filename) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  document.addEventListener("click", (event) => {
    const clickedFab = event.target.closest?.("#quickFab");
    if (quickFabOpen && !clickedFab) closeQuickFab();
    const button = event.target.closest("button");
    if (!button) return;
    if (button.id === "quickFabToggle") {
      quickFabOpen = !quickFabOpen;
      renderQuickFab();
      if (window.lucide) lucide.createIcons();
      return;
    }
    if (button.dataset.addItem) {
      const editor = qs(`[data-items-editor="${CSS.escape(button.dataset.addItem)}"]`);
      qs(".item-rows", editor)?.insertAdjacentHTML("beforeend", itemRow());
      updateItemEditor(editor);
      if (window.lucide) lucide.createIcons();
      return;
    }
    if (button.dataset.removeItem !== undefined) {
      const editor = button.closest("[data-items-editor]");
      const rows = qsa(".doc-item-row", editor);
      if (rows.length > 1) button.closest(".doc-item-row")?.remove();
      else {
        qsa("input", rows[0]).forEach((inputEl) => {
          inputEl.value = inputEl.name === "itemQty" ? "1" : "";
        });
      }
      updateItemEditor(editor);
      return;
    }
    if (button.dataset.portalOpen) openPortal(button.dataset.portalOpen);
    if (button.dataset.modalCancel !== undefined) closeModal();
    if (button.dataset.backupJson !== undefined) backupJson();
    if (button.dataset.restoreJson !== undefined) qs("#restoreJsonInput")?.click();
    if (button.dataset.auditClear !== undefined) {
      auditFilters = { action: "", module: "", fromDate: "", toDate: "" };
      renderAudit();
      if (window.lucide) lucide.createIcons();
    }
    if (button.dataset.bookCapture) {
      closeModal();
      closeQuickFab();
      openBookkeepingCapture(button.dataset.bookCapture);
      return;
    }
    if (button.dataset.goView) {
      closeModal();
      closeQuickFab();
      setView(button.dataset.goView);
    }
    if (button.id === "portalSwitch" || button.id === "topPortalSwitch") showLanding();
    if (button.matches(".nav-item")) setView(button.dataset.view);
    if (button.id === "menuToggle") qs(".sidebar").classList.toggle("open");
    if (button.id === "modalClose") closeModal();
    if (button.dataset.quoteApprove) approveQuotation(button.dataset.quoteApprove);
    if (button.dataset.quoteInvoice) transferQuotationToInvoice(button.dataset.quoteInvoice);
    if (button.dataset.statement) openStatement(button.dataset.statement, button.dataset.id);
    if (button.dataset.paySupplier) openSupplierPayment(button.dataset.paySupplier);
    if (button.dataset.exportReport) exportReport(button.dataset.exportReport, button.dataset.format);
    if (button.dataset.exportStatement) exportReport("", button.dataset.format, button.dataset.exportStatement, button.dataset.id);
    if (button.dataset.previewDocument) previewDocument(button.dataset.previewDocument, button.dataset.id);
    if (button.dataset.exportDocument) exportDocument(button.dataset.exportDocument, button.dataset.id, button.dataset.format);
    if (button.dataset.recordEdit) openEditRecord(button.dataset.recordEdit, button.dataset.id);
    if (button.dataset.recordVoid) voidOrArchiveRecord(button.dataset.recordVoid, button.dataset.id);
    if (button.dataset.recordRestore) restoreRecord(button.dataset.recordRestore, button.dataset.id);
    if (button.dataset.recordDuplicate) duplicateRecord(button.dataset.recordDuplicate, button.dataset.id);
    if (button.dataset.auditDetail) openAuditDetail(button.dataset.auditDetail);
  });

  document.addEventListener("input", (event) => {
    const inputEl = event.target.closest("[data-table-search]");
    if (inputEl) {
      filterTable(inputEl.dataset.tableSearch, inputEl.value);
      return;
    }
    const editor = event.target.closest?.("[data-items-editor]");
    if (editor) updateItemEditor(editor);
  });

  document.addEventListener("change", (event) => {
    const filter = event.target.closest("[data-audit-filter]");
    if (filter) {
      auditFilters = { ...auditFilters, [filter.dataset.auditFilter]: filter.value };
      renderAudit();
      if (window.lucide) lucide.createIcons();
    }
  });

  qs("#modalBackdrop").addEventListener("click", (event) => {
    if (event.target.id === "modalBackdrop") closeModal();
  });

  window.addEventListener("scroll", closeQuickFab, { passive: true });

  render();
  showLanding();
})();
