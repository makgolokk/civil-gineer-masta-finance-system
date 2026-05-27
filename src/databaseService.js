import { supabase } from "./supabaseClient.js";

const collectionTables = {
  clients: "clients",
  projects: "projects",
  quotations: "quotations",
  invoices: "invoices",
  payments: "payments",
  expenses: "expenses",
  supplierBills: "supplier_bills",
  users: "users",
};

const optionalCollectionTables = {
  suppliers: "suppliers",
  supplierPayments: "supplier_payments",
  journalEntries: "journal_entries",
  cashTransactions: "cash_transactions",
  auditLog: "audit_log",
};

const allCollectionTables = { ...collectionTables, ...optionalCollectionTables };

function camelFromRow(row) {
  return {
    ...(row.payload || {}),
    id: row.id,
    createdAt: row.created_at?.slice(0, 10) || row.payload?.createdAt,
    updatedAt: row.updated_at || row.payload?.updatedAt,
  };
}

function basePayload(record) {
  return { ...record, updatedAt: new Date().toISOString() };
}

function tablePayload(collection, record) {
  const payload = basePayload(record);
  const common = {
    id: record.id,
    status: record.status || "active",
    payload,
    updated_at: new Date().toISOString(),
  };

  if (collection === "clients") {
    return {
      ...common,
      code: record.code || "",
      name: record.name || "",
      email: record.email || "",
      phone: record.phone || "",
    };
  }

  if (collection === "users" || collection === "suppliers") {
    return {
      ...common,
      name: record.name || "",
      email: record.email || "",
      phone: record.phone || "",
    };
  }

  if (collection === "projects") {
    return {
      ...common,
      client_id: record.clientId || null,
      code: record.code || record.projectCode || "",
      name: record.name || record.projectName || "",
    };
  }

  if (collection === "quotations" || collection === "invoices") {
    const row = {
      ...common,
      client_id: record.clientId || null,
      project_id: record.projectId || null,
      number: record.number || "",
      document_date: record.date || null,
      amount: documentAmount(record),
    };
    if (collection === "invoices") {
      row.quotation_id = record.quotationId || null;
      row.due_date = record.dueDate || null;
    }
    return row;
  }

  if (collection === "payments") {
    return {
      ...common,
      invoice_id: record.invoiceId || null,
      client_id: record.clientId || null,
      project_id: record.projectId || null,
      receipt_number: record.receiptNumber || "",
      payment_date: record.date || null,
      amount: Number(record.amount || 0),
    };
  }

  if (collection === "expenses") {
    return {
      ...common,
      project_id: record.projectId || null,
      expense_date: record.date || null,
      category: record.category || "",
      vendor: record.vendor || "",
      amount: Number(record.amount || 0),
    };
  }

  if (collection === "supplierBills") {
    return {
      ...common,
      supplier_id: record.supplierId || null,
      project_id: record.projectId || null,
      number: record.number || "",
      bill_date: record.date || null,
      due_date: record.dueDate || null,
      amount: Number(record.amount || documentAmount(record)),
    };
  }

  return common;
}

function documentAmount(record) {
  const subtotal = (record.items || []).reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.rate || 0), 0);
  const discount = Number(record.discount || 0);
  const tax = record.taxAmount !== undefined ? Number(record.taxAmount || 0) : Math.max(0, subtotal - discount) * (Number(record.taxRate || 0) / 100);
  return Math.max(0, subtotal - discount + tax);
}

async function readTable(table) {
  const { data, error } = await supabase.from(table).select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function upsertCollection(collection, records) {
  const table = allCollectionTables[collection];
  if (!table) return;
  const rows = (records || []).filter((record) => record.id).map((record) => tablePayload(collection, record));

  if (rows.length) {
    const { error } = await supabase.from(table).upsert(rows, { onConflict: "id" });
    if (error) throw error;
  }
}

export const databaseService = {
  async list(collection) {
    const table = allCollectionTables[collection] || collectionTables[collection];
    if (!table) throw new Error(`Unknown collection: ${collection}`);
    return (await readTable(table)).map(camelFromRow);
  },

  async create(collection, record) {
    const table = allCollectionTables[collection] || collectionTables[collection];
    if (!table) throw new Error(`Unknown collection: ${collection}`);
    const row = tablePayload(collection, record);
    const { data, error } = await supabase.from(table).insert(row).select("*").single();
    if (error) throw error;
    return camelFromRow(data);
  },

  async update(collection, record) {
    const table = allCollectionTables[collection] || collectionTables[collection];
    if (!table) throw new Error(`Unknown collection: ${collection}`);
    const row = tablePayload(collection, record);
    const { data, error } = await supabase.from(table).update(row).eq("id", record.id).select("*").single();
    if (error) throw error;
    return camelFromRow(data);
  },

  async remove(collection, id) {
    const table = allCollectionTables[collection] || collectionTables[collection];
    if (!table) throw new Error(`Unknown collection: ${collection}`);
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw error;
  },

  async nextNumber(sequenceKey, prefix, periodKey = "") {
    const { data, error } = await supabase.rpc("next_app_number", {
      p_sequence_key: sequenceKey,
      p_prefix: prefix,
      p_period_key: periodKey,
    });
    if (error) throw error;
    return data;
  },

  async loadState(defaultState) {
    const next = { ...defaultState };
    await Promise.all(Object.entries(allCollectionTables).map(async ([collection, table]) => {
      const rows = await readTable(table);
      next[collection] = rows.map(camelFromRow);
    }));

    const { data: settingsRows, error: settingsError } = await supabase.from("company_settings").select("*").eq("id", "default").maybeSingle();
    if (settingsError) throw settingsError;
    if (settingsRows?.payload) {
      next.settings = settingsRows.payload.settings || settingsRows.payload;
      next.company = settingsRows.payload.company || next.company;
      next.counters = settingsRows.payload.counters || next.counters;
      next.currentUserId = settingsRows.payload.currentUserId || next.currentUserId;
    }

    return next;
  },

  async saveState(state) {
    await Promise.all(Object.keys(allCollectionTables).map((collection) => upsertCollection(collection, state[collection] || [])));
    const { error } = await supabase.from("company_settings").upsert({
      id: "default",
      company_name: state.company?.name || state.settings?.companyProfile?.name || "",
      payload: {
        company: state.company,
        settings: state.settings,
        counters: state.counters,
        currentUserId: state.currentUserId,
      },
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  },
};
