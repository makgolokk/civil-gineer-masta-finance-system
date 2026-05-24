(function () {
  const money = new Intl.NumberFormat("en-BW", { style: "currency", currency: "BWP" });
  const qs = (selector, scope = document) => scope.querySelector(selector);
  const qsa = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

  let state = CGM.load();
  let activePortal = "";
  let activeView = "dashboard";
  let dashboardFilter = {
    mode: "month",
    month: CGM.today().slice(0, 7),
    quarter: `${new Date(CGM.today()).getFullYear()}-Q${Math.floor(new Date(CGM.today()).getMonth() / 3) + 1}`,
    year: String(new Date(CGM.today()).getFullYear()),
  };

  function save() {
    CGM.save(state);
    render();
  }

  function openPortal(portal) {
    activePortal = portal;
    qs("#landingView").hidden = true;
    qs("#appShell").hidden = false;
    document.body.dataset.portal = portal;
    qsa(".nav-item").forEach((button) => {
      button.hidden = button.dataset.portal !== portal;
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

  function clientOptions() {
    return state.clients.map((client) => `<option value="${client.id}">${esc(client.name)}</option>`).join("");
  }

  function supplierOptions() {
    return state.suppliers.map((supplier) => `<option value="${supplier.id}">${esc(supplier.name)}</option>`).join("");
  }

  function serviceOptions(selected = "") {
    return (state.services || []).map((service) => `<option value="${service.id}" ${service.id === selected ? "selected" : ""}>${esc(service.name)}</option>`).join("");
  }

  function projectOptions(selected = "") {
    const options = [`<option value="">Create / unassigned project</option>`];
    options.push(...(state.projects || []).map((project) => `<option value="${project.id}" ${project.id === selected ? "selected" : ""}>${esc(project.code)} - ${esc(project.name)}</option>`));
    return options.join("");
  }

  function setView(view) {
    activeView = view;
    qsa(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view && (!activePortal || button.dataset.portal === activePortal)));
    qsa(".view").forEach((section) => section.classList.toggle("active", section.id === `${view}View`));
    qs("#pageTitle").textContent = title(view);
    qs("#workspaceLabel").textContent = activePortal === "bookkeeping" ? "Front-office bookkeeping" : "Accounting management";
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
    if (window.lucide) lucide.createIcons();
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
          ${barChart("Monthly invoiced amount", d.trends, "invoiced")}
          ${barChart("Monthly payments received", d.trends, "payments")}
          ${barChart("Monthly expenses", d.trends, "expenses")}
          ${barChart("Monthly net cash", d.trends, "netCash")}
          ${barChart("Monthly profit/loss", d.trends, "profit")}
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
    const openQuotes = state.quotations.filter((quote) => !["approved", "invoiced"].includes(quote.status)).length;
    const approvedQuotes = state.quotations.filter((quote) => quote.status === "approved").length;
    const unpaidInvoices = state.invoices.filter((invoice) => CGM.invoiceStatus(state, invoice) !== "paid").reduce((sum, invoice) => sum + CGM.documentTotal(invoice) - CGM.invoicePaid(state, invoice.id), 0);
    const monthReceipts = state.payments.filter((payment) => String(payment.date).startsWith(month)).reduce((sum, payment) => sum + CGM.toNumber(payment.amount), 0);
    const monthExpenses = state.expenses.filter((expense) => String(expense.date).startsWith(month)).reduce((sum, expense) => sum + CGM.toNumber(expense.amount), 0);
    const supplierBillsDue = state.supplierBills.filter((bill) => CGM.billStatus(state, bill) !== "paid" && (bill.dueDate || bill.date) <= CGM.today()).reduce((sum, bill) => sum + CGM.toNumber(bill.amount) - CGM.supplierBillPaid(state, bill.id), 0);
    const alerts = [];
    if (approvedQuotes) alerts.push({ level: "warning", title: "Approved quotes waiting", message: `${approvedQuotes} approved quotation(s) should be transferred to invoice when work is confirmed.` });
    if (unpaidInvoices) alerts.push({ level: "warning", title: "Payments to follow up", message: `${money.format(unpaidInvoices)} is unpaid on issued invoices.` });
    if (supplierBillsDue) alerts.push({ level: "warning", title: "Supplier bills due", message: `${money.format(supplierBillsDue)} is due to suppliers.` });
    if (!alerts.length) alerts.push({ level: "good", title: "Bookkeeping queue clear", message: "No urgent front-office items need action right now." });
    return { openQuotes, approvedQuotes, unpaidInvoices, monthReceipts, monthExpenses, supplierBillsDue, alerts };
  }

  function quotationWorkflowTable() {
    return `<div class="table-wrap"><table><thead><tr><th>Quote</th><th>Client / prospect</th><th>Project</th><th>Service</th><th>Date</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>
      ${state.quotations.map((quote) => `<tr>
        <td><strong>${quote.number}</strong><br><span class="muted">${esc(quote.notes || "")}</span></td>
        <td>${esc(quotationClientName(quote))}</td>
        <td>${esc(projectLabel(quote.projectId, quote.projectCode))}</td>
        <td>${esc(serviceName(quote.serviceId))}</td>
        <td>${quote.date}</td>
        <td>${money.format(CGM.documentTotal(quote))}</td>
        <td>${badge(quote.status || "draft")}</td>
        <td><div class="row-actions">
          <button class="secondary-button" data-quote-approve="${quote.id}" ${["approved", "invoiced"].includes(quote.status) ? "disabled" : ""}><i data-lucide="check"></i>Approve</button>
          <button class="secondary-button" data-quote-invoice="${quote.id}" ${quote.status !== "approved" ? "disabled" : ""}><i data-lucide="file-text"></i>Transfer to invoice</button>
        </div></td>
      </tr>`).join("")}
    </tbody></table></div>`;
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
          <div class="section-head"><div><h2>Create quotation</h2><p>Use this for prospects too. A client account is created only when the quote becomes an invoice.</p></div></div>
          <form id="bookQuoteForm" class="form-grid">
            ${input("clientName", "Client / prospect name", "text", true)}
            ${input("contact", "Contact person")}
            ${input("email", "Email", "email")}
            ${input("phone", "Phone")}
            ${input("date", "Quotation date", "date", true, CGM.today())}
            ${input("validUntil", "Valid until", "date", true, CGM.today())}
            <label class="field">Service<select name="serviceId">${serviceOptions()}</select></label>
            ${input("projectCode", "Project code", "text", false, suggestedProjectCode())}
            ${input("projectName", "Project name")}
            ${input("description", "Work description", "text", true)}
            ${input("amount", "Quoted amount", "number", true, "", "0.01")}
            <label class="field full">Address<textarea name="address"></textarea></label>
            <label class="field full">Notes<textarea name="notes"></textarea></label>
            <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="save"></i>Save quotation</button></div>
          </form>
        </section>
        <section class="panel">
          <div class="section-head"><div><h2>Quick invoice</h2><p>Creates or finds the client record, then posts the invoice to Debtors Control and Income.</p></div></div>
          <form id="bookInvoiceForm" class="form-grid">
            ${input("clientName", "Client name", "text", true)}
            ${input("email", "Client email", "email")}
            ${input("phone", "Client phone")}
            ${input("date", "Invoice date", "date", true, CGM.today())}
            ${input("dueDate", "Due date", "date", true, CGM.today())}
            <label class="field">Service<select name="serviceId">${serviceOptions()}</select></label>
            ${input("projectCode", "Project code", "text", false, suggestedProjectCode())}
            ${input("projectName", "Project name")}
            ${input("description", "Invoice description", "text", true)}
            ${input("amount", "Invoice amount", "number", true, "", "0.01")}
            <label class="field full">Income account<select name="incomeAccountId">${accountOptions(["Income"])}</select></label>
            <label class="field full">Address<textarea name="address"></textarea></label>
            <label class="field full">Notes<textarea name="notes"></textarea></label>
            <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="file-plus-2"></i>Create invoice</button></div>
          </form>
        </section>
      </div>
      <div class="grid-two">
        <section class="panel">
          <div class="section-head"><div><h2>Record receipt / client payment</h2><p>Debit selected Bank or Cash account, credit Debtors Control.</p></div></div>
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
          <div class="section-head"><div><h2>Record paid expense</h2><p>Simple expense entry for daily bookkeeping.</p></div></div>
          <form id="bookExpenseForm" class="form-grid">
            ${input("date", "Date", "date", true, CGM.today())}
            ${input("category", "Category", "text", true)}
            ${input("vendor", "Vendor")}
            ${input("amount", "Amount", "number", true, "", "0.01")}
            <label class="field">Service<select name="serviceId">${serviceOptions()}</select></label>
            <label class="field">Project<select name="projectId">${projectOptions()}</select></label>
            <label class="field">Expense account<select name="expenseAccountId">${accountOptions(["Expenses", "Cost of Sales"])}</select></label>
            <label class="field">Paid from<select name="bankAccountId">${accountOptions(["Bank accounts", "Cash accounts"])}</select></label>
            <label class="field full">Description<textarea name="description"></textarea></label>
            <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="save"></i>Save expense</button></div>
          </form>
        </section>
      </div>
      <section class="panel">
        <div class="table-head"><div><h2>Quotation workflow</h2><p>Approve a quotation, then transfer it into an invoice. The client account is created at invoice stage.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Quote</th><th>Client / prospect</th><th>Date</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>
          ${state.quotations.map((quote) => `<tr>
            <td><strong>${quote.number}</strong><br><span class="muted">${esc(quote.notes || "")}</span></td>
            <td>${esc(quotationClientName(quote))}</td>
            <td>${quote.date}</td>
            <td>${money.format(CGM.documentTotal(quote))}</td>
            <td>${badge(quote.status || "draft")}</td>
            <td><div class="row-actions">
              <button class="secondary-button" data-quote-approve="${quote.id}" ${["approved", "invoiced"].includes(quote.status) ? "disabled" : ""}><i data-lucide="check"></i>Approve</button>
              <button class="secondary-button" data-quote-invoice="${quote.id}" ${quote.status !== "approved" ? "disabled" : ""}><i data-lucide="file-text"></i>Transfer to invoice</button>
            </div></td>
          </tr>`).join("")}
        </tbody></table></div>
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
        ${miniReportTable("Invoice register", state.invoices.map((invoice) => [invoice.date, invoice.number, clientName(invoice.clientId), projectLabel(invoice.projectId, invoice.projectCode), serviceName(invoice.serviceId), money.format(CGM.documentTotal(invoice)), title(CGM.invoiceStatus(state, invoice))]), ["Date", "Invoice", "Client", "Project", "Service", "Amount", "Status"])}
      </section>
    `;
    qs("#bookReceiptsView").innerHTML = `
      <section class="panel">
        <div class="table-head"><div><h2>Receipts</h2><p>Client payments captured by front office. These update Bank/Cash and Debtors Control.</p></div></div>
        ${miniReportTable("Receipt register", state.payments.map((payment) => [payment.date, payment.receiptNumber, clientName(payment.clientId), projectLabel(payment.projectId, payment.projectCode), serviceName(payment.serviceId), money.format(payment.amount), accountName(payment.bankAccountId)]), ["Date", "Receipt", "Client", "Project", "Service", "Amount", "Deposited to"])}
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
          <label class="field">Service<select name="serviceId">${serviceOptions()}</select></label>
          <label class="field">Project<select name="projectId">${projectOptions()}</select></label>
          ${input("amount", "Bill amount", "number", true, "", "0.01")}
          <label class="field full">Debit account<select name="accountId">${accountOptions(["Expenses", "Assets", "Cost of Sales"])}</select></label>
          <label class="field full">Description<textarea name="description"></textarea></label>
          <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="save"></i>Save supplier bill</button></div>
        </form>
      </section>
      <section class="panel">
        <div class="table-head"><div><h2>Expenses and supplier bills</h2><p>Front-office cost capture by project and service.</p></div></div>
        ${miniReportTable("Cost register", [...state.expenses.map((expense) => [expense.date, "Paid expense", expense.vendor || expense.category, projectLabel(expense.projectId, expense.projectCode), serviceName(expense.serviceId), money.format(expense.amount)]), ...state.supplierBills.map((bill) => [bill.date, "Supplier bill", supplierName(bill.supplierId), projectLabel(bill.projectId, bill.projectCode), serviceName(bill.serviceId), money.format(bill.amount)])], ["Date", "Type", "Party", "Project", "Service", "Amount"])}
      </section>
    `;
    qs("#bookQuoteForm")?.addEventListener("submit", handleBookQuote);
    qs("#bookInvoiceForm")?.addEventListener("submit", handleBookInvoice);
    qs("#bookReceiptForm")?.addEventListener("submit", handleBookReceipt);
    qs("#bookExpenseForm")?.addEventListener("submit", handleBookExpense);
    qs("#bookSupplierBillForm")?.addEventListener("submit", handleBookSupplierBill);
  }

  function dashboardModel() {
    const period = selectedPeriod();
    const periodInvoices = state.invoices.filter((invoice) => inPeriod(invoice.date, period));
    const periodPayments = state.payments.filter((payment) => inPeriod(payment.date, period));
    const periodExpenses = state.expenses.filter((expense) => inPeriod(expense.date, period));
    const periodSupplierPayments = state.supplierPayments.filter((payment) => inPeriod(payment.date, period));
    const periodInvoiced = periodInvoices.reduce((sum, invoice) => sum + CGM.documentTotal(invoice), 0);
    const periodPaymentsTotal = periodPayments.reduce((sum, payment) => sum + CGM.toNumber(payment.amount), 0);
    const periodExpensesTotal = periodExpenses.reduce((sum, expense) => sum + CGM.toNumber(expense.amount), 0) + periodSupplierPayments.reduce((sum, payment) => sum + CGM.toNumber(payment.amount), 0);
    const debtors = state.clients.reduce((sum, client) => sum + CGM.clientStatement(state, client.id).balance, 0);
    const creditors = state.suppliers.reduce((sum, supplier) => sum + CGM.supplierStatement(state, supplier.id).balance, 0);
    const unpaidInvoices = state.invoices.filter((invoice) => CGM.invoiceStatus(state, invoice) !== "paid");
    const overdueInvoices = unpaidInvoices.filter((invoice) => invoice.dueDate && invoice.dueDate < CGM.today());
    const creditorsDue = state.supplierBills.filter((bill) => CGM.billStatus(state, bill) !== "paid" && (bill.dueDate || bill.date) <= CGM.today());
    const netProfitLoss = profitForPeriod(period);
    const bankCashBalance = CGM.cashAccountBalance(state);
    const model = {
      period,
      financialYear: financialYearLabel(period.start),
      periodInvoiced,
      periodPayments: periodPaymentsTotal,
      periodExpenses: periodExpensesTotal,
      periodNetCash: periodPaymentsTotal - periodExpensesTotal,
      debtors,
      creditors,
      netProfitLoss,
      bankCashBalance,
      overdueCount: overdueInvoices.length,
      overdueAmount: overdueInvoices.reduce((sum, invoice) => sum + CGM.documentTotal(invoice) - CGM.invoicePaid(state, invoice.id), 0),
      unpaidAmount: unpaidInvoices.reduce((sum, invoice) => sum + CGM.documentTotal(invoice) - CGM.invoicePaid(state, invoice.id), 0),
      creditorsDueAmount: creditorsDue.reduce((sum, bill) => sum + CGM.toNumber(bill.amount) - CGM.supplierBillPaid(state, bill.id), 0),
      trends: monthlyTrends(period.end),
    };
    model.health = businessHealth(model);
    model.alerts = dashboardAlerts(model);
    model.decisionRows = decisionRows(model);
    return model;
  }

  function selectedPeriod() {
    if (dashboardFilter.mode === "quarter") {
      const [year, qText] = dashboardFilter.quarter.split("-Q");
      const quarter = Number(qText);
      const month = (quarter - 1) * 3;
      const start = new Date(Number(year), month, 1);
      const end = new Date(Number(year), month + 3, 1);
      return { start, end, label: `Quarter ${quarter}, ${year}` };
    }
    if (dashboardFilter.mode === "year") {
      const year = Number(dashboardFilter.year);
      return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1), label: `Year ${year}` };
    }
    const [year, month] = dashboardFilter.month.split("-").map(Number);
    const start = new Date(year, month - 1, 1);
    return { start, end: new Date(year, month, 1), label: `${monthName(start)} ${year}` };
  }

  function inPeriod(dateValue, period) {
    const date = new Date(`${dateValue}T00:00:00`);
    return date >= period.start && date < period.end;
  }

  function profitForPeriod(period) {
    const entries = CGM.ledgerEntries(state).filter((entry) => inPeriod(entry.date, period));
    return state.accounts.reduce((sum, account) => {
      const balance = entries.filter((entry) => entry.accountId === account.id).reduce((total, entry) => total + entry.debit - entry.credit, 0);
      if (account.type === "Income") return sum - balance;
      if (account.type === "Expenses" || account.type === "Cost of Sales") return sum - balance;
      return sum;
    }, 0);
  }

  function monthlyTrends(anchorEnd) {
    const months = [];
    const anchor = new Date(anchorEnd);
    anchor.setDate(1);
    anchor.setMonth(anchor.getMonth() - 11);
    for (let i = 0; i < 12; i += 1) {
      const start = new Date(anchor.getFullYear(), anchor.getMonth() + i, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      const period = { start, end };
      const invoiced = state.invoices.filter((invoice) => inPeriod(invoice.date, period)).reduce((sum, invoice) => sum + CGM.documentTotal(invoice), 0);
      const payments = state.payments.filter((payment) => inPeriod(payment.date, period)).reduce((sum, payment) => sum + CGM.toNumber(payment.amount), 0);
      const expenses = state.expenses.filter((expense) => inPeriod(expense.date, period)).reduce((sum, expense) => sum + CGM.toNumber(expense.amount), 0);
      const supplierPayments = state.supplierPayments.filter((payment) => inPeriod(payment.date, period)).reduce((sum, payment) => sum + CGM.toNumber(payment.amount), 0);
      months.push({
        label: `${start.toLocaleString(undefined, { month: "short" })} ${String(start.getFullYear()).slice(2)}`,
        key: start.toISOString().slice(0, 7),
        invoiced,
        payments,
        expenses: expenses + supplierPayments,
        netCash: payments - expenses - supplierPayments,
        profit: profitForPeriod(period),
        debtors: balanceAt("debtors", end),
        creditors: balanceAt("creditors", end),
        cashBalance: cashBalanceAt(end),
      });
    }
    return months;
  }

  function balanceAt(typeName, endDate) {
    if (typeName === "debtors") {
      const invoices = state.invoices.filter((invoice) => new Date(`${invoice.date}T00:00:00`) < endDate).reduce((sum, invoice) => sum + CGM.documentTotal(invoice), 0);
      const payments = state.payments.filter((payment) => new Date(`${payment.date}T00:00:00`) < endDate).reduce((sum, payment) => sum + CGM.toNumber(payment.amount), 0);
      const opening = state.clients.reduce((sum, client) => sum + CGM.toNumber(client.openingBalance), 0);
      return opening + invoices - payments;
    }
    const bills = state.supplierBills.filter((bill) => new Date(`${bill.date}T00:00:00`) < endDate).reduce((sum, bill) => sum + CGM.toNumber(bill.amount), 0);
    const payments = state.supplierPayments.filter((payment) => new Date(`${payment.date}T00:00:00`) < endDate).reduce((sum, payment) => sum + CGM.toNumber(payment.amount), 0);
    const opening = state.suppliers.reduce((sum, supplier) => sum + CGM.toNumber(supplier.openingBalance), 0);
    return opening + bills - payments;
  }

  function cashBalanceAt(endDate) {
    return CGM.ledgerEntries(state)
      .filter((entry) => CGM.isMoneyAccount(state, entry.accountId) && new Date(`${entry.date}T00:00:00`) < endDate)
      .reduce((sum, entry) => sum + entry.debit - entry.credit, 0);
  }

  function businessHealth(model) {
    let score = 100;
    if (model.periodNetCash < 0) score -= 25;
    if (model.overdueAmount > 0) score -= Math.min(25, 10 + (model.overdueAmount / Math.max(model.periodInvoiced, 1)) * 20);
    if (model.periodExpenses > model.periodInvoiced && model.periodInvoiced > 0) score -= 20;
    if (model.netProfitLoss < 0) score -= 20;
    if (model.unpaidAmount > model.periodPayments && model.unpaidAmount > 0) score -= 15;
    score = Math.max(0, Math.round(score));
    const status = score >= 85 ? "Excellent" : score >= 65 ? "Good" : score >= 40 ? "Watch" : "Critical";
    return { score, status, tone: status.toLowerCase() };
  }

  function dashboardAlerts(model) {
    const alerts = [];
    if (model.periodPayments > model.periodExpenses) alerts.push({ level: "good", title: "Good month", message: "Cash received is higher than expenses for the selected period." });
    if (model.overdueCount > 0) alerts.push({ level: "warning", title: "Action needed", message: `${model.overdueCount} overdue invoice(s) are affecting cash flow.` });
    if (model.debtors > 0) alerts.push({ level: "warning", title: "Unpaid client balances", message: `${money.format(model.debtors)} is still outstanding from clients.` });
    if (model.periodExpenses > model.periodInvoiced * 0.75 && model.periodInvoiced > 0) alerts.push({ level: "warning", title: "Expense pressure", message: "Warning: expenses are rising faster than income in this period." });
    if (model.bankCashBalance < Math.max(1000, model.periodExpenses * 0.25)) alerts.push({ level: "danger", title: "Low cash buffer", message: "Combined bank and cash balance is low compared with current expense activity." });
    if (model.creditorsDueAmount > 0) alerts.push({ level: "warning", title: "Creditors due", message: `${money.format(model.creditorsDueAmount)} is due to suppliers or creditors.` });
    if (model.periodNetCash < 0) alerts.push({ level: "danger", title: "Negative net cash", message: "Cash outflows are higher than cash inflows for this period." });
    if (model.unpaidAmount > 0) alerts.push({ level: "warning", title: "Missing payments", message: "Issued invoices still have unpaid balances. Follow up before new work starts." });
    if (!alerts.length) alerts.push({ level: "good", title: "Stable position", message: "No major cash, debtor, creditor, or expense alerts for this period." });
    return alerts;
  }

  function decisionRows(model) {
    const improving = model.periodPayments >= model.periodExpenses ? "Cash collection is covering current outflows." : "Cash collection is not yet covering current outflows.";
    const risky = model.overdueAmount > 0 ? `Overdue debtors total ${money.format(model.overdueAmount)}.` : "No overdue debtor pressure is visible.";
    const attention = model.creditorsDueAmount > 0 ? `Schedule creditor payments of ${money.format(model.creditorsDueAmount)}.` : "Keep supplier accounts current and monitor new bills.";
    const action = model.health.status === "Critical" || model.health.status === "Watch"
      ? "Prioritize collections, pause non-essential spending, and review supplier payment timing."
      : "Maintain collection discipline and use the positive cash position for planned project delivery.";
    return [["Improving", improving], ["Risky", risky], ["Needs attention", attention], ["Suggested management action", action]];
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
    return new Date(`${dateValue}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }

  function financialYearLabel(date) {
    return `${date.getFullYear()} (Jan-Dec)`;
  }

  function monthName(date) {
    return date.toLocaleString(undefined, { month: "long" });
  }

  function barChart(label, rows, key) {
    const max = Math.max(...rows.map((row) => Math.abs(row[key])), 1);
    return `<article class="chart-card"><h3>${esc(label)}</h3><div class="bar-chart">${rows.map((row) => {
      const height = Math.max(4, Math.round((Math.abs(row[key]) / max) * 96));
      return `<span title="${esc(row.label)}: ${money.format(row[key])}" class="${row[key] < 0 ? "negative" : ""}" style="height:${height}px"></span>`;
    }).join("")}</div><div class="chart-labels">${rows.map((row) => `<small>${esc(row.label.split(" ")[0])}</small>`).join("")}</div></article>`;
  }

  function groupedBarChart(label, rows, keyA, keyB) {
    const max = Math.max(...rows.flatMap((row) => [Math.abs(row[keyA]), Math.abs(row[keyB])]), 1);
    return `<article class="chart-card"><h3>${esc(label)}</h3><div class="grouped-chart">${rows.map((row) => {
      const hA = Math.max(4, Math.round((Math.abs(row[keyA]) / max) * 96));
      const hB = Math.max(4, Math.round((Math.abs(row[keyB]) / max) * 96));
      return `<span><i class="series-a" title="Debtors ${money.format(row[keyA])}" style="height:${hA}px"></i><i class="series-b" title="Creditors ${money.format(row[keyB])}" style="height:${hB}px"></i></span>`;
    }).join("")}</div><p class="muted">Red: debtors | Black: creditors</p></article>`;
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
    return `<article class="chart-card"><h3>${esc(label)}</h3><svg class="line-chart" viewBox="0 0 304 128" role="img" aria-label="${esc(label)}"><polyline points="${points}" fill="none" stroke="#d71920" stroke-width="3"/><line x1="8" y1="112" x2="296" y2="112" stroke="#d8dde4"/></svg></article>`;
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
            ${input("code", "Client code")}
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
          <div class="table-wrap"><table><thead><tr><th>Client</th><th>Contact</th><th>Balance</th><th></th></tr></thead><tbody>
            ${state.clients.map((client) => `<tr><td><strong>${esc(client.name)}</strong><br><span class="muted">${client.number}</span></td><td>${esc(client.email || client.phone || "")}</td><td>${money.format(CGM.clientStatement(state, client.id).balance)}</td><td><button class="secondary-button" data-statement="client" data-id="${client.id}"><i data-lucide="file-text"></i>Statement</button></td></tr>`).join("")}
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
            ${input("amount", "Amount", "number", true, "", "0.01")}
            <label class="field">Debit account<select name="accountId">${accountOptions(["Expenses", "Assets", "Cost of Sales"])}</select></label>
            <label class="field full">Description<textarea name="description"></textarea></label>
            <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="save"></i>Save bill</button></div>
          </form>
        </section>
      </div>
      <section class="panel">
        <div class="table-head"><div><h2>Creditor balances by supplier</h2><p>Supplier subledger balances reconcile to the Creditors Control account.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Supplier</th><th>Contact</th><th>Amount owed</th><th></th></tr></thead><tbody>
          ${state.suppliers.map((supplier) => `<tr><td><strong>${esc(supplier.name)}</strong><br><span class="muted">${supplier.number}</span></td><td>${esc(supplier.email || supplier.phone || "")}</td><td>${money.format(CGM.supplierStatement(state, supplier.id).balance)}</td><td><div class="row-actions"><button class="secondary-button" data-pay-supplier="${supplier.id}"><i data-lucide="credit-card"></i>Pay</button><button class="secondary-button" data-statement="supplier" data-id="${supplier.id}"><i data-lucide="file-text"></i>Statement</button></div></td></tr>`).join("")}
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
          <div class="section-head"><div><h2>Create invoice</h2><p>Posting: Debit Debtors Control, Credit Sales/Income.</p></div></div>
          <form id="invoiceForm" class="form-grid">
            <label class="field full">Client<select name="clientId" required>${clientOptions()}</select></label>
            ${input("date", "Invoice date", "date", true, CGM.today())}
            ${input("dueDate", "Due date", "date", true, CGM.today())}
            <label class="field">Service<select name="serviceId">${serviceOptions()}</select></label>
            ${input("projectCode", "Project code", "text", false, suggestedProjectCode())}
            ${input("projectName", "Project name")}
            ${input("description", "Description", "text", true)}
            ${input("amount", "Amount", "number", true, "", "0.01")}
            <label class="field full">Income account<select name="incomeAccountId">${accountOptions(["Income"])}</select></label>
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
        <div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Client</th><th>Total</th><th>Paid</th><th>Status</th></tr></thead><tbody>
          ${state.invoices.map((invoice) => `<tr><td>${invoice.number}<br><span class="muted">Due ${invoice.dueDate}</span></td><td>${esc(clientName(invoice.clientId))}</td><td>${money.format(CGM.documentTotal(invoice))}</td><td>${money.format(CGM.invoicePaid(state, invoice.id))}</td><td>${badge(CGM.invoiceStatus(state, invoice))}</td></tr>`).join("")}
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
          <div class="section-head"><div><h2>Record paid expense</h2><p>Posting: Debit Expense account, Credit selected Bank or Cash account.</p></div></div>
          <form id="expenseForm" class="form-grid">
            ${input("date", "Date", "date", true, CGM.today())}
            ${input("category", "Category", "text", true)}
            ${input("vendor", "Vendor")}
            ${input("amount", "Amount", "number", true, "", "0.01")}
            <label class="field">Expense account<select name="expenseAccountId">${accountOptions(["Expenses", "Cost of Sales"])}</select></label>
            <label class="field">Paid from<select name="bankAccountId">${accountOptions(["Bank accounts", "Cash accounts"])}</select></label>
            <label class="field full">Description<textarea name="description"></textarea></label>
            <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="save"></i>Save expense</button></div>
          </form>
        </section>
        <section class="panel">${miniReportTable("Expenses", state.expenses.map((e) => [e.date, e.category, e.vendor, money.format(e.amount), e.description]), ["Date", "Category", "Vendor", "Amount", "Description"])}</section>
      </div>
    `;
    qs("#expenseForm")?.addEventListener("submit", handleExpense);
  }

  function renderProjects() {
    qs("#projectsView").innerHTML = `
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

  function reportPanel(titleText, subtitle, key, headers, rows) {
    return `<section class="panel">
      <div class="table-head"><div><h2>${esc(titleText)}</h2><p>${esc(subtitle)}</p></div><div class="export-actions"><button class="secondary-button" data-export-report="${key}" data-format="pdf"><i data-lucide="file-down"></i>Export PDF</button><button class="secondary-button" data-export-report="${key}" data-format="excel"><i data-lucide="sheet"></i>Export Excel</button></div></div>
      ${miniReportTable("", rows, headers)}
    </section>`;
  }

  function miniReportTable(caption, rows, headers = ["Metric", "Value"]) {
    return `${caption ? `<h3>${esc(caption)}</h3>` : ""}<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${(rows.length ? rows : [["No records yet", ""]]).map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function handleClient(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    state.clients.unshift({ ...data, id: CGM.uid(), number: CGM.nextNumber(state, "client", "C"), code: data.code || "", openingBalance: CGM.toNumber(data.openingBalance), createdAt: CGM.today() });
    save();
  }

  function handleSupplier(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    state.suppliers.unshift({ ...data, id: CGM.uid(), number: CGM.nextNumber(state, "supplier", "S"), openingBalance: CGM.toNumber(data.openingBalance), createdAt: CGM.today() });
    save();
  }

  function handleSupplierBill(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    state.supplierBills.unshift({ ...data, id: CGM.uid(), number: CGM.nextNumber(state, "supplierBill", "BILL"), amount: CGM.toNumber(data.amount), projectCode: projectLabel(data.projectId, "") });
    save();
  }

  function handleInvoice(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const project = findOrCreateProject({ clientId: data.clientId, serviceId: data.serviceId, projectCode: data.projectCode, projectName: data.projectName });
    const service = CGM.serviceById(state, data.serviceId);
    state.invoices.unshift({ id: CGM.uid(), number: CGM.nextNumber(state, "invoice", "INV"), clientId: data.clientId, date: data.date, dueDate: data.dueDate, serviceId: data.serviceId, projectId: project?.id || "", projectCode: project?.code || "", incomeAccountId: data.incomeAccountId || service?.incomeAccountId || "sales_income", notes: data.notes, items: [{ description: data.description, qty: 1, rate: CGM.toNumber(data.amount) }] });
    save();
  }

  function handlePayment(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const invoice = state.invoices.find((item) => item.id === data.invoiceId);
    state.payments.unshift({ ...data, id: CGM.uid(), clientId: invoice?.clientId || "", projectId: invoice?.projectId || "", projectCode: invoice?.projectCode || "", serviceId: invoice?.serviceId || "", amount: CGM.toNumber(data.amount), receiptNumber: CGM.nextNumber(state, "receipt", "RCT") });
    save();
  }

  function handleExpense(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    state.expenses.unshift({ ...data, id: CGM.uid(), projectCode: projectLabel(data.projectId, ""), amount: CGM.toNumber(data.amount), paymentMethod: "Paid" });
    save();
  }

  function handleBookQuote(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    state.quotations.unshift({
      id: CGM.uid(),
      number: CGM.nextNumber(state, "quotation", "QT"),
      clientId: "",
      clientSnapshot: clientSnapshotFromEntry(data),
      date: data.date,
      validUntil: data.validUntil,
      serviceId: data.serviceId,
      projectCode: data.projectCode,
      projectName: data.projectName,
      status: "draft",
      notes: data.notes,
      items: [{ description: data.description, qty: 1, rate: CGM.toNumber(data.amount) }],
      source: "bookkeeping",
    });
    save();
  }

  function handleBookInvoice(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const client = findOrCreateClient(clientSnapshotFromEntry(data));
    const project = findOrCreateProject({ clientId: client.id, serviceId: data.serviceId, projectCode: data.projectCode, projectName: data.projectName });
    const service = CGM.serviceById(state, data.serviceId);
    state.invoices.unshift({
      id: CGM.uid(),
      number: CGM.nextNumber(state, "invoice", "INV"),
      clientId: client.id,
      date: data.date,
      dueDate: data.dueDate,
      serviceId: data.serviceId,
      projectId: project?.id || "",
      projectCode: project?.code || "",
      incomeAccountId: data.incomeAccountId || service?.incomeAccountId || "sales_income",
      notes: data.notes,
      items: [{ description: data.description, qty: 1, rate: CGM.toNumber(data.amount) }],
      source: "bookkeeping",
    });
    save();
  }

  function handleBookReceipt(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const invoice = state.invoices.find((item) => item.id === data.invoiceId);
    if (!invoice) return;
    state.payments.unshift({
      ...data,
      id: CGM.uid(),
      clientId: invoice.clientId,
      projectId: invoice.projectId || "",
      projectCode: invoice.projectCode || "",
      serviceId: invoice.serviceId || "",
      amount: CGM.toNumber(data.amount),
      receiptNumber: CGM.nextNumber(state, "receipt", "RCT"),
      source: "bookkeeping",
    });
    save();
  }

  function handleBookExpense(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    state.expenses.unshift({ ...data, id: CGM.uid(), projectCode: projectLabel(data.projectId, ""), amount: CGM.toNumber(data.amount), paymentMethod: "Paid", source: "bookkeeping" });
    save();
  }

  function handleBookSupplierBill(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const supplier = findOrCreateSupplier({
      name: data.supplierName,
      email: data.email,
      phone: data.phone,
    });
    state.supplierBills.unshift({
      id: CGM.uid(),
      number: CGM.nextNumber(state, "supplierBill", "BILL"),
      supplierId: supplier.id,
      date: data.date,
      dueDate: data.dueDate,
      serviceId: data.serviceId,
      projectId: data.projectId,
      projectCode: projectLabel(data.projectId, ""),
      amount: CGM.toNumber(data.amount),
      accountId: data.accountId || "general_expenses",
      description: data.description,
      source: "bookkeeping",
    });
    save();
  }

  function handleCashTransfer(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (data.fromAccountId === data.toAccountId) {
      openModal("Transfer not saved", "<p>Choose two different accounts for a bank/cash transfer.</p>");
      return;
    }
    state.cashTransactions.unshift({
      ...data,
      id: CGM.uid(),
      number: CGM.nextNumber(state, "cash", "CASH"),
      amount: CGM.toNumber(data.amount),
    });
    save();
  }

  function handleJournal(event) {
    event.preventDefault();
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
    state.journalEntries.unshift({ id: CGM.uid(), number: CGM.nextNumber(state, "journal", "JNL"), date: data.date, memo: data.memo, lines: rows });
    save();
  }

  function openSupplierPayment(supplierId) {
    const supplier = state.suppliers.find((item) => item.id === supplierId);
    const bills = state.supplierBills.filter((bill) => bill.supplierId === supplierId && CGM.billStatus(state, bill) !== "paid");
    openModal("Pay supplier", `<form id="supplierPaymentForm" class="form-grid">
      <label class="field full">Bill<select name="billId">${bills.map((bill) => `<option value="${bill.id}">${bill.number} - ${money.format(bill.amount - CGM.supplierBillPaid(state, bill.id))}</option>`).join("")}</select></label>
      ${input("date", "Payment date", "date", true, CGM.today())}
      ${input("amount", "Amount", "number", true, "", "0.01")}
      ${input("reference", "Reference", "text", false, `PAY-${supplier?.number || ""}`)}
      <label class="field full">Paid from<select name="bankAccountId">${accountOptions(["Bank accounts", "Cash accounts"])}</select></label>
      <div class="actions full"><button class="primary-button" type="submit">Save payment</button></div>
    </form>`);
    qs("#supplierPaymentForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      state.supplierPayments.unshift({ ...data, id: CGM.uid(), supplierId, amount: CGM.toNumber(data.amount) });
      closeModal();
      save();
    });
  }

  function approveQuotation(id) {
    const quote = state.quotations.find((item) => item.id === id);
    if (!quote || quote.status === "invoiced") return;
    state.quotations = state.quotations.map((quote) => (quote.id === id ? { ...quote, status: "approved" } : quote));
    save();
  }

  function transferQuotationToInvoice(id) {
    const quote = state.quotations.find((item) => item.id === id);
    if (!quote) return;
    if (quote.invoiceId || quote.status === "invoiced") {
      openModal("Already transferred", "<p>This quotation has already been transferred to an invoice.</p>");
      return;
    }
    if (quote.status !== "approved") {
      openModal("Approval required", "<p>Approve the quotation before transferring it to an invoice.</p>");
      return;
    }
    const client = quote.clientId
      ? state.clients.find((item) => item.id === quote.clientId)
      : findOrCreateClient(quote.clientSnapshot || { name: quotationClientName(quote) });
    const project = quote.projectId
      ? state.projects.find((item) => item.id === quote.projectId)
      : findOrCreateProject({ clientId: client.id, serviceId: quote.serviceId, projectCode: quote.projectCode, projectName: quote.projectName || quote.items?.[0]?.description });
    const service = CGM.serviceById(state, quote.serviceId);
    const invoice = {
      id: CGM.uid(),
      number: CGM.nextNumber(state, "invoice", "INV"),
      clientId: client.id,
      quotationId: quote.id,
      date: CGM.today(),
      dueDate: CGM.today(),
      serviceId: quote.serviceId,
      projectId: project?.id || "",
      projectCode: project?.code || quote.projectCode || "",
      incomeAccountId: service?.incomeAccountId || "sales_income",
      notes: `Transferred from quotation ${quote.number}. ${quote.notes || ""}`.trim(),
      items: quote.items || [],
      source: "bookkeeping",
    };
    state.invoices.unshift(invoice);
    state.quotations = state.quotations.map((item) => (item.id === id ? { ...item, status: "invoiced", clientId: client.id, projectId: project?.id || "", projectCode: project?.code || quote.projectCode || "", invoiceId: invoice.id } : item));
    save();
  }

  function findOrCreateClient(snapshot) {
    const cleanName = String(snapshot.name || "").trim();
    const cleanEmail = String(snapshot.email || "").trim().toLowerCase();
    const existing = state.clients.find((client) => {
      const sameEmail = cleanEmail && String(client.email || "").toLowerCase() === cleanEmail;
      const sameName = cleanName && String(client.name || "").toLowerCase() === cleanName.toLowerCase();
      return sameEmail || sameName;
    });
    if (existing) return existing;
    const client = {
      id: CGM.uid(),
      number: CGM.nextNumber(state, "client", "C"),
      code: snapshot.code || "",
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

  function findOrCreateProject({ clientId, serviceId, projectCode, projectName }) {
    const cleanCode = String(projectCode || "").trim();
    const existing = state.projects.find((project) => cleanCode && String(project.code).toLowerCase() === cleanCode.toLowerCase());
    if (existing) return existing;
    if (!cleanCode && !projectName) return null;
    const project = {
      id: CGM.uid(),
      code: cleanCode || CGM.nextNumber(state, "project", "PRJ"),
      name: projectName || cleanCode || "Unnamed project",
      clientId: clientId || "",
      serviceId: serviceId || "",
      status: "active",
      createdAt: CGM.today(),
    };
    state.projects.unshift(project);
    return project;
  }

  function findOrCreateSupplier(snapshot) {
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
      number: CGM.nextNumber(state, "supplier", "S"),
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
    return {
      name: data.clientName,
      contact: data.contact || "",
      email: data.email || "",
      phone: data.phone || "",
      address: data.address || "",
    };
  }

  function quotationClientName(quote) {
    return state.clients.find((client) => client.id === quote.clientId)?.name || quote.clientSnapshot?.name || "Unlinked prospect";
  }

  function openInvoiceOptions() {
    const openInvoices = state.invoices.filter((invoice) => CGM.invoiceStatus(state, invoice) !== "paid");
    if (!openInvoices.length) return `<option value="">No unpaid invoices available</option>`;
    return openInvoices.map((invoice) => `<option value="${invoice.id}">${invoice.number} - ${esc(clientName(invoice.clientId))} - ${money.format(CGM.documentTotal(invoice) - CGM.invoicePaid(state, invoice.id))}</option>`).join("");
  }

  function recentBookkeepingRows() {
    const rows = [
      ...state.quotations.map((quote) => [quote.date, "Quotation", quote.number, quotationClientName(quote), money.format(CGM.documentTotal(quote)), quote.status === "invoiced" ? "Transferred to invoice" : "No ledger posting yet"]),
      ...state.invoices.map((invoice) => [invoice.date, "Invoice", invoice.number, clientName(invoice.clientId), money.format(CGM.documentTotal(invoice)), "Dr Debtors Control / Cr Income"]),
      ...state.payments.map((payment) => [payment.date, "Receipt", payment.receiptNumber, clientName(payment.clientId), money.format(payment.amount), "Dr Bank/Cash / Cr Debtors Control"]),
      ...state.expenses.map((expense) => [expense.date, "Expense", expense.reference || expense.category, expense.vendor || "", money.format(expense.amount), "Dr Expense / Cr Bank/Cash"]),
      ...state.supplierBills.map((bill) => [bill.date, "Supplier bill", bill.number, supplierName(bill.supplierId), money.format(bill.amount), "Dr Expense/Asset / Cr Creditors Control"]),
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
    const backendOk = await exportViaBackend(format, report);
    if (backendOk) return;
    if (format === "excel") downloadExcelLike(`${report.title}.xls`, report.title, report.headers, report.rows);
    else downloadPdf(`${report.title}.pdf`, [report.title, "", report.headers.join(" | "), ...report.rows.map((row) => row.join(" | "))]);
  }

  async function exportViaBackend(format, report) {
    try {
      const response = await fetch(`http://127.0.0.1:8765/api/export/${format === "excel" ? "excel" : "pdf"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "generic-report",
          filename: `${report.title}.${format === "excel" ? "xlsx" : "pdf"}`,
          report,
          data: state,
        }),
      });
      if (!response.ok) throw new Error(`Backend returned ${response.status}`);
      downloadBlob(await response.blob(), `${report.title}.${format === "excel" ? "xlsx" : "pdf"}`);
      return true;
    } catch (error) {
      console.info("Using browser report export fallback:", error.message);
      return false;
    }
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
      ? CGM.ageing(state.invoices.filter((invoice) => CGM.invoiceStatus(state, invoice) !== "paid"), (invoice) => invoice.dueDate, (invoice) => CGM.documentTotal(invoice) - CGM.invoicePaid(state, invoice.id))
      : CGM.ageing(state.supplierBills.filter((bill) => CGM.billStatus(state, bill) !== "paid"), (bill) => bill.dueDate || bill.date, (bill) => CGM.toNumber(bill.amount) - CGM.supplierBillPaid(state, bill.id));
    return [["Current / 0-30", money.format(buckets.current)], ["31-60", money.format(buckets.d30)], ["61-90", money.format(buckets.d60)], ["90+", money.format(buckets.d90)]];
  }

  function input(name, label, type = "text", required = false, value = "", step = "") {
    return `<label class="field">${label}<input name="${name}" type="${type}" ${required ? "required" : ""} ${step ? `step="${step}"` : ""} value="${esc(value)}"></label>`;
  }

  function badge(status) {
    return `<span class="status ${status}">${title(status)}</span>`;
  }

  function title(value) {
    return String(value)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replaceAll("-", " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
  }

  function clientName(id) {
    return state.clients.find((client) => client.id === id)?.name || "";
  }

  function accountName(id) {
    return state.accounts.find((account) => account.id === id)?.name || id;
  }

  function supplierName(id) {
    return state.suppliers.find((supplier) => supplier.id === id)?.name || "";
  }

  function serviceName(id) {
    return state.services.find((service) => service.id === id)?.name || "Unassigned";
  }

  function projectLabel(projectId, fallback = "") {
    const project = state.projects.find((item) => item.id === projectId);
    return project ? `${project.code} - ${project.name}` : fallback || "Unassigned";
  }

  function suggestedProjectCode() {
    return `PRJ-${String((state.counters.project || 1)).padStart(4, "0")}`;
  }

  function projectProfitRows() {
    return (state.projects || []).map((project) => {
      const income = state.invoices.filter((invoice) => invoice.projectId === project.id).reduce((sum, invoice) => sum + CGM.documentTotal(invoice), 0);
      const paidExpenses = state.expenses.filter((expense) => expense.projectId === project.id).reduce((sum, expense) => sum + CGM.toNumber(expense.amount), 0);
      const supplierBills = state.supplierBills.filter((bill) => bill.projectId === project.id).reduce((sum, bill) => sum + CGM.toNumber(bill.amount), 0);
      return [projectLabel(project.id), clientName(project.clientId), serviceName(project.serviceId), money.format(income), money.format(paidExpenses + supplierBills), money.format(income - paidExpenses - supplierBills)];
    });
  }

  function serviceProfitRows() {
    return (state.services || []).map((service) => {
      const income = state.invoices.filter((invoice) => invoice.serviceId === service.id).reduce((sum, invoice) => sum + CGM.documentTotal(invoice), 0);
      const paidExpenses = state.expenses.filter((expense) => expense.serviceId === service.id).reduce((sum, expense) => sum + CGM.toNumber(expense.amount), 0);
      const supplierBills = state.supplierBills.filter((bill) => bill.serviceId === service.id).reduce((sum, bill) => sum + CGM.toNumber(bill.amount), 0);
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
    qs("#modalBackdrop").hidden = true;
  }

  function downloadExcelLike(filename, titleText, headers, rows) {
    const html = `<html><head><meta charset="utf-8"></head><body><table><tr><th colspan="${headers.length}">${esc(titleText)}</th></tr><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>${rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
    downloadBlob(new Blob([html], { type: "application/vnd.ms-excel" }), filename);
  }

  function downloadPdf(filename, lines) {
    const safe = lines.flatMap((line) => wrap(String(line).replace(/[^\x20-\x7E]/g, " "), 92));
    const content = ["BT", "/F1 15 Tf", "50 790 Td", "(Civil-Gineer Masta) Tj", "/F1 10 Tf", ...safe.map((line, i) => `1 0 0 1 50 ${760 - i * 14} Tm (${line.replace(/[\\()]/g, "\\$&")}) Tj`), "ET"].join("\n");
    const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    downloadBlob(new Blob([pdf], { type: "application/pdf" }), filename);
  }

  function downloadBlob(blob, filename) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function wrap(line, max) {
    const words = line.split(" ");
    const lines = [];
    let current = "";
    words.forEach((word) => {
      if (`${current} ${word}`.trim().length > max) {
        lines.push(current);
        current = word;
      } else current = `${current} ${word}`.trim();
    });
    if (current) lines.push(current);
    return lines;
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.portalOpen) openPortal(button.dataset.portalOpen);
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
  });

  qs("#modalBackdrop").addEventListener("click", (event) => {
    if (event.target.id === "modalBackdrop") closeModal();
  });

  render();
  showLanding();
})();
