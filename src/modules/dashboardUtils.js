export function selectedPeriod(filter, todayValue, monthName) {
  if (filter.mode === "quarter") {
    const [year, qText] = filter.quarter.split("-Q");
    const quarter = Number(qText);
    const month = (quarter - 1) * 3;
    const start = new Date(Number(year), month, 1);
    const end = new Date(Number(year), month + 3, 1);
    return { start, end, label: `Quarter ${quarter}, ${year}` };
  }
  if (filter.mode === "year") {
    const year = Number(filter.year);
    return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1), label: `Year ${year}` };
  }
  const [year, month] = filter.month.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  return { start, end: new Date(year, month, 1), label: `${monthName(start)} ${year}` };
}

export function inPeriod(dateValue, period) {
  const date = new Date(`${dateValue}T00:00:00`);
  return date >= period.start && date < period.end;
}

export function profitForPeriod(state, cgm, period) {
  const entries = cgm.ledgerEntries(state).filter((entry) => inPeriod(entry.date, period));
  return state.accounts.reduce((sum, account) => {
    const balance = entries.filter((entry) => entry.accountId === account.id).reduce((total, entry) => total + entry.debit - entry.credit, 0);
    if (account.type === "Income") return sum - balance;
    if (account.type === "Expenses" || account.type === "Cost of Sales") return sum - balance;
    return sum;
  }, 0);
}

export function balanceAt(state, cgm, typeName, endDate) {
  if (typeName === "debtors") {
    const invoices = state.invoices.filter((invoice) => cgm.isPostedInvoice(invoice) && new Date(`${invoice.date}T00:00:00`) < endDate).reduce((sum, invoice) => sum + cgm.documentTotal(invoice), 0);
    const payments = state.payments.filter((payment) => cgm.isActiveRecord(payment) && new Date(`${payment.date}T00:00:00`) < endDate).reduce((sum, payment) => sum + cgm.toNumber(payment.amount), 0);
    const opening = state.clients.filter(cgm.isActiveRecord).reduce((sum, client) => sum + cgm.toNumber(client.openingBalance), 0);
    return opening + invoices - payments;
  }
  const bills = state.supplierBills.filter((bill) => cgm.isActiveRecord(bill) && new Date(`${bill.date}T00:00:00`) < endDate).reduce((sum, bill) => sum + cgm.toNumber(bill.amount), 0);
  const payments = state.supplierPayments.filter((payment) => cgm.isActiveRecord(payment) && new Date(`${payment.date}T00:00:00`) < endDate).reduce((sum, payment) => sum + cgm.toNumber(payment.amount), 0);
  const opening = state.suppliers.filter(cgm.isActiveRecord).reduce((sum, supplier) => sum + cgm.toNumber(supplier.openingBalance), 0);
  return opening + bills - payments;
}

export function cashBalanceAt(state, cgm, endDate) {
  return cgm.ledgerEntries(state)
    .filter((entry) => cgm.isMoneyAccount(state, entry.accountId) && new Date(`${entry.date}T00:00:00`) < endDate)
    .reduce((sum, entry) => sum + entry.debit - entry.credit, 0);
}

export function monthlyTrends(state, cgm, anchorEnd) {
  const months = [];
  const anchor = new Date(anchorEnd);
  anchor.setDate(1);
  anchor.setMonth(anchor.getMonth() - 11);
  for (let i = 0; i < 12; i += 1) {
    const start = new Date(anchor.getFullYear(), anchor.getMonth() + i, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const period = { start, end };
    const invoiced = state.invoices.filter((invoice) => cgm.isPostedInvoice(invoice) && inPeriod(invoice.date, period)).reduce((sum, invoice) => sum + cgm.documentTotal(invoice), 0);
    const payments = state.payments.filter((payment) => cgm.isActiveRecord(payment) && inPeriod(payment.date, period)).reduce((sum, payment) => sum + cgm.toNumber(payment.amount), 0);
    const expenses = state.expenses.filter((expense) => cgm.isActiveRecord(expense) && inPeriod(expense.date, period)).reduce((sum, expense) => sum + cgm.toNumber(expense.amount), 0);
    const supplierPayments = state.supplierPayments.filter((payment) => cgm.isActiveRecord(payment) && inPeriod(payment.date, period)).reduce((sum, payment) => sum + cgm.toNumber(payment.amount), 0);
    months.push({
      label: `${start.toLocaleString(undefined, { month: "short" })} ${String(start.getFullYear()).slice(2)}`,
      key: start.toISOString().slice(0, 7),
      invoiced,
      payments,
      expenses: expenses + supplierPayments,
      netCash: payments - expenses - supplierPayments,
      profit: profitForPeriod(state, cgm, period),
      debtors: balanceAt(state, cgm, "debtors", end),
      creditors: balanceAt(state, cgm, "creditors", end),
      cashBalance: cashBalanceAt(state, cgm, end),
    });
  }
  return months;
}

export function businessHealth(model) {
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

export function dashboardAlerts(model, money) {
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

export function decisionRows(model, money) {
  const improving = model.periodPayments >= model.periodExpenses ? "Cash collection is covering current outflows." : "Cash collection is not yet covering current outflows.";
  const risky = model.overdueAmount > 0 ? `Overdue debtors total ${money.format(model.overdueAmount)}.` : "No overdue debtor pressure is visible.";
  const attention = model.creditorsDueAmount > 0 ? `Schedule creditor payments of ${money.format(model.creditorsDueAmount)}.` : "Keep supplier accounts current and monitor new bills.";
  const action = model.health.status === "Critical" || model.health.status === "Watch"
    ? "Prioritize collections, pause non-essential spending, and review supplier payment timing."
    : "Maintain collection discipline and use the positive cash position for planned project delivery.";
  return [["Improving", improving], ["Risky", risky], ["Needs attention", attention], ["Suggested management action", action]];
}

export function buildDashboardModel({ state, cgm, filter, money, monthName, financialYearLabel }) {
  const period = selectedPeriod(filter, cgm.today(), monthName);
  const periodInvoices = state.invoices.filter((invoice) => cgm.isPostedInvoice(invoice) && inPeriod(invoice.date, period));
  const periodPayments = state.payments.filter((payment) => cgm.isActiveRecord(payment) && inPeriod(payment.date, period));
  const periodExpenses = state.expenses.filter((expense) => cgm.isActiveRecord(expense) && inPeriod(expense.date, period));
  const periodSupplierPayments = state.supplierPayments.filter((payment) => cgm.isActiveRecord(payment) && inPeriod(payment.date, period));
  const periodInvoiced = periodInvoices.reduce((sum, invoice) => sum + cgm.documentTotal(invoice), 0);
  const periodPaymentsTotal = periodPayments.reduce((sum, payment) => sum + cgm.toNumber(payment.amount), 0);
  const periodExpensesTotal = periodExpenses.reduce((sum, expense) => sum + cgm.toNumber(expense.amount), 0) + periodSupplierPayments.reduce((sum, payment) => sum + cgm.toNumber(payment.amount), 0);
  const debtors = state.clients.reduce((sum, client) => sum + cgm.clientStatement(state, client.id).balance, 0);
  const creditors = state.suppliers.reduce((sum, supplier) => sum + cgm.supplierStatement(state, supplier.id).balance, 0);
  const unpaidInvoices = state.invoices.filter((invoice) => cgm.isPostedInvoice(invoice) && cgm.invoiceStatus(state, invoice) !== "paid");
  const overdueInvoices = unpaidInvoices.filter((invoice) => invoice.dueDate && invoice.dueDate < cgm.today());
  const creditorsDue = state.supplierBills.filter((bill) => cgm.isActiveRecord(bill) && cgm.billStatus(state, bill) !== "paid" && (bill.dueDate || bill.date) <= cgm.today());
  const model = {
    period,
    financialYear: financialYearLabel(period.start),
    periodInvoiced,
    periodPayments: periodPaymentsTotal,
    periodExpenses: periodExpensesTotal,
    periodNetCash: periodPaymentsTotal - periodExpensesTotal,
    debtors,
    creditors,
    netProfitLoss: profitForPeriod(state, cgm, period),
    bankCashBalance: cgm.cashAccountBalance(state),
    overdueCount: overdueInvoices.length,
    overdueAmount: overdueInvoices.reduce((sum, invoice) => sum + cgm.documentTotal(invoice) - cgm.invoicePaid(state, invoice.id), 0),
    unpaidAmount: unpaidInvoices.reduce((sum, invoice) => sum + cgm.documentTotal(invoice) - cgm.invoicePaid(state, invoice.id), 0),
    creditorsDueAmount: creditorsDue.reduce((sum, bill) => sum + cgm.toNumber(bill.amount) - cgm.supplierBillPaid(state, bill.id), 0),
    trends: monthlyTrends(state, cgm, period.end),
  };
  model.health = businessHealth(model);
  model.alerts = dashboardAlerts(model, money);
  model.decisionRows = decisionRows(model, money);
  return model;
}
