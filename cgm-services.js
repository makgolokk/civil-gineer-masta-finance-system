(function () {
  const STORAGE_KEY = "cgm-accounting-v2";
  const LEGACY_KEY = "cgm-accounting-v1";
  const today = () => new Date().toISOString().slice(0, 10);
  const uid = () => crypto.randomUUID();
  const toNumber = (value) => Number(value || 0);

  const accounts = [
    { id: "bank_account", code: "1000", name: "Bank Account", type: "Assets", category: "Bank accounts", cashFlow: "Operating" },
    { id: "cash_on_hand", code: "1010", name: "Cash on Hand", type: "Assets", category: "Cash accounts", cashFlow: "Operating" },
    { id: "accounts_receivable", code: "1100", name: "Debtors Control", type: "Assets", category: "Debtors control account", cashFlow: "Operating" },
    { id: "inventory_assets", code: "1200", name: "Project Materials / Assets", type: "Assets", category: "Assets", cashFlow: "Investing" },
    { id: "accounts_payable", code: "2000", name: "Creditors Control", type: "Liabilities", category: "Creditors control account", cashFlow: "Operating" },
    { id: "owner_equity", code: "3000", name: "Owner Equity", type: "Equity", category: "Equity", cashFlow: "Financing" },
    { id: "sales_income", code: "4000", name: "General Service Income", type: "Income", category: "Income", cashFlow: "Operating" },
    { id: "income_architecture", code: "4010", name: "Architecture Income", type: "Income", category: "Income", serviceId: "architecture", cashFlow: "Operating" },
    { id: "income_engineering", code: "4020", name: "Engineering Income", type: "Income", category: "Income", serviceId: "engineering", cashFlow: "Operating" },
    { id: "income_maintenance", code: "4030", name: "Maintenance Income", type: "Income", category: "Income", serviceId: "maintenance", cashFlow: "Operating" },
    { id: "income_project_management", code: "4040", name: "Project Management Income", type: "Income", category: "Income", serviceId: "project_management", cashFlow: "Operating" },
    { id: "cost_of_sales", code: "5000", name: "General Cost of Sales", type: "Cost of Sales", category: "Cost of Sales", cashFlow: "Operating" },
    { id: "cos_architecture", code: "5010", name: "Architecture Direct Costs", type: "Cost of Sales", category: "Cost of Sales", serviceId: "architecture", cashFlow: "Operating" },
    { id: "cos_engineering", code: "5020", name: "Engineering Direct Costs", type: "Cost of Sales", category: "Cost of Sales", serviceId: "engineering", cashFlow: "Operating" },
    { id: "cos_maintenance", code: "5030", name: "Maintenance Direct Costs", type: "Cost of Sales", category: "Cost of Sales", serviceId: "maintenance", cashFlow: "Operating" },
    { id: "cos_project_management", code: "5040", name: "Project Management Direct Costs", type: "Cost of Sales", category: "Cost of Sales", serviceId: "project_management", cashFlow: "Operating" },
    { id: "general_expenses", code: "6000", name: "General Expenses", type: "Expenses", category: "Expenses", cashFlow: "Operating" },
  ];

  const services = [
    { id: "architecture", name: "Architecture", incomeAccountId: "income_architecture", costAccountId: "cos_architecture" },
    { id: "engineering", name: "Engineering", incomeAccountId: "income_engineering", costAccountId: "cos_engineering" },
    { id: "maintenance", name: "Maintenance", incomeAccountId: "income_maintenance", costAccountId: "cos_maintenance" },
    { id: "project_management", name: "Project Management", incomeAccountId: "income_project_management", costAccountId: "cos_project_management" },
  ];

  function initialState() {
    return {
      company: {
        name: "Civil-Gineer Masta",
        address: "Gaborone, Botswana",
        phone: "+267 00 000 000",
        email: "accounts@civilgineermasta.com",
      },
      accounts,
      services,
      projects: [],
      clients: [],
      suppliers: [],
      quotations: [],
      invoices: [],
      payments: [],
      expenses: [],
      supplierBills: [],
      supplierPayments: [],
      journalEntries: [],
      cashTransactions: [],
      counters: { client: 1, supplier: 1, project: 1, quotation: 1, invoice: 1, receipt: 1, supplierBill: 1, journal: 1, cash: 1 },
      settings: { defaultBankAccountId: "bank_account", defaultCashAccountId: "cash_on_hand", defaultIncomeAccountId: "sales_income", defaultExpenseAccountId: "general_expenses" },
      schemaVersion: 2,
    };
  }

  function seedState() {
    const state = initialState();
    const clientId = uid();
    const invoiceId = uid();
    const supplierId = uid();
    state.clients.push({
      id: clientId,
      number: "C-0001",
      name: "Molefe Developments",
      contact: "Kabelo Molefe",
      email: "accounts@molefedev.example",
      phone: "+267 71 000 100",
      address: "Plot 108, Gaborone",
      openingBalance: 0,
      createdAt: today(),
      code: "CL-MOL-001",
    });
    const projectId = uid();
    state.projects.push({
      id: projectId,
      code: "PRJ-0001",
      name: "Molefe Foundation Design",
      clientId,
      serviceId: "engineering",
      status: "active",
      createdAt: today(),
    });
    state.suppliers.push({
      id: supplierId,
      number: "S-0001",
      name: "Gaborone Stationery Supplies",
      contact: "Accounts",
      email: "billing@stationery.example",
      phone: "+267 72 000 200",
      address: "Gaborone",
      openingBalance: 0,
      createdAt: today(),
    });
    state.quotations.push({
      id: uid(),
      number: "QT-0001",
      clientId,
      date: today(),
      validUntil: today(),
      status: "sent",
      notes: "Site inspection and structural concept design.",
      serviceId: "engineering",
      projectId,
      projectCode: "PRJ-0001",
      items: [
        { description: "Structural design consultation", qty: 1, rate: 8500 },
        { description: "Drawing review", qty: 3, rate: 650 },
      ],
    });
    state.invoices.push({
      id: invoiceId,
      number: "INV-0001",
      clientId,
      date: today(),
      dueDate: today(),
      notes: "Initial engineering services invoice.",
      serviceId: "engineering",
      projectId,
      projectCode: "PRJ-0001",
      incomeAccountId: "income_engineering",
      items: [{ description: "Foundation design package", qty: 1, rate: 12000 }],
    });
    state.payments.push({
      id: uid(),
      invoiceId,
      clientId,
      date: today(),
      amount: 6000,
      method: "Bank transfer",
      reference: "DEP-001",
      receiptNumber: "RCT-0001",
      bankAccountId: "bank_account",
    });
    state.expenses.push({
      id: uid(),
      date: today(),
      category: "Transport",
      vendor: "Fuel Station",
      description: "Client site visit",
      amount: 450,
      paymentMethod: "Cash",
      expenseAccountId: "general_expenses",
      serviceId: "engineering",
      projectId,
      projectCode: "PRJ-0001",
      bankAccountId: "cash_on_hand",
    });
    state.counters = { ...state.counters, quotation: 2, invoice: 2, receipt: 2, supplier: 2 };
    return state;
  }

  function migrateLegacy(legacy) {
    const state = initialState();
    state.clients = (legacy.clients || []).map((client, index) => ({
      ...client,
      number: client.number || `C-${String(index + 1).padStart(4, "0")}`,
      openingBalance: toNumber(client.openingBalance),
    }));
    state.quotations = legacy.quotations || [];
    state.invoices = (legacy.invoices || []).map((invoice) => ({ ...invoice, incomeAccountId: invoice.incomeAccountId || "sales_income" }));
    state.payments = (legacy.payments || []).map((payment) => {
      const invoice = state.invoices.find((item) => item.id === payment.invoiceId);
      return { ...payment, clientId: payment.clientId || invoice?.clientId || "", bankAccountId: normalizeMoneyAccount(payment.bankAccountId || "bank_account") };
    });
    state.expenses = (legacy.expenses || []).map((expense) => ({
      ...expense,
      expenseAccountId: expense.expenseAccountId || "general_expenses",
      bankAccountId: normalizeMoneyAccount(expense.bankAccountId || "bank_account"),
    }));
    state.counters = { ...state.counters, ...(legacy.counters || {}) };
    return state;
  }

  function normalizeMoneyAccount(accountId) {
    return accountId === "bank_cash" ? "bank_account" : accountId;
  }

  function normalize(state) {
    const next = { ...initialState(), ...state };
    next.accounts = accounts.map((account) => ({ ...account, ...(next.accounts || []).find((item) => item.id === account.id) }));
    next.services = services.map((service) => ({ ...service, ...(next.services || []).find((item) => item.id === service.id) }));
    next.projects = next.projects || [];
    next.settings = {
      ...initialState().settings,
      ...(next.settings || {}),
      defaultBankAccountId: normalizeMoneyAccount(next.settings?.defaultBankAccountId || "bank_account"),
      defaultCashAccountId: next.settings?.defaultCashAccountId || "cash_on_hand",
    };
    next.suppliers = next.suppliers || [];
    next.supplierBills = next.supplierBills || [];
    next.supplierPayments = next.supplierPayments || [];
    next.journalEntries = next.journalEntries || [];
    next.cashTransactions = next.cashTransactions || [];
    next.clients = (next.clients || []).map((client, index) => ({
      ...client,
      number: client.number || `C-${String(index + 1).padStart(4, "0")}`,
      code: client.code || client.number || `CL-${String(index + 1).padStart(4, "0")}`,
      openingBalance: toNumber(client.openingBalance),
    }));
    next.quotations = (next.quotations || []).map((quote) => ({
      ...quote,
      serviceId: quote.serviceId || "engineering",
    }));
    next.invoices = (next.invoices || []).map((invoice) => ({
      ...invoice,
      serviceId: invoice.serviceId || "engineering",
      incomeAccountId: invoice.incomeAccountId === "sales_income" || !invoice.incomeAccountId ? "income_engineering" : invoice.incomeAccountId,
    }));
    next.expenses = (next.expenses || []).map((expense) => ({
      ...expense,
      serviceId: expense.serviceId || "engineering",
      expenseAccountId: expense.expenseAccountId || "general_expenses",
      bankAccountId: normalizeMoneyAccount(expense.bankAccountId || "bank_account"),
    }));
    next.supplierBills = (next.supplierBills || []).map((bill) => ({
      ...bill,
      serviceId: bill.serviceId || "engineering",
      accountId: bill.accountId || "cos_engineering",
    }));
    next.payments = (next.payments || []).map((payment) => {
      const invoice = next.invoices.find((item) => item.id === payment.invoiceId);
      return {
        ...payment,
        clientId: payment.clientId || invoice?.clientId || "",
        projectId: payment.projectId || invoice?.projectId || "",
        projectCode: payment.projectCode || invoice?.projectCode || "",
        serviceId: payment.serviceId || invoice?.serviceId || "engineering",
        bankAccountId: normalizeMoneyAccount(payment.bankAccountId || "bank_account"),
      };
    });
    next.supplierPayments = (next.supplierPayments || []).map((payment) => ({ ...payment, bankAccountId: normalizeMoneyAccount(payment.bankAccountId || "bank_account") }));
    return next;
  }

  function load() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return normalize(JSON.parse(stored));
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) return normalize(migrateLegacy(JSON.parse(legacy)));
    return seedState();
  }

  function save(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalize(state)));
  }

  function nextNumber(state, key, prefix) {
    const value = state.counters[key] || 1;
    state.counters[key] = value + 1;
    return `${prefix}-${String(value).padStart(4, "0")}`;
  }

  function lineTotal(item) {
    return toNumber(item.qty) * toNumber(item.rate);
  }

  function documentTotal(document) {
    return (document?.items || []).reduce((sum, item) => sum + lineTotal(item), 0);
  }

  function invoicePaid(state, invoiceId) {
    return state.payments.filter((item) => item.invoiceId === invoiceId).reduce((sum, item) => sum + toNumber(item.amount), 0);
  }

  function supplierBillPaid(state, billId) {
    return state.supplierPayments.filter((item) => item.billId === billId).reduce((sum, item) => sum + toNumber(item.amount), 0);
  }

  function invoiceStatus(state, invoice) {
    const total = documentTotal(invoice);
    const paid = invoicePaid(state, invoice.id);
    if (paid <= 0) return "unpaid";
    if (paid + 0.01 >= total) return "paid";
    return "partial";
  }

  function billStatus(state, bill) {
    const paid = supplierBillPaid(state, bill.id);
    if (paid <= 0) return "unpaid";
    if (paid + 0.01 >= toNumber(bill.amount)) return "paid";
    return "partial";
  }

  function post(lines, meta) {
    return lines.map((line) => ({ id: uid(), ...meta, ...line, debit: toNumber(line.debit), credit: toNumber(line.credit) }));
  }

  function ledgerEntries(state) {
    const entries = [];
    state.clients.forEach((client) => {
      if (toNumber(client.openingBalance) !== 0) {
        entries.push(...post([
          { accountId: "accounts_receivable", debit: client.openingBalance, credit: 0, partyId: client.id, partyType: "client" },
          { accountId: "owner_equity", debit: 0, credit: client.openingBalance },
        ], { date: client.createdAt || today(), sourceType: "client-opening", sourceId: client.id, description: `Opening balance - ${client.name}` }));
      }
    });
    state.suppliers.forEach((supplier) => {
      if (toNumber(supplier.openingBalance) !== 0) {
        entries.push(...post([
          { accountId: "owner_equity", debit: supplier.openingBalance, credit: 0 },
          { accountId: "accounts_payable", debit: 0, credit: supplier.openingBalance, partyId: supplier.id, partyType: "supplier" },
        ], { date: supplier.createdAt || today(), sourceType: "supplier-opening", sourceId: supplier.id, description: `Opening balance - ${supplier.name}` }));
      }
    });
    state.invoices.forEach((invoice) => {
      const total = documentTotal(invoice);
      const service = serviceById(state, invoice.serviceId);
      entries.push(...post([
        { accountId: "accounts_receivable", debit: total, credit: 0, partyId: invoice.clientId, partyType: "client", projectId: invoice.projectId || "", serviceId: invoice.serviceId || "" },
        { accountId: invoice.incomeAccountId || service?.incomeAccountId || "sales_income", debit: 0, credit: total, projectId: invoice.projectId || "", serviceId: invoice.serviceId || "" },
      ], { date: invoice.date, sourceType: "invoice", sourceId: invoice.id, documentNumber: invoice.number, description: `Invoice ${invoice.number}` }));
    });
    state.payments.forEach((payment) => {
      entries.push(...post([
        { accountId: normalizeMoneyAccount(payment.bankAccountId || "bank_account"), debit: payment.amount, credit: 0, projectId: payment.projectId || "", serviceId: payment.serviceId || "" },
        { accountId: "accounts_receivable", debit: 0, credit: payment.amount, partyId: payment.clientId, partyType: "client", projectId: payment.projectId || "", serviceId: payment.serviceId || "" },
      ], { date: payment.date, sourceType: "receipt", sourceId: payment.id, documentNumber: payment.receiptNumber, description: `Receipt ${payment.receiptNumber}` }));
    });
    state.expenses.forEach((expense) => {
      entries.push(...post([
        { accountId: expense.expenseAccountId || serviceById(state, expense.serviceId)?.costAccountId || "general_expenses", debit: expense.amount, credit: 0, projectId: expense.projectId || "", serviceId: expense.serviceId || "" },
        { accountId: normalizeMoneyAccount(expense.bankAccountId || "bank_account"), debit: 0, credit: expense.amount, projectId: expense.projectId || "", serviceId: expense.serviceId || "" },
      ], { date: expense.date, sourceType: "expense", sourceId: expense.id, documentNumber: expense.reference || "", description: expense.description || expense.category }));
    });
    state.supplierBills.forEach((bill) => {
      entries.push(...post([
        { accountId: bill.accountId || serviceById(state, bill.serviceId)?.costAccountId || "general_expenses", debit: bill.amount, credit: 0, projectId: bill.projectId || "", serviceId: bill.serviceId || "" },
        { accountId: "accounts_payable", debit: 0, credit: bill.amount, partyId: bill.supplierId, partyType: "supplier", projectId: bill.projectId || "", serviceId: bill.serviceId || "" },
      ], { date: bill.date, sourceType: "supplier-bill", sourceId: bill.id, documentNumber: bill.number, description: `Supplier bill ${bill.number}` }));
    });
    state.supplierPayments.forEach((payment) => {
      entries.push(...post([
        { accountId: "accounts_payable", debit: payment.amount, credit: 0, partyId: payment.supplierId, partyType: "supplier" },
        { accountId: normalizeMoneyAccount(payment.bankAccountId || "bank_account"), debit: 0, credit: payment.amount },
      ], { date: payment.date, sourceType: "supplier-payment", sourceId: payment.id, documentNumber: payment.reference || "", description: `Supplier payment ${payment.reference || ""}` }));
    });
    state.cashTransactions.forEach((transfer) => {
      entries.push(...post([
        { accountId: normalizeMoneyAccount(transfer.toAccountId || "cash_on_hand"), debit: transfer.amount, credit: 0 },
        { accountId: normalizeMoneyAccount(transfer.fromAccountId || "bank_account"), debit: 0, credit: transfer.amount },
      ], { date: transfer.date, sourceType: "cash-transfer", sourceId: transfer.id, documentNumber: transfer.reference || "", description: transfer.description || "Bank/cash transfer" }));
    });
    state.journalEntries.forEach((journal) => {
      journal.lines.forEach((line) => {
        entries.push(...post([{ accountId: line.accountId, debit: line.debit, credit: line.credit, partyId: line.partyId || "", partyType: line.partyType || "" }], {
          date: journal.date,
          sourceType: "journal",
          sourceId: journal.id,
          documentNumber: journal.number,
          description: journal.memo,
        }));
      });
    });
    return entries.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.documentNumber).localeCompare(String(b.documentNumber)));
  }

  function accountBalance(state, accountId, entries = ledgerEntries(state)) {
    return entries.filter((item) => item.accountId === accountId).reduce((sum, item) => sum + item.debit - item.credit, 0);
  }

  function isMoneyAccount(state, accountId) {
    const account = state.accounts.find((item) => item.id === normalizeMoneyAccount(accountId));
    return account?.category === "Bank accounts" || account?.category === "Cash accounts";
  }

  function cashAccountBalance(state, entries = ledgerEntries(state)) {
    return entries.filter((entry) => isMoneyAccount(state, entry.accountId)).reduce((sum, entry) => sum + entry.debit - entry.credit, 0);
  }

  function serviceById(state, serviceId) {
    return (state.services || services).find((service) => service.id === serviceId);
  }

  function trialBalance(state) {
    return state.accounts.map((account) => {
      const balance = accountBalance(state, account.id);
      return { ...account, debit: balance >= 0 ? balance : 0, credit: balance < 0 ? Math.abs(balance) : 0, balance };
    });
  }

  function clientStatement(state, clientId) {
    const client = state.clients.find((item) => item.id === clientId);
    let balance = toNumber(client?.openingBalance);
    const rows = [];
    if (balance) rows.push({ date: client.createdAt || "", type: "Opening balance", number: "", debit: balance, credit: 0, balance });
    state.invoices.filter((item) => item.clientId === clientId).forEach((invoice) => {
      const amount = documentTotal(invoice);
      balance += amount;
      rows.push({ date: invoice.date, type: "Invoice", number: invoice.number, debit: amount, credit: 0, balance });
    });
    state.payments.filter((item) => item.clientId === clientId).forEach((payment) => {
      balance -= toNumber(payment.amount);
      rows.push({ date: payment.date, type: "Payment / Receipt", number: payment.receiptNumber, debit: 0, credit: toNumber(payment.amount), balance });
    });
    rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return { client, rows, balance };
  }

  function supplierStatement(state, supplierId) {
    const supplier = state.suppliers.find((item) => item.id === supplierId);
    let balance = toNumber(supplier?.openingBalance);
    const rows = [];
    if (balance) rows.push({ date: supplier.createdAt || "", type: "Opening balance", number: "", debit: 0, credit: balance, balance });
    state.supplierBills.filter((item) => item.supplierId === supplierId).forEach((bill) => {
      balance += toNumber(bill.amount);
      rows.push({ date: bill.date, type: "Supplier bill", number: bill.number, debit: 0, credit: toNumber(bill.amount), balance });
    });
    state.supplierPayments.filter((item) => item.supplierId === supplierId).forEach((payment) => {
      balance -= toNumber(payment.amount);
      rows.push({ date: payment.date, type: "Payment", number: payment.reference, debit: toNumber(payment.amount), credit: 0, balance });
    });
    rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return { supplier, rows, balance };
  }

  function cashbook(state) {
    let balance = 0;
    return ledgerEntries(state)
      .filter((item) => isMoneyAccount(state, item.accountId))
      .map((item) => {
        balance += item.debit - item.credit;
        return { ...item, moneyIn: item.debit, moneyOut: item.credit, balance };
      });
  }

  function incomeStatement(state) {
    const entries = ledgerEntries(state);
    const income = state.accounts.filter((account) => account.type === "Income").reduce((sum, account) => sum - accountBalance(state, account.id, entries), 0);
    const costOfSales = state.accounts.filter((account) => account.type === "Cost of Sales").reduce((sum, account) => sum + accountBalance(state, account.id, entries), 0);
    const operatingExpenses = state.accounts.filter((account) => account.type === "Expenses").reduce((sum, account) => sum + accountBalance(state, account.id, entries), 0);
    return { income, costOfSales, grossProfit: income - costOfSales, operatingExpenses, netProfit: income - costOfSales - operatingExpenses };
  }

  function balanceSheet(state) {
    const entries = ledgerEntries(state);
    const sumType = (type) => state.accounts.filter((account) => account.type === type).reduce((sum, account) => {
      const balance = accountBalance(state, account.id, entries);
      return sum + (["Liabilities", "Equity"].includes(type) ? -balance : balance);
    }, 0);
    const netProfit = incomeStatement(state).netProfit;
    const assets = sumType("Assets");
    const liabilities = sumType("Liabilities");
    const equity = sumType("Equity") + netProfit;
    return { assets, liabilities, equity, totalLiabilitiesEquity: liabilities + equity, difference: assets - liabilities - equity };
  }

  function cashFlow(state) {
    const rows = cashbook(state);
    const inflows = rows.reduce((sum, item) => sum + item.moneyIn, 0);
    const outflows = rows.reduce((sum, item) => sum + item.moneyOut, 0);
    return {
      operating: { inflows, outflows, net: inflows - outflows },
      investing: { inflows: 0, outflows: 0, net: 0 },
      financing: { inflows: 0, outflows: 0, net: 0 },
      netCashFlow: inflows - outflows,
    };
  }

  function ageing(items, getDate, getAmount) {
    const buckets = { current: 0, d30: 0, d60: 0, d90: 0 };
    const now = new Date(today());
    items.forEach((item) => {
      const days = Math.max(0, Math.floor((now - new Date(getDate(item))) / 86400000));
      const amount = getAmount(item);
      if (days <= 30) buckets.current += amount;
      else if (days <= 60) buckets.d30 += amount;
      else if (days <= 90) buckets.d60 += amount;
      else buckets.d90 += amount;
    });
    return buckets;
  }

  function dashboard(state) {
    const invoicesTotal = state.invoices.reduce((sum, item) => sum + documentTotal(item), 0);
    const paymentsTotal = state.payments.reduce((sum, item) => sum + toNumber(item.amount), 0);
    const unpaidInvoices = state.invoices.filter((item) => invoiceStatus(state, item) !== "paid");
    const overdueInvoices = unpaidInvoices.filter((item) => item.dueDate && item.dueDate < today());
    const debtors = state.clients.reduce((sum, item) => sum + clientStatement(state, item.id).balance, 0);
    const creditors = state.suppliers.reduce((sum, item) => sum + supplierStatement(state, item.id).balance, 0);
    const month = today().slice(0, 7);
    const monthlyExpenses = state.expenses.filter((item) => String(item.date).startsWith(month)).reduce((sum, item) => sum + toNumber(item.amount), 0);
    const income = incomeStatement(state);
    const bank = cashAccountBalance(state);
    return {
      invoicesTotal,
      paymentsTotal,
      unpaidInvoices: unpaidInvoices.reduce((sum, item) => sum + documentTotal(item) - invoicePaid(state, item.id), 0),
      overdueInvoices: overdueInvoices.length,
      debtors,
      creditors,
      monthlyExpenses,
      netCash: bank,
      netProfitLoss: income.netProfit,
      bankCashBalance: bank,
    };
  }

  function validateJournal(lines) {
    const debit = lines.reduce((sum, item) => sum + toNumber(item.debit), 0);
    const credit = lines.reduce((sum, item) => sum + toNumber(item.credit), 0);
    return { debit, credit, balanced: Math.abs(debit - credit) < 0.01 };
  }

  window.CGM = {
    STORAGE_KEY,
    today,
    uid,
    toNumber,
    load,
    save,
    nextNumber,
    lineTotal,
    documentTotal,
    invoicePaid,
    supplierBillPaid,
    invoiceStatus,
    billStatus,
    ledgerEntries,
    accountBalance,
    cashAccountBalance,
    isMoneyAccount,
    serviceById,
    trialBalance,
    clientStatement,
    supplierStatement,
    cashbook,
    incomeStatement,
    balanceSheet,
    cashFlow,
    ageing,
    dashboard,
    validateJournal,
  };
})();
