const STORAGE_KEY = "cgm-accounting-v1";
const EXPORT_API_URL = "http://127.0.0.1:8765";
const COMPANY_DETAILS = {
  name: "Civil-Gineer Masta",
  subtitle: "Civil and structural engineering services",
  address: "Gaborone, Botswana",
  phone: "+267 00 000 000",
  email: "accounts@civilgineermasta.com",
  terms:
    "Payment due according to agreed project terms. Please reference the document number on all payments.",
};

const money = new Intl.NumberFormat("en-BW", {
  style: "currency",
  currency: "BWP",
});

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => crypto.randomUUID();
const qs = (selector, scope = document) => scope.querySelector(selector);
const qsa = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const createInitialState = () => ({
  clients: [],
  quotations: [],
  invoices: [],
  payments: [],
  expenses: [],
  counters: { quotation: 1, invoice: 1, receipt: 1 },
});

const storage = {
  load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedData();
    try {
      return { ...createInitialState(), ...JSON.parse(raw) };
    } catch {
      return seedData();
    }
  },
  save(nextState) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  },
};

let state = storage.load();
let activeView = "dashboard";

function seedData() {
  const clientId = uid();
  const invoiceId = uid();
  return {
    ...createInitialState(),
    clients: [
      {
        id: clientId,
        name: "Molefe Developments",
        contact: "Kabelo Molefe",
        email: "accounts@molefedev.example",
        phone: "+267 71 000 100",
        address: "Plot 108, Gaborone",
        taxId: "",
        createdAt: today(),
      },
    ],
    quotations: [
      {
        id: uid(),
        number: "QT-0001",
        clientId,
        date: today(),
        validUntil: today(),
        status: "sent",
        notes: "Site inspection and structural concept design.",
        items: [
          { description: "Structural design consultation", qty: 1, rate: 8500 },
          { description: "Drawing review", qty: 3, rate: 650 },
        ],
        createdAt: today(),
      },
    ],
    invoices: [
      {
        id: invoiceId,
        number: "INV-0001",
        clientId,
        quotationId: "",
        date: today(),
        dueDate: today(),
        notes: "Initial engineering services invoice.",
        items: [{ description: "Foundation design package", qty: 1, rate: 12000 }],
        createdAt: today(),
      },
    ],
    payments: [
      {
        id: uid(),
        invoiceId,
        date: today(),
        amount: 6000,
        method: "Bank transfer",
        reference: "DEP-001",
        receiptNumber: "RCT-0001",
      },
    ],
    expenses: [
      {
        id: uid(),
        date: today(),
        category: "Transport",
        vendor: "Fuel Station",
        description: "Client site visit",
        amount: 450,
        paymentMethod: "Cash",
      },
    ],
    counters: { quotation: 2, invoice: 2, receipt: 2 },
  };
}

function persist() {
  storage.save(state);
  render();
}

const repositories = {
  clients: {
    upsert(client) {
      const payload = { ...client, createdAt: client.createdAt || today() };
      state.clients = client.id
        ? state.clients.map((item) => (item.id === client.id ? payload : item))
        : [{ ...payload, id: uid() }, ...state.clients];
      persist();
    },
    remove(id) {
      state.clients = state.clients.filter((client) => client.id !== id);
      persist();
    },
  },
  quotations: {
    create(quotation) {
      state.quotations = [
        {
          ...quotation,
          id: uid(),
          number: nextNumber("quotation", "QT"),
          createdAt: today(),
        },
        ...state.quotations,
      ];
      persist();
    },
    updateStatus(id, status) {
      state.quotations = state.quotations.map((quote) =>
        quote.id === id ? { ...quote, status } : quote,
      );
      persist();
    },
    remove(id) {
      state.quotations = state.quotations.filter((quote) => quote.id !== id);
      persist();
    },
  },
  invoices: {
    create(invoice) {
      state.invoices = [
        {
          ...invoice,
          id: uid(),
          number: nextNumber("invoice", "INV"),
          createdAt: today(),
        },
        ...state.invoices,
      ];
      persist();
    },
    remove(id) {
      state.invoices = state.invoices.filter((invoice) => invoice.id !== id);
      state.payments = state.payments.filter((payment) => payment.invoiceId !== id);
      persist();
    },
  },
  payments: {
    create(payment) {
      const receiptNumber = nextNumber("receipt", "RCT");
      const savedPayment = { ...payment, id: uid(), receiptNumber };
      state.payments = [savedPayment, ...state.payments];
      storage.save(state);
      render();
      openDocumentModal("Receipt generated", renderReceiptPreview(savedPayment), () =>
        exportReceipt(savedPayment.id),
      );
    },
  },
  expenses: {
    create(expense) {
      state.expenses = [{ ...expense, id: uid() }, ...state.expenses];
      persist();
    },
    remove(id) {
      state.expenses = state.expenses.filter((expense) => expense.id !== id);
      persist();
    },
  },
};

function nextNumber(key, prefix) {
  const value = state.counters[key] || 1;
  state.counters[key] = value + 1;
  return `${prefix}-${String(value).padStart(4, "0")}`;
}

function getClient(id) {
  return state.clients.find((client) => client.id === id);
}

function lineTotal(item) {
  return Number(item.qty || 0) * Number(item.rate || 0);
}

function documentTotal(document) {
  return (document.items || []).reduce((sum, item) => sum + lineTotal(item), 0);
}

function invoicePaid(invoiceId) {
  return state.payments
    .filter((payment) => payment.invoiceId === invoiceId)
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
}

function invoiceStatus(invoice) {
  const total = documentTotal(invoice);
  const paid = invoicePaid(invoice.id);
  if (paid <= 0) return "unpaid";
  if (paid + 0.01 >= total) return "paid";
  return "partial";
}

function monthKey(dateValue) {
  return String(dateValue || "").slice(0, 7);
}

function currentMonthSummary() {
  const month = monthKey(today());
  const invoices = state.invoices.filter((invoice) => monthKey(invoice.date) === month);
  const payments = state.payments.filter((payment) => monthKey(payment.date) === month);
  const expenses = state.expenses.filter((expense) => monthKey(expense.date) === month);
  const invoiced = invoices.reduce((sum, invoice) => sum + documentTotal(invoice), 0);
  const received = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const spent = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  return { invoiced, received, spent, net: received - spent };
}

function setView(view) {
  activeView = view;
  qsa(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  qsa(".view").forEach((section) => section.classList.toggle("active", section.id === `${view}View`));
  qs("#pageTitle").textContent = view[0].toUpperCase() + view.slice(1);
  qs(".sidebar").classList.remove("open");
  render();
}

function render() {
  renderDashboard();
  renderClients();
  renderQuotations();
  renderInvoices();
  renderExpenses();
  if (window.lucide) lucide.createIcons();
}

function renderDashboard() {
  const summary = currentMonthSummary();
  const unpaid = state.invoices.filter((invoice) => invoiceStatus(invoice) !== "paid");
  qs("#dashboardView").innerHTML = `
    <div class="metrics-grid">
      ${metric("Monthly invoiced", money.format(summary.invoiced))}
      ${metric("Payments received", money.format(summary.received))}
      ${metric("Expenses", money.format(summary.spent))}
      ${metric("Net cash", money.format(summary.net))}
    </div>
    <div class="grid-two">
      <section class="panel">
        <div class="table-head">
          <div>
            <h2>Payment tracking</h2>
            <p>Open invoices by payment state.</p>
          </div>
        </div>
        ${unpaid.length ? `
          <div class="mini-list">
            ${unpaid.map((invoice) => {
              const total = documentTotal(invoice);
              const paid = invoicePaid(invoice.id);
              return `
                <article>
                  <strong>${invoice.number}</strong>
                  <p class="muted">${escapeHtml(getClient(invoice.clientId)?.name || "No client")} - ${money.format(paid)} of ${money.format(total)}</p>
                  ${statusBadge(invoiceStatus(invoice))}
                </article>
              `;
            }).join("")}
          </div>
        ` : `<p class="empty-state">No unpaid invoices right now.</p>`}
      </section>
      <section class="panel">
        <div class="table-head">
          <div>
            <h2>Monthly summary</h2>
            <p>Based on documents dated in ${today().slice(0, 7)}.</p>
          </div>
          <div class="export-actions">
            <button class="secondary-button" data-action="export-report-pdf"><i data-lucide="file-down"></i>Export PDF</button>
            <button class="secondary-button" data-action="export-excel"><i data-lucide="sheet"></i>Export Excel</button>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Metric</th><th>Amount</th></tr></thead>
            <tbody>
              <tr><td>Invoice value issued</td><td>${money.format(summary.invoiced)}</td></tr>
              <tr><td>Cash received</td><td>${money.format(summary.received)}</td></tr>
              <tr><td>Expenses recorded</td><td>${money.format(summary.spent)}</td></tr>
              <tr><td><strong>Net cash position</strong></td><td><strong>${money.format(summary.net)}</strong></td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

function metric(label, value) {
  return `<article class="metric-card"><span>${label}</span><strong>${value}</strong></article>`;
}

function renderClients() {
  qs("#clientsView").innerHTML = `
    <div class="grid-two">
      <section class="panel">
        <div class="section-head">
          <div>
            <h2>Add client</h2>
            <p>Capture billing and contact details.</p>
          </div>
        </div>
        <form id="clientForm" class="form-grid">
          ${input("name", "Client name", "text", true)}
          ${input("contact", "Contact person")}
          ${input("email", "Email", "email")}
          ${input("phone", "Phone")}
          ${input("taxId", "Tax/VAT number")}
          <label class="field full">Address<textarea name="address"></textarea></label>
          <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="save"></i>Save client</button></div>
        </form>
      </section>
      <section class="panel">
        <div class="table-head">
          <div>
            <h2>Clients</h2>
            <p>${state.clients.length} saved client${state.clients.length === 1 ? "" : "s"}.</p>
          </div>
          <button class="secondary-button" data-action="export-excel"><i data-lucide="sheet"></i>Export Excel</button>
        </div>
        ${clientTable()}
      </section>
    </div>
  `;
  qs("#clientForm").addEventListener("submit", handleClientSubmit);
}

function clientTable() {
  if (!state.clients.length) return `<p class="empty-state">Add your first client to create quotations and invoices.</p>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Phone</th><th></th></tr></thead>
        <tbody>
          ${state.clients.map((client) => `
            <tr>
              <td><strong>${escapeHtml(client.name)}</strong><br><span class="muted">${escapeHtml(client.address || "")}</span></td>
              <td>${escapeHtml(client.contact || "")}</td>
              <td>${escapeHtml(client.email || "")}</td>
              <td>${escapeHtml(client.phone || "")}</td>
              <td><div class="row-actions"><button class="danger-button" data-action="delete-client" data-id="${client.id}"><i data-lucide="trash-2"></i>Delete</button></div></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderQuotations() {
  qs("#quotationsView").innerHTML = `
    <div class="grid-two">
      <section class="panel">
        <div class="section-head">
          <div>
            <h2>Create quotation</h2>
            <p>Build priced line items for a client.</p>
          </div>
        </div>
        ${state.clients.length ? documentForm("quotation") : `<p class="empty-state">Add a client before creating a quotation.</p>`}
      </section>
      <section class="panel">
        <div class="table-head">
          <div>
            <h2>Quotations</h2>
            <p>Export client-ready PDF quotations.</p>
          </div>
          <button class="secondary-button" data-action="export-excel"><i data-lucide="sheet"></i>Export Excel</button>
        </div>
        ${quotationTable()}
      </section>
    </div>
  `;
  bindDocumentForm("quotation");
}

function quotationTable() {
  if (!state.quotations.length) return `<p class="empty-state">No quotations have been created yet.</p>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Number</th><th>Client</th><th>Date</th><th>Total</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${state.quotations.map((quote) => `
            <tr>
              <td><strong>${quote.number}</strong></td>
              <td>${escapeHtml(getClient(quote.clientId)?.name || "Missing client")}</td>
              <td>${quote.date}</td>
              <td>${money.format(documentTotal(quote))}</td>
              <td>${statusSelect("quote-status", quote.id, quote.status, ["draft", "sent", "accepted", "rejected"])}</td>
              <td>
                <div class="row-actions">
                  <button class="secondary-button" data-action="export-quote" data-id="${quote.id}"><i data-lucide="file-down"></i>Export PDF</button>
                  <button class="secondary-button" data-action="invoice-from-quote" data-id="${quote.id}"><i data-lucide="copy-plus"></i>Invoice</button>
                  <button class="danger-button" data-action="delete-quote" data-id="${quote.id}"><i data-lucide="trash-2"></i>Delete</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderInvoices() {
  qs("#invoicesView").innerHTML = `
    <div class="grid-two">
      <section class="panel">
        <div class="section-head">
          <div>
            <h2>Create invoice</h2>
            <p>Issue invoices and track payment status.</p>
          </div>
        </div>
        ${state.clients.length ? documentForm("invoice") : `<p class="empty-state">Add a client before creating an invoice.</p>`}
      </section>
      <section class="panel">
        <div class="table-head">
          <div>
            <h2>Invoices</h2>
            <p>Record payments and generate receipts.</p>
          </div>
          <button class="secondary-button" data-action="export-excel"><i data-lucide="sheet"></i>Export Excel</button>
        </div>
        ${invoiceTable()}
      </section>
    </div>
  `;
  bindDocumentForm("invoice");
}

function invoiceTable() {
  if (!state.invoices.length) return `<p class="empty-state">No invoices have been created yet.</p>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Number</th><th>Client</th><th>Total</th><th>Paid</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${state.invoices.map((invoice) => {
            const total = documentTotal(invoice);
            const paid = invoicePaid(invoice.id);
            return `
              <tr>
                <td><strong>${invoice.number}</strong><br><span class="muted">Due ${invoice.dueDate}</span></td>
                <td>${escapeHtml(getClient(invoice.clientId)?.name || "Missing client")}</td>
                <td>${money.format(total)}</td>
                <td>${money.format(paid)}</td>
                <td>${statusBadge(invoiceStatus(invoice))}</td>
                <td>
                  <div class="row-actions">
                    <button class="secondary-button" data-action="record-payment" data-id="${invoice.id}"><i data-lucide="credit-card"></i>Pay</button>
                    <button class="secondary-button" data-action="export-invoice" data-id="${invoice.id}"><i data-lucide="file-down"></i>Export PDF</button>
                    <button class="danger-button" data-action="delete-invoice" data-id="${invoice.id}"><i data-lucide="trash-2"></i>Delete</button>
                  </div>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderExpenses() {
  qs("#expensesView").innerHTML = `
    <div class="grid-two">
      <section class="panel">
        <div class="section-head">
          <div>
            <h2>Record expense</h2>
            <p>Track business costs for monthly summaries.</p>
          </div>
        </div>
        <form id="expenseForm" class="form-grid">
          ${input("date", "Date", "date", true, today())}
          ${input("category", "Category", "text", true)}
          ${input("vendor", "Vendor")}
          ${input("amount", "Amount", "number", true, "", "0.01")}
          ${input("paymentMethod", "Payment method")}
          <label class="field full">Description<textarea name="description"></textarea></label>
          <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="save"></i>Save expense</button></div>
        </form>
      </section>
      <section class="panel">
        <div class="table-head">
          <div>
            <h2>Expenses</h2>
            <p>${money.format(state.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0))} total recorded.</p>
          </div>
          <button class="secondary-button" data-action="export-excel"><i data-lucide="sheet"></i>Export Excel</button>
        </div>
        ${expenseTable()}
      </section>
    </div>
  `;
  qs("#expenseForm").addEventListener("submit", handleExpenseSubmit);
}

function expenseTable() {
  if (!state.expenses.length) return `<p class="empty-state">No expenses recorded yet.</p>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Category</th><th>Vendor</th><th>Description</th><th>Amount</th><th></th></tr></thead>
        <tbody>
          ${state.expenses.map((expense) => `
            <tr>
              <td>${expense.date}</td>
              <td>${escapeHtml(expense.category)}</td>
              <td>${escapeHtml(expense.vendor || "")}</td>
              <td>${escapeHtml(expense.description || "")}</td>
              <td>${money.format(Number(expense.amount || 0))}</td>
              <td><button class="danger-button" data-action="delete-expense" data-id="${expense.id}"><i data-lucide="trash-2"></i>Delete</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function documentForm(type) {
  const isInvoice = type === "invoice";
  return `
    <form id="${type}Form" class="form-grid">
      <label class="field full">Client
        <select name="clientId" required>${state.clients.map((client) => `<option value="${client.id}">${escapeHtml(client.name)}</option>`).join("")}</select>
      </label>
      ${input("date", "Date", "date", true, today())}
      ${isInvoice ? input("dueDate", "Due date", "date", true, today()) : input("validUntil", "Valid until", "date", true, today())}
      ${!isInvoice ? `
        <label class="field">Status
          <select name="status">
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
      ` : ""}
      <div class="items-editor">
        <label>Line items</label>
        <div id="${type}Items"></div>
        <button class="ghost-button" type="button" data-action="add-item" data-target="${type}"><i data-lucide="plus"></i>Add line</button>
        <div class="total-line"><span>Total</span><span id="${type}Total">${money.format(0)}</span></div>
      </div>
      <label class="field full">Notes<textarea name="notes"></textarea></label>
      <div class="actions full"><button class="primary-button" type="submit"><i data-lucide="save"></i>Create ${type}</button></div>
    </form>
  `;
}

function bindDocumentForm(type) {
  const form = qs(`#${type}Form`);
  if (!form) return;
  const container = qs(`#${type}Items`);
  addItemRow(container);
  form.addEventListener("input", () => updateFormTotal(type));
  form.addEventListener("submit", (event) => handleDocumentSubmit(event, type));
}

function addItemRow(container, item = {}) {
  const row = document.createElement("div");
  row.className = "item-row";
  row.innerHTML = `
    <label class="field">Description<input name="description" required value="${escapeAttr(item.description || "")}" /></label>
    <label class="field">Qty<input name="qty" type="number" min="0" step="0.01" required value="${item.qty || 1}" /></label>
    <label class="field">Rate<input name="rate" type="number" min="0" step="0.01" required value="${item.rate || ""}" /></label>
    <button class="icon-button" type="button" data-action="remove-item" aria-label="Remove line item"><i data-lucide="trash-2"></i></button>
  `;
  container.append(row);
  if (window.lucide) lucide.createIcons();
}

function collectItems(form) {
  return qsa(".item-row", form).map((row) => ({
    description: qs('[name="description"]', row).value.trim(),
    qty: Number(qs('[name="qty"]', row).value || 0),
    rate: Number(qs('[name="rate"]', row).value || 0),
  })).filter((item) => item.description && item.qty > 0);
}

function updateFormTotal(type) {
  const form = qs(`#${type}Form`);
  const total = collectItems(form).reduce((sum, item) => sum + lineTotal(item), 0);
  qs(`#${type}Total`).textContent = money.format(total);
}

function handleClientSubmit(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  repositories.clients.upsert(data);
}

function handleDocumentSubmit(event, type) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const items = collectItems(form);
  if (!items.length) return;
  if (type === "quotation") repositories.quotations.create({ ...data, items });
  if (type === "invoice") repositories.invoices.create({ ...data, items, quotationId: "" });
}

function handleExpenseSubmit(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  repositories.expenses.create({ ...data, amount: Number(data.amount || 0) });
}

function openPaymentModal(invoiceId) {
  const invoice = state.invoices.find((item) => item.id === invoiceId);
  const outstanding = Math.max(documentTotal(invoice) - invoicePaid(invoice.id), 0);
  openModal("Record payment", `
    <form id="paymentForm" class="form-grid">
      ${input("date", "Payment date", "date", true, today())}
      ${input("amount", "Amount", "number", true, outstanding.toFixed(2), "0.01")}
      ${input("method", "Method", "text", true, "Bank transfer")}
      ${input("reference", "Reference")}
      <div class="actions full">
        <button class="primary-button" type="submit"><i data-lucide="receipt"></i>Record and create receipt</button>
      </div>
    </form>
  `);
  qs("#paymentForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    closeModal();
    repositories.payments.create({ ...data, invoiceId, amount: Number(data.amount || 0) });
  });
}

function createInvoiceFromQuote(id) {
  const quote = state.quotations.find((item) => item.id === id);
  if (!quote) return;
  repositories.invoices.create({
    clientId: quote.clientId,
    quotationId: quote.id,
    date: today(),
    dueDate: today(),
    notes: `Converted from quotation ${quote.number}. ${quote.notes || ""}`.trim(),
    items: quote.items,
  });
  setView("invoices");
}

function statusSelect(name, id, value, options) {
  return `
    <select aria-label="Status" data-action="${name}" data-id="${id}">
      ${options.map((option) => `<option value="${option}" ${option === value ? "selected" : ""}>${titleCase(option)}</option>`).join("")}
    </select>
  `;
}

function statusBadge(status) {
  return `<span class="status ${status}">${titleCase(status)}</span>`;
}

function input(name, label, type = "text", required = false, value = "", step = "") {
  return `
    <label class="field">${label}
      <input name="${name}" type="${type}" ${required ? "required" : ""} ${step ? `step="${step}"` : ""} value="${escapeAttr(value)}" />
    </label>
  `;
}

function titleCase(value) {
  return String(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function openModal(title, body) {
  qs("#modalTitle").textContent = title;
  qs("#modalBody").innerHTML = body;
  qs("#modalBackdrop").hidden = false;
  if (window.lucide) lucide.createIcons();
}

function closeModal() {
  qs("#modalBackdrop").hidden = true;
}

function openDocumentModal(title, previewHtml, exportHandler) {
  openModal(title, `
    ${previewHtml}
    <div class="actions">
      <button class="primary-button" id="modalExport"><i data-lucide="file-down"></i>Export PDF</button>
    </div>
  `);
  qs("#modalExport").addEventListener("click", exportHandler);
}

function renderDocumentPreview(type, document) {
  const client = getClient(document.clientId) || {};
  const isInvoice = type === "Invoice";
  return `
    <article class="document-preview">
      <header>
        <div>
          <h3>Civil-Gineer Masta</h3>
          <p class="muted">Engineering services</p>
        </div>
        <div>
          <h3>${type} ${document.number}</h3>
          <p class="muted">${isInvoice ? "Due" : "Valid until"} ${isInvoice ? document.dueDate : document.validUntil}</p>
        </div>
      </header>
      <p><strong>Bill to:</strong> ${escapeHtml(client.name || "")}<br>${escapeHtml(client.address || "")}</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead>
          <tbody>
            ${document.items.map((item) => `
              <tr>
                <td>${escapeHtml(item.description)}</td>
                <td>${item.qty}</td>
                <td>${money.format(item.rate)}</td>
                <td>${money.format(lineTotal(item))}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="total-line"><span>Total</span><span>${money.format(documentTotal(document))}</span></div>
      ${document.notes ? `<p class="muted">${escapeHtml(document.notes)}</p>` : ""}
    </article>
  `;
}

function renderReceiptPreview(payment) {
  const invoice = state.invoices.find((item) => item.id === payment.invoiceId);
  const client = getClient(invoice?.clientId) || {};
  return `
    <article class="document-preview">
      <header>
        <div>
          <h3>Civil-Gineer Masta</h3>
          <p class="muted">Payment receipt</p>
        </div>
        <div>
          <h3>${payment.receiptNumber}</h3>
          <p class="muted">${payment.date}</p>
        </div>
      </header>
      <p><strong>Received from:</strong> ${escapeHtml(client.name || "")}</p>
      <p><strong>Invoice:</strong> ${invoice?.number || ""}</p>
      <p><strong>Amount:</strong> ${money.format(Number(payment.amount || 0))}</p>
      <p><strong>Method:</strong> ${escapeHtml(payment.method || "")}</p>
      <p><strong>Reference:</strong> ${escapeHtml(payment.reference || "")}</p>
    </article>
  `;
}

async function exportDocument(type, id) {
  const collection = type === "Quotation" ? state.quotations : state.invoices;
  const document = collection.find((item) => item.id === id);
  if (!document) return;
  const backendExported = await exportViaBackend("pdf", {
    kind: type.toLowerCase(),
    id,
    filename: `${document.number}.pdf`,
    data: buildExportData(),
  });
  if (backendExported) return;
  const client = getClient(document.clientId) || {};
  buildPdf(type, document.number, (pdf) => {
    drawDocumentPdf(pdf, type, document, client);
  }, documentPdfLines(type, document, client));
}

async function exportReceipt(paymentId) {
  const payment = state.payments.find((item) => item.id === paymentId);
  if (!payment) return;
  const backendExported = await exportViaBackend("pdf", {
    kind: "receipt",
    id: paymentId,
    filename: `${payment.receiptNumber}.pdf`,
    data: buildExportData(),
  });
  if (backendExported) return;
  const invoice = state.invoices.find((item) => item.id === payment.invoiceId);
  const client = getClient(invoice?.clientId) || {};
  buildPdf("Receipt", payment.receiptNumber, (pdf) => {
    drawReceiptPdf(pdf, payment, invoice, client);
  }, receiptPdfLines(payment, invoice, client));
}

async function exportFinancialReportPdf() {
  const filename = `CGM-Financial-Report-${today().slice(0, 7)}.pdf`;
  const backendExported = await exportViaBackend("pdf", {
    kind: "financial-report",
    filename,
    data: buildExportData(),
  });
  if (backendExported) return;
  downloadSimplePdf(filename, financialReportPdfLines());
}

async function exportExcelWorkbook() {
  const filename = `CGM-Accounting-Export-${today()}.xlsx`;
  const backendExported = await exportViaBackend("excel", {
    filename,
    data: buildExportData(),
  });
  if (backendExported) return;
  downloadXlsx(filename, buildWorkbookSheets());
}

async function exportViaBackend(format, payload) {
  try {
    const response = await fetch(`${EXPORT_API_URL}/api/export/${format}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Export backend responded ${response.status}`);
    const blob = await response.blob();
    downloadBlob(blob, payload.filename);
    return true;
  } catch (error) {
    console.info("Using browser export fallback:", error.message);
    return false;
  }
}

function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function buildExportData() {
  return {
    ...state,
    company: COMPANY_DETAILS,
    generatedAt: new Date().toISOString(),
  };
}

function buildPdf(type, number, draw, fallbackLines) {
  const jsPdf = window.jspdf?.jsPDF;
  if (jsPdf) {
    const pdf = new jsPdf();
    draw(pdf);
    pdf.save(`${number}.pdf`);
    return;
  }
  downloadSimplePdf(`${number}.pdf`, [`${type} ${number}`, "", ...fallbackLines]);
}

function drawHeader(pdf, title, number) {
  pdf.setFillColor(215, 25, 32);
  pdf.rect(0, 0, 210, 16, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(16);
  pdf.text("Civil-Gineer Masta", 14, 11);
  pdf.setTextColor(31, 35, 40);
  pdf.setFontSize(18);
  pdf.text(`${title} ${number}`, 14, 30);
}

function drawDocumentPdf(pdf, type, document, client) {
  drawHeader(pdf, type, document.number);
  pdf.setFontSize(10);
  pdf.text(`Date: ${document.date}`, 14, 40);
  pdf.text(`${type === "Invoice" ? "Due" : "Valid until"}: ${type === "Invoice" ? document.dueDate : document.validUntil}`, 14, 46);
  pdf.text(`Client: ${client.name || ""}`, 14, 58);
  pdf.text(`Address: ${client.address || ""}`, 14, 64);
  let y = 78;
  pdf.setFont(undefined, "bold");
  pdf.text("Description", 14, y);
  pdf.text("Qty", 116, y);
  pdf.text("Rate", 136, y);
  pdf.text("Total", 166, y);
  pdf.setFont(undefined, "normal");
  y += 8;
  document.items.forEach((item) => {
    pdf.text(String(item.description).slice(0, 52), 14, y);
    pdf.text(String(item.qty), 116, y);
    pdf.text(money.format(item.rate), 136, y);
    pdf.text(money.format(lineTotal(item)), 166, y);
    y += 8;
  });
  y += 8;
  pdf.setFont(undefined, "bold");
  pdf.text(`Total: ${money.format(documentTotal(document))}`, 136, y);
  if (document.notes) {
    pdf.setFont(undefined, "normal");
    pdf.text(pdf.splitTextToSize(`Notes: ${document.notes}`, 180), 14, y + 14);
  }
  pdf.setFont(undefined, "normal");
  pdf.text(pdf.splitTextToSize(`Payment terms: ${COMPANY_DETAILS.terms}`, 180), 14, y + 30);
  pdf.line(14, y + 62, 80, y + 62);
  pdf.line(112, y + 62, 190, y + 62);
  pdf.text("Prepared by", 14, y + 68);
  pdf.text("Approved / Client signature", 112, y + 68);
}

function drawReceiptPdf(pdf, payment, invoice, client) {
  drawHeader(pdf, "Receipt", payment.receiptNumber);
  pdf.setFontSize(11);
  pdf.text(`Date: ${payment.date}`, 14, 42);
  pdf.text(`Received from: ${client.name || ""}`, 14, 54);
  pdf.text(`Invoice: ${invoice?.number || ""}`, 14, 62);
  pdf.text(`Amount: ${money.format(Number(payment.amount || 0))}`, 14, 70);
  pdf.text(`Method: ${payment.method || ""}`, 14, 78);
  pdf.text(`Reference: ${payment.reference || ""}`, 14, 86);
  pdf.line(14, 122, 80, 122);
  pdf.line(112, 122, 190, 122);
  pdf.text("Received by", 14, 128);
  pdf.text("Client signature", 112, 128);
}

function documentPdfLines(type, document, client) {
  return [
    COMPANY_DETAILS.name,
    COMPANY_DETAILS.subtitle,
    COMPANY_DETAILS.address,
    `${COMPANY_DETAILS.phone} | ${COMPANY_DETAILS.email}`,
    "",
    `Date: ${document.date}`,
    `${type === "Invoice" ? "Due" : "Valid until"}: ${type === "Invoice" ? document.dueDate : document.validUntil}`,
    `Client: ${client.name || ""}`,
    `Contact: ${client.contact || ""}`,
    `Email: ${client.email || ""}`,
    `Phone: ${client.phone || ""}`,
    `Address: ${client.address || ""}`,
    "",
    "Items",
    ...document.items.map(
      (item) =>
        `${item.description} | Qty ${item.qty} | Rate ${money.format(item.rate)} | Total ${money.format(lineTotal(item))}`,
    ),
    "",
    `Total: ${money.format(documentTotal(document))}`,
    type === "Invoice" ? `Paid: ${money.format(invoicePaid(document.id))}` : "",
    type === "Invoice" ? `Status: ${titleCase(invoiceStatus(document))}` : "",
    `Payment terms: ${COMPANY_DETAILS.terms}`,
    document.notes ? `Notes: ${document.notes}` : "",
    "",
    "Prepared by: ____________________",
    "Approved / Client signature: ____________________",
  ].filter(Boolean);
}

function receiptPdfLines(payment, invoice, client) {
  return [
    COMPANY_DETAILS.name,
    "Payment receipt",
    COMPANY_DETAILS.address,
    `${COMPANY_DETAILS.phone} | ${COMPANY_DETAILS.email}`,
    "",
    `Date: ${payment.date}`,
    `Received from: ${client.name || ""}`,
    `Client email: ${client.email || ""}`,
    `Invoice: ${invoice?.number || ""}`,
    `Amount: ${money.format(Number(payment.amount || 0))}`,
    `Method: ${payment.method || ""}`,
    `Reference: ${payment.reference || ""}`,
    "",
    "Received by: ____________________",
    "Client signature: ____________________",
  ];
}

function financialReportPdfLines() {
  const summary = currentMonthSummary();
  return [
    COMPANY_DETAILS.name,
    "Monthly Financial Report",
    COMPANY_DETAILS.address,
    `${COMPANY_DETAILS.phone} | ${COMPANY_DETAILS.email}`,
    "",
    `Report month: ${today().slice(0, 7)}`,
    `Invoice value issued: ${money.format(summary.invoiced)}`,
    `Cash received: ${money.format(summary.received)}`,
    `Expenses recorded: ${money.format(summary.spent)}`,
    `Net cash position: ${money.format(summary.net)}`,
    "",
    "Invoice payment position",
    ...state.invoices.map((invoice) => {
      const paid = invoicePaid(invoice.id);
      return `${invoice.number} | ${getClient(invoice.clientId)?.name || ""} | Total ${money.format(documentTotal(invoice))} | Paid ${money.format(paid)} | ${titleCase(invoiceStatus(invoice))}`;
    }),
    "",
    "Prepared by: ____________________",
    "Approved by: ____________________",
  ];
}

function buildWorkbookSheets() {
  const summary = currentMonthSummary();
  const sheets = [];
  sheets.push({
    name: "Monthly Summary",
    moneyCols: [2],
    rows: [
      ["Metric", "Amount", "Formula / Notes"],
      ["Invoice value issued", summary.invoiced, "Current month invoices"],
      ["Cash received", summary.received, "Current month payments"],
      ["Expenses recorded", summary.spent, "Current month expenses"],
      ["Net cash position", "=B3-B4", "Cash received less expenses"],
    ],
  });
  sheets.push({
    name: "Clients",
    rows: [
      ["Name", "Contact", "Email", "Phone", "Address", "Tax/VAT", "Created"],
      ...state.clients.map((client) => [
        client.name,
        client.contact,
        client.email,
        client.phone,
        client.address,
        client.taxId,
        client.createdAt,
      ]),
    ],
  });
  sheets.push({
    name: "Quotations",
    moneyCols: [6],
    rows: addTotalRow(
      [
        ["Number", "Client", "Date", "Valid Until", "Status", "Total", "Notes"],
        ...state.quotations.map((quote) => [
          quote.number,
          getClient(quote.clientId)?.name || "",
          quote.date,
          quote.validUntil,
          titleCase(quote.status),
          documentTotal(quote),
          quote.notes,
        ]),
      ],
      [6],
    ),
  });
  sheets.push({
    name: "Quotation Items",
    moneyCols: [5, 6],
    rows: addTotalRow(
      [
        ["Quotation", "Client", "Description", "Qty", "Rate", "Line Total"],
        ...state.quotations.flatMap((quote) =>
          quote.items.map((item) => [
            quote.number,
            getClient(quote.clientId)?.name || "",
            item.description,
            item.qty,
            item.rate,
            lineTotal(item),
          ]),
        ),
      ],
      [6],
    ),
  });
  sheets.push({
    name: "Invoices",
    moneyCols: [5, 6, 7],
    rows: addTotalRow(
      [
        ["Number", "Client", "Date", "Due Date", "Total", "Paid", "Outstanding", "Status", "Notes"],
        ...state.invoices.map((invoice) => {
          const total = documentTotal(invoice);
          const paid = invoicePaid(invoice.id);
          return [
            invoice.number,
            getClient(invoice.clientId)?.name || "",
            invoice.date,
            invoice.dueDate,
            total,
            paid,
            total - paid,
            titleCase(invoiceStatus(invoice)),
            invoice.notes,
          ];
        }),
      ],
      [5, 6, 7],
    ),
  });
  sheets.push({
    name: "Invoice Items",
    moneyCols: [5, 6],
    rows: addTotalRow(
      [
        ["Invoice", "Client", "Description", "Qty", "Rate", "Line Total"],
        ...state.invoices.flatMap((invoice) =>
          invoice.items.map((item) => [
            invoice.number,
            getClient(invoice.clientId)?.name || "",
            item.description,
            item.qty,
            item.rate,
            lineTotal(item),
          ]),
        ),
      ],
      [6],
    ),
  });
  sheets.push({
    name: "Payments",
    moneyCols: [5],
    rows: addTotalRow(
      [
        ["Date", "Receipt", "Invoice", "Client", "Amount", "Method", "Reference"],
        ...state.payments.map((payment) => {
          const invoice = state.invoices.find((item) => item.id === payment.invoiceId) || {};
          return [
            payment.date,
            payment.receiptNumber,
            invoice.number || "",
            getClient(invoice.clientId)?.name || "",
            Number(payment.amount || 0),
            payment.method,
            payment.reference,
          ];
        }),
      ],
      [5],
    ),
  });
  sheets.push({
    name: "Receipts",
    moneyCols: [5],
    rows: addTotalRow(
      [
        ["Receipt", "Date", "Client", "Invoice", "Amount", "Method", "Reference"],
        ...state.payments.map((payment) => {
          const invoice = state.invoices.find((item) => item.id === payment.invoiceId) || {};
          return [
            payment.receiptNumber,
            payment.date,
            getClient(invoice.clientId)?.name || "",
            invoice.number || "",
            Number(payment.amount || 0),
            payment.method,
            payment.reference,
          ];
        }),
      ],
      [5],
    ),
  });
  sheets.push({
    name: "Expenses",
    moneyCols: [5],
    rows: addTotalRow(
      [
        ["Date", "Category", "Vendor", "Description", "Amount", "Payment Method"],
        ...state.expenses.map((expense) => [
          expense.date,
          expense.category,
          expense.vendor,
          expense.description,
          Number(expense.amount || 0),
          expense.paymentMethod,
        ]),
      ],
      [5],
    ),
  });
  return sheets;
}

function addTotalRow(rows, totalCols) {
  if (rows.length <= 1) return rows;
  const totalRowIndex = rows.length + 1;
  const totalRow = Array(rows[0].length).fill("");
  totalRow[0] = "Totals";
  totalCols.forEach((col) => {
    totalRow[col - 1] = `=SUM(${columnName(col)}2:${columnName(col)}${totalRowIndex - 1})`;
  });
  return [...rows, totalRow];
}

function downloadXlsx(filename, sheets) {
  const files = buildXlsxFiles(sheets);
  const zipBlob = new Blob([zipStore(files)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(zipBlob, filename);
}

function buildXlsxFiles(sheets) {
  const workbookSheetsXml = sheets
    .map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("");
  const workbookRelsXml = sheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join("");
  const overrides = sheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("");
  const files = [
    {
      name: "[Content_Types].xml",
      content: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
          <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
          <Default Extension="xml" ContentType="application/xml"/>
          <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
          <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
          ${overrides}
        </Types>`),
    },
    {
      name: "_rels/.rels",
      content: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
        </Relationships>`),
    },
    {
      name: "xl/workbook.xml",
      content: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <sheets>${workbookSheetsXml}</sheets>
        </workbook>`),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          ${workbookRelsXml}
          <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
        </Relationships>`),
    },
    { name: "xl/styles.xml", content: xlsxStylesXml() },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      content: worksheetXml(sheet),
    })),
  ];
  return files;
}

function worksheetXml(sheet) {
  const rowsXml = sheet.rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, colIndex) => cellXml(value, rowIndex + 1, colIndex + 1, sheet.moneyCols || [], row[0] === "Totals"))
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  const maxCol = Math.max(...sheet.rows.map((row) => row.length), 1);
  const cols = Array.from({ length: maxCol }, (_, index) => {
    const width = Math.min(Math.max(longestInColumn(sheet.rows, index) + 2, 12), 34);
    return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
  }).join("");
  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
      <cols>${cols}</cols>
      <sheetData>${rowsXml}</sheetData>
    </worksheet>`);
}

function cellXml(value, row, col, moneyCols, isLastRow) {
  const ref = `${columnName(col)}${row}`;
  const isHeader = row === 1;
  const isMoney = moneyCols.includes(col);
  const isFormula = typeof value === "string" && value.startsWith("=");
  const style = isHeader ? 1 : isLastRow && isMoney ? 4 : isMoney ? 2 : isLastRow ? 3 : 0;
  if (isFormula) return `<c r="${ref}" s="${style}"><f>${escapeXml(value.slice(1))}</f></c>`;
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${escapeXml(value ?? "")}</t></is></c>`;
}

function xlsxStylesXml() {
  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;BWP&quot; #,##0.00"/></numFmts>
      <fonts count="3">
        <font><sz val="11"/><name val="Calibri"/></font>
        <font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font>
        <font><b/><sz val="11"/><name val="Calibri"/></font>
      </fonts>
      <fills count="4">
        <fill><patternFill patternType="none"/></fill>
        <fill><patternFill patternType="gray125"/></fill>
        <fill><patternFill patternType="solid"><fgColor rgb="FFD71920"/></patternFill></fill>
        <fill><patternFill patternType="solid"><fgColor rgb="FFF5F6F8"/></patternFill></fill>
      </fills>
      <borders count="2">
        <border><left/><right/><top/><bottom/><diagonal/></border>
        <border><left/><right/><top/><bottom style="thin"><color rgb="FFD8DDE4"/></bottom/><diagonal/></border>
      </borders>
      <cellXfs count="5">
        <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>
        <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFill="1" applyFont="1"/>
        <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/>
        <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFill="1" applyFont="1"/>
        <xf numFmtId="164" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyFont="1"/>
      </cellXfs>
    </styleSheet>`);
}

function zipStore(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  files.forEach((file) => {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const local = concatBytes(
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data,
    );
    localParts.push(local);
    centralParts.push(
      concatBytes(
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ),
    );
    offset += local.length;
  });
  const central = concatBytes(...centralParts);
  const end = concatBytes(
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(offset),
    u16(0),
  );
  return concatBytes(...localParts, central, end);
}

function crc32(data) {
  let crc = -1;
  for (let i = 0; i < data.length; i += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let c = index;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function u16(value) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function concatBytes(...parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function columnName(index) {
  let name = "";
  while (index > 0) {
    const remainder = (index - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    index = Math.floor((index - 1) / 26);
  }
  return name;
}

function longestInColumn(rows, index) {
  return Math.max(...rows.map((row) => String(row[index] ?? "").length), 8);
}

function xml(value) {
  return value.replace(/>\s+</g, "><").trim();
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function downloadSimplePdf(filename, lines) {
  const pageHeight = 842;
  const pageWidth = 595;
  const safeLines = lines.flatMap((line) => wrapLine(cleanPdfText(line), 88));
  const content = [
    "BT",
    "/F1 16 Tf",
    "50 790 Td",
    `(Civil-Gineer Masta) Tj`,
    "/F1 11 Tf",
    ...safeLines.map((line, index) => {
      const y = 762 - index * 16;
      return `1 0 0 1 50 ${Math.max(y, 50)} Tm (${escapePdf(line)}) Tj`;
    }),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const blob = new Blob([pdf], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function cleanPdfText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E]/g, " ")
    .trim();
}

function wrapLine(line, maxLength) {
  if (line.length <= maxLength) return [line];
  const words = line.split(" ");
  const lines = [];
  let current = "";
  words.forEach((word) => {
    if (`${current} ${word}`.trim().length > maxLength) {
      lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  });
  if (current) lines.push(current);
  return lines;
}

function escapePdf(value) {
  return value.replace(/[\\()]/g, "\\$&");
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const { action, id, target } = button.dataset;
  if (button.matches(".nav-item")) setView(button.dataset.view);
  if (button.id === "menuToggle") qs(".sidebar").classList.toggle("open");
  if (button.id === "modalClose") closeModal();
  if (action === "delete-client") repositories.clients.remove(id);
  if (action === "delete-quote") repositories.quotations.remove(id);
  if (action === "delete-invoice") repositories.invoices.remove(id);
  if (action === "delete-expense") repositories.expenses.remove(id);
  if (action === "export-quote") exportDocument("Quotation", id);
  if (action === "export-invoice") exportDocument("Invoice", id);
  if (action === "export-report-pdf") exportFinancialReportPdf();
  if (action === "export-excel") exportExcelWorkbook();
  if (action === "record-payment") openPaymentModal(id);
  if (action === "invoice-from-quote") createInvoiceFromQuote(id);
  if (action === "add-item") {
    addItemRow(qs(`#${target}Items`));
    updateFormTotal(target);
  }
  if (action === "remove-item") {
    const editor = button.closest(".items-editor");
    if (qsa(".item-row", editor).length > 1) {
      button.closest(".item-row").remove();
      updateFormTotal(editor.id?.replace("Items", "") || activeView.slice(0, -1));
    }
  }
});

document.addEventListener("change", (event) => {
  if (event.target.dataset.action === "quote-status") {
    repositories.quotations.updateStatus(event.target.dataset.id, event.target.value);
  }
});

qs("#modalBackdrop").addEventListener("click", (event) => {
  if (event.target.id === "modalBackdrop") closeModal();
});

setView("dashboard");
